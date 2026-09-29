# How xai-soc Works — A Guide to the Codebase

This is a walkthrough of the whole system, written so you can read the code
alongside it and actually follow what's happening — not just a feature list.
Backend gets the most attention since that's where the actual detection
logic lives; the frontend section covers how the UI is wired to it.

---

## 1. The big picture

One sentence: network flow metadata goes in, a trained ML model classifies
it, SHAP explains *why*, and if it's an attack, a scored, prioritized alert
comes out the other end for an analyst to see on a dashboard.

```
Flow features (JSON)
       │
       ▼
┌──────────────────┐
│  PreprocessingModule │  scale features with the SAME scaler used at training time
└──────────────────┘
       │
       ▼
┌──────────────────┐
│   MLIDSModel      │  RandomForest — predicts one of 6 classes + confidence
└──────────────────┘
       │
       ▼
┌──────────────────┐
│  AttackClassifier │  NORMAL vs. attack, thresholded on confidence
└──────────────────┘
       │
   NORMAL? ──yes──► stop here, nothing is written to the database
       │no
       ▼
┌──────────────────┐
│ AttackTypeAnalyzer│  packages the verdict + raw features for the next steps
└──────────────────┘
       │
       ▼
┌──────────────────┐
│ ExplainableAIModule│ SHAP TreeExplainer — top features that drove *this* prediction
└──────────────────┘
       │
       ▼
┌──────────────────┐
│ SOCAlertGenerator │  attack type, severity, confidence, source/dest IP, timestamp
└──────────────────┘
       │
       ▼
┌──────────────────┐
│ RiskScoringModule │  risk score (0–1) + priority (P1–P4)
└──────────────────┘
       │
       ▼
   persist_alert()  →  written to the `alerts` / `attack_analysis` / `explanations` tables
       │
       ▼
   Dashboard / Alert queue / Alert detail (React) read it back via the API
```

All of this is orchestrated by one class: **`backend/pipeline.py` →
`SOCPipeline.process()`**. If you want to understand the whole detection
flow in one read, start there — it's 47 lines and every step above is one
method call in it.

---

## 2. Directory map

```
xai-soc/
├── backend/
│   ├── pipeline.py          ← orchestrates the flow above, one flow at a time
│   ├── ml/                  ← preprocessing, the model itself, classification
│   ├── xai/                 ← SHAP explanations, what-if / counterfactual
│   ├── alerts/               ← alert generation, risk scoring, MITRE playbooks
│   ├── db/                  ← SQLAlchemy models + session/engine setup
│   └── api/                 ← FastAPI routes, auth, request/response schemas
├── frontend/
│   └── src/
│       ├── pages/           ← one file per screen (Dashboard, AlertList, …)
│       ├── components/      ← shared UI (Layout, Timeline, Badges, …)
│       ├── api/client.js    ← every backend call the UI makes, in one file
│       └── lib/             ← formatting, keyboard shortcuts, saved views
└── ml_training/
    ├── train.py             ← trains the model, writes model.joblib
    └── synthetic_data.py    ← generates the placeholder training data
```

---

## 3. Backend, module by module

### `ml/features.py` — the contract everything else depends on

Two lists that every other module imports:

- `FEATURE_NAMES` — 81 flow-level statistics: the 77 features CICFlowMeter
  produces (the CIC-IDS2017 / CSE-CIC-IDS2018 feature set: durations, packet
  counts and lengths, inter-arrival times, TCP flags, header lengths,
  bulk/subflow stats, initial window sizes, active/idle times) plus 4 it
  lacks (unique destination ports, DNS query length/entropy/rate). Keys are
  the CIC column names normalized (`"Flow Bytes/s"` → `flow_bytes_s`), so a
  real CICFlowMeter CSV maps on without a rename table.
  Nothing here reads packet *payloads* — that's the point: this works on
  encrypted traffic (e.g. DNS-over-HTTPS) because it only looks at traffic
  shape, not content.
- `ATTACK_TYPES` — `NORMAL`, `DNS_TUNNELING`, `DOS_DDOS`, `PORT_SCAN`,
  `BRUTE_FORCE`, `BOTNET`.

If you ever swap in a real dataset, this file plus `synthetic_data.py` are
the only things that need to change — everything downstream just consumes
whatever columns are listed here.

### `ml/preprocess.py` — `PreprocessingModule`

Two different code paths that matter for different reasons:

- **`preprocess(df)`** — used once, at training time. Runs, in order:
  `clean()` (drop duplicates/NaNs/infs) → `extract_features()` (select the
  81 columns) → `fit_normalize()` (fit a `MinMaxScaler`) → `balance()`
  (SMOTE oversampling so rare classes aren't ignored).
- **`preprocess_features_only(feature_dict, scaler)`** — used on every
  live request. Takes one flow's raw feature dict and scales it with the
  **already-fitted training scaler**, never refits. This matters: fitting a
  fresh min/max on a single row is meaningless (a lone value is always the
  min *and* the max), and it would put live traffic on a totally different
  scale than what the model was trained on.

### `ml/model.py` — `MLIDSModel`

Thin wrapper around `sklearn.ensemble.RandomForestClassifier`
(`n_estimators=200, max_depth=12, class_weight="balanced", random_state=42`).
RandomForest was chosen specifically because SHAP's `TreeExplainer` gives
fast, exact (not approximated) attributions for tree ensembles — that's a
big part of why explanations are cheap enough to compute per-alert in real
time rather than as a batch job.

`save()`/`load_model()` persist the model **and its scaler together** in one
`joblib` file (`ml_training/model.joblib`) — they're a matched pair, so the
API always loads both at once (`main.py`'s `SOCPipeline(MODEL_PATH)` call).

Current trained model (`ml_training/model_metrics.json`): 99.9% accuracy,
0.999 macro-F1, trained on 3,840 synthetic flows / tested on 960. Numbers
this clean are expected on synthetic data generated from six cleanly
separated statistical profiles — see the caveat in §5.

### `ml/classifier.py` — `AttackClassifier`

One job: turn the model's raw prediction into `is_attack: bool`. A
prediction only counts as an attack if the label isn't `NORMAL` **and**
confidence clears a threshold (default `0.5`). This is the gate that
decides whether anything downstream (explanation, alert, persistence) runs
at all.

### `ml/attack_analyzer.py` — `AttackTypeAnalyzer`

Mostly a pass-through today — the model already predicts the specific
class directly (it's multi-class, not binary-then-subtype), so this just
packages `(attack_type, features, score)` for the explainer and alert
generator. It exists as its own class mainly to match the UML design (see
the PRD) and as a seam if attack-subtype logic ever gets added later.

### `xai/shap_explainer.py` — `ExplainableAIModule`

This is the "explainable" in the project name. For every attack alert:

1. Runs `shap.TreeExplainer(model).shap_values(row)` on the single flow.
2. Pulls out **only the attribution vector for the predicted class** — not
   an average across classes, not a shared explanation. This is why a
   DNS_TUNNELING alert's top features (`dns_query_length_mean`,
   `dns_queries_per_session`) look completely different from a PORT_SCAN
   alert's (`unique_dest_ports`, `syn_flag_count`) — verified live in
   `docs/PIPELINE_VERIFICATION.md`.
3. Sorts by `|SHAP value|`, keeps the top 10, and builds a one-line
   human-readable reason string from the top 3
   (`"Classified as PORT_SCAN: driven by unique_dest_ports (0.47), ..."`).

### `xai/whatif.py`

Two interactive tools exposed in the Alert Detail page:
- **What-if lab**: analyst edits a feature value, this re-runs the *real*
  model (not a mock) and returns the new verdict.
- **Counterfactual finder**: searches for the smallest feature edit that
  flips the verdict to `NORMAL` — answers "what would this flow have needed
  to look like to not be flagged?"

### `alerts/generator.py` — `SOCAlertGenerator`

Builds the `Alert` dataclass: `attack_type`, `severity` (bucketed from
confidence: ≥0.9 CRITICAL, ≥0.75 HIGH, ≥0.5 MEDIUM, else LOW), `confidence`,
`source_ip`/`dest_ip`, `description` (the SHAP reason string), `timestamp`.
Nothing here touches the database — it's a pure data object, persisted
later by `api/persist.py`.

### `alerts/risk_scoring.py` — `RiskScoringModule`

Weighted score, 0–1:

```
risk = 0.4 × confidence
     + 0.3 × severity_weight        (CRITICAL=1.0 … LOW=0.25)
     + 0.15 × asset_criticality     (per-dest_ip, defaults to 0.5)
     + 0.15 × frequency             (same source_ip+attack_type in last 5 min)
```

`frequency` is an in-memory rolling window (`collections.deque`) keyed by
`(source_ip, attack_type)` — the *first* time a given attacker/attack-type
pair is seen it contributes 0; by the 5th occurrence within 5 minutes it's
maxed at 1.0. This is a single-process, in-memory structure — restarting
the API resets it, and it won't share state across multiple workers if you
ever scale horizontally (noted in the code's own docstring).

`priority` is then bucketed from the risk score: ≥0.8 P1, ≥0.6 P2, ≥0.4 P3,
else P4.

> **Note on "correlation":** the architecture diagram shows alert grouping
> as part of this same step. In code it's actually split — this module only
> contributes the *frequency* term to an individual alert's score; the
> actual "cluster these into one campaign card" behavior is a separate
> read-time SQL query (`GET /api/alerts/grouped` in `routes_alerts.py`),
> not something that happens at write time. See
> `docs/PIPELINE_VERIFICATION.md` for the full breakdown.

### `alerts/playbooks.py`

Static, hand-written content (not model output) — MITRE ATT&CK technique
IDs and analyst response steps per attack type, plus a "here's what would
make this benign instead" checklist. Powers the Alert Detail page's
playbook panel.

### `db/models.py` — the schema

SQLAlchemy models, all using UUID string primary keys (`gen_id()`):

| Table | Purpose |
|---|---|
| `users` | login, role (`ADMIN`/`ANALYST`/`VIEWER`), `is_active` (deactivate, never hard-delete, to preserve audit history) |
| `alerts` | one row per detected attack — attack type, severity, risk/priority, case status/assignee |
| `attack_analysis` | the raw feature dict + score behind each alert (1:1 with `alerts`) |
| `explanations` | the SHAP reason + top features (1:1 with `attack_analysis`) |
| `feedback` | analyst true/false-positive verdicts — read for display (precision stats, reliability chart) but **nothing currently retrains the model from it** |
| `alert_events` | append-only audit trail: notes, status changes, assignments, verdicts. Read per-alert (`/api/alerts/{id}/events`, the case Timeline) and now also globally (`/api/logs`, added this session — see §6) |
| `ml_models` | registers whichever model artifact is currently loaded (version, metrics) |
| `threat_intelligence` | schema exists but nothing currently writes to it — a hook for future rule-based enrichment |

### `db/session.py`

`DATABASE_URL` env var controls Postgres vs. SQLite (`sqlite:///./xai_soc.db`
for local dev — that's what this repo is currently running on).
**Careful**: the fallback default if the env var isn't set is a Postgres URL,
not SQLite — if you ever run a script that doesn't call `load_dotenv()`
first, you'll get a confusing Postgres connection error instead of touching
your local SQLite file. `main.py` calls `load_dotenv()` before any other
import specifically to avoid this.

On startup, `init_db()` creates any missing tables, then runs a small
manual migration list (`_ADDED_COLUMNS`) that adds columns to an
already-existing dev database in place — there's no formal migration tool
(Alembic etc.) here, just this list.

### `api/` — the FastAPI layer

| File | What it owns |
|---|---|
| `main.py` | app setup, CORS, seeds the default admin (`admin@xai-soc.local` / `changeme` unless `ADMIN_PASSWORD` is set), builds the one shared `SOCPipeline` instance at startup (`app.state.pipeline`) |
| `security.py` | JWT issuing/verification, bcrypt password hashing, `get_current_user`, `require_role(*roles)` — the dependency every protected route uses |
| `routes_auth.py` | `POST /api/auth/login`, `GET /api/auth/me` |
| `routes_alerts.py` | the biggest file — alert list/detail/grouped, case workflow (status/assignee/notes), feedback, what-if/counterfactual, `POST /api/ingest`, and (new) `GET /api/logs` |
| `routes_sim.py` | Threat Simulator — fires synthetic flows through the **real** pipeline (not a mock), demo-history seeding, stealth sweep |
| `routes_insights.py` | dashboard aggregates — KPIs, threat volume time series, heatmap, reliability chart data |
| `routes_users.py` | admin user management |
| `routes_system.py` | `/api/system/security` — surfaces deployment footguns (open ingest endpoint, default admin password still in use, placeholder JWT secret) to the admin UI |
| `persist.py` | the one function (`persist_alert`) that writes an `Alert` object to all three tables (`alerts`, `attack_analysis`, `explanations`) consistently — used by both `/api/ingest` and the simulator so alerts are always stored the same way regardless of origin |
| `schemas.py` | every Pydantic request/response model |

**Auth model**: `POST /api/auth/login` returns a JWT (8h expiry, `HS256`,
signed with `JWT_SECRET`). Every protected route depends on
`get_current_user` (validates the token, loads the user) and routes that
need a specific role add `Depends(require_role("ADMIN"))` etc. on top.
`JWT_SECRET` defaults to a random per-process key if unset (sessions reset
on restart but nothing is forgeable); if it *is* set to one of the
well-known placeholder values shipped in the repo/README, `security.py`
flags it and `/api/system/security` surfaces the warning to admins.

**The one entry point that isn't behind login**: `POST /api/ingest` — meant
for a traffic collector service, not a logged-in analyst. Optionally gated
by an `X-API-Key` header if `INGEST_API_KEY` is set in `.env`; wide open
otherwise (fine for local dev, not for anything exposed).

---

## 4. A request's full lifecycle (concrete example)

Say a collector posts a DNS-tunneling-shaped flow to `/api/ingest`:

1. `routes_alerts.ingest()` receives it, calls
   `request.app.state.pipeline.process(features, source_ip, dest_ip)`.
2. Inside `SOCPipeline.process()`: preprocess → scale with the trained
   scaler → `model.predict()` → RandomForest says `DNS_TUNNELING`, 0.98
   confidence.
3. `AttackClassifier` confirms it's an attack (label ≠ NORMAL, confidence ≥
   threshold).
4. `ExplainableAIModule.explain()` runs SHAP on this one row, finds
   `dns_query_length_mean` and `dns_queries_per_session` are the biggest
   contributors, builds the reason string.
5. `SOCAlertGenerator.generate()` builds an `Alert`: severity CRITICAL
   (confidence ≥ 0.9), description = the SHAP reason.
6. `RiskScoringModule.calculate()` scores it (~0.77 for a first occurrence)
   and assigns P2.
7. Back in the route: `persist_alert()` writes three rows (`alerts`,
   `attack_analysis`, `explanations`), commits.
8. The frontend's Dashboard/Alert queue poll `GET /api/alerts` every 12s
   and pick it up — no websocket, just polling (per the PRD, polling is
   enough for this scale).
9. Analyst opens the alert in `AlertDetail.jsx`, sees the SHAP bars, MITRE
   techniques, and playbook steps; confirms or dismisses it — that verdict
   goes into `feedback` and an `alert_events` row (`kind="VERDICT"`).

If the flow had come back `NORMAL` instead, step 2 would return `None` and
nothing after step 3 would run — no DB write at all.

---

## 5. Honest caveats (things the docs themselves flag)

- **Training data is synthetic** (`ml_training/synthetic_data.py`), not a
  real captured dataset. The 99.9% accuracy reflects six statistically
  distinct generated profiles, not real-world traffic difficulty. The UI
  discloses this permanently (the "Synthetic data" badge in the top bar).
- **No live packet capture** — the pipeline only ever sees a feature dict
  someone else already extracted (via `/api/ingest`). Turning raw
  pcap/flow capture into that dict is explicitly out of scope here.
- **No automated retraining** — `feedback` is collected and displayed but
  nothing currently re-fits the model from it. That would be a separate job
  reading that table and re-running `ml_training/train.py`.
- **Risk-scoring frequency state is in-memory, per-process** — fine for one
  dev server, would need to move to Redis/DB to survive restarts or scale
  to multiple workers (this is called out directly in
  `risk_scoring.py`'s docstring).

---

## 6. What I added this session

For context on top of the architecture above — `GET /api/logs`
(`routes_alerts.py`), an ADMIN-only global view over the `alert_events`
table (filterable by user/alert/date range), plus a matching `/logs` page
in the frontend. Full detail on why and how it was verified is in
`docs/PIPELINE_VERIFICATION.md` and `docs/FEATURE_AUDIT.md` — nothing in
this file's architecture description above was changed by that work.

---

## 7. Frontend, briefly

- **`api/client.js`** — every backend call in one place, thin `fetch`
  wrappers. If you want to know what a page does, read what it calls here
  first.
- **`api/auth.jsx`** — holds the JWT (in `localStorage`), exposes
  `useAuth()` for the current user/role.
- **`App.jsx`** — routes, each wrapped in `RequireAuth` (redirects to
  `/login` if no token, redirects to `/dashboard` if the route needs a role
  the user doesn't have — e.g. `/users` and `/logs` require ADMIN).
- **`components/Layout.jsx`** — the persistent shell (top nav, command
  palette, notifications, theme toggle) every page renders inside.
- **`stream/AlertStream.jsx`** — the 12-second polling loop that drives
  live notification toasts and the unseen-alert badge.
- **Pages map roughly 1:1 to backend route groups**: `Dashboard.jsx` ↔
  `routes_insights.py`, `AlertList.jsx`/`AlertDetail.jsx` ↔
  `routes_alerts.py`, `Simulator.jsx` ↔ `routes_sim.py`, `ModelLab.jsx` ↔
  the model-info endpoints, `Users.jsx`/`Logs.jsx` ↔ `routes_users.py`/the
  new `/api/logs` route.

---

## 8. Running it yourself

```bash
# backend
cd backend && source .venv/Scripts/activate   # Windows: .venv\Scripts\activate
uvicorn api.main:app --port 8000              # add --reload for dev, but verify it actually
                                               # picked up changes — see the note below

# frontend
cd frontend && npm run dev                    # http://localhost:5173
```

Default login: `admin@xai-soc.local` / `changeme`.

**A gotcha from this session, worth knowing**: `uvicorn --reload` on this
Windows setup sometimes logs "Reloading..." without actually serving the
new code (confirmed by directly importing the module vs. hitting the live
API and seeing different route sets). If a backend change doesn't seem to
take effect, don't assume it's a code bug — check `/openapi.json` for the
route you expect, or just restart the process cleanly.

# Explainable AI for SOC Alert Triage and Risk Management

Full PRD, architecture, data model, and API spec: see `docs/PRD.md` and the
project docs in the parent folder.

The system watches flow-level metadata of encrypted traffic, classifies each
flow as normal or one of five attacks (DNS tunneling, DoS/DDoS, port scan,
brute force, botnet), **explains every verdict with SHAP**, scores risk, and
gives analysts a ranked queue with the reasoning attached.

**Features:** the model uses the 77 flow features CICFlowMeter produces (the
feature set of CIC-IDS2017 / CSE-CIC-IDS2018: flow duration, packet counts and
lengths, inter-arrival times, TCP flags, header lengths, bulk/subflow stats,
initial window sizes, active/idle times) plus 4 DNS/port features CICFlowMeter
lacks (unique destination ports, DNS query length, entropy and rate). The list
lives in `backend/ml/features.py`.

> **Training data is synthetic** (`ml_training/synthetic_data.py`) until a real
> dataset (CIC-IDS / CIRA-CIC-DoHBrw) is wired in. The UI says so wherever it
> matters. Near-perfect test scores show the pipeline works, not that real
> traffic will be this easy.

## What is in the console

| Page | What it does |
| --- | --- |
| **Dashboard** | KPI row with week-over-week deltas, attack leaders, threat-volume chart (hover or arrow keys), recent alerts with a per-row SHAP profile, threat-pressure index, top sources and targeted assets, risk calendar, analyst activity |
| **Alert queue** | Risk-ranked queue, Open/All/Closed scope, filters, saved views, campaign (grouped) view, bulk confirm / dismiss / assign, keyboard triage (`j` `k` `Enter` `x` `/`) |
| **Alert detail** | SHAP driver bars, **what-if lab** (edit a measurement, the real model re-decides), **counterfactual finder** (smallest edit that makes it "normal"), MITRE ATT&CK techniques and response playbook, case status and assignee, audit timeline with notes |
| **Threat Simulator** | Fires generated flows through the real pipeline (classification, SHAP, risk, alert). Intensity slider makes attacks stealthier; **Stealth sweep** plots detection and confidence against intensity without creating alerts. Admins can seed 30 days of demo history |
| **Model Observatory** | Test metrics, global feature importance, mean SHAP across stored explanations (per attack class), per-class precision/recall, a **reliability chart** comparing model confidence with analyst verdicts, glossary of all 81 features |
| **Reports** | Auto-written weekly brief, distributions, top sources/targets, CSV export, print-friendly layout |
| **Users** | Admin-only account management (users with history are deactivated, not deleted) |

Also: command palette (`Ctrl/Cmd + K`), notification centre, light and dark
themes, live polling every 12 s.

Roles: **ADMIN** (everything, plus users and demo data), **ANALYST** (triage,
verdicts, simulations), **VIEWER** (read-only, can still use the what-if lab).

## Quickest path: run it locally (no Docker)

### 1. Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt

# zero-setup DB for local dev (skips Postgres):
cp .env.example .env             # then set DATABASE_URL=sqlite:///./xai_soc.db
```

Train the model once (writes `ml_training/model.joblib`):

```bash
cd ../ml_training
python train.py
```

Start the API (from `backend/`):

```bash
uvicorn api.main:app --reload
```

`http://localhost:8000/docs` has the interactive API docs. A default admin is
seeded on first run: `admin@xai-soc.local` / `changeme`. **Change that
password before exposing the app anywhere.** Existing dev databases are
upgraded in place on startup (new columns are added idempotently).

Tests: `pytest tests/ -v` (39 tests: pipeline, risk scoring, API, RBAC, case
workflow, what-if, counterfactual, simulator, insights).

### 2. Frontend

```bash
cd frontend
npm install
cp .env.example .env   # points at http://localhost:8000
npm run dev
```

Open `http://localhost:5173`. Fastest demo: sign in as admin, open
**Simulator**, press **Load / replace** under Demo history, then **Launch** an
attack and click **Explain** on a resulting alert.

### Feed it traffic yourself

```bash
curl -X POST http://localhost:8000/api/ingest \
  -H "Content-Type: application/json" \
  -d '{"features": {"Flow Duration": 1936852, "Total Fwd Packets": 113, "Total Backward Packets": 5.36, "Total Length of Fwd Packets": 5822, "Flow Bytes/s": 4998, "Flow Packets/s": 61.29, "Fwd Packets/s": 58.52, "Fwd IAT Mean": 16894, "Fwd IAT Std": 5363, "Fwd IAT Max": 32985, "Flow IAT Std": 5224, "SYN Flag Count": 5.64, "ACK Flag Count": 2.69, "Down/Up Ratio": 0.05, "Init_Win_bytes_forward": 927, "Packet Length Variance": 2887, "Idle Mean": 200358}, "source_ip": "10.0.0.5", "dest_ip": "10.0.0.1"}'
```

That is a DoS flow. Feature names can be CICFlowMeter column names (as above)
or the internal keys (`flow_bytes_s`, `fwd_iat_mean`, ...). Features you leave
out are filled with a typical normal flow's values. Values are raw (not
pre-scaled; durations and IATs in microseconds, like CICFlowMeter); the API
applies the trained scaler.

## Security notes

- `/api/ingest` is meant for a collector service. Set `INGEST_API_KEY` in
  `backend/.env` to require an `X-API-Key` header; unset keeps open local-dev
  behaviour. Put it behind a private network or mTLS before exposing it.
- Set a long random `JWT_SECRET` (the default is for local development only).
- `CORS_ORIGINS` (comma separated) controls which browser origins may call the
  API; it defaults to the Vite dev server.
- Removing a user who has recorded verdicts deactivates the account (their
  token stops working immediately) instead of deleting the audit trail.
- The Threat Simulator only uses documentation address ranges (RFC 5737) for
  "attackers", so a demo can never point at a real host.

## Or: Docker Compose

```bash
cd ml_training && python train.py   # produces model.joblib the compose file mounts in
cd ..
docker compose up --build
```

Backend on `:8000`, frontend on `:5173`, Postgres on `:5432`.

## Where to go next

1. **Pick the real dataset** (PRD sec. 3) and replace `build_dataset()` in
   `ml_training/synthetic_data.py` with a real CSV loader. CICFlowMeter
   column names map onto `backend/ml/features.py` automatically
   (`normalize_feature_names`); only the 4 DNS/port features need a source. The simulator's flow profiles live in
   `backend/ml/profiles.py`; re-derive them from the real data.
2. Re-run `ml_training/train.py` and check the report. Everything downstream
   (SHAP, alerts, risk, API, dashboard, Model Observatory) works against the
   same schema.
3. Use analyst verdicts (`feedback` table) as retraining labels; the
   Observatory's reliability chart tells you when confidence needs recalibrating.
4. See `docs/` for the phased build order (PRD sec. 15).

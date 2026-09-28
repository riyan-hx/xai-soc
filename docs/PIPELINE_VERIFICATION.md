# Pipeline Verification: Architecture Diagram vs. Code

Node-by-node check of the SOC pipeline diagram against `backend/pipeline.py`
and the modules it orchestrates, plus an end-to-end acceptance test. Done
2026-09-25.

## Diagram nodes vs. code

| # | Diagram node | Code | Verified |
|---|---|---|---|
| 1 | Network Traffic (input) | `POST /api/ingest` payload (`backend/api/routes_alerts.py:ingest`) | ✅ |
| 2a | Data Cleaning | `PreprocessingModule.clean` (`backend/ml/preprocess.py`) | ✅ training path |
| 2b | Feature Selection/Extraction | `PreprocessingModule.extract_features` | ✅ |
| 2c | Normalization | `PreprocessingModule.fit_normalize` (MinMaxScaler) | ✅ |
| 2d | Balanced Dataset | `PreprocessingModule.balance` (SMOTE) | ✅ |
| 3 | Multi-Attack IDS Model | `MLIDSModel` (RandomForest) (`backend/ml/model.py`) | ✅ |
| 4 | Attack Classification | `AttackClassifier.classify` (`backend/ml/classifier.py`) | ✅ |
| 5a | Normal → No Alert | `SOCPipeline.process` returns `None`; caller writes nothing | ✅ confirmed no DB row (see below) |
| 5b | Attack → 5 types | `db.models.AttackType` enum: DNS_TUNNELING, DOS_DDOS, PORT_SCAN, BRUTE_FORCE, BOTNET | ✅ |
| 6 | Attack-Specific XAI | `ExplainableAIModule.explain` (`backend/xai/shap_explainer.py`) — SHAP values taken from the *predicted class's* attribution vector, not a shared/generic one | ✅ genuinely per-class, see acceptance test |
| 7 | SOC Alert Generation | `SOCAlertGenerator.generate` (`backend/alerts/generator.py`) — attack type, severity, confidence, source/dest, timestamp | ✅ |
| 8 | Correlation + Risk Scoring | `RiskScoringModule.calculate` + `GET /api/alerts/grouped` | ⚠️ see note below |
| 9 | SOC Dashboard | `frontend/src/pages/Dashboard.jsx`, `AlertList.jsx` (campaign view) | ✅ |

`backend/pipeline.py`'s `SOCPipeline.process` runs steps 2–8 in exactly this
order for a single flow (preprocess → predict → classify → analyze → explain
→ generate alert → score), confirmed by direct code read — no reordering or
skipped stages.

### Note on step 8: "Group Similar Alerts"

The diagram bundles alert grouping into the same step as risk scoring.
In code, these are split:

- **Risk scoring** (`RiskScoringModule`) includes a *frequency* term — how
  many alerts from the same `(source_ip, attack_type)` fired in the last 5
  minutes — which feeds into each alert's individual risk score. This runs
  at write time, per alert.
- **Grouping** ("cluster alerts from one attacker into one card") is a
  separate read-time SQL `GROUP BY (source_ip, dest_ip, attack_type)` in
  `GET /api/alerts/grouped`, used by the frontend's campaign view. It doesn't
  merge alerts in the database or in the pipeline itself — each alert is
  still stored individually.

Net effect for a user is the same (a burst reads as one correlated,
risk-scored, prioritized campaign on the dashboard), but architecturally
"grouping" isn't literally inside `RiskScoringModule` the way the diagram's
box implies. Not a functional gap — just noting the diagram simplifies two
components into one box.

### Note on step 5: no orphan rows for normal traffic

Confirmed by reading `ingest`, `routes_sim.py`'s single-flow simulate, and
`backfill` (demo seeding) — all three call `pipeline.process(...)` and only
call `persist_alert(...)` `if alert is not None`. No code path writes an
`Alert` row when the pipeline returns `None`.

## Acceptance test (2026-09-25)

One synthetic flow per class, generated with `ml.profiles.sample_flow_dict`
(seeded RNG), pushed through the live `POST /api/ingest`:

| Sent as | Predicted | Confidence | Severity | Risk / Priority | Top SHAP drivers |
|---|---|---|---|---|---|
| NORMAL | *(no alert)* | — | — | — | — |
| DNS_TUNNELING | DNS_TUNNELING | 0.980 | CRITICAL | 0.767 / P2 | `dns_query_length_mean`, `dns_queries_per_session`, `unique_dest_ports` |
| DOS_DDOS | DOS_DDOS | 1.000 | CRITICAL | 0.775 / P2 | `flow_packets_per_sec`, `total_fwd_bytes`, `fwd_iat_mean` |
| PORT_SCAN | PORT_SCAN | 1.000 | CRITICAL | 0.775 / P2 | `unique_dest_ports`, `syn_flag_count`, `total_fwd_bytes` |
| BRUTE_FORCE | BRUTE_FORCE | 1.000 | CRITICAL | 0.775 / P2 | `ack_flag_count`, `total_fwd_packets`, `dns_queries_per_session` |
| BOTNET | BOTNET | 0.994 | CRITICAL | 0.773 / P2 | `dns_queries_per_session`, `dns_query_length_mean`, `flow_duration` |

Each attack type's top SHAP drivers are genuinely different features —
confirms step 6 is real per-class explanation, not a shared template.

Verified after ingest, querying `GET /api/alerts?source_ip=203.0.113.50`
returned **exactly 5** rows (not 6) — the NORMAL flow produced no alert and
no orphan row, and all 5 attack alerts carry attack type, severity,
confidence, source/dest IP, timestamp, risk score and priority, and are
visible through the same alert list the dashboard's "recent alerts" widget
and the risk-ranked queue read from.

## Scope confirmation (intentionally not implemented)

Checked for dead code or UI implying these exist — none found:

- **Live packet capture**: `PreprocessingModule`'s docstring explicitly
  notes raw-packet parsing is out of scope; only `/api/ingest`'s
  feature-dict payload path exists.
- **Real dataset**: `ml_training/synthetic_data.py` is the only data source;
  `SystemStatus` in `Layout.jsx` shows a permanent "Synthetic data" banner —
  the UI already discloses this rather than implying otherwise.
- **Automated retraining**: the `Feedback` table is read in several places
  (reliability chart, precision stats, Reports), but only for *display* —
  grep confirms no code path re-fits or re-trains the model from it, no
  scheduled job exists, and no UI implies retraining happens automatically.

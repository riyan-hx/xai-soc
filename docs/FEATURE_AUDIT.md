# Feature Audit: Documentation vs. Implementation

Cross-check of every feature described in `README.md`, `DESIGN.md`, `PRODUCT.md`,
`docs/PRD.md`, and the two parent-folder briefs (`Explainable AI SOC — Explained
Simply.md`, `Explainable AI SOC – PRD & Architecture.md`) against the actual
backend (`backend/`) and frontend (`frontend/src/`) code.

**Result: 35 of ~38 documented features are fully implemented** (updated
2026-09-25 after closing the `/api/logs` gap below and verifying the full
pipeline against the architecture diagram — see `PIPELINE_VERIFICATION.md`).

## ✅ Implemented

### Dashboard
- KPI row with week-over-week deltas, attack leaders, threat-volume chart,
  per-row SHAP profiles, risk calendar, analyst activity —
  `frontend/src/pages/Dashboard.jsx`, `backend/api/routes_insights.py`

### Alert queue
- Risk-ranked list, Open/All/Closed scope, filters, saved views —
  `frontend/src/lib/savedViews.js`
- Campaign / grouped view — `backend/api/routes_alerts.py` (`/alerts/grouped`)
- Bulk confirm / dismiss / assign
- Keyboard triage (`j` `k` `Enter` `x` `/`) — `frontend/src/lib/keyboard.js`

### Alert detail
- SHAP driver bars, what-if lab, counterfactual finder —
  `backend/xai/whatif.py`
- MITRE ATT&CK mapping + response playbook — `backend/alerts/playbooks.py`
- Case status / assignee, audit timeline with notes — `AlertEvent` model

### Threat Simulator
- Real-pipeline flow firing, intensity/stealth control, stealth sweep,
  30-day demo history seeding, RFC 5737-sandboxed attacker IPs —
  `backend/api/routes_sim.py`

### Model Observatory
- Test metrics, global feature importance, per-class SHAP/precision/recall,
  reliability chart, 17-feature glossary — `frontend/src/pages/ModelLab.jsx`

### Reports
- Weekly brief, distributions, top sources/targets, CSV export, print layout

### Users
- Admin CRUD, deactivate-not-delete (preserves audit trail on users with
  recorded verdicts)

### Admin audit log
- `GET /api/logs` — global, ADMIN-only, filterable by `user_id` / `alert_id` /
  `date_from` / `date_to`, paginated — `backend/api/routes_alerts.py`
  (`list_logs`), UI at `frontend/src/pages/Logs.jsx` (`/logs`, Users-page
  pattern reused)

### Cross-cutting
- Command palette (`Ctrl/Cmd+K`), notification centre, light/dark theme,
  12s live polling
- RBAC (ADMIN / ANALYST / VIEWER) enforced server-side
- bcrypt password hashing, JWT with 8h expiry
- Reduced-motion support

### ML pipeline
- RandomForest, `class_weight="balanced"`, fixed seed (42), stratified split,
  macro-F1 reporting
- SHAP TreeExplainer
- 6 classes × 17 features — matches PRD §8–9 exactly

## ⚠️ Not implemented — but flagged in docs as intentional future work, not gaps

| Item | Doc reference |
|---|---|
| Live packet capture | PRD §3 explicitly scopes this out (batch/API ingest only) |
| Real dataset (CIC-IDS / CIRA-CIC-DoHBrw) | README + PRD both flag synthetic data as the known placeholder |
| Automated retraining loop | `feedback` table collects analyst verdicts, but nothing auto-retrains on them; docs label this a stretch goal |

## Resolved since the first pass

**`GET /api/logs`** — was listed in PRD §12's API table as an admin audit-log
endpoint with no matching route. Implemented 2026-09-25: see the Admin audit
log entry above. The PRD & Architecture doc's API table has been annotated
accordingly.

## Documentation note

`xai-soc/docs/PRD.md` in this repo is actually a copy of *"Explainable AI SOC
— Explained Simply"* (plain-language overview, no API table). The technical
PRD with the §12 API table referenced above only exists as
`Explainable AI SOC – PRD & Architecture.md` in the parent folder, outside
this project directory. Worth reconciling — either copy the real PRD into
`docs/`, or rename `docs/PRD.md` to something like `docs/OVERVIEW.md` so the
filename doesn't imply it's the technical spec.

---
*Generated 2026-09-25 by cross-referencing project docs against the codebase;
updated the same day after implementing `/api/logs` and verifying the
pipeline architecture (see `PIPELINE_VERIFICATION.md`).*

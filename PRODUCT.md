# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary: a SOC analyst (or a small team's single security engineer) triaging network-threat alerts through a working shift, deciding for each alert whether it is a real attack, how urgent it is, and what to do next. Secondary: an ADMIN who manages accounts and the model, and a VIEWER (manager) who reads dashboards and reports. For this build the immediate audience is also a college project evaluation panel that will judge how clearly the "explainable" part of the system is demonstrated.

## Product Purpose

Explainable AI for SOC alert triage and risk management. It watches flow-level metadata of encrypted traffic (DoH-era DNS, no payload inspection), classifies each flow as normal or one of five attacks (DNS tunneling, DoS/DDoS, port scan, brute force, botnet), explains every verdict with SHAP feature attributions, turns it into an alert, scores risk (confidence, severity, asset criticality, repeat frequency) and ranks the queue so analysts see the most dangerous, best-explained alerts first. Success: an analyst can act on an alert without trusting a black box, and an evaluator can see the full chain (model, explanation, alert, risk score, analyst verdict) working end to end.

## Positioning

Most alert triage tools rank alerts; this one shows why the model believes each one, lets the analyst interrogate that belief (what-if feature edits, per-feature SHAP), and measures whether the model deserves trust by comparing its confidence with analyst verdicts. A neighboring tool that only scores alerts cannot truthfully claim per-alert reasoning or measured calibration.

## Operating Context

Analysts work a prioritized queue, keyboard-first (j/k, c/f, /), with live-polled alerts (12 s). Traffic is currently synthetic (`ml_training/synthetic_data.py`) standing in for a real dataset (CIC-IDS2017/2018 + CIRA-CIC-DoHBrw-2020, PRD sec. 3/8). Local run: FastAPI + SQLite (or Postgres via Docker), React/Vite on :5173, API on :8000. Seeded admin `admin@xai-soc.local`. Roles: ADMIN, ANALYST (submits verdicts), VIEWER (read-only).

## Capabilities and Constraints

Existing: JWT auth with three roles; alert list (filters, saved views, grouped correlation clusters, pagination); alert detail with SHAP top-features chart and analyst feedback (confirm / false positive); dashboard stats, heatmap, recent triage feed; CSV export; user admin; live alert polling with toasts; keyboard shortcuts.
Confirmed additions for this build (user chose "Full vision"): Threat Simulator (live attack replay plus demo-history seeding), What-if counterfactual explainer, case workflow (status, assignee, notes/audit timeline), MITRE ATT&CK mapping and response playbooks per attack type, Model Observatory (global feature importance, per-class metrics, trust calibration from analyst feedback), command palette, notification center, security-posture index, optional ingest API key.
Constraints: the model artifact and feature schema (`backend/ml/features.py`, 17 features, 6 classes) stay as they are; training data is synthetic and every surface that shows model quality must say so; `/api/ingest` is unauthenticated by design today (to be gated by an optional key); SQLite in dev means schema changes need an idempotent migration.

## Brand Commitments

Product name stays "SOC Console" with the subtitle "Explainable AI Triage". The user pinned the Dribbble dashboard at https://cdn.dribbble.com/userupload/48963201/file/fc637b11bb05196e9be644c833614bf9.png as the exact visual reference, with a light default theme plus a working dark mode toggle. No content, copy, or imagery of that reference is reproduced.

## Evidence on Hand

Real: the trained RandomForest artifact and its metrics sidecar (`ml_training/model_metrics.json`, accuracy 99.9% on a synthetic hold-out), the PRD and plain-language explainer, a working test suite (`backend/tests`). Absent and never to be fabricated: real-world dataset results, customer or deployment claims, benchmark comparisons against other products. Demonstration alerts produced by the simulator or seeded history must be labeled as synthetic wherever a viewer could mistake them for live network data.

## Product Principles

1. Explanation is the product: every number that ranks or labels an alert can be traced to a reason the analyst can read.
2. The analyst decides, the model advises: verdict, status, and assignment are one action away from any alert and are recorded.
3. Honest about uncertainty and provenance: synthetic data, model confidence, and measured analyst agreement are shown, not hidden.
4. Keyboard-first and fast to scan: dense, calm, consistent.
5. Every claim demonstrable in two minutes: the whole chain runs from a single simulated attack to a resolved case.

## Accessibility & Inclusion

WCAG AA contrast in both themes, full keyboard operation of the triage flow, visible focus, reduced-motion respected, severity never conveyed by color alone (label or icon accompanies it).

---
version: 1
slug: "frontend-src-pages-dashboard-jsx"
primary_target: "frontend/src/pages/Dashboard.jsx"
related_targets: ["frontend/src/App.jsx"]
---

# Surface brief: SOC Console (whole authenticated app)

Mode: Operate (Read for the report page). Visitors are analysts mid-task; an evaluation panel watches the explain chain.
Audience/job: triage alerts, understand why the model flagged them, act, and see whether the model deserves trust.
Pinned world: the user's Dribbble reference (light dashboard, top navigation, orange accent, mono numerals, rounded white cards, pill segmented controls, right rail). Light default, working dark theme from the same tokens. Build path: code-led (no image generation available).
Unresolved: real dataset swap; product wordmark stays "SOC Console".

## Direction contract

THESIS: A calm, light, top-navigated instrument panel where every number is one click from its explanation. Refuses the dark neon "cyber" SOC cliche and the sidebar plus crimson admin template the app shipped with.
OWN-WORLD: Neutral light ground (#f7f7f7 app, #fff cards, hairline #ececee borders, 14px card radius, almost no shadow), single accent orange #ff7646 for primary actions, active state, chart line and brand mark, Geist for UI and Geist Mono for every figure, pill segmented controls, tinted labeled severity pills (never color alone), hatched crosshair band on charts, dark theme derived from the same tokens.
STORY: The analyst reads posture, sees what is rising, opens an alert, understands why (SHAP bars, what-if edits, ATT&CK mapping), acts (verdict, status, assignee, notes) and finally checks model trust; an evaluator can fire a simulated attack and watch it traverse the whole chain.
FIRST VIEWPORT: Top bar (logo, Dashboard/Alerts/Simulator/Model/Reports/Users, command search with the K chip, theme toggle, bell, API status, user menu). Left nine columns: four KPI cards with week-over-week deltas, then Attack Leaders beside Threat Volume (range pills, crosshair tooltip), then the alerts table with search, range pills and sparkline trend column. Right rail: Security Posture (big index, refresh, four action buttons, primary = simulate attack), Top Threat Sources, Most Targeted Assets.
FORM: pinned by the user's reference image; no concept roll (brief-pinned direction). Seed key: none.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

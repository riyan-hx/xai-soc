---
name: SOC Console
description: A calm, light, top-navigated instrument panel for explainable-AI alert triage, where every number is one click from its explanation.
colors:
  ember: "#ff7646"
  ember-soft: "#fff0ea"
  ember-ink: "#b93c0a"
  ink: "#18181c"
  ink-secondary: "#4f5158"
  ink-tertiary: "#6b6e76"
  ground: "#f6f6f7"
  surface: "#ffffff"
  surface-sunken: "#f6f7f9"
  hairline: "#ececef"
  hairline-strong: "#dcdee3"
  positive: "#0e7a53"
  negative: "#b42328"
  severity-critical: "#e5484d"
  severity-high: "#f08a1c"
  severity-medium: "#d4a20a"
  severity-low: "#3b82f6"
  atk-dns: "#7a5af8"
  atk-dos: "#d92d20"
  atk-scan: "#0e9384"
  atk-brute: "#b54708"
  atk-botnet: "#1570ef"
typography:
  display:
    fontFamily: "Geist Variable, Geist, -apple-system, Segoe UI, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Geist Variable, Geist, -apple-system, Segoe UI, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Geist Variable, Geist, -apple-system, Segoe UI, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "Geist Variable, Geist, -apple-system, Segoe UI, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.4
  figure:
    fontFamily: "Geist Mono Variable, Geist Mono, ui-monospace, Menlo, Consolas, monospace"
    fontSize: "28px"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "-0.02em"
rounded:
  sm: "8px"
  md: "10px"
  card: "14px"
  pill: "999px"
spacing:
  gap: "20px"
  card-pad: "20px"
  gutter: "28px"
  control-height: "40px"
components:
  button-primary:
    backgroundColor: "{colors.ember}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "40px"
  button-secondary:
    backgroundColor: "{colors.hairline}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "40px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "20px"
  kpi-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.figure}"
    rounded: "{rounded.card}"
    padding: "16px 18px"
  segmented-track:
    backgroundColor: "{colors.surface-sunken}"
    textColor: "{colors.ink-tertiary}"
    rounded: "{rounded.md}"
    padding: "3px"
  severity-pill:
    backgroundColor: "{colors.ember-soft}"
    textColor: "{colors.ember-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    height: "22px"
---

# Design System: SOC Console

## Overview

**Creative North Star: "The Instrument Panel"**

A security console is used mid-task, for hours, by someone deciding whether to trust a machine. The system therefore behaves like a well-made instrument: a quiet neutral ground, white cards with hairline edges, one warm accent spent on action and on the data line, and figures set in a monospaced face so columns of numbers align and read as measurements. It is modelled on the pinned reference dashboard (top navigation, ticker cards, a shaded-bar leaderboard, a line chart with a hatched crosshair band and dark tooltip, a right rail of balances and ranked lists) and translated to alert triage.

Depth is tonal, not dramatic. Nothing glows except the brand mark and the chart line; nothing is decorative. The dark theme is the same token set re-pointed, so no component hard-codes a colour. The console refuses the dark neon "cyber" look and the sidebar-plus-crimson admin template the app used before.

**Key Characteristics:**
- Top navigation; content on a neutral ground; a 340px right rail on the dashboard.
- One accent (Ember) for primary actions, active state, brand mark and the data line.
- Every figure in Geist Mono with tabular numerals; every status has a text label.
- Explanation is visible at rest: a SHAP mini-profile in every alert row, a resting crosshair on every chart.
- Synthetic provenance is always labelled (chips and banners), never hidden.

## Colors

A neutral ground with a single warm accent, plus tinted (never solid) status colours that always travel with a text label.

### Primary
- **Ember** (#ff7646): primary buttons, active toggles, the chart line, brand mark, sliders, selected scenario. Never used on inactive states. Buttons carry Ink text, not white: white on Ember is 2.65:1.
- **Ember Ink** (#b93c0a): orange used as text or a small figure on white (5.6:1).
- **Ember Soft** (#fff0ea): hatched crosshair band, first-run banner, selected scenario fill, "new" status.

### Neutral
- **Ground** (#f6f6f7): the page. Cards sit on it.
- **Surface** (#ffffff): cards, top bar, popovers.
- **Surface Sunken** (#f6f7f9): table header rows, segmented tracks, quiet callouts.
- **Hairline** (#ececef) / **Hairline Strong** (#dcdee3): card borders and dividers / input borders.
- **Ink** (#18181c), **Ink Secondary** (#4f5158), **Ink Tertiary** (#6b6e76): text at three strengths, all at least 5:1 on Surface.

### Status
- **Severity**: Critical (#e5484d), High (#f08a1c), Medium (#d4a20a), Low (#3b82f6), always rendered as a tinted pill with its word and a dot.
- **Positive** (#0e7a53) and **Negative** (#b42328): change chips. Polarity is metric-aware: more alerts is negative, higher precision is positive.
- **Attack hues** (violet, red, teal, amber-brown, blue): identity for the five attack classes on avatar discs and legend dots.

### Named Rules
**The One Voice Rule.** Ember appears on one primary action per region and on the data line. If a screen shows Ember in more than a handful of places, something inactive is shouting.
**The Label Rule.** Colour never carries meaning alone. Severity, status and deltas always include text or an arrow.
**The Dark Ramp Rule.** In dark theme, ordinal ramps (leader bars, risk calendar) are re-derived from Ember at rising lightness so their order survives; they are never simply darkened.

## Typography

**UI Font:** Geist Variable (self-hosted, with system fallbacks)
**Figure Font:** Geist Mono Variable (self-hosted)

**Character:** A neutral grotesque for language and a monospace for measurement. The pairing mirrors the reference: prose is calm, numbers are exact.

### Hierarchy
- **Display** (600, 24px, 1.2, -0.02em): page titles.
- **Title** (600, 15px, -0.01em): card headings.
- **Body** (400, 14px, 1.45): prose, table cells at 13px; prose measure capped near 62 to 74ch.
- **Label** (500, 12px): column heads, captions, chips.
- **Figure** (Geist Mono 500, 28px, -0.02em, tabular): KPI values; 34 to 44px for the headline volume and threat-pressure numbers; 12 to 13px in tables and IDs.

### Named Rules
**The Measurement Rule.** Anything that is a measured quantity (counts, scores, IPs, IDs, timestamps) is Geist Mono with tabular numerals. Anything that is a word is Geist.
**The Sentence Case Rule.** Feature names are humanised with acronyms restored ("DNS query length mean", "SYN flag count").

## Layout

A top bar (72px) over a 1480px-max page with a 28px gutter. The dashboard is a two-part grid: a fluid main column and a 340px rail. Cards are separated by 20px. Main column: four KPI cards, then Attack leaders beside Threat volume, then the alert table, then Risk calendar beside Analyst activity. Detail pages use a main column and a 380px sticky case aside. Tables scroll inside their card; nothing scrolls the page sideways.

Responsive behaviour is structural: the rail drops below the main column under 1360px and to one column under 720px; KPI grid goes 4, 2, 1; the nav collapses to a menu button under 980px; the search collapses to an icon under 1240px; the status button hides under 520px and the theme switch moves into the account menu.

## Elevation & Depth

Flat by default. Cards are separated by a 1px hairline and a barely-there shadow (`0 1px 2px rgba(20,20,28,0.04)`), not by lift. Depth appears only where something floats: popovers, the command palette, toasts and the login sample card use a soft, offset shadow (`0 12px 32px -8px rgba(20,20,28,0.18)`). The brand mark carries a small Ember glow. In dark theme, card shadows are removed entirely and depth comes from surface tone steps.

### Named Rules
**The Flat-Until-Floating Rule.** Only overlays cast a real shadow.

## Shapes

Soft but not bubbly. Cards 14px, controls 10px, small controls 8px, pills and search fields fully round. Avatars are circles; attack classes are circular discs with a white glyph. Bars and gauges have rounded ends (6px). Tables have a rounded header strip and no outer border.

## Components

### Buttons
- **Shape:** 10px radius, 40px tall (32px small).
- **Primary:** Ember fill, Ink label, 550 weight; hover shifts to a slightly deeper Ember.
- **Secondary:** Surface-3 fill (#eef0f3), Ink label. **Outline:** Surface with Hairline Strong border. **Good / Danger:** tinted positive / negative fills for confirm and false-positive.
- **Icon buttons:** 38px squares with a Hairline Strong border; a small dot marks unseen alerts and system findings.

### Segmented control and range pills
A sunken track (3px padding) with a white active pill and hairline border. Used for Week/Month, 24H/7D/30D/90D, view and scope switches.

### Cards and KPI cards
White, 14px, hairline border. KPI: title, subtitle, a 28px mono value (unit in 18px), then "vs last week" with a delta chip.

### Chips, pills and delta chips
Filter chips are pill-shaped; selected inverts to Ink. Severity and status pills are tinted with a dot or label. Delta chips show an arrow and a signed mono value.

### Inputs
40px, 10px radius, Hairline Strong border; focus turns the border Ember with a 3px Ember Soft ring. Search is a fully round pill with a K-key hint. Sliders have an Ember fill and a white, Ember-ringed thumb.

### Navigation
Text links in the top bar, secondary weight; the active link is Ink and heavier, with no underline. Unseen-alert count is a small Ember badge beside "Alerts".

### Time chart (signature)
A custom SVG line in Ember with a soft drop shadow, dotted vertical guides, and a hatched Ember-Soft band with a dashed crosshair and a dark tooltip on the active interval. At rest the band sits on the busiest interval; hover or arrow keys move it. Red diamonds on the baseline mark intervals whose worst alert scored 0.90 or higher.

### SHAP bars and what-if lab (signature)
Diverging bars: warm bars push toward the predicted attack, grey toward normal; the axis sits at the left edge when every driver agrees. The what-if lab pairs range sliders (Ember fill) with per-class probability bars showing before and after.

## Do's and Don'ts

### Do:
- **Do** keep primary text on Ember as Ink (#18181c); if white is ever wanted, use a darker accent, not white on #ff7646.
- **Do** set every measured value in Geist Mono with tabular numerals.
- **Do** pair every status colour with its word (Critical, Confirmed, Demo data).
- **Do** label generated data wherever it could be mistaken for live traffic: "Synthetic data", "Demo data", "Simulated".
- **Do** derive dark-theme ramps from the accent at rising lightness.

### Don't:
- **Don't** use a sidebar, a crimson brand colour, or neon-on-black "cyber" styling.
- **Don't** add eyebrows or kickers above headings, gradient text, coloured side-stripes on cards, or hard offset shadows.
- **Don't** use sparklines or micro-charts as decoration; every micro-visual (the SHAP glyph, the resting crosshair) must encode real data.
- **Don't** animate layout properties; motion is state change only (about 150 to 250ms), and reduced-motion is honoured.
- **Don't** let a table or chart widen the page; contain overflow inside its card.

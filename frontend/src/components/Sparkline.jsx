// Tiny trend line for a table cell. Draws real data only; a flat series is
// drawn flat rather than hidden.
export function Sparkline({ values, width = 96, height = 30, tone = "accent", label }) {
  if (!values || values.length < 2) return <span className="muted">—</span>;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  const pad = 3;
  const pts = values.map((v, i) => [
    pad + (i / (values.length - 1)) * (width - pad * 2),
    height - pad - ((v - min) / span) * (height - pad * 2),
  ]);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const stroke = tone === "pos" ? "var(--pos)" : tone === "neg" ? "var(--neg)" : "var(--accent)";
  const last = pts[pts.length - 1];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label || "Trend"}>
      <path d={d} fill="none" stroke={stroke} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="2.4" fill={stroke} />
    </svg>
  );
}

// Miniature SHAP profile for list rows: one bar per top driver, height is the
// share of the strongest driver, warm = pushed toward this attack class, grey =
// pushed away. It is the explanation at a glance, not decoration.
export function ShapGlyph({ features = [], max = 5 }) {
  const rows = features.slice(0, max);
  if (!rows.length) return <span className="muted">—</span>;
  const peak = Math.max(...rows.map((f) => Math.abs(f.shap_value)), 1e-9);
  const top = rows[0];
  const text = `Top driver: ${top.feature.replace(/_/g, " ")}`;
  return (
    <span className="shap-glyph" role="img" aria-label={text} title={text}>
      {rows.map((f) => (
        <span
          key={f.feature}
          className={f.shap_value >= 0 ? "pos" : "neg"}
          style={{ height: `${Math.max(14, (Math.abs(f.shap_value) / peak) * 100)}%` }}
        />
      ))}
    </span>
  );
}

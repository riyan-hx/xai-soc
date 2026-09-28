import { FEATURE_GLOSSARY } from "../lib/meta";
import { fmtValue, humanFeature } from "../lib/format";

/**
 * Diverging SHAP bars. Right of the axis (warm) = the measurement pushed the
 * model toward the predicted attack class; left (grey) = it pushed toward
 * normal traffic. `rawValues` are the flow's real units, because the values
 * stored with the explanation are already scaled for the model.
 */
export default function ShapBars({ features, rawValues = {}, attackLabel }) {
  const rows = [...features].sort((a, b) => Math.abs(b.shap_value) - Math.abs(a.shap_value));
  // Put the axis where the data needs it: dead-centre only when there are bars
  // on both sides, at the left edge when every driver pushes the same way.
  const negMax = Math.max(...rows.map((r) => (r.shap_value < 0 ? -r.shap_value : 0)), 0);
  const posMax = Math.max(...rows.map((r) => (r.shap_value > 0 ? r.shap_value : 0)), 0);
  const span = Math.max(negMax + posMax, 1e-9);
  const axis = (negMax / span) * 100;

  return (
    <div>
      <div className="shap-legend">
        <span>
          <i style={{ background: "var(--ink-3)", opacity: 0.6 }} /> Pushed toward normal traffic
        </span>
        <span>
          <i style={{ background: "var(--accent)" }} /> Pushed toward {attackLabel}
        </span>
      </div>
      <ul className="shap-list">
        {rows.map((r) => {
          const pct = (Math.abs(r.shap_value) / span) * 100;
          const pos = r.shap_value >= 0;
          const raw = rawValues[r.feature];
          return (
            <li key={r.feature} className="shap-row" title={FEATURE_GLOSSARY[r.feature]}>
              <div className="shap-label">
                <span>{humanFeature(r.feature)}</span>
                {raw != null && <span className="num shap-raw">{fmtValue(raw)}</span>}
              </div>
              <div className="shap-track" role="img" aria-label={`${humanFeature(r.feature)} pushed ${pos ? "toward" : "away from"} ${attackLabel} by ${Math.abs(r.shap_value).toFixed(3)}`}>
                <span className="shap-axis" style={{ left: `${axis}%` }} />
                <span
                  className={`shap-bar ${pos ? "pos" : "neg"}`}
                  style={pos ? { left: `${axis}%`, width: `${pct}%` } : { right: `${100 - axis}%`, width: `${pct}%` }}
                />
              </div>
              <span className="num shap-num">
                {pos ? "+" : "−"}
                {Math.abs(r.shap_value).toFixed(3)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

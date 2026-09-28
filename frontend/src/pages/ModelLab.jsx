import { useState } from "react";
import { FlaskConical, Info } from "lucide-react";
import { api } from "../api/client";
import { useAlertStream } from "../stream/AlertStream";
import { useAsync } from "../lib/useAsync";
import { ATTACK_TYPES, FEATURE_GLOSSARY, attackMeta } from "../lib/meta";
import { fmtInt, fmtPct, formatTime, humanFeature } from "../lib/format";
import { AttackAvatar } from "../components/Badges";
import Seg from "../components/Seg";
import { SkeletonCard, SkeletonKpis } from "../components/Skeleton";

function BarList({ rows, valueKey, labelKey = "feature", max, format = (v) => v.toFixed(3), accent = "var(--accent)" }) {
  const peak = max ?? Math.max(...rows.map((r) => r[valueKey]), 1e-9);
  return (
    <ul className="barlist">
      {rows.map((r) => (
        <li key={r[labelKey]} title={FEATURE_GLOSSARY[r[labelKey]]}>
          <span className="barlist-label">{humanFeature(r[labelKey])}</span>
          <span className="barlist-track">
            <span style={{ width: `${(r[valueKey] / peak) * 100}%`, background: accent }} />
          </span>
          <span className="num barlist-val">{format(r[valueKey])}</span>
        </li>
      ))}
    </ul>
  );
}

// Reliability diagram: if the model says 0.9, analysts should confirm about 90%.
function Reliability({ buckets }) {
  const W = 420;
  const H = 300;
  const m = { l: 44, r: 14, t: 14, b: 42 };
  const px = (v) => m.l + ((v - 0.5) / 0.5) * (W - m.l - m.r);
  const py = (v) => m.t + (1 - v) * (H - m.t - m.b);
  const filled = buckets.filter((b) => b.n > 0);

  return (
    <figure style={{ margin: 0 }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: 480, display: "block" }} role="img" aria-label="Reliability chart: analyst-confirmed rate against model confidence">
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <g key={t}>
            <line x1={m.l} x2={W - m.r} y1={py(t)} y2={py(t)} stroke="var(--line)" />
            <text x={m.l - 8} y={py(t) + 4} textAnchor="end" className="tchart-y">{Math.round(t * 100)}%</text>
          </g>
        ))}
        {[0.5, 0.6, 0.7, 0.8, 0.9, 1].map((t) => (
          <text key={t} x={px(t)} y={H - 22} textAnchor="middle" className="tchart-x">{Math.round(t * 100)}%</text>
        ))}
        <text x={(m.l + W - m.r) / 2} y={H - 4} textAnchor="middle" className="tchart-x">Model confidence</text>
        <line x1={px(0.5)} y1={py(0.5)} x2={px(1)} y2={py(1)} stroke="var(--ink-3)" strokeDasharray="4 4" />
        {filled.length > 1 && (
          <path
            d={filled.map((b, i) => `${i ? "L" : "M"}${px(b.mean_confidence)} ${py(b.confirmed_rate)}`).join(" ")}
            fill="none"
            stroke="var(--accent)"
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
        )}
        {filled.map((b) => (
          <g key={b.lo}>
            <circle cx={px(b.mean_confidence)} cy={py(b.confirmed_rate)} r={Math.min(4 + Math.sqrt(b.n) / 1.2, 11)} fill="var(--accent-soft)" stroke="var(--accent)" strokeWidth="2">
              <title>{`${Math.round(b.lo * 100)}–${Math.round(b.hi * 100)}% confidence: ${b.n} verdicts, ${fmtPct(b.confirmed_rate)} confirmed`}</title>
            </circle>
          </g>
        ))}
      </svg>
      <figcaption className="chart-legend" style={{ justifyContent: "flex-start", gap: 18 }}>
        <span><i className="lg-line dashed" /> Perfect calibration</span>
        <span><i className="lg-line" style={{ background: "var(--accent)" }} /> Observed analyst agreement (dot size = verdicts)</span>
      </figcaption>
    </figure>
  );
}

export default function ModelLab() {
  const stream = useAlertStream();
  const { data: m, error } = useAsync(() => api.getModelInsights(), [stream?.version]);
  const [cls, setCls] = useState("ALL");

  if (error) return <div className="error-banner">{error}</div>;
  if (!m) {
    return (
      <div>
        <div className="page-head"><div><h1>Model Observatory</h1></div></div>
        <SkeletonKpis />
        <div className="two-col" style={{ marginTop: 20 }}>
          <SkeletonCard height={300} />
          <SkeletonCard height={300} />
        </div>
      </div>
    );
  }

  const attr = m.observed_attribution;
  const attrRows = cls === "ALL" ? attr.overall : attr.by_class[cls] || [];
  const cal = m.calibration;
  const tuples = [
    { label: "Test accuracy", value: fmtPct(m.metrics.accuracy, 1), sub: `${fmtInt(m.dataset.n_test)} held-out flows` },
    { label: "Macro F1", value: m.metrics.macro_f1 != null ? m.metrics.macro_f1.toFixed(3) : "—", sub: "mean over 6 classes" },
    { label: "Analyst agreement", value: cal.agreement != null ? fmtPct(cal.agreement) : "—", sub: `${cal.verdicts} verdicts` },
    { label: "Calibration error", value: cal.ece != null ? cal.ece.toFixed(3) : "—", sub: cal.ece != null ? "lower is better" : "needs 10 verdicts" },
  ];

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Model Observatory</h1>
          <p>
            What the classifier learned, which measurements drive its decisions, and whether its confidence deserves your trust.
          </p>
        </div>
        <span className="pill pill-outline">
          {m.algorithm.replace(/_/g, " ")} · {m.n_estimators} trees · {m.features.length} features
        </span>
      </div>

      <div className="note-banner" style={{ marginBottom: 20 }}>
        <FlaskConical size={15} aria-hidden="true" />
        <span>
          <strong>Trained and tested on synthetic data.</strong> {m.dataset.label}. Near-perfect scores here show the pipeline works, not that
          real traffic will be this easy. Swap in CIC-IDS / CIRA-CIC-DoHBrw data to measure real performance.
        </span>
      </div>

      <div className="kpi-row">
        {tuples.map((t) => (
          <div className="card kpi" key={t.label}>
            <div className="kpi-title">{t.label}</div>
            <div className="kpi-sub">{t.sub}</div>
            <div className="kpi-value num" style={{ marginBottom: 0 }}>{t.value}</div>
          </div>
        ))}
      </div>

      <div className="two-col" style={{ marginTop: 20 }}>
        <section className="card" aria-labelledby="imp-h">
          <div className="card-head">
            <div>
              <h2 className="card-title" id="imp-h">What the model relies on</h2>
              <div className="card-sub">
                {cls === "ALL" ? "Average |SHAP| across every stored explanation" : `Average |SHAP| for ${attackMeta(cls).label} alerts`}
                {" · "}
                {fmtInt(attr.sample_size)} explanations
              </div>
            </div>
          </div>
          <div className="tabs" role="tablist" style={{ marginTop: 10 }}>
            {["ALL", ...ATTACK_TYPES].map((c) => (
              <button key={c} role="tab" aria-selected={cls === c} onClick={() => setCls(c)}>
                {c === "ALL" ? "All alerts" : attackMeta(c).short}
              </button>
            ))}
          </div>
          <div className="card-body">
            {attrRows.length ? (
              <BarList rows={attrRows} valueKey="mean_abs_shap" />
            ) : (
              <div className="empty" style={{ padding: "28px 8px" }}>
                <h3>No explanations yet</h3>
                <p>Attributions are aggregated from alerts as they are explained. Launch the simulator to create some.</p>
              </div>
            )}
          </div>
        </section>

        <section className="card" aria-labelledby="cal-h">
          <div className="card-head">
            <div>
              <h2 className="card-title" id="cal-h">Does its confidence deserve trust?</h2>
              <div className="card-sub">When the model says 90%, do analysts confirm about 90% of the time?</div>
            </div>
          </div>
          <div className="card-body">
            {cal.verdicts < 5 ? (
              <div className="empty" style={{ padding: "28px 8px" }}>
                <h3>Not enough verdicts yet</h3>
                <p>Confirm or dismiss alerts and this chart fills in. It needs a handful to mean anything.</p>
              </div>
            ) : (
              <Reliability buckets={cal.buckets} />
            )}
            {cal.seeded_share > 0 && (
              <div className="field-hint" style={{ marginTop: 12 }}>
                <Info size={12} style={{ verticalAlign: -1 }} aria-hidden="true" /> {fmtPct(cal.seeded_share)} of these verdicts are on simulated or demo alerts, so this shows the mechanism, not real analyst behaviour.
              </div>
            )}
          </div>
        </section>
      </div>

      <div className="two-col" style={{ marginTop: 20 }}>
        <section className="card" aria-labelledby="gi-h">
          <div className="card-head">
            <div>
              <h2 className="card-title" id="gi-h">Global feature importance</h2>
              <div className="card-sub">From the trained forest itself, independent of any alert</div>
            </div>
          </div>
          <div className="card-body">
            <BarList rows={m.importance.slice(0, 10)} valueKey="importance" accent="var(--ink)" />
          </div>
        </section>

        <section className="card" aria-labelledby="pc-h">
          <div className="card-head">
            <div>
              <h2 className="card-title" id="pc-h">Per-class performance</h2>
              <div className="card-sub">Held-out test set · trained {m.trained_at ? formatTime(m.trained_at) : "—"}</div>
            </div>
          </div>
          <div className="table-wrap" style={{ paddingTop: 14 }}>
            <table className="table table-compact">
              <thead>
                <tr>
                  <th>Class</th>
                  <th>Precision</th>
                  <th>Recall</th>
                  <th>F1</th>
                  <th className="right">Support</th>
                </tr>
              </thead>
              <tbody>
                {m.per_class.map((r) => (
                  <tr key={r.class}>
                    <td>
                      <div className="cell-main" style={{ gap: 10 }}>
                        <AttackAvatar type={r.class} size="sm" />
                        <span className="cell-title" style={{ fontSize: 13 }}>{attackMeta(r.class).label}</span>
                      </div>
                    </td>
                    <td className="num">{r.precision.toFixed(3)}</td>
                    <td className="num">{r.recall.toFixed(3)}</td>
                    <td className="num">{r.f1.toFixed(3)}</td>
                    <td className="right num">{r.support}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section className="card" style={{ marginTop: 20 }} aria-labelledby="glos-h">
        <div className="card-head">
          <div>
            <h2 className="card-title" id="glos-h">What each measurement means</h2>
            <div className="card-sub">The 17 flow features the model sees. None of them read packet contents.</div>
          </div>
        </div>
        <div className="card-body">
          <dl className="glossary">
            {m.features.map((f) => (
              <div key={f}>
                <dt className="num">{f}</dt>
                <dd>{FEATURE_GLOSSARY[f]}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
    </div>
  );
}

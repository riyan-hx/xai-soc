import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, DatabaseZap, FlaskConical, Info, Play, Radar, Trash2 } from "lucide-react";
import { api } from "../api/client";
import { useAuth } from "../api/auth";
import { useToast } from "../components/Toast";
import { useAlertStream } from "../stream/AlertStream";
import { ATTACK_TYPES, attackMeta } from "../lib/meta";
import { fmtPct, humanFeature } from "../lib/format";
import { AttackAvatar } from "../components/Badges";

const CLASS_ORDER = ["DNS_TUNNELING", "DOS_DDOS", "PORT_SCAN", "BRUTE_FORCE", "BOTNET", "NORMAL"];
const SCENARIOS = [
  ...ATTACK_TYPES,
  "MIXED",
  "NORMAL",
];
const SCENARIO_COPY = {
  DNS_TUNNELING: "Long, high-entropy, frequent lookups",
  DOS_DDOS: "Packet and SYN flood at one target",
  PORT_SCAN: "Many ports probed with tiny packets",
  BRUTE_FORCE: "Fast repeated login attempts",
  BOTNET: "Steady, low-volume C2 beaconing",
  MIXED: "Random blend of attacks and normal traffic",
  NORMAL: "Benign flows: should raise no alerts",
};
const SWEEP_LEVELS = [1.4, 1.2, 1.0, 0.8, 0.6, 0.45, 0.3];

// Measurement multipliers the generator applies at 1.00x intensity (mirrors
// backend/ml/profiles.py), shown so the console teaches before anything is sent.
const SIGNATURE = {
  DNS_TUNNELING: [["dns_query_length_mean", 3.2], ["dns_queries_per_session", 4.5], ["dns_query_entropy", 1.8], ["flow_duration", 1.6]],
  DOS_DDOS: [["flow_packets_per_sec", 9], ["total_fwd_packets", 8], ["flow_bytes_per_sec", 7], ["syn_flag_count", 5], ["fwd_iat_mean", 0.15]],
  PORT_SCAN: [["unique_dest_ports", 8], ["syn_flag_count", 4], ["packet_length_mean", 0.35], ["flow_duration", 0.3]],
  BRUTE_FORCE: [["total_fwd_packets", 3], ["ack_flag_count", 3], ["fwd_iat_mean", 0.6], ["flow_duration", 0.5]],
  BOTNET: [["flow_duration", 2.2], ["dns_queries_per_session", 2.5], ["dns_query_entropy", 1.6], ["fwd_iat_mean", 1.4]],
};

function IdleGuide({ scenario, intensity }) {
  const rows = SIGNATURE[scenario];
  return (
    <div className="idle-guide">
      <h3>
        {scenario === "MIXED"
          ? "A blend of every attack and normal traffic"
          : scenario === "NORMAL"
            ? "Benign flows: the model should stay quiet"
            : `What ${attackMeta(scenario).label} should look like`}
      </h3>
      {rows ? (
        <>
          <p>
            Compared with a normal flow, this scenario pushes these measurements (at {intensity.toFixed(2)}× intensity). A detection
            should show the same measurements leading the SHAP bars.
          </p>
          <ul className="idle-sig">
            {rows.map(([f, m]) => {
              const eff = Math.max(0.03, 1 + (m - 1) * intensity);
              return (
                <li key={f}>
                  <span>{humanFeature(f)}</span>
                  <span className="num">{eff >= 1 ? `×${eff.toFixed(1)}` : `×${eff.toFixed(2)}`}</span>
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <p>
          {scenario === "MIXED"
            ? "Attack flows should become alerts; the normal ones should pass. Watch for misclassifications and false alarms."
            : "Every flow here is generated from the normal profile. A false alarm means the model is over-sensitive."}
        </p>
      )}
      <ol className="idle-steps">
        <li>Each generated flow goes through the trained model.</li>
        <li>Detected attacks become alerts with a SHAP explanation and a risk score.</li>
        <li>Open one with Explain to edit its measurements in the what-if lab.</li>
      </ol>
    </div>
  );
}

function intensityLabel(v) {
  if (v >= 1.25) return "Loud";
  if (v >= 0.95) return "As trained";
  if (v >= 0.65) return "Quiet";
  return "Stealthy";
}

function ProbStack({ probs }) {
  const entries = CLASS_ORDER.map((c) => [c, probs?.[c] ?? 0]);
  const top = [...entries].sort((a, b) => b[1] - a[1])[0];
  return (
    <span
      className="probstack"
      role="img"
      aria-label={`Model probabilities: ${entries.filter(([, p]) => p >= 0.01).map(([c, p]) => `${attackMeta(c).short} ${fmtPct(p)}`).join(", ")}`}
      title={entries.map(([c, p]) => `${attackMeta(c).short} ${fmtPct(p)}`).join("\n")}
    >
      {entries.map(([c, p]) => (
        <span key={c} style={{ flex: p || 0.0001, background: `var(${attackMeta(c).cssVar})`, opacity: c === top[0] ? 1 : 0.55 }} />
      ))}
    </span>
  );
}

function EvasionChart({ points }) {
  const W = 560;
  const H = 220;
  const m = { l: 40, r: 16, t: 14, b: 34 };
  const xs = points.map((p) => p.level);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const x = (v) => m.l + ((xMax - v) / (xMax - xMin || 1)) * (W - m.l - m.r); // loud on the left
  const y = (v) => m.t + (1 - v) * (H - m.t - m.b);
  const path = (key) => points.map((p, i) => `${i ? "L" : "M"}${x(p.level).toFixed(1)} ${y(p[key]).toFixed(1)}`).join(" ");

  return (
    <figure style={{ margin: 0 }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: 640, display: "block" }} role="img" aria-label="Detection rate and model confidence as the attack gets stealthier">
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <g key={t}>
            <line x1={m.l} x2={W - m.r} y1={y(t)} y2={y(t)} stroke="var(--line)" />
            <text x={m.l - 8} y={y(t) + 4} textAnchor="end" className="tchart-y">{Math.round(t * 100)}%</text>
          </g>
        ))}
        <path d={path("detected")} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d={path("confidence")} fill="none" stroke="var(--ink-2)" strokeWidth="2" strokeDasharray="5 4" strokeLinecap="round" />
        {points.map((p) => (
          <g key={p.level}>
            <circle cx={x(p.level)} cy={y(p.detected)} r="4" fill="var(--surface)" stroke="var(--accent)" strokeWidth="2.5" />
            <text x={x(p.level)} y={H - 12} textAnchor="middle" className="tchart-x">{p.level.toFixed(2)}×</text>
          </g>
        ))}
      </svg>
      <figcaption className="chart-legend" style={{ justifyContent: "flex-start", gap: 18 }}>
        <span><i className="lg-line" style={{ background: "var(--accent)" }} /> Detected as an attack</span>
        <span><i className="lg-line dashed" /> Mean probability of the true class</span>
        <span className="muted">Left = loud, right = stealthy</span>
      </figcaption>
    </figure>
  );
}

export default function Simulator() {
  const { user } = useAuth();
  const toast = useToast();
  const stream = useAlertStream();
  const canRun = user?.role === "ANALYST" || user?.role === "ADMIN";
  const isAdmin = user?.role === "ADMIN";

  const [scenario, setScenario] = useState("DOS_DDOS");
  const [intensity, setIntensity] = useState(1.0);
  const [count, setCount] = useState(5);
  const [dryRun, setDryRun] = useState(false);
  const [running, setRunning] = useState(false);
  const [sweeping, setSweeping] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [log, setLog] = useState([]);
  const [last, setLast] = useState(null);
  const [sweep, setSweep] = useState(null);

  async function launch() {
    setRunning(true);
    try {
      const res = await api.simulate({ scenario, count, intensity, dry_run: dryRun });
      setLast(res);
      setLog((cur) => [...res.results.map((r) => ({ ...r, dry: res.dry_run, at: Date.now() })).reverse(), ...cur].slice(0, 60));
      if (!res.dry_run) stream?.bump();
      const s = res.summary;
      toast?.push({
        type: s.attacks_sent && s.attacks_detected < s.attacks_sent ? "warning" : "success",
        title: res.dry_run ? "Scored without saving" : `${s.alerts} alert${s.alerts === 1 ? "" : "s"} created`,
        message: s.attacks_sent
          ? `${s.attacks_detected} of ${s.attacks_sent} attack flows detected.`
          : `${s.false_alarms} false alarm${s.false_alarms === 1 ? "" : "s"} on ${s.benign_sent} benign flows.`,
      });
    } catch (e) {
      toast?.push({ type: "critical", title: "Simulation failed", message: e.message });
    } finally {
      setRunning(false);
    }
  }

  async function runSweep() {
    const target = ATTACK_TYPES.includes(scenario) ? scenario : "DOS_DDOS";
    setSweeping(true);
    setSweep({ target, points: [] });
    try {
      const points = [];
      for (const level of SWEEP_LEVELS) {
        const res = await api.simulate({ scenario: target, count: 20, intensity: level, dry_run: true });
        points.push({
          level,
          detected: res.summary.attacks_detected / res.summary.attacks_sent,
          confidence: res.summary.mean_true_class_probability ?? 0,
        });
        setSweep({ target, points: [...points] });
      }
    } catch (e) {
      toast?.push({ type: "critical", title: "Sweep failed", message: e.message });
    } finally {
      setSweeping(false);
    }
  }

  async function seed(reset) {
    setSeeding(true);
    try {
      const r = await api.backfill({ days: 30, per_day: 14, reset });
      stream?.bump();
      toast?.push({
        type: "success",
        title: `${reset ? "Replaced" : "Added"} demo history: ${r.created} alerts`,
        message: `${r.triaged} carry analyst verdicts. All are tagged Demo data.`,
      });
    } catch (e) {
      toast?.push({ type: "critical", title: "Could not seed demo history", message: e.message });
    } finally {
      setSeeding(false);
    }
  }

  const summary = last?.summary;
  const sweepTarget = useMemo(() => attackMeta(sweep?.target || (ATTACK_TYPES.includes(scenario) ? scenario : "DOS_DDOS")).label, [sweep, scenario]);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Threat Simulator</h1>
          <p>
            Fire generated flows through the same pipeline as live traffic: classification, SHAP explanation, risk score,
            alert. Everything created here is tagged <em>Simulated</em>.
          </p>
        </div>
        <span className="pill pill-warn">
          <FlaskConical size={12} aria-hidden="true" /> Synthetic traffic
        </span>
      </div>

      {!canRun && (
        <div className="note-banner" style={{ marginBottom: 16 }}>
          <Info size={14} aria-hidden="true" /> Viewer role: you can read this page, but launching simulations needs an analyst or admin account.
        </div>
      )}

      <div className="sim-grid">
        <div className="sim-side">
          <section className="card card-pad" aria-label="Scenario">
            <h2 className="card-title" style={{ marginBottom: 12 }}>Scenario</h2>
            <div className="scenario-list" role="radiogroup" aria-label="Scenario">
              {SCENARIOS.map((s) => {
                const active = scenario === s;
                return (
                  <button
                    key={s}
                    role="radio"
                    aria-checked={active}
                    className={`scenario ${active ? "active" : ""}`}
                    onClick={() => setScenario(s)}
                  >
                    {s === "MIXED" ? (
                      <span className="atk-avatar atk-avatar-sm atk-NORMAL"><Activity size={13} aria-hidden="true" /></span>
                    ) : (
                      <AttackAvatar type={s} size="sm" />
                    )}
                    <span>
                      <span className="scenario-name">{s === "MIXED" ? "Mixed traffic" : attackMeta(s).label}</span>
                      <span className="scenario-desc">{SCENARIO_COPY[s]}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="card card-pad" aria-label="Controls">
            <div className="field">
              <div className="slider-head">
                <label htmlFor="intensity">Attack intensity</label>
                <span className="num slider-val">{intensity.toFixed(2)}× · {intensityLabel(intensity)}</span>
              </div>
              <input
                id="intensity"
                type="range"
                className="slider"
                min={0.3}
                max={1.5}
                step={0.05}
                value={intensity}
                style={{ "--fill": `${((intensity - 0.3) / 1.2) * 100}%` }}
                onChange={(e) => setIntensity(Number(e.target.value))}
              />
              <span className="field-hint">1.00× is the profile the model trained on. Lower it to make the attack blend into normal traffic.</span>
            </div>

            <div className="field">
              <label htmlFor="count">Flows to send</label>
              <select id="count" className="select" value={count} onChange={(e) => setCount(Number(e.target.value))}>
                {[1, 5, 10, 25].map((n) => (
                  <option key={n} value={n}>{n} flow{n === 1 ? "" : "s"}</option>
                ))}
              </select>
            </div>

            <label className="check-row">
              <input type="checkbox" className="check" checked={dryRun} onChange={(e) => setDryRun(e.target.checked)} />
              <span>
                Dry run
                <span className="field-hint" style={{ display: "block" }}>Score the flows but create no alerts.</span>
              </span>
            </label>

            <div className="sim-buttons">
              <button className="btn btn-primary" onClick={launch} disabled={!canRun || running || sweeping}>
                <Play size={16} aria-hidden="true" /> {running ? "Running…" : "Launch"}
              </button>
              <button className="btn btn-outline" onClick={runSweep} disabled={!canRun || running || sweeping} title="Score 20 flows at each of 7 intensities, without creating alerts">
                <Radar size={16} aria-hidden="true" /> {sweeping ? "Sweeping…" : "Stealth sweep"}
              </button>
            </div>
          </section>

          {isAdmin && (
            <section className="card card-pad" aria-label="Demo history">
              <h2 className="card-title">Demo history</h2>
              <p className="muted" style={{ fontSize: 12.5, margin: "4px 0 14px" }}>
                Generate a month of alerts with campaign bursts, analyst verdicts and case states, so charts and the
                calibration view have something to show. Tagged <em>Demo data</em>.
              </p>
              <div className="sim-buttons">
                <button className="btn btn-secondary btn-sm" onClick={() => seed(true)} disabled={seeding}>
                  <DatabaseZap size={14} aria-hidden="true" /> {seeding ? "Working…" : "Load / replace"}
                </button>
              </div>
            </section>
          )}
        </div>

        <div className="sim-main">
          <section className="card" aria-label="Live console">
            <div className="card-head">
              <div>
                <h2 className="card-title">Live console</h2>
                <div className="card-sub">Each row is one generated flow and what the model made of it</div>
              </div>
              {log.length > 0 && (
                <button className="btn btn-ghost btn-sm" onClick={() => { setLog([]); setLast(null); }}>
                  <Trash2 size={14} aria-hidden="true" /> Clear
                </button>
              )}
            </div>

            {summary && (
              <div className="sim-summary">
                <div><span className="num">{summary.sent}</span> sent</div>
                <div><span className="num">{summary.attacks_detected}</span> / {summary.attacks_sent} attacks detected</div>
                <div><span className="num">{summary.attacks_misclassified}</span> misclassified</div>
                <div><span className="num">{summary.false_alarms}</span> false alarms</div>
                {summary.mean_true_class_probability != null && (
                  <div><span className="num">{fmtPct(summary.mean_true_class_probability)}</span> mean confidence</div>
                )}
              </div>
            )}

            {log.length === 0 ? (
              <IdleGuide scenario={scenario} intensity={intensity} />
            ) : (
              <ul className="console" aria-live="polite">
                {log.map((r, i) => {
                  const wrongClass = r.detected && r.predicted !== r.intended;
                  return (
                    <li key={`${r.at}-${r.index}-${i}`} className="console-row">
                      <AttackAvatar type={r.intended} size="sm" />
                      <div className="console-main">
                        <div className="console-line">
                          <strong>{attackMeta(r.intended).short}</strong>
                          <span className="muted">→ model says</span>
                          <strong>{attackMeta(r.predicted).short}</strong>
                          <span className="num muted">{fmtPct(r.confidence)}</span>
                        </div>
                        <ProbStack probs={r.probabilities} />
                      </div>
                      <div className="console-end">
                        {r.intended === "NORMAL" ? (
                          r.detected ? <span className="pill pill-warn">False alarm</span> : <span className="pill pill-pos">Passed as normal</span>
                        ) : !r.detected ? (
                          <span className="pill pill-neg">Missed</span>
                        ) : wrongClass ? (
                          <span className="pill pill-warn">Misclassified</span>
                        ) : (
                          <span className="pill pill-pos">Detected</span>
                        )}
                        {r.alert_id ? (
                          <Link className="btn btn-outline btn-sm" to={`/alerts/${r.alert_id}`}>Explain</Link>
                        ) : r.dry ? (
                          <span className="muted" style={{ fontSize: 11.5 }}>dry run</span>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {sweep && (
            <section className="card" aria-label="Stealth sweep">
              <div className="card-head">
                <div>
                  <h2 className="card-title">How stealthy can {sweepTarget} get?</h2>
                  <div className="card-sub">
                    20 flows scored at each intensity. This measures the model against generated data only, not real evasion.
                  </div>
                </div>
              </div>
              <div className="card-body">
                {sweep.points.length < 2 ? (
                  <div className="skeleton skeleton-block" style={{ height: 220, width: "100%" }} />
                ) : (
                  <EvasionChart points={sweep.points} />
                )}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

import { useState } from "react";
import { Download, FlaskConical, Printer } from "lucide-react";
import { api } from "../api/client";
import { useToast } from "../components/Toast";
import { useAlertStream } from "../stream/AlertStream";
import { useAsync } from "../lib/useAsync";
import { exportAlertsCsv } from "../lib/exportCsv";
import { ATTACK_TYPES, SEVERITIES, SEVERITY_META, STATUS_META, STATUSES, attackMeta } from "../lib/meta";
import { fmtInt, fmtPct, formatDateLong, parseTs } from "../lib/format";
import { AttackAvatar, Delta } from "../components/Badges";
import TimeChart from "../components/TimeChart";
import { SkeletonCard, SkeletonKpis } from "../components/Skeleton";

function Distribution({ title, rows, total }) {
  return (
    <section className="card card-pad">
      <h2 className="card-title" style={{ marginBottom: 12 }}>{title}</h2>
      {rows.every((r) => !r.count) ? (
        <p className="muted" style={{ fontSize: 13 }}>No data yet.</p>
      ) : (
        <ul className="barlist">
          {rows.map((r) => (
            <li key={r.key}>
              <span className="barlist-label" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {r.icon}
                {r.label}
              </span>
              <span className="barlist-track">
                <span style={{ width: `${(r.count / (total || 1)) * 100}%`, background: r.color || "var(--accent)" }} />
              </span>
              <span className="num barlist-val">{fmtInt(r.count)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function summarize(o, stats) {
  const k = o.kpis;
  const lead = o.leaders.week.items[0];
  const src = o.top_sources[0];
  const parts = [];
  const change = k.alerts.delta_pct;
  parts.push(
    `In the last 7 days the system raised ${fmtInt(k.alerts.value)} alert${k.alerts.value === 1 ? "" : "s"}` +
      (change != null ? `, ${change >= 0 ? "up" : "down"} ${Math.abs(change)}% on the previous week` : "") +
      `. ${fmtInt(k.critical.value)} ${k.critical.value === 1 ? "was" : "were"} critical.`
  );
  if (lead) parts.push(`${attackMeta(lead.attack_type).label} was the most common attack (${fmtInt(lead.count)} alerts, ${fmtPct(lead.share)} of the top five).`);
  if (src) parts.push(`The busiest source was ${src.ip} with ${src.alerts} alerts, mostly ${attackMeta(src.top_attack).label.toLowerCase()}.`);
  if (k.precision.value != null)
    parts.push(
      `Analysts reviewed ${k.precision.n} alert${k.precision.n === 1 ? "" : "s"} and confirmed ${k.precision.value.toFixed(0)}% as real attacks` +
        (k.triage_minutes.value != null ? `, with a median time to verdict of ${k.triage_minutes.value < 60 ? `${Math.round(k.triage_minutes.value)} minutes` : `${(k.triage_minutes.value / 60).toFixed(1)} hours`}.` : ".")
    );
  const open = (stats.by_status?.NEW || 0) + (stats.by_status?.INVESTIGATING || 0) + (stats.by_status?.CONFIRMED || 0);
  parts.push(`${fmtInt(open)} alert${open === 1 ? " remains" : "s remain"} open. Threat pressure is ${o.posture.band.toLowerCase()} (${o.posture.index} of 100).`);
  return parts;
}

export default function Reports() {
  const toast = useToast();
  const stream = useAlertStream();
  const [exporting, setExporting] = useState(false);
  const overview = useAsync(() => api.getOverview(), [stream?.version]);
  const stats = useAsync(() => api.getStats(), [stream?.version]);
  const series = useAsync(() => api.getTimeseries("30d"), [stream?.version]);

  async function handleExport() {
    setExporting(true);
    try {
      const n = await exportAlertsCsv();
      toast?.push({ type: "success", title: `Exported ${n} alerts` });
    } catch (e) {
      toast?.push({ type: "critical", title: "Export failed", message: e.message });
    } finally {
      setExporting(false);
    }
  }

  const o = overview.data;
  const s = stats.data;
  const error = overview.error || stats.error;

  return (
    <div className="report">
      <div className="page-head">
        <div>
          <h1>Reports</h1>
          <p>A plain-language brief for the last 7 days, with the numbers behind it.</p>
        </div>
        <div className="page-actions no-print">
          <button className="btn btn-outline" onClick={() => window.print()}>
            <Printer size={16} aria-hidden="true" /> Print brief
          </button>
          <button className="btn btn-primary" onClick={handleExport} disabled={exporting}>
            <Download size={16} aria-hidden="true" /> {exporting ? "Exporting…" : "Export CSV"}
          </button>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {!o || !s ? (
        <>
          <SkeletonKpis />
          <div style={{ marginTop: 20 }}><SkeletonCard height={200} /></div>
        </>
      ) : (
        <>
          <section className="card brief">
            <div className="card-head">
              <div>
                <h2 className="card-title">Weekly brief</h2>
                <div className="card-sub">Generated {formatDateLong(o.generated_at)}</div>
              </div>
              <span className="pill pill-warn"><FlaskConical size={12} aria-hidden="true" /> Synthetic data</span>
            </div>
            <div className="card-body">
              {summarize(o, s).map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          </section>

          <div className="kpi-row" style={{ marginTop: 20 }}>
            <div className="card kpi">
              <div className="kpi-title">Total alerts</div>
              <div className="kpi-sub">All time</div>
              <div className="kpi-value num">{fmtInt(s.total_alerts)}</div>
            </div>
            <div className="card kpi">
              <div className="kpi-title">New this week</div>
              <div className="kpi-sub">vs previous 7 days</div>
              <div className="kpi-value num">{fmtInt(o.kpis.alerts.value)}</div>
              <div className="kpi-foot"><span /> <Delta value={o.kpis.alerts.delta_pct} polarity="up-bad" /></div>
            </div>
            <div className="card kpi">
              <div className="kpi-title">True positives</div>
              <div className="kpi-sub">Analyst-confirmed, all time</div>
              <div className="kpi-value num">{fmtInt(s.feedback.true_positives)}</div>
            </div>
            <div className="card kpi">
              <div className="kpi-title">False positives</div>
              <div className="kpi-sub">Analyst-dismissed, all time</div>
              <div className="kpi-value num">{fmtInt(s.feedback.false_positives)}</div>
            </div>
          </div>

          <section className="card" style={{ marginTop: 20 }}>
            <div className="card-head">
              <div>
                <h2 className="card-title">Alert volume, last 30 days</h2>
                <div className="card-sub">One point per day</div>
              </div>
            </div>
            <div className="card-body">
              {series.data ? <TimeChart points={series.data.points} range="30d" height={230} /> : <div className="skeleton skeleton-block" style={{ height: 230, width: "100%" }} />}
            </div>
          </section>

          <div className="three-col" style={{ marginTop: 20 }}>
            <Distribution
              title="By attack type"
              total={s.total_alerts}
              rows={ATTACK_TYPES.map((t) => ({
                key: t,
                label: attackMeta(t).label,
                count: s.by_attack_type[t] || 0,
                color: `var(${attackMeta(t).cssVar})`,
                icon: <AttackAvatar type={t} size="sm" />,
              }))}
            />
            <Distribution
              title="By severity"
              total={s.total_alerts}
              rows={SEVERITIES.map((v) => ({ key: v, label: SEVERITY_META[v].label, count: s.by_severity[v] || 0, color: SEVERITY_META[v].color }))}
            />
            <Distribution
              title="By case status"
              total={s.total_alerts}
              rows={STATUSES.map((v) => ({ key: v, label: STATUS_META[v].label, count: s.by_status?.[v] || 0 }))}
            />
          </div>

          <div className="two-col" style={{ marginTop: 20 }}>
            {[
              ["Top threat sources", o.top_sources],
              ["Most targeted assets", o.top_targets],
            ].map(([title, rows]) => (
              <section className="card" key={title}>
                <div className="card-head"><h2 className="card-title">{title}</h2></div>
                <div className="table-wrap" style={{ paddingTop: 12 }}>
                  <table className="table table-compact">
                    <thead>
                      <tr><th>Address</th><th>Main attack</th><th>Alerts</th><th>Peak risk</th><th className="right">vs prev 7d</th></tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.ip}>
                          <td className="num cell-title" style={{ fontSize: 13 }}>{r.ip}</td>
                          <td>{attackMeta(r.top_attack).short}</td>
                          <td className="num">{r.alerts}</td>
                          <td className="num">{r.max_risk.toFixed(2)}</td>
                          <td className="right"><Delta value={r.delta_pct} polarity="up-bad" digits={0} /></td>
                        </tr>
                      ))}
                      {rows.length === 0 && <tr><td colSpan={5} className="muted">Nothing in the last 7 days.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </div>

          <p className="field-hint" style={{ marginTop: 16 }}>
            Period: {parseTs(o.leaders.week.start).toLocaleDateString()} to {parseTs(o.leaders.week.end).toLocaleDateString()}. Alerts from the
            Threat Simulator and seeded demo history are included and tagged in the queue.
          </p>
        </>
      )}
    </div>
  );
}

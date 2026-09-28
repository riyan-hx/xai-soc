import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowRight,
  ChevronsUpDown,
  Download,
  FlaskConical,
  Info,
  MoreHorizontal,
  Play,
  RefreshCw,
  Search,
  Server,
  ShieldCheck,
  Sparkles,
  Target,
  UserCheck,
} from "lucide-react";
import { api } from "../api/client";
import { useAuth } from "../api/auth";
import { useToast } from "../components/Toast";
import { useAlertStream } from "../stream/AlertStream";
import { useAsync } from "../lib/useAsync";
import { exportAlertsCsv } from "../lib/exportCsv";
import { attackMeta } from "../lib/meta";
import { fmtInt, formatClock, formatTime, fmtPct, parseTs, relativeTime } from "../lib/format";
import { AttackAvatar, AttackCell, Delta, RiskBar, SeverityPill, StatusPill } from "../components/Badges";
import { ShapGlyph } from "../components/Sparkline";
import Seg from "../components/Seg";
import TimeChart from "../components/TimeChart";
import RiskHeatmap from "../components/RiskHeatmap";
import { SkeletonCard, SkeletonKpis, SkeletonRows } from "../components/Skeleton";

const RANGE_OPTIONS = [
  { value: "24h", label: "24H" },
  { value: "7d", label: "7D" },
  { value: "30d", label: "30D" },
  { value: "90d", label: "90D" },
];
const TABLE_RANGES = [
  { value: 1, label: "24H" },
  { value: 7, label: "7D" },
  { value: 30, label: "30D" },
  { value: 0, label: "All" },
];
const BAND_CLASS = { Calm: "pill-pos", Elevated: "pill-medium", High: "pill-high", Severe: "pill-critical" };

function duration(min) {
  if (min == null) return { value: "—" };
  if (min < 60) return { value: String(Math.round(min)), unit: "min" };
  return { value: (min / 60).toFixed(1), unit: "h" };
}

function KpiCard({ title, sub, value, unit, delta, note }) {
  return (
    <div className="card kpi">
      <div className="kpi-title">{title}</div>
      <div className="kpi-sub">{sub}</div>
      <div className="kpi-value num">
        {value}
        {unit && <span className="kpi-unit">{unit}</span>}
      </div>
      <div className="kpi-foot">
        <span>{note}</span>
        {delta}
      </div>
    </div>
  );
}

function Leaders({ data }) {
  const [period, setPeriod] = useState("week");
  const block = data[period];
  const top = block.items.slice(0, 3);
  const total = top.reduce((a, b) => a + b.count, 0) || 1;
  const shades = ["var(--accent)", "var(--accent-2)", "var(--accent-3)"];
  const fmt = (iso) => parseTs(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

  return (
    <div className="card leaders">
      <div className="card-head">
        <h2 className="card-title">Attack leaders</h2>
        <Seg
          label="Period"
          value={period}
          onChange={setPeriod}
          options={[
            { value: "week", label: "Week" },
            { value: "month", label: "Month" },
          ]}
        />
      </div>
      <div className="card-body">
        {top.length === 0 ? (
          <div className="empty" style={{ padding: "28px 8px" }}>
            <h3>No attacks in this period</h3>
            <p>Detections will rank here as traffic is analysed.</p>
          </div>
        ) : (
          <>
            <div className="leaders-bars">
              {top.map((t, i) => (
                <div key={t.attack_type} style={{ flex: t.count / total }} className="leaders-col">
                  <Delta value={t.delta_pct} polarity="up-bad" digits={1} />
                  <span className="leaders-bar" style={{ background: shades[i] }} />
                </div>
              ))}
            </div>
            <div className="leaders-range num">
              <span>{fmt(block.start)}</span>
              <span>{fmt(block.end)}</span>
            </div>
            <ul className="leaders-list">
              {top.map((t, i) => (
                <li key={t.attack_type}>
                  <div className="leaders-name">
                    <span className="atk-dot" style={{ background: shades[i] }} aria-hidden="true" />
                    {attackMeta(t.attack_type).label}
                  </div>
                  <div className="leaders-row">
                    <span className="leaders-count num">{fmtInt(t.count)}</span>
                    <span className="leaders-prev num">
                      prev: {fmtInt(t.prev)} · {fmtPct(t.share)} of top
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

function ThreatVolume({ kpiDelta }) {
  const stream = useAlertStream();
  const [range, setRange] = useState("7d");
  const { data, error } = useAsync(() => api.getTimeseries(range), [range, stream?.version]);
  const peakTime = data ? parseTs(data.peak.t).toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }) : "";
  const rangeLabel = { "24h": "last 24 hours", "7d": "last 7 days", "30d": "last 30 days", "90d": "last 90 days" }[range];

  return (
    <div className="card volume">
      <div className="card-body volume-head">
        <div>
          <div className="volume-label">Threat volume</div>
          <div className="volume-value num">{data ? fmtInt(data.total) : "—"}</div>
          <div className="volume-sub">
            {range === "7d" && kpiDelta}
            <span>
              alerts in the {rangeLabel}
              {data && data.peak.count > 0 && ` · peak ${data.peak.count} (${peakTime})`}
            </span>
          </div>
        </div>
        <Seg label="Time range" value={range} onChange={setRange} options={RANGE_OPTIONS} />
      </div>
      <div className="card-body" style={{ paddingTop: 0 }}>
        {error ? (
          <div className="error-banner">{error}</div>
        ) : data ? (
          <TimeChart points={data.points} range={range} height={252} />
        ) : (
          <div className="skeleton skeleton-block" style={{ height: 252, width: "100%" }} />
        )}
        <div className="chart-legend">
          <span>
            <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
              <path d="M5 0 L10 5 L5 10 L0 5 Z" fill="var(--sev-critical)" />
            </svg>
            Interval with a peak risk of 0.90 or higher
          </span>
          <span className="muted">Hover or use the arrow keys to inspect an interval</span>
        </div>
      </div>
    </div>
  );
}

function RecentAlerts() {
  const navigate = useNavigate();
  const stream = useAlertStream();
  const [days, setDays] = useState(7);
  const [q, setQ] = useState("");
  const since = useMemo(
    () => (days ? new Date(Date.now() - days * 86400e3).toISOString() : undefined),
    // recompute the window whenever new alerts land or the range changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [days, stream?.version]
  );
  const { data, loading, error } = useAsync(
    () => api.listAlerts({ limit: 6, since, q: q.trim() || undefined }),
    [since, q]
  );
  const items = data?.items || [];

  return (
    <div className="card">
      <div className="card-head" style={{ flexWrap: "wrap" }}>
        <div className="table-title">
          <span className="table-title-icon">
            <Target size={16} aria-hidden="true" />
          </span>
          <div>
            <h2 className="card-title">Recent alerts</h2>
            <div className="card-sub">Highest risk first. The bars show what drove each verdict.</div>
          </div>
        </div>
        <div className="table-tools">
          <div className="search-field" style={{ width: 210 }}>
            <Search size={15} aria-hidden="true" />
            <input
              className="input input-sm"
              style={{ borderRadius: 999 }}
              placeholder="Filter by IP…"
              aria-label="Filter recent alerts by IP"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <Seg label="Time window" value={days} onChange={setDays} options={TABLE_RANGES} />
          <Link to="/alerts" className="btn btn-outline btn-sm">
            View all <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>
      </div>
      <div className="table-wrap" style={{ paddingTop: 14 }}>
        <table className="table">
          <thead>
            <tr>
              <th>Alert</th>
              <th>Severity</th>
              <th>
                Risk
                <span className="sort">
                  <ChevronsUpDown size={12} aria-hidden="true" />
                </span>
              </th>
              <th>Confidence</th>
              <th>Why</th>
              <th>Status</th>
              <th className="right">Detected</th>
            </tr>
          </thead>
          <tbody>
            {loading && !data && <SkeletonRows rows={5} cols={7} />}
            {items.map((a) => (
              <tr key={a.id} className="row-link" onClick={() => navigate(`/alerts/${a.id}`)}>
                <td>
                  <AttackCell type={a.attack_type} sub={`${a.source_ip} → ${a.dest_ip}`} />
                </td>
                <td>
                  <SeverityPill severity={a.severity} />
                </td>
                <td>
                  <RiskBar score={a.risk_score} />
                </td>
                <td className="num">{fmtPct(a.confidence)}</td>
                <td>
                  <ShapGlyph features={a.top_features} />
                </td>
                <td>
                  <StatusPill status={a.status} />
                </td>
                <td className="right num" title={formatTime(a.timestamp)}>
                  {relativeTime(a.timestamp)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {error && <div className="error-banner" style={{ margin: 12 }}>{error}</div>}
        {!loading && !error && items.length === 0 && (
          <div className="empty" style={{ padding: "32px 16px" }}>
            <h3>No alerts in this window</h3>
            <p>Widen the time window, clear the filter, or launch a simulated attack.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function ThreatPressure({ overview, onRefresh, refreshing }) {
  const navigate = useNavigate();
  const toast = useToast();
  const [exporting, setExporting] = useState(false);
  const p = overview.posture;
  const total = Math.max(p.open_total, 1);
  const tone = { P1: "var(--sev-critical)", P2: "var(--sev-high)", P3: "var(--sev-medium)", P4: "var(--sev-low)" };

  async function triageNext() {
    try {
      const res = await api.listAlerts({ status: ["NEW"], limit: 1 });
      if (res.items[0]) navigate(`/alerts/${res.items[0].id}`, { state: { orderedIds: res.items.map((a) => a.id), index: 0 } });
      else toast?.push({ type: "success", title: "Queue is clear", message: "No new alerts are waiting for triage." });
    } catch (e) {
      toast?.push({ type: "critical", title: "Could not load the queue", message: e.message });
    }
  }

  async function doExport() {
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

  return (
    <div className="card pressure">
      <div className="card-head">
        <h2 className="card-title">Threat pressure</h2>
        <span className="pill pill-warn" title="Every alert in this build comes from generated flows, not live network capture">
          <FlaskConical size={12} aria-hidden="true" />
          Synthetic data
        </span>
      </div>
      <div className="card-body">
        <div className="pressure-value">
          <span className="num pressure-num">{p.index}</span>
          <span className="pressure-of num">/ 100</span>
          <span className={`pill ${BAND_CLASS[p.band]}`}>{p.band}</span>
        </div>
        <div className="pressure-meta">
          <span className="num">{formatClock(parseTs(overview.generated_at))}</span>
          <button className="link-btn" onClick={onRefresh} disabled={refreshing}>
            <RefreshCw size={13} className={refreshing ? "spin" : ""} aria-hidden="true" /> Refresh
          </button>
          <span className="pressure-info" title={p.formula}>
            <Info size={14} aria-label={p.formula} />
          </span>
        </div>

        <div className="pressure-split" role="img" aria-label={`Open alerts by priority: ${Object.entries(p.open_by_priority).map(([k, v]) => `${k} ${v}`).join(", ")}`}>
          {Object.entries(p.open_by_priority).map(([k, v]) => (
            <span key={k} style={{ flex: v || 0.0001, background: tone[k] }} />
          ))}
        </div>
        <div className="pressure-legend num">
          {Object.entries(p.open_by_priority).map(([k, v]) => (
            <span key={k}>
              <i style={{ background: tone[k] }} aria-hidden="true" />
              {k} {v}
            </span>
          ))}
          <span className="muted">of {total === 1 && !p.open_total ? 0 : p.open_total} open, 24 h</span>
        </div>

        <hr className="divider" />
        <div className="action-grid">
          <button className="btn btn-primary" onClick={() => navigate("/simulator")}>
            <Play size={16} aria-hidden="true" /> Simulate attack
          </button>
          <button className="btn btn-secondary" onClick={doExport} disabled={exporting}>
            <Download size={16} aria-hidden="true" /> {exporting ? "Exporting…" : "Export CSV"}
          </button>
          <button className="btn btn-secondary" onClick={triageNext}>
            <UserCheck size={16} aria-hidden="true" /> Triage next
          </button>
          <button className="btn btn-secondary" onClick={() => navigate("/model")}>
            <Sparkles size={16} aria-hidden="true" /> Explain model
          </button>
        </div>
      </div>
    </div>
  );
}

function EntityList({ title, items, icon: Icon, hint, kind }) {
  const navigate = useNavigate();
  return (
    <div className="card">
      <div className="card-head">
        <h2 className="card-title">{title}</h2>
        <Link to="/alerts" className="icon-btn" style={{ width: 30, height: 30, border: 0 }} aria-label={`Open alerts (${title})`}>
          <MoreHorizontal size={16} />
        </Link>
      </div>
      <div className="table-wrap" style={{ paddingTop: 12, paddingBottom: 8, paddingLeft: 8, paddingRight: 8 }}>
        {items.length === 0 ? (
          <div className="empty" style={{ padding: "24px 12px" }}>
            <p>{hint}</p>
          </div>
        ) : (
          <table className="table table-compact table-rail">
            <thead>
              <tr>
                <th>{kind === "source" ? "Source" : "Asset"}</th>
                <th>Alerts</th>
                <th className="right">7d</th>
              </tr>
            </thead>
            <tbody>
              {items.slice(0, 5).map((e) => (
                <tr key={e.ip} className="row-link" onClick={() => navigate(`/alerts?q=${encodeURIComponent(e.ip)}`)}>
                  <td>
                    <div className="cell-main" style={{ gap: 10 }}>
                      {kind === "source" ? (
                        <AttackAvatar type={e.top_attack} size="sm" />
                      ) : (
                        <span className="atk-avatar atk-avatar-sm atk-NORMAL" aria-hidden="true">
                          <Icon size={13} />
                        </span>
                      )}
                      <div>
                        <div className="cell-title num" style={{ fontSize: 13 }}>{e.ip}</div>
                        <div className="cell-sub" title={`Peak risk score ${e.max_risk.toFixed(2)}`}>
                          {attackMeta(e.top_attack).short}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="num">{e.alerts}</td>
                  <td className="right">
                    <Delta value={e.delta_pct} polarity="up-bad" digits={0} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function ModelCard({ info }) {
  const acc = info?.metrics?.accuracy;
  return (
    <div className="card card-pad model-card">
      <div className="model-card-row">
        <span className="table-title-icon">
          <ShieldCheck size={16} aria-hidden="true" />
        </span>
        <div style={{ flex: 1 }}>
          <div className="card-title" style={{ fontSize: 14 }}>Detection model</div>
          <div className="card-sub">
            {info ? `${info.algorithm.replace(/_/g, " ")} · ${info.classes.length} classes` : "Loading…"}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div className="num" style={{ fontSize: 20, fontWeight: 500 }}>{acc != null ? `${(acc * 100).toFixed(1)}%` : "—"}</div>
          <div className="card-sub">test accuracy</div>
        </div>
      </div>
      <Link to="/model" className="btn btn-outline btn-sm btn-block" style={{ marginTop: 14 }}>
        Open Model Observatory <ArrowRight size={14} aria-hidden="true" />
      </Link>
    </div>
  );
}

function ActivityFeed({ items }) {
  const navigate = useNavigate();
  return (
    <div className="card">
      <div className="card-head">
        <div>
          <h2 className="card-title">Analyst activity</h2>
          <div className="card-sub">Verdicts on the model’s alerts</div>
        </div>
      </div>
      <div className="card-body">
        {!items || items.length === 0 ? (
          <div className="empty" style={{ padding: "26px 8px" }}>
            <h3>No verdicts yet</h3>
            <p>Confirm an attack or mark a false positive on any alert and it appears here.</p>
          </div>
        ) : (
          <ul className="feed">
            {items.map((f) => (
              <li key={f.id}>
                <button className="feed-item" onClick={() => navigate(`/alerts/${f.alert_id}`)}>
                  <AttackAvatar type={f.attack_type} size="sm" />
                  <span className="feed-body">
                    <span className="feed-title">
                      {f.is_true_positive ? "Confirmed attack" : "Marked false positive"}
                    </span>
                    <span className="feed-desc">
                      {f.user_name} · {attackMeta(f.attack_type).label}
                    </span>
                  </span>
                  <span className="feed-time num" title={formatTime(f.created_at)}>
                    {relativeTime(f.created_at)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function FirstRun({ canSeed }) {
  const navigate = useNavigate();
  const toast = useToast();
  const stream = useAlertStream();
  const [busy, setBusy] = useState(false);

  async function seed() {
    setBusy(true);
    try {
      const r = await api.backfill({ days: 30, per_day: 14, reset: true });
      toast?.push({ type: "success", title: `Loaded ${r.created} demo alerts`, message: "30 days of synthetic history." });
      stream?.bump();
    } catch (e) {
      toast?.push({ type: "critical", title: "Could not load demo history", message: e.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card first-run">
      <div>
        <h2 style={{ fontSize: 18 }}>Nothing detected yet</h2>
        <p className="muted" style={{ marginTop: 6, maxWidth: "58ch" }}>
          The model is running, but no attack has crossed the threshold. Fire a simulated attack to watch one alert
          travel the whole chain: classification, SHAP explanation, risk score, and your verdict.
        </p>
      </div>
      <div className="page-actions">
        <button className="btn btn-primary" onClick={() => navigate("/simulator")}>
          <Play size={16} aria-hidden="true" /> Open the Threat Simulator
        </button>
        {canSeed && (
          <button className="btn btn-outline" onClick={seed} disabled={busy}>
            {busy ? "Loading…" : "Load 30 days of demo history"}
          </button>
        )}
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const stream = useAlertStream();
  const overview = useAsync(() => api.getOverview(), [stream?.version]);
  const heatmap = useAsync(() => api.getHeatmap(182), [stream?.version]);
  const feedback = useAsync(() => api.getRecentFeedback(6), [stream?.version]);
  const modelInfo = useAsync(() => api.getModelInfo(), []);
  const o = overview.data;

  const greeting = user ? `Welcome back, ${user.name.split(" ")[0]}` : "Dashboard";

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>{greeting}</h1>
          <p>Live threat picture, ranked and explained by the model.</p>
        </div>
      </div>

      {overview.error && <div className="error-banner">{overview.error}</div>}

      <div className="dash">
        <div className="dash-main">
          {!o ? (
            <>
              <SkeletonKpis />
              <div className="mid-row">
                <SkeletonCard height={220} />
                <SkeletonCard height={260} />
              </div>
            </>
          ) : (
            <>
              {o.kpis.alerts.value === 0 && o.kpis.alerts.prev === 0 && o.top_sources.length === 0 && (
                <FirstRun canSeed={user?.role === "ADMIN"} />
              )}

              <div className="kpi-row">
                <KpiCard
                  title="New alerts"
                  sub="Detections · 7 days"
                  value={fmtInt(o.kpis.alerts.value)}
                  note="vs last week"
                  delta={<Delta value={o.kpis.alerts.delta_pct} polarity="up-bad" />}
                />
                <KpiCard
                  title="Critical alerts"
                  sub="Severity critical · 7 days"
                  value={fmtInt(o.kpis.critical.value)}
                  note="vs last week"
                  delta={<Delta value={o.kpis.critical.delta_pct} polarity="up-bad" />}
                />
                <KpiCard
                  title="Median time to triage"
                  sub={`Alert → verdict · ${o.kpis.triage_minutes.n} verdicts`}
                  value={duration(o.kpis.triage_minutes.value).value}
                  unit={duration(o.kpis.triage_minutes.value).unit}
                  note="vs last week"
                  delta={<Delta value={o.kpis.triage_minutes.delta_pct} polarity="up-bad" />}
                />
                <KpiCard
                  title="Confirmed precision"
                  sub={`Analyst verdicts · ${o.kpis.precision.n}`}
                  value={o.kpis.precision.value != null ? o.kpis.precision.value.toFixed(0) : "—"}
                  unit={o.kpis.precision.value != null ? "%" : undefined}
                  note="vs last week"
                  delta={<Delta value={o.kpis.precision.delta_pts} unit=" pt" polarity="up-good" digits={0} />}
                />
              </div>

              <div className="mid-row">
                <Leaders data={o.leaders} />
                <ThreatVolume kpiDelta={<Delta value={o.kpis.alerts.delta_pct} polarity="up-bad" />} />
              </div>
            </>
          )}

          <RecentAlerts />

          <div className="bottom-row">
            <div className="card">
              <div className="card-head">
                <div>
                  <h2 className="card-title">Risk calendar</h2>
                  <div className="card-sub">Daily alert volume, shaded by the day’s peak risk score</div>
                </div>
              </div>
              <div className="card-body">
                {heatmap.data ? <RiskHeatmap data={heatmap.data} weeks={26} /> : <SkeletonCard height={110} />}
              </div>
            </div>
            <ActivityFeed items={feedback.data} />
          </div>
        </div>

        <aside className="dash-rail" aria-label="Summary">
          {o ? (
            <ThreatPressure overview={o} onRefresh={overview.reload} refreshing={overview.loading} />
          ) : (
            <SkeletonCard height={260} />
          )}
          <EntityList
            title="Top threat sources"
            kind="source"
            icon={Target}
            items={o?.top_sources || []}
            hint="No attacking sources in the last 7 days."
          />
          <EntityList
            title="Most targeted assets"
            kind="target"
            icon={Server}
            items={o?.top_targets || []}
            hint="No targeted assets in the last 7 days."
          />
          <ModelCard info={modelInfo.data} />
        </aside>
      </div>
    </div>
  );
}

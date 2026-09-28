import { useEffect, useId, useMemo, useRef, useState } from "react";
import { parseTs } from "../lib/format";
import { attackMeta } from "../lib/meta";

const M = { top: 14, right: 14, bottom: 34, left: 34 };
// intervals whose worst alert scored this high get a marker on the baseline
export const PEAK_RISK = 0.9;

function niceMax(v) {
  if (v <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(v));
  const n = v / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}

// Monotone cubic (Fritsch-Carlson) so the line never overshoots the data.
function monotonePath(pts) {
  const n = pts.length;
  if (n < 2) return "";
  const dx = [];
  const m = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1][0] - pts[i][0]);
    m.push((pts[i + 1][1] - pts[i][1]) / (pts[i + 1][0] - pts[i][0] || 1));
  }
  const t = [m[0]];
  for (let i = 1; i < n - 1; i++) t.push(m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2);
  t.push(m[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) {
      t[i] = 0;
      t[i + 1] = 0;
    } else {
      const a = t[i] / m[i];
      const b = t[i + 1] / m[i];
      const s = a * a + b * b;
      if (s > 9) {
        const k = 3 / Math.sqrt(s);
        t[i] = k * a * m[i];
        t[i + 1] = k * b * m[i];
      }
    }
  }
  let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += ` C${(pts[i][0] + h).toFixed(1)} ${(pts[i][1] + t[i] * h).toFixed(1)} ${(pts[i + 1][0] - h).toFixed(1)} ${(
      pts[i + 1][1] -
      t[i + 1] * h
    ).toFixed(1)} ${pts[i + 1][0].toFixed(1)} ${pts[i + 1][1].toFixed(1)}`;
  }
  return d;
}

function xLabels(points, range) {
  const dates = points.map((p) => parseTs(p.t));
  const out = [];
  if (range === "24h") {
    dates.forEach((d, i) => {
      if (d.getHours() % 4 === 0) out.push({ i, text: `${String(d.getHours()).padStart(2, "0")}:00`, tick: true });
    });
  } else if (range === "7d") {
    // one centred weekday label per calendar day, with a divider at each day start
    let start = 0;
    for (let i = 1; i <= dates.length; i++) {
      if (i === dates.length || dates[i].toDateString() !== dates[start].toDateString()) {
        out.push({
          i: (start + i - 1) / 2,
          text: dates[start].toLocaleDateString(undefined, { weekday: "short" }),
          divider: start > 0 ? start - 0.5 : null,
        });
        start = i;
      }
    }
  } else {
    const every = range === "30d" ? 5 : 15;
    dates.forEach((d, i) => {
      if ((dates.length - 1 - i) % every === 0)
        out.push({ i, text: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }), tick: true });
    });
  }
  return out;
}

function tooltipTitle(p, range) {
  const d = parseTs(p.t);
  const day = d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  if (range === "30d" || range === "90d") return day;
  const end = new Date(d.getTime() + (range === "24h" ? 3600e3 : 6 * 3600e3));
  const hm = (x) => x.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
  return `${day} · ${hm(d)}–${hm(end)}`;
}

export default function TimeChart({ points, range, height = 260 }) {
  const wrapRef = useRef(null);
  const [width, setWidth] = useState(640);
  const [hover, setHover] = useState(null);
  const uid = useId().replace(/:/g, "");

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(280, entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const geo = useMemo(() => {
    const n = points.length;
    const plotW = width - M.left - M.right;
    const plotH = height - M.top - M.bottom;
    const yMax = niceMax(Math.max(...points.map((p) => p.count), 0));
    const xAt = (i) => M.left + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
    const yAt = (v) => M.top + plotH - (v / yMax) * plotH;
    const pts = points.map((p, i) => [xAt(i), yAt(p.count)]);
    return { n, plotW, plotH, yMax, xAt, yAt, pts, step: n > 1 ? plotW / (n - 1) : plotW };
  }, [points, width, height]);

  const labels = useMemo(() => xLabels(points, range), [points, range]);
  const line = useMemo(() => monotonePath(geo.pts), [geo.pts]);
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(f * geo.yMax));

  const total = points.reduce((a, p) => a + p.count, 0);
  const peak = points.reduce((a, p) => (p.count > a.count ? p : a), points[0] || { count: 0 });

  function indexFromEvent(e) {
    const rect = wrapRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const i = Math.round((x - M.left) / geo.step);
    return Math.min(Math.max(i, 0), geo.n - 1);
  }

  function onKeyDown(e) {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      setHover((h) => Math.min((h ?? restIdx ?? -1) + 1, geo.n - 1));
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      setHover((h) => Math.max((h ?? restIdx ?? geo.n) - 1, 0));
    } else if (e.key === "Home") setHover(0);
    else if (e.key === "End") setHover(geo.n - 1);
    else if (e.key === "Escape") setHover(null);
  }

  // at rest the crosshair sits on the busiest interval, so the chart always shows its own reading
  const restIdx = peak && peak.count > 0 ? points.indexOf(peak) : null;
  const active = hover ?? restIdx;
  const hp = active != null ? points[active] : null;
  const hx = active != null ? geo.xAt(active) : 0;
  const hy = active != null ? geo.yAt(points[active].count) : 0;
  const flip = hx > width * 0.62;
  const topTypes = hp
    ? Object.entries(hp.by_type)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
    : [];

  return (
    <div
      ref={wrapRef}
      className="tchart"
      style={{ height }}
      tabIndex={0}
      role="img"
      aria-label={`Alert volume, ${total} alerts in the selected range, peak of ${peak.count} in one interval. Use left and right arrow keys to inspect each interval.`}
      onMouseMove={(e) => setHover(indexFromEvent(e))}
      onMouseLeave={() => setHover(null)}
      onKeyDown={onKeyDown}
      onBlur={() => setHover(null)}
    >
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <defs>
          <pattern id={`hatch-${uid}`} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="7" stroke="var(--accent)" strokeOpacity="0.28" strokeWidth="2" />
          </pattern>
        </defs>

        {/* horizontal guides + y labels */}
        {yTicks.map((t) => (
          <g key={t}>
            <line x1={M.left} x2={width - M.right} y1={geo.yAt(t)} y2={geo.yAt(t)} stroke="var(--line)" strokeWidth="1" />
            <text x={M.left - 8} y={geo.yAt(t) + 4} textAnchor="end" className="tchart-y">
              {t}
            </text>
          </g>
        ))}

        {/* vertical guides */}
        {labels.map((l, k) =>
          l.divider != null ? (
            <line
              key={`d${k}`}
              x1={geo.xAt(l.divider)}
              x2={geo.xAt(l.divider)}
              y1={M.top}
              y2={height - M.bottom}
              stroke="var(--line)"
              strokeWidth="1"
            />
          ) : l.tick ? (
            <line
              key={`t${k}`}
              x1={geo.xAt(l.i)}
              x2={geo.xAt(l.i)}
              y1={M.top}
              y2={height - M.bottom}
              stroke="var(--line)"
              strokeWidth="1"
              strokeDasharray="2 4"
            />
          ) : null
        )}

        {/* hover band */}
        {hp && (
          <g>
            <rect
              x={hx - geo.step / 2}
              y={M.top}
              width={geo.step}
              height={geo.plotH}
              fill="var(--accent-soft)"
            />
            <rect
              x={hx - geo.step / 2}
              y={M.top}
              width={geo.step}
              height={geo.plotH}
              fill={`url(#hatch-${uid})`}
            />
            <line x1={hx} x2={hx} y1={M.top} y2={height - M.bottom} stroke="var(--accent)" strokeWidth="1.5" strokeDasharray="3 3" />
          </g>
        )}

        {/* series */}
        <path d={line} fill="none" stroke="var(--accent)" strokeWidth="2.25" strokeLinecap="round" className="tchart-line" />

        {/* peak-risk buckets: a diamond on the baseline, so the worst moments are findable without hovering */}
        {points.map((p, i) =>
          p.max_risk >= PEAK_RISK ? (
            <path
              key={i}
              d={`M${geo.xAt(i)} ${height - M.bottom - 12} l4 4 l-4 4 l-4 -4 z`}
              fill="var(--sev-critical)"
            />
          ) : null
        )}

        {hp && <circle cx={hx} cy={hy} r="5" fill="var(--surface)" stroke="var(--accent)" strokeWidth="2.5" />}

        {/* x labels */}
        {labels.map((l, k) => (
          <text key={`x${k}`} x={geo.xAt(l.i)} y={height - 10} textAnchor="middle" className="tchart-x">
            {l.text}
          </text>
        ))}
      </svg>

      {hp && (
        <div
          className="tchart-tip"
          style={{
            left: flip ? "auto" : hx + 16,
            right: flip ? width - hx + 16 : "auto",
            // hovering follows the pointer; at rest the panel sits below the peak so the maximum itself stays visible
            top: hover == null ? Math.min(hy + 14, height - 150) : Math.max(4, Math.min(hy - 48, height - 150)),
          }}
        >
          <div className="tchart-tip-title">{tooltipTitle(hp, range)}</div>
          <div className="tchart-tip-value">
            {hp.count} <span>alert{hp.count === 1 ? "" : "s"}</span>
          </div>
          <div className="tchart-tip-row">
            <i style={{ background: hp.max_risk >= PEAK_RISK ? "var(--sev-critical)" : "var(--accent)" }} />
            Peak risk {hp.max_risk.toFixed(2)}
          </div>
          {topTypes.map(([type, n]) => (
            <div className="tchart-tip-row" key={type}>
              <i style={{ background: `var(${attackMeta(type).cssVar})` }} />
              {attackMeta(type).short} · {n}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

import { useMemo, useState } from "react";

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""];
const CELL = 14;
const GAP = 4;

function bucket(entry) {
  if (!entry || entry.count === 0) return 0;
  const score = entry.max_risk_score ?? 0;
  if (score >= 0.8) return 4;
  if (score >= 0.6) return 3;
  if (score >= 0.4) return 2;
  return 1;
}

const BUCKET_COLORS = ["var(--surface-3)", "var(--heat-1)", "var(--heat-2)", "var(--heat-3)", "var(--heat-4)"];
const BUCKET_NAMES = ["No alerts", "Peak risk below 0.4", "Peak risk 0.4 to 0.6", "Peak risk 0.6 to 0.8", "Peak risk 0.8 or higher"];

// The API buckets alerts by UTC calendar day, so the grid is built in UTC too;
// mixing local midnights with UTC keys would shift cells by a day east of GMT.
const dayKey = (d) => d.toISOString().slice(0, 10);

/** Mon-start grid of `weeks` columns ending this week, GitHub-contributions style. */
function buildWeeks(byDate, weeks) {
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const dow = (today.getUTCDay() + 6) % 7; // 0 = Monday
  const gridEnd = new Date(today);
  gridEnd.setUTCDate(today.getUTCDate() + (6 - dow));
  const gridStart = new Date(gridEnd);
  gridStart.setUTCDate(gridEnd.getUTCDate() - weeks * 7 + 1);

  const columns = [];
  const cursor = new Date(gridStart);
  for (let w = 0; w < weeks; w++) {
    const col = [];
    for (let d = 0; d < 7; d++) {
      const key = dayKey(cursor);
      col.push({ date: key, inFuture: cursor > today, entry: byDate[key], month: cursor.getUTCMonth() });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    columns.push(col);
  }
  return columns;
}

export default function RiskHeatmap({ data, weeks = 13 }) {
  const [hover, setHover] = useState(null);

  const byDate = useMemo(() => {
    const map = {};
    for (const d of data || []) map[d.date] = d;
    return map;
  }, [data]);

  const columns = useMemo(() => buildWeeks(byDate, weeks), [byDate, weeks]);

  const monthMarkers = useMemo(() => {
    const markers = {};
    let last = null;
    let lastCol = -10;
    columns.forEach((col, i) => {
      if (col[0].month !== last) {
        // a 3-letter label is about three cells wide: skip one that would touch the previous
        if (i - lastCol >= 3) {
          markers[i] = MONTH_NAMES[col[0].month];
          lastCol = i;
        }
        last = col[0].month;
      }
    });
    return markers;
  }, [columns]);

  const total = (data || []).reduce((a, d) => a + d.count, 0);

  function show(e, cell) {
    const rect = e.currentTarget.getBoundingClientRect();
    setHover({ x: rect.left + rect.width / 2, y: rect.top, cell });
  }

  return (
    <div>
      <div className="heat-scroll">
        <div className="heat" role="img" aria-label={`Risk calendar: ${total} alerts over the last ${weeks} weeks`}>
          <div className="heat-days" style={{ gridTemplateRows: `repeat(7, ${CELL}px)`, gap: GAP }}>
            {DAY_LABELS.map((l, i) => (
              <span key={i} style={{ height: CELL, lineHeight: `${CELL}px` }}>
                {l}
              </span>
            ))}
          </div>
          <div>
            <div className="heat-months" style={{ gridTemplateColumns: `repeat(${weeks}, ${CELL}px)`, gap: GAP }}>
              {columns.map((_, i) => (
                <span key={i}>{monthMarkers[i] || ""}</span>
              ))}
            </div>
            <div
              className="heat-grid"
              style={{ gridTemplateRows: `repeat(7, ${CELL}px)`, gridAutoColumns: `${CELL}px`, gap: GAP }}
            >
              {columns.map((col, ci) =>
                col.map((cell, di) => (
                  <span
                    key={`${ci}-${di}`}
                    className="heat-cell"
                    style={{
                      background: cell.inFuture ? "transparent" : BUCKET_COLORS[bucket(cell.entry)],
                      cursor: cell.entry ? "pointer" : "default",
                    }}
                    onMouseEnter={(e) => cell.entry && show(e, cell)}
                    onMouseLeave={() => setHover(null)}
                  />
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="heat-legend">
        <span>Quiet</span>
        {BUCKET_COLORS.map((c, i) => (
          <span key={i} className="heat-cell" style={{ background: c, width: 12, height: 12 }} title={BUCKET_NAMES[i]} />
        ))}
        <span>Severe</span>
      </div>

      {hover && (
        <div className="heat-tip" style={{ left: hover.x, top: hover.y }}>
          <strong className="num">
            {hover.cell.entry.count} alert{hover.cell.entry.count === 1 ? "" : "s"}
          </strong>
          <span>
            {new Date(`${hover.cell.date}T00:00:00Z`).toLocaleDateString(undefined, {
              weekday: "short",
              month: "short",
              day: "numeric",
              timeZone: "UTC",
            })}
          </span>
          <span>Peak risk {hover.cell.entry.max_risk_score.toFixed(2)}</span>
        </div>
      )}
    </div>
  );
}

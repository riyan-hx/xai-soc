export function Skeleton({ width, height = 14, style, className = "" }) {
  return (
    <span
      className={`skeleton ${className}`}
      style={{ width, height, ...style }}
      aria-hidden="true"
    />
  );
}

export function SkeletonRows({ rows = 6, cols = 6 }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r}>
          {Array.from({ length: cols }).map((__, c) => (
            <td key={c}>
              <Skeleton width={c === 0 ? 28 : `${55 + ((r + c) % 4) * 9}%`} height={c === 0 ? 28 : 12} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export function SkeletonKpis({ count = 4 }) {
  return (
    <div className="kpi-row">
      {Array.from({ length: count }).map((_, i) => (
        <div className="card kpi" key={i}>
          <Skeleton width="45%" height={13} style={{ marginBottom: 8 }} />
          <Skeleton width="30%" height={10} style={{ marginBottom: 18 }} />
          <Skeleton width="62%" height={26} style={{ marginBottom: 14 }} />
          <Skeleton width="50%" height={12} />
        </div>
      ))}
    </div>
  );
}

export function SkeletonCard({ height = 240 }) {
  return (
    <div className="card card-pad">
      <Skeleton width="34%" height={14} style={{ marginBottom: 16 }} />
      <Skeleton width="100%" height={height} className="skeleton-block" />
    </div>
  );
}

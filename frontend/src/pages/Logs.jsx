import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";
import { SkeletonRows } from "../components/Skeleton";
import { fmtInt, formatTime, shortId } from "../lib/format";

const PAGE_SIZE = 25;
const KIND_PILL = { VERDICT: "pill-pos", STATUS: "pill-info", ASSIGN: "pill-info", NOTE: "" };

export default function Logs() {
  const [users, setUsers] = useState([]);
  const [userId, setUserId] = useState("");
  const [alertId, setAlertId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(0);
  const [logs, setLogs] = useState(null);
  const [count, setCount] = useState(0);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.userDirectory().then(setUsers).catch(() => {});
  }, []);

  useEffect(() => {
    setLogs(null);
    setError(null);
    api
      .listLogs({
        user_id: userId,
        alert_id: alertId.trim(),
        date_from: dateFrom ? new Date(dateFrom).toISOString() : "",
        date_to: dateTo ? new Date(dateTo).toISOString() : "",
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      })
      .then((res) => {
        setLogs(res.items);
        setCount(res.total);
      })
      .catch((e) => setError(e.message));
  }, [userId, alertId, dateFrom, dateTo, page]);

  const maxPage = Math.max(0, Math.ceil(count / PAGE_SIZE) - 1);

  function resetPage(setter) {
    return (e) => {
      setter(e.target.value);
      setPage(0);
    };
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Audit log</h1>
          <p>Every status change, assignment, verdict and note recorded across all alerts.</p>
        </div>
      </div>

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="filter-row" style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div className="field" style={{ minWidth: 180 }}>
            <label htmlFor="log-user">User</label>
            <select id="log-user" className="select" value={userId} onChange={resetPage(setUserId)}>
              <option value="">All users</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>
          <div className="field" style={{ minWidth: 160 }}>
            <label htmlFor="log-alert">Alert ID</label>
            <input id="log-alert" className="input" value={alertId} onChange={resetPage(setAlertId)} placeholder="Filter by alert…" />
          </div>
          <div className="field">
            <label htmlFor="log-from">From</label>
            <input id="log-from" className="input" type="date" value={dateFrom} onChange={resetPage(setDateFrom)} />
          </div>
          <div className="field">
            <label htmlFor="log-to">To</label>
            <input id="log-to" className="input" type="date" value={dateTo} onChange={resetPage(setDateTo)} />
          </div>
        </div>
      </div>

      {error && <div className="error-banner" style={{ marginBottom: 16 }}>{error}</div>}

      <div className="card">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Time</th>
                <th>User</th>
                <th>Action</th>
                <th>Detail</th>
                <th>Alert</th>
              </tr>
            </thead>
            <tbody>
              {logs === null && <SkeletonRows rows={8} cols={5} />}
              {logs?.length === 0 && (
                <tr>
                  <td colSpan={5}>
                    <div className="empty" style={{ padding: "28px 16px" }}>
                      <h3>No matching activity</h3>
                      <p>Try widening the filters above.</p>
                    </div>
                  </td>
                </tr>
              )}
              {logs?.map((l) => (
                <tr key={l.id}>
                  <td className="num" title={formatTime(l.created_at)}>{formatTime(l.created_at)}</td>
                  <td>{l.user_name || "System"}</td>
                  <td><span className={`pill ${KIND_PILL[l.kind] || ""}`}>{l.kind}</span></td>
                  <td className="cell-sub">{l.body || "—"}</td>
                  <td>
                    <Link to={`/alerts/${l.alert_id}`} className="num">{shortId(l.alert_id)}</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {logs !== null && count > 0 && (
        <div className="pagination">
          <span className="muted num">
            {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, count)} of {fmtInt(count)} entries
          </span>
          <div className="page-actions">
            <button className="btn btn-outline btn-sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
              Previous
            </button>
            <button className="btn btn-outline btn-sm" disabled={page >= maxPage} onClick={() => setPage((p) => Math.min(maxPage, p + 1))}>
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

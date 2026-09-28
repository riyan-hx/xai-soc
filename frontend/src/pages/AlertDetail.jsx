import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Check, ChevronDown, ChevronUp, Info, X } from "lucide-react";
import { api } from "../api/client";
import { useAuth } from "../api/auth";
import { useToast } from "../components/Toast";
import { useAlertStream } from "../stream/AlertStream";
import { useAsync } from "../lib/useAsync";
import { isTypingTarget } from "../lib/keyboard";
import { STATUSES, STATUS_META, attackMeta, riskColor } from "../lib/meta";
import { fmtPct, formatDateLong, formatTime, relativeTime, shortId } from "../lib/format";
import { AttackAvatar, OriginPill, PriorityTag, RiskBar, SeverityPill, StatusPill } from "../components/Badges";
import ShapBars from "../components/ShapBars";
import WhatIfLab from "../components/WhatIfLab";
import Playbook from "../components/Playbook";
import Timeline from "../components/Timeline";
import { SkeletonCard } from "../components/Skeleton";

export default function AlertDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const toast = useToast();
  const stream = useAlertStream();
  const canTriage = user?.role === "ANALYST" || user?.role === "ADMIN";

  const [alert, setAlert] = useState(null);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const events = useAsync(() => api.getEvents(id), [id]);
  const directory = useAsync(() => api.userDirectory(), []);
  const related = useAsync(() => (alert ? api.listAlerts({ source_ip: alert.source_ip, limit: 7 }) : Promise.resolve(null)), [alert?.source_ip]);

  const orderedIds = location.state?.orderedIds;
  const currentIndex = orderedIds ? orderedIds.indexOf(id) : -1;
  const prevId = orderedIds && currentIndex > 0 ? orderedIds[currentIndex - 1] : null;
  const nextId = orderedIds && currentIndex >= 0 && currentIndex < orderedIds.length - 1 ? orderedIds[currentIndex + 1] : null;

  useEffect(() => {
    setAlert(null);
    setError(null);
    api.getAlert(id).then(setAlert).catch((e) => setError(e.message));
  }, [id]);

  const patch = useCallback(
    async (changes, successTitle) => {
      try {
        const updated = await api.updateAlert(id, changes);
        setAlert((a) => ({ ...a, ...updated }));
        events.reload();
        stream?.bump();
        if (successTitle) toast?.push({ type: "success", title: successTitle });
      } catch (e) {
        toast?.push({ type: "critical", title: "Could not update the case", message: e.message });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id, events.reload]
  );

  const sendFeedback = useCallback(
    async (isTruePositive) => {
      if (submitting) return;
      setSubmitting(true);
      try {
        const res = await api.submitFeedback(id, isTruePositive);
        setAlert((a) => ({ ...a, status: res.status }));
        events.reload();
        stream?.bump();
        toast?.push({ type: "success", title: isTruePositive ? "Confirmed as a real attack" : "Marked as a false positive" });
      } catch (e) {
        toast?.push({ type: "critical", title: "Verdict was not saved", message: e.message });
      } finally {
        setSubmitting(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id, submitting, events.reload]
  );

  function goTo(targetId) {
    if (!targetId) return;
    navigate(`/alerts/${targetId}`, { state: { orderedIds, index: orderedIds.indexOf(targetId) } });
  }

  useEffect(() => {
    function onKeyDown(e) {
      if (e.metaKey || e.ctrlKey || isTypingTarget(e.target)) return;
      if (e.key === "Escape") navigate("/alerts");
      else if (e.key === "j" && nextId) goTo(nextId);
      else if (e.key === "k" && prevId) goTo(prevId);
      else if (e.key === "c" && canTriage && alert) sendFeedback(true);
      else if (e.key === "f" && canTriage && alert) sendFeedback(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextId, prevId, canTriage, alert, sendFeedback]);

  if (error) {
    return (
      <div>
        <Link to="/alerts" className="back-link"><ArrowLeft size={15} /> Alert queue</Link>
        <div className="error-banner" style={{ marginTop: 16 }}>{error}</div>
      </div>
    );
  }

  if (!alert) {
    return (
      <div>
        <div className="skeleton" style={{ width: 120, height: 14, marginBottom: 20 }} />
        <SkeletonCard height={90} />
        <div className="detail-grid" style={{ marginTop: 20 }}>
          <SkeletonCard height={340} />
          <SkeletonCard height={340} />
        </div>
      </div>
    );
  }

  const meta = attackMeta(alert.attack_type);
  const features = alert.explanation?.important_features || [];
  const others = (related.data?.items || []).filter((a) => a.id !== alert.id).slice(0, 5);

  return (
    <div>
      <div className="detail-nav">
        <Link to="/alerts" className="back-link">
          <ArrowLeft size={15} aria-hidden="true" /> Alert queue
        </Link>
        {orderedIds && (
          <div className="detail-pager">
            <button className="icon-btn" style={{ width: 32, height: 32 }} disabled={!prevId} onClick={() => goTo(prevId)} aria-label="Previous alert (K)" title="Previous (K)">
              <ChevronUp size={15} />
            </button>
            <span className="num muted" style={{ fontSize: 12.5 }}>{currentIndex + 1} of {orderedIds.length}</span>
            <button className="icon-btn" style={{ width: 32, height: 32 }} disabled={!nextId} onClick={() => goTo(nextId)} aria-label="Next alert (J)" title="Next (J)">
              <ChevronDown size={15} />
            </button>
          </div>
        )}
      </div>

      <div className="card hero">
        <div className="hero-id">
          <AttackAvatar type={alert.attack_type} size="lg" />
          <div style={{ minWidth: 0 }}>
            <div className="hero-title">
              <h1>{meta.label}</h1>
              <SeverityPill severity={alert.severity} />
              <StatusPill status={alert.status} />
              <OriginPill origin={alert.origin} />
            </div>
            <div className="hero-sub num">
              {alert.source_ip} → {alert.dest_ip}
              <span className="muted"> · alert {shortId(alert.alert_id)} · detected {relativeTime(alert.timestamp)}</span>
            </div>
          </div>
        </div>
        <div className="hero-stats">
          <div>
            <div className="hero-stat-label">Risk score</div>
            <div className="hero-stat-value num" style={{ color: riskColor(alert.risk_score) }}>
              {alert.risk_score?.toFixed(2)}
            </div>
          </div>
          <div>
            <div className="hero-stat-label">Priority</div>
            <div className="hero-stat-value num"><PriorityTag priority={alert.priority} /></div>
          </div>
          <div>
            <div className="hero-stat-label">Model confidence</div>
            <div className="hero-stat-value num">{fmtPct(alert.confidence, 1)}</div>
          </div>
        </div>
      </div>

      <div className="detail-grid">
        <div className="detail-main">
          <section className="card" aria-labelledby="why-h">
            <div className="card-head">
              <div>
                <h2 className="card-title" id="why-h">Why the model flagged this</h2>
                <div className="card-sub">SHAP attribution for the predicted class, strongest drivers first</div>
              </div>
            </div>
            <div className="card-body">
              <p className="reason">{alert.description}</p>
              {features.length ? (
                <ShapBars features={features} rawValues={alert.features} attackLabel={meta.label} />
              ) : (
                <div className="note-banner"><Info size={14} /> No explanation was stored for this alert.</div>
              )}
              <p className="field-hint" style={{ marginTop: 14 }}>
                Each bar is one measurement’s contribution to the verdict, computed exactly for this flow. The number beside a
                name is the measured value in the flow’s own units. Hover a name for what it means.
              </p>
            </div>
          </section>

          <section className="card" aria-labelledby="wi-h">
            <div className="card-head">
              <div>
                <h2 className="card-title" id="wi-h">What-if lab</h2>
                <div className="card-sub">Change a measurement and the real model re-decides. Nothing is saved.</div>
              </div>
            </div>
            <div className="card-body">
              {Object.keys(alert.features || {}).length ? (
                <WhatIfLab alert={alert} />
              ) : (
                <div className="note-banner"><Info size={14} /> This alert has no stored feature vector to edit.</div>
              )}
            </div>
          </section>

          <section className="card" aria-labelledby="pb-h">
            <div className="card-head">
              <div>
                <h2 className="card-title" id="pb-h">Response playbook</h2>
                <div className="card-sub">{alert.playbook?.title}</div>
              </div>
            </div>
            <div className="card-body">
              <Playbook alertId={alert.id} techniques={alert.techniques || []} playbook={alert.playbook} />
            </div>
          </section>
        </div>

        <aside className="detail-aside">
          <section className="card card-pad" aria-label="Case">
            <h2 className="card-title" style={{ marginBottom: 12 }}>Case</h2>

            <div className="field">
              <label htmlFor="case-status">Status</label>
              <select
                id="case-status"
                className="select"
                value={alert.status}
                disabled={!canTriage}
                onChange={(e) => patch({ status: e.target.value }, `Status set to ${STATUS_META[e.target.value].label}`)}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{STATUS_META[s].label}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="case-assignee">Assignee</label>
              <select
                id="case-assignee"
                className="select"
                value={alert.assignee_id || ""}
                disabled={!canTriage}
                onChange={(e) => patch({ assignee_id: e.target.value }, e.target.value ? "Case assigned" : "Case unassigned")}
              >
                <option value="">Unassigned</option>
                {(directory.data || []).map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>

            {canTriage ? (
              <div className="triage-actions">
                <button className="btn btn-good" onClick={() => sendFeedback(true)} disabled={submitting}>
                  <Check size={15} aria-hidden="true" /> Confirm attack <kbd>C</kbd>
                </button>
                <button className="btn btn-danger" onClick={() => sendFeedback(false)} disabled={submitting}>
                  <X size={15} aria-hidden="true" /> False positive <kbd>F</kbd>
                </button>
              </div>
            ) : (
              <div className="note-banner" style={{ marginTop: 16 }}>
                <Info size={14} aria-hidden="true" /> Viewer role: triage actions are limited to analysts and admins.
              </div>
            )}

            <hr className="divider" />
            <div className="kv"><span className="k">Source</span><span className="v num">{alert.source_ip}</span></div>
            <div className="kv"><span className="k">Destination</span><span className="v num">{alert.dest_ip}</span></div>
            <div className="kv"><span className="k">Risk score</span><span className="v"><RiskBar score={alert.risk_score} /></span></div>
            <div className="kv"><span className="k">Detected</span><span className="v num" title={formatDateLong(alert.timestamp)}>{formatTime(alert.timestamp)}</span></div>
            {alert.updated_at && (
              <div className="kv"><span className="k">Last updated</span><span className="v num">{relativeTime(alert.updated_at)}</span></div>
            )}
          </section>

          <section className="card card-pad" aria-label="Activity">
            <h2 className="card-title" style={{ marginBottom: 12 }}>Activity</h2>
            <Timeline
              events={events.data || []}
              canWrite={canTriage}
              onAddNote={async (body) => {
                try {
                  await api.addNote(id, body);
                  events.reload();
                } catch (e) {
                  toast?.push({ type: "critical", title: "Note was not saved", message: e.message });
                  throw e;
                }
              }}
            />
          </section>

          <section className="card card-pad" aria-label="Related alerts">
            <h2 className="card-title" style={{ marginBottom: 4 }}>Same source</h2>
            <div className="card-sub" style={{ marginBottom: 8 }}>Other alerts from {alert.source_ip}</div>
            {others.length === 0 ? (
              <p className="muted" style={{ fontSize: 13 }}>No other alerts from this address.</p>
            ) : (
              <ul className="related">
                {others.map((a) => (
                  <li key={a.id}>
                    <Link to={`/alerts/${a.id}`}>
                      <AttackAvatar type={a.attack_type} size="sm" />
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span className="cell-title" style={{ fontSize: 13 }}>{attackMeta(a.attack_type).label}</span>
                        <span className="cell-sub" style={{ display: "block" }}>{relativeTime(a.timestamp)}</span>
                      </span>
                      <SeverityPill severity={a.severity} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

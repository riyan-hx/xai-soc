import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  BookmarkPlus,
  Check,
  ChevronsUpDown,
  Inbox,
  Layers,
  LayoutList,
  Search,
  UserRound,
  X,
} from "lucide-react";
import { api } from "../api/client";
import { useAuth } from "../api/auth";
import { useToast } from "../components/Toast";
import { useAlertStream } from "../stream/AlertStream";
import { isTypingTarget } from "../lib/keyboard";
import { loadSavedViews, saveView, deleteView } from "../lib/savedViews";
import { ATTACK_TYPES, attackMeta, OPEN_STATUSES, SEVERITIES, SEVERITY_META } from "../lib/meta";
import { fmtInt, fmtPct, formatTime, relativeTime } from "../lib/format";
import { AttackAvatar, AttackCell, OriginPill, PriorityTag, RiskBar, SeverityPill, StatusPill } from "../components/Badges";
import { ShapGlyph } from "../components/Sparkline";
import Seg from "../components/Seg";
import { SkeletonRows } from "../components/Skeleton";

const PAGE_SIZE = 20;
const CLOSED_STATUSES = ["RESOLVED", "FALSE_POSITIVE"];
const SCOPES = [
  { value: "open", label: "Open" },
  { value: "all", label: "All" },
  { value: "closed", label: "Closed" },
];
const SCOPE_STATUS = { open: OPEN_STATUSES, all: [], closed: CLOSED_STATUSES };

function Chip({ active, onClick, children, dot }) {
  return (
    <button type="button" className="chip" aria-pressed={active} onClick={onClick}>
      {dot && <span className="atk-dot" style={{ background: dot }} aria-hidden="true" />}
      {children}
    </button>
  );
}

export default function AlertList() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useAuth();
  const canTriage = user?.role === "ANALYST" || user?.role === "ADMIN";
  const [view, setView] = useState(() => localStorage.getItem("xai-soc-alert-view") || "flat");
  const [scope, setScope] = useState("open");
  const [attackTypes, setAttackTypes] = useState([]);
  const [severities, setSeverities] = useState([]);
  const [search, setSearch] = useState(() => searchParams.get("q") || "");
  const [page, setPage] = useState(0);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [selected, setSelected] = useState(() => new Set());
  const [savedViews, setSavedViews] = useState(loadSavedViews);
  const [savingView, setSavingView] = useState(false);
  const [viewName, setViewName] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [precision, setPrecision] = useState(null);

  const [alerts, setAlerts] = useState([]);
  const [total, setTotal] = useState(0);
  const [groups, setGroups] = useState([]);
  const [groupTotal, setGroupTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const searchRef = useRef(null);
  const rowRefs = useRef([]);
  const navigate = useNavigate();
  const toast = useToast();
  const stream = useAlertStream();

  useEffect(() => {
    api.getOverview().then((o) => setPrecision(o.kpis.precision)).catch(() => {});
  }, [stream?.version]);

  useEffect(() => {
    stream?.markSeen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Consume a one-off ?q= (from the palette or a rail link), then drop it from
  // the URL so the search box, not the address bar, stays the source of truth.
  useEffect(() => {
    if (searchParams.get("q")) {
      setScope("all");
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    localStorage.setItem("xai-soc-alert-view", view);
  }, [view]);

  const filters = useMemo(
    () => ({
      attack_type: attackTypes,
      severity: severities,
      status: SCOPE_STATUS[scope],
      q: search.trim(),
    }),
    [attackTypes, severities, scope, search]
  );

  useEffect(() => {
    setLoading(true);
    setError(null);
    const request =
      view === "flat"
        ? api.listAlerts({ ...filters, limit: PAGE_SIZE, offset: page * PAGE_SIZE }).then((res) => {
            setAlerts(res.items);
            setTotal(res.total);
            setFocusedIndex((i) => Math.min(i, Math.max(res.items.length - 1, 0)));
          })
        : api.listAlertsGrouped({ ...filters, limit: PAGE_SIZE, offset: page * PAGE_SIZE }).then((res) => {
            setGroups(res.items);
            setGroupTotal(res.total);
          });
    request.catch((e) => setError(e.message)).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, page, view, stream?.version]);

  // selection never outlives the rows it refers to
  useEffect(() => setSelected(new Set()), [filters, page, view]);

  const reset = () => setPage(0);
  const toggleIn = (setter) => (v) => {
    reset();
    setter((cur) => (cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]));
  };

  function clearFilters() {
    reset();
    setAttackTypes([]);
    setSeverities([]);
    setSearch("");
    setScope("open");
  }

  function openAlert(alert, index) {
    navigate(`/alerts/${alert.id}`, { state: { orderedIds: alerts.map((a) => a.id), index } });
  }

  function openGroup(group) {
    reset();
    setView("flat");
    setScope("all");
    setAttackTypes([group.attack_type]);
    setSearch(group.source_ip || "");
  }

  function handleSaveView(e) {
    e.preventDefault();
    if (!viewName.trim()) return;
    setSavedViews(saveView(viewName.trim(), { attackTypes, severities, search, scope }));
    toast?.push({ type: "success", title: `Saved view “${viewName.trim()}”` });
    setViewName("");
    setSavingView(false);
  }

  function applySavedView(v) {
    reset();
    setAttackTypes(v.filters.attackTypes || []);
    setSeverities(v.filters.severities || []);
    setSearch(v.filters.search || "");
    setScope(v.filters.scope || "all");
  }

  function toggleSelect(id) {
    setSelected((cur) => {
      const next = new Set(cur);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function bulk(action) {
    const ids = [...selected];
    setBulkBusy(true);
    try {
      if (action === "assign") {
        await Promise.all(ids.map((id) => api.updateAlert(id, { assignee_id: user.id, status: "INVESTIGATING" })));
        toast?.push({ type: "success", title: `Assigned ${ids.length} to you` });
      } else {
        const isTp = action === "confirm";
        await Promise.all(ids.map((id) => api.submitFeedback(id, isTp)));
        toast?.push({
          type: "success",
          title: `${isTp ? "Confirmed" : "Dismissed"} ${ids.length} alert${ids.length === 1 ? "" : "s"}`,
        });
      }
      setSelected(new Set());
      stream?.bump();
    } catch (e) {
      toast?.push({ type: "critical", title: "Some updates failed", message: e.message });
    } finally {
      setBulkBusy(false);
    }
  }

  // Keyboard triage: j/k move, Enter opens, x selects, / focuses search.
  useEffect(() => {
    if (view !== "flat") return undefined;
    function onKeyDown(e) {
      if (e.metaKey || e.ctrlKey || isTypingTarget(e.target)) return;
      if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (!alerts.length) return;
      const move = (delta) =>
        setFocusedIndex((i) => {
          const next = Math.min(Math.max(i + delta, 0), alerts.length - 1);
          rowRefs.current[next]?.scrollIntoView({ block: "nearest" });
          return next;
        });
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        move(1);
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        move(-1);
      } else if (e.key === "Enter") {
        e.preventDefault();
        openAlert(alerts[focusedIndex], focusedIndex);
      } else if ((e.key === "x" || e.key === "X") && canTriage) {
        toggleSelect(alerts[focusedIndex].id);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, alerts, focusedIndex, canTriage]);

  const count = view === "flat" ? total : groupTotal;
  const maxPage = Math.max(0, Math.ceil(count / PAGE_SIZE) - 1);
  const activeFilterCount = attackTypes.length + severities.length + (search.trim() ? 1 : 0) + (scope !== "open" ? 1 : 0);
  const allSelected = alerts.length > 0 && alerts.every((a) => selected.has(a.id));

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Alert queue</h1>
          <p>
            Ranked by risk score. Press <kbd>J</kbd> <kbd>K</kbd> to move, <kbd>Enter</kbd> to open, <kbd>X</kbd> to
            select.
          </p>
        </div>
        <div className="page-actions">
          <Seg
            label="View"
            size="lg"
            value={view}
            onChange={(v) => {
              reset();
              setView(v);
            }}
            options={[
              { value: "flat", label: "Queue", icon: LayoutList },
              { value: "grouped", label: "Campaigns", icon: Layers },
            ]}
          />
        </div>
      </div>

      <div className="card filters">
        <div className="filters-row">
          <div className="search-field" style={{ flex: "1 1 280px", maxWidth: 420 }}>
            <Search size={16} aria-hidden="true" />
            <input
              ref={searchRef}
              className="input"
              placeholder="Search source or destination IP, or the reason… (press /)"
              aria-label="Search alerts"
              value={search}
              onChange={(e) => {
                reset();
                setSearch(e.target.value);
              }}
            />
          </div>
          <Seg label="Case scope" value={scope} onChange={(v) => { reset(); setScope(v); }} options={SCOPES} />
          <div className="filters-actions">
            {activeFilterCount > 0 && (
              <button className="btn btn-ghost btn-sm" onClick={clearFilters}>
                <X size={14} aria-hidden="true" /> Reset ({activeFilterCount})
              </button>
            )}
            {!savingView ? (
              <button className="btn btn-outline btn-sm" onClick={() => setSavingView(true)}>
                <BookmarkPlus size={14} aria-hidden="true" /> Save view
              </button>
            ) : (
              <form className="filters-actions" onSubmit={handleSaveView}>
                <input
                  className="input input-sm"
                  style={{ width: 150 }}
                  autoFocus
                  placeholder="View name"
                  aria-label="View name"
                  value={viewName}
                  onChange={(e) => setViewName(e.target.value)}
                  onKeyDown={(e) => e.key === "Escape" && setSavingView(false)}
                />
                <button type="submit" className="btn btn-primary btn-sm">Save</button>
              </form>
            )}
          </div>
        </div>
        <div className="filters-row">
          <div className="chip-row" role="group" aria-label="Attack type">
            {ATTACK_TYPES.map((t) => (
              <Chip key={t} active={attackTypes.includes(t)} onClick={() => toggleIn(setAttackTypes)(t)} dot={`var(${attackMeta(t).cssVar})`}>
                {attackMeta(t).label}
              </Chip>
            ))}
          </div>
          <span className="filters-sep" aria-hidden="true" />
          <div className="chip-row" role="group" aria-label="Severity">
            {SEVERITIES.map((s) => (
              <Chip key={s} active={severities.includes(s)} onClick={() => toggleIn(setSeverities)(s)} dot={SEVERITY_META[s].color}>
                {SEVERITY_META[s].label}
              </Chip>
            ))}
          </div>
        </div>
        {savedViews.length > 0 && (
          <div className="filters-row">
            <span className="muted" style={{ fontSize: 12 }}>Saved views</span>
            {savedViews.map((v) => (
              <span key={v.name} className="saved-chip">
                <button onClick={() => applySavedView(v)}>{v.name}</button>
                <button aria-label={`Delete view ${v.name}`} onClick={() => setSavedViews(deleteView(v.name))}>
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>

      {precision?.value != null && (
        <p className="field-hint" style={{ marginTop: 12 }}>
          Analysts confirmed {precision.value.toFixed(0)}% of the model&rsquo;s alerts this week ({precision.n} verdicts). A confidence near 100% is
          the model&rsquo;s own claim, not a measured hit rate.{" "}
          <Link to="/model" className="text-link">See how well the two agree</Link>.
        </p>
      )}

      {error && <div className="error-banner" style={{ marginTop: 16 }}>{error}</div>}

      {selected.size > 0 && canTriage && (
        <div className="bulkbar" role="region" aria-label="Bulk actions">
          <span className="num" style={{ fontWeight: 600 }}>{selected.size} selected</span>
          <span className="bulkbar-actions">
            <button className="btn btn-good btn-sm" disabled={bulkBusy} onClick={() => bulk("confirm")}>
              <Check size={14} aria-hidden="true" /> Confirm attack
            </button>
            <button className="btn btn-danger btn-sm" disabled={bulkBusy} onClick={() => bulk("dismiss")}>
              <X size={14} aria-hidden="true" /> False positive
            </button>
            <button className="btn btn-outline btn-sm" disabled={bulkBusy} onClick={() => bulk("assign")}>
              <UserRound size={14} aria-hidden="true" /> Assign to me
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set())}>Clear</button>
          </span>
        </div>
      )}

      {view === "flat" ? (
        <FlatTable
          alerts={alerts}
          loading={loading}
          error={error}
          focusedIndex={focusedIndex}
          rowRefs={rowRefs}
          onOpen={openAlert}
          onFocusRow={setFocusedIndex}
          canTriage={canTriage}
          selected={selected}
          allSelected={allSelected}
          onToggle={toggleSelect}
          onToggleAll={() => setSelected(allSelected ? new Set() : new Set(alerts.map((a) => a.id)))}
          hasFilters={activeFilterCount > 0}
          onReset={clearFilters}
        />
      ) : (
        <Groups groups={groups} loading={loading} error={error} onOpen={openGroup} />
      )}

      {!loading && count > 0 && (
        <div className="pagination">
          <span className="muted num">
            {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, count)} of {fmtInt(count)}{" "}
            {view === "flat" ? "alerts" : "campaigns"}
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

function FlatTable({ alerts, loading, focusedIndex, rowRefs, onOpen, onFocusRow, canTriage, selected, allSelected, onToggle, onToggleAll, hasFilters, onReset }) {
  const head = (
    <thead>
      <tr>
        {canTriage && (
          <th className="col-check">
            <input type="checkbox" className="check" aria-label="Select all on this page" checked={allSelected} onChange={onToggleAll} />
          </th>
        )}
        <th>Alert</th>
        <th>Severity</th>
        <th>Priority</th>
        <th>
          Risk <span className="sort"><ChevronsUpDown size={12} aria-hidden="true" /></span>
        </th>
        <th>Confidence</th>
        <th>Why</th>
        <th>Status</th>
        <th>Assignee</th>
        <th className="right">Detected</th>
      </tr>
    </thead>
  );

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="table-wrap" style={{ paddingTop: 12 }}>
        <table className="table">
          {head}
          <tbody>
            {loading && !alerts.length && <SkeletonRows rows={8} cols={canTriage ? 10 : 9} />}
            {alerts.map((a, i) => (
              <tr
                key={a.id}
                ref={(el) => (rowRefs.current[i] = el)}
                className={`row-link ${i === focusedIndex ? "row-focus" : ""}`}
                onMouseEnter={() => onFocusRow(i)}
                onClick={() => onOpen(a, i)}
              >
                {canTriage && (
                  <td className="col-check" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      className="check"
                      aria-label={`Select ${attackMeta(a.attack_type).label} from ${a.source_ip}`}
                      checked={selected.has(a.id)}
                      onChange={() => onToggle(a.id)}
                    />
                  </td>
                )}
                <td>
                  <AttackCell type={a.attack_type} sub={`${a.source_ip} → ${a.dest_ip}`} />
                </td>
                <td>
                  <SeverityPill severity={a.severity} />
                </td>
                <td>
                  <PriorityTag priority={a.priority} />
                </td>
                <td>
                  <RiskBar score={a.risk_score} />
                </td>
                <td className="num">{fmtPct(a.confidence)}</td>
                <td>
                  <ShapGlyph features={a.top_features} />
                </td>
                <td>
                  <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                    <StatusPill status={a.status} />
                    <OriginPill origin={a.origin} compact />
                  </span>
                </td>
                <td className="muted">{a.assignee_name || "Unassigned"}</td>
                <td className="right num" title={formatTime(a.timestamp)}>
                  {relativeTime(a.timestamp)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && alerts.length === 0 && (
          <div className="empty">
            <span className="empty-icon">
              <Inbox size={20} aria-hidden="true" />
            </span>
            <h3>{hasFilters ? "No alerts match these filters" : "The queue is clear"}</h3>
            <p>
              {hasFilters
                ? "Widen the scope or clear a filter to see more."
                : "Nothing open right now. Launch the Threat Simulator to generate traffic, or wait for the next detection."}
            </p>
            {hasFilters && (
              <button className="btn btn-outline btn-sm" onClick={onReset} style={{ marginTop: 8 }}>
                Reset filters
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Groups({ groups, loading, onOpen }) {
  if (loading && !groups.length) {
    return (
      <div className="group-grid" style={{ marginTop: 16 }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div className="card card-pad" key={i}>
            <div className="skeleton" style={{ width: "55%", height: 14, marginBottom: 12 }} />
            <div className="skeleton" style={{ width: "80%", height: 11 }} />
          </div>
        ))}
      </div>
    );
  }
  if (!groups.length) {
    return (
      <div className="card" style={{ marginTop: 16 }}>
        <div className="empty">
          <span className="empty-icon">
            <Layers size={20} aria-hidden="true" />
          </span>
          <h3>No campaigns match</h3>
          <p>A campaign is a burst of the same attack from one source to one target.</p>
        </div>
      </div>
    );
  }
  return (
    <div className="group-grid" style={{ marginTop: 16 }}>
      {groups.map((g) => (
        <button key={`${g.source_ip}-${g.dest_ip}-${g.attack_type}`} className="card group-card" onClick={() => onOpen(g)}>
          <div className="group-top">
            <AttackAvatar type={g.attack_type} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="cell-title">{attackMeta(g.attack_type).label}</div>
              <div className="cell-sub">
                {g.source_ip} → {g.dest_ip}
              </div>
            </div>
            <span className="group-count num">×{g.count}</span>
          </div>
          <div className="group-mid">
            <SeverityPill severity={g.max_severity} />
            <RiskBar score={g.max_risk_score} />
          </div>
          <div className="cell-sub" style={{ margin: 0 }}>
            First seen {relativeTime(g.first_seen)} · last {relativeTime(g.last_seen)}
          </div>
        </button>
      ))}
    </div>
  );
}

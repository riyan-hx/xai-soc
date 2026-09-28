import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CornerDownLeft,
  FileBarChart2,
  FlaskConical,
  Keyboard,
  LayoutDashboard,
  LogOut,
  Microscope,
  MoonStar,
  Play,
  Search,
  ShieldAlert,
  Users as UsersIcon,
} from "lucide-react";
import { api } from "../api/client";
import { useAuth } from "../api/auth";
import { useTheme } from "../lib/theme";
import { attackMeta } from "../lib/meta";
import { AttackAvatar, SeverityPill } from "./Badges";

// Escape-closable, arrow-navigable command palette. Static commands are
// filtered locally; alert matches come from the API as you type.
export default function CommandPalette({ onClose, onShortcuts }) {
  const navigate = useNavigate();
  const { user, logout, openAccess } = useAuth();
  const { toggle: toggleTheme, theme } = useTheme();
  const [query, setQuery] = useState("");
  const [alerts, setAlerts] = useState([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  const commands = useMemo(() => {
    const go = (to) => () => navigate(to);
    return [
      { id: "p-dash", group: "Go to", label: "Dashboard", Icon: LayoutDashboard, run: go("/dashboard") },
      { id: "p-alerts", group: "Go to", label: "Alert queue", Icon: ShieldAlert, run: go("/alerts") },
      { id: "p-sim", group: "Go to", label: "Threat Simulator", Icon: FlaskConical, run: go("/simulator") },
      { id: "p-model", group: "Go to", label: "Model Observatory", Icon: Microscope, run: go("/model") },
      { id: "p-reports", group: "Go to", label: "Reports", Icon: FileBarChart2, run: go("/reports") },
      ...(user?.role === "ADMIN"
        ? [{ id: "p-users", group: "Go to", label: "Users", Icon: UsersIcon, run: go("/users") }]
        : []),
      { id: "a-sim", group: "Actions", label: "Simulate an attack", Icon: Play, run: go("/simulator") },
      {
        id: "a-theme",
        group: "Actions",
        label: theme === "dark" ? "Switch to light theme" : "Switch to dark theme",
        Icon: MoonStar,
        run: toggleTheme,
      },
      { id: "a-keys", group: "Actions", label: "Show keyboard shortcuts", Icon: Keyboard, run: onShortcuts },
      ...(openAccess
        ? []
        : [
            {
              id: "a-out",
              group: "Actions",
              label: "Sign out",
              Icon: LogOut,
              run: () => {
                logout();
                navigate("/login");
              },
            },
          ]),
    ];
  }, [navigate, user, theme, toggleTheme, onShortcuts, logout, openAccess]);

  const q = query.trim().toLowerCase();
  const filteredCommands = q ? commands.filter((c) => c.label.toLowerCase().includes(q)) : commands;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (q.length < 2) {
      setAlerts([]);
      return undefined;
    }
    let cancelled = false;
    const t = setTimeout(() => {
      api
        .listAlerts({ q: query.trim(), limit: 6 })
        .then((res) => !cancelled && setAlerts(res.items))
        .catch(() => !cancelled && setAlerts([]));
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q, query]);

  const rows = useMemo(() => {
    const out = [];
    if (alerts.length) {
      alerts.forEach((a) =>
        out.push({
          id: `al-${a.id}`,
          group: "Alerts",
          kind: "alert",
          alert: a,
          run: () => navigate(`/alerts/${a.id}`),
        })
      );
    }
    if (q.length >= 2) {
      out.push({
        id: "search-all",
        group: "Alerts",
        label: `Search the queue for “${query.trim()}”`,
        Icon: Search,
        run: () => navigate(`/alerts?q=${encodeURIComponent(query.trim())}`),
      });
    }
    return [...out, ...filteredCommands];
  }, [alerts, filteredCommands, q, query, navigate]);

  useEffect(() => setActive(0), [q, alerts.length]);

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function run(row) {
    onClose();
    row.run();
  }

  function onKeyDown(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, rows.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && rows[active]) {
      e.preventDefault();
      run(rows[active]);
    }
  }

  let lastGroup = null;
  return (
    <div className="modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-panel palette" role="dialog" aria-modal="true" aria-label="Command palette" onKeyDown={onKeyDown}>
        <div className="palette-input">
          <Search size={18} aria-hidden="true" className="muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search alerts by IP or reason, or type a command…"
            aria-label="Search"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={rows[active] ? `pal-${rows[active].id}` : undefined}
          />
          <kbd>Esc</kbd>
        </div>
        <div id="palette-list" role="listbox" className="palette-list" ref={listRef}>
          {rows.length === 0 && (
            <div className="empty" style={{ padding: "28px 16px" }}>
              <h3>No matches</h3>
              <p>Try an IP address, an attack type, or a page name.</p>
            </div>
          )}
          {rows.map((row, i) => {
            const header = row.group !== lastGroup;
            lastGroup = row.group;
            return (
              <div key={row.id}>
                {header && <div className="menu-label">{row.group}</div>}
                <button
                  id={`pal-${row.id}`}
                  role="option"
                  aria-selected={i === active}
                  data-active={i === active}
                  className="palette-row"
                  onMouseMove={() => setActive(i)}
                  onClick={() => run(row)}
                >
                  {row.kind === "alert" ? (
                    <>
                      <AttackAvatar type={row.alert.attack_type} size="sm" />
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontWeight: 550 }}>{attackMeta(row.alert.attack_type).label}</span>
                        <span className="cell-sub" style={{ display: "block" }}>
                          {row.alert.source_ip} → {row.alert.dest_ip}
                        </span>
                      </span>
                      <SeverityPill severity={row.alert.severity} />
                    </>
                  ) : (
                    <>
                      <span className="palette-icon">
                        <row.Icon size={15} aria-hidden="true" />
                      </span>
                      <span style={{ flex: 1 }}>{row.label}</span>
                    </>
                  )}
                  {i === active && <CornerDownLeft size={14} className="muted" aria-hidden="true" />}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

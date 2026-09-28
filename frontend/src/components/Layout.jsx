import { useCallback, useEffect, useRef, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import {
  Activity,
  Bell,
  ChevronsUpDown,
  Command,
  FlaskConical,
  Keyboard,
  LogOut,
  Menu,
  Moon,
  Search,
  ShieldCheck,
  Sun,
  TriangleAlert,
} from "lucide-react";
import { useAuth } from "../api/auth";
import { api } from "../api/client";
import { useAlertStream } from "../stream/AlertStream";
import { isTypingTarget } from "../lib/keyboard";
import { initials, relativeTime, titleCase } from "../lib/format";
import { attackMeta } from "../lib/meta";
import { useTheme } from "../lib/theme";
import { useDismiss } from "../lib/useDismiss";
import { AttackAvatar, SeverityPill } from "./Badges";
import CommandPalette from "./CommandPalette";
import ShortcutsModal from "./ShortcutsModal";

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <div className="theme-toggle" role="group" aria-label="Colour theme">
      <button aria-pressed={theme === "light"} onClick={() => setTheme("light")} aria-label="Light theme">
        <Sun size={15} />
      </button>
      <button aria-pressed={theme === "dark"} onClick={() => setTheme("dark")} aria-label="Dark theme">
        <Moon size={15} />
      </button>
    </div>
  );
}

function NotificationMenu() {
  const stream = useAlertStream();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);
  const unseen = stream?.unseenCount || 0;
  const recent = stream?.recent || [];

  return (
    <div className="popover-anchor" ref={ref}>
      <button
        className="icon-btn"
        aria-label={unseen ? `Notifications, ${unseen} new` : "Notifications"}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Bell size={17} />
        {unseen > 0 && <span className="dot" />}
      </button>
      {open && (
        <div className="popover" style={{ width: 340, padding: 0 }}>
          <div className="card-head" style={{ padding: "14px 16px 10px" }}>
            <div className="card-title" style={{ fontSize: 14 }}>
              New alerts
            </div>
            {unseen > 0 && (
              <button className="btn btn-ghost btn-sm" onClick={() => stream?.markSeen()}>
                Mark all seen
              </button>
            )}
          </div>
          <div style={{ maxHeight: 360, overflowY: "auto", padding: "0 6px 6px" }}>
            {recent.length === 0 ? (
              <div className="empty" style={{ padding: "28px 16px" }}>
                <h3>Nothing new</h3>
                <p>Alerts that arrive while you have the console open show up here and as toasts.</p>
              </div>
            ) : (
              recent.map((a) => (
                <button
                  key={a.id}
                  className="menu-item"
                  style={{ padding: "10px" }}
                  onClick={() => {
                    setOpen(false);
                    navigate(`/alerts/${a.id}`);
                  }}
                >
                  <AttackAvatar type={a.attack_type} size="sm" />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontWeight: 550 }}>{attackMeta(a.attack_type).label}</span>
                    <span className="cell-sub">
                      {a.source_ip} → {a.dest_ip}
                    </span>
                  </span>
                  <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                    <SeverityPill severity={a.severity} />
                    <span className="cell-sub" style={{ margin: 0 }}>
                      {relativeTime(a.timestamp)}
                    </span>
                  </span>
                </button>
              ))
            )}
          </div>
          <div className="menu-sep" style={{ margin: 0 }} />
          <Link
            to="/alerts"
            className="menu-item"
            style={{ justifyContent: "center", borderRadius: "0 0 12px 12px", fontWeight: 550 }}
            onClick={() => setOpen(false)}
          >
            Open the alert queue
          </Link>
        </div>
      )}
    </div>
  );
}

function SystemStatus({ online, model, findings = [] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);
  return (
    <div className="popover-anchor hide-sm" ref={ref}>
      <button
        className="icon-btn"
        aria-label={`System status: API ${online === false ? "unreachable" : "connected"}`}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Activity size={17} />
        <span
          className="dot"
          style={{ background: online === false ? "var(--sev-critical)" : findings.length ? "var(--sev-high)" : "var(--pos)" }}
        />
      </button>
      {open && (
        <div className="popover" style={{ width: 300 }}>
          <div className="menu-label">System</div>
          <div className="kv" style={{ padding: "8px 10px" }}>
            <span className="k">API</span>
            <span className={`pill ${online === false ? "pill-critical" : "pill-pos"}`}>
              {online === false ? "Unreachable" : online ? "Connected" : "Checking"}
            </span>
          </div>
          <div className="kv" style={{ padding: "8px 10px" }}>
            <span className="k">Model</span>
            <span className="v">{model?.algorithm?.replace(/_/g, " ") || "—"}</span>
          </div>
          <div className="kv" style={{ padding: "8px 10px" }}>
            <span className="k">Live updates</span>
            <span className="v">every 12 s</span>
          </div>
          {findings.length > 0 && (
            <>
              <div className="menu-sep" />
              <div className="menu-label">Security</div>
              {findings.map((f) => (
                <div key={f.id} className="note-banner" style={{ margin: "0 4px 6px", background: "var(--sev-high-bg)", color: "var(--sev-high-ink)" }}>
                  <TriangleAlert size={14} aria-hidden="true" />
                  <span>
                    <strong>{f.title}.</strong> {f.detail}
                  </span>
                </div>
              ))}
            </>
          )}
          <div className="menu-sep" />
          <div className="note-banner" style={{ margin: "0 4px 4px" }}>
            <FlaskConical size={14} aria-hidden="true" />
            <span>
              <strong>Synthetic data.</strong> The model is trained on generated flows until a real dataset is wired in.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function UserMenu({ onShortcuts }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { theme, toggle: toggleTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);
  if (!user) return null;

  return (
    <div className="popover-anchor" ref={ref}>
      <button className="user-btn" aria-expanded={open} aria-label="Account menu" onClick={() => setOpen((o) => !o)}>
        <span className="avatar">{initials(user.name)}</span>
        <span className="user-meta">
          <span className="user-name">{user.name}</span>
          <span className="user-mail">{user.email}</span>
        </span>
        <ChevronsUpDown size={15} className="muted" aria-hidden="true" />
      </button>
      {open && (
        <div className="popover" style={{ width: 240 }}>
          <div className="menu-label">
            Signed in as {titleCase(user.role)}
          </div>
          <button
            className="menu-item"
            onClick={() => {
              setOpen(false);
              onShortcuts();
            }}
          >
            <Keyboard size={16} /> Keyboard shortcuts <kbd style={{ marginLeft: "auto" }}>?</kbd>
          </button>
          <button className="menu-item" onClick={toggleTheme}>
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />} {theme === "dark" ? "Light theme" : "Dark theme"}
          </button>
          <div className="menu-sep" />
          <button
            className="menu-item"
            onClick={() => {
              logout();
              navigate("/login");
            }}
          >
            <LogOut size={16} /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export default function Layout({ children }) {
  const { user } = useAuth();
  const stream = useAlertStream();
  const [apiOnline, setApiOnline] = useState(null);
  const [model, setModel] = useState(null);
  const [findings, setFindings] = useState([]);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const navRef = useRef(null);
  const closeNav = useCallback(() => setNavOpen(false), []);
  useDismiss(navRef, navOpen, closeNav);

  useEffect(() => {
    api
      .health()
      .then(() => setApiOnline(true))
      .catch(() => setApiOnline(false));
    api.getModelInfo().then(setModel).catch(() => {});
  }, []);

  useEffect(() => {
    if (user?.role === "ADMIN") {
      api.securityPosture().then((r) => setFindings(r.findings)).catch(() => {});
    }
  }, [user?.role]);

  useEffect(() => {
    function onKeyDown(e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
        return;
      }
      if (e.key === "?" && !isTypingTarget(e.target)) {
        e.preventDefault();
        setShortcutsOpen(true);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const unseen = stream?.unseenCount || 0;
  const links = [
    { to: "/dashboard", label: "Dashboard" },
    { to: "/alerts", label: "Alerts", badge: unseen, onClick: () => stream?.markSeen() },
    { to: "/simulator", label: "Simulator" },
    { to: "/model", label: "Model" },
    { to: "/reports", label: "Reports" },
    ...(user?.role === "ADMIN" ? [{ to: "/users", label: "Users" }, { to: "/logs", label: "Logs" }] : []),
  ];

  const renderLinks = (className) =>
    links.map((l) => (
      <NavLink
        key={l.to}
        to={l.to}
        className={({ isActive }) => `${className} ${isActive ? "active" : ""}`}
        onClick={() => {
          l.onClick?.();
          setNavOpen(false);
        }}
      >
        {l.label}
        {l.badge > 0 && <span className="nav-badge">{l.badge > 99 ? "99+" : l.badge}</span>}
      </NavLink>
    ));

  return (
    <div className="app">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="topbar">
        <div className="topbar-inner">
          <Link to="/dashboard" className="brand" aria-label="SOC Console home">
            <span className="brand-mark">
              <ShieldCheck size={19} strokeWidth={2.2} />
            </span>
            <span className="brand-name">SOC Console</span>
          </Link>

          <nav className="topnav" aria-label="Primary">
            {renderLinks("topnav-link")}
          </nav>

          <div className="topbar-right">
            <button className="cmd-trigger" onClick={() => setPaletteOpen(true)} aria-label="Open command palette">
              <Search size={16} aria-hidden="true" />
              <span className="cmd-text">Search alerts, IPs, actions…</span>
              <span className="cmd-keys" aria-hidden="true">
                <kbd>{isMac ? <Command size={11} /> : "Ctrl"}</kbd>
                <kbd>K</kbd>
              </span>
            </button>
            <ThemeToggle />
            <NotificationMenu />
            <SystemStatus online={apiOnline} model={model} findings={findings} />
            <UserMenu onShortcuts={() => setShortcutsOpen(true)} />

            <div className="popover-anchor nav-burger" ref={navRef}>
              <button className="icon-btn" aria-label="Menu" aria-expanded={navOpen} onClick={() => setNavOpen((o) => !o)}>
                <Menu size={17} />
              </button>
              {navOpen && (
                <div className="popover" style={{ width: 220 }}>
                  {renderLinks("menu-item")}
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <main id="main" className="page">
        {children}
      </main>

      {paletteOpen && <CommandPalette onClose={() => setPaletteOpen(false)} onShortcuts={() => setShortcutsOpen(true)} />}
      {shortcutsOpen && <ShortcutsModal onClose={() => setShortcutsOpen(false)} />}
    </div>
  );
}

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import { useAuth } from "../api/auth";
import { useToast } from "../components/Toast";
import { attackMeta } from "../lib/meta";

const AlertStreamContext = createContext(null);

const POLL_MS = 12000;
const TOASTABLE_SEVERITIES = new Set(["CRITICAL", "HIGH"]);
const MAX_INDIVIDUAL_TOASTS = 2;
const MAX_RECENT = 12;

export function AlertStreamProvider({ children }) {
  const { token } = useAuth();
  const toast = useToast();
  const [version, setVersion] = useState(0);
  const [unseenCount, setUnseenCount] = useState(0);
  const [recent, setRecent] = useState([]);
  const lastSeenRef = useRef(new Date().toISOString());

  useEffect(() => {
    if (!token) return undefined;

    let cancelled = false;

    async function poll() {
      if (document.hidden) return;
      try {
        const res = await api.listAlerts({ since: lastSeenRef.current, limit: 20 });
        if (cancelled || !res.items.length) return;

        lastSeenRef.current = res.items.reduce(
          (max, a) => (a.timestamp > max ? a.timestamp : max),
          lastSeenRef.current
        );

        setUnseenCount((n) => n + res.items.length);
        setRecent((cur) => [...res.items, ...cur].slice(0, MAX_RECENT));
        setVersion((v) => v + 1);

        const toastable = res.items.filter((a) => TOASTABLE_SEVERITIES.has(a.severity));
        toastable.slice(0, MAX_INDIVIDUAL_TOASTS).forEach((a) => {
          toast?.push({
            type: a.severity === "CRITICAL" ? "critical" : "warning",
            title: `${a.severity === "CRITICAL" ? "Critical" : "High"} · ${attackMeta(a.attack_type).label}`,
            message: `${a.source_ip} → ${a.dest_ip} · risk ${a.risk_score?.toFixed(2)}`,
            to: `/alerts/${a.id}`,
          });
        });
        if (toastable.length > MAX_INDIVIDUAL_TOASTS) {
          toast?.push({
            type: "warning",
            title: `+${toastable.length - MAX_INDIVIDUAL_TOASTS} more high-priority alerts`,
            message: "Open Alerts to review the full queue.",
            to: "/alerts",
          });
        }
      } catch {
        // transient network/auth hiccups shouldn't surface as noise
      }
    }

    const interval = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  function markSeen() {
    setUnseenCount(0);
  }

  // Lets a page that just created alerts itself (the simulator) refresh
  // everything else without waiting for the next poll.
  function bump() {
    setVersion((v) => v + 1);
  }

  return (
    <AlertStreamContext.Provider value={{ version, unseenCount, recent, markSeen, bump }}>
      {children}
    </AlertStreamContext.Provider>
  );
}

export function useAlertStream() {
  return useContext(AlertStreamContext);
}

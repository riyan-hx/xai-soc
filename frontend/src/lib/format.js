import { featureInfo } from "./features";

// The API sends UTC ISO strings ending in "Z". Older rows (or anything
// without a zone) are treated as UTC too, so a timestamp never silently shifts
// by the viewer's offset.
export function parseTs(iso) {
  if (!iso) return new Date(NaN);
  if (iso instanceof Date) return iso;
  const hasZone = /[zZ]$|[+-]\d\d:?\d\d$/.test(iso);
  return new Date(hasZone ? iso : `${iso}Z`);
}

export function relativeTime(iso) {
  const diffMs = Date.now() - parseTs(iso).getTime();
  const sec = Math.round(diffMs / 1000);
  if (sec < 5) return "just now";
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  return `${day}d ago`;
}

export function formatTime(iso) {
  return parseTs(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDateLong(iso) {
  return parseTs(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function formatClock(date = new Date()) {
  return date.toLocaleTimeString(undefined, { hour12: false });
}

const INT = new Intl.NumberFormat("en-US");
export function fmtInt(n) {
  return n == null ? "—" : INT.format(Math.round(n));
}

export function fmtPct(fraction, digits = 0) {
  return fraction == null ? "—" : `${(fraction * 100).toFixed(digits)}%`;
}

export function fmtScore(n, digits = 2) {
  return n == null ? "—" : Number(n).toFixed(digits);
}

export function fmtValue(n) {
  if (n == null) return "—";
  const abs = Math.abs(n);
  if (abs >= 1000) return INT.format(Math.round(n));
  if (abs >= 100) return n.toFixed(0);
  if (abs >= 10) return n.toFixed(1);
  return n.toFixed(2);
}

const ACRONYMS = { dns: "DNS", syn: "SYN", ack: "ACK", iat: "IAT" };

// flow_bytes_s -> "Flow Bytes/s" (the CICFlowMeter column name); anything
// unknown falls back to spacing out the key
export function humanFeature(name) {
  const known = featureInfo(name);
  if (known) return known.label;
  const text = name
    .split("_")
    .map((w) => ACRONYMS[w] ?? w)
    .join(" ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function shortId(id) {
  return id ? id.slice(0, 8) : "";
}

export function initials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase();
}

export function titleCase(s) {
  return s ? s.charAt(0) + s.slice(1).toLowerCase() : "";
}

export function downloadFile(filename, text, type = "text/csv") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

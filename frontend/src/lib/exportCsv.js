import { api } from "../api/client";
import { downloadFile } from "./format";

const HEADERS = [
  "alert_id",
  "attack_type",
  "severity",
  "priority",
  "status",
  "source_ip",
  "dest_ip",
  "confidence",
  "risk_score",
  "timestamp",
  "origin",
  "description",
];

function toCsv(rows) {
  const escape = (v) => {
    let s = String(v ?? "").replace(/"/g, '""');
    // stop spreadsheet apps from evaluating a cell as a formula
    if (/^[=+\-@]/.test(s)) s = `'${s}`;
    return `"${s}"`;
  };
  return [HEADERS.join(","), ...rows.map((r) => HEADERS.map((h) => escape(r[h])).join(","))].join("\n");
}

// Pages through the alert API (highest risk first) and downloads a CSV.
export async function exportAlertsCsv(limit = 500) {
  const rows = [];
  let offset = 0;
  let total = Infinity;
  while (offset < total && offset < limit) {
    const res = await api.listAlerts({ limit: 100, offset });
    rows.push(...res.items);
    total = res.total;
    offset += 100;
  }
  downloadFile(`xai-soc-alerts-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows));
  return rows.length;
}

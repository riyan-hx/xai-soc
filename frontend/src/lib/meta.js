import { Waypoints, Zap, Radar, KeyRound, Bot, ShieldCheck } from "lucide-react";

export const ATTACK_TYPES = ["DNS_TUNNELING", "DOS_DDOS", "PORT_SCAN", "BRUTE_FORCE", "BOTNET"];
export const SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
export const STATUSES = ["NEW", "INVESTIGATING", "CONFIRMED", "RESOLVED", "FALSE_POSITIVE"];
export const OPEN_STATUSES = ["NEW", "INVESTIGATING", "CONFIRMED"];

export const ATTACK_META = {
  DNS_TUNNELING: { label: "DNS tunneling", short: "DNS tunnel", Icon: Waypoints, cssVar: "--atk-dns" },
  DOS_DDOS: { label: "DoS / DDoS", short: "DoS", Icon: Zap, cssVar: "--atk-dos" },
  PORT_SCAN: { label: "Port scan", short: "Port scan", Icon: Radar, cssVar: "--atk-scan" },
  BRUTE_FORCE: { label: "Brute force", short: "Brute force", Icon: KeyRound, cssVar: "--atk-brute" },
  BOTNET: { label: "Botnet C2", short: "Botnet", Icon: Bot, cssVar: "--atk-botnet" },
  NORMAL: { label: "Normal traffic", short: "Normal", Icon: ShieldCheck, cssVar: "--atk-normal" },
};

export function attackMeta(type) {
  return ATTACK_META[type] || { label: type, short: type, Icon: ShieldCheck, cssVar: "--atk-normal" };
}

export const SEVERITY_META = {
  CRITICAL: { label: "Critical", cls: "pill-critical", color: "var(--sev-critical)" },
  HIGH: { label: "High", cls: "pill-high", color: "var(--sev-high)" },
  MEDIUM: { label: "Medium", cls: "pill-medium", color: "var(--sev-medium)" },
  LOW: { label: "Low", cls: "pill-low", color: "var(--sev-low)" },
};

export const STATUS_META = {
  NEW: { label: "New", cls: "pill-accent" },
  INVESTIGATING: { label: "Investigating", cls: "pill-info" },
  CONFIRMED: { label: "Confirmed", cls: "pill-neg" },
  RESOLVED: { label: "Resolved", cls: "pill-pos" },
  FALSE_POSITIVE: { label: "False positive", cls: "pill-outline" },
};

export const PRIORITY_COLOR = {
  P1: "var(--sev-critical)",
  P2: "var(--sev-high)",
  P3: "var(--sev-medium)",
  P4: "var(--sev-low)",
};

// Risk score -> the same colour ramp the priority bands use (P1 >= .8 ... P4 < .4)
export function riskColor(score) {
  if (score >= 0.8) return "var(--sev-critical)";
  if (score >= 0.6) return "var(--sev-high)";
  if (score >= 0.4) return "var(--sev-medium)";
  return "var(--sev-low)";
}

// Plain-language meaning of each model input, so a SHAP bar can be read
// without knowing the feature name.
export const FEATURE_GLOSSARY = {
  flow_duration: "How long the connection lasted (seconds).",
  total_fwd_packets: "Packets sent from the client to the server.",
  total_bwd_packets: "Packets sent back from the server.",
  total_fwd_bytes: "Bytes sent from the client to the server.",
  total_bwd_bytes: "Bytes sent back from the server.",
  packet_length_mean: "Average packet size. Scans use tiny packets; bulk transfers use large ones.",
  packet_length_std: "How much packet sizes vary.",
  flow_bytes_per_sec: "Data rate of the flow. Floods and exfiltration push this up.",
  flow_packets_per_sec: "Packet rate of the flow. Floods spike this.",
  fwd_iat_mean: "Average gap between outgoing packets (ms). Floods have near-zero gaps; beacons have steady ones.",
  bwd_iat_mean: "Average gap between returning packets (ms).",
  syn_flag_count: "TCP SYN (connection request) packets. Scans and floods send many.",
  ack_flag_count: "TCP ACK packets. Completed connections have many; half-open scans have few.",
  unique_dest_ports: "Distinct destination ports touched. A port scan fans out across many.",
  dns_query_length_mean: "Average length of DNS names queried. Tunnels stuff data into long names.",
  dns_query_entropy: "How random the DNS names look. Generated names score high.",
  dns_queries_per_session: "DNS lookups in the session. Tunnels and botnets query far more than normal hosts.",
};

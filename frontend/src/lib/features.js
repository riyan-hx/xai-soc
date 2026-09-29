// The model's inputs: the 77 CICFlowMeter flow features (CIC-IDS2017 /
// CSE-CIC-IDS2018) plus four DNS/port features. Keys mirror
// backend/ml/features.py; labels are the CICFlowMeter column names.
// Durations and inter-arrival times (IAT) are in microseconds.

const F = (label, meaning) => ({ label, meaning });

export const FEATURES = {
  // flow identifiers & basic statistics
  flow_duration: F("Flow Duration", "How long the connection lasted (µs)."),
  total_fwd_packets: F("Total Fwd Packets", "Packets sent from the client to the server."),
  total_backward_packets: F("Total Backward Packets", "Packets sent back from the server. Floods and scans get few replies."),
  total_length_of_fwd_packets: F("Total Length of Fwd Packets", "Bytes sent from the client to the server."),
  total_length_of_bwd_packets: F("Total Length of Bwd Packets", "Bytes sent back from the server."),
  flow_bytes_s: F("Flow Bytes/s", "Data rate of the flow. Floods and exfiltration push this up."),
  flow_packets_s: F("Flow Packets/s", "Packet rate of the flow. Floods spike this."),
  // forward packet length
  fwd_packet_length_max: F("Fwd Packet Length Max", "Largest packet the client sent."),
  fwd_packet_length_min: F("Fwd Packet Length Min", "Smallest packet the client sent."),
  fwd_packet_length_mean: F("Fwd Packet Length Mean", "Average client packet size. Scans send empty probes; tunnels send oversized queries."),
  fwd_packet_length_std: F("Fwd Packet Length Std", "How much client packet sizes vary."),
  // backward packet length
  bwd_packet_length_max: F("Bwd Packet Length Max", "Largest packet the server sent back."),
  bwd_packet_length_min: F("Bwd Packet Length Min", "Smallest packet the server sent back."),
  bwd_packet_length_mean: F("Bwd Packet Length Mean", "Average server reply size."),
  bwd_packet_length_std: F("Bwd Packet Length Std", "How much server reply sizes vary."),
  // flow IAT
  flow_iat_mean: F("Flow IAT Mean", "Average gap between any two packets (µs). Floods have near-zero gaps."),
  flow_iat_std: F("Flow IAT Std", "How irregular the gaps are. Automated tools are very regular."),
  flow_iat_max: F("Flow IAT Max", "Longest pause in the flow."),
  flow_iat_min: F("Flow IAT Min", "Shortest gap between packets."),
  // forward IAT
  fwd_iat_total: F("Fwd IAT Total", "Time between the client's first and last packet (µs)."),
  fwd_iat_mean: F("Fwd IAT Mean", "Average gap between client packets. Floods have near-zero gaps; beacons have steady ones."),
  fwd_iat_std: F("Fwd IAT Std", "How irregular the client's timing is."),
  fwd_iat_max: F("Fwd IAT Max", "Longest pause between client packets."),
  fwd_iat_min: F("Fwd IAT Min", "Shortest gap between client packets."),
  // backward IAT
  bwd_iat_total: F("Bwd IAT Total", "Time between the server's first and last packet (µs)."),
  bwd_iat_mean: F("Bwd IAT Mean", "Average gap between server packets."),
  bwd_iat_std: F("Bwd IAT Std", "How irregular the server's timing is."),
  bwd_iat_max: F("Bwd IAT Max", "Longest pause between server packets."),
  bwd_iat_min: F("Bwd IAT Min", "Shortest gap between server packets."),
  // TCP flags
  fwd_psh_flags: F("Fwd PSH Flags", "Client packets asking the receiver to push data to the app immediately."),
  bwd_psh_flags: F("Bwd PSH Flags", "Server packets with the PSH flag."),
  fwd_urg_flags: F("Fwd URG Flags", "Client packets marked urgent. Rare in normal traffic."),
  bwd_urg_flags: F("Bwd URG Flags", "Server packets marked urgent."),
  fin_flag_count: F("FIN Flag Count", "Connection-close packets. Many short completed sessions (brute force) raise it."),
  syn_flag_count: F("SYN Flag Count", "Connection requests. Scans and SYN floods send many."),
  rst_flag_count: F("RST Flag Count", "Connection resets. A closed port answers a scan probe with RST."),
  psh_flag_count: F("PSH Flag Count", "Packets carrying data to push to the application."),
  ack_flag_count: F("ACK Flag Count", "Acknowledgements. Completed connections have many; half-open scans and floods have few."),
  urg_flag_count: F("URG Flag Count", "Urgent-data packets."),
  cwe_flag_count: F("CWE Flag Count", "Congestion Window Reduced flags."),
  ece_flag_count: F("ECE Flag Count", "Explicit Congestion Notification echo flags."),
  fwd_header_length: F("Fwd Header Length", "Header bytes in client packets."),
  bwd_header_length: F("Bwd Header Length", "Header bytes in server packets."),
  fwd_packets_s: F("Fwd Packets/s", "Client packet rate. Floods and brute force push this up."),
  bwd_packets_s: F("Bwd Packets/s", "Server packet rate."),
  // packet size distribution
  min_packet_length: F("Min Packet Length", "Smallest packet in either direction."),
  max_packet_length: F("Max Packet Length", "Largest packet in either direction."),
  packet_length_mean: F("Packet Length Mean", "Average packet size. Scans use tiny packets; bulk transfers use large ones."),
  packet_length_std: F("Packet Length Std", "How much packet sizes vary."),
  packet_length_variance: F("Packet Length Variance", "Packet size spread (std squared)."),
  down_up_ratio: F("Down/Up Ratio", "Server packets per client packet. Floods send a lot and get little back."),
  average_packet_size: F("Average Packet Size", "Bytes per packet over the whole flow."),
  // subflow & bulk
  avg_fwd_segment_size: F("Avg Fwd Segment Size", "Average client payload per packet."),
  avg_bwd_segment_size: F("Avg Bwd Segment Size", "Average server payload per packet."),
  fwd_header_length_1: F("Fwd Header Length.1", "Duplicate of Fwd Header Length in raw CICFlowMeter output."),
  fwd_avg_bytes_bulk: F("Fwd Avg Bytes/Bulk", "Bytes per bulk upload burst."),
  fwd_avg_packets_bulk: F("Fwd Avg Packets/Bulk", "Packets per bulk upload burst."),
  fwd_avg_bulk_rate: F("Fwd Avg Bulk Rate", "Upload speed during bulk bursts."),
  bwd_avg_bytes_bulk: F("Bwd Avg Bytes/Bulk", "Bytes per bulk download burst."),
  bwd_avg_packets_bulk: F("Bwd Avg Packets/Bulk", "Packets per bulk download burst."),
  bwd_avg_bulk_rate: F("Bwd Avg Bulk Rate", "Download speed during bulk bursts."),
  subflow_fwd_packets: F("Subflow Fwd Packets", "Client packets per sub-flow."),
  subflow_fwd_bytes: F("Subflow Fwd Bytes", "Client bytes per sub-flow."),
  subflow_bwd_packets: F("Subflow Bwd Packets", "Server packets per sub-flow."),
  subflow_bwd_bytes: F("Subflow Bwd Bytes", "Server bytes per sub-flow."),
  // TCP window, active/idle
  init_win_bytes_forward: F("Init_Win_bytes_forward", "Client's initial TCP window. Flood tools often use tiny fixed windows."),
  init_win_bytes_backward: F("Init_Win_bytes_backward", "Server's initial TCP window."),
  act_data_pkt_fwd: F("act_data_pkt_fwd", "Client packets that carry any payload. Scan probes carry none."),
  min_seg_size_forward: F("min_seg_size_forward", "Smallest client segment header seen."),
  active_mean: F("Active Mean", "Average time the flow was active before going idle (µs)."),
  active_std: F("Active Std", "How much active periods vary."),
  active_max: F("Active Max", "Longest active period."),
  active_min: F("Active Min", "Shortest active period."),
  idle_mean: F("Idle Mean", "Average idle time between bursts (µs). Botnet beacons sit idle for long, regular stretches."),
  idle_std: F("Idle Std", "How much idle periods vary. Beacons are very regular."),
  idle_max: F("Idle Max", "Longest idle period."),
  idle_min: F("Idle Min", "Shortest idle period."),
  // not from CICFlowMeter
  unique_dest_ports: F("Unique Dest Ports", "Distinct destination ports touched. A port scan fans out across many."),
  dns_query_length_mean: F("DNS Query Length Mean", "Average length of DNS names queried. Tunnels stuff data into long names."),
  dns_query_entropy: F("DNS Query Entropy", "How random the DNS names look. Generated names score high."),
  dns_queries_per_session: F("DNS Queries Per Session", "DNS lookups in the session. Tunnels and botnets query far more than normal hosts."),
};

// names from the earlier 17-feature schema, still found on older alerts
const LEGACY = {
  total_bwd_packets: "total_backward_packets",
  total_fwd_bytes: "total_length_of_fwd_packets",
  total_bwd_bytes: "total_length_of_bwd_packets",
  flow_bytes_per_sec: "flow_bytes_s",
  flow_packets_per_sec: "flow_packets_s",
};

export function featureInfo(name) {
  return FEATURES[name] || FEATURES[LEGACY[name]];
}

export const FEATURE_GLOSSARY = Object.fromEntries(
  [...Object.keys(FEATURES), ...Object.keys(LEGACY)].map((k) => [k, featureInfo(k).meaning])
);

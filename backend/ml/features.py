"""
Shared feature schema for the IDS model.

The model sees the 77 flow features CICFlowMeter produces (the feature set of
CIC-IDS2017 / CSE-CIC-IDS2018), plus four DNS/port features CICFlowMeter does
not have but DNS tunneling and port-scan detection need. All of them are
flow statistics, not payload bytes, so they work on encrypted traffic such
as DoH.

Internal names are the CIC column names normalized by `canonical()`
("Flow Bytes/s" -> "flow_bytes_s", " Fwd IAT Mean" -> "fwd_iat_mean"), so a
real CICFlowMeter CSV maps onto FEATURE_NAMES without a hand-written rename
table. Units follow CICFlowMeter: durations and inter-arrival times in
microseconds, sizes in bytes, rates per second.
"""

import re
from typing import Dict

# CICFlowMeter output columns, in the order the tool writes them
CIC_FEATURES = [
    # flow identifiers & basic statistics
    "Flow Duration",
    "Total Fwd Packets",
    "Total Backward Packets",
    "Total Length of Fwd Packets",
    "Total Length of Bwd Packets",
    "Flow Bytes/s",
    "Flow Packets/s",
    # forward packet length
    "Fwd Packet Length Max",
    "Fwd Packet Length Min",
    "Fwd Packet Length Mean",
    "Fwd Packet Length Std",
    # backward packet length
    "Bwd Packet Length Max",
    "Bwd Packet Length Min",
    "Bwd Packet Length Mean",
    "Bwd Packet Length Std",
    # flow inter-arrival time
    "Flow IAT Mean",
    "Flow IAT Std",
    "Flow IAT Max",
    "Flow IAT Min",
    # forward inter-arrival time
    "Fwd IAT Total",
    "Fwd IAT Mean",
    "Fwd IAT Std",
    "Fwd IAT Max",
    "Fwd IAT Min",
    # backward inter-arrival time
    "Bwd IAT Total",
    "Bwd IAT Mean",
    "Bwd IAT Std",
    "Bwd IAT Max",
    "Bwd IAT Min",
    # TCP flag counters
    "Fwd PSH Flags",
    "Bwd PSH Flags",
    "Fwd URG Flags",
    "Bwd URG Flags",
    "FIN Flag Count",
    "SYN Flag Count",
    "RST Flag Count",
    "PSH Flag Count",
    # more TCP flags & header metrics
    "ACK Flag Count",
    "URG Flag Count",
    "CWE Flag Count",
    "ECE Flag Count",
    "Fwd Header Length",
    "Bwd Header Length",
    "Fwd Packets/s",
    "Bwd Packets/s",
    # overall packet size distribution
    "Min Packet Length",
    "Max Packet Length",
    "Packet Length Mean",
    "Packet Length Std",
    "Packet Length Variance",
    "Down/Up Ratio",
    "Average Packet Size",
    # subflow & bulk
    "Avg Fwd Segment Size",
    "Avg Bwd Segment Size",
    "Fwd Header Length.1",
    "Fwd Avg Bytes/Bulk",
    "Fwd Avg Packets/Bulk",
    "Fwd Avg Bulk Rate",
    "Bwd Avg Bytes/Bulk",
    "Bwd Avg Packets/Bulk",
    "Bwd Avg Bulk Rate",
    "Subflow Fwd Packets",
    "Subflow Fwd Bytes",
    "Subflow Bwd Packets",
    # subflow bytes, TCP window, active/idle
    "Subflow Bwd Bytes",
    "Init_Win_bytes_forward",
    "Init_Win_bytes_backward",
    "act_data_pkt_fwd",
    "min_seg_size_forward",
    "Active Mean",
    "Active Std",
    "Active Max",
    "Active Min",
    "Idle Mean",
    "Idle Std",
    "Idle Max",
    "Idle Min",
]

# Not produced by CICFlowMeter: DNS-level and cross-flow context
EXTRA_FEATURES = {
    "unique_dest_ports": "Unique Dest Ports",
    "dns_query_length_mean": "DNS Query Length Mean",
    "dns_query_entropy": "DNS Query Entropy",
    "dns_queries_per_session": "DNS Queries Per Session",
}


def canonical(name: str) -> str:
    """CIC column name -> internal key: 'Flow Bytes/s' -> 'flow_bytes_s'."""
    return re.sub(r"[^a-z0-9]+", "_", name.strip().lower()).strip("_")


FEATURE_NAMES = [canonical(n) for n in CIC_FEATURES] + list(EXTRA_FEATURES)

# internal key -> display name (the CICFlowMeter column name where there is one)
FEATURE_LABELS: Dict[str, str] = {canonical(n): n for n in CIC_FEATURES}
FEATURE_LABELS.update(EXTRA_FEATURES)

# names used before the CICFlowMeter feature set; still accepted on input so
# older clients and alerts stored with the 17-feature schema keep working
LEGACY_ALIASES = {
    "total_bwd_packets": "total_backward_packets",
    "total_fwd_bytes": "total_length_of_fwd_packets",
    "total_bwd_bytes": "total_length_of_bwd_packets",
    "flow_bytes_per_sec": "flow_bytes_s",
    "flow_packets_per_sec": "flow_packets_s",
}

ATTACK_TYPES = [
    "NORMAL",
    "DNS_TUNNELING",
    "DOS_DDOS",
    "PORT_SCAN",
    "BRUTE_FORCE",
    "BOTNET",
]

_KNOWN = set(FEATURE_NAMES)


def to_feature_key(name: str):
    """Any accepted spelling (CIC column, internal key, legacy name) -> the
    internal key, or None when it is not a model feature."""
    key = canonical(name)
    key = LEGACY_ALIASES.get(key, key)
    return key if key in _KNOWN else None


def normalize_feature_names(features: Dict[str, float]) -> Dict[str, float]:
    """Rename a feature dict's keys to internal keys; unknown keys are dropped."""
    out = {}
    for name, value in features.items():
        key = to_feature_key(name)
        if key is not None:
            out[key] = value
    return out

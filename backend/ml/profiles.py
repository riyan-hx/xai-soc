"""
Per-attack-type flow profiles shared by the synthetic training set
(`ml_training/synthetic_data.py`), the Threat Simulator, and the
counterfactual explainer (which needs a "what would normal look like"
target). One source of truth, so the simulator can never drift from what
the model was trained on.

A flow is drawn in two steps. First a handful of *traits* are sampled
(duration, packet counts each way, payload sizes, burstiness, TCP flags,
window sizes, idle time, DNS behaviour). Then every CICFlowMeter feature is
*derived* from those traits the way the tool computes it: Flow Bytes/s is
total bytes over duration, IAT totals add up to the duration, Subflow counts
match the totals, and so on. Sampling the 81 features independently would
teach the model combinations no real capture can produce.

Each class is a shared base (normal traffic) with per-trait mean
multipliers loosely modeled on how each attack is described in IDS
literature (DoS floods packet rate and SYNs; port scans send one or two
tiny packets per port and get RSTs back; DNS tunneling inflates query
length/entropy/frequency; brute force repeats short completed logins;
botnets beacon with long, regular idle gaps). Units follow CICFlowMeter:
microseconds for durations and IATs, bytes for sizes.
"""

from typing import Dict, Optional

import numpy as np

from .features import FEATURE_NAMES

# normal-traffic mean of each trait
BASE_TRAITS: Dict[str, float] = {
    "duration_s": 2.0,  # flow lifetime, seconds
    "fwd_pkts": 12.0,
    "bwd_pkts": 10.0,
    "fwd_len": 120.0,  # mean forward packet payload, bytes
    "bwd_len": 600.0,
    "len_cv": 0.6,  # packet size spread (std / mean)
    "iat_cv": 1.2,  # burstiness of packet gaps (std / mean)
    "syn": 1.0,
    "fin": 1.0,
    "rst": 0.1,
    "psh": 3.0,
    "ack": 8.0,
    "urg": 0.02,
    "ece": 0.02,
    "hdr_len": 32.0,  # IP + TCP header bytes per packet
    "win_fwd": 8192.0,
    "win_bwd": 29200.0,
    "data_frac": 0.6,  # share of forward packets carrying payload
    "bulk": 0.1,  # share of bytes moved in bulk bursts
    "active_ms": 300.0,
    "idle_s": 1.0,
    "unique_dest_ports": 3.0,
    "dns_query_length_mean": 22.0,
    "dns_query_entropy": 3.0,
    "dns_queries_per_session": 2.0,
}

# Multiplier applied to BASE_TRAITS[trait] for that class's mean. Traits not
# listed keep multiplier 1.0 (i.e. look like normal traffic).
CLASS_MULTIPLIERS: Dict[str, Dict[str, float]] = {
    "NORMAL": {},
    "DNS_TUNNELING": {
        # data smuggled inside DNS labels -> long, high-entropy, frequent
        # queries in bigger-than-usual request packets; the flow lives longer
        # but this isn't a volumetric attack, so packet counts stay modest
        "dns_query_length_mean": 3.2,
        "dns_query_entropy": 1.8,
        "dns_queries_per_session": 4.5,
        "duration_s": 1.6,
        "fwd_len": 1.8,
        "bwd_len": 0.5,
        "fwd_pkts": 1.5,
        "bwd_pkts": 1.5,
        "unique_dest_ports": 0.6,
    },
    "DOS_DDOS": {
        # volumetric flood: many small SYN-heavy packets back-to-back at one
        # target, few replies, tiny windows, no idle time
        "fwd_pkts": 8.0,
        "bwd_pkts": 0.5,
        "fwd_len": 0.6,
        "duration_s": 0.9,
        "syn": 5.0,
        "ack": 0.3,
        "iat_cv": 0.3,
        "win_fwd": 0.1,
        "active_ms": 0.3,
        "idle_s": 0.2,
        "unique_dest_ports": 0.5,
        "dns_queries_per_session": 0.4,
    },
    "PORT_SCAN": {
        # one or two bare SYNs per port, answered by RST, no payload, very
        # short flows fanned out across many destination ports
        "unique_dest_ports": 8.0,
        "fwd_pkts": 0.2,
        "bwd_pkts": 0.15,
        "fwd_len": 0.05,
        "bwd_len": 0.02,
        "duration_s": 0.02,
        "syn": 4.0,
        "rst": 12.0,
        "ack": 0.3,
        "psh": 0.05,
        "fin": 0.1,
        "win_fwd": 0.13,
        "data_frac": 0.05,
        "active_ms": 0.1,
        "idle_s": 0.05,
        "dns_queries_per_session": 0.3,
    },
    "BRUTE_FORCE": {
        # many short, completed (ACKed) login attempts against one service,
        # small credential-sized requests at a steady, fast clip
        "fwd_pkts": 3.0,
        "bwd_pkts": 2.5,
        "fwd_len": 0.6,
        "bwd_len": 0.3,
        "duration_s": 0.5,
        "ack": 3.0,
        "psh": 3.0,
        "fin": 2.0,
        "iat_cv": 0.4,
        "win_bwd": 0.5,
        "unique_dest_ports": 0.5,
        "dns_queries_per_session": 0.4,
    },
    "BOTNET": {
        # long-lived, low-volume periodic C2 beaconing: small packets,
        # regular gaps, long idle stretches; DGA-style lookups push DNS
        # entropy/frequency up similarly to tunneling
        "duration_s": 2.2,
        "fwd_pkts": 0.8,
        "bwd_pkts": 0.6,
        "fwd_len": 0.7,
        "bwd_len": 0.4,
        "psh": 0.8,
        "iat_cv": 0.2,
        "idle_s": 3.0,
        "active_ms": 0.5,
        "dns_queries_per_session": 2.5,
        "dns_query_entropy": 1.6,
        "unique_dest_ports": 0.7,
    },
}

TRAIT_NAMES = list(BASE_TRAITS)

# relative std (fraction of the class mean) -- keeps classes realistically
# overlapping instead of perfectly separable
REL_STD = 0.22


def derive_features(t: Dict[str, np.ndarray]) -> np.ndarray:
    """Traits (each an (n,) array) -> (n, len(FEATURE_NAMES)) CICFlowMeter
    feature matrix, computed the way the tool computes them."""
    dur_s = np.maximum(t["duration_s"], 1e-4)
    dur_us = dur_s * 1e6
    tf = np.maximum(t["fwd_pkts"], 1.0)
    tb = np.maximum(t["bwd_pkts"], 0.0)
    n = tf + tb
    has_bwd = (tb > 0.5).astype(float)
    fl, bl, cv = t["fwd_len"], t["bwd_len"] * has_bwd, t["len_cv"]
    fwd_bytes, bwd_bytes = tf * fl, tb * bl
    total_bytes = fwd_bytes + bwd_bytes

    def lengths(mean):
        return mean * (1 + 2 * cv), mean * np.maximum(0.0, 1 - 1.5 * cv), mean, mean * cv

    def iats(total, count):
        mean = total / np.maximum(count - 1, 1)
        return total, mean, mean * t["iat_cv"], np.minimum(total, mean * (1 + 3 * t["iat_cv"])), mean * 0.02

    f = {}
    f["flow_duration"] = dur_us
    f["total_fwd_packets"] = tf
    f["total_backward_packets"] = tb
    f["total_length_of_fwd_packets"] = fwd_bytes
    f["total_length_of_bwd_packets"] = bwd_bytes
    f["flow_bytes_s"] = total_bytes / dur_s
    f["flow_packets_s"] = n / dur_s
    (f["fwd_packet_length_max"], f["fwd_packet_length_min"],
     f["fwd_packet_length_mean"], f["fwd_packet_length_std"]) = lengths(fl)
    (f["bwd_packet_length_max"], f["bwd_packet_length_min"],
     f["bwd_packet_length_mean"], f["bwd_packet_length_std"]) = lengths(bl)
    _, f["flow_iat_mean"], f["flow_iat_std"], f["flow_iat_max"], f["flow_iat_min"] = iats(dur_us, n)
    (f["fwd_iat_total"], f["fwd_iat_mean"], f["fwd_iat_std"],
     f["fwd_iat_max"], f["fwd_iat_min"]) = iats(dur_us * 0.98, tf)
    (f["bwd_iat_total"], f["bwd_iat_mean"], f["bwd_iat_std"],
     f["bwd_iat_max"], f["bwd_iat_min"]) = (x * has_bwd for x in iats(dur_us * 0.95, tb))
    f["fwd_psh_flags"] = t["psh"] * 0.6
    f["bwd_psh_flags"] = t["psh"] * 0.4 * has_bwd
    f["fwd_urg_flags"] = t["urg"]
    f["bwd_urg_flags"] = t["urg"] * 0.1 * has_bwd
    f["fin_flag_count"] = t["fin"]
    f["syn_flag_count"] = t["syn"]
    f["rst_flag_count"] = t["rst"]
    f["psh_flag_count"] = t["psh"]
    f["ack_flag_count"] = t["ack"]
    f["urg_flag_count"] = t["urg"]
    f["cwe_flag_count"] = t["ece"] * 0.5
    f["ece_flag_count"] = t["ece"]
    f["fwd_header_length"] = tf * t["hdr_len"]
    f["bwd_header_length"] = tb * t["hdr_len"]
    f["fwd_packets_s"] = tf / dur_s
    f["bwd_packets_s"] = tb / dur_s
    f["min_packet_length"] = np.where(has_bwd > 0, np.minimum(f["fwd_packet_length_min"], f["bwd_packet_length_min"]), f["fwd_packet_length_min"])
    f["max_packet_length"] = np.maximum(f["fwd_packet_length_max"], f["bwd_packet_length_max"])
    f["packet_length_mean"] = total_bytes / n
    f["packet_length_std"] = f["packet_length_mean"] * cv
    f["packet_length_variance"] = f["packet_length_std"] ** 2
    f["down_up_ratio"] = tb / tf
    f["average_packet_size"] = total_bytes / np.maximum(n - 1, 1)
    f["avg_fwd_segment_size"] = fl
    f["avg_bwd_segment_size"] = bl
    f["fwd_header_length_1"] = f["fwd_header_length"]
    f["fwd_avg_bytes_bulk"] = fwd_bytes * t["bulk"] * 0.3
    f["fwd_avg_packets_bulk"] = tf * t["bulk"] * 0.3
    f["fwd_avg_bulk_rate"] = f["fwd_avg_bytes_bulk"] / dur_s
    f["bwd_avg_bytes_bulk"] = bwd_bytes * t["bulk"]
    f["bwd_avg_packets_bulk"] = tb * t["bulk"]
    f["bwd_avg_bulk_rate"] = f["bwd_avg_bytes_bulk"] / dur_s
    f["subflow_fwd_packets"] = tf
    f["subflow_fwd_bytes"] = fwd_bytes
    f["subflow_bwd_packets"] = tb
    f["subflow_bwd_bytes"] = bwd_bytes
    f["init_win_bytes_forward"] = t["win_fwd"]
    f["init_win_bytes_backward"] = t["win_bwd"] * has_bwd
    f["act_data_pkt_fwd"] = tf * np.minimum(t["data_frac"], 1.0)
    f["min_seg_size_forward"] = t["hdr_len"] - 12
    active = t["active_ms"] * 1000
    f["active_mean"], f["active_std"], f["active_max"], f["active_min"] = active, active * 0.5, active * 1.8, active * 0.4
    idle = t["idle_s"] * 1e6
    f["idle_mean"], f["idle_std"], f["idle_max"], f["idle_min"] = idle, idle * 0.3, idle * 1.5, idle * 0.6
    for name in ("unique_dest_ports", "dns_query_length_mean", "dns_query_entropy", "dns_queries_per_session"):
        f[name] = t[name]

    return np.column_stack([np.clip(np.asarray(f[name], dtype=float), 0, None) for name in FEATURE_NAMES])


def class_traits(attack_type: str, intensity: float = 1.0) -> Dict[str, float]:
    """Mean traits for a class. `intensity` scales how far the class sits from
    normal traffic: 1.0 is the profile the model trained on, <1 is a stealthier
    attack that blends into benign flows, >1 is a louder one."""
    multipliers = CLASS_MULTIPLIERS[attack_type]
    # a "shrinking" multiplier (e.g. 0.15) pushed past 1.0x intensity would go
    # negative, so floor it: traffic can get quieter but never below ~zero
    return {
        name: base * max(0.03, 1.0 + (multipliers.get(name, 1.0) - 1.0) * intensity)
        for name, base in BASE_TRAITS.items()
    }


def class_means(attack_type: str, intensity: float = 1.0) -> np.ndarray:
    """Feature vector of a class's typical flow."""
    traits = class_traits(attack_type, intensity)
    return derive_features({k: np.array([v]) for k, v in traits.items()})[0]


def sample_flows(
    attack_type: str,
    n: int,
    rng: Optional[np.random.Generator] = None,
    intensity: float = 1.0,
) -> np.ndarray:
    """(n, n_features) raw flow samples for one class."""
    rng = rng or np.random.default_rng()
    means = class_traits(attack_type, intensity)
    traits = {
        name: np.clip(rng.normal(loc=mean, scale=mean * REL_STD + 1e-6, size=n), 0, None)
        for name, mean in means.items()
    }
    return derive_features(traits)


def sample_flow_dict(
    attack_type: str, rng: Optional[np.random.Generator] = None, intensity: float = 1.0
) -> Dict[str, float]:
    row = sample_flows(attack_type, 1, rng, intensity)[0]
    return {name: round(float(v), 4) for name, v in zip(FEATURE_NAMES, row)}


# a typical normal flow, feature by feature: the counterfactual target and
# the fill-in for features a client did not send
BASE_STATS: Dict[str, float] = {
    name: round(float(v), 4) for name, v in zip(FEATURE_NAMES, class_means("NORMAL"))
}


def complete_features(features: Dict[str, float]) -> Dict[str, float]:
    """Full feature vector: the given values, typical-normal values for the rest."""
    return {name: float(features.get(name, BASE_STATS[name])) for name in FEATURE_NAMES}

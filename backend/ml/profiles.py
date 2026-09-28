"""
Per-attack-type flow profiles shared by the synthetic training set
(`ml_training/synthetic_data.py`), the Threat Simulator, and the
counterfactual explainer (which needs a "what would normal look like"
target). One source of truth, so the simulator can never drift from what
the model was trained on.

Each class is a shared base flow profile with per-feature mean multipliers
loosely modeled on how each attack type is described in IDS literature
(e.g. DoS floods packet/byte rate and SYNs; port scans fan out across
destination ports with tiny packets; DNS tunneling inflates query
length/entropy/frequency while leaving packet volume near normal). Units
are illustrative, not calibrated to any one capture tool.
"""

from typing import Dict, Optional

import numpy as np

from .features import FEATURE_NAMES

BASE_STATS: Dict[str, float] = {
    "flow_duration": 2.0,
    "total_fwd_packets": 12.0,
    "total_bwd_packets": 10.0,
    "total_fwd_bytes": 1600.0,
    "total_bwd_bytes": 1400.0,
    "packet_length_mean": 500.0,
    "packet_length_std": 120.0,
    "flow_bytes_per_sec": 2200.0,
    "flow_packets_per_sec": 6.0,
    "fwd_iat_mean": 55.0,
    "bwd_iat_mean": 60.0,
    "syn_flag_count": 2.0,
    "ack_flag_count": 3.0,
    "unique_dest_ports": 3.0,
    "dns_query_length_mean": 22.0,
    "dns_query_entropy": 3.0,
    "dns_queries_per_session": 2.0,
}

# Multiplier applied to BASE_STATS[feature] for that class's mean. Features
# not listed keep multiplier 1.0 (i.e. look like normal traffic).
CLASS_MULTIPLIERS: Dict[str, Dict[str, float]] = {
    "NORMAL": {},
    "DNS_TUNNELING": {
        # data smuggled inside DNS labels -> long, high-entropy, frequent
        # queries; flow lives longer, byte rate creeps up, but this isn't a
        # volumetric attack so packet/port counts stay close to normal
        "dns_query_length_mean": 3.2,
        "dns_query_entropy": 1.8,
        "dns_queries_per_session": 4.5,
        "flow_duration": 1.6,
        "flow_bytes_per_sec": 1.3,
        "unique_dest_ports": 0.6,
    },
    "DOS_DDOS": {
        # volumetric flood: packet/byte rate and SYNs spike hard, packets
        # arrive back-to-back (near-zero inter-arrival time), single target
        "total_fwd_packets": 8.0,
        "total_fwd_bytes": 6.0,
        "flow_packets_per_sec": 9.0,
        "flow_bytes_per_sec": 7.0,
        "syn_flag_count": 5.0,
        "fwd_iat_mean": 0.15,
        "unique_dest_ports": 0.5,
        "dns_queries_per_session": 0.4,
    },
    "PORT_SCAN": {
        # many destination ports probed with tiny packets, mostly bare SYNs
        # that never complete a handshake, each flow is very short-lived
        "unique_dest_ports": 8.0,
        "total_fwd_bytes": 0.3,
        "packet_length_mean": 0.35,
        "syn_flag_count": 4.0,
        "ack_flag_count": 0.3,
        "flow_duration": 0.3,
        "dns_queries_per_session": 0.3,
    },
    "BRUTE_FORCE": {
        # many short, completed (ACKed) attempts against one service/port,
        # fired at a steady but faster-than-normal clip
        "total_fwd_packets": 3.0,
        "ack_flag_count": 3.0,
        "flow_duration": 0.5,
        "fwd_iat_mean": 0.6,
        "unique_dest_ports": 0.5,
        "dns_queries_per_session": 0.4,
    },
    "BOTNET": {
        # long-lived, low-volume periodic C2 beaconing; DGA-style lookups
        # push DNS entropy/frequency up similarly to tunneling but with
        # smaller packets and longer, steadier inter-arrival gaps
        "flow_duration": 2.2,
        "fwd_iat_mean": 1.4,
        "bwd_iat_mean": 1.4,
        "dns_queries_per_session": 2.5,
        "dns_query_entropy": 1.6,
        "unique_dest_ports": 0.7,
        "packet_length_mean": 0.7,
    },
}

# relative std (fraction of the class mean) -- keeps classes realistically
# overlapping instead of perfectly separable
REL_STD = 0.22


def class_means(attack_type: str, intensity: float = 1.0) -> np.ndarray:
    """Mean vector for a class. `intensity` scales how far the class sits from
    normal traffic: 1.0 is the profile the model trained on, <1 is a stealthier
    attack that blends into benign flows, >1 is a louder one."""
    multipliers = CLASS_MULTIPLIERS[attack_type]
    # a "shrinking" multiplier (e.g. 0.15) pushed past 1.0x intensity would go
    # negative, so floor it: traffic can get quieter but never below ~zero
    return np.array(
        [
            BASE_STATS[f] * max(0.03, 1.0 + (multipliers.get(f, 1.0) - 1.0) * intensity)
            for f in FEATURE_NAMES
        ]
    )


def sample_flows(
    attack_type: str,
    n: int,
    rng: Optional[np.random.Generator] = None,
    intensity: float = 1.0,
) -> np.ndarray:
    """(n, n_features) raw flow samples for one class."""
    rng = rng or np.random.default_rng()
    means = class_means(attack_type, intensity)
    stds = means * REL_STD + 1e-6
    data = rng.normal(loc=means, scale=stds, size=(n, len(FEATURE_NAMES)))
    return np.clip(data, 0, None)


def sample_flow_dict(
    attack_type: str, rng: Optional[np.random.Generator] = None, intensity: float = 1.0
) -> Dict[str, float]:
    row = sample_flows(attack_type, 1, rng, intensity)[0]
    return {name: round(float(v), 4) for name, v in zip(FEATURE_NAMES, row)}

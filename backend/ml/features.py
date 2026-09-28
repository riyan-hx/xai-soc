"""
Shared feature schema for the IDS model.

These are protocol-agnostic flow/statistical features (not payload bytes), so
they work on encrypted traffic such as DoH. Swap this list for your chosen
dataset's real feature set once confirmed (see PRD §3/§8) -- the rest of the
pipeline (preprocess/model/classifier/xai/alerts) does not need to change,
only this list and the training data.
"""

FEATURE_NAMES = [
    "flow_duration",
    "total_fwd_packets",
    "total_bwd_packets",
    "total_fwd_bytes",
    "total_bwd_bytes",
    "packet_length_mean",
    "packet_length_std",
    "flow_bytes_per_sec",
    "flow_packets_per_sec",
    "fwd_iat_mean",
    "bwd_iat_mean",
    "syn_flag_count",
    "ack_flag_count",
    "unique_dest_ports",
    "dns_query_length_mean",
    "dns_query_entropy",
    "dns_queries_per_session",
]

ATTACK_TYPES = [
    "NORMAL",
    "DNS_TUNNELING",
    "DOS_DDOS",
    "PORT_SCAN",
    "BRUTE_FORCE",
    "BOTNET",
]

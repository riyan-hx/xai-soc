"""CICFlowMeter feature schema and the flow generator built on it."""

import numpy as np
from fastapi.testclient import TestClient

from api.main import app
from ml.features import CIC_FEATURES, FEATURE_NAMES, normalize_feature_names, to_feature_key
from ml.profiles import sample_flow_dict


def test_schema_is_the_77_cicflowmeter_features_plus_dns_extras():
    assert len(CIC_FEATURES) == 77
    assert len(FEATURE_NAMES) == len(set(FEATURE_NAMES)) == 81
    assert FEATURE_NAMES[:3] == ["flow_duration", "total_fwd_packets", "total_backward_packets"]
    assert "dns_query_entropy" in FEATURE_NAMES


def test_cic_column_names_and_legacy_names_map_to_internal_keys():
    assert to_feature_key(" Flow Bytes/s") == "flow_bytes_s"
    assert to_feature_key("Fwd Header Length.1") == "fwd_header_length_1"
    assert to_feature_key("Init_Win_bytes_forward") == "init_win_bytes_forward"
    assert to_feature_key("total_fwd_bytes") == "total_length_of_fwd_packets"
    assert to_feature_key("Label") is None
    assert normalize_feature_names({"Down/Up Ratio": 2.0, "Source IP": 1.0}) == {"down_up_ratio": 2.0}


def test_generated_flows_are_internally_consistent():
    rng = np.random.default_rng(0)
    for attack in ("NORMAL", "DOS_DDOS", "PORT_SCAN"):
        f = sample_flow_dict(attack, rng)
        seconds = f["flow_duration"] / 1e6
        total_bytes = f["total_length_of_fwd_packets"] + f["total_length_of_bwd_packets"]
        packets = f["total_fwd_packets"] + f["total_backward_packets"]
        assert np.isclose(f["flow_bytes_s"], total_bytes / seconds, rtol=1e-3)
        assert np.isclose(f["flow_packets_s"], packets / seconds, rtol=1e-3)
        assert np.isclose(f["packet_length_variance"], f["packet_length_std"] ** 2, rtol=1e-3)
        assert f["subflow_fwd_packets"] == f["total_fwd_packets"]
        assert f["fwd_packet_length_min"] <= f["fwd_packet_length_mean"] <= f["fwd_packet_length_max"]


def test_ingest_accepts_cic_column_names_and_partial_flows(dos_features):
    from ml.features import FEATURE_LABELS

    cic_named = {FEATURE_LABELS[k]: v for k, v in dos_features.items()}
    with TestClient(app) as client:
        r = client.post("/api/ingest", json={"features": cic_named, "source_ip": "10.9.9.1", "dest_ip": "10.9.9.2"})
        assert r.status_code == 200 and r.json()["attack_type"] == "DOS_DDOS"

        # a flow with only a few measurements is completed with normal values
        partial = client.post("/api/ingest", json={"features": {"Flow Duration": 2_000_000}})
        assert partial.status_code == 200

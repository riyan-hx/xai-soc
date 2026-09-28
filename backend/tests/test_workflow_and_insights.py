"""Case workflow, what-if / counterfactual explainer, simulator, insights."""

from fastapi.testclient import TestClient

from api.main import app


def _login(client, email="admin@xai-soc.local", password="changeme"):
    r = client.post("/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _ingest(client, features, src="10.9.0.1", dst="10.9.0.2"):
    r = client.post("/api/ingest", json={"features": features, "source_ip": src, "dest_ip": dst})
    assert r.status_code == 200 and r.json() is not None
    return r.json()


def _make_viewer(client, headers):
    r = client.post(
        "/api/users",
        headers=headers,
        json={"name": "Vera Viewer", "email": "viewer@xai-soc.local", "password": "viewer-pass-1", "role": "VIEWER"},
    )
    assert r.status_code in (200, 400)  # 400 when an earlier test already created it
    return _login(client, "viewer@xai-soc.local", "viewer-pass-1")


def test_new_alert_defaults_to_new_status_and_carries_top_features(dos_features):
    with TestClient(app) as client:
        headers = _login(client)
        alert = _ingest(client, dos_features)
        assert alert["status"] == "NEW"
        assert alert["origin"] == "ingest"
        detail = client.get(f"/api/alerts/{alert['id']}", headers=headers).json()
        assert detail["timestamp"].endswith("Z")
        assert detail["features"]["flow_packets_per_sec"] > 0
        assert detail["techniques"] and detail["techniques"][0]["url"].startswith("https://attack.mitre.org/")
        assert len(detail["playbook"]["steps"]) >= 3
        listed = client.get(f"/api/alerts?q={alert['source_ip']}", headers=headers).json()["items"]
        assert any(a["id"] == alert["id"] and a["top_features"] for a in listed)


def test_status_assignment_and_notes_are_audited(dos_features):
    with TestClient(app) as client:
        headers = _login(client)
        alert = _ingest(client, dos_features)
        me = client.get("/api/auth/me", headers=headers).json()

        r = client.patch(
            f"/api/alerts/{alert['id']}",
            headers=headers,
            json={"status": "INVESTIGATING", "assignee_id": me["id"]},
        )
        assert r.status_code == 200
        assert r.json()["status"] == "INVESTIGATING"
        assert r.json()["assignee_name"] == me["name"]

        r = client.post(f"/api/alerts/{alert['id']}/events", headers=headers, json={"body": "Checked the firewall logs."})
        assert r.status_code == 200 and r.json()["kind"] == "NOTE"

        events = client.get(f"/api/alerts/{alert['id']}/events", headers=headers).json()
        kinds = [e["kind"] for e in events]
        assert kinds.count("STATUS") == 1 and kinds.count("ASSIGN") == 1 and kinds.count("NOTE") == 1
        assert events[0]["created_at"].endswith("Z")

        assert client.patch(f"/api/alerts/{alert['id']}", headers=headers, json={"status": "BOGUS"}).status_code == 422


def test_verdict_moves_case_status(dos_features):
    with TestClient(app) as client:
        headers = _login(client)
        alert = _ingest(client, dos_features)
        r = client.post(f"/api/alerts/{alert['id']}/feedback", headers=headers, json={"is_true_positive": False})
        assert r.json()["status"] == "FALSE_POSITIVE"
        assert client.get(f"/api/alerts/{alert['id']}", headers=headers).json()["status"] == "FALSE_POSITIVE"


def test_viewer_cannot_triage_or_simulate(dos_features):
    with TestClient(app) as client:
        admin = _login(client)
        viewer = _make_viewer(client, admin)
        alert = _ingest(client, dos_features)
        assert client.patch(f"/api/alerts/{alert['id']}", headers=viewer, json={"status": "RESOLVED"}).status_code == 403
        assert (
            client.post(f"/api/alerts/{alert['id']}/feedback", headers=viewer, json={"is_true_positive": True}).status_code
            == 403
        )
        assert client.post("/api/simulate", headers=viewer, json={"scenario": "DOS_DDOS"}).status_code == 403
        assert client.post("/api/simulate/backfill", headers=viewer, json={}).status_code == 403
        # viewers can still read and probe the model
        assert client.get(f"/api/alerts/{alert['id']}", headers=viewer).status_code == 200
        assert client.get("/api/users/directory", headers=viewer).status_code == 200


def test_whatif_rescoring_changes_with_edited_features(dos_features):
    with TestClient(app) as client:
        headers = _login(client)
        alert = _ingest(client, dos_features)
        same = client.post(f"/api/alerts/{alert['id']}/whatif", headers=headers, json={"overrides": {}}).json()
        assert same["baseline"]["label"] == same["scenario"]["label"] == alert["attack_type"]
        assert same["changed"] == []

        calm = {
            "flow_packets_per_sec": 6.0,
            "flow_bytes_per_sec": 2200.0,
            "total_fwd_packets": 12.0,
            "total_fwd_bytes": 1600.0,
            "syn_flag_count": 2.0,
            "fwd_iat_mean": 55.0,
            "unique_dest_ports": 3.0,
            "dns_queries_per_session": 2.0,
        }
        out = client.post(f"/api/alerts/{alert['id']}/whatif", headers=headers, json={"overrides": calm}).json()
        assert out["scenario"]["label"] == "NORMAL"
        assert sorted(out["changed"]) == sorted(calm)
        assert abs(sum(out["scenario"]["probabilities"].values()) - 1) < 1e-3

        bad = client.post(f"/api/alerts/{alert['id']}/whatif", headers=headers, json={"overrides": {"nope": 1}})
        assert bad.status_code == 422


def test_counterfactual_flips_verdict_to_normal(dos_features):
    with TestClient(app) as client:
        headers = _login(client)
        alert = _ingest(client, dos_features)
        cf = client.post(f"/api/alerts/{alert['id']}/counterfactual", headers=headers).json()
        assert cf["found"] is True
        assert cf["changes"], "a flood needs at least one feature change to look normal"
        assert cf["result"]["is_attack"] is False
        # every suggested change moves the value toward the normal profile
        for c in cf["changes"]:
            assert abs(c["to"] - c["normal_value"]) < abs(c["from"] - c["normal_value"])


def test_simulator_runs_real_pipeline_and_reports_detection(dos_features):
    with TestClient(app) as client:
        headers = _login(client)
        r = client.post(
            "/api/simulate", headers=headers, json={"scenario": "PORT_SCAN", "count": 4, "intensity": 1.0}
        )
        assert r.status_code == 200
        body = r.json()
        assert body["summary"]["sent"] == 4
        assert body["summary"]["attacks_sent"] == 4
        assert body["summary"]["attacks_detected"] >= 1
        created = [x for x in body["results"] if x["alert"]]
        assert created and created[0]["alert"]["origin"] == "simulator"
        assert len({x["source_ip"] for x in body["results"]}) == 1  # one campaign

        benign = client.post("/api/simulate", headers=headers, json={"scenario": "NORMAL", "count": 3}).json()
        assert benign["summary"]["attacks_sent"] == 0

        assert client.post("/api/simulate", headers=headers, json={"scenario": "MELTDOWN"}).status_code == 422


def test_backfill_seeds_history_and_is_replaceable():
    with TestClient(app) as client:
        headers = _login(client)
        r = client.post("/api/simulate/backfill", headers=headers, json={"days": 3, "per_day": 4, "reset": True})
        assert r.status_code == 200
        first = r.json()
        assert first["created"] > 0
        r2 = client.post("/api/simulate/backfill", headers=headers, json={"days": 3, "per_day": 4, "reset": True})
        assert r2.json()["removed"] == first["created"]

        seeded = client.get("/api/alerts?limit=100", headers=headers).json()["items"]
        assert any(a["origin"] == "seed" for a in seeded)


def test_overview_timeseries_and_model_insights(dos_features):
    with TestClient(app) as client:
        headers = _login(client)
        _ingest(client, dos_features)

        ov = client.get("/api/stats/overview", headers=headers).json()
        assert ov["kpis"]["alerts"]["value"] >= 1
        assert 0 <= ov["posture"]["index"] <= 100
        assert ov["posture"]["band"] in {"Calm", "Elevated", "High", "Severe"}
        assert set(ov["leaders"]) == {"week", "month"}
        assert ov["top_sources"] and ov["top_targets"]

        for rng, n in (("24h", 24), ("7d", 28), ("30d", 30), ("90d", 90)):
            ts = client.get(f"/api/stats/timeseries?range={rng}", headers=headers).json()
            assert len(ts["points"]) == n
            assert ts["total"] == sum(p["count"] for p in ts["points"])
        assert client.get("/api/stats/timeseries?range=1y", headers=headers).status_code == 422

        mi = client.get("/api/model/insights", headers=headers).json()
        assert mi["dataset"]["synthetic"] is True
        assert len(mi["importance"]) == 17
        assert set(mi["calibration"]).issuperset({"buckets", "verdicts", "seeded_share"})
        assert mi["observed_attribution"]["sample_size"] >= 1


def test_ingest_api_key_is_enforced_when_configured(dos_features, monkeypatch):
    monkeypatch.setenv("INGEST_API_KEY", "collector-secret")
    with TestClient(app) as client:
        body = {"features": dos_features, "source_ip": "10.9.1.1", "dest_ip": "10.9.1.2"}
        assert client.post("/api/ingest", json=body).status_code == 401
        assert client.post("/api/ingest", json=body, headers={"X-API-Key": "wrong"}).status_code == 401
        assert client.post("/api/ingest", json=body, headers={"X-API-Key": "collector-secret"}).status_code == 200


def test_simulator_dry_run_scores_without_storing():
    with TestClient(app) as client:
        headers = _login(client)
        before = client.get("/api/alerts?limit=1", headers=headers).json()["total"]
        r = client.post(
            "/api/simulate",
            headers=headers,
            json={"scenario": "BRUTE_FORCE", "count": 6, "intensity": 0.4, "dry_run": True},
        )
        assert r.status_code == 200
        body = r.json()
        assert body["dry_run"] is True
        assert all(x["alert_id"] is None for x in body["results"])
        assert body["summary"]["mean_true_class_probability"] is not None
        assert client.get("/api/alerts?limit=1", headers=headers).json()["total"] == before


def test_removing_a_user_with_history_revokes_access_but_keeps_the_record(dos_features):
    with TestClient(app) as client:
        admin = _login(client)
        r = client.post(
            "/api/users",
            headers=admin,
            json={"name": "Temp Analyst", "email": "temp@xai-soc.local", "password": "temp-pass-123", "role": "ANALYST"},
        )
        assert r.status_code in (200, 400)
        temp = _login(client, "temp@xai-soc.local", "temp-pass-123")
        alert = _ingest(client, dos_features)
        assert client.post(f"/api/alerts/{alert['id']}/feedback", headers=temp, json={"is_true_positive": True}).status_code == 200

        users = client.get("/api/users", headers=admin).json()
        temp_id = next(u["id"] for u in users if u["email"] == "temp@xai-soc.local")
        assert client.delete(f"/api/users/{temp_id}", headers=admin).json() == {"deactivated": temp_id}

        # token no longer works, login refused, no longer listed, verdict still on the alert
        assert client.get("/api/auth/me", headers=temp).status_code == 401
        assert client.post("/api/auth/login", json={"email": "temp@xai-soc.local", "password": "temp-pass-123"}).status_code == 401
        assert all(u["email"] != "temp@xai-soc.local" for u in client.get("/api/users", headers=admin).json())
        events = client.get(f"/api/alerts/{alert['id']}/events", headers=admin).json()
        assert any(e["kind"] == "VERDICT" and e["user_name"] == "Temp Analyst" for e in events)


def test_admin_cannot_remove_themselves():
    with TestClient(app) as client:
        admin = _login(client)
        me = client.get("/api/auth/me", headers=admin).json()
        assert client.delete(f"/api/users/{me['id']}", headers=admin).status_code == 400


def test_security_posture_is_admin_only_and_reports_states_not_secrets(monkeypatch):
    monkeypatch.delenv("INGEST_API_KEY", raising=False)
    with TestClient(app) as client:
        admin = _login(client)
        viewer = _make_viewer(client, admin)
        assert client.get("/api/system/security", headers=viewer).status_code == 403
        body = client.get("/api/system/security", headers=admin).json()
        ids = {f["id"] for f in body["findings"]}
        assert "ingest-open" in ids
        assert "default-admin-password" in ids  # the test DB is seeded with the default
        assert "changeme" not in str(body) and "test-secret" not in str(body)

        monkeypatch.setenv("INGEST_API_KEY", "k")
        ids = {f["id"] for f in client.get("/api/system/security", headers=admin).json()["findings"]}
        assert "ingest-open" not in ids

from datetime import datetime

from fastapi.testclient import TestClient

from api.main import app


def _login(client):
    r = client.post(
        "/api/auth/login", json={"email": "admin@xai-soc.local", "password": "changeme"}
    )
    assert r.status_code == 200
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_health():
    with TestClient(app) as client:
        r = client.get("/api/health")
        assert r.status_code == 200
        assert r.json() == {"status": "ok"}


def test_login_rejects_bad_password():
    with TestClient(app) as client:
        r = client.post(
            "/api/auth/login", json={"email": "admin@xai-soc.local", "password": "wrong"}
        )
        assert r.status_code == 401


def test_alerts_require_auth():
    with TestClient(app) as client:
        r = client.get("/api/alerts")
        assert r.status_code == 401


def test_open_access_acts_as_admin_without_token(monkeypatch):
    from api import security

    monkeypatch.setattr(security, "OPEN_ACCESS", True)
    with TestClient(app) as client:
        r = client.get("/api/auth/me")
        assert r.status_code == 200
        assert r.json()["role"] == "ADMIN"
        assert client.get("/api/alerts").status_code == 200
        # a bad token is still rejected, not silently upgraded
        bad = {"Authorization": "Bearer not-a-token"}
        assert client.get("/api/alerts", headers=bad).status_code == 401


def test_me_returns_current_user():
    with TestClient(app) as client:
        headers = _login(client)
        r = client.get("/api/auth/me", headers=headers)
        assert r.status_code == 200
        assert r.json()["email"] == "admin@xai-soc.local"
        assert r.json()["role"] == "ADMIN"


def test_ingest_creates_explained_alert_visible_in_list(dos_features):
    with TestClient(app) as client:
        headers = _login(client)

        r = client.post(
            "/api/ingest",
            json={"features": dos_features, "source_ip": "10.0.0.5", "dest_ip": "10.0.0.1"},
        )
        assert r.status_code == 200
        alert = r.json()
        assert alert is not None
        assert alert["attack_type"] != "NORMAL"
        assert alert["risk_score"] is not None

        r = client.get("/api/alerts", headers=headers)
        assert r.status_code == 200
        body = r.json()
        assert body["total"] >= 1
        assert any(a["id"] == alert["id"] for a in body["items"])

        r = client.get(f"/api/alerts/{alert['id']}", headers=headers)
        assert r.status_code == 200
        detail = r.json()
        assert detail["explanation"] is not None
        assert len(detail["explanation"]["important_features"]) > 0


def test_feedback_roundtrip(dos_features):
    with TestClient(app) as client:
        headers = _login(client)
        r = client.post(
            "/api/ingest",
            json={"features": dos_features, "source_ip": "10.0.0.6", "dest_ip": "10.0.0.1"},
        )
        alert_id = r.json()["id"]

        r = client.post(
            f"/api/alerts/{alert_id}/feedback",
            headers=headers,
            json={"is_true_positive": True, "notes": "confirmed by analyst"},
        )
        assert r.status_code == 200
        assert r.json()["recorded"] is True

        r = client.get("/api/stats", headers=headers)
        assert r.json()["feedback"]["true_positives"] >= 1


def test_alerts_pagination_respects_limit():
    with TestClient(app) as client:
        headers = _login(client)
        r = client.get("/api/alerts?limit=1", headers=headers)
        assert r.status_code == 200
        assert len(r.json()["items"]) <= 1


def test_alerts_multi_select_attack_type_filter(dos_features, port_scan_features):
    with TestClient(app) as client:
        headers = _login(client)
        client.post(
            "/api/ingest",
            json={"features": dos_features, "source_ip": "10.0.0.20", "dest_ip": "10.0.0.1"},
        )
        client.post(
            "/api/ingest",
            json={"features": port_scan_features, "source_ip": "10.0.0.21", "dest_ip": "10.0.0.1"},
        )

        r = client.get(
            "/api/alerts?attack_type=DOS_DDOS&attack_type=PORT_SCAN", headers=headers
        )
        assert r.status_code == 200
        types = {a["attack_type"] for a in r.json()["items"]}
        assert types <= {"DOS_DDOS", "PORT_SCAN"}
        assert types & {"DOS_DDOS", "PORT_SCAN"}


def test_alerts_since_filters_to_only_newer_alerts(dos_features):
    with TestClient(app) as client:
        headers = _login(client)
        far_future = "2099-01-01T00:00:00"
        r = client.get(f"/api/alerts?since={far_future}", headers=headers)
        assert r.status_code == 200
        assert r.json()["items"] == []
        assert r.json()["total"] == 0


def test_alerts_search_matches_description(dos_features):
    with TestClient(app) as client:
        headers = _login(client)
        r = client.post(
            "/api/ingest",
            json={"features": dos_features, "source_ip": "10.0.0.30", "dest_ip": "10.0.0.1"},
        )
        alert = r.json()

        r = client.get("/api/alerts?q=flow_packets_per_sec", headers=headers)
        assert r.status_code == 200
        assert any(a["id"] == alert["id"] for a in r.json()["items"])


def test_alerts_grouped_clusters_repeated_source(port_scan_features):
    with TestClient(app) as client:
        headers = _login(client)
        for _ in range(3):
            client.post(
                "/api/ingest",
                json={
                    "features": port_scan_features,
                    "source_ip": "10.0.0.99",
                    "dest_ip": "10.0.0.1",
                },
            )

        r = client.get("/api/alerts/grouped?q=10.0.0.99", headers=headers)
        assert r.status_code == 200
        items = r.json()["items"]
        assert len(items) == 1
        assert items[0]["source_ip"] == "10.0.0.99"
        assert items[0]["count"] == 3
        assert items[0]["latest_alert_id"]


def test_feedback_recent_reflects_triage_activity(dos_features):
    with TestClient(app) as client:
        headers = _login(client)
        r = client.post(
            "/api/ingest",
            json={"features": dos_features, "source_ip": "10.0.0.40", "dest_ip": "10.0.0.1"},
        )
        alert_id = r.json()["id"]
        client.post(
            f"/api/alerts/{alert_id}/feedback",
            headers=headers,
            json={"is_true_positive": True},
        )

        r = client.get("/api/feedback/recent", headers=headers)
        assert r.status_code == 200
        items = r.json()
        assert any(i["alert_id"] == alert_id and i["is_true_positive"] is True for i in items)
        assert items[0]["user_name"] == "Admin"


def test_stats_heatmap_includes_today_with_ingested_alerts(dos_features):
    with TestClient(app) as client:
        headers = _login(client)
        client.post(
            "/api/ingest",
            json={"features": dos_features, "source_ip": "10.0.0.41", "dest_ip": "10.0.0.1"},
        )

        r = client.get("/api/stats/heatmap", headers=headers)
        assert r.status_code == 200
        days = r.json()
        today = datetime.utcnow().date().isoformat()
        today_entry = next((d for d in days if d["date"] == today), None)
        assert today_entry is not None
        assert today_entry["count"] >= 1
        assert today_entry["max_risk_score"] > 0


def test_non_admin_cannot_manage_users():
    with TestClient(app) as client:
        admin_headers = _login(client)
        r = client.post(
            "/api/users",
            headers=admin_headers,
            json={"name": "Analyst One", "email": "analyst@xai-soc.local", "password": "pw123456", "role": "ANALYST"},
        )
        assert r.status_code == 200

        r = client.post(
            "/api/auth/login", json={"email": "analyst@xai-soc.local", "password": "pw123456"}
        )
        analyst_headers = {"Authorization": f"Bearer {r.json()['access_token']}"}

        r = client.get("/api/users", headers=analyst_headers)
        assert r.status_code == 403

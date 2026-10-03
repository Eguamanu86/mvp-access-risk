"""Pruebas de los endpoints HTTP del servicio de inferencia (Flask test client)."""

import os
import sys

import pytest

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BASE)

from src.app import create_app

FIXTURE = os.path.join(BASE, "tests", "fixtures", "model-baseline.json")


@pytest.fixture(autouse=True)
def _isolate_manage_token(monkeypatch):
    """Las pruebas no dependen del MANAGE_TOKEN del entorno del contenedor."""
    monkeypatch.delenv("MANAGE_TOKEN", raising=False)

HIGH = {"deviceKnown": False, "failedAttempts": 3, "locationShiftKm": 900, "hour": 3, "velocityKmh": 900}
LOW = {"deviceKnown": True, "failedAttempts": 0, "locationShiftKm": 5, "hour": 14, "velocityKmh": 10}


def client():
    app = create_app(FIXTURE)
    app.testing = True
    return app.test_client()


def test_health():
    response = client().get("/health")
    assert response.status_code == 200
    assert response.get_json()["status"] == "ok"


def test_predict_returns_level():
    response = client().post("/predict", json=HIGH)
    assert response.status_code == 200
    assert response.get_json()["data"]["level"] == "HIGH"


def test_metrics_counts_requests():
    api = client()
    api.post("/predict", json=LOW)
    response = api.get("/metrics")
    assert response.get_json()["data"]["requests"] == 1


def test_reset_clears_metrics():
    api = client()
    api.post("/predict", json=LOW)
    api.post("/reset")
    assert api.get("/metrics").get_json()["data"]["requests"] == 0


def test_drift_toggle():
    response = client().post("/drift", json={"on": True})
    assert response.get_json()["data"]["driftForced"] is True


def test_model_endpoint_exposes_version():
    response = client().get("/model")
    assert response.status_code == 200
    assert response.get_json()["data"]["version"]


def test_predict_rejects_invalid_signals():
    invalid = {"deviceKnown": True, "failedAttempts": 99, "locationShiftKm": 5, "hour": 14, "velocityKmh": 10}
    response = client().post("/predict", json=invalid)
    assert response.status_code == 400


def test_model_versions_endpoint():
    response = client().get("/model/versions")
    assert response.status_code == 200
    assert "versions" in response.get_json()["data"]


def test_pipeline_endpoint():
    response = client().get("/model/pipeline")
    assert response.status_code == 200
    assert response.get_json()["data"]["status"] in ("idle", "running", "success", "failed")


def test_predict_reports_latency():
    data = client().post("/predict", json=LOW).get_json()["data"]
    assert data["latencyMs"] >= 0


def test_manage_endpoints_require_token(monkeypatch):
    monkeypatch.setenv("MANAGE_TOKEN", "secret")
    api = client()
    assert api.post("/model/promote", json={"version": "1.0.0"}).status_code == 401
    assert api.post("/drift", json={"on": True}).status_code == 401


def test_manage_endpoint_accepts_valid_token(monkeypatch):
    monkeypatch.setenv("MANAGE_TOKEN", "secret")
    api = client()
    response = api.post("/drift", json={"on": True}, headers={"x-manage-token": "secret"})
    assert response.status_code == 200
    assert response.get_json()["data"]["driftForced"] is True

"""Pruebas unitarias del dominio de riesgo (sin dependencias externas)."""

import sys
import os

import pytest

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BASE)

from src.risk_model import RiskModel, validate_signals

# Modelo base fijo (no depende del modelo activo, que puede cambiar con promote/retrain).
FIXTURE = os.path.join(BASE, "tests", "fixtures", "model-baseline.json")

LOW = {"deviceKnown": True, "failedAttempts": 0, "locationShiftKm": 5, "hour": 14, "velocityKmh": 10}
MEDIUM = {"deviceKnown": True, "failedAttempts": 2, "locationShiftKm": 400, "hour": 14, "velocityKmh": 400}
HIGH = {"deviceKnown": False, "failedAttempts": 3, "locationShiftKm": 900, "hour": 3, "velocityKmh": 900}


def new_model():
    return RiskModel(FIXTURE)


def test_low_risk_scenario():
    assert new_model().predict(LOW)["level"] == "LOW"


def test_medium_risk_scenario():
    assert new_model().predict(MEDIUM)["level"] == "MEDIUM"


def test_high_risk_scenario():
    assert new_model().predict(HIGH)["level"] == "HIGH"


def test_prediction_is_deterministic():
    m = new_model()
    assert m.predict(HIGH)["score"] == m.predict(HIGH)["score"]


def test_drift_detected_when_distribution_shifts():
    m = new_model()
    for i in range(60):
        m.predict({"deviceKnown": False, "failedAttempts": 1,
                   "locationShiftKm": 600 + int(i / 60 * 400), "hour": 2, "velocityKmh": 700})
    assert m.drift()["detected"] is True


def test_no_drift_with_normal_traffic():
    m = new_model()
    for i in range(60):
        m.predict({"deviceKnown": True, "failedAttempts": 0,
                   "locationShiftKm": int(i / 60 * 1000), "hour": 14, "velocityKmh": 50})
    assert m.drift()["detected"] is False


def test_metrics_counts_requests():
    m = new_model()
    m.predict(LOW)
    m.predict(HIGH)
    metrics = m.metrics()
    assert metrics["requests"] == 2
    assert metrics["levelCounts"]["LOW"] == 1
    assert metrics["levelCounts"]["HIGH"] == 1


def test_validate_rejects_out_of_range():
    invalid = {"deviceKnown": True, "failedAttempts": 9, "locationShiftKm": 5, "hour": 14, "velocityKmh": 10}
    with pytest.raises(ValueError):
        validate_signals(invalid)


def test_validate_rejects_missing_signal():
    with pytest.raises(ValueError):
        validate_signals({"deviceKnown": True})

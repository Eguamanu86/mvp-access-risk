"""
Dominio del servicio de inferencia: carga del modelo y prediccion de riesgo.

Responsabilidad unica: dado un conjunto de senales de un intento de acceso,
devolver un score de riesgo y su nivel. Ademas mantiene la ventana de entradas
recientes para el calculo de data drift (PSI).
"""

import json
import math
import os
import time
from collections import deque

BINS = 10
DRIFT_THRESHOLD = 0.25

SIGNAL_RANGES = {
    "failedAttempts": (0, 5),
    "locationShiftKm": (0, 1000),
    "hour": (0, 23),
    "velocityKmh": (0, 1200),
}


def validate_signals(signals):
    """Valida el contrato de entrada; lanza ValueError (se traduce a 400)."""
    if not isinstance(signals, dict):
        raise ValueError("signals debe ser un objeto")
    if "deviceKnown" not in signals:
        raise ValueError('falta la senal "deviceKnown"')
    if not isinstance(signals["deviceKnown"], bool):
        raise ValueError('la senal "deviceKnown" debe ser booleana')
    for field, (low, high) in SIGNAL_RANGES.items():
        if field not in signals:
            raise ValueError('falta la senal "%s"' % field)
        value = signals[field]
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise ValueError('la senal "%s" debe ser numerica' % field)
        if value < low or value > high:
            raise ValueError('la senal "%s" debe estar entre %s y %s' % (field, low, high))


def _sigmoid(z):
    if z < -60:
        return 0.0
    if z > 60:
        return 1.0
    return 1.0 / (1.0 + math.exp(-z))


class RiskModel:
    """Carga el modelo desde model.json y expone prediccion + drift."""

    def __init__(self, model_path, window_size=200):
        with open(model_path, "r", encoding="utf-8") as fh:
            self._model = json.load(fh)
        self._weights = self._model["weights"]
        self._bias = self._model["bias"]
        self._thresholds = self._model["thresholds"]
        self._reference = self._model["reference"]["locationShift"]
        self._window = deque(maxlen=window_size)
        self._latencies = deque(maxlen=window_size)
        self._level_counts = {"LOW": 0, "MEDIUM": 0, "HIGH": 0}
        self._requests = 0
        self._drift_forced = False

    @property
    def version(self):
        return self._model["version"]

    # --- Normalizacion de senales a las features del modelo ---
    def _to_features(self, signals):
        device_unknown = 0.0 if signals.get("deviceKnown") else 1.0
        failed = min(int(signals.get("failedAttempts", 0)), 5) / 5.0
        location = min(int(signals.get("locationShiftKm", 0)), 1000) / 1000.0
        hour = int(signals.get("hour", 12))
        unusual = 1.0 if (hour < 6 or hour >= 23) else 0.0
        velocity = min(int(signals.get("velocityKmh", 0)), 1200) / 1200.0
        return [device_unknown, failed, location, unusual, velocity]

    def _level(self, score):
        if score < self._thresholds["low"]:
            return "LOW"
        if score > self._thresholds["high"]:
            return "HIGH"
        return "MEDIUM"

    def predict(self, signals, latency_ms=None):
        validate_signals(signals)
        started = time.perf_counter()
        features = self._to_features(signals)
        z = self._bias + sum(self._weights[i] * features[i] for i in range(len(features)))
        score = round(_sigmoid(z), 4)
        level = self._level(score)

        # Ventana de drift: guarda la ubicacion normalizada observada.
        location = features[2]
        if self._drift_forced:
            location = min(1.0, location + 0.5)
        self._window.append(location)

        self._requests += 1
        self._level_counts[level] += 1
        # La latencia se mide sobre la inferencia real (no sobre el parseo HTTP).
        if latency_ms is None:
            latency_ms = round((time.perf_counter() - started) * 1000, 3)
        self._latencies.append(latency_ms)

        return {"score": score, "level": level, "modelVersion": self.version, "latencyMs": latency_ms}

    # --- Data drift: PSI de la ventana reciente vs. la referencia ---
    def _psi(self):
        if len(self._window) < 10:
            return 0.0
        counts = [0] * BINS
        for value in self._window:
            counts[min(BINS - 1, int(value * BINS))] += 1
        total = float(len(self._window))
        psi = 0.0
        for i in range(BINS):
            expected = max(self._reference[i], 1e-6)
            actual = max(counts[i] / total, 1e-6)
            psi += (actual - expected) * math.log(actual / expected)
        return round(psi, 4)

    def drift(self):
        psi = self._psi()
        return {"detected": psi > DRIFT_THRESHOLD, "psi": psi, "threshold": DRIFT_THRESHOLD}

    def set_drift(self, on):
        self._drift_forced = bool(on)
        return {"driftForced": self._drift_forced}

    def metrics(self):
        lat = list(self._latencies)
        lat_sorted = sorted(lat)
        p95 = lat_sorted[int(len(lat_sorted) * 0.95) - 1] if lat_sorted else 0.0
        avg = round(sum(lat) / len(lat), 2) if lat else 0.0
        return {
            "requests": self._requests,
            "levelCounts": dict(self._level_counts),
            "avgLatencyMs": avg,
            "p95LatencyMs": p95,
            "drift": self.drift(),
            "modelVersion": self.version,
        }

    def reset(self):
        self._window.clear()
        self._latencies.clear()
        self._level_counts = {"LOW": 0, "MEDIUM": 0, "HIGH": 0}
        self._requests = 0
        self._drift_forced = False
        return {"reset": True}

    def info(self):
        return {
            "version": self.version,
            "features": self._model["features"],
            "weights": self._weights,
            "bias": self._bias,
            "thresholds": self._thresholds,
            "trainingMetrics": self._model.get("metrics", {}),
        }


def default_model_path():
    return os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "model.json")

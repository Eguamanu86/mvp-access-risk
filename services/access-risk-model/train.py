"""
Entrena el modelo de riesgo de acceso y guarda model.json.

Sin dependencias externas: solo la libreria estandar de Python.
Modelo: regresion logistica entrenada con descenso de gradiente sobre
datos sinteticos de intentos de inicio de sesion. Determinista (semilla fija).

Uso:
    python train.py
"""

import json
import math
import os
import random

import model_registry
from mlflow_logger import log_run

random.seed(42)

FEATURES = [
    "deviceUnknown",   # 1 si el dispositivo NO es de confianza
    "failedAttempts",  # intentos fallidos recientes, normalizado 0..1
    "locationShift",   # cambio de ubicacion, normalizado 0..1
    "unusualHour",     # 1 si la hora es inusual (madrugada)
    "velocity",        # velocidad de desplazamiento, normalizada 0..1
]

# Pesos "verdaderos" que el modelo debe aprender a recuperar.
TRUE_WEIGHTS = [2.2, 0.9, 1.6, 0.8, 1.2]
TRUE_BIAS = -2.0

MODEL_VERSION = "1.0.0"


def true_risk(f):
    z = TRUE_BIAS + sum(TRUE_WEIGHTS[i] * f[i] for i in range(len(f)))
    return 1.0 / (1.0 + math.exp(-z))


def sigmoid(z):
    if z < -60:
        return 0.0
    if z > 60:
        return 1.0
    return 1.0 / (1.0 + math.exp(-z))


def generate(n):
    xs, ys = [], []
    for _ in range(n):
        device_unknown = 0.0 if random.random() < 0.7 else 1.0
        failed = random.choice([0, 0, 0, 1, 1, 2, 3, 5]) / 5.0
        location = random.random()
        hour = random.randint(0, 23)
        unusual = 1.0 if (hour < 6 or hour >= 23) else 0.0
        velocity = min(1.0, random.random() ** 2)
        f = [device_unknown, failed, location, unusual, velocity]
        p = true_risk(f)
        label = 1.0 if random.random() < p else 0.0
        xs.append(f)
        ys.append(label)
    return xs, ys


def train(xs, ys, epochs=6000, lr=0.5):
    n = len(xs)
    d = len(xs[0])
    w = [0.0] * d
    b = 0.0
    for _ in range(epochs):
        gw = [0.0] * d
        gb = 0.0
        for xi, yi in zip(xs, ys):
            z = b + sum(w[j] * xi[j] for j in range(d))
            err = sigmoid(z) - yi
            for j in range(d):
                gw[j] += err * xi[j]
            gb += err
        for j in range(d):
            w[j] -= lr * gw[j] / n
        b -= lr * gb / n
    return w, b


def reference_histogram(xs, feature_index, bins=10):
    counts = [0] * bins
    for xi in xs:
        idx = min(bins - 1, int(xi[feature_index] * bins))
        counts[idx] += 1
    total = float(len(xs))
    return [c / total for c in counts]


def accuracy(xs, ys, w, b):
    ok = 0
    for xi, yi in zip(xs, ys):
        z = b + sum(w[j] * xi[j] for j in range(len(w)))
        pred = 1.0 if sigmoid(z) >= 0.5 else 0.0
        if pred == yi:
            ok += 1
    return ok / float(len(xs))


def main():
    xs, ys = generate(4000)
    split = 3000
    w, b = train(xs[:split], ys[:split])
    acc = accuracy(xs[split:], ys[split:], w, b)

    print("Pesos aprendidos (vs. reales):")
    for i, name in enumerate(FEATURES):
        print("  %-16s aprendido=%.2f  real=%.2f" % (name, w[i], TRUE_WEIGHTS[i]))
    print("  %-16s aprendido=%.2f  real=%.2f" % ("bias", b, TRUE_BIAS))
    print("Precision en validacion: %.1f%%" % (acc * 100))

    model = {
        "version": MODEL_VERSION,
        "features": FEATURES,
        "weights": w,
        "bias": b,
        "thresholds": {"low": 0.33, "high": 0.66},
        "reference": {
            "locationShift": reference_histogram(xs, 2, 10),
            "deviceUnknownRate": sum(x[0] for x in xs) / len(xs),
        },
        "metrics": {"validationAccuracy": round(acc, 4), "trainedOn": len(xs)},
    }

    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "model.json")
    with open(out, "w", encoding="utf-8") as fh:
        json.dump(model, fh, indent=2)
    print("Modelo guardado en:", out)

    base = os.path.dirname(os.path.abspath(__file__))
    model_registry.archive_model(base, MODEL_VERSION, model)
    model_registry.register_version(base, MODEL_VERSION, round(acc, 4), len(xs), "train", True)

    run_id = log_run(
        params={"epochs": 6000, "learning_rate": 0.5, "features": ",".join(FEATURES), "trained_on": len(xs)},
        metrics={"validation_accuracy": acc, **{"weight_" + FEATURES[i]: w[i] for i in range(len(w))}, "bias": b},
        artifact_path=out,
        run_name="train",
    )
    if run_id:
        print("MLflow run:", run_id)


if __name__ == "__main__":
    main()

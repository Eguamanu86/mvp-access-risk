"""
Pipeline de reentrenamiento con puerta de calidad (MLOps).

Ciclo: datos nuevos -> entrenar candidato -> validar -> promover o rechazar
-> registrar en el registro de modelos.

Uso:
    python retrain.py            # shift por defecto
    python retrain.py --shift 0  # sin desplazamiento (mismo dominio)
"""

import argparse
import json
import math
import os
import random

import model_registry
import train as trainer
from mlflow_logger import log_run

BASE = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(BASE, "model.json")
MIN_ACCURACY = 0.60


def load_json(path, default=None):
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as fh:
            return json.load(fh)
    return default


def save_json(path, data):
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=2)


def bump(version):
    major, minor, patch = version.split(".")
    return "%s.%s.%d" % (major, minor, int(patch) + 1)


def generate_new(n, shift, seed=1234, weights=None, bias=None):
    """Datos nuevos: mas dispositivos desconocidos, desplazamiento de ubicacion
    y, opcionalmente, un cambio de la relacion real (concept drift)."""
    true_weights = weights or trainer.TRUE_WEIGHTS
    true_bias = trainer.TRUE_BIAS if bias is None else bias
    random.seed(seed)
    xs, ys = [], []
    for _ in range(n):
        device_unknown = 0.0 if random.random() < 0.55 else 1.0
        failed = random.choice([0, 0, 1, 1, 2, 3, 5]) / 5.0
        location = min(1.0, random.random() + shift)
        hour = random.randint(0, 23)
        unusual = 1.0 if (hour < 6 or hour >= 23) else 0.0
        velocity = min(1.0, random.random() ** 2)
        f = [device_unknown, failed, location, unusual, velocity]
        z = true_bias + sum(true_weights[i] * f[i] for i in range(len(f)))
        p = 1.0 / (1.0 + math.exp(-z))
        label = 1.0 if random.random() < p else 0.0
        xs.append(f)
        ys.append(label)
    return xs, ys


def evaluate(model, xs, ys):
    return trainer.accuracy(xs, ys, model["weights"], model["bias"])


def run(shift=0.3, concept_drift=False):
    current = load_json(MODEL_PATH)
    if current is None:
        raise RuntimeError("No existe model.json. Ejecuta primero: python train.py")

    concept_weights = [3.0, 1.0, 1.2, 1.5, 0.6] if concept_drift else None
    concept_bias = -2.6 if concept_drift else None
    xs, ys = generate_new(4000, shift, weights=concept_weights, bias=concept_bias)
    split = 3000
    xs_train, ys_train = xs[:split], ys[:split]
    xs_val, ys_val = xs[split:], ys[split:]

    current_acc = evaluate(current, xs_val, ys_val)
    weights, bias = trainer.train(xs_train, ys_train)
    candidate_acc = trainer.accuracy(xs_val, ys_val, weights, bias)

    promoted = candidate_acc > current_acc and candidate_acc >= MIN_ACCURACY
    result = {
        "currentVersion": current["version"],
        "currentAccuracy": round(current_acc, 4),
        "candidateAccuracy": round(candidate_acc, 4),
        "minAccuracy": MIN_ACCURACY,
        "promoted": promoted,
        "conceptDrift": concept_drift,
    }

    if promoted:
        new_version = bump(current["version"])
        model = {
            "version": new_version,
            "features": trainer.FEATURES,
            "weights": weights,
            "bias": bias,
            "thresholds": current["thresholds"],
            "reference": {
                "locationShift": trainer.reference_histogram(xs, 2, 10),
                "deviceUnknownRate": sum(x[0] for x in xs) / len(xs),
            },
            "metrics": {"validationAccuracy": round(candidate_acc, 4), "trainedOn": len(xs)},
        }
        save_json(MODEL_PATH, model)
        model_registry.archive_model(BASE, new_version, model)
        result["newVersion"] = new_version

    model_registry.register_version(
        BASE,
        result.get("newVersion", current["version"]),
        round(candidate_acc, 4),
        len(xs),
        "retrain",
        promoted,
    )

    run_id = log_run(
        params={"shift": shift, "concept_drift": concept_drift, "min_accuracy": MIN_ACCURACY},
        metrics={
            "current_accuracy": current_acc,
            "candidate_accuracy": candidate_acc,
            "promoted": 1 if promoted else 0,
        },
        artifact_path=MODEL_PATH if promoted else None,
        run_name="retrain" + ("-concept-drift" if concept_drift else ""),
    )
    if run_id:
        result["mlflowRunId"] = run_id

    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--shift", type=float, default=0.3)
    parser.add_argument("--concept-drift", action="store_true",
                        help="simula un cambio de la relacion real (concept drift)")
    args = parser.parse_args()

    result = run(shift=args.shift, concept_drift=args.concept_drift)
    print(json.dumps(result, indent=2))
    print("Registro actualizado en:", model_registry.registry_path(BASE))


if __name__ == "__main__":
    main()

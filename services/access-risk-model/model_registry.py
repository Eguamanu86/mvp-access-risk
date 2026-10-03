"""
Registro de versiones del modelo (model registry ligero, en disco).

Estructura:
    models/registry.json         -> { "active": "1.0.0", "versions": [ ... ] }
    models/model-<version>.json  -> artefacto archivado por version
"""

import json
import os
from datetime import datetime, timezone


def _models_dir(base):
    return os.path.join(base, "models")


def registry_path(base):
    return os.path.join(_models_dir(base), "registry.json")


def load_registry(base):
    path = registry_path(base)
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as fh:
            return json.load(fh)
    return {"active": None, "versions": []}


def save_registry(base, registry):
    os.makedirs(_models_dir(base), exist_ok=True)
    with open(registry_path(base), "w", encoding="utf-8") as fh:
        json.dump(registry, fh, indent=2)


def archive_model(base, version, model):
    os.makedirs(_models_dir(base), exist_ok=True)
    path = os.path.join(_models_dir(base), "model-%s.json" % version)
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(model, fh, indent=2)
    return path


def archived_path(base, version):
    return os.path.join(_models_dir(base), "model-%s.json" % version)


def register_version(base, version, accuracy, trained_on, source, promoted):
    registry = load_registry(base)
    registry["versions"] = [v for v in registry["versions"] if v["version"] != version]
    registry["versions"].append({
        "version": version,
        "validationAccuracy": accuracy,
        "trainedOn": trained_on,
        "source": source,
        "promoted": promoted,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })
    if promoted:
        registry["active"] = version
    save_registry(base, registry)
    return registry

"""
Adaptador HTTP (Flask) del servicio de inferencia de riesgo.

Expone el modelo por HTTP y, ademas, la gestion del ciclo de vida (registro de
versiones, promover/revertir y reentrenamiento con estado de pipeline).
El servicio es interno: en produccion se autentica servicio a servicio.
"""

import os
import shutil
import sys
import threading
from datetime import datetime, timezone

# Permite importar los modulos de la raiz del servicio (model_registry, retrain).
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from flask import Flask, jsonify, request

import model_registry
import retrain as retrainer
from src.risk_model import RiskModel, default_model_path


def create_app(model_path=None):
    app = Flask(__name__)
    base = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    path = model_path or default_model_path()
    state = {"model": RiskModel(path)}
    pipeline = {"status": "idle", "startedAt": None, "finishedAt": None, "lastResult": None}

    def current():
        return state["model"]

    def activate(version):
        shutil.copyfile(model_registry.archived_path(base, version), path)
        state["model"] = RiskModel(path)
        registry = model_registry.load_registry(base)
        registry["active"] = version
        model_registry.save_registry(base, registry)
        return version

    # Los endpoints de gestion (promover/revertir/reentrenar/drift/reset) exigen
    # un token compartido servicio a servicio. Si no esta configurado, quedan
    # habilitados solo para la demo local (el gateway no los expone).
    def require_manage_token():
        expected = os.environ.get("MANAGE_TOKEN", "")
        if not expected:
            return None
        provided = request.headers.get("x-manage-token", "")
        if provided != expected:
            return jsonify({"code": "unauthorized", "message": "invalid manage token"}), 401
        return None

    @app.get("/health")
    def health():
        return jsonify({"status": "ok", "modelVersion": current().version})

    @app.post("/predict")
    def predict():
        signals = request.get_json(silent=True) or {}
        return jsonify({"code": "success", "data": current().predict(signals)})

    @app.get("/metrics")
    def metrics():
        return jsonify({"code": "success", "data": current().metrics()})

    @app.get("/model")
    def model_info():
        return jsonify({"code": "success", "data": current().info()})

    @app.get("/model/versions")
    def versions():
        return jsonify({"code": "success", "data": model_registry.load_registry(base)})

    @app.post("/model/promote")
    def promote():
        guard = require_manage_token()
        if guard:
            return guard
        body = request.get_json(silent=True) or {}
        version = body.get("version")
        if not version:
            return jsonify({"code": "validation_error", "message": "version es requerida"}), 400
        if not os.path.exists(model_registry.archived_path(base, version)):
            return jsonify({"code": "not_found", "message": "version no encontrada"}), 404
        activate(version)
        return jsonify({"code": "success", "data": {"active": version, "modelVersion": current().version}})

    @app.post("/model/rollback")
    def rollback():
        guard = require_manage_token()
        if guard:
            return guard
        registry = model_registry.load_registry(base)
        active = registry.get("active")
        previous = None
        for entry in reversed(registry.get("versions", [])):
            if entry["version"] != active:
                previous = entry["version"]
                break
        if not previous:
            return jsonify({"code": "not_found", "message": "no hay version anterior"}), 404
        activate(previous)
        return jsonify({"code": "success", "data": {"active": previous, "modelVersion": current().version}})

    @app.post("/model/retrain")
    def retrain():
        guard = require_manage_token()
        if guard:
            return guard
        if pipeline["status"] == "running":
            return jsonify({"code": "conflict", "message": "pipeline en ejecucion"}), 409
        body = request.get_json(silent=True) or {}
        concept = bool(body.get("conceptDrift"))

        def job():
            pipeline["status"] = "running"
            pipeline["startedAt"] = datetime.now(timezone.utc).isoformat()
            pipeline["finishedAt"] = None
            try:
                result = retrainer.run(concept_drift=concept)
                pipeline["lastResult"] = result
                pipeline["status"] = "success"
                if result.get("promoted"):
                    state["model"] = RiskModel(path)
            except Exception as exc:  # noqa: BLE001 - se reporta al panel
                pipeline["lastResult"] = {"error": str(exc)}
                pipeline["status"] = "failed"
            finally:
                pipeline["finishedAt"] = datetime.now(timezone.utc).isoformat()

        threading.Thread(target=job, daemon=True).start()
        return jsonify({"code": "success", "data": {"status": "running"}})

    @app.get("/model/pipeline")
    def pipeline_status():
        return jsonify({"code": "success", "data": pipeline})

    @app.post("/drift")
    def drift():
        guard = require_manage_token()
        if guard:
            return guard
        body = request.get_json(silent=True) or {}
        return jsonify({"code": "success", "data": current().set_drift(body.get("on", False))})

    @app.post("/reset")
    def reset():
        guard = require_manage_token()
        if guard:
            return guard
        return jsonify({"code": "success", "data": current().reset()})

    @app.errorhandler(ValueError)
    def handle_value_error(err):
        return jsonify({"code": "validation_error", "message": str(err)}), 400

    # CORS abierto: solo para la demo local (la interfaz corre en otro puerto).
    @app.after_request
    def add_cors(response):
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Headers"] = "content-type, authorization"
        response.headers["Access-Control-Allow-Methods"] = "GET,POST,PUT,DELETE,OPTIONS"
        return response

    return app


if __name__ == "__main__":
    create_app().run(host="0.0.0.0", port=int(os.environ.get("PORT", "8080")))

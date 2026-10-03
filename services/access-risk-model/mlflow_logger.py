"""
Registro opcional de runs en MLflow (tracking + artefactos).

Si MLFLOW_TRACKING_URI no esta definido, no hace nada (el pipeline sigue
funcionando sin MLflow). Si MLflow no esta instalado, lo informa y continua.
"""

import os


def log_run(params, metrics, artifact_path=None, run_name=None):
    uri = os.environ.get("MLFLOW_TRACKING_URI")
    if not uri:
        return None
    try:
        import mlflow
    except ImportError:
        print("MLflow no instalado; se omite el registro (pip install -r requirements-mlops.txt)")
        return None

    mlflow.set_tracking_uri(uri)
    mlflow.set_experiment(os.environ.get("MLFLOW_EXPERIMENT", "access-risk"))
    with mlflow.start_run(run_name=run_name) as run:
        mlflow.log_params(params)
        mlflow.log_metrics(metrics)
        if artifact_path and os.path.exists(artifact_path):
            mlflow.log_artifact(artifact_path, artifact_path="model")
        return run.info.run_id

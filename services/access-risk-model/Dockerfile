FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# Dependencias primero (cache de capas)
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Codigo fuente, modelo y scripts del pipeline
COPY src/ ./src/
COPY model.json ./
COPY train.py retrain.py model_registry.py mlflow_logger.py ./

# Usuario no root
RUN useradd --create-home --uid 1000 appuser && mkdir -p models && chown -R appuser:appuser /app
USER appuser

EXPOSE 8080

# 1 worker para la demo: las metricas y la ventana de drift viven en memoria.
# En produccion multi-instancia hay que agregarlas (p. ej. Redis / BigQuery).
CMD ["gunicorn", "--bind", "0.0.0.0:8080", "--workers", "1", "--timeout", "30", "src.app:create_app()"]

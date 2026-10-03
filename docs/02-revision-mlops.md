# Fase 3 — Revisión profunda (flujo completo y MLOps)

**Objetivo:** verificar que el flujo funcione de punta a punta y que el MVP cumpla el objetivo de un **sistema inteligente con MLOps**.

---

## 1. Verificación funcional (evidencia)

| Prueba | Comando | Resultado |
|---|---|---|
| Inferencia (unit + HTTP) | `pytest tests/ -q` | 21 passed |
| Servicio de riesgo (unit) | `npm run test_u` | 27 passed |
| Servicio de riesgo (integración) | `npm run test_i` | 11 passed |
| Lint Node | `npm run linter-test` | sin errores |
| Build interfaz | `npm run build` | OK |
| Stack completo (Docker) | `docker compose up --build` | 8 servicios arriba |

**Flujo end-to-end verificado (en Docker):**

| Escenario | Resultado |
|---|---|
| Riesgo bajo | `ALLOW` (score 0.108) |
| Riesgo alto | `BLOCK` (score 0.986) |
| Servicio caído | `REQUIRE_2FA` con `fallback: true` |
| Circuit breaker | abre tras 3 fallos; cierra al recuperarse |
| Data drift | detectado (PSI 10.18 > 0.25) |
| Interfaz | HTTP 200 |

## 2. Matriz de cumplimiento MLOps

| Capacidad | Estado | Evidencia |
|---|---|---|
| Versionado de **código** | Sí | Bitbucket + CI/CD |
| Versionado de **datos** | Parcial | datos sintéticos con semilla fija (reproducibles) |
| Versionado de **modelo** | Sí | `model.json` (campo `version`) + `models/registry.json` |
| Pipeline de **entrenamiento** reproducible | Sí | `train.py` (semilla fija) |
| **Puerta de calidad** (validación) | Sí | `retrain.py`: promueve solo si mejora |
| **Registro** de modelos | Sí | `models/registry.json` (versión, precisión, promoción) |
| **CI/CD** | Sí | `bitbucket-pipelines.yml` (Node y Python) + `cloudbuild.yaml` |
| **Despliegue** | Sí | Docker + Cloud Run + `env.test/stage/prod.yaml` |
| **Monitoreo** | Sí | `/metrics` en ambos servicios (latencia, conteos, fallback, circuit) |
| **Persistencia / auditoría** | Sí | PostgreSQL (`access_risk_decisions`); DDL versionado |
| **Feedback loop (etiquetas)** | Sí | `POST /v1/access-risk/feedback` (`fraud` / `legit`) |
| **Métricas de modelo** | Sí | precisión, recall y FP/FN (predicho vs. real) |
| Detección de **data drift** | Sí | PSI en el servicio de inferencia |
| **Umbrales / alertas** | Sí | drift > 0.25; circuit breaker 3 fallos / 10 s |
| **Reentrenamiento** | Sí (manual/CI) | `retrain.py`; disparador: alerta de drift |
| **Resiliencia / fallback** | Sí | circuit breaker + fallback a 2FA en cascada |
| **Rollback** | Parcial | el versionado permite revertir; falta automatizarlo |
| **Trazabilidad / auditoría** | Parcial | métricas + logs estructurados; auditoría en el flujo real |

**Conclusión:** el ciclo `código + datos + modelo → pruebas → despliegue → monitoreo → evaluación → mejora` está **cerrado** a nivel de MVP.

## 3. Hallazgos y correcciones aplicadas

| # | Hallazgo | Corrección |
|---|---|---|
| 1 | No había puerta de calidad ni registro de modelo | `retrain.py` (valida candidato vs. actual) + `models/registry.json` |
| 2 | No había CI para el servicio Python | `bitbucket-pipelines.yml` (pytest + pipeline de entrenamiento) |
| 3 | No se exponía la identidad del modelo | Endpoint `GET /model` (versión, features, umbrales, métricas) |
| 4 | La inferencia no validaba la entrada | `validate_signals()` + respuesta 400 |
| 5 | El pipeline podía alterar el modelo del demo | El modelo base se restaura con `train.py`; el pipeline es independiente |
| 6 | El servicio de inferencia corría con 2 workers de gunicorn → métricas y ventana de drift **partidas por worker** | Se fijó `--workers 1` para la demo; en producción multi-instancia se agregan (Redis/BigQuery) |
| 7 | Mezclar `docker-compose.yaml` y `docker-compose.full.yaml` (mismo nombre de proyecto) dejó el servicio sin variables de BD → sin persistencia | Se documentó usar **siempre el mismo archivo**; recrear con el compose correcto |
| 8 | El provider `docker` de Traefik v3.1 devolvía `400` en `/info` con Docker Engine 29 (API 1.56): el gateway no enrutaba nada (`404`) | Se actualizó a Traefik v3.5 y se pasó a provider `file` (`gateway/dynamic.yaml`) por DNS de la red interna (sin socket) |
| 9 | Los endpoints de gestión del modelo (`/model/promote|rollback|retrain|drift|reset`) estaban **públicos y sin autenticación**; el RBAC solo existía en el frontend | `/model` sale del gateway; la gestión pasa por el backend (`/v1/model/*`) con sesión + rol administrador, y viaja al modelo con token servicio a servicio (`x-manage-token`) |
| 10 | La latencia del modelo se medía **antes** de la inferencia (≈ parseo del JSON) | Se mide dentro de `predict()` (inferencia real) |
| 11 | El risk-api solo validaba presencia de señales; los rangos inválidos los rechazaba el modelo y degradaban a fallback | Se replicó la validación de rangos/booleano en el risk-api (`400` antes de llamar al modelo) |
| 12 | Timeout anidado con el mismo presupuesto (250 ms downstream vs. 250 ms upstream) → fallback prematuro | `MODEL_TIMEOUT_MS=150` < `RISK_TIMEOUT_MS=250` |
| 13 | Builds de web y mock-auth sin `package-lock.json` (no reproducibles) | `COPY package-lock.json` + `npm ci` en ambos (y en el API) |

**Evidencia de la puerta de calidad** (`retrain.py`):

- Sin concept drift: candidato 0.750 vs. actual 0.751 → **rechazado** (no mejora).
- Con concept drift: candidato 0.783 vs. actual 0.724 → **promovido** a `1.0.1`.

## 4. Brechas para producción (fuera del alcance del MVP)

- **Drift distribuido:** la ventana de PSI es por instancia (en memoria); en Cloud Run multi-instancia debe agregarse (p. ej., Cloud Monitoring / BigQuery).
- **Registro de modelos gestionado:** reemplazar `model.json` + `registry.json` por un registro (GCS versionado o Vertex AI Model Registry).
- **Disparador automático de reentrenamiento:** conectar la alerta de drift (Cloud Monitoring) a un job (Cloud Scheduler + Pub/Sub + Cloud Build).
- **Rollback automatizado** y **despliegue canario** (champion/challenger) del modelo.
- **Auditoría persistente** de decisiones (hoy en memoria; un flujo de autenticación real ya la tiene).
- **Autenticación servicio a servicio real** con IAM de Cloud Run e identidades de servicio.

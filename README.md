# MVP — Servicio Inteligente de Riesgo de Acceso

Demostración ejecutable del caso transversal del módulo **MIS-312**: un sistema que evalúa el riesgo de un intento de acceso y decide de forma graduada, siguiendo el estándar de ingeniería de Enviame (arquitectura hexagonal, GCP Cloud Run, CI/CD en Bitbucket).

> **Mensaje central:** *el backend orquesta, la IA opina y el backend decide.* Un modelo de IA no es un sistema inteligente completo.

---

## 1. Arranque rápido (Docker)

Requiere **Docker** con **Docker Compose v2**. Un solo comando levanta todo el flujo: gateway, servicios, interfaz, PostgreSQL, MinIO y MLflow.

```bash
docker compose up --build -d
```

Cuando termine, abre la interfaz en **http://localhost:5173**.

| Servicio | URL | Rol |
|---|---|---|
| Interfaz (demo) | http://localhost:5173 | React + Vite + TypeScript |
| **API Gateway** (entrada única) | http://localhost:8210 | Traefik v3 |
| Dashboard del gateway | http://localhost:8214 | Traefik dashboard |
| MLflow (tracking + registro) | http://localhost:5000 | Ciclo MLOps |
| MinIO (consola de artefactos) | http://localhost:9001 | `minio` / `minio123` |
| PostgreSQL | `localhost:5432` | `access_risk` / `access_risk` |

> Los servicios internos (`access-risk-api`, `access-risk-model`, `mock-auth`) **no publican puerto al host**: se acceden por el gateway (`:8210`) o por la red interna de Docker.

---

## 2. Requisitos

- **Docker** + **Docker Compose v2** (recomendado; es la única vía soportada para el flujo completo, ya que incluye PostgreSQL, MinIO y MLflow).
- Alternativa sin Docker (solo los 4 servicios de cómputo): **Node.js `^24`** y **Python 3.12**.

---

## 3. Arquitectura

```text
web ──► gateway ──► mock-auth ──► access-risk-api ──► access-risk-model
        (Traefik)   (decide)      (reglas + fallback)   (inferencia)
                          │               │                    │
                          │               └──► PostgreSQL ◄────┘  (auditoría + feedback)
                          │                        ▲
                          └──────────────────────► MLflow (tracking + registro) ──► MinIO (artefactos)
```

| Componente | Rol | Stack | Exposición |
|---|---|---|---|
| `services/access-risk-model` | Servicio de inferencia (el modelo) | Python / Flask | interna (red Docker; gestión vía backend `/v1/model`) |
| `services/access-risk-api` | Servicio de riesgo (reglas, fallback, métricas, persistencia) | Node 24 / Express 5 (hexagonal) | vía gateway (`/v1`) |
| `demo/mock-auth` | Consumidor simulado (EP-Platform `AuthController`) | Node 24 / Express 5 | vía gateway (`/demo`) |
| `web` | Interfaz de demostración (UX) | React + Vite + TypeScript | `5173` |
| `gateway` | API Gateway (punto de entrada único) | Traefik v3 | `8210` / dashboard `8214` |
| `mlops/mlflow` | Tracking de experimentos + registro de modelos | MLflow (Python) | `5000` |
| `minio` | Almacén de artefactos (API S3) | MinIO | `9000` / consola `9001` |
| `postgres` | Auditoría de decisiones + usuarios/sesiones | PostgreSQL 16 | `5432` |

El gateway centraliza el **ruteo**, el **rate limiting** (`/demo`: 50 req/s) y la **observabilidad**. Ante la indisponibilidad del servicio de riesgo o del modelo, el **fallback** exige 2FA: el login nunca se cae (*fallback* en cascada: `risk-api` → `REQUIRE_2FA`, y `mock-auth` → `REQUIRE_2FA`).

**Ruteo del gateway (Traefik, provider `file`):**

| Prefijo | Destino |
|---|---|
| `/demo/*` | `mock-auth` (rate limiting 50/100) |
| `/v1/*` | `access-risk-api` (incluye `/v1/model/*`) |

> `/model*` **no** se expone en el gateway. La gestión del modelo pasa por el backend (`/v1/model/*`), que exige sesión (lecturas) o rol administrador (promover/revertir/reentrenar/drift/reset) y reenvía la llamada al servicio de inferencia con un token servicio a servicio. El ruteo se define en `gateway/dynamic.yaml` (sin depender del socket de Docker).

---

## 4. Flujo completo paso a paso (Docker)

```bash
# 1) Levantar todo (build + arranque en segundo plano)
docker compose up --build -d

# 2) Ver el estado de los contenedores (postgres debe estar "healthy")
docker compose ps

# 3) Seguir logs de un servicio concreto
docker compose logs -f access-risk-api
```

### 4.1. Verificación del flujo (end-to-end)

No hay que instalar nada extra: `curl` es suficiente.

```bash
# Interfaz y componentes de MLOps (HTTP 200)
curl -s -o /dev/null -w "web     -> %{http_code}\n" http://localhost:5173
curl -s -o /dev/null -w "mlflow  -> %{http_code}\n" http://localhost:5000
curl -s -o /dev/null -w "minio   -> %{http_code}\n" http://localhost:9001

# Login real (contra PostgreSQL) vía gateway
curl -s -X POST http://localhost:8210/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"viewer@enviame.io","password":"viewer123"}'

# Flujo de la demo (mock-auth -> risk-api -> model) vía gateway
curl -s -X POST http://localhost:8210/demo/login \
  -H "Content-Type: application/json" \
  -d '{"username":"demo","signals":{"deviceKnown":true,"failedAttempts":0,"locationShiftKm":5,"hour":14,"velocityKmh":10}}'

# Métricas del servicio de riesgo (sistema + modelo + drift)
curl -s http://localhost:8210/v1/access-risk/metrics

# Info del modelo (requiere sesión: el gateway ya no expone /model)
TOKEN=$(curl -s -X POST http://localhost:8210/v1/auth/login -H "Content-Type: application/json" \
  -d '{"email":"admin@enviame.io","password":"admin123"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:8210/v1/model/info
```

Resultados esperados: `web`/`mlflow`/`minio` → `200`; el login devuelve un `token`; `demo/login` devuelve `decision` `ALLOW` / `REQUIRE_2FA` / `BLOCK` según las señales.

### 4.2. Escenarios de la demo

En la interfaz: botones **Riesgo bajo / medio / alto** → `ALLOW` / `REQUIRE_2FA` / `BLOCK`, y **controles de caos** (*Servicio de riesgo caído*, *Latencia alta (timeout)*, *Data drift*) + **demo guiada** (7 pasos).

Por API:

```bash
# Forzar caída del servicio de riesgo (el login debe caer a fallback 2FA)
curl -s -X POST http://localhost:8210/demo/chaos -H "Content-Type: application/json" -d '{"riskDown":true}'

# Latencia alta (dispara el timeout de 250 ms -> fallback)
curl -s -X POST http://localhost:8210/demo/chaos -H "Content-Type: application/json" -d '{"latencyMs":800}'

# Data drift
curl -s -X POST http://localhost:8210/demo/chaos -H "Content-Type: application/json" -d '{"drift":true}'

# Restablecer todo (chaos + circuit breaker)
curl -s -X POST http://localhost:8210/demo/reset
```

### 4.3. Guion de la demo (≤ 10 min)

1. Presentación del mensaje central.
2. Riesgo bajo / medio / alto: la decisión se gradúa.
3. Servicio caído: el *circuit breaker* abre y el login **no** se cae (fallback a 2FA).
4. Latencia alta: el *timeout* dispara el mismo fallback.
5. Recuperación: el *circuit breaker* cierra.
6. Data drift: el panel alerta (PSI > 0.25).

---

## 5. Operación del stack

```bash
docker compose ps                     # estado
docker compose logs -f <servicio>     # logs (access-risk-api, mock-auth, web, mlflow, ...)
docker compose stop                   # detener sin borrar
docker compose down                   # detener y eliminar contenedores (conserva volúmenes)
docker compose down -v                # eliminar TODO, incluidos datos (postgres/minio)
docker compose up -d --build <svc>    # reconstruir y recrear un servicio concreto
```

> **Un solo archivo de compose.** Todo el flujo (incluidos PostgreSQL, MinIO y MLflow) vive en `docker-compose.yaml`. No mezcles distintos archivos de compose sobre el mismo nombre de proyecto: recrea siempre con este archivo para no dejar servicios sin sus variables de entorno.

---

## 6. Autenticación (login / logout con la base de datos)

Usuarios y sesiones se guardan en PostgreSQL (`auth_users`, `auth_sessions`). Las contraseñas usan **hash scrypt + salt** (nunca en claro) y las sesiones son **tokens opacos** con expiración y revocación.

| Endpoint (vía gateway) | Qué hace |
|---|---|
| `POST /v1/auth/login` | Verifica credenciales y crea una sesión |
| `GET /v1/auth/me` | Devuelve el usuario de la sesión (`Authorization: Bearer <token>`) |
| `POST /v1/auth/logout` | Revoca la sesión |

Usuarios de demo (rol → permisos):

| Email | Contraseña | Rol |
|---|---|---|
| `admin@enviame.io` | `admin123` | Administrador (todo) |
| `operador@enviame.io` | `operador123` | Operador (demo + feedback) |
| `viewer@enviame.io` | `viewer123` | Observador (solo lectura) |

---

## 7. Ciclo MLOps (persistencia y feedback)

Con PostgreSQL habilitado (`DB_ENABLED=true`, por defecto en `docker-compose.yaml`):

| Endpoint (vía gateway) | Qué hace |
|---|---|
| `POST /v1/access-risk/evaluate` | Evalúa y **persiste la decisión** (auditoría) |
| `POST /v1/access-risk/feedback` | Registra el **resultado real** (`fraud` / `legit`) → etiqueta |
| `GET /v1/access-risk/metrics` | Métricas de sistema **y de modelo** (precisión, recall, FP/FN) |
| `GET /v1/access-risk/decisions` | Lista paginada de decisiones (filtros: `decision`, `level`, `outcome`, `search`) |
| `POST /v1/access-risk/reset` | Reinicia métricas en memoria |

El **feedback loop** cierra el ciclo MLOps: las decisiones etiquetadas forman el conjunto con el que se reentrena el modelo. El esquema está en `services/access-risk-api/db/ddl.sql` (se aplica automáticamente al crear el contenedor de PostgreSQL).

Tabla principal: `access_risk_decisions` (auditoría + `outcome` como etiqueta del feedback loop).

### 7.1. Tracking y registro (MLflow + MinIO)

El pipeline registra cada run en MLflow —parámetros, métricas y el artefacto `model.json` en MinIO—. Los artefactos van a MinIO (`bucket mlflow`) y el tracking a PostgreSQL.

```bash
cd services/access-risk-model
pip install -r requirements-mlops.txt

export MLFLOW_TRACKING_URI=http://localhost:5000
export MLFLOW_S3_ENDPOINT_URL=http://localhost:9000
export AWS_ACCESS_KEY_ID=minio AWS_SECRET_ACCESS_KEY=minio123

python train.py                     # registra el modelo base
python retrain.py --concept-drift   # reentrena con puerta de calidad
```

### 7.2. Base de datos (acceso directo)

Para clientes como DBeaver:

| Campo | Valor |
|---|---|
| Host | `localhost` |
| Puerto | `5432` |
| Database | `access_risk` |
| Usuario | `access_risk` |
| Contraseña | `access_risk` |

---

## 8. Arranque local sin Docker

Solo los 4 servicios de cómputo (sin gateway, sin PostgreSQL/MinIO/MLflow). Útil para desarrollo.

```bash
# 1) Servicio de inferencia
cd services/access-risk-model
pip install -r requirements.txt
python train.py                     # genera model.json (una sola vez)
PORT=8090 python src/app.py

# 2) Servicio de riesgo
cd ../access-risk-api
npm install
PORT=8091 MODEL_SERVICE_URL=http://localhost:8090 npm start

# 3) Consumidor simulado
cd ../../demo/mock-auth
npm install
PORT=8092 RISK_API_URL=http://localhost:8091 npm start

# 4) Interfaz
cd ../../web
npm install
VITE_API_URL=http://localhost:8092 npm run dev
```

> **Windows (PowerShell):** el prefijo `VAR=valor comando` es de bash. Define antes la variable:
> ```powershell
> $env:PORT="8091"; $env:MODEL_SERVICE_URL="http://localhost:8090"; npm start
> ```

---

## 9. Pruebas

```bash
# Servicio de inferencia (Python)
cd services/access-risk-model && python -m pytest tests/ -q

# Servicio de riesgo (Node)
cd services/access-risk-api && npm run test_u && npm run test_i && npm run linter-test
```

---

## 10. Solución de problemas

| Síntoma | Causa | Solución |
|---|---|---|
| `mlflow` reinicia con `ImportError: cannot import name 'FallbackAsyncAdaptedQueuePool'` | `mlflow==2.17.2` es incompatible con `sqlalchemy>=2.1` | Ya está fijado `sqlalchemy<2.1` en `mlops/mlflow/Dockerfile`. Reconstruye: `docker compose up -d --build mlflow` |
| `Error response from daemon: No such container ...` al recrear | Contenedores huérfanos de un intento anterior | `docker compose down --remove-orphans` y reintenta `docker compose up -d` |
| El gateway responde `404` en la raíz | Es normal: solo enruta `/demo`, `/v1` y `/model` | Usa una ruta válida, p. ej. `POST /v1/auth/login` |
| `demo/login` siempre devuelve `fallback:true` con `risk:null` | No se enviaron señales válidas o el servicio de riesgo está caído | Envía `signals` completas; revisa `docker compose logs access-risk-api` |
| La demo no persiste decisiones | PostgreSQL no sano o `DB_ENABLED=false` | `docker compose ps` (postgres `healthy`) y `DB_ENABLED=true` |
| Cambió el DDL y no se aplica | El `ddl.sql` solo corre al inicializar el volumen | `docker compose down -v` (borra datos) y `docker compose up -d` |
| Puerto ocupado (`5173`, `8210`, `5432`, `5000`, `9000`) | Otro proceso usa el puerto | Libera el puerto o cambia el mapeo en `docker-compose.yaml` |
| El gateway responde `404` en `/demo`, `/v1` o `/model` | El ruteo no se cargó (p. ej. el provider `file` no leyó `gateway/dynamic.yaml`) | Revisa `docker compose logs gateway`; si editaste `dynamic.yaml` con el gateway arriba, reinícialo: `docker compose restart gateway` |
| `401`/`403` al llamar `/v1/model/*` | Falta la sesión (`Authorization: Bearer <token>`) o el rol no es `admin` | Inicia sesión; la gestión (promote/rollback/retrain/drift/reset) es solo para administrador |

---

## 11. API — referencia rápida

### Vía gateway (`http://localhost:8210`)

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/v1/auth/login` | Login (crea sesión) |
| GET | `/v1/auth/me` | Usuario de la sesión |
| POST | `/v1/auth/logout` | Revoca sesión |
| POST | `/v1/access-risk/evaluate` | Evalúa riesgo y decide (persiste si hay BD) |
| GET | `/v1/access-risk/metrics` | Métricas de sistema y de modelo |
| POST | `/v1/access-risk/feedback` | Etiqueta el resultado real (`fraud`/`legit`) |
| GET | `/v1/access-risk/decisions` | Lista de decisiones |
| GET | `/v1/access-risk/health` | Estado del servicio de riesgo |
| POST | `/v1/access-risk/reset` | Reinicia métricas |
| POST | `/demo/login` | Simula login (mock-auth → risk-api → model) |
| POST | `/demo/chaos` | Controla caos (caída, latencia, drift) |
| GET | `/demo/chaos` | Estado del caos |
| POST | `/demo/reset` | Reinicia caos + circuit breaker |
| GET | `/demo/health` | Estado de mock-auth |
| GET | `/demo/events` | Stream SSE del flujo |

### Gestión del modelo — vía backend, con RBAC (`http://localhost:8210`)

| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| GET | `/v1/model/info` | cualquiera (sesión) | Info del modelo (versión, features, umbrales) |
| GET | `/v1/model/versions` | cualquiera (sesión) | Registro de versiones del modelo |
| GET | `/v1/model/pipeline` | cualquiera (sesión) | Estado del pipeline de reentrenamiento |
| POST | `/v1/model/promote` | admin | Promueve una versión (`{ "version": "1.0.1" }`) |
| POST | `/v1/model/rollback` | admin | Revierte a la versión anterior |
| POST | `/v1/model/retrain` | admin | Reentrena (`{ "conceptDrift": true }`) |
| POST | `/v1/model/drift` | admin | Fuerza/limpia el drift (`{ "on": true }`) |
| POST | `/v1/model/reset` | admin | Reinicia métricas/ventana del modelo |

### Internos (solo por la red de Docker)

- `access-risk-api`: `GET /` (health), `GET /ready` (readiness de Cloud Run).
- `access-risk-model`: `POST /predict`, `GET /health`, `GET /metrics`, `GET /model`, `GET /model/versions`, `GET /model/pipeline`, `POST /model/retrain|promote|rollback`, `POST /drift`, `POST /reset`. Los `POST` de gestión exigen el header `x-manage-token` (token servicio a servicio).

**Contrato de `POST /v1/access-risk/evaluate`:**

```json
{ "signals": { "deviceKnown": false, "failedAttempts": 2, "locationShiftKm": 850, "hour": 3, "velocityKmh": 900 } }
```

Respuesta (contrato estándar Enviame):

```json
{
  "code": "success",
  "data": {
    "score": 0.82,
    "level": "HIGH",
    "decision": "BLOCK",
    "reason": "dispositivo desconocido + ubicacion improbable + horario inusual",
    "modelVersion": "1.0.0",
    "fallback": false,
    "latencyMs": 38
  }
}
```

`decision` ∈ `ALLOW | REQUIRE_2FA | BLOCK`. El servicio **siempre responde 200 con una decisión**; si la inferencia no está disponible, devuelve `fallback: true` y `decision: "REQUIRE_2FA"`.

---

## 12. Despliegue en GCP

Cada servicio se despliega como imagen Docker en **Cloud Run**, con **Secret Manager**, **Cloud Build** (build + deploy) y **Bitbucket Pipelines** (lint → tests → SonarQube).

- `services/access-risk-api/cloudbuild.yaml` y `bitbucket-pipelines.yml`
- `services/access-risk-model/cloudbuild.yaml`
- Variables por ambiente: `env.test.yaml`, `env.stage.yaml`, `env.prod.yaml`
- El servicio de riesgo **no es público** (`--no-allow-unauthenticated`): se autentica servicio a servicio.
- El contrato del gateway está en `gateway/openapi.yaml` (Traefik en local / GCP API Gateway en la nube). Ver `gateway/README.md`.

---

## 13. Estructura

```text
mvp-access-risk/
├── docs/                     # Análisis, HU, Planificación, revisión y diagramas
├── gateway/                  # OpenAPI + guía (Traefik local / GCP API Gateway)
├── services/
│   ├── access-risk-model/    # Python (inferencia + ciclo MLOps)
│   └── access-risk-api/      # Node hexagonal (reglas, fallback, métricas, persistencia)
├── demo/mock-auth/           # Consumidor simulado (EP-Platform)
├── mlops/                    # MLflow (Dockerfile) y SQL de inicialización de Postgres
├── web/                      # React + Vite + TypeScript
└── docker-compose.yaml       # stack completo (gateway + servicios + web + postgres + minio + mlflow)
```

## 14. Documentación de fases

- `docs/00-analisis.md` — Análisis
- `docs/HU-MVP-AR-001-servicio-inteligente-riesgo-acceso.md` — Historia de Usuario
- `docs/01-planificacion.md` — Planificación
- `docs/02-revision-mlops.md` — Revisión del flujo completo y matriz MLOps
- `docs/03-analisis-emulacion-multinube.md` — Portabilidad local ↔ nube
- `docs/diagramas/` — Diagramas de arquitectura y flujo

## 15. Referencias (estándar Enviame)

- `mg-cr-users-api` — referencia de arquitectura hexagonal y Docker/CI-CD.
- Flujo de autenticación de EP-Platform (Backend Auth Proxy), MFA/2FA, dispositivos de confianza.

# Fase 2 — Planificación

**Proyecto:** MVP — `mg-cr-access-risk-api` + `alp-cr-access-risk-model` + interfaz
**Módulo:** MIS-312
**Base:** Fase 1 — Análisis (validado)
**Estado:** Planificación (a validar antes de Implementación)

---

## 1. Resumen ejecutivo

Se planifica un MVP de **cuatro componentes** que reproduce, a escala de demostración, la arquitectura real de Enviame:

1. **Servicio de inferencia** `alp-cr-access-risk-model` (Python, Cloud Run) — el modelo de riesgo.
2. **Servicio de riesgo** `mg-cr-access-risk-api` (Node hexagonal, Cloud Run) — reglas, fallback y métricas.
3. **Consumidor simulado** `demo/mock-auth` (Node) — emula el `AuthController` de EP-Platform.
4. **Interfaz web** — aplicación completa con estándares de UX/usabilidad para la clase.

Todo corre local con `docker-compose` y se despliega en GCP siguiendo el estándar (Cloud Run, Secret Manager, Cloud Build, Bitbucket Pipelines, SonarQube).

## 2. Objetivos y criterios de éxito

| Objetivo | Criterio de éxito medible |
|---|---|
| Decisión graduada | Los escenarios bajo/medio/alto producen `ALLOW` / `REQUIRE_2FA` / `BLOCK` |
| Desacoplamiento del modelo | La inferencia corre en un servicio independiente, con su propio despliegue |
| Resiliencia | Con el servicio o la inferencia caídos, el login responde con fallback (2FA) |
| Recuperación | Al volver el servicio, el circuit breaker cierra y la evaluación normal regresa |
| Monitoreo | El *drift* se detecta y se refleja en el panel |
| Estándar de ingeniería | Lint + tests + cobertura pasan en el pipeline; Sonar sin *blockers* |
| UX | La interfaz es clara, accesible (AA) y usable en proyección y en móvil |

## 3. Componentes y WBS

| # | Componente | Entregables |
|---|---|---|
| 1 | `alp-cr-access-risk-model` (Python) | `train.py`, `app.py` (puerto/adapters), `model.json`, `requirements.txt`, `Dockerfile`, tests |
| 2 | `mg-cr-access-risk-api` (Node) | `src/` hexagonal, tests `ut`/`it`, `Dockerfile`, `bitbucket-pipelines.yml`, `cloudbuild.yaml`, `env.*.yaml` |
| 3 | `demo/mock-auth` (Node) | App pequeña que emula `AuthController` (orquesta y decide) |
| 4 | `web` | SPA con pantalla de login, panel de decisión, controles de demo y métricas |
| 5 | Infra/entrega | `docker-compose.yaml`, `.env.example`, README, guion de demo |

**Estructura de carpetas aprobada:**

```text
mvp-access-risk/
├── docs/                        # análisis, HU, planificación
├── services/
│   ├── access-risk-api/         # mg-cr-access-risk-api (Node hexagonal)
│   └── access-risk-model/       # alp-cr-access-risk-model (Python)
├── demo/
│   └── mock-auth/               # consumidor simulado (Node)
├── web/                         # interfaz (React + Vite + TypeScript)
└── docker-compose.yaml
```

## 4. Arquitectura de la solución (GCP)

```text
┌───────────────┐      ┌──────────────────────┐      ┌──────────────────────────┐      ┌─────────────────────────────┐
│  web (SPA)    │─────►│  demo/mock-auth      │─────►│  mg-cr-access-risk-api   │─────►│  alp-cr-access-risk-model   │
│  UX/usabilidad│      │  (EP-Platform sim.)  │      │  (Cloud Run · Node)      │      │  (Cloud Run · Python)       │
└───────────────┘      │  orquesta y decide   │◄─────│  reglas + fallback       │◄─────│  inferencia del modelo      │
                       └──────────────────────┘      │  métricas + drift        │      │  determinista y versionado  │
                                                      └──────────────────────────┘      └─────────────────────────────┘
                          GCP: Cloud Run · Secret Manager · Cloud Logging · Cloud Build
                          CI/CD: Bitbucket Pipelines · SonarQube
```

- **web → mock-auth:** simula la experiencia de login del usuario.
- **mock-auth → risk-api:** llamada síncrona con *timeout* de 250 ms; aquí vive el fallback.
- **risk-api → model:** llamada síncrona a la inferencia, con su propio *timeout*.
- **Fallback en cascada:** si la inferencia falla → el risk-api responde `REQUIRE_2FA`; si el risk-api falla → el mock-auth exige 2FA.

### 4.1. Arquitectura local + GCP, flexible, escalable y avanzada

**Local (testeable de punta a punta)**
- `docker-compose up` levanta los 4 componentes sobre una red interna; sin internet ni servicios externos.
- Mismos contratos y mismos nombres de servicio que en GCP (paridad local ↔ nube).
- Valores por defecto para cualquier dependencia externa, para que la demo no dependa de la red.

**GCP (desplegable)**
- Cada componente es una imagen Docker desplegable en **Cloud Run** (serverless, autoscaling).
- **Artifact Registry** para las imágenes, **Secret Manager** para secretos, **Cloud Logging** para logs.
- **Cloud Build** + **Bitbucket Pipelines** para CI/CD; ambientes por archivo (`env.test/stage/prod.yaml`).

**Flexible**
- Configuración por variables de entorno; nada *hardcodeado*.
- Modelo **desacoplado y versionado**: se reemplaza el artefacto sin recompilar el servicio.
- Contratos de API **versionados** (`/v1/...`).
- Servicios independientes: cada uno se despliega, escala y falla por separado.

**Escalable**
- Servicios **stateless** (escalan horizontalmente sin afinidad de sesión).
- Autoscaling de Cloud Run (mín/máx de instancias y concurrencia) y *timeouts* definidos.
- Sin estado compartido entre instancias; las métricas en memoria son agregables por instancia.

**Avanzada**
- **Observabilidad:** logs estructurados (Winston/JSON), métricas y `execution_id` para trazabilidad.
- **Resiliencia:** *circuit breaker* + *fallback* en cascada, *timeouts* y reintentos controlados.
- **Seguridad:** autenticación servicio a servicio, Secret Manager, sin PII en logs.
- **Calidad:** pruebas unitarias, de contrato e integración; SonarQube; pipeline de CI/CD.

## 5. Contratos de API

### 5.1. Servicio de riesgo `mg-cr-access-risk-api` (Cloud Run, puerto 8080)

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/v1/access-risk/evaluate` | Evalúa el riesgo y devuelve la decisión |
| GET | `/v1/access-risk/metrics` | Métricas y estado (fallback, drift) |
| GET | `/` | Healthcheck (acepta `?showDetails=1`) |
| GET | `/ready` | Readiness |

**Request** `POST /v1/access-risk/evaluate`:
```json
{ "signals": { "deviceKnown": false, "failedAttempts": 2, "locationShiftKm": 850, "hour": 3, "velocityKmh": 900 } }
```
**Response 200** (contrato estándar Enviame):
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
- `decision` ∈ `ALLOW | REQUIRE_2FA | BLOCK`.
- El servicio **siempre responde 200 con una decisión**; si la inferencia no está disponible, devuelve `fallback: true` y `decision: "REQUIRE_2FA"`.
- Errores: `ParameterError` (400), `UnauthorizedError` (401).

### 5.2. Servicio de inferencia `alp-cr-access-risk-model` (Cloud Run, puerto 8080)

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/predict` | Devuelve `{ score, model_version }` |
| GET | `/health` | Estado |
| GET | `/metrics` | Latencia y conteos |

### 5.3. Consumidor simulado `demo/mock-auth`

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/demo/login` | Emula `AuthController::authenticate`: llama al risk-api y decide |
| GET | `/demo/health` | Estado |

## 6. Diseño del modelo de riesgo

- **Algoritmo:** regresión logística (explicable, determinista, sin dependencias pesadas).
- **Entrenamiento:** datos sintéticos de intentos de acceso; semilla fija; reproducible.
- **Variables (señales):** dispositivo desconocido, intentos fallidos, cambio de ubicación, hora inusual, velocidad de desplazamiento.
- **Salida:** `score` ∈ [0,1] → `LOW` (< 0.33), `MEDIUM` (0.33–0.66), `HIGH` (> 0.66).
- **Artefacto:** `model.json` (pesos, sesgo, umbrales y distribución de referencia para PSI).
- **Drift:** PSI sobre la ventana reciente de entradas vs. referencia; alerta si PSI > 0.25.

## 7. Reglas de negocio y resiliencia

| Señal | Decisión | Justificación |
|---|---|---|
| `LOW` | `ALLOW` | Sin fricción para el usuario legítimo |
| `MEDIUM` | `REQUIRE_2FA` | Fricción proporcional |
| `HIGH` | `BLOCK` | Protección |
| Inferencia/risk-api no disponible o timeout | `REQUIRE_2FA` | Menos conveniente, nunca insegura ni caída |

**Circuit breaker (en el risk-api y en el mock-auth):** 3 fallos consecutivos → `open`; 10 s → `half-open` (una prueba); si responde, → `closed`.

## 8. Estándares de ingeniería (Enviame)

### 8.1. Servicio Node `mg-cr-access-risk-api`
- Node `^24`, CommonJS estricto, Express 5 (sin `try/catch` + `next(err)`).
- 4 capas: `adapters/routers` (factory), `usecases` (usecase + repos Singleton), `frameworks`, `utils`.
- Errores tipados (`src/utils/errors.js`); Winston (prohibido `console.*`); Sequelize solo si hay persistencia.
- Respuesta estándar `{ meta, code, message, data }`; `http-status-codes`.
- Docker `node:24-alpine` no root; ESLint flat-config; Jest 29 + Supertest (`tests/ut`, `tests/it`).

### 8.2. Servicio Python `alp-cr-access-risk-model`
- Python hexagonal (ports/adapters), como `alp-cr-ia-code-reviewer`.
- Framework mínimo (FastAPI o Flask); el modelo se carga de `model.json`.
- Tests con `pytest`; Docker ligero; sin secretos en código.

### 8.3. Frontend `web`
- **React + Vite + TypeScript**; build reproducible; consumo de la API del mock-auth.
- Estado, errores y accesibilidad gestionados explícitamente (ver sección 9).

### 8.4. Docker local (referencia: `mg-cr-users-api`)

| Componente | Imagen base | Usuario | Puerto contenedor | Puerto local |
|---|---|---|---|---|
| `services/access-risk-api` (Node) | `node:24-alpine` | `node` (no root) | 8080 | 8211 |
| `services/access-risk-model` (Python) | `python:3.12-slim` | no root | 8080 | 8212 |
| `demo/mock-auth` (Node) | `node:24-alpine` | `node` (no root) | 8080 | 8213 |
| `web` (React) | `node:24-alpine` (build) + estático | — | 80 | 5173 |

- **Dockerfile del servicio Node** con el mismo patrón del repo de referencia: actualizar npm, `WORKDIR /app`, copiar `package*.json` (+ `lib/` si aplica) **antes** de instalar, `chown`, `USER node`, `npm install`, copiar el código, `EXPOSE 8080`, `CMD ["npm","run","start"]`.
- **`.dockerignore`** con whitelist: `README.md`, `Dockerfile`, `package*.json`, `src/`.
- **`docker-compose.yaml`** raíz con los 4 servicios, `env_file: .env`, volumen de código para desarrollo, límites (`DOCKER_LIMITS_CPUS`, `DOCKER_LIMITS_MEMORY`) y una red interna.
- **`.env.example`** con las variables `DOCKER_*` (comandos y límites) y las de aplicación; las credenciales usan `SET_VIA_SECRET_MANAGER`.

### 8.5. CI/CD y despliegue (referencia: `mg-cr-users-api`)

- **Bitbucket Pipelines** (`bitbucket-pipelines.yml`): `image: node:24`; pasos `npm install` → `linter-test` → `coverage_u` → SonarQube *scan* + *quality gate*; se ejecuta en Pull Requests y en la rama `stage`.
- **Cloud Build** (`cloudbuild.yaml`): build con `--cache-from`, push a **Artifact Registry** (`<region>-docker.pkg.dev/<proyecto>/<repo>/<servicio>`), y `gcloud run deploy` con `--startup-probe=httpGet.path=/ready` y `--env-vars-file=env.<ambiente>.yaml`.
- **Ambientes:** plantilla `env.example.yaml` (por servicio) con `APP_ENV`, `LOG_LEVEL` y la configuración de servicios; **sin** identificadores de proyecto ni secretos.
- **Secretos:** se inyectan en el despliegue (Secret Manager); las credenciales no viven en el repositorio.
- **Región y registro:** Artifact Registry; los valores concretos (proyecto, región, repositorio) se definen fuera del repositorio.

## 9. Diseño de UX/usabilidad de la interfaz

**Pantallas**
1. **Login:** usuario, señales del intento (dispositivo, intentos, ubicación, hora) y botón "Iniciar sesión".
2. **Resultado:** decisión con color e ícono (`permitir` / `2FA` / `bloquear`), nivel de riesgo y motivo.
3. **Panel de control (demo):** interruptores de "servicio caído", "latencia alta" y "drift"; botón de **demo guiada**.
4. **Métricas:** decisiones por tipo, latencia, estado del circuit breaker y alerta de drift.

**Principios**
- **Claridad:** el usuario ve qué señales entran y qué decisión sale.
- **Feedback inmediato:** estados de carga, éxito, error y degradado (fallback) siempre visibles.
- **Estados explícitos:** normal, fallback, circuit open, drift.
- **Accesibilidad (AA):** contraste suficiente, navegación por teclado, foco visible, `aria-live` para la decisión.
- **Proyección:** tipografía y colores legibles a distancia; diseño responsive (escritorio y móvil).
- **Consistencia:** paleta y componentes coherentes con la marca Enviame.

## 10. Plan de trabajo y orden de ejecución

| Orden | Tarea | Depende de |
|---|---|---|
| 1 | Modelo y `train.py` (Python) | — |
| 2 | Servicio de inferencia `app.py` | 1 |
| 3 | Servicio de riesgo Node (hexagonal: router, usecase, repo, frameworks) | 2 |
| 4 | Consumidor simulado `demo/mock-auth` | 3 |
| 5 | Interfaz web (login, resultado, panel, métricas) | 4 |
| 6 | Demo guiada | 5 |
| 7 | Docker/Compose + env + CI/CD | 3, 4, 5 |
| 8 | README + guion | 5 |
| 9 | Validación de escenarios y pruebas | 3–6 |

## 11. Entregables y Definition of Done

**Entregables:** los componentes del WBS + README + guion.

**Definition of Done**
- Arranca con `docker-compose up` y sin internet.
- Los escenarios de demo funcionan de punta a punta.
- El fallback responde siempre, aun con la inferencia o el servicio caídos.
- Lint, tests y cobertura pasan; pipeline verde.
- La interfaz cumple los principios de UX/accesibilidad definidos.
- README permite levantarlo sin ayuda.

## 12. Plan de pruebas

| Tipo | Caso | Resultado esperado |
|---|---|---|
| Unitaria (Node) | Usecase de decisión | Nivel → decisión correcta |
| Unitaria (Python) | Inferencia | `score` determinista |
| Contrato | risk-api ↔ model | Contrato respetado; cambio de versión detectado |
| Integración | `mock-auth → risk-api → model` | Decisión de punta a punta |
| Resiliencia | Inferencia caída | `fallback: true`, `REQUIRE_2FA` |
| Resiliencia | Latencia alta | Timeout → fallback |
| Resiliencia | Recuperación | Circuit breaker vuelve a `closed` |
| Observabilidad | Drift activado | Alerta visible y métrica actualizada |
| E2E | Interfaz | Los escenarios se ven y se entienden |

## 13. Guion de la demo (≤ 10 min)

| Min | Escenario | Qué se muestra |
|---|---|---|
| 0–1 | Presentación | "El backend orquesta, la IA opina, el backend decide" |
| 1–3 | Riesgo bajo → medio → alto | Decisión graduada |
| 3–5 | Servicio caído | Fallback y login que **no** se cae |
| 5–6 | Latencia alta | Timeout → fallback |
| 6–8 | Recuperación | Circuit breaker cierra |
| 8–10 | Data drift | Alerta en el panel |

## 14. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Latencia de la inferencia afecta el login | Presupuesto de latencia + timeout + fallback en cascada |
| Cuatro componentes aumentan la fragilidad en vivo | Docker Compose y arranque único; sin dependencias externas |
| Frontend con demasiado alcance | UX enfocada en las 4 pantallas de la demo |
| Deriva del modelo no detectada | PSI + alerta + métrica |
| Puertos ocupados | Puertos configurables en `.env` |

## 15. Decisiones validadas

| Punto | Decisión |
|---|---|
| Contratos de API | Aprobados (sección 5) |
| Frontend | **React + Vite + TypeScript** |
| Umbrales | Aprobados: riesgo 0.33/0.66; circuit breaker 3 fallos / 10 s; timeout 250 ms |
| Estructura de componentes | Aprobada (sección 3) |
| Alcance de "avanzada" | Síncrono + autoscaling + resiliencia + observabilidad + CI/CD (sin Pub/Sub ni caché) |
| Infraestructura como código | Solo archivos de despliegue (Dockerfile, cloudbuild.yaml, env yaml); sin Terraform |

Con estas decisiones, la planificación queda **cerrada y validada**. Se procede a la Fase 3 — Implementación.

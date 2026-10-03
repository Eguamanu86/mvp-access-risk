---
id: HU-MVP-AR-001
title: Servicio inteligente de riesgo de acceso integrado al flujo de autenticación
project: access-risk-api
status: draft
owner: ernesto.guaman
tags: [backend, auth, mfa, ia, microservice, cloud-run, hexagonal, mvp]
---

# HU-MVP-AR-001: Servicio inteligente de riesgo de acceso integrado al flujo de autenticación

## Contexto

El flujo de autenticación de la plataforma (con un *Backend Auth Proxy*) exige 2FA de forma esencialmente binaria: si el dispositivo es de confianza se omite, si no se exige. No existe una evaluación **graduada** del riesgo del intento de acceso.

Esta HU incorpora un **microservicio independiente** que estima el riesgo de cada intento (`LOW` / `MEDIUM` / `HIGH`) y lo expone al flujo de autenticación, de modo que el backend decida de forma graduada: **permitir, exigir 2FA o bloquear**. Se aplica el principio del módulo: *el backend orquesta, la IA opina y el backend decide*.

## Scope

- Nuevo servicio `access-risk-api` (Node.js hexagonal, Cloud Run): API de riesgo, reglas, fallback y métricas.
- Nuevo servicio de inferencia `access-risk-model` (Python, Cloud Run): modelo versionado.
- Endpoint `POST /v1/access-risk/evaluate`.
- Interfaz web completa (estándares de UX/usabilidad) que simula el flujo de autenticación.
- Detección de *data drift* y observabilidad.
- **Fuera de scope:** modificar un flujo de autenticación real (se documenta el punto de integración y se simula en la interfaz).

## Criterios de aceptación

- [ ] `POST /v1/access-risk/evaluate` recibe las señales del intento y devuelve `score` y nivel `LOW`/`MEDIUM`/`HIGH`.
- [ ] El servicio traduce el nivel a decisión: `ALLOW` / `REQUIRE_2FA` / `BLOCK`.
- [ ] La respuesta respeta `p95 ≤ 150 ms`; el consumidor aplica un *timeout* de 250 ms.
- [ ] Ante indisponibilidad o timeout, el servicio/consumidor responde con **fallback: exigir 2FA** (nunca se cae el login).
- [ ] Cada evaluación registra la señal de riesgo y la regla aplicada (trazabilidad).
- [ ] El servicio detecta *data drift* (PSI) y lo refleja en `/v1/access-risk/metrics`.
- [ ] Las llamadas están autenticadas servicio a servicio; el servicio **no** es público.
- [ ] `npm run linter-test`, `test_u`, `test_i` y `coverage_all` pasan en el pipeline.
- [ ] El servicio se despliega en Cloud Run con secretos desde Secret Manager.

## Notas técnicas

- **Arquitectura (4 capas):**
  - `src/adapters/routers/v1/access-risk/access-risk-router.js` — router como *factory function*.
  - `src/usecases/usecase-access-risk.js` — lógica de negocio y validaciones.
  - `src/usecases/access-risk/*-repository.js` — acceso a datos (modelo y métricas), patrón Singleton.
  - `src/frameworks/` — Express, Winston, cliente del modelo, Secret Manager.
  - `src/utils/errors.js` — errores tipados (`ValidationError`, `UseCaseError`, etc.).
- **Contrato:** `POST /v1/access-risk/evaluate` → `{ score, level, decision, reason, model_version, latency_ms }`.
- **Inferencia:** servicio Python `access-risk-model`; el modelo es simple, determinista y versionado; artefacto cargado en el arranque (sin recompilar).
- **Fallback:** ante error/timeout, `REQUIRE_2FA` (equivale al comportamiento actual, seguro).
- **Observabilidad:** Winston + Cloud Logging, `execution_id` desde `x-cloud-trace-context`, sin PII.
- **Seguridad:** autenticación servicio a servicio; `x-powered-by` deshabilitado; body `≤ 1mb`; validación de entrada con whitelists.
- **Configuración:** variables con `SET_VIA_SECRET_MANAGER` en stage/prod.
- **CI/CD:** Bitbucket Pipelines (lint + tests + cobertura + SonarQube) + Cloud Build.

## Diagramas

```text
Auth simulado                 access-risk-api (Node)            access-risk-model (Python)
  AuthController                POST /v1/access-risk/evaluate      POST /predict
      │  password OK                      │                             │
      ├────── evaluate(señales) ─────────►│                             │
      │                                   ├────── predict(señales) ───►│
      │                                   │◄───────── score ────────────┤
      │◄──── score + nivel + decision ────┤
      │
      ├─ LOW    → permitir (omitir 2FA)
      ├─ MEDIUM → exigir 2FA
      └─ HIGH   → bloquear
      (si el servicio o la inferencia fallan / exceden el timeout → fallback: exigir 2FA)
```

## Links relacionados

- Análisis: `../00-analisis.md`
- Referencias: flujo de autenticación (Backend Auth Proxy), MFA/2FA y dispositivos de confianza.
- Jira: MVP-AR-001

## Checklist de cierre

- [ ] Código mergeado
- [ ] Tests agregados/actualizados
- [ ] Documentación actualizada
- [ ] Deploy a stage validado

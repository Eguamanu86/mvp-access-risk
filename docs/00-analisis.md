# Fase 1 — Análisis

**Proyecto:** MVP — `access-risk-api` (servicio inteligente de riesgo de acceso)
**Módulo:** MIS-312 · Ingeniería de Software para Sistemas Inteligentes
**Referencias:** flujo de autenticación con *Backend Auth Proxy*; arquitectura GCP (Cloud Run, Secret Manager, Bitbucket Pipelines, SonarQube)
**Estado:** Análisis (a validar antes de Planificación)

---

## 1. Ficha del MVP

| Campo | Valor |
|---|---|
| Nombre propuesto | `access-risk-api` |
| Tipo | Microservicio REST |
| Stack | Node.js `^24`, CommonJS, Express 5, Sequelize 6 / PostgreSQL, Winston, Jest 29 + Supertest |
| Arquitectura | 4 capas (adapters / usecases / frameworks / utils) — hexagonal |
| Infraestructura | Google Cloud Run, Secret Manager, Cloud Logging, Cloud Build, Bitbucket Pipelines, SonarQube |
| Consumidor principal | Flujo de autenticación (Backend Auth Proxy) |
| Servicio de inferencia | `access-risk-model` (Python, Cloud Run) |
| Interfaz de demostración | Aplicación web completa (React + Vite + TypeScript), con estándares de UX y usabilidad |

> El nombre y el ticket son propuestas; se confirman en la validación del análisis.

## 2. Contexto de negocio (caso real)

La plataforma autentica a sus usuarios a través de un **Backend Auth Proxy**: recibe credenciales o tokens de Firebase, valida contra el dominio interno y responde con tokens de sesión. Ese flujo ya soporta login por password, SSO/OIDC, MFA/2FA, dispositivos de confianza, bloqueo por intentos y trazabilidad de intentos de login.

Hoy, **la decisión de exigir 2FA es esencialmente binaria y basada en reglas**: si el dispositivo es de confianza (cookie `device_trust`) se omite el 2FA; si no, se exige. No existe una evaluación **graduada** del riesgo del intento de acceso.

**Oportunidad:** incorporar un **servicio inteligente que estime el riesgo** de cada intento y permita al backend decidir de forma graduada: permitir, exigir 2FA o bloquear. Esto mejora la experiencia del usuario legítimo (menos fricción) sin bajar el nivel de seguridad, y encaja exactamente con el mensaje del módulo: *el backend orquesta, la IA opina y el backend decide*.

## 3. Problema / oportunidad

| Necesidad | Situación actual | Aporte del MVP |
|---|---|---|
| Decisión graduada de fricción | Regla binaria (confiar o no confiar) | Nivel de riesgo `LOW/MEDIUM/HIGH` → permitir / 2FA / bloquear |
| Separar el ciclo de vida del modelo | No existe servicio de IA en el auth | Microservicio independiente, con su propio despliegue y escala |
| No romper el login si la IA falla | — | Fallback seguro: ante indisponibilidad, se exige 2FA (comportamiento actual) |
| Trazabilidad de la decisión | Auditoría de intentos existente | Registrar señal de riesgo y regla aplicada |
| Monitoreo del modelo | — | Métricas y detección de *drift* |

## 4. Objetivo

Construir un microservicio que **evalúe el riesgo de un intento de acceso** y lo exponga por API al flujo de autenticación, con arquitectura hexagonal, GCP Cloud Run, CI/CD en Bitbucket y observabilidad con Winston, de modo que el backend pueda decidir de forma graduada y degradar de forma segura.

## 5. Alcance

**Incluye**
- Microservicio Node hexagonal con el endpoint de evaluación de riesgo.
- Modelo de riesgo (entrenable y versionado) y su carga en el servicio.
- Reglas de negocio y **fallback** ante indisponibilidad del modelo.
- Observabilidad: logging estructurado, métricas y detección de *drift*.
- Despliegue en Cloud Run con Secret Manager y pipeline CI/CD.
- Pruebas unitarias y de integración (Jest/Supertest) y cobertura.
- Un **arnés de demostración** (interfaz mínima) para mostrar el comportamiento en clase.

**No incluye**
- Modificar un flujo de autenticación real (se documenta el punto de integración y se simula en el arnés).
- SSO/OIDC, reCAPTCHA ni recuperación de contraseña (ya existen; no se tocan).
- Entrenamiento de modelos complejos (redes neuronales, LLM).
- Alta disponibilidad multi-región o datos de producción reales.

## 6. Actores

| Actor | Interés |
|---|---|
| Flujo de autenticación (Backend Auth Proxy) | Obtener una señal de riesgo dentro del presupuesto de latencia |
| Equipo de seguridad | Que la decisión sea trazable y que el fallback sea seguro |
| Equipo de datos/IA | Iterar el modelo sin tocar el flujo de login |
| Usuario final | Menos fricción cuando el riesgo es bajo |
| Docente y estudiantes (contexto del módulo) | Ver el sistema inteligente completo funcionando |

## 7. Requisitos funcionales (RF)

| ID | Requisito |
|---|---|
| RF-01 | Evaluar el riesgo de un intento de acceso y devolver `score` y nivel `LOW/MEDIUM/HIGH` |
| RF-02 | Exponer la evaluación por API REST versionada (`/v1/access-risk/evaluate`) |
| RF-03 | Traducir el nivel a decisión de negocio: permitir, exigir 2FA o bloquear |
| RF-04 | Registrar cada decisión (señal de riesgo + regla aplicada) para auditoría |
| RF-05 | Ante indisponibilidad o timeout del modelo, responder con fallback: exigir 2FA |
| RF-06 | Detectar *data drift* comparando la distribución de entrada reciente contra la de entrenamiento |
| RF-07 | Exponer métricas: latencia, conteos por nivel, estado del fallback y de drift |
| RF-08 | Cargar el modelo desde un artefacto versionado (sin recompilar el servicio) |
| RF-09 | Autenticar las llamadas servicio a servicio (no exponer el servicio públicamente) |

## 8. Requisitos no funcionales (RNF)

| ID | Requisito | Criterio |
|---|---|---|
| RNF-01 | Latencia | `p95 ≤ 150 ms`, `p99 ≤ 300 ms`; *timeout* duro de 250 ms en el consumidor |
| RNF-02 | Disponibilidad | El login **no** puede caerse por fallo del servicio; siempre hay respuesta |
| RNF-03 | Escalabilidad | Escala automática en Cloud Run ante picos de login |
| RNF-04 | Seguridad | Autenticación servicio a servicio; secretos en Secret Manager; sin PII en logs |
| RNF-05 | Observabilidad | Winston + Cloud Logging con `execution_id`; métricas técnicas |
| RNF-06 | Estándar de código | Hexagonal, CommonJS, ESLint, sin `console.*`, errores tipados |
| RNF-07 | Calidad | Pruebas unitarias e integración; cobertura objetivo 80% (nuevo) / 90% (negocio) |
| RNF-08 | Portabilidad | Docker `node:24-alpine`; corre local con `docker-compose` |
| RNF-09 | Reproducibilidad | Modelo determinista (semilla fija) y versionado |
| RNF-10 | Privacidad | Solo señales derivadas del intento; sin datos personales identificables |

## 9. Encaje en la arquitectura

```text
┌────────────────────┐  HTTP (timeout 250 ms)  ┌──────────────────────┐   HTTP   ┌─────────────────────────┐
│  Backend Auth      │ ──────────────────────► │  access-risk-api     │ ───────► │  access-risk-model      │
│  Proxy             │                         │  (Cloud Run · Node)  │          │  (Cloud Run · Python)   │
│  (orquesta/decide) │ ◄────────────────────── │  reglas + fallback   │ ◄─────── │  inferencia del modelo  │
│                    │   score + nivel + dec.  │  métricas + drift    │  score   │  determinista/versionado│
└────────────────────┘                         └──────────────────────┘          └─────────────────────────┘
        │  fallback: exigir 2FA
        ▼
   MFA / sesión

   Interfaz web (UX/usabilidad) ──► Auth simulado ──► access-risk-api ──► access-risk-model
```

- El servicio de riesgo se despliega en **Cloud Run** (contenedor `node:24-alpine`, usuario no root).
- La inferencia del modelo vive en un **servicio Python separado** (Cloud Run), con su propio ciclo de vida.
- Los secretos se cargan con `SET_VIA_SECRET_MANAGER`; nunca en código.
- La autenticación es **servicio a servicio** (ninguno de los dos es público).
- El consumo es **síncrono con timeout**; la indisponibilidad dispara el fallback.

## 10. Análisis de alternativas

| Decisión | Opción recomendada | Por qué | Alternativas |
|---|---|---|---|
| Dónde vive el modelo | **Servicio de inferencia Python separado** (`access-risk-model`) | Desacopla el ciclo de vida del modelo; el equipo de IA itera sin tocar el servicio de riesgo | Modelo dentro del microservicio Node (más simple, menos desacoplado) |
| Lenguaje | **Node.js** para el servicio de riesgo; **Python** para la inferencia | Consistencia con el ecosistema de servicios y de IA existente | Todo en un solo lenguaje |
| Comunicación | **Síncrona con timeout + fallback** | El login necesita decisión inmediata | Asíncrona (inviable para el login) |
| Persistencia | **Sin base de datos para el MVP** (métricas en memoria) | Simplicidad; el registro de auditoría ya existe en el flujo de auth | Firestore/MySQL para histórico |
| Detección de drift | **PSI simple** sobre una ventana de entradas | Estándar y suficiente para el MVP | Pruebas estadísticas complejas |
| Despliegue | **Cloud Run** | Estándar del ecosistema | VM / GKE |

## 11. Riesgos y mitigaciones

| Riesgo | Impacto | Mitigación |
|---|---|---|
| Latencia del modelo afecta el login | Alto | Presupuesto de latencia + timeout + fallback |
| Indisponibilidad del servicio | Alto | Fallback a 2FA (comportamiento actual, seguro) |
| Cambio no acordado del contrato de API | Medio | Contrato versionado + pruebas de contrato |
| Fuga de datos en logs | Medio | `scrub()` de Winston; sin PII; solo señales derivadas |
| Deriva del modelo no detectada | Medio | PSI + alerta + métricas de negocio |
| Sobrecarga de picos de login | Medio | Autoscaling en Cloud Run |

## 12. Criterios de éxito

- El servicio responde dentro del presupuesto de latencia en condiciones normales.
- Con el modelo indisponible, el login **sigue funcionando** con fallback (2FA).
- La decisión es trazable: señal de riesgo y regla aplicada.
- El pipeline (lint + tests + cobertura) pasa y el servicio se despliega en Cloud Run.
- El *drift* se detecta y se refleja en las métricas.

## 13. Artefactos por fase

| Fase | Artefacto | Ubicación |
|---|---|---|
| Análisis | Este documento + HU | `docs/00-analisis.md`, `docs/HU-MVP-AR-001-*.md` |
| Planificación | Plan técnico, contratos de API, DDL/decisiones, plan de pruebas | `docs/01-planificacion.md` |
| Implementación | Microservicio (hexagonal), tests, Docker, CI/CD, arnés de demo | `src/`, `tests/`, `Dockerfile`, `bitbucket-pipelines.yml` |

## 14. Decisiones validadas

| Punto | Decisión |
|---|---|
| Nombre y ticket | `access-risk-api` · ticket `MVP-AR-001` |
| Dónde vive el modelo | **Servicio de inferencia Python separado** (`access-risk-model`) |
| Interfaz de demostración | **Aplicación web completa**, con estándares de UX y usabilidad |
| Consumidor | **Se simula** el flujo de autenticación dentro del MVP para probar de punta a punta |

Con estas decisiones, el análisis queda **cerrado y validado**. Se procede a la Fase 2 — Planificación.

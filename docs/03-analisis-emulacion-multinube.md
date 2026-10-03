# Fase 3 — Análisis: emulación local y portabilidad multinube

**Objetivo:** que **toda** la arquitectura se pueda probar en local y desplegarse en GCP (u otra nube) sin reescribir el sistema.

---

## 1. Principio rector

Hay dos formas de "emular":

| Estrategia | Cómo | Portabilidad |
|---|---|---|
| **A. Emulador cloud-específico** | Correr el emulador del proveedor en local (LocalStack para AWS, emuladores de GCP para Firestore/PubSub, Azurite para Azure) | Baja: acopla el código al SDK del proveedor |
| **B. Componentes open source portables** | Usar OSS que corre igual en local y tiene equivalente gestionado en cada nube; abstraer con **puertos/adaptadores** | **Alta**: el mismo código sirve en GCP, AWS o Azure |

**Recomendación: estrategia B** (con A solo para *parity testing* puntual). El código depende de **interfaces** (arquitectura hexagonal, que ya usamos); en local se inyecta el adaptador OSS y en la nube el adaptador gestionado.

---

## 2. Estado actual del MVP

| Pieza | Estado | Portable |
|---|---|---|
| API Gateway | **Real** (Traefik, OSS) | Sí |
| Contenedores | **Real** (Docker Compose) | Sí |
| Servicios (Node/Python) | **Real** | Sí |
| Modelo (artefacto) | **Real** (`model.json` + registry) | Sí |
| Base de datos | **Ausente** | — |
| Almacenamiento de objetos (artefactos) | **Ausente** (JSON en repo) | — |
| Tracking de experimentos / registro | **Parcial** (JSON local) | Sí, pero básico |
| Métricas / dashboards | **En memoria** | No (se pierde) |
| Trazas | **Ausentes** | — |
| Mensajería asíncrona | **Ausente** | — |
| Secretos | `.env` local | Parcial |
| Identidad servicio a servicio | Token compartido | Parcial |

---

## 3. Mapa de componentes: local portable ↔ cada nube

| Capacidad | Local (OSS portable) | GCP | AWS | Azure |
|---|---|---|---|---|
| API Gateway | **Traefik / Kong / Envoy** | API Gateway / Apigee | API Gateway | API Management |
| Cómputo | **Docker Compose / kind (K8s)** | Cloud Run / GKE | ECS / EKS | Container Apps / AKS |
| SQL | **PostgreSQL / MySQL** | Cloud SQL | RDS / Aurora | Azure SQL |
| NoSQL | **MongoDB / Postgres JSONB** | Firestore / Bigtable | DynamoDB | Cosmos DB |
| Objetos (API S3) | **MinIO** | Cloud Storage (interop S3) | S3 | Blob |
| Mensajería / colas | **Redpanda (Kafka) / RabbitMQ / NATS** | Pub/Sub | SQS/SNS/MSK | Service Bus / Event Hubs |
| Caché | **Valkey/Redis** | Memorystore | ElastiCache | Azure Cache |
| Orquestación de pipelines | **Airflow / Prefect / Dagster** | Cloud Composer / Vertex Pipelines | MWAA / Step Functions | Data Factory |
| Tracking de experimentos | **MLflow** | Vertex Experiments | SageMaker | Azure ML |
| Registro de modelos | **MLflow** | Vertex Model Registry | SageMaker Registry | Azure ML |
| Feature store | **Feast** | Vertex Feature Store | SageMaker Feature Store | Azure ML |
| Métricas | **Prometheus** | Cloud Monitoring | CloudWatch | Azure Monitor |
| Dashboards | **Grafana** | Looker Studio / Cloud Monitoring | CloudWatch / Grafana | Azure Monitor |
| Trazas | **OpenTelemetry + Jaeger** | Cloud Trace | X-Ray | App Insights |
| Logs | **OTel Collector / Fluent Bit** | Cloud Logging | CloudWatch Logs | Log Analytics |
| Secretos | **Vault / .env** | Secret Manager | Secrets Manager | Key Vault |
| Identidad servicio | **OIDC/JWT (SPIFFE)** | IAM / Workload Identity | IAM / IRSA | Entra ID / Managed Identity |
| CI/CD | **Bitbucket Pipelines / GitHub Actions** | Cloud Build | CodeBuild | Azure Pipelines |
| Emulador del proveedor | LocalStack (AWS), emuladores GCP, Azurite | — | — | — |

> **Clave:** elegir la columna "Local (OSS portable)" y desplegar la misma imagen/contenedor en la nube; cambiar solo el **adaptador** de cada puerto.

---

## 4. Arquitectura de referencia local (portable)

```text
                         ┌──────────── Observabilidad ────────────┐
                         │ Prometheus + Grafana · OTel + Jaeger   │
                         └───────────────▲────────────────────────┘
                                         │ métricas/trazas
web ──► Traefik ──► mock-auth ──► access-risk-api ──► access-risk-model
        (gateway)                 │        │                   │
                                  │        └──► PostgreSQL ◄── auditoría + muestras
                                  │                     ▲
                                  └──► MLflow (tracking + registro) ──► MinIO (artefactos)
```

- **PostgreSQL**: auditoría de decisiones y **muestras de entrenamiento** (feedback loop).
- **MLflow**: tracking de experimentos y registro de modelos (reemplaza el `registry.json`).
- **MinIO**: almacén de artefactos (modelos, datasets) con API S3 → Cloud Storage/S3/Blob.
- **Prometheus + Grafana**: métricas de sistema y de modelo.
- **OTel + Jaeger**: trazas distribuidas gateway → servicios.
- **Traefik**: gateway portable.

Cada uno tiene equivalente gestionado en GCP/AWS/Azure (tabla de la sección 3), y **corre igual en local**.

---

## 5. Cómo se logra la portabilidad (puertos/adaptadores)

```text
        ┌──────────────────┐
        │   Usecase        │  (lógica de negocio, no cambia)
        └───────┬──────────┘
                │ depende de interfaces (puertos)
   ┌────────────┼─────────────────────────┐
   ▼            ▼                         ▼
BlobStore    SampleStore               Registry
(puerto)     (puerto)                  (puerto)
   │            │                         │
   ├─ local: MinIO     ├─ local: Postgres   ├─ local: MLflow
   └─ GCP:  GCS        └─ GCP:  Cloud SQL   └─ GCP:  Vertex
   └─ AWS:  S3         └─ AWS:  RDS         └─ AWS:  SageMaker
```

El servicio no sabe si habla con MinIO o con GCS: usa el mismo cliente S3 (MinIO local; GCS vía interop S3). Igual con SQL (mismo driver) y con el registro (MLflow local o gestionado).

---

## 6. Qué incorporar al MVP (por fases)

**Fase 1 — datos y ciclo MLOps (máximo impacto)**
1. **PostgreSQL** + Sequelize: auditoría de decisiones y **tabla de muestras** (feedback loop).
2. **MLflow** (tracking + registro de modelos) sobre **MinIO** (artefactos).
3. **Métricas de modelo** (predicho vs. real) en el panel.

**Fase 2 — observabilidad y calidad**
4. **Prometheus + Grafana** (métricas) y **OTel + Jaeger** (trazas).
5. **Data validation** en el pipeline (esquema/rangos) + **versionado de datos** (DVC o snapshot en MinIO).

**Fase 3 — automatización y despliegue**
6. **Orquestación** del pipeline (Prefect/Airflow) con reentrenamiento disparado por drift.
7. **Adaptadores de nube**: GCP (Cloud SQL, GCS, Vertex) documentados; AWS/Azure análogos.
8. **Canary/champion-challenger** y rollback.

---

## 7. Trade-offs

- **Más componentes = más realismo, más complejidad y más consumo local.** Conviene incorporarlos por fases y mantener un `docker-compose` "core" mínimo y otro "full" para MLOps.
- Los **emuladores del proveedor** (LocalStack, emuladores GCP) sirven para *parity tests* de integración, pero **no** como base del desarrollo (acoplan al SDK).
- La **portabilidad real** viene de: contenedores + protocolos estándar (S3, SQL, Kafka, OpenTelemetry, OIDC) + puertos/adaptadores.

---

## 8. Recomendación

Adoptar la **estrategia B** y construir un `docker-compose.full.yaml` con: PostgreSQL, MinIO, MLflow, Prometheus, Grafana, Jaeger y el OTel Collector, además del stack actual (gateway + servicios + web). Empezar por **PostgreSQL + MLflow + métricas de modelo** (Fase 1), que es lo que más acerca a un caso real de MLOps y es 100% portable.

# API Gateway — local (Traefik) y GCP (API Gateway)

## Local: Traefik

El `docker-compose.yaml` levanta **Traefik v3** como punto de entrada único.

```text
web ──► Traefik (:8210) ──┬── /demo/*   ──► mock-auth
                          └── /v1/*     ──► access-risk-api (incluye /v1/model/*)
                                              │
                                              └──► access-risk-model (red interna)
```

| Qué | Valor |
|---|---|
| Entrypoint | `http://localhost:8210` |
| Dashboard | http://localhost:8214 |
| Rate limiting | `/demo` → 50 req/s promedio, ráfaga 100 |
| Config | provider `file` → `gateway/dynamic.yaml` |

Los servicios internos (`access-risk-api`, `access-risk-model`) **no se exponen** directamente. El modelo **tampoco** se publica en el gateway (`/model*`): la gestión pasa por el backend (`/v1/model/*`) con sesión + rol administrador. El ruteo se define por DNS de la red interna (no depende del socket de Docker), lo que evita la incompatibilidad del provider `docker` con Docker Engine 29.

> Si editas `gateway/dynamic.yaml` con el gateway en marcha, reinícialo (`docker compose restart gateway`): el *watch* sobre bind mounts no es fiable en Docker Desktop para Windows.

## GCP: API Gateway

En la nube se usa **GCP API Gateway** con el mismo contrato OpenAPI (`gateway/openapi.yaml`), apuntando a los servicios de **Cloud Run** vía `x-google-backend`.

```bash
# 1) Crear la API
gcloud api-gateway apis create access-risk-api --project=$PROJECT_ID

# 2) Crear la configuración desde el OpenAPI
gcloud api-gateway api-configs create access-risk-config \
  --api=access-risk-api \
  --openapi-spec=gateway/openapi.yaml \
  --project=$PROJECT_ID --backend-auth-service-account=$SA_EMAIL

# 3) Crear el gateway
gcloud api-gateway gateways create access-risk-gateway \
  --api=access-risk-api --api-config=access-risk-config \
  --location=us-central1 --project=$PROJECT_ID
```

- **Seguridad:** el gateway valida la autenticación (API key / JWT) y Cloud Run queda `--no-allow-unauthenticated` (solo el gateway lo invoca).
- **Rate limiting:** se define con **cuotas** en la configuración del API Gateway.
- **Observabilidad:** logs y métricas en Cloud Monitoring.

> Los comandos son de referencia (no se ejecutan en el MVP); siguen el flujo estándar de Cloud Endpoints/API Gateway con OpenAPI.

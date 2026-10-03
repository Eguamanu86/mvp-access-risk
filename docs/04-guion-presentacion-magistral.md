# Guion — Presentación magistral: de un modelo de IA a un sistema MLOps

**Proyecto:** MVP — Servicio Inteligente de Riesgo de Acceso (`mg-cr-access-risk-api` + `alp-cr-access-risk-model`)
**Módulo:** MIS-312 · Ingeniería de Software para Sistemas Inteligentes
**Audiencia:** estudiantes de maestría (perfil técnico; no se asume experiencia previa en MLOps)
**Duración objetivo:** 60 min (núcleo) — recortable a 45 y ampliable a 75 (ver sección 12)
**Formato:** magistral con demo en vivo
**Materiales:** MVP corriendo (`docker compose up --build -d`), navegador con interfaz y MLflow, terminal lista

---

## 0. Objetivo docente y mensaje central

**Objetivo de aprendizaje (al terminar, el estudiante debe poder):**

1. Distinguir un **modelo de ML** de un **sistema inteligente** completo.
2. Explicar el **ciclo de vida MLOps** end-to-end y reconocer sus etapas en un caso real.
3. Justificar por qué los **datos, el monitoreo, el feedback y la gobernanza** son tan importantes como el algoritmo.
4. Entender la **resiliencia y el fallback** como parte del diseño de un sistema de IA en producción.

**Mensaje central (se repite 3 veces en la charla):**

> **El backend orquesta, la IA opina y el backend decide.**
> Un modelo de IA no es un sistema inteligente completo.

**Arco narrativo:** partimos de un caso real (autenticación de Enviame) → mostramos por qué "tener un modelo" no basta → construimos el sistema completo delante de ellos → cerramos con el ciclo MLOps y las lecciones.

---

## 1. Estructura y tiempos

| # | Bloque | Min | Acumulado |
|---|---|---|---|
| 1 | Apertura y encuadre | 3 | 3 |
| 2 | El problema: la decisión binaria del login | 5 | 8 |
| 3 | **Tesis central:** modelo ≠ sistema | 4 | 12 |
| 4 | **¿Qué es MLOps?** (bloque conceptual) | 8 | 20 |
| 5 | **Arquitectura** de la solución | 7 | 27 |
| 6 | El modelo y sus señales | 4 | 31 |
| 7 | **Demo en vivo** (choreografía) | 12 | 43 |
| 8 | El ciclo MLOps del MVP (evidencia) | 8 | 51 |
| 9 | Portabilidad multinube y estándar de ingeniería | 5 | 56 |
| 10 | Lecciones y cierre | 4 | 60 |
| 11 | Preguntas | — | — |

> Si solo hay 45 min: recortar bloques 6 y 9 a la mitad y hacer la demo en 8 min (solo 3 escenarios). Si hay 75 min: ampliar bloque 4 (un ejemplo de drift real) y bloque 8 (abrir MLflow y mostrar un run).

---

## 2. Bloque 1 — Apertura y encuadre (3 min)

**Diapositiva 1 — Portada**
- Título: *De un modelo de IA a un sistema MLOps: el caso del riesgo de acceso.*
- Subtítulo: MIS-312 · `mg-cr-access-risk-api`.

**Guion hablado:**
> "Hoy no vamos a hablar de entrenar un modelo. Vamos a hablar de todo lo que hace falta alrededor de un modelo para que sirva de verdad en producción. Vamos a hacerlo con un caso real de Enviame: decidir si un intento de acceso es riesgoso. Y lo van a ver funcionando, no en diapositivas."

**Diapositiva 2 — Agenda**
> "Tres ideas: (1) por qué un modelo no es un sistema; (2) qué es MLOps y cuál es su ciclo de vida; (3) cómo se ve todo eso en un MVP que corre de punta a punta."

**Transición:**
> "Empecemos por el problema."

---

## 3. Bloque 2 — El problema: la decisión binaria del login (5 min)

**Diapositiva 3 — Cómo autentica Enviame hoy**
- EP-Platform actúa como *Backend Auth Proxy*: valida credenciales/Firebase y responde con un token de sesión.
- Ya soporta: password, SSO/OIDC, MFA/2FA, dispositivos de confianza, bloqueo por intentos.
- **Limitación clave:** la decisión de exigir 2FA es **binaria y por reglas**: si el dispositivo es de confianza se omite; si no, se exige.

**Guion hablado:**
> "Hoy el sistema tiene dos cajas: confío o no confío. Si el dispositivo es de confianza, no pido 2FA. Si no, lo pido siempre. Eso significa que un usuario legítimo que viajó, que cambió de red, que se conecta a las 3 de la mañana... paga la misma fricción que un atacante. Y no hay graduación."

**Diapositiva 4 — La oportunidad**
- Pasar de binario → **graduado**: `LOW` → permitir · `MEDIUM` → 2FA · `HIGH` → bloquear.
- Mejora la experiencia del usuario legítimo **sin bajar** el nivel de seguridad.

**Frase ancla para dejar escrita:**
> *Menos fricción cuando el riesgo es bajo; nunca menos seguridad.*

**Transición:**
> "El reflejo natural es decir: ponemos un modelo de IA. Y ahí está la primera trampa de esta clase."

---

## 4. Bloque 3 — Tesis central: modelo ≠ sistema (4 min)

**Diapositiva 5 — El malentendido común**
- Un `model.pkl` o un `model.json` **no es** un producto.
- Preguntas que el modelo **no** responde: ¿cómo lo expongo? ¿qué pasa si tarda? ¿y si se cae? ¿quién decide bloquear? ¿cómo sé que sigue funcionando? ¿con qué datos reentreno?

**Diapositiva 6 — La arquitectura de capas de responsabilidad**

```text
      web  ──►  gateway  ──►  mock-auth  ──►  access-risk-api  ──►  access-risk-model
               (ruteo)      (orquesta/decide)   (reglas + fallback)    (el modelo opina)
```

**Guion hablado:**
> "Fíjense en la última caja: el modelo **opina**. Dice 'score 0.98, riesgo alto'. Pero no bloquea a nadie. El que decide es el backend. Y esa separación no es un detalle: es la diferencia entre un experimento de notebook y un sistema que puedes poner en producción. El modelo opina; el software que lo rodea decide, degrada, audita y aprende."

**Transición:**
> "Entonces, ¿qué es MLOps?"

---

## 5. Bloque 4 — ¿Qué es MLOps? (8 min)

**Diapositiva 7 — Definición operativa**
- MLOps = **ML + DevOps + datos**.
- DevOps resuelve el ciclo del **código**. MLOps resuelve además el ciclo de **datos** y de **modelo**.
- Tres activos que evolucionan a distinto ritmo: **código**, **datos**, **modelo**.

**Guion hablado:**
> "En DevOps versionamos código y desplegamos. Perfecto. Pero en un sistema de IA hay dos activos más que cambian: los **datos** con los que entrenas y el **modelo** que produces. El código puede no haber cambiado y aun así el sistema comportarse distinto, porque cambió el mundo. Eso es lo que MLOps tiene que gobernar."

**Diapositiva 8 — El ciclo de vida MLOps**

```text
datos ─► entrenamiento ─► validación (puerta de calidad) ─► registro/versión
   ▲                                                              │
   │                                                              ▼
feedback (etiquetas) ◄── monitoreo (drift + performance) ◄── despliegue
```

**Guion hablado (recorrer el ciclo con el dedo en la diapositiva):**
> "Este es **el** diagrama de la clase. No es lineal, es un ciclo. Dato → entrena → valida → registra → despliega → monitorea → y lo monitoreado vuelve a alimentar los datos. Si rompen cualquier flecha, dejan de tener MLOps y vuelven a tener un modelo que envejece."

**Diapositiva 9 — Las tres preguntas que definen madurez MLOps**

| Pregunta | Sin MLOps | Con MLOps |
|---|---|---|
| ¿Qué versión del modelo está en producción? | "la que subió Juan" | registro versionado (`1.0.0`, `1.0.1`...) |
| ¿El modelo sigue siendo válido? | no se sabe | monitoreo de drift + métricas de modelo |
| ¿Cómo mejora con el tiempo? | se reentrena "cuando alguien se acuerda" | feedback loop con etiquetas + puerta de calidad |

**Diapositiva 10 — El papel de los datos**
- Datos como **ciudadano de primera clase**: reproducibles (semilla fija), versionados, validados.
- *Garbage in, garbage out*: el mejor algoritmo no salva datos malos.

**Frase ancla:**
> *En MLOps, el modelo es un artefacto; el sistema es el producto.*

**Transición:**
> "Ahora sí veamos la solución, capa por capa."

---

## 6. Bloque 5 — Arquitectura de la solución (7 min)

**Diapositiva 11 — Los 4 servicios + infraestructura**
- `web` (React/Vite) — interfaz de demo.
- `gateway` (Traefik) — punto de entrada único, ruteo y rate limiting.
- `mock-auth` (Node) — simula el `AuthController` de EP-Platform: **orquesta y decide**.
- `access-risk-api` (Node hexagonal) — reglas, fallback, métricas, persistencia.
- `access-risk-model` (Python/Flask) — inferencia: **el modelo opina**.
- Infra: PostgreSQL (auditoría + feedback), MinIO (artefactos), MLflow (tracking/registro).

**Guion hablado:**
> "Tenemos dos microservicios de negocio y el modelo **separado** en su propio servicio. ¿Por qué separado? Porque el equipo de datos puede iterar y desplegar el modelo sin tocar el servicio de autenticación. Son ciclos de vida distintos."

**Diapositiva 12 — Resiliencia: mensaje clave**
- Timeout duro de **250 ms** en cada salto.
- *Circuit breaker*: **3 fallos → abierto**; **10 s → semiabierto**; si responde → cerrado.
- **Fallback en cascada:** si el modelo falla → `access-risk-api` responde `REQUIRE_2FA`; si `access-risk-api` falla → `mock-auth` exige 2FA.
- Principio: **el login nunca se cae.**

**Guion hablado:**
> "Aquí está la lección de ingeniería para sistemas inteligentes: la IA es un componente que **puede fallar**, y cuando falla no puedes tirar abajo el login de toda la empresa. La respuesta segura por defecto es exigir 2FA, que es exactamente lo que hacía antes. Degradar con gracia es parte del diseño, no un parche."

**Transición:**
> "¿Y qué mira el modelo para opinar?"

---

## 7. Bloque 6 — El modelo y sus señales (4 min)

**Diapositiva 13 — Un modelo simple, a propósito**
- **Regresión logística**: explicable, determinista, sin dependencias pesadas.
- Entrenado con **4.000** intentos sintéticos (semilla fija → reproducible).
- `accuracy` de validación: **0.694**.

**Diapositiva 14 — Señales (features) y pesos**

| Señal | Peso | Lectura |
|---|---|---|
| `deviceUnknown` | 2.42 | el factor de mayor riesgo |
| `locationShift` | 1.54 | cambio de ubicación |
| `failedAttempts` | 1.25 | intentos fallidos |
| `velocity` | 1.21 | velocidad de desplazamiento implausible |
| `unusualHour` | 0.90 | horario inusual (madrugada) |
| `bias` | −2.13 | sesgo: por defecto, el intento es de bajo riesgo |

**Diapositiva 15 — De score a decisión**
- `score` ∈ [0,1] → nivel: `LOW` (< 0.33) · `MEDIUM` (0.33–0.66) · `HIGH` (> 0.66).
- Traducción a decisión: `ALLOW` / `REQUIRE_2FA` / `BLOCK`.

**Guion hablado:**
> "Usamos el modelo más aburrido posible a propósito. Quiero que quede una idea: en MLOps el valor no está en el algoritmo más sofisticado, está en el sistema. Y un modelo explicable, que cabe en un JSON de 41 líneas y no necesita GPU, es perfectamente suficiente para un gran impacto."

**Frase ancla:**
> *El umbral no es una verdad estadística: es una decisión de negocio.*

---

## 8. Bloque 7 — Demo en vivo (12 min)

> **Antes de empezar:** ten dos terminales listas y el navegador en `http://localhost:5173`. Los comandos y resultados de abajo están **verificados** con el MVP real.

**Diapositiva 16 — Qué vamos a ver**
- Decisión graduada · caída del servicio · latencia · recuperación · drift.

**Diapositiva 17 — Estado del stack**

```bash
docker compose ps
```
> Mostrar el gateway, los dos servicios, web, postgres (healthy), minio, mlflow.

### Escenario 1 — Decisión graduada (3 min)

En la interfaz: botón *Riesgo bajo* y luego *Riesgo alto*. Alternativa por terminal:

```bash
# Riesgo bajo -> ALLOW
curl -s -X POST http://localhost:8210/demo/login -H "Content-Type: application/json" \
  -d '{"username":"demo","signals":{"deviceKnown":true,"failedAttempts":0,"locationShiftKm":5,"hour":14,"velocityKmh":10}}'

# Riesgo alto -> BLOCK
curl -s -X POST http://localhost:8210/demo/login -H "Content-Type: application/json" \
  -d '{"username":"demo","signals":{"deviceKnown":false,"failedAttempts":2,"locationShiftKm":850,"hour":3,"velocityKmh":900}}'
```

**Resultado esperado (verificado):** `ALLOW` con `score 0.1079` y `BLOCK` con `score 0.9803`; en ambos aparece la **traza** del flujo (`risk.received → model.calling → model.responded → decision.made`) y un `decisionId` (la decisión quedó **persistida**).

**Guion hablado:**
> "Miren la última parte: `decisionId 291`. Cada decisión quedó registrada en PostgreSQL. Eso es la auditoría, y es la materia prima del feedback loop."

### Escenario 2 — El servicio se cae: el login NO se cae (3 min)

```bash
curl -s -X POST http://localhost:8210/demo/chaos -H "Content-Type: application/json" -d '{"riskDown":true}'
curl -s -X POST http://localhost:8210/demo/login -H "Content-Type: application/json" \
  -d '{"username":"demo","signals":{"deviceKnown":true,"failedAttempts":0,"locationShiftKm":5,"hour":14,"velocityKmh":10}}'
```

**Resultado esperado:** `decision: REQUIRE_2FA`, `fallback: true`.

**Guion hablado:**
> "Matamos el servicio de riesgo. ¿Se cayó el login? No. Exigimos 2FA. Fíjense que es el comportamiento seguro por defecto. La disponibilidad manda."

### Escenario 3 — Latencia alta: el timeout dispara el mismo fallback (2 min)

```bash
curl -s -X POST http://localhost:8210/demo/chaos -H "Content-Type: application/json" -d '{"latencyMs":800}'
curl -s -X POST http://localhost:8210/demo/login -H "Content-Type: application/json" -d '{"username":"demo"}'
```

**Resultado esperado:** el timeout de **250 ms** corta la espera → `fallback: true`.

**Guion hablado:**
> "No hace falta que el servicio se caiga. Basta con que sea lento. Un modelo elegante que responde en un segundo es, para el login, un modelo inútil. La latencia es un requisito de negocio."

### Escenario 4 — Recuperación: el circuit breaker cierra (2 min)

```bash
curl -s -X POST http://localhost:8210/demo/reset
curl -s -X POST http://localhost:8210/demo/login -H "Content-Type: application/json" \
  -d '{"username":"demo","signals":{"deviceKnown":true,"failedAttempts":0,"locationShiftKm":5,"hour":14,"velocityKmh":10}}'
```

**Resultado esperado:** `circuit: closed`, `fallback: false`, `ALLOW`.

### Escenario 5 — Data drift (2 min)

- Activar *Data drift* en la interfaz (o `POST /demo/chaos {"drift":true}`).
- Generar varias evaluaciones y abrir métricas:

```bash
curl -s http://localhost:8210/v1/access-risk/metrics
```

**Resultado esperado:** el panel alerta con **PSI > 0.25**.

**Guion hablado:**
> "El modelo no cambió. El código no cambió. Lo que cambió es el **mundo**: ahora llegan más dispositivos desconocidos desplazándose a velocidades imposibles. Esto es *data drift*, y si no lo monitoreas, tu modelo se degrada en silencio."

**Transición:**
> "Ahora bajemos la demo a sus tripas: el ciclo MLOps del MVP."

---

## 9. Bloque 8 — El ciclo MLOps del MVP (8 min)

**Diapositiva 18 — Matriz MLOps (qué está y qué falta)**

| Capacidad | Estado | Evidencia en el MVP |
|---|---|---|
| Versionado de código | Sí | Bitbucket + CI/CD |
| Versionado de datos | Parcial | datos sintéticos con semilla fija (reproducibles) |
| Versionado de modelo | Sí | `model.json` (`version`) + `models/registry.json` |
| Entrenamiento reproducible | Sí | `train.py` (semilla fija) |
| Puerta de calidad | Sí | `retrain.py`: promueve solo si mejora |
| Registro de modelos | Sí | `models/registry.json` + MLflow |
| CI/CD | Sí | `bitbucket-pipelines.yml` + `cloudbuild.yaml` |
| Despliegue | Sí | Docker + Cloud Run + `env.test/stage/prod.yaml` |
| Monitoreo | Sí | `/metrics` (latencia, conteos, fallback, circuit) |
| Persistencia / auditoría | Sí | PostgreSQL `access_risk_decisions` |
| Feedback loop (etiquetas) | Sí | `POST /v1/access-risk/feedback` (`fraud`/`legit`) |
| Métricas de modelo | Sí | precisión, recall y FP/FN (predicho vs. real) |
| Detección de data drift | Sí | PSI en el servicio de inferencia |
| Umbrales / alertas | Sí | drift > 0.25; circuit 3 fallos / 10 s |
| Reentrenamiento | Sí (manual/CI) | `retrain.py`; disparador: alerta de drift |
| Resiliencia / fallback | Sí | circuit breaker + fallback a 2FA |
| Rollback | Parcial | versionado permite revertir; falta automatizar |

**Guion hablado:**
> "Ninguna de estas filas es 'tener un modelo'. Todas son **sistema**. Y fíjense que hay dos filas en 'parcial': ahí está la honestidad de ingeniería. Un MVP no es fingir que está todo; es saber exactamente qué falta."

**Diapositiva 19 — El feedback loop (la pieza que casi todos olvidan)**

```text
decisión (ALLOW/2FA/BLOCK) ─► se persiste ─► llega el resultado real (fraud/legit)
                                    ▲                        │
                                    └──── se etiqueta y entra al dataset de reentrenamiento
```

- Sin **etiquetas** no hay aprendizaje. El modelo no mejora "solo porque pasa el tiempo".
- `POST /v1/access-risk/feedback` con `{ decisionId, outcome }`.

**Diapositiva 20 — La puerta de calidad (champion/challenger)**

```bash
python retrain.py --concept-drift
```

- Se entrena un **candidato** y se compara contra el **modelo actual**.

**Evidencia (verificada):**
- Sin concept drift: candidato `0.750` vs. actual `0.751` → **rechazado** (no mejora).
- Con concept drift: candidato `0.783` vs. actual `0.724` → **promovido** a `1.0.1`.

**Guion hablado:**
> "Aquí está una de las ideas más MLOps de todo el proyecto: el reentrenamiento no despliega automáticamente. Pasa por una **puerta de calidad**. Si el nuevo modelo no es mejor, no entra. Si es mejor, se promueve a una nueva versión. Esto es lo que evita que la automatización empeore el sistema."

**Diapositiva 21 — Tracking y registro (MLflow + MinIO)**
- Abrir `http://localhost:5000` y mostrar los experimentos, parámetros, métricas y el artefacto `model.json` guardado en MinIO (`http://localhost:9001`).

**Guion hablado:**
> "Esto responde a la pregunta '¿qué versión está en producción y cómo la reproduzco?'. Cada run queda registrado: parámetros, métricas y el artefacto. Eso es trazabilidad, y es requisito en cualquier industria regulada."

---

## 10. Bloque 9 — Portabilidad multinube y estándar de ingeniería (5 min)

**Diapositiva 22 — Puertos y adaptadores (hexagonal)**
- La lógica de negocio (usecase) no sabe si habla con PostgreSQL o MySQL, con MinIO o GCS, con MLflow local o Vertex.
- Cambia el **adaptador**, no el negocio.

| Capacidad | Local (OSS) | GCP | AWS | Azure |
|---|---|---|---|---|
| Gateway | Traefik | API Gateway | API Gateway | API Management |
| Cómputo | Docker Compose | Cloud Run | ECS/EKS | Container Apps |
| SQL | PostgreSQL | Cloud SQL | RDS | Azure SQL |
| Objetos (S3) | MinIO | Cloud Storage | S3 | Blob |
| Tracking/registro | MLflow | Vertex | SageMaker | Azure ML |

**Guion hablado:**
> "Esto es la respuesta a '¿y si mañana quieren pasar esto a otra nube?'. La portabilidad no viene de elegir bien la nube; viene de depender de **interfaces y protocolos estándar** (S3, SQL, OTLP), no de SDKs propietarios. La arquitectura hexagonal es exactamente eso."

**Diapositiva 23 — Estándar de ingeniería Enviame**
- Node `^24`, Express 5, hexagonal (4 capas), errores tipados, Winston (sin `console.*`).
- Calidad: Jest + Supertest; pipeline lint → tests → cobertura → SonarQube.
- Despliegue: Cloud Run, Secret Manager, contenedor no root, servicio no público.

**Evidencia de pruebas (verificada):** inferencia `16 passed`; servicio de riesgo `11` unit + `5` integración; lint sin errores.

---

## 11. Bloques 10 — Lecciones y cierre (4 min)

**Diapositiva 24 — Cinco lecciones para llevar**

1. **Un modelo no es un sistema.** El valor está en orquestar, decidir, degradar y auditar.
2. **MLOps es un ciclo, no una fase.** Si el monitoreo no alimenta a los datos, el ciclo está roto.
3. **Los datos y las etiquetas son el combustible.** Sin feedback loop, el modelo se estanca y envejece.
4. **La resiliencia es diseño.** Timeout, circuit breaker y fallback seguro mantienen vivo el login.
5. **La puerta de calidad hace confiable la automatización.** No promuevas lo que no mejora.

**Diapositiva 25 — Mensaje de cierre (volver al inicio)**

> **El backend orquesta, la IA opina y el backend decide.**
> Lo inteligente no es el modelo: es el **sistema**.

**Guion final:**
> "Volvamos a la primera imagen. El modelo opina: 0.98, riesgo alto. Y se acabó su trabajo. Todo lo demás —decidir, caer bien, auditar, aprender y mejorar— es ingeniería de software. Eso es MLOps. Y por eso este módulo se llama ingeniería de software **para** sistemas inteligentes: porque el sistema es la parte difícil."

**Transición a Q&A:**
> "Preguntas."

---

## 12. Ajustes de duración

- **45 min:** bloques 6 y 9 a 2 min; demo con escenarios 1, 2 y 5 solamente (8 min); Q&A 5 min.
- **60 min:** guion tal cual.
- **75 min:** añadir al bloque 4 un ejemplo de *concept drift* con datos reales; en el bloque 8, abrir MLflow y recorrer un run completo; 10 min de Q&A.

---

## 13. Preguntas frecuentes (preparar respuestas)

| Pregunta probable | Respuesta breve |
|---|---|
| ¿Por qué regresión logística y no una red neuronal? | Explicabilidad, determinismo, latencia y no dependencia de GPU. En MLOps el sistema aporta el valor; el algoritmo es intercambiable (el artefacto se reemplaza sin recompilar). |
| ¿No es más simple tener el modelo dentro del servicio Node? | Más simple, pero acopla dos ciclos de vida. Al separarlo, el equipo de IA itera y despliega sin tocar la autenticación. |
| ¿Qué pasa si el modelo se equivoca y bloquea a un usuario legítimo? | Es el costo de los **falsos positivos**; por eso hay feedback (`fraud`/`legit`), métricas de precisión/recall y una puerta de calidad antes de promover. El umbral es una decisión de negocio, ajustable. |
| ¿Cómo se detecta que el modelo dejó de servir? | Data drift con PSI > 0.25 y métricas de modelo (predicho vs. real) alimentadas por el feedback. |
| ¿Por qué no reentrenar y desplegar automáticamente? | Riesgo de empeorar el sistema. La puerta de calidad (candidato vs. actual) promueve solo si mejora. |
| ¿Esto escala a millones de logins? | Servicios stateless + Cloud Run con autoscaling; la ventana de drift en memoria se agrega por instancia (brecha documentada para producción). |
| ¿Qué falta para producción? | Drift distribuido, registro gestionado (Vertex), disparador automático de reentrenamiento, rollback/canary y auditoría persistente distribuida. |

---

## 14. Checklist antes de presentar

- [ ] `docker compose up --build -d` y `docker compose ps` con todo `Up` (postgres `healthy`).
- [ ] Interfaz responde en `http://localhost:5173`; MLflow en `http://localhost:5000`.
- [ ] Ejecutados los 5 escenarios de la demo al menos una vez (y `POST /demo/reset` al final).
- [ ] Terminales con los comandos copiados (evitar teclear en vivo).
- [ ] Fuente de la terminal agrandada (proyección).
- [ ] Plan B si falla la red: los servicios internos no dependen de internet.
- [ ] Cronómetro por bloque.

---

## 15. Anexo — Mapa concepto MLOps → evidencia en el MVP

| Concepto MLOps | Dónde se ve en el MVP |
|---|---|
| Modelo como artefacto versionado | `model.json` (`version`, `thresholds`, `metrics`) + `models/registry.json` |
| Reproducibilidad | `train.py` con semilla fija (4.000 muestras) |
| Puerta de calidad | `retrain.py` (candidato vs. actual; promoción a `1.0.1`) |
| Registro / tracking | MLflow (`:5000`) + MinIO (`:9001`) |
| Feature engineering / señales | `deviceUnknown`, `failedAttempts`, `locationShift`, `unusualHour`, `velocity` |
| Umbrales como decisión de negocio | `low 0.33` / `high 0.66` → `ALLOW`/`REQUIRE_2FA`/`BLOCK` |
| Monitoreo de modelo | `GET /v1/access-risk/metrics` (precisión, recall, FP/FN) |
| Data drift | PSI, alerta si `> 0.25` |
| Feedback loop | `POST /v1/access-risk/feedback` (`fraud`/`legit`) + `access_risk_decisions.outcome` |
| Resiliencia | timeout 250 ms + circuit breaker (3/10 s) + fallback a 2FA |
| Gobernanza / auditoría | PostgreSQL `access_risk_decisions` (`decisionId`, `model_version`) |
| Portabilidad | Puertos/adaptadores; tabla local ↔ GCP/AWS/Azure |
| CI/CD/CT | `bitbucket-pipelines.yml` + `cloudbuild.yaml` + `retrain.py` |
| Observabilidad | Winston (JSON), `execution_id`, métricas y trazas en la respuesta |

---

## 16. Anexo — Prompts de ilustración para generación de imágenes

> **Cómo usarlos:** los prompts están en inglés (mejor rendimiento en modelos de imagen). Para cada diapositiva, concatena el **prefijo de estilo global** con el **sujeto** correspondiente. Devuélvelos a la IA que arma las diapositivas junto con el número de slide para que inserte cada imagen en su lugar.

### 16.1. Guía de estilo global (reutilizar en todas)

**Prefijo de estilo (STYLE):**

```text
Modern editorial tech illustration, flat vector with subtle gradients and soft long shadows,
isometric / 2.5D perspective, clean and minimal, professional engineering aesthetic,
deep navy background (#0B1220) with cyan (#22D3EE) and amber (#F59E0B) accents,
subtle blueprint grid motif, soft glow on key elements, high contrast, uncluttered composition,
centered subject with generous negative space for slide text, 16:9 aspect ratio,
absolutely no text, no letters, no numbers, no words, no logos, no watermarks.
```

**Negative prompt (aplicar a todas):**

```text
text, letters, numbers, words, captions, watermark, logo, signature, UI screenshots,
photorealistic human faces, distorted anatomy, clutter, low contrast, blurry, noisy, jpeg artifacts
```

**Regla de consistencia:** mismo fondo (`#0B1220`), misma paleta (cian = flujo/dato, ámbar = decisión/alerta, verde = permitido, rojo = bloqueado), mismo estilo isométrico plano. Personajes, si aparecen, deben ser siluetas abstractas (sin rostro).

### 16.2. Prompts por diapositiva

| Slide | Título | Sujeto a concatenar con STYLE |
|---|---|---|
| 1 | Portada | A single glowing cyan node at the center of an organized constellation of connected system blocks; one small cube (the model) feeds a structured network of pipes and gears that all respond to it; hero composition, sense of orchestration, dramatic but clean |
| 2 | Agenda | Three milestone pillars along a winding path that rises into the distance; each pillar a distinct abstract glyph (a cube, a loop, a factory); isometric journey, forward motion |
| 3 | Cómo autentica hoy | A secure login gate with two rigid doors: one open (trusted device) and one closed requiring a key card; a simple binary toggle above them; sense of an on/off switch, no middle ground |
| 4 | La oportunidad | A transformation from a crude two-position switch into an elegant three-stop graduated dial/dimmer; a smooth gradient path from green to amber to red; sense of fine-grained control |
| 5 | Modelo ≠ sistema | On the left, a lone floating cube labeled only by a subtle glow; on the right, an entire isometric factory of pipes, conveyors and gears that surrounds and operates the cube; the cube is one part among many |
| 6 | Capas de responsabilidad | A horizontal chain of five isometric service blocks (browser, gateway arch, orchestrator, rule engine, small model gear) connected left to right by glowing data pipes; the last block glows faintly to show it only advises |
| 7 | Definición MLOps | Three interlocking gears of equal size with abstract surfaces (circuit traces, flowing data particles, a neural node); they mesh smoothly together as one mechanism |
| 8 | Ciclo de vida MLOps | A large circular lifecycle loop made of connected isometric stations (database, training lab, quality gate, registry shelf, rocket, radar dish); glowing arrow returns from the radar back to the database, closing the circle |
| 9 | Madurez MLOps | A control-room console with a single large gauge whose needle moves across empty question-mark-shaped markers; beside it, a tidy stack of versioned boxes and a monitoring radar; sense of measurement and control |
| 10 | Datos como ciudadano de primera clase | A luminous database core at the center of a small city of pipes and containers, treated like a precious monument under a spotlight; data particles flowing in and out |
| 11 | Arquitectura 4 servicios | An isometric microservices city: a gateway tollbooth, a small auth building, a rule-engine factory and a small model brain, plus a database vault, a storage silo and an MLflow observatory, all linked by glowing pipes |
| 12 | Resiliencia | An electrical circuit-breaker switch mid-flip with a soft safety net stretched beneath a walking path; a small model gear stumbles but the path stays intact; a shield icon subtly glowing, sense of graceful degradation |
| 13 | Modelo simple | A clean transparent box containing a simple balance scale (weights and a bias pivot) on a pedestal; nearby, a complex tangled mess of wires lies ignored in the shadow; minimalism wins |
| 14 | Señales y pesos | Five vertical levers / sliders of different heights, each topped with an abstract icon (unknown device, padlock, map pin, moon clock, speedometer); one lever glows brighter with more weight |
| 15 | Score a decisión | A horizontal spectrum bar flowing green to amber to red, with a movable marker and three glowing gate icons above (open gate, key card, barrier); a business-control vibe |
| 16 | Qué vamos a ver | A small theater stage / mission-control desk with five empty glowing frames waiting to be filled; spotlight ready, sense of anticipation |
| 17 | Estado del stack | An isometric map of running containers as neat city blocks with green status lights on top, connected by glowing pipes; a healthy, humming network |
| 18 | Matriz MLOps | A scoreboard / checklist panel of isometric rows of toggles, most glowing green, two glowing amber; a clipboard-like structure, sense of honest auditing |
| 19 | Feedback loop | A circular conveyor: decisions as tagged parcels travel out, come back with a "label" stamp, and feed a training hopper; arrow closes the loop; a small brain gear improves |
| 20 | Puerta de calidad | A quality gate/filter with two candidate cubes on invisible scales; one candidate is measured and rejected (dimmed), the better one passes through a glowing doorway; champion vs challenger |
| 21 | MLflow + MinIO | An observatory full of glass domes, each holding a recorded experiment run with sparkline trails; beside it a storage silo filling with a model artifact; tracking and registry, sense of reproducibility |
| 22 | Puertos y adaptadores | A standardized power socket on a wall with interchangeable plug adapters hovering (cloud-shaped, gear-shaped, database-shaped) that all fit the same port; universal standard metaphor |
| 23 | Estándar de ingeniería | A pristine isometric assembly line with quality-check stations (lint, tests, coverage, scan) and a rocket at the end; blueprint aesthetic, everything disciplined and labeled by shape only |
| 24 | Cinco lecciones | Five ascending stepping stones leading to a summit platform where a small conductor figure (abstract silhouette) directs an orchestra of service blocks; growth and mastery |
| 25 | Cierre | An abstract conductor silhouette directing an orchestra where the smallest instrument is a glowing model cube; the whole orchestra is the system; warm hopeful finale, central spotlight |

### 16.3. Prompts alternativos (si el estilo plano no convence)

- **Variante "manuscrito/blueprint":** `Technical blueprint illustration on dark grid paper, precise white line art with cyan highlights, engineering schematics, exploded isometric views, no text, 16:9.`
- **Variante "3D render corporativo":** `Clean 3D render, soft studio lighting, matte materials, glass and brushed metal, deep blue environment with cyan rim light, shallow depth of field, centered hero object, no text, 16:9.`
- **Variante "collage de datos":** `Abstract data-art collage, flowing particle streams and network nodes, bokeh, cinematic, deep navy and cyan, subtle amber highlights, no text, 16:9.`

---

## 17. Material para estudiantes — El flujo MLOps completo del caso (resumen)

> **Lectura de apoyo.** Sintetiza, para estudio posterior a la clase, cómo el caso *MVP — Riesgo de Acceso* recorre el ciclo de vida MLOps de punta a punta. Cada etapa indica qué ocurre, con qué artefacto se evidencia y qué concepto de MLOps ilustra.

### 17.1. El caso en una frase

Se construyó un **sistema inteligente** que evalúa el riesgo de un intento de acceso y permite al backend decidir de forma graduada (`ALLOW` / `REQUIRE_2FA` / `BLOCK`), sin que el login deje de funcionar si la IA falla. La idea rectora es que **el modelo opina y el sistema decide**: la inteligencia no está en el algoritmo, sino en la ingeniería que lo rodea.

### 17.2. Los componentes

| Componente | Responsabilidad | Tecnología |
|---|---|---|
| `access-risk-model` | Inferencia: produce el `score` de riesgo | Python / Flask |
| `access-risk-api` | Reglas de negocio, fallback, métricas y persistencia | Node hexagonal |
| `mock-auth` | Orquesta el login y toma la decisión final | Node / Express |
| `web` | Interfaz de demostración | React + Vite + TS |
| Gateway | Entrada única, ruteo y rate limiting | Traefik |
| PostgreSQL | Auditoría de decisiones y feedback | PostgreSQL 16 |
| MLflow + MinIO | Tracking de experimentos y registro de modelos | MLflow / MinIO |

### 17.3. El flujo completo, en nueve etapas

| # | Etapa | Qué ocurre | Evidencia en el MVP | Concepto MLOps |
|---|---|---|---|---|
| 1 | **Problema y decisión de negocio** | Se traduce una necesidad real (fricción del 2FA) en una decisión graduada con umbrales | `docs/00-analisis.md`, umbrales `0.33 / 0.66` | Alineación negocio ↔ modelo |
| 2 | **Datos** | Se generan intentos sintéticos con semilla fija (reproducibles) | `train.py`, 4.000 muestras | Datos como ciudadano de primera clase |
| 3 | **Entrenamiento** | Regresión logística sobre cinco señales | `train.py`, `model.json` (`accuracy 0.694`) | Reproducibilidad |
| 4 | **Versionado del modelo** | El modelo es un artefacto con versión, no código | `model.json` (`version 1.0.0`), `models/registry.json` | Modelo versionado |
| 5 | **Servicio de inferencia** | El modelo se expone en un microservicio independiente y desplegable | `access-risk-model` (`POST /predict`) | Desacople del ciclo de vida del modelo |
| 6 | **Integración y orquestación** | El backend consulta el riesgo con *timeout* y decide; si falla, aplica fallback | `mock-auth` → `access-risk-api` | Separación modelo / sistema; decisión en el backend |
| 7 | **Operación y monitoreo** | Se observan métricas de sistema y de modelo, y se detecta *data drift* | `GET /v1/access-risk/metrics`, PSI `> 0.25` | Monitoreo de desempeño y drift |
| 8 | **Feedback y etiquetado** | Llega el resultado real (`fraud` / `legit`) y se adjunta a la decisión | `POST /v1/access-risk/feedback`, tabla `access_risk_decisions` | Feedback loop (realimentación) |
| 9 | **Reentrenamiento con puerta de calidad** | Se entrena un candidato y se promueve solo si mejora al actual; se registra el run | `retrain.py`, MLflow + MinIO | Champion/challenger, registro, trazabilidad |

**El punto clave:** las etapas 1–5 producen un modelo; las etapas 6–9 producen un **sistema que mejora con el tiempo**. Un proyecto que se detiene en la etapa 5 tiene un modelo, pero no tiene MLOps.

### 17.4. Dos ritmos: el flujo online y el flujo offline

```text
FLUJO ONLINE (milisegundos)                       FLUJO OFFLINE (horas / días)
usuario ─► mock-auth ─► access-risk-api           datos etiquetados (feedback)
             └─► access-risk-model ─► score              │
                   │                                      ▼
                   ▼                               retrain.py (candidato)
             decisión + auditoría (PostgreSQL)          │
                   │                                      ▼
                   └────────── etiqueta real ──►  puerta de calidad ─► registro
                                                          │
                                                          ▼
                                                   nueva versión desplegable
```

- El **flujo online** debe ser rápido, disponible y seguro (nunca cae el login).
- El **flujo offline** puede ser lento, pero debe ser reproducible, auditable y mejorar la calidad.
- El **feedback** es el puente que conecta ambos: convierte decisiones en datos de entrenamiento.

### 17.5. Resiliencia: qué pasa cuando algo falla

| Falla | Respuesta del sistema | Decisión |
|---|---|---|
| El modelo tarda más de 250 ms | El *timeout* corta la espera | `REQUIRE_2FA` (fallback) |
| El servicio de riesgo está caído | El *circuit breaker* abre tras 3 fallos | `REQUIRE_2FA` (fallback) |
| El modelo (o el servicio) se recupera | El *circuit breaker* cierra tras 10 s | decisión normal otra vez |

Principio de diseño: **ante la duda, se aumenta la seguridad, nunca se elimina el servicio.** El fallback no es un error: es una decisión de negocio deliberada.

### 17.6. Qué cubre el MVP y qué queda para producción

- **Cubierto:** versionado de código/modelo, entrenamiento reproducible, puerta de calidad, registro, CI/CD, despliegue, monitoreo, persistencia, feedback loop, métricas de modelo, detección de drift, resiliencia.
- **Pendiente (documentado como brecha):** drift distribuido multi-instancia, registro gestionado (Vertex), disparador automático de reentrenamiento, rollback/canary automatizado y auditoría persistente a gran escala.

Un buen sistema MLOps no es el que no tiene brechas, sino el que las **conoce y las documenta**.

### 17.7. Glosario mínimo

| Término | Definición breve |
|---|---|
| **MLOps** | Disciplina que extiende DevOps al ciclo de vida de datos y modelos. |
| **Artefacto** | Resultado versionado y reproducible (el `model.json`). |
| **Data drift** | Cambio en la distribución de las entradas respecto al entrenamiento. |
| **Feedback loop** | Uso del resultado real para reetiquetar y reentrenar. |
| **Puerta de calidad** | Validación que impide promover un modelo que no mejora. |
| **Circuit breaker** | Mecanismo que deja de intentar una dependencia fallida y degrada con seguridad. |
| **Fallback** | Respuesta segura por defecto cuando una dependencia no está disponible. |
| **Puertos y adaptadores** | Arquitectura que aísla la lógica de negocio de la infraestructura. |

### 17.8. Preguntas de autoevaluación

1. ¿Por qué separar el modelo en su propio servicio en lugar de incluirlo en el backend?
2. ¿Qué diferencia hay entre un *timeout* y un *circuit breaker*, y cuándo actúa cada uno?
3. ¿Por qué el fallback exige 2FA en lugar de permitir el acceso?
4. ¿Qué evidencia usarías para afirmar que "el modelo sigue siendo válido" hoy?
5. ¿Por qué no se despliega automáticamente el modelo reentrenado?
6. ¿Qué convierte una decisión en un dato de entrenamiento útil?
7. ¿Qué cambiarías si la nube objetivo fuese AWS en lugar de GCP?

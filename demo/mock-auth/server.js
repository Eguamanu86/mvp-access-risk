'use strict'

const { randomUUID } = require('crypto')

/**
 * Consumidor simulado de autenticacion (AuthController).
 *
 * Emula un flujo de autenticacion real: recibe el intento de login,
 * consulta el servicio de riesgo y decide (permitir / exigir 2FA / bloquear).
 * Ante la indisponibilidad del servicio, aplica el fallback (exigir 2FA).
 *
 * Es un artefacto SOLO para la demo: no es un servicio de produccion.
 */

const express = require('express')

const PORT = Number(process.env.PORT || 8080)
const RISK_API_URL = process.env.RISK_API_URL || 'http://access-risk-api:8080'
const RISK_TIMEOUT_MS = Number(process.env.RISK_TIMEOUT_MS || 250)
const FAILURE_THRESHOLD = Number(process.env.CIRCUIT_FAILURE_THRESHOLD || 3)
const COOLDOWN_MS = Number(process.env.CIRCUIT_COOLDOWN_MS || 10000)

const chaos = { riskDown: false, latencyMs: 0, drift: false }
const circuit = { state: 'closed', failures: 0, openedAt: 0 }

function canAttempt(now = Date.now()) {
  if (circuit.state === 'open' && now - circuit.openedAt >= COOLDOWN_MS) {
    circuit.state = 'half-open'
  }
  return circuit.state !== 'open'
}

function onSuccess() {
  circuit.state = 'closed'
  circuit.failures = 0
}

function onFailure(now = Date.now()) {
  circuit.failures += 1
  if (circuit.state === 'half-open' || circuit.failures >= FAILURE_THRESHOLD) {
    circuit.state = 'open'
    circuit.openedAt = now
  }
}

// Clientes SSE conectados: reciben cada salto del flujo en tiempo real.
const sseClients = new Set()

function emit(event) {
  const payload = `data: ${JSON.stringify(event)}\n\n`
  sseClients.forEach((client) => client.write(payload))
}

// Cuando el drift esta activo, la poblacion de intentos cambia: mas
// dispositivos desconocidos y desplazamientos improbables.
function applyDrift(signals) {
  if (!chaos.drift) {
    return signals
  }
  return {
    ...signals,
    deviceKnown: false,
    locationShiftKm: Math.max(Number(signals.locationShiftKm) || 0, 800),
    hour: 3,
    velocityKmh: Math.max(Number(signals.velocityKmh) || 0, 700),
  }
}

async function callRiskApi(signals, username) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), RISK_TIMEOUT_MS)
  try {
    // Latencia simulada dentro de la ventana del timeout.
    if (chaos.latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, chaos.latencyMs))
    }
    const response = await fetch(`${RISK_API_URL}/v1/access-risk/evaluate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, executionId: randomUUID(), signals }),
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new Error(`risk api responded ${response.status}`)
    }
    const payload = await response.json()
    return payload.data
  } finally {
    clearTimeout(timer)
  }
}

const app = express()
app.disable('x-powered-by')
app.use(express.json({ limit: '1mb' }))

// CORS abierto: solo para la demo local (la interfaz corre en otro puerto).
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204)
  }
  return next()
})

app.get('/demo/health', (req, res) => {
  res.send({ code: 'success', data: { status: 'ok' } })
})

// Server-Sent Events: stream del flujo de la simulacion en tiempo real.
app.get('/demo/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()
  res.write('data: {"type":"ready"}\n\n')
  sseClients.add(res)
  req.on('close', () => sseClients.delete(res))
})

app.get('/demo/chaos', (req, res) => {
  res.send({ code: 'success', data: { ...chaos, circuit: circuit.state } })
})

app.post('/demo/chaos', (req, res) => {
  const body = req.body || {}
  if (body.riskDown !== undefined) {
    chaos.riskDown = Boolean(body.riskDown)
  }
  if (body.latencyMs !== undefined) {
    chaos.latencyMs = Number(body.latencyMs)
  }
  if (body.drift !== undefined) {
    chaos.drift = Boolean(body.drift)
  }
  res.send({ code: 'success', data: { ...chaos, circuit: circuit.state } })
})

app.post('/demo/reset', (req, res) => {
  chaos.riskDown = false
  chaos.latencyMs = 0
  chaos.drift = false
  circuit.state = 'closed'
  circuit.failures = 0
  res.send({ code: 'success', data: { reset: true } })
})

app.post('/demo/login', async (req, res) => {
  const body = req.body || {}
  const signals = applyDrift(body.signals || {})

  emit({ type: 'received', username: body.username || 'usuario' })

  let decision = 'REQUIRE_2FA'
  let risk = null
  let fallback = false

  if (!chaos.riskDown && canAttempt()) {
    emit({ type: 'calling' })
    try {
      risk = await callRiskApi(signals, body.username)
      onSuccess()
      decision = risk.decision
      emit({ type: 'steps', steps: risk.trace || [] })
      if (risk.decisionId) {
        emit({ type: 'persisted', decisionId: risk.decisionId })
      }
    } catch (err) {
      onFailure()
      fallback = true
      emit({ type: 'steps', steps: [{ step: 'risk.failed', ms: 0 }] })
    }
  } else {
    fallback = true
    emit({ type: 'steps', steps: [{ step: chaos.riskDown ? 'risk.down' : 'circuit.open', ms: 0 }] })
  }

  if (fallback) {
    decision = 'REQUIRE_2FA'
  }

  emit({ type: 'decision', decision, fallback, circuit: circuit.state })

  res.send({
    code: 'success',
    data: {
      username: body.username || 'usuario',
      decision,
      requires2fa: decision === 'REQUIRE_2FA',
      fallback,
      circuit: circuit.state,
      drift: chaos.drift,
      risk,
    },
  })
})

app.listen(PORT, () => {
  process.stdout.write(`mock-auth escuchando en ${PORT}\n`)
})

'use strict'

/**
 * Logica de negocio del servicio de riesgo.
 *
 * Principio del modulo: el backend orquesta, la IA opina y el backend decide.
 * El servicio traduce el nivel de riesgo en una decision y, ante la
 * indisponibilidad del modelo, aplica el fallback (exigir 2FA).
 */

const { RISK_LEVELS, DECISIONS } = require('../utils/constants')
const { ValidationError, NotFoundError } = require('../utils/errors')

const DECISION_BY_LEVEL = {
  [RISK_LEVELS.LOW]: DECISIONS.ALLOW,
  [RISK_LEVELS.MEDIUM]: DECISIONS.REQUIRE_2FA,
  [RISK_LEVELS.HIGH]: DECISIONS.BLOCK,
}

// Rangos validos por senal numerica (los mismos que valida el servicio de
// inferencia), para rechazar entradas invalidas con 400 en vez de degradar a
// fallback por culpa de un 400 del modelo.
const SIGNAL_RANGES = {
  failedAttempts: [0, 5],
  locationShiftKm: [0, 1000],
  hour: [0, 23],
  velocityKmh: [0, 1200],
}

class AccessRiskUsecase {
  constructor(modelRepository, logger, auditRepository = null) {
    this.modelRepository = modelRepository
    this.logger = logger
    this.auditRepository = auditRepository
    this.metrics = {
      requests: 0,
      decisions: { ALLOW: 0, REQUIRE_2FA: 0, BLOCK: 0 },
      levels: { LOW: 0, MEDIUM: 0, HIGH: 0 },
      fallbacks: 0,
      latencySum: 0,
      latencyMax: 0,
    }
  }

  validate(signals) {
    if (!signals || typeof signals !== 'object') {
      throw new ValidationError('signals is required')
    }
    if (typeof signals.deviceKnown !== 'boolean') {
      throw new ValidationError('signal "deviceKnown" must be a boolean')
    }
    Object.entries(SIGNAL_RANGES).forEach(([field, [low, high]]) => {
      const value = signals[field]
      if (typeof value !== 'number' || Number.isNaN(value)) {
        throw new ValidationError(`signal "${field}" must be numeric`)
      }
      if (value < low || value > high) {
        throw new ValidationError(`signal "${field}" must be between ${low} and ${high}`)
      }
    })
  }

  buildReason(signals, level) {
    if (level === RISK_LEVELS.LOW) {
      return 'senales dentro de lo habitual'
    }
    const reasons = []
    if (!signals.deviceKnown) {
      reasons.push('dispositivo desconocido')
    }
    if (Number(signals.failedAttempts) >= 2) {
      reasons.push('intentos fallidos recientes')
    }
    if (Number(signals.locationShiftKm) >= 500) {
      reasons.push('cambio de ubicacion improbable')
    }
    if (Number(signals.hour) < 6 || Number(signals.hour) >= 23) {
      reasons.push('horario inusual')
    }
    return reasons.length ? reasons.join(' + ') : 'riesgo elevado'
  }

  record({ level, decision, fallback, latencyMs }) {
    this.metrics.requests += 1
    this.metrics.decisions[decision] += 1
    if (level) {
      this.metrics.levels[level] += 1
    }
    if (fallback) {
      this.metrics.fallbacks += 1
    }
    this.metrics.latencySum += latencyMs
    this.metrics.latencyMax = Math.max(this.metrics.latencyMax, latencyMs)
  }

  async evaluate(signals, context = {}) {
    this.validate(signals)
    const started = Date.now()
    const trace = [{ step: 'risk.received', ms: 0 }]
    let score = null
    let level = null
    let modelVersion = null
    let fallback = false

    if (this.modelRepository.isAvailable()) {
      trace.push({ step: 'model.calling', ms: Date.now() - started })
      try {
        const result = await this.modelRepository.evaluate(signals)
        score = result.score
        level = result.level
        modelVersion = result.modelVersion
        trace.push({ step: 'model.responded', ms: Date.now() - started })
      } catch (err) {
        this.logger.warn('modelo no disponible, aplicando fallback', { error: err.message })
        trace.push({ step: 'model.failed', ms: Date.now() - started })
        fallback = true
      }
    } else {
      trace.push({ step: 'circuit.open', ms: Date.now() - started })
      fallback = true
    }

    const decision = fallback ? DECISIONS.REQUIRE_2FA : DECISION_BY_LEVEL[level]
    const latencyMs = Date.now() - started
    const reason = fallback ? 'modelo no disponible: se exige 2FA por seguridad' : this.buildReason(signals, level)
    trace.push({ step: fallback ? 'fallback.applied' : 'decision.made', ms: latencyMs })

    this.record({ level, decision, fallback, latencyMs })

    let decisionId = null
    if (this.auditRepository) {
      try {
        decisionId = await this.auditRepository.recordDecision({
          executionId: context.executionId || null,
          username: context.username || null,
          deviceKnown: Boolean(signals.deviceKnown),
          failedAttempts: Number(signals.failedAttempts),
          locationShiftKm: Number(signals.locationShiftKm),
          hour: Number(signals.hour),
          velocityKmh: Number(signals.velocityKmh),
          score,
          level,
          decision,
          fallback,
          circuit: this.modelRepository.circuit().state,
          latencyMs,
          modelVersion,
        })
      } catch (err) {
        this.logger.warn('no se pudo persistir la decision', { error: err.message })
      }
    }

    return {
      score,
      level,
      decision,
      reason,
      fallback,
      modelVersion,
      latencyMs,
      circuit: this.modelRepository.circuit().state,
      decisionId,
      trace,
    }
  }

  // Feedback loop: registra el resultado real (etiqueta) de una decision.
  async feedback(id, outcome) {
    if (!this.auditRepository) {
      throw new ValidationError('la persistencia no esta habilitada')
    }
    if (!['fraud', 'legit'].includes(outcome)) {
      throw new ValidationError('outcome debe ser "fraud" o "legit"')
    }
    const updated = await this.auditRepository.recordFeedback(Number(id), outcome)
    if (!updated) {
      throw new NotFoundError('decision no encontrada')
    }
    return { id: Number(id), outcome }
  }

  // Metricas de modelo (predicho vs. real) calculadas sobre el feedback.
  async modelMetrics() {
    if (!this.auditRepository) {
      return { labeled: 0, confusion: { tp: 0, fp: 0, fn: 0, tn: 0 }, precision: null, recall: null, falsePositiveRate: null }
    }
    return this.auditRepository.modelMetrics()
  }

  // Estado del servicio de inferencia (drift, version, requests).
  async modelStatus() {
    try {
      const metrics = await this.modelRepository.getMetrics()
      return {
        available: true,
        drift: metrics.drift,
        requests: metrics.requests,
        modelVersion: metrics.modelVersion,
        avgLatencyMs: metrics.avgLatencyMs,
      }
    } catch (err) {
      return { available: false, error: err.message }
    }
  }

  // Listado de decisiones (auditoria) con filtros.
  async listDecisions(params) {
    if (!this.auditRepository) {
      return { total: 0, items: [] }
    }
    return this.auditRepository.listDecisions(params)
  }

  // Agregados historicos (base de datos) para el dashboard.
  async historyMetrics() {
    if (!this.auditRepository) {
      return { requests: 0, decisions: { ALLOW: 0, REQUIRE_2FA: 0, BLOCK: 0 }, levels: { LOW: 0, MEDIUM: 0, HIGH: 0 }, fallbacks: 0, avgLatencyMs: 0, maxLatencyMs: 0 }
    }
    return this.auditRepository.aggregateMetrics()
  }

  // Salud de los componentes del sistema.
  async health() {
    const model = await this.modelStatus()
    const database = this.auditRepository ? await this.auditRepository.ping() : false
    return {
      components: [
        { name: 'API Gateway', status: 'up' },
        { name: 'access-risk-api', status: 'up' },
        { name: 'access-risk-model', status: model.available ? 'up' : 'down', detail: model.modelVersion },
        { name: 'PostgreSQL', status: database ? 'up' : 'down' },
      ],
      circuit: this.modelRepository.circuit().state,
    }
  }

  metricsSnapshot() {
    const avg = this.metrics.requests ? this.metrics.latencySum / this.metrics.requests : 0
    return {
      requests: this.metrics.requests,
      decisions: { ...this.metrics.decisions },
      levels: { ...this.metrics.levels },
      fallbacks: this.metrics.fallbacks,
      avgLatencyMs: Math.round(avg * 100) / 100,
      maxLatencyMs: this.metrics.latencyMax,
      circuit: this.modelRepository.circuit(),
    }
  }

  reset() {
    this.metrics = {
      requests: 0,
      decisions: { ALLOW: 0, REQUIRE_2FA: 0, BLOCK: 0 },
      levels: { LOW: 0, MEDIUM: 0, HIGH: 0 },
      fallbacks: 0,
      latencySum: 0,
      latencyMax: 0,
    }
    return { reset: true }
  }
}

module.exports = { AccessRiskUsecase, DECISION_BY_LEVEL }

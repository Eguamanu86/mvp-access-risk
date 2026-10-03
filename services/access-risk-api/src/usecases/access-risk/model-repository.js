'use strict'

/**
 * Repositorio (Singleton) del servicio de inferencia. Encapsula el cliente
 * HTTP y el circuit breaker; el usecase nunca instancia infraestructura.
 */

const { createModelClient } = require('../../frameworks/http/model-client')
const { CircuitBreaker } = require('../../frameworks/circuit-breaker')

class ModelRepository {
  static #instance

  constructor(config) {
    if (ModelRepository.#instance) {
      throw new Error('Use ModelRepository.getInstance()')
    }
    this.client = createModelClient({
      baseUrl: config.MODEL_SERVICE_URL,
      timeoutMs: Number(config.MODEL_TIMEOUT_MS),
      manageToken: config.MODEL_MANAGE_TOKEN,
    })
    this.breaker = new CircuitBreaker({
      failureThreshold: Number(config.CIRCUIT_FAILURE_THRESHOLD),
      cooldownMs: Number(config.CIRCUIT_COOLDOWN_MS),
    })
  }

  static getInstance(config) {
    if (!ModelRepository.#instance) {
      ModelRepository.#instance = new ModelRepository(config)
    }
    return ModelRepository.#instance
  }

  static resetInstance() {
    ModelRepository.#instance = null
  }

  isAvailable() {
    return this.breaker.canAttempt()
  }

  async evaluate(signals) {
    try {
      const result = await this.client.evaluate(signals)
      this.breaker.onSuccess()
      return result
    } catch (err) {
      this.breaker.onFailure()
      throw err
    }
  }

  circuit() {
    return this.breaker.snapshot()
  }

  // Lectura de estado del modelo (no pasa por el circuit breaker).
  getMetrics() {
    return this.client.getMetrics()
  }

  // Ciclo de vida del modelo. Lecturas y gestion no pasan por el circuit
  // breaker: son operaciones de administracion, no de login.
  getInfo() {
    return this.client.getInfo()
  }

  getVersions() {
    return this.client.getVersions()
  }

  getPipeline() {
    return this.client.getPipeline()
  }

  promote(version) {
    return this.client.promote(version)
  }

  rollback() {
    return this.client.rollback()
  }

  retrain(conceptDrift) {
    return this.client.retrain(conceptDrift)
  }

  setDrift(on) {
    return this.client.setDrift(on)
  }

  resetModel() {
    return this.client.reset()
  }
}

module.exports = { ModelRepository }

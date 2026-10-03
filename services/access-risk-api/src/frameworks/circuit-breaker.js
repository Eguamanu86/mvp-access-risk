'use strict'

/**
 * Circuit breaker con tres estados: closed, open, half-open.
 * - closed: las llamadas pasan y se cuentan los fallos.
 * - open: al superar el umbral se corta el trafico hasta vencer el cooldown.
 * - half-open: al vencer el cooldown se permite una llamada de prueba.
 */

class CircuitBreaker {
  constructor({ failureThreshold = 3, cooldownMs = 10000 } = {}) {
    this.failureThreshold = failureThreshold
    this.cooldownMs = cooldownMs
    this.state = 'closed'
    this.failures = 0
    this.openedAt = 0
  }

  canAttempt(now = Date.now()) {
    if (this.state === 'open' && now - this.openedAt >= this.cooldownMs) {
      this.state = 'half-open'
    }
    return this.state !== 'open'
  }

  onSuccess() {
    this.state = 'closed'
    this.failures = 0
  }

  onFailure(now = Date.now()) {
    this.failures += 1
    if (this.state === 'half-open' || this.failures >= this.failureThreshold) {
      this.state = 'open'
      this.openedAt = now
    }
  }

  snapshot() {
    return { state: this.state, failures: this.failures }
  }
}

module.exports = { CircuitBreaker }

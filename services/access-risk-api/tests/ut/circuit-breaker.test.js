'use strict'

const { CircuitBreaker } = require('../../src/frameworks/circuit-breaker')

describe('CircuitBreaker', () => {
  it('should stay closed when calls succeed', () => {
    const breaker = new CircuitBreaker({ failureThreshold: 3, cooldownMs: 1000 })
    breaker.onSuccess()
    expect(breaker.canAttempt()).toBe(true)
    expect(breaker.snapshot().state).toBe('closed')
  })

  it('should open after reaching the failure threshold', () => {
    const breaker = new CircuitBreaker({ failureThreshold: 3, cooldownMs: 1000 })
    breaker.onFailure(1000)
    breaker.onFailure(1000)
    breaker.onFailure(1000)
    expect(breaker.snapshot().state).toBe('open')
    expect(breaker.canAttempt(1000)).toBe(false)
  })

  it('should move to half-open after the cooldown', () => {
    const breaker = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 1000 })
    breaker.onFailure(0)
    expect(breaker.canAttempt(1001)).toBe(true)
    expect(breaker.snapshot().state).toBe('half-open')
  })

  it('should close again after a successful half-open trial', () => {
    const breaker = new CircuitBreaker({ failureThreshold: 1, cooldownMs: 1000 })
    breaker.onFailure(0)
    breaker.canAttempt(1001)
    breaker.onSuccess()
    expect(breaker.snapshot().state).toBe('closed')
  })
})

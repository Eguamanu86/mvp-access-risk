'use strict'

const request = require('supertest')

const { createExpressApp } = require('../../src/frameworks/http/express')
const { AccessRiskUsecase } = require('../../src/usecases/usecase-access-risk')
const { createAccessRiskRouter } = require('../../src/adapters/routers/v1/access-risk/access-risk-router')
const { createChecksRouter } = require('../../src/adapters/routers/checks-router')

const MAX_TIMEOUT_MS = 15000
const logger = { warn: jest.fn(), info: jest.fn(), error: jest.fn() }
const signals = { deviceKnown: false, failedAttempts: 3, locationShiftKm: 900, hour: 3, velocityKmh: 900 }

function buildApp(repo) {
  const usecase = new AccessRiskUsecase(repo, logger)
  return createExpressApp({
    logger,
    routers: [
      { path: '/', router: createChecksRouter(usecase) },
      { path: '/v1/access-risk', router: createAccessRiskRouter(usecase) },
    ],
  })
}

const healthyRepo = {
  isAvailable: () => true,
  evaluate: jest.fn().mockResolvedValue({ score: 0.9, level: 'HIGH', modelVersion: '1.0.0' }),
  circuit: () => ({ state: 'closed' }),
}

describe('access-risk API', () => {
  it('should return a decision for a valid attempt', async () => {
    const app = buildApp(healthyRepo)
    const response = await request(app).post('/v1/access-risk/evaluate').send({ signals })
    expect(response.status).toBe(200)
    expect(response.body.data.decision).toBe('BLOCK')
  }, MAX_TIMEOUT_MS)

  it('should return 400 when signals are missing', async () => {
    const app = buildApp(healthyRepo)
    const response = await request(app).post('/v1/access-risk/evaluate').send({})
    expect(response.status).toBe(400)
  }, MAX_TIMEOUT_MS)

  it('should return fallback when the model is down', async () => {
    const repo = {
      isAvailable: () => true,
      evaluate: jest.fn().mockRejectedValue(new Error('down')),
      circuit: () => ({ state: 'open' }),
    }
    const app = buildApp(repo)
    const response = await request(app).post('/v1/access-risk/evaluate').send({ signals })
    expect(response.status).toBe(200)
    expect(response.body.data.fallback).toBe(true)
    expect(response.body.data.decision).toBe('REQUIRE_2FA')
  }, MAX_TIMEOUT_MS)

  it('should expose metrics', async () => {
    const app = buildApp(healthyRepo)
    await request(app).post('/v1/access-risk/evaluate').send({ signals })
    const response = await request(app).get('/v1/access-risk/metrics')
    expect(response.status).toBe(200)
    expect(response.body.data.requests).toBeGreaterThan(0)
  }, MAX_TIMEOUT_MS)

  it('should answer readiness', async () => {
    const app = buildApp(healthyRepo)
    const response = await request(app).get('/ready')
    expect(response.status).toBe(200)
  }, MAX_TIMEOUT_MS)
})

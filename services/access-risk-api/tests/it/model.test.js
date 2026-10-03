'use strict'

const request = require('supertest')

const { createExpressApp } = require('../../src/frameworks/http/express')
const { createRequireRole } = require('../../src/adapters/middleware/require-role')
const { createModelRouter } = require('../../src/adapters/routers/v1/model/model-router')
const { UnauthorizedError } = require('../../src/utils/errors')

const MAX_TIMEOUT_MS = 15000
const logger = { warn: jest.fn(), info: jest.fn(), error: jest.fn() }

const authUsecase = {
  me: jest.fn(async (token) => {
    if (token === 'admin-token') {
      return { user: { id: 1, role: 'admin' } }
    }
    if (token === 'viewer-token') {
      return { user: { id: 2, role: 'viewer' } }
    }
    throw new UnauthorizedError('no autenticado')
  }),
}

const modelRepository = {
  getInfo: jest.fn().mockResolvedValue({ version: '1.0.0' }),
  getVersions: jest.fn().mockResolvedValue({ active: '1.0.0', versions: [] }),
  getPipeline: jest.fn().mockResolvedValue({ status: 'idle' }),
  promote: jest.fn().mockResolvedValue({ active: '1.0.1' }),
  rollback: jest.fn().mockResolvedValue({ active: '1.0.0' }),
  retrain: jest.fn().mockResolvedValue({ status: 'running' }),
  setDrift: jest.fn().mockResolvedValue({ driftForced: true }),
  resetModel: jest.fn().mockResolvedValue({ reset: true }),
}

function buildApp() {
  const requireSession = createRequireRole(authUsecase, [])
  const requireAdmin = createRequireRole(authUsecase, ['admin'])
  return createExpressApp({
    logger,
    routers: [
      {
        path: '/v1/model',
        router: createModelRouter({ modelRepository, requireSession, requireAdmin }),
      },
    ],
  })
}

const bearer = (token) => ({ authorization: `Bearer ${token}` })

describe('model management API', () => {
  beforeEach(() => jest.clearAllMocks())

  it('should reject reads without a session', async () => {
    const response = await request(buildApp()).get('/v1/model/info')
    expect(response.status).toBe(401)
  })

  it('should allow reads with any valid session', async () => {
    const response = await request(buildApp()).get('/v1/model/info').set(bearer('viewer-token'))
    expect(response.status).toBe(200)
    expect(response.body.data.version).toBe('1.0.0')
  })

  it('should forbid a viewer from managing the model', async () => {
    const response = await request(buildApp())
      .post('/v1/model/promote')
      .set(bearer('viewer-token'))
      .send({ version: '1.0.1' })
    expect(response.status).toBe(403)
    expect(modelRepository.promote).not.toHaveBeenCalled()
  })

  it('should require a version to promote', async () => {
    const response = await request(buildApp())
      .post('/v1/model/promote')
      .set(bearer('admin-token'))
      .send({})
    expect(response.status).toBe(400)
  })

  it('should let an admin promote a version', async () => {
    const response = await request(buildApp())
      .post('/v1/model/promote')
      .set(bearer('admin-token'))
      .send({ version: '1.0.1' })
    expect(response.status).toBe(200)
    expect(response.body.data.active).toBe('1.0.1')
    expect(modelRepository.promote).toHaveBeenCalledWith('1.0.1')
  })

  it('should let an admin trigger a retrain', async () => {
    const response = await request(buildApp())
      .post('/v1/model/retrain')
      .set(bearer('admin-token'))
      .send({ conceptDrift: true })
    expect(response.status).toBe(200)
    expect(response.body.data.status).toBe('running')
  })
}, MAX_TIMEOUT_MS)

'use strict'

/**
 * Entry point: carga entorno, cablea repositorios, usecases y routers, y
 * levanta el servidor HTTP.
 */

const { loadEnv } = require('./utils/envs')
const { logger } = require('./frameworks/logger/winston')
const { createSequelize } = require('./frameworks/db/sequelize')
const { ModelRepository } = require('./usecases/access-risk/model-repository')
const { AuditRepository } = require('./usecases/access-risk/audit-repository')
const { AuthRepository } = require('./usecases/auth/auth-repository')
const { AccessRiskUsecase } = require('./usecases/usecase-access-risk')
const { AuthUsecase } = require('./usecases/usecase-auth')
const { createExpressApp } = require('./frameworks/http/express')
const { createServiceAuth } = require('./adapters/middleware/service-auth')
const { createRequireRole } = require('./adapters/middleware/require-role')
const { createAccessRiskRouter } = require('./adapters/routers/v1/access-risk/access-risk-router')
const { createAuthRouter } = require('./adapters/routers/v1/auth/auth-router')
const { createModelRouter } = require('./adapters/routers/v1/model/model-router')
const { createChecksRouter } = require('./adapters/routers/checks-router')

// Reintenta la conexion a la base (el contenedor puede tardar en estar listo).
async function connectWithRetry(sequelize, logger, attempts = 10, delayMs = 2000) {
  for (let i = 1; i <= attempts; i += 1) {
    try {
      await sequelize.authenticate()
      return true
    } catch (err) {
      logger.warn(`postgres no disponible (intento ${i}/${attempts})`, { error: err.message })
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }
  return false
}

;(async () => {
  const env = loadEnv()
  const modelRepository = ModelRepository.getInstance(env)

  const sequelize = createSequelize(env)
  let auditRepository = null
  let authRepository = null
  if (sequelize) {
    const connected = await connectWithRetry(sequelize, logger)
    if (connected) {
      auditRepository = AuditRepository.getInstance(sequelize, logger)
      authRepository = AuthRepository.getInstance(sequelize, logger)
      logger.info('postgres conectado', { database: env.DB_NAME })
    } else {
      logger.error('no se pudo conectar a postgres; se sigue sin persistencia')
    }
  }

  const accessRiskUsecase = new AccessRiskUsecase(modelRepository, logger, auditRepository)
  const authUsecase = new AuthUsecase(authRepository, logger, {
    sessionTtlMinutes: Number(env.SESSION_TTL_MINUTES),
  })
  if (String(env.SEED_USERS).toLowerCase() === 'true') {
    try {
      await authUsecase.seed()
    } catch (err) {
      logger.warn('no se pudieron sembrar los usuarios por defecto', { error: err.message })
    }
  }

  const requireSession = createRequireRole(authUsecase, [])
  const requireAdmin = createRequireRole(authUsecase, ['admin'])

  const app = createExpressApp({
    logger,
    middleware: [createServiceAuth(env.SERVICE_TOKEN)],
    routers: [
      { path: '/', router: createChecksRouter(accessRiskUsecase) },
      { path: '/v1/auth', router: createAuthRouter(authUsecase) },
      { path: '/v1/access-risk', router: createAccessRiskRouter(accessRiskUsecase) },
      { path: '/v1/model', router: createModelRouter({ modelRepository, requireSession, requireAdmin }) },
    ],
  })

  app.listen(Number(env.PORT), () => {
    logger.info('access-risk-api escuchando', { port: env.PORT, env: env.APP_ENV })
  })
})()

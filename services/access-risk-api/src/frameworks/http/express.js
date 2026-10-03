'use strict'

/**
 * Configuracion de Express: body parser, routers, 404 y error handler central.
 * Express 5 propaga las promesas rechazadas al error handler (sin try/catch).
 */

const express = require('express')
const { StatusCodes } = require('http-status-codes')

const {
  AppError,
  ParameterError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  UseCaseError,
  InternalError,
  ServiceUnavailableError,
} = require('../../utils/errors')

const STATUS_BY_ERROR = new Map([
  [ParameterError, StatusCodes.BAD_REQUEST],
  [UnauthorizedError, StatusCodes.UNAUTHORIZED],
  [ForbiddenError, StatusCodes.FORBIDDEN],
  [NotFoundError, StatusCodes.NOT_FOUND],
  [ValidationError, StatusCodes.BAD_REQUEST],
  [UseCaseError, StatusCodes.INTERNAL_SERVER_ERROR],
  [InternalError, StatusCodes.INTERNAL_SERVER_ERROR],
  [ServiceUnavailableError, StatusCodes.SERVICE_UNAVAILABLE],
])

function createExpressApp({ routers = [], middleware = [], logger }) {
  const app = express()
  app.disable('x-powered-by')

  // CORS abierto: solo para la demo local (la interfaz corre en otro puerto).
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Headers', 'content-type, authorization')
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS')
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204)
    }
    return next()
  })

  app.use(express.json({ limit: '1mb' }))

  middleware.forEach((mw) => app.use(mw))
  routers.forEach(({ path, router }) => app.use(path, router))

  app.use((req, res) => {
    res.status(StatusCodes.NOT_FOUND).send({ code: 'not_found', message: 'route not found' })
  })

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = STATUS_BY_ERROR.get(err.constructor) || StatusCodes.INTERNAL_SERVER_ERROR
    if (status >= StatusCodes.INTERNAL_SERVER_ERROR) {
      logger.error('unhandled error', { error: err.message })
    }
    res.status(status).send({
      code: err instanceof AppError ? err.name : 'internal_error',
      message: err.message,
    })
  })

  return app
}

module.exports = { createExpressApp }

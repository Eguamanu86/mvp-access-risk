'use strict'

/**
 * Autenticacion servicio a servicio. En local, si SERVICE_TOKEN esta vacio, se
 * omite. En GCP, el servicio no es publico (Cloud Run IAM) y ademas se valida
 * el token compartido.
 */

const { UnauthorizedError } = require('../../utils/errors')

function createServiceAuth(expectedToken) {
  return function serviceAuth(req, res, next) {
    if (!expectedToken) {
      return next()
    }
    const header = req.headers.authorization || ''
    const token = header.replace(/^Bearer\s+/i, '')
    if (token !== expectedToken) {
      throw new UnauthorizedError('invalid service token')
    }
    return next()
  }
}

module.exports = { createServiceAuth }

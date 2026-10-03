'use strict'

/**
 * Autenticacion de sesion + autorizacion por rol para endpoints de gestion.
 * La sesion se valida contra la base de datos (AuthUsecase.me); si el token no
 * es valido, UnauthorizedError (401); si el rol no alcanza, ForbiddenError (403).
 */

const { ForbiddenError } = require('../../utils/errors')

function bearerToken(req) {
  const header = req.headers.authorization || ''
  return header.replace(/^Bearer\s+/i, '') || null
}

function createRequireRole(authUsecase, roles = []) {
  return async function requireRole(req, res, next) {
    const { user } = await authUsecase.me(bearerToken(req))
    if (roles.length && !roles.includes(user.role)) {
      throw new ForbiddenError('rol sin permisos para esta operacion')
    }
    req.user = user
    return next()
  }
}

module.exports = { createRequireRole }

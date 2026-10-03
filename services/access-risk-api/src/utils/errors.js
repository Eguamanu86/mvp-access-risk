'use strict'

/**
 * Errores tipados del servicio. Todo error de negocio debe usar una de estas
 * clases; nunca lanzar `new Error()` generico.
 */

class AppError extends Error {
  constructor(message) {
    super(message)
    this.name = this.constructor.name
  }
}

class ParameterError extends AppError {}
class UnauthorizedError extends AppError {}
class ForbiddenError extends AppError {}
class NotFoundError extends AppError {}
class ValidationError extends AppError {}
class UseCaseError extends AppError {}
class InternalError extends AppError {}
class ServiceUnavailableError extends AppError {}

module.exports = {
  AppError,
  ParameterError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  UseCaseError,
  InternalError,
  ServiceUnavailableError,
}

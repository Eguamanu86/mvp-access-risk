'use strict'

/**
 * Logica de autenticacion: login, logout y validacion de sesion.
 * Las contrasenas se verifican contra el hash almacenado en la base de datos.
 */

const { hashPassword, verifyPassword, newToken } = require('../utils/password')
const { UnauthorizedError, ValidationError } = require('../utils/errors')

const DEFAULT_USERS = [
  { email: 'admin@enviame.io', name: 'Administrador', role: 'admin', password: 'admin123' },
  { email: 'operador@enviame.io', name: 'Operador', role: 'operator', password: 'operador123' },
  { email: 'viewer@enviame.io', name: 'Observador', role: 'viewer', password: 'viewer123' },
]

class AuthUsecase {
  constructor(authRepository, logger, { sessionTtlMinutes = 480 } = {}) {
    this.authRepository = authRepository
    this.logger = logger
    this.sessionTtlMinutes = sessionTtlMinutes
  }

  // Crea los usuarios por defecto si la tabla esta vacia (solo en el MVP).
  async seed() {
    if (!this.authRepository) {
      return
    }
    const count = await this.authRepository.countUsers()
    if (count > 0) {
      return
    }
    for (const user of DEFAULT_USERS) {
      const { hash, salt } = hashPassword(user.password)
      await this.authRepository.createUser({
        email: user.email,
        name: user.name,
        role: user.role,
        passwordHash: hash,
        passwordSalt: salt,
      })
    }
    this.logger.info('usuarios por defecto creados', { count: DEFAULT_USERS.length })
  }

  async login(email, password) {
    if (!email || !password) {
      throw new ValidationError('email y password son requeridos')
    }
    if (!this.authRepository) {
      throw new UnauthorizedError('la autenticacion no esta disponible')
    }
    const user = await this.authRepository.findUserByEmail(email)
    if (!user || !user.active || !verifyPassword(password, user.passwordHash, user.passwordSalt)) {
      throw new UnauthorizedError('credenciales invalidas')
    }
    const token = newToken()
    const expiresAt = new Date(Date.now() + this.sessionTtlMinutes * 60000)
    await this.authRepository.createSession({ token, userId: user.id, expiresAt })
    await this.authRepository.touchLogin(user.id)
    return {
      token,
      expiresAt: expiresAt.toISOString(),
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    }
  }

  async logout(token) {
    if (!token) {
      throw new ValidationError('token es requerido')
    }
    if (this.authRepository) {
      await this.authRepository.revokeSession(token)
    }
    return { loggedOut: true }
  }

  async me(token) {
    if (!token) {
      throw new UnauthorizedError('no autenticado')
    }
    if (!this.authRepository) {
      throw new UnauthorizedError('la autenticacion no esta disponible')
    }
    const session = await this.authRepository.findSession(token)
    if (!session) {
      throw new UnauthorizedError('sesion invalida o expirada')
    }
    const user = await this.authRepository.findUserById(session.userId)
    return { user: { id: user.id, email: user.email, name: user.name, role: user.role } }
  }
}

module.exports = { AuthUsecase, DEFAULT_USERS }

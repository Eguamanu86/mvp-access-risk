'use strict'

/**
 * Repositorio de autenticacion (Singleton) sobre PostgreSQL/Sequelize.
 * Gestiona usuarios y sesiones.
 */

const { DataTypes, Op } = require('sequelize')

class AuthRepository {
  static #instance

  constructor(sequelize, logger) {
    if (AuthRepository.#instance) {
      throw new Error('Use AuthRepository.getInstance()')
    }
    this.sequelize = sequelize
    this.logger = logger

    this.User = sequelize.define(
      'AuthUser',
      {
        id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
        email: DataTypes.STRING(190),
        name: DataTypes.STRING(190),
        role: DataTypes.STRING(20),
        passwordHash: DataTypes.STRING(255),
        passwordSalt: DataTypes.STRING(64),
        active: DataTypes.BOOLEAN,
        lastLoginAt: DataTypes.DATE,
      },
      { tableName: 'auth_users', underscored: true, timestamps: true, createdAt: 'created_at', updatedAt: false }
    )

    this.Session = sequelize.define(
      'AuthSession',
      {
        token: { type: DataTypes.STRING(128), primaryKey: true },
        userId: DataTypes.BIGINT,
        expiresAt: DataTypes.DATE,
        revoked: DataTypes.BOOLEAN,
      },
      { tableName: 'auth_sessions', underscored: true, timestamps: true, createdAt: 'created_at', updatedAt: false }
    )
  }

  static getInstance(sequelize, logger) {
    if (!AuthRepository.#instance) {
      AuthRepository.#instance = new AuthRepository(sequelize, logger)
    }
    return AuthRepository.#instance
  }

  static resetInstance() {
    AuthRepository.#instance = null
  }

  async countUsers() {
    return this.User.count()
  }

  async createUser({ email, name, role, passwordHash, passwordSalt }) {
    return this.User.create({ email, name, role, passwordHash, passwordSalt, active: true })
  }

  async findUserByEmail(email) {
    return this.User.findOne({ where: { email }, raw: true })
  }

  async findUserById(id) {
    return this.User.findByPk(id, { raw: true })
  }

  async touchLogin(userId) {
    return this.User.update({ lastLoginAt: new Date() }, { where: { id: userId } })
  }

  async createSession({ token, userId, expiresAt }) {
    return this.Session.create({ token, userId, expiresAt, revoked: false })
  }

  async findSession(token) {
    return this.Session.findOne({
      where: { token, revoked: false, expiresAt: { [Op.gt]: new Date() } },
      raw: true,
    })
  }

  async revokeSession(token) {
    const [updated] = await this.Session.update({ revoked: true }, { where: { token } })
    return updated > 0
  }
}

module.exports = { AuthRepository }

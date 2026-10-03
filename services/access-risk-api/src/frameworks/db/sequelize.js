'use strict'

/**
 * Conexion a PostgreSQL via Sequelize. Si DB_ENABLED no es "true", devuelve
 * null y el servicio funciona sin persistencia (modo demo).
 */

const { Sequelize } = require('sequelize')

function createSequelize(env) {
  if (String(env.DB_ENABLED).toLowerCase() !== 'true') {
    return null
  }
  return new Sequelize(env.DB_NAME, env.DB_USER, env.DB_PASSWORD, {
    host: env.DB_HOST,
    port: Number(env.DB_PORT || 5432),
    dialect: 'postgres',
    logging: false,
    pool: { max: 5, min: 0, idle: 10000 },
  })
}

module.exports = { createSequelize }

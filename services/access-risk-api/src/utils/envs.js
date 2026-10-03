'use strict'

/**
 * Carga de variables de entorno. En cloud, los secretos se resuelven desde
 * Secret Manager; en local, desde el entorno (docker-compose / .env).
 */

const DEFAULTS = {
  PORT: '8080',
  LOG_LEVEL: 'info',
  APP_ENV: 'local',
  MODEL_SERVICE_URL: 'http://access-risk-model:8080',
  MODEL_TIMEOUT_MS: '150',
  MODEL_MANAGE_TOKEN: '',
  CIRCUIT_FAILURE_THRESHOLD: '3',
  CIRCUIT_COOLDOWN_MS: '10000',
  SERVICE_TOKEN: '',
  DB_ENABLED: 'false',
  DB_HOST: 'postgres',
  DB_PORT: '5432',
  DB_NAME: 'access_risk',
  DB_USER: 'access_risk',
  DB_PASSWORD: '',
  SEED_USERS: 'false',
  SESSION_TTL_MINUTES: '480',
}

function loadEnv() {
  const env = {}
  Object.entries(DEFAULTS).forEach(([key, value]) => {
    env[key] = process.env[key] || value
  })
  return env
}

module.exports = { loadEnv }

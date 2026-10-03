'use strict'

/**
 * Constantes del servicio.
 */

const RISK_LEVELS = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
}

const DECISIONS = {
  ALLOW: 'ALLOW',
  REQUIRE_2FA: 'REQUIRE_2FA',
  BLOCK: 'BLOCK',
}

module.exports = { RISK_LEVELS, DECISIONS }

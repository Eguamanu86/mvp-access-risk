'use strict'

/**
 * Repositorio de auditoria (Singleton) sobre PostgreSQL/Sequelize.
 * Persiste cada decision y el feedback real (etiqueta) para el ciclo MLOps.
 */

const { DataTypes, Op } = require('sequelize')

class AuditRepository {
  static #instance

  constructor(sequelize, logger) {
    if (AuditRepository.#instance) {
      throw new Error('Use AuditRepository.getInstance()')
    }
    this.sequelize = sequelize
    this.logger = logger
    this.Decision = sequelize.define(
      'AccessRiskDecision',
      {
        id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
        executionId: DataTypes.STRING(64),
        username: DataTypes.STRING(190),
        deviceKnown: DataTypes.BOOLEAN,
        failedAttempts: DataTypes.INTEGER,
        locationShiftKm: DataTypes.INTEGER,
        hour: DataTypes.INTEGER,
        velocityKmh: DataTypes.INTEGER,
        score: DataTypes.DECIMAL(6, 4),
        level: DataTypes.STRING(10),
        decision: DataTypes.STRING(20),
        fallback: DataTypes.BOOLEAN,
        circuit: DataTypes.STRING(20),
        latencyMs: DataTypes.INTEGER,
        modelVersion: DataTypes.STRING(20),
        outcome: DataTypes.STRING(20),
        labeledAt: DataTypes.DATE,
      },
      {
        tableName: 'access_risk_decisions',
        underscored: true,
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: false,
      }
    )
  }

  static getInstance(sequelize, logger) {
    if (!AuditRepository.#instance) {
      AuditRepository.#instance = new AuditRepository(sequelize, logger)
    }
    return AuditRepository.#instance
  }

  static resetInstance() {
    AuditRepository.#instance = null
  }

  async recordDecision(decision) {
    const row = await this.Decision.create(decision)
    return row.get('id')
  }

  async recordFeedback(id, outcome) {
    const [updated] = await this.Decision.update(
      { outcome, labeledAt: new Date() },
      { where: { id } }
    )
    return updated > 0
  }

  async samples(limit = 200) {
    return this.Decision.findAll({
      where: { outcome: { [Op.ne]: null } },
      order: [['id', 'DESC']],
      limit,
      raw: true,
    })
  }

  async ping() {
    try {
      await this.sequelize.authenticate()
      return true
    } catch (err) {
      this.logger.warn('ping a la base de datos fallo', { error: err.message })
      return false
    }
  }

  // Listado paginado de decisiones con filtros (auditoria).
  async listDecisions({ limit = 20, offset = 0, decision, level, outcome, search } = {}) {    const where = {}
    if (decision) {
      where.decision = decision
    }
    if (level) {
      where.level = level
    }
    if (outcome) {
      where.outcome = outcome
    }
    if (search) {
      where.username = { [Op.iLike]: `%${search}%` }
    }
    const result = await this.Decision.findAndCountAll({
      where,
      order: [['id', 'DESC']],
      limit,
      offset,
      raw: true,
    })
    return { total: result.count, items: result.rows }
  }

  // Agregados historicos desde la base de datos (para el dashboard).
  async aggregateMetrics() {
    const rows = await this.Decision.findAll({
      attributes: ['decision', 'level', 'fallback', 'latencyMs'],
      raw: true,
    })
    const decisions = { ALLOW: 0, REQUIRE_2FA: 0, BLOCK: 0 }
    const levels = { LOW: 0, MEDIUM: 0, HIGH: 0 }
    let fallbacks = 0
    let latencySum = 0
    let latencyMax = 0
    let latencyCount = 0
    rows.forEach((row) => {
      if (row.decision in decisions) {
        decisions[row.decision] += 1
      }
      if (row.level in levels) {
        levels[row.level] += 1
      }
      if (row.fallback) {
        fallbacks += 1
      }
      if (row.latencyMs != null) {
        const value = Number(row.latencyMs)
        latencySum += value
        latencyMax = Math.max(latencyMax, value)
        latencyCount += 1
      }
    })
    return {
      requests: rows.length,
      decisions,
      levels,
      fallbacks,
      avgLatencyMs: latencyCount ? Math.round((latencySum / latencyCount) * 100) / 100 : 0,
      maxLatencyMs: latencyMax,
    }
  }

  // Metricas de modelo: predicho (nivel HIGH) vs. real (outcome = fraude).
  async modelMetrics() {
    const rows = await this.Decision.findAll({ where: { outcome: { [Op.ne]: null } }, raw: true })
    let tp = 0
    let fp = 0
    let fn = 0
    let tn = 0
    rows.forEach((row) => {
      const predicted = row.level === 'HIGH' ? 1 : 0
      const actual = row.outcome === 'fraud' ? 1 : 0
      if (predicted && actual) {
        tp += 1
      } else if (predicted && !actual) {
        fp += 1
      } else if (!predicted && actual) {
        fn += 1
      } else {
        tn += 1
      }
    })
    const ratio = (num, den) => (den > 0 ? Math.round((num / den) * 1000) / 1000 : null)
    return {
      labeled: rows.length,
      confusion: { tp, fp, fn, tn },
      precision: ratio(tp, tp + fp),
      recall: ratio(tp, tp + fn),
      falsePositiveRate: ratio(fp, fp + tn),
    }
  }
}

module.exports = { AuditRepository }

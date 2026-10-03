'use strict'

/**
 * Router del dominio de riesgo de acceso (factory function, no clase).
 */

const express = require('express')
const { StatusCodes } = require('http-status-codes')

function createAccessRiskRouter(usecase) {
  const router = express.Router()

  router.post('/evaluate', async (req, res) => {
    const body = req.body || {}
    const data = await usecase.evaluate(body.signals, {
      username: body.username,
      executionId: body.executionId,
    })
    res.status(StatusCodes.OK).send({ code: 'success', data })
  })

  router.get('/metrics', async (req, res) => {
    const snapshot = usecase.metricsSnapshot()
    snapshot.model = await usecase.modelMetrics()
    snapshot.modelStatus = await usecase.modelStatus()
    snapshot.history = await usecase.historyMetrics()
    res.status(StatusCodes.OK).send({ code: 'success', data: snapshot })
  })

  router.post('/feedback', async (req, res) => {
    const body = req.body || {}
    const data = await usecase.feedback(body.decisionId, body.outcome)
    res.status(StatusCodes.OK).send({ code: 'success', data })
  })

  router.get('/decisions', async (req, res) => {
    const query = req.query || {}
    const data = await usecase.listDecisions({
      limit: Math.min(Number(query.limit) || 20, 100),
      offset: Number(query.offset) || 0,
      decision: query.decision,
      level: query.level,
      outcome: query.outcome,
      search: query.search,
    })
    res.status(StatusCodes.OK).send({ code: 'success', data })
  })

  router.get('/health', async (req, res) => {
    const data = await usecase.health()
    res.status(StatusCodes.OK).send({ code: 'success', data })
  })

  router.post('/reset', (req, res) => {
    res.status(StatusCodes.OK).send({ code: 'success', data: usecase.reset() })
  })

  return router
}

module.exports = { createAccessRiskRouter }

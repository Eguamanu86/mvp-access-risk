'use strict'

/**
 * Healthcheck y readiness. `/ready` lo usa Cloud Run como startup probe.
 */

const express = require('express')
const { StatusCodes } = require('http-status-codes')

function createChecksRouter(usecase) {
  const router = express.Router()

  router.get('/', (req, res) => {
    res.status(StatusCodes.OK).send({
      code: 'success',
      data: {
        status: 'ok',
        env: process.env.APP_ENV || 'local',
        circuit: usecase.metricsSnapshot().circuit,
      },
    })
  })

  router.get('/ready', (req, res) => {
    res.status(StatusCodes.OK).send('ok')
  })

  return router
}

module.exports = { createChecksRouter }

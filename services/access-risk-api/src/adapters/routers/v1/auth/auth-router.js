'use strict'

/**
 * Router de autenticacion (factory function): login, logout y sesion actual.
 */

const express = require('express')
const { StatusCodes } = require('http-status-codes')

function bearerToken(req) {
  const header = req.headers.authorization || ''
  return header.replace(/^Bearer\s+/i, '') || null
}

function createAuthRouter(usecase) {
  const router = express.Router()

  router.post('/login', async (req, res) => {
    const body = req.body || {}
    const data = await usecase.login(body.email, body.password)
    res.status(StatusCodes.OK).send({ code: 'success', data })
  })

  router.post('/logout', async (req, res) => {
    const data = await usecase.logout(bearerToken(req))
    res.status(StatusCodes.OK).send({ code: 'success', data })
  })

  router.get('/me', async (req, res) => {
    const data = await usecase.me(bearerToken(req))
    res.status(StatusCodes.OK).send({ code: 'success', data })
  })

  return router
}

module.exports = { createAuthRouter }

'use strict'

/**
 * Router de gestion del modelo (factory function).
 *
 * El backend orquesta: el frontend nunca habla directo con el servicio de
 * inferencia. Las operaciones de gestion exigen sesion con rol administrador;
 * el backend reenvia la llamada al modelo con el token servicio a servicio.
 */

const express = require('express')
const { StatusCodes } = require('http-status-codes')

const { ValidationError } = require('../../../../utils/errors')

function createModelRouter({ modelRepository, requireSession, requireAdmin }) {
  const router = express.Router()

  // Lecturas: cualquier sesion valida.
  router.get('/info', requireSession, async (req, res) => {
    res.status(StatusCodes.OK).send({ code: 'success', data: await modelRepository.getInfo() })
  })

  router.get('/versions', requireSession, async (req, res) => {
    res.status(StatusCodes.OK).send({ code: 'success', data: await modelRepository.getVersions() })
  })

  router.get('/pipeline', requireSession, async (req, res) => {
    res.status(StatusCodes.OK).send({ code: 'success', data: await modelRepository.getPipeline() })
  })

  // Gestion: solo administrador.
  router.post('/promote', requireAdmin, async (req, res) => {
    const version = (req.body || {}).version
    if (!version) {
      throw new ValidationError('version es requerida')
    }
    res.status(StatusCodes.OK).send({ code: 'success', data: await modelRepository.promote(version) })
  })

  router.post('/rollback', requireAdmin, async (req, res) => {
    res.status(StatusCodes.OK).send({ code: 'success', data: await modelRepository.rollback() })
  })

  router.post('/retrain', requireAdmin, async (req, res) => {
    const conceptDrift = Boolean((req.body || {}).conceptDrift)
    res.status(StatusCodes.OK).send({ code: 'success', data: await modelRepository.retrain(conceptDrift) })
  })

  router.post('/drift', requireAdmin, async (req, res) => {
    const on = Boolean((req.body || {}).on)
    res.status(StatusCodes.OK).send({ code: 'success', data: await modelRepository.setDrift(on) })
  })

  router.post('/reset', requireAdmin, async (req, res) => {
    res.status(StatusCodes.OK).send({ code: 'success', data: await modelRepository.resetModel() })
  })

  return router
}

module.exports = { createModelRouter }

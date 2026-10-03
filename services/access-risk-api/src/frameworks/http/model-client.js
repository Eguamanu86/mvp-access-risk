'use strict'

/**
 * Cliente HTTP hacia el servicio de inferencia (access-risk-model).
 * Usa `fetch` nativo (Node 24) con timeout por AbortController.
 *
 * Las lecturas (predict, metrics, info/registro del modelo) son internas. Las
 * operaciones de gestion (promover/revertir/reentrenar/drift/reset) viajan con
 * el token servicio a servicio (`x-manage-token`) para que el servicio de
 * inferencia rechace llamadas que no vengan del backend.
 */

const { InternalError, ServiceUnavailableError } = require('../../utils/errors')

function createModelClient({ baseUrl, timeoutMs, manageToken }) {
  async function call(path, { method = 'GET', body, manage = false } = {}) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const headers = {}
      if (body !== undefined) {
        headers['content-type'] = 'application/json'
      }
      if (manage && manageToken) {
        headers['x-manage-token'] = manageToken
      }
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      })
      if (response.status === 401 || response.status === 403) {
        throw new InternalError(`model service rejected the call (${response.status})`)
      }
      if (!response.ok) {
        throw new InternalError(`model service responded ${response.status}`)
      }
      const payload = await response.json()
      return payload.data
    } catch (err) {
      if (err instanceof InternalError) {
        throw err
      }
      if (err.name === 'AbortError') {
        throw new ServiceUnavailableError('model service timeout')
      }
      throw new InternalError(`model service call failed: ${err.message}`)
    } finally {
      clearTimeout(timer)
    }
  }

  const evaluate = (signals) => call('/predict', { method: 'POST', body: signals })
  const getMetrics = () => call('/metrics')

  // Lecturas del ciclo de vida del modelo.
  const getInfo = () => call('/model')
  const getVersions = () => call('/model/versions')
  const getPipeline = () => call('/model/pipeline')

  // Operaciones de gestion (token servicio a servicio).
  const promote = (version) => call('/model/promote', { method: 'POST', body: { version }, manage: true })
  const rollback = () => call('/model/rollback', { method: 'POST', body: {}, manage: true })
  const retrain = (conceptDrift) => call('/model/retrain', { method: 'POST', body: { conceptDrift }, manage: true })
  const setDrift = (on) => call('/drift', { method: 'POST', body: { on }, manage: true })
  const reset = () => call('/reset', { method: 'POST', body: {}, manage: true })

  return {
    evaluate,
    getMetrics,
    getInfo,
    getVersions,
    getPipeline,
    promote,
    rollback,
    retrain,
    setDrift,
    reset,
  }
}

module.exports = { createModelClient }

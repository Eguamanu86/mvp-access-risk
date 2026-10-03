import { useCallback, useEffect, useState } from 'react'
import { getModelInfo, getModelVersions, getPipeline, promoteModel, retrainModel, rollbackModel } from './api'
import type { ModelInfo, ModelRegistry, Pipeline, Role } from './types'

const PIPELINE_LABEL: Record<string, string> = {
  idle: 'En reposo',
  running: 'Reentrenando…',
  success: 'Completado',
  failed: 'Falló',
}

const FEATURE_LABEL: Record<string, string> = {
  deviceUnknown: 'Dispositivo desconocido',
  failedAttempts: 'Intentos fallidos',
  locationShift: 'Cambio de ubicación',
  unusualHour: 'Hora inusual',
  velocity: 'Velocidad de desplazamiento',
}

const STEPS = [
  { label: 'Datos', desc: 'Intentos sintéticos etiquetados' },
  { label: 'Entrenar', desc: 'Descenso de gradiente' },
  { label: 'Validar', desc: 'Ejemplos no vistos' },
  { label: 'Puerta de calidad', desc: 'Promover solo si mejora' },
  { label: 'Registrar', desc: 'Versión + artefacto' },
]

function ScoreScale({ low, high }: { low: number; high: number }) {
  return (
    <div className="score-scale">
      <div className="score-bar">
        <div className="seg low" style={{ width: `${low * 100}%` }} />
        <div className="seg med" style={{ width: `${(high - low) * 100}%` }} />
        <div className="seg high" style={{ width: `${(1 - high) * 100}%` }} />
      </div>
      <div className="score-marks">
        <span style={{ left: `${low * 100}%` }}>{low}</span>
        <span style={{ left: `${high * 100}%` }}>{high}</span>
      </div>
      <div className="score-legend">
        <span className="tone-allow">Bajo → permitir</span>
        <span className="tone-twofa">Medio → 2FA</span>
        <span className="tone-block">Alto → bloquear</span>
      </div>
    </div>
  )
}

export default function ModelManager({ role }: { role: Role }) {
  const [registry, setRegistry] = useState<ModelRegistry>({ active: null, versions: [] })
  const [info, setInfo] = useState<ModelInfo | null>(null)
  const [pipeline, setPipeline] = useState<Pipeline>({ status: 'idle', startedAt: null, finishedAt: null, lastResult: null })
  const [message, setMessage] = useState('')

  const refresh = useCallback(async () => {
    try {
      setRegistry(await getModelVersions())
    } catch {
      /* servicio de modelo no disponible */
    }
    try {
      setInfo(await getModelInfo())
    } catch {
      /* sin info del modelo */
    }
    try {
      setPipeline(await getPipeline())
    } catch {
      /* pipeline no disponible */
    }
  }, [])

  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, 3000)
    return () => clearInterval(interval)
  }, [refresh])

  const canManage = role === 'admin'
  const running = pipeline.status === 'running'

  const promote = async (version: string) => {
    try {
      await promoteModel(version)
      setMessage(`Modelo ${version} promovido a producción`)
      await refresh()
    } catch (err) {
      setMessage(`Error: ${(err as Error).message}`)
    }
  }

  const rollback = async () => {
    try {
      const result = await rollbackModel()
      setMessage(`Revertido a ${result.active}`)
      await refresh()
    } catch (err) {
      setMessage(`Error: ${(err as Error).message}`)
    }
  }

  const retrain = async (conceptDrift: boolean) => {
    try {
      await retrainModel(conceptDrift)
      setMessage(conceptDrift ? 'Reentrenamiento iniciado (con concept drift)' : 'Reentrenamiento iniciado')
      await refresh()
    } catch (err) {
      setMessage(`Error: ${(err as Error).message}`)
    }
  }

  const result = pipeline.lastResult as
    | { currentAccuracy?: number; candidateAccuracy?: number; promoted?: boolean; newVersion?: string; currentVersion?: string }
    | null

  const maxWeight = info ? Math.max(1, ...info.weights.map((w) => Math.abs(w))) : 1

  return (
    <div className="stack">
      {/* 1. Cómo funciona el modelo */}
      <section className="card">
        <h2>Cómo funciona el modelo</h2>
        <p className="muted small">
          Es una <b>regresión logística</b>: combina las señales del intento con pesos que <b>aprende</b> de los datos
          y devuelve una probabilidad de riesgo entre 0 y 1.
        </p>
        <div className="formula">
          <span className="fx-part">señales × pesos</span>
          <span className="fx-op">+</span>
          <span className="fx-part">sesgo</span>
          <span className="fx-op">→</span>
          <span className="fx-part">sigmoide</span>
          <span className="fx-op">→</span>
          <span className="fx-part accent">score</span>
          <span className="fx-op">→</span>
          <span className="fx-part">umbrales → nivel</span>
        </div>
        <p className="muted small">
          El <b>backend</b> traduce el nivel en una decisión: permitir, exigir 2FA o bloquear. La IA solo opina.
        </p>
      </section>

      {/* 2. Pipeline de entrenamiento */}
      <section className="card">
        <div className="card-head">
          <h2>Pipeline de entrenamiento</h2>
          <span className={`badge ${running ? 'warn' : pipeline.status === 'failed' ? 'warn' : ''}`}>
            {PIPELINE_LABEL[pipeline.status]}
          </span>
        </div>

        <ol className={`stepper ${running ? 'running' : pipeline.status === 'success' ? 'done' : ''}`}>
          {STEPS.map((step, index) => (
            <li key={step.label} className={running ? 'active' : pipeline.status === 'success' ? 'complete' : ''}>
              <span className="step-num">{index + 1}</span>
              <div>
                <b>{step.label}</b>
                <span className="muted small">{step.desc}</span>
              </div>
            </li>
          ))}
        </ol>

        {result && (
          <div className="compare">
            <div className="compare-row">
              <span>Modelo actual ({result.currentVersion})</span>
              <div className="bar-track"><div className="bar-fill twofa" style={{ width: `${(result.currentAccuracy ?? 0) * 100}%` }} /></div>
              <b>{result.currentAccuracy}</b>
            </div>
            <div className="compare-row">
              <span>Candidato</span>
              <div className="bar-track"><div className="bar-fill allow" style={{ width: `${(result.candidateAccuracy ?? 0) * 100}%` }} /></div>
              <b>{result.candidateAccuracy}</b>
            </div>
            <p className={result.promoted ? 'promoted' : 'rejected'}>
              {result.promoted
                ? `✅ Promovido a ${result.newVersion}: el candidato superó al modelo actual.`
                : '⛔ Rechazado: el candidato no superó al modelo actual, se conserva el vigente.'}
            </p>
          </div>
        )}

        <div className="actions">
          <button className="primary" onClick={() => retrain(true)} disabled={!canManage || running} type="button">
            {running ? 'Reentrenando…' : 'Reentrenar (concept drift)'}
          </button>
          <button className="ghost" onClick={() => retrain(false)} disabled={!canManage || running} type="button">
            Reentrenar (sin drift)
          </button>
          <button className="ghost" onClick={rollback} disabled={!canManage || running} type="button">Revertir versión</button>
        </div>
        {!canManage && <p className="muted small">Solo el rol Administrador puede promover, reentrenar o revertir.</p>}
        {message && <p className="muted small">{message}</p>}
      </section>

      {/* 3. Qué aprendió el modelo */}
      {info && (
        <section className="card">
          <div className="card-head">
            <h2>¿Qué aprendió el modelo?</h2>
            <span className="badge">versión activa {info.version}</span>
          </div>
          <p className="muted small">
            Cada señal tiene un <b>peso</b>. Cuanto mayor el peso, más empuja el riesgo hacia arriba (positivo) o hacia
            abajo (negativo). Estos valores los descubrió el entrenamiento, no los escribió nadie a mano.
          </p>
          <div className="weights">
            {info.features.map((feature, index) => {
              const weight = info.weights[index]
              const pct = Math.round((Math.abs(weight) / maxWeight) * 100)
              return (
                <div key={feature} className="weight-row">
                  <span className="weight-label">{FEATURE_LABEL[feature] ?? feature}</span>
                  <div className="weight-track">
                    <div className={`weight-fill ${weight >= 0 ? 'pos' : 'neg'}`} style={{ width: `${pct}%` }} />
                  </div>
                  <b className={weight >= 0 ? 'tone-block' : 'tone-allow'}>{weight.toFixed(2)}</b>
                </div>
              )
            })}
          </div>
          <div className="model-meta">
            <span>Sesgo (bias): <b>{info.bias.toFixed(2)}</b></span>
            <span>Precisión de validación: <b>{info.trainingMetrics.validationAccuracy ?? '—'}</b></span>
            <span>Entrenado con: <b>{info.trainingMetrics.trainedOn ?? '—'} intentos</b></span>
          </div>
          <p className="muted small">Umbrales del score → nivel:</p>
          <ScoreScale low={info.thresholds.low} high={info.thresholds.high} />
        </section>
      )}

      {/* 4. Registro de versiones */}
      <section className="card">
        <div className="card-head">
          <h2>Registro de versiones</h2>
          <span className="muted small">{registry.versions.length} versiones</span>
        </div>
        <div className="versions">
          {registry.versions.length === 0 && <p className="muted small">Sin versiones registradas.</p>}
          {[...registry.versions].reverse().map((v) => {
            const isActive = v.version === registry.active
            return (
              <div key={v.version} className={`version-card ${isActive ? 'active' : ''}`}>
                <div className="version-head">
                  <b>{v.version}</b>
                  {isActive && <span className="badge ok">en producción</span>}
                </div>
                <div className="version-metrics">
                  <span>Precisión <b>{v.validationAccuracy}</b></span>
                  <span>Datos <b>{v.trainedOn}</b></span>
                  <span>Origen <b>{v.source}</b></span>
                </div>
                <span className="muted small">{new Date(v.timestamp).toLocaleString()}</span>
                {canManage && !isActive && (
                  <button className="ghost small-btn" onClick={() => promote(v.version)} type="button">Promover</button>
                )}
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}

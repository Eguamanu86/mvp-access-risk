import { useCallback, useEffect, useState } from 'react'
import { authLogout, authMe, getChaos, login, resetDemo, sendFeedback, setAuthToken, setChaos, type AuthUser } from './api'
import Dashboard from './Dashboard'
import DecisionsTable from './DecisionsTable'
import LiveFlow from './LiveFlow'
import Login from './Login'
import ModelManager from './ModelManager'
import Operations from './Operations'
import type { Chaos, LoginResult, Role, Signals } from './types'

type ScenarioKey = 'low' | 'medium' | 'high'
type Tab = 'demo' | 'modelo' | 'operacion' | 'datos' | 'arquitectura' | 'dashboard'

const ROLE_LABEL: Record<Role, string> = {
  admin: 'Administrador',
  operator: 'Operador',
  viewer: 'Observador',
}

const SCENARIOS: Record<ScenarioKey, { label: string; signals: Signals }> = {
  low: {
    label: 'Riesgo bajo',
    signals: { deviceKnown: true, failedAttempts: 0, locationShiftKm: 5, hour: 14, velocityKmh: 10 },
  },
  medium: {
    label: 'Riesgo medio',
    signals: { deviceKnown: true, failedAttempts: 2, locationShiftKm: 400, hour: 14, velocityKmh: 400 },
  },
  high: {
    label: 'Riesgo alto',
    signals: { deviceKnown: false, failedAttempts: 3, locationShiftKm: 900, hour: 3, velocityKmh: 900 },
  },
}

const DECISION_LABEL: Record<string, string> = {
  ALLOW: 'Acceso permitido',
  REQUIRE_2FA: 'Se exige segundo factor (2FA)',
  BLOCK: 'Acceso bloqueado',
}

const DECISION_CLASS: Record<string, string> = {
  ALLOW: 'allow',
  REQUIRE_2FA: 'twofa',
  BLOCK: 'block',
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [tab, setTab] = useState<Tab>('demo')
  const [username, setUsername] = useState('ana@enviame.io')
  const [scenario, setScenario] = useState<ScenarioKey>('low')
  const [signals, setSignals] = useState<Signals>(SCENARIOS.low.signals)
  const [result, setResult] = useState<LoginResult | null>(null)
  const [chaos, setChaosState] = useState<Chaos>({ riskDown: false, latencyMs: 0, drift: false, circuit: 'closed' })
  const [loading, setLoading] = useState(false)
  const [guided, setGuided] = useState(false)
  const [log, setLog] = useState<string[]>([])

  const appendLog = useCallback((line: string) => {
    setLog((prev) => [`${new Date().toLocaleTimeString()} · ${line}`, ...prev].slice(0, 8))
  }, [])

  const refreshChaos = useCallback(async () => {
    try {
      setChaosState(await getChaos())
    } catch {
      /* el consumidor puede no estar arriba todavia */
    }
  }, [])

  useEffect(() => {
    refreshChaos()
    const interval = setInterval(refreshChaos, 3000)
    return () => clearInterval(interval)
  }, [refreshChaos])

  // Restaura la sesion si hay un token guardado.
  useEffect(() => {
    const token = localStorage.getItem('access_risk_token')
    if (!token) {
      return
    }
    setAuthToken(token)
    authMe()
      .then((result) => setUser(result.user))
      .catch(() => {
        setAuthToken('')
        localStorage.removeItem('access_risk_token')
      })
  }, [])

  const selectScenario = (key: ScenarioKey) => {
    setScenario(key)
    setSignals(SCENARIOS[key].signals)
  }

  const doLogin = useCallback(
    async (override?: Signals, label?: string) => {
      setLoading(true)
      try {
        const response = await login(username, override ?? signals)
        setResult(response)
        const detail = response.risk
        appendLog(
          `${label ?? 'login'} → ${response.decision}` +
            (response.fallback ? ' (fallback)' : '') +
            (detail ? ` · score ${detail.score}` : '')
        )
        return response
      } catch (err) {
        appendLog(`error: ${(err as Error).message}`)
        return null
      } finally {
        setLoading(false)
      }
    },
    [username, signals, appendLog]
  )

  const toggleChaos = async (patch: Partial<Chaos>) => {
    const next = await setChaos(patch)
    setChaosState(next)
    appendLog(`caos: ${JSON.stringify(patch)}`)
  }

  const generateTraffic = async (count: number) => {
    for (let i = 0; i < count; i += 1) {
      await login(username, { ...signals })
    }
    appendLog(`tráfico generado: ${count} intentos`)
  }

  const runGuided = async () => {
    setGuided(true)
    setTab('demo')
    try {
      await resetDemo()
      await refreshChaos()
      appendLog('demo guiada: inicio')

      selectScenario('low')
      await doLogin(SCENARIOS.low.signals, 'paso 1 · bajo')
      await sleep(1000)
      selectScenario('medium')
      await doLogin(SCENARIOS.medium.signals, 'paso 2 · medio')
      await sleep(1000)
      selectScenario('high')
      await doLogin(SCENARIOS.high.signals, 'paso 3 · alto')
      await sleep(1000)

      await toggleChaos({ riskDown: true })
      await doLogin(SCENARIOS.low.signals, 'paso 4 · servicio caído')
      await sleep(1000)

      await toggleChaos({ riskDown: false, latencyMs: 900 })
      await doLogin(SCENARIOS.low.signals, 'paso 5 · latencia alta')
      await sleep(1000)

      await toggleChaos({ latencyMs: 0 })
      await doLogin(SCENARIOS.low.signals, 'paso 6 · recuperación')
      await sleep(1000)

      await toggleChaos({ drift: true })
      await generateTraffic(25)
      await doLogin(SCENARIOS.low.signals, 'paso 7 · drift')
      appendLog('demo guiada: fin')
    } finally {
      setGuided(false)
      await refreshChaos()
    }
  }

  const doReset = async () => {
    await resetDemo()
    setResult(null)
    setLog([])
    await refreshChaos()
  }

  const doFeedback = async (outcome: 'fraud' | 'legit') => {
    const id = result?.risk?.decisionId
    if (!id) {
      appendLog('sin decisionId para enviar feedback')
      return
    }
    try {
      await sendFeedback(id, outcome)
      appendLog(`feedback: ${outcome} (decisión ${id})`)
    } catch (err) {
      appendLog(`error feedback: ${(err as Error).message}`)
    }
  }

  const doLogout = async () => {
    try {
      await authLogout()
    } catch {
      /* la sesion puede haber expirado */
    }
    setAuthToken('')
    localStorage.removeItem('access_risk_token')
    setUser(null)
  }

  if (!user) {
    return <Login onLogin={setUser} />
  }

  const canOperate = user.role !== 'viewer'
  const score = result?.risk?.score ?? null
  const level = result?.risk?.level ?? null

  return (
    <div className="app">
      <header className="hero">
        <div className="hero-row">
          <div>
            <p className="eyebrow">MIS-312 · MVP de demostración</p>
            <h1>Riesgo de acceso con IA</h1>
            <p className="tagline">El backend orquesta, la IA opina y el backend decide.</p>
          </div>
          <div className="user-box">
            <span className="muted small">{user.email}</span>
            <span className="badge">{ROLE_LABEL[user.role]}</span>
            <button className="ghost small-btn" onClick={doLogout} type="button">Salir</button>
          </div>
        </div>
        <nav className="tabs" role="tablist">
          <button className={tab === 'demo' ? 'active' : ''} onClick={() => setTab('demo')} type="button">Demo</button>
          <button className={tab === 'modelo' ? 'active' : ''} onClick={() => setTab('modelo')} type="button">Modelo</button>
          <button className={tab === 'operacion' ? 'active' : ''} onClick={() => setTab('operacion')} type="button">Operación</button>
          <button className={tab === 'datos' ? 'active' : ''} onClick={() => setTab('datos')} type="button">Datos</button>
          <button className={tab === 'arquitectura' ? 'active' : ''} onClick={() => setTab('arquitectura')} type="button">Arquitectura</button>
          <button className={tab === 'dashboard' ? 'active' : ''} onClick={() => setTab('dashboard')} type="button">Dashboard</button>
        </nav>
      </header>

      <main>
        {tab === 'demo' && (
          <div className="stack">
            <section className="card">
              <h2>Flujo en tiempo real</h2>
              <p className="muted small">El recorrido se ilumina a medida que el sistema procesa cada intento (SSE).</p>
              <LiveFlow />
            </section>
            <div className="grid">
              <section className="card">
                <h2>Intento de inicio de sesión</h2>
                <label className="field">
                  <span>Usuario</span>
                  <input value={username} onChange={(e) => setUsername(e.target.value)} />
                </label>
                <div className="scenarios" role="group" aria-label="Escenarios de riesgo">
                  {(Object.keys(SCENARIOS) as ScenarioKey[]).map((key) => (
                    <button key={key} className={`scenario ${scenario === key ? 'active' : ''}`} onClick={() => selectScenario(key)} type="button">
                      {SCENARIOS[key].label}
                    </button>
                  ))}
                </div>
                <dl className="signals">
                  <div><dt>Dispositivo</dt><dd>{signals.deviceKnown ? 'de confianza' : 'desconocido'}</dd></div>
                  <div><dt>Intentos fallidos</dt><dd>{signals.failedAttempts}</dd></div>
                  <div><dt>Cambio de ubicación</dt><dd>{signals.locationShiftKm} km</dd></div>
                  <div><dt>Hora</dt><dd>{signals.hour}:00</dd></div>
                  <div><dt>Velocidad</dt><dd>{signals.velocityKmh} km/h</dd></div>
                </dl>
                <button className="primary" onClick={() => doLogin()} disabled={loading || guided || !canOperate} type="button">
                  {loading ? 'Evaluando…' : canOperate ? 'Iniciar sesión' : 'Solo lectura (Observador)'}
                </button>
              </section>

              <section className={`card result ${result ? DECISION_CLASS[result.decision] : ''}`} aria-live="polite">
                <h2>Decisión</h2>
                {!result && <p className="muted">Aún no hay una evaluación. Inicia sesión o usa la demo guiada.</p>}
                {result && (
                  <>
                    <p className="decision">{DECISION_LABEL[result.decision]}</p>
                    <div className="badges">
                      <span className="badge">nivel: {level ?? '—'}</span>
                      <span className="badge">score: {score ?? '—'}</span>
                      <span className="badge">circuit: {result.circuit}</span>
                      {result.fallback && <span className="badge warn">fallback</span>}
                      {result.drift && <span className="badge warn">drift</span>}
                    </div>
                    <p className="reason">{result.risk?.reason ?? 'El modelo no está disponible: se exige 2FA por seguridad.'}</p>
                    <p className="muted small">modelo {result.risk?.modelVersion ?? '—'} · latencia {result.risk?.latencyMs ?? '—'} ms</p>
                    {result.risk?.decisionId && canOperate ? (
                      <div className="feedback">
                        <span className="muted small">Resultado real:</span>
                        <button className="ghost small-btn" onClick={() => doFeedback('fraud')} type="button">Fue fraude</button>
                        <button className="ghost small-btn" onClick={() => doFeedback('legit')} type="button">Fue legítimo</button>
                      </div>
                    ) : null}
                  </>
                )}
              </section>

              <section className="card">
                <h2>Controles de la demo</h2>
                <div className="toggles">
                  <label className="toggle">
                    <input type="checkbox" checked={chaos.riskDown} onChange={(e) => toggleChaos({ riskDown: e.target.checked })} disabled={guided || !canOperate} />
                    <span>Servicio de riesgo caído</span>
                  </label>
                  <label className="toggle">
                    <input type="checkbox" checked={chaos.latencyMs > 0} onChange={(e) => toggleChaos({ latencyMs: e.target.checked ? 900 : 0 })} disabled={guided || !canOperate} />
                    <span>Latencia alta (timeout)</span>
                  </label>
                  <label className="toggle">
                    <input type="checkbox" checked={chaos.drift} onChange={(e) => toggleChaos({ drift: e.target.checked })} disabled={guided || !canOperate} />
                    <span>Data drift</span>
                  </label>
                </div>
                <div className="actions">
                  <button className="primary" onClick={runGuided} disabled={guided || !canOperate} type="button">{guided ? 'Demo en curso…' : 'Demo guiada'}</button>
                  <button className="ghost" onClick={doReset} disabled={guided || !canOperate} type="button">Reiniciar</button>
                </div>
              </section>

              <section className="card">
                <h2>Actividad</h2>
                <ul className="log">
                  {log.length === 0 && <li className="muted">Sin actividad todavía.</li>}
                  {log.map((line, index) => (
                    <li key={index}>{line}</li>
                  ))}
                </ul>
              </section>
            </div>
          </div>
        )}

        {tab === 'modelo' && <ModelManager role={user.role} />}
        {tab === 'operacion' && <Operations />}
        {tab === 'datos' && <DecisionsTable />}

        {tab === 'arquitectura' && (
          <section className="card arch">
            <div className="card-head">
              <h2>Arquitectura del sistema (archify)</h2>
              <a className="link" href="/flujo.html" target="_blank" rel="noreferrer">Abrir en pantalla completa ↗</a>
            </div>
            <div className="flow-embed arch-embed">
              <iframe title="Arquitectura del MVP de riesgo de acceso" src="/flujo.html?v=2" />
            </div>
          </section>
        )}

        {tab === 'dashboard' && <Dashboard />}
      </main>

      <footer className="foot">
        <span>circuit breaker: {chaos.circuit}</span>
        <span>·</span>
        <span>fallback: exigir 2FA</span>
      </footer>
    </div>
  )
}

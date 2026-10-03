import { useEffect, useRef, useState } from 'react'
import { getRiskMetrics } from './api'
import { AreaChart, Donut, Gauge } from './charts'
import type { SystemMetrics } from './types'

const EMPTY: SystemMetrics = {
  requests: 0,
  decisions: { ALLOW: 0, REQUIRE_2FA: 0, BLOCK: 0 },
  levels: { LOW: 0, MEDIUM: 0, HIGH: 0 },
  fallbacks: 0,
  avgLatencyMs: 0,
  maxLatencyMs: 0,
  circuit: { state: 'closed', failures: 0 },
  model: { labeled: 0, confusion: { tp: 0, fp: 0, fn: 0, tn: 0 }, precision: null, recall: null, falsePositiveRate: null },
  modelStatus: { available: false },
  history: { requests: 0, decisions: { ALLOW: 0, REQUIRE_2FA: 0, BLOCK: 0 }, levels: { LOW: 0, MEDIUM: 0, HIGH: 0 }, fallbacks: 0, avgLatencyMs: 0, maxLatencyMs: 0 },
}

function Bar({ label, value, max, tone }: { label: string; value: number; max: number; tone: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="bar-row">
      <span className="bar-label">{label}</span>
      <div className="bar-track">
        <div className={`bar-fill ${tone}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="bar-value">{value}</span>
    </div>
  )
}

export default function Dashboard() {
  const [metrics, setMetrics] = useState<SystemMetrics>(EMPTY)
  const [rate, setRate] = useState<number[]>([])
  const lastRequests = useRef(0)

  useEffect(() => {
    let active = true
    const tick = async () => {
      try {
        const data = await getRiskMetrics()
        if (!active) {
          return
        }
        setMetrics(data)
        const total = data.history?.requests ?? data.requests
        const delta = Math.max(0, total - lastRequests.current)
        lastRequests.current = total
        setRate((prev) => [...prev, delta].slice(-30))
      } catch {
        /* sin persistencia o servicio caído */
      }
    }
    tick()
    const interval = setInterval(tick, 3000)
    return () => {
      active = false
      clearInterval(interval)
    }
  }, [])

  const history = metrics.history ?? {
    requests: metrics.requests,
    decisions: metrics.decisions,
    levels: metrics.levels,
    fallbacks: metrics.fallbacks,
    avgLatencyMs: metrics.avgLatencyMs,
    maxLatencyMs: metrics.maxLatencyMs,
  }
  const decisions = history.decisions
  const levels = history.levels
  const maxLevel = Math.max(1, ...Object.values(levels))
  const drift = metrics.modelStatus.drift
  const circuitWarn = metrics.circuit.state !== 'closed'

  const decisionSegments = [
    { label: 'Permitir', value: decisions.ALLOW ?? 0, color: '#1e8e5a' },
    { label: '2FA', value: decisions.REQUIRE_2FA ?? 0, color: '#b8860b' },
    { label: 'Bloquear', value: decisions.BLOCK ?? 0, color: '#c0392b' },
  ]

  return (
    <div className="dash">
      <div className="kpis">
        <div className="kpi"><span>Intentos evaluados</span><b>{history.requests}</b></div>
        <div className="kpi"><span>Fallbacks</span><b className={history.fallbacks ? 'warn-text' : ''}>{history.fallbacks}</b></div>
        <div className="kpi"><span>Latencia media</span><b>{history.avgLatencyMs} ms</b></div>
        <div className="kpi"><span>Latencia máx.</span><b>{history.maxLatencyMs} ms</b></div>
        <div className="kpi"><span>Circuit breaker</span><b className={circuitWarn ? 'warn-text' : ''}>{metrics.circuit.state}</b></div>
        <div className="kpi"><span>Data drift (PSI)</span><b className={drift?.detected ? 'warn-text' : ''}>{metrics.modelStatus.available ? drift?.psi ?? '—' : '—'}</b></div>
      </div>

      <div className="dash-grid">
        <section className="card">
          <h3>Decisiones</h3>
          <Donut segments={decisionSegments} />
        </section>

        <section className="card">
          <h3>Tráfico por intervalo</h3>
          <AreaChart data={rate.length ? rate : [0]} />
          <p className="muted small">Intentos evaluados cada 3 s (últimos {rate.length} intervalos).</p>
        </section>

        <section className="card">
          <h3>Calidad del modelo</h3>
          {metrics.model.labeled === 0 ? (
            <p className="muted small">Sin etiquetas aún. Usa el feedback en la pestaña Demo.</p>
          ) : (
            <div className="gauges">
              <Gauge value={metrics.model.precision} label="Precisión" tone="#1e8e5a" />
              <Gauge value={metrics.model.recall} label="Recall" tone="#2e86c1" />
            </div>
          )}
        </section>

        <section className="card">
          <h3>Nivel de riesgo</h3>
          <Bar label="Bajo" value={levels.LOW ?? 0} max={maxLevel} tone="allow" />
          <Bar label="Medio" value={levels.MEDIUM ?? 0} max={maxLevel} tone="twofa" />
          <Bar label="Alto" value={levels.HIGH ?? 0} max={maxLevel} tone="block" />
          <p className="muted small">Etiquetadas: {metrics.model.labeled} · Tasa de FP: {metrics.model.falsePositiveRate ?? '—'}</p>
        </section>

        <section className="card span-2">
          <h3>Matriz de confusión (predicho vs. real)</h3>
          <div className="matrix">
            <div className="mx tp"><span>Verdaderos positivos</span><b>{metrics.model.confusion.tp}</b></div>
            <div className="mx fn"><span>Falsos negativos</span><b>{metrics.model.confusion.fn}</b></div>
            <div className="mx fp"><span>Falsos positivos</span><b>{metrics.model.confusion.fp}</b></div>
            <div className="mx tn"><span>Verdaderos negativos</span><b>{metrics.model.confusion.tn}</b></div>
          </div>
        </section>
      </div>
    </div>
  )
}

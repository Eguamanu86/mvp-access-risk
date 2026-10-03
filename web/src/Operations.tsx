import { useEffect, useState } from 'react'
import { API_BASE, getDecisions, getHealth, getRiskMetrics } from './api'
import type { Health, SystemMetrics } from './types'

interface Alert {
  id: string
  severity: 'alta' | 'media'
  text: string
}

export default function Operations() {
  const [health, setHealth] = useState<Health | null>(null)
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null)
  const [live, setLive] = useState<string[]>([])
  const [activity, setActivity] = useState<string[]>([])
  const [ack, setAck] = useState<string[]>([])

  useEffect(() => {
    let active = true
    const tick = async () => {
      try {
        const h = await getHealth()
        if (active) {
          setHealth(h)
        }
      } catch {
        /* gateway caído */
      }
      try {
        const m = await getRiskMetrics()
        if (active) {
          setMetrics(m)
        }
      } catch {
        /* sin métricas */
      }
    }
    tick()
    const interval = setInterval(tick, 5000)
    return () => {
      active = false
      clearInterval(interval)
    }
  }, [])

  // Eventos del flujo en vivo (SSE).
  useEffect(() => {
    const source = new EventSource(`${API_BASE}/demo/events`)
    source.onmessage = (message) => {
      try {
        const event = JSON.parse(message.data)
        if (event.type === 'ready') {
          return
        }
        const suffix = event.decision ? ` → ${event.decision}` : ''
        setLive((prev) => [`▸ ${new Date().toLocaleTimeString()}  ${event.type}${suffix}`, ...prev].slice(0, 15))
      } catch {
        /* ignora */
      }
    }
    return () => source.close()
  }, [])

  // Actividad reciente desde la base de datos (cada decisión).
  useEffect(() => {
    let active = true
    const tick = async () => {
      try {
        const page = await getDecisions({ limit: 15 })
        if (!active) {
          return
        }
        setActivity(
          page.items.map(
            (row) =>
              `${new Date(row.createdAt).toLocaleTimeString()}  ${row.decision}  ${row.username ?? '—'}  score ${row.score ?? '—'}`
          )
        )
      } catch {
        /* sin persistencia */
      }
    }
    tick()
    const interval = setInterval(tick, 5000)
    return () => {
      active = false
      clearInterval(interval)
    }
  }, [])

  const alerts: Alert[] = []
  if (metrics?.modelStatus.drift?.detected) {
    alerts.push({ id: 'drift', severity: 'alta', text: `Data drift detectado (PSI ${metrics.modelStatus.drift.psi})` })
  }
  if (metrics && metrics.circuit.state !== 'closed') {
    alerts.push({ id: 'circuit', severity: 'alta', text: `Circuit breaker ${metrics.circuit.state}` })
  }
  if (metrics && metrics.fallbacks > 0) {
    alerts.push({ id: 'fallback', severity: 'media', text: `${metrics.fallbacks} intentos en fallback (2FA)` })
  }
  if (metrics && metrics.avgLatencyMs > 100) {
    alerts.push({ id: 'latency', severity: 'media', text: `Latencia media alta: ${metrics.avgLatencyMs} ms` })
  }
  const activeAlerts = alerts.filter((a) => !ack.includes(a.id))

  return (
    <div className="stack">
      <section className="card">
        <h2>Salud de componentes</h2>
        <div className="health">
          {(health?.components ?? []).map((c) => (
            <div key={c.name} className={`health-item ${c.status}`}>
              <span className="health-dot" />
              <div>
                <b>{c.name}</b>
                <span className="muted small">{c.status === 'up' ? 'operativo' : 'caído'}{c.detail ? ` · ${c.detail}` : ''}</span>
              </div>
            </div>
          ))}
          {!health && <p className="muted small">Consultando…</p>}
        </div>
      </section>

      <section className="card">
        <h2>Alertas</h2>
        {activeAlerts.length === 0 && <p className="muted small">Sin alertas activas.</p>}
        <ul className="alerts">
          {activeAlerts.map((a) => (
            <li key={a.id} className={`alert ${a.severity}`}>
              <span className="alert-sev">{a.severity}</span>
              <span>{a.text}</span>
              <button className="ghost small-btn" onClick={() => setAck((prev) => [...prev, a.id])} type="button">Reconocer</button>
            </li>
          ))}
        </ul>
      </section>

      <section className="card">
        <h2>Logs en vivo</h2>
        <p className="muted small">
          Eventos del flujo (en vivo) y actividad reciente registrada en la base de datos.
        </p>
        <ul className="log live-log">
          {live.length === 0 && activity.length === 0 && <li className="muted">Sin actividad todavía.</li>}
          {live.map((line, index) => (
            <li key={`l-${index}`} className="live-line">{line}</li>
          ))}
          {activity.map((line, index) => (
            <li key={`a-${index}`}>{line}</li>
          ))}
        </ul>
      </section>
    </div>
  )
}

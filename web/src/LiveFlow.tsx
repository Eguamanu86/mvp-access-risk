import { useEffect, useState } from 'react'
import { API_BASE } from './api'

type Phase = 'idle' | 'mock' | 'risk' | 'model' | 'decision'

const LEVEL: Record<Phase, number> = { idle: 0, mock: 1, risk: 2, model: 3, decision: 4 }

interface FlowEvent {
  type: string
  decision?: string
  fallback?: boolean
  steps?: Array<{ step: string }>
}

function Node({ label, active, tone }: { label: string; active?: boolean; tone?: string }) {
  return <div className={`lf-node ${active ? 'active' : ''} ${tone ?? ''}`}>{label}</div>
}

export default function LiveFlow() {
  const [phase, setPhase] = useState<Phase>('idle')
  const [fallback, setFallback] = useState(false)
  const [persisted, setPersisted] = useState(false)
  const [decision, setDecision] = useState('')
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    const source = new EventSource(`${API_BASE}/demo/events`)
    source.onopen = () => setConnected(true)
    source.onerror = () => setConnected(false)
    source.onmessage = (message) => {
      let event: FlowEvent
      try {
        event = JSON.parse(message.data)
      } catch {
        return
      }
      if (event.type === 'ready') {
        setPhase('idle')
        setFallback(false)
        setPersisted(false)
      } else if (event.type === 'received') {
        setPhase('mock')
        setFallback(false)
        setPersisted(false)
        setDecision('')
      } else if (event.type === 'calling') {
        setPhase('risk')
      } else if (event.type === 'steps') {
        const steps = (event.steps ?? []).map((item) => item.step)
        if (steps.some((step) => step.startsWith('model'))) {
          setPhase('model')
        } else if (steps.length > 0) {
          setFallback(true)
        }
      } else if (event.type === 'persisted') {
        setPersisted(true)
      } else if (event.type === 'decision') {
        setDecision(event.decision ?? '')
        setFallback(Boolean(event.fallback))
        setPhase('decision')
        window.setTimeout(() => {
          setPhase('idle')
          setFallback(false)
          setPersisted(false)
        }, 2000)
      }
    }
    return () => source.close()
  }, [])

  const level = LEVEL[phase]
  const on = (min: number) => level >= min

  return (
    <div className="lf">
      <div className="lf-status">
        <span className={`lf-dot ${connected ? 'ok' : ''}`} aria-hidden="true" />
        <span>{connected ? 'stream en vivo (SSE)' : 'conectando…'}</span>
        {decision && <b className="lf-decision">→ {decision}</b>}
      </div>

      <div className="lf-track" role="img" aria-label="Flujo en tiempo real">
        <Node label="Interfaz web" active />
        <div className="lf-edge active" />
        <Node label="API Gateway" active />
        <div className={`lf-edge ${on(1) ? 'active' : ''}`} />
        <Node label="mock-auth" active={on(1)} />
        <div className={`lf-edge ${on(2) ? 'active' : ''}`} />
        <Node label="risk-api" active={on(2)} />
        <div className={`lf-edge ${!fallback && on(3) ? 'active' : ''}`} />
        <Node label="model" active={!fallback && on(3)} />
      </div>

      <div className="lf-plane">
        <Node label="Fallback · 2FA" active={fallback} tone="warn" />
        <Node label="PostgreSQL" active={persisted} tone="data" />
        <Node label="MLflow" tone="mlops" />
        <Node label="MinIO" tone="mlops" />
      </div>
      <p className="lf-note">
        El camino se ilumina en vivo. <b>PostgreSQL</b> se marca al persistir la decisión; <b>MLflow</b> y <b>MinIO</b>
        {' '}son el plano MLOps (pipeline y artefactos).
      </p>
    </div>
  )
}

import { useCallback, useEffect, useState } from 'react'
import { getDecisions } from './api'
import type { DecisionRow, DecisionsPage } from './types'

const PAGE_SIZE = 10

export default function DecisionsTable() {
  const [data, setData] = useState<DecisionsPage>({ total: 0, items: [] })
  const [page, setPage] = useState(0)
  const [decision, setDecision] = useState('')
  const [level, setLevel] = useState('')
  const [outcome, setOutcome] = useState('')
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    try {
      const result = await getDecisions({
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
        decision,
        level,
        outcome,
        search,
      })
      setData(result)
    } catch {
      /* sin persistencia */
    }
  }, [page, decision, level, outcome, search])

  useEffect(() => {
    load()
    const interval = setInterval(load, 5000)
    return () => clearInterval(interval)
  }, [load])

  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE))

  const applyFilter = (setter: (value: string) => void) => (event: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) => {
    setter(event.target.value)
    setPage(0)
  }

  return (
    <section className="card">
      <div className="card-head">
        <h2>Decisiones (auditoría)</h2>
        <span className="muted small">{data.total} registros</span>
      </div>

      <div className="filters">
        <select value={decision} onChange={applyFilter(setDecision)}>
          <option value="">Todas las decisiones</option>
          <option value="ALLOW">Permitir</option>
          <option value="REQUIRE_2FA">2FA</option>
          <option value="BLOCK">Bloquear</option>
        </select>
        <select value={level} onChange={applyFilter(setLevel)}>
          <option value="">Todos los niveles</option>
          <option value="LOW">Bajo</option>
          <option value="MEDIUM">Medio</option>
          <option value="HIGH">Alto</option>
        </select>
        <select value={outcome} onChange={applyFilter(setOutcome)}>
          <option value="">Todas las etiquetas</option>
          <option value="fraud">Fraude</option>
          <option value="legit">Legítimo</option>
        </select>
        <input placeholder="Buscar usuario…" value={search} onChange={applyFilter(setSearch)} />
      </div>

      <table className="table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Usuario</th>
            <th>Decisión</th>
            <th>Nivel</th>
            <th>Score</th>
            <th>Latencia</th>
            <th>Etiqueta</th>
            <th>Fecha</th>
          </tr>
        </thead>
        <tbody>
          {data.items.length === 0 && (
            <tr><td colSpan={8} className="muted">Sin registros para los filtros seleccionados.</td></tr>
          )}
          {data.items.map((row: DecisionRow) => (
            <tr key={row.id}>
              <td>{row.id}</td>
              <td>{row.username ?? '—'}</td>
              <td><span className={`pill ${row.decision}`}>{row.decision}</span></td>
              <td>{row.level ?? '—'}</td>
              <td>{row.score ?? '—'}</td>
              <td>{row.latencyMs ?? '—'} ms</td>
              <td>{row.outcome ?? <span className="muted">sin etiqueta</span>}</td>
              <td className="small">{new Date(row.createdAt).toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="pager">
        <button className="ghost small-btn" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} type="button">Anterior</button>
        <span className="muted small">Página {page + 1} de {totalPages}</span>
        <button className="ghost small-btn" onClick={() => setPage((p) => (p + 1 < totalPages ? p + 1 : p))} disabled={page + 1 >= totalPages} type="button">Siguiente</button>
      </div>
    </section>
  )
}

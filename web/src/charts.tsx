/**
 * Gráficos SVG propios (sin dependencias) para el dashboard.
 * Paleta coherente con la marca; pensados para leerse en proyección.
 */

interface Segment {
  label: string
  value: number
  color: string
}

export function Donut({ segments, size = 170 }: { segments: Segment[]; size?: number }) {
  const total = segments.reduce((sum, s) => sum + s.value, 0)
  const center = size / 2
  const stroke = 24
  const radius = center - stroke / 2
  const circumference = 2 * Math.PI * radius
  let offset = 0

  return (
    <div className="donut-wrap">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Distribución de decisiones">
        <circle cx={center} cy={center} r={radius} fill="none" stroke="#eef3f9" strokeWidth={stroke} />
        <g transform={`rotate(-90 ${center} ${center})`}>
          {total > 0 &&
            segments.map((seg, index) => {
              const dash = (seg.value / total) * circumference
              const circle = (
                <circle
                  key={index}
                  cx={center}
                  cy={center}
                  r={radius}
                  fill="none"
                  stroke={seg.color}
                  strokeWidth={stroke}
                  strokeDasharray={`${dash} ${circumference - dash}`}
                  strokeDashoffset={-offset}
                  strokeLinecap="butt"
                />
              )
              offset += dash
              return circle
            })}
        </g>
        <text x={center} y={center - 2} textAnchor="middle" className="donut-total">
          {total}
        </text>
        <text x={center} y={center + 16} textAnchor="middle" className="donut-caption">
          intentos
        </text>
      </svg>
      <ul className="legend">
        {segments.map((seg, index) => (
          <li key={index}>
            <span className="dot" style={{ background: seg.color }} />
            {seg.label}
            <b>{seg.value}</b>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function AreaChart({ data, height = 150 }: { data: number[]; height?: number }) {
  const width = 340
  const pad = 12
  const max = Math.max(1, ...data)
  const innerW = width - pad * 2
  const innerH = height - pad * 2
  const step = data.length > 1 ? innerW / (data.length - 1) : innerW
  const points = data.map((value, index) => {
    const x = pad + index * step
    const y = pad + innerH - (value / max) * innerH
    return [x, y] as const
  })
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
  const area = points.length ? `${line} L${points[points.length - 1][0].toFixed(1)},${height - pad} L${pad},${height - pad} Z` : ''

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="area-chart" preserveAspectRatio="none" role="img" aria-label="Intentos por intervalo">
      <defs>
        <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2e86c1" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#2e86c1" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((g) => (
        <line key={g} x1={pad} x2={width - pad} y1={pad + innerH * g} y2={pad + innerH * g} stroke="#e4ecf5" strokeWidth="1" />
      ))}
      {area && <path d={area} fill="url(#areaFill)" />}
      {line && <path d={line} fill="none" stroke="#2e86c1" strokeWidth="2.5" strokeLinejoin="round" />}
      {points.length > 0 && (
        <circle cx={points[points.length - 1][0]} cy={points[points.length - 1][1]} r="3.5" fill="#1b2a4a" />
      )}
      <text x={pad} y={pad + 4} className="chart-axis">máx {max}</text>
    </svg>
  )
}

export function Gauge({ value, label, tone = '#1e8e5a' }: { value: number | null; label: string; tone?: string }) {
  const size = 150
  const center = size / 2
  const radius = center - 16
  const startAngle = 150
  const endAngle = 390
  const sweep = endAngle - startAngle
  const pct = value === null ? 0 : Math.max(0, Math.min(1, value))
  const angle = startAngle + sweep * pct
  const rad = (deg: number) => (deg * Math.PI) / 180
  const arcPath = (from: number, to: number) => {
    const x1 = center + radius * Math.cos(rad(from))
    const y1 = center + radius * Math.sin(rad(from))
    const x2 = center + radius * Math.cos(rad(to))
    const y2 = center + radius * Math.sin(rad(to))
    const large = to - from > 180 ? 1 : 0
    return `M${x1.toFixed(1)},${y1.toFixed(1)} A${radius},${radius} 0 ${large} 1 ${x2.toFixed(1)},${y2.toFixed(1)}`
  }

  return (
    <div className="gauge-wrap">
      <svg width={size} height={size * 0.72} viewBox={`0 0 ${size} ${size * 0.72}`} role="img" aria-label={label}>
        <path d={arcPath(startAngle, endAngle)} fill="none" stroke="#eef3f9" strokeWidth="14" strokeLinecap="round" />
        {value !== null && <path d={arcPath(startAngle, angle)} fill="none" stroke={tone} strokeWidth="14" strokeLinecap="round" />}
        <text x={center} y={center + 6} textAnchor="middle" className="gauge-value">
          {value === null ? '—' : `${Math.round(pct * 100)}%`}
        </text>
      </svg>
      <span className="gauge-label">{label}</span>
    </div>
  )
}

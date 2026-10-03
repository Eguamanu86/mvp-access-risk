export type Decision = 'ALLOW' | 'REQUIRE_2FA' | 'BLOCK'
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH'

export interface Signals {
  deviceKnown: boolean
  failedAttempts: number
  locationShiftKm: number
  hour: number
  velocityKmh: number
}

export interface RiskDetail {
  score: number | null
  level: RiskLevel | null
  decision: Decision
  reason: string
  fallback: boolean
  modelVersion: string | null
  latencyMs: number
  circuit: string
  decisionId?: number | null
}

export interface LoginResult {
  username: string
  decision: Decision
  requires2fa: boolean
  fallback: boolean
  circuit: string
  drift: boolean
  risk: RiskDetail | null
}

export interface Chaos {
  riskDown: boolean
  latencyMs: number
  drift: boolean
  circuit: string
}

export interface ModelMetrics {
  labeled: number
  confusion: { tp: number; fp: number; fn: number; tn: number }
  precision: number | null
  recall: number | null
  falsePositiveRate: number | null
}

export interface ModelStatus {
  available: boolean
  drift?: { detected: boolean; psi: number; threshold: number }
  requests?: number
  modelVersion?: string
  avgLatencyMs?: number
}

export interface HistoryMetrics {
  requests: number
  decisions: Record<string, number>
  levels: Record<string, number>
  fallbacks: number
  avgLatencyMs: number
  maxLatencyMs: number
}

export interface SystemMetrics {
  requests: number
  decisions: Record<string, number>
  levels: Record<string, number>
  fallbacks: number
  avgLatencyMs: number
  maxLatencyMs: number
  circuit: { state: string; failures: number }
  model: ModelMetrics
  modelStatus: ModelStatus
  history?: HistoryMetrics
}

export type Role = 'viewer' | 'operator' | 'admin'

export interface ModelVersion {
  version: string
  validationAccuracy: number
  trainedOn: number
  source: string
  promoted: boolean
  timestamp: string
}

export interface ModelRegistry {
  active: string | null
  versions: ModelVersion[]
}

export interface ModelInfo {
  version: string
  features: string[]
  weights: number[]
  bias: number
  thresholds: { low: number; high: number }
  trainingMetrics: { validationAccuracy?: number; trainedOn?: number }
}

export interface Pipeline {
  status: 'idle' | 'running' | 'success' | 'failed'
  startedAt: string | null
  finishedAt: string | null
  lastResult: Record<string, unknown> | null
}

export interface DecisionRow {
  id: number
  executionId: string | null
  username: string | null
  decision: string
  level: string
  score: number | null
  fallback: boolean
  latencyMs: number | null
  outcome: string | null
  createdAt: string
}

export interface DecisionsPage {
  total: number
  items: DecisionRow[]
}

export interface HealthComponent {
  name: string
  status: 'up' | 'down'
  detail?: string
}

export interface Health {
  components: HealthComponent[]
  circuit: string
}

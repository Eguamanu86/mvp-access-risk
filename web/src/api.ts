import type {
  Chaos,
  DecisionsPage,
  Health,
  LoginResult,
  ModelInfo,
  ModelRegistry,
  Pipeline,
  Role,
  Signals,
  SystemMetrics,
} from './types'

const BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? 'http://localhost:8092'

export const API_BASE = BASE

let authToken = ''

export function setAuthToken(token: string) {
  authToken = token
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (authToken) {
    headers.authorization = `Bearer ${authToken}`
  }
  const response = await fetch(`${BASE}${path}`, { ...init, headers })
  if (!response.ok) {
    throw new Error(`request failed: ${response.status}`)
  }
  const payload = await response.json()
  return payload.data as T
}

// --- Autenticación ---
export interface AuthUser {
  id: number
  email: string
  name: string
  role: Role
}

export function authLogin(email: string, password: string): Promise<{ token: string; expiresAt: string; user: AuthUser }> {
  return request<{ token: string; expiresAt: string; user: AuthUser }>('/v1/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })
}

export function authLogout(): Promise<{ loggedOut: boolean }> {
  return request<{ loggedOut: boolean }>('/v1/auth/logout', { method: 'POST' })
}

export function authMe(): Promise<{ user: AuthUser }> {
  return request<{ user: AuthUser }>('/v1/auth/me')
}

export function login(username: string, signals: Signals): Promise<LoginResult> {
  return request<LoginResult>('/demo/login', {
    method: 'POST',
    body: JSON.stringify({ username, signals }),
  })
}

export function setChaos(chaos: Partial<Chaos>): Promise<Chaos> {
  return request<Chaos>('/demo/chaos', { method: 'POST', body: JSON.stringify(chaos) })
}

export function getChaos(): Promise<Chaos> {
  return request<Chaos>('/demo/chaos')
}

export function resetDemo(): Promise<{ reset: boolean }> {
  return request<{ reset: boolean }>('/demo/reset', { method: 'POST' })
}

// Feedback loop: registra el resultado real de una decisión (etiqueta).
export function sendFeedback(decisionId: number, outcome: 'fraud' | 'legit'): Promise<{ id: number; outcome: string }> {
  return request<{ id: number; outcome: string }>('/v1/access-risk/feedback', {
    method: 'POST',
    body: JSON.stringify({ decisionId, outcome }),
  })
}

// Métricas de sistema y de modelo (predicho vs. real).
export function getRiskMetrics(): Promise<SystemMetrics> {
  return request<SystemMetrics>('/v1/access-risk/metrics')
}

// --- Gestión del modelo (via backend, con RBAC) ---
export function getModelVersions(): Promise<ModelRegistry> {
  return request<ModelRegistry>('/v1/model/versions')
}

export function getModelInfo(): Promise<ModelInfo> {
  return request<ModelInfo>('/v1/model/info')
}

export function promoteModel(version: string): Promise<{ active: string }> {
  return request<{ active: string }>('/v1/model/promote', { method: 'POST', body: JSON.stringify({ version }) })
}

export function rollbackModel(): Promise<{ active: string }> {
  return request<{ active: string }>('/v1/model/rollback', { method: 'POST' })
}

export function retrainModel(conceptDrift: boolean): Promise<{ status: string }> {
  return request<{ status: string }>('/v1/model/retrain', { method: 'POST', body: JSON.stringify({ conceptDrift }) })
}

export function getPipeline(): Promise<Pipeline> {
  return request<Pipeline>('/v1/model/pipeline')
}

// --- Datos (auditoría) ---
export function getDecisions(params: Record<string, string | number>): Promise<DecisionsPage> {
  const query = new URLSearchParams(
    Object.entries(params)
      .filter(([, value]) => value !== '' && value !== undefined && value !== null)
      .map(([key, value]) => [key, String(value)])
  ).toString()
  return request<DecisionsPage>(`/v1/access-risk/decisions?${query}`)
}

// --- Operación ---
export function getHealth(): Promise<Health> {
  return request<Health>('/v1/access-risk/health')
}

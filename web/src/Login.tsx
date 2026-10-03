import { useState } from 'react'
import { authLogin, setAuthToken, type AuthUser } from './api'

export default function Login({ onLogin }: { onLogin: (user: AuthUser) => void }) {
  const [email, setEmail] = useState('admin@enviame.io')
  const [password, setPassword] = useState('admin123')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      const result = await authLogin(email.trim(), password)
      setAuthToken(result.token)
      localStorage.setItem('access_risk_token', result.token)
      onLogin(result.user)
    } catch (err) {
      setError((err as Error).message === 'request failed: 401' ? 'Credenciales inválidas' : 'No se pudo iniciar sesión')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={submit}>
        <p className="eyebrow">MIS-312 · MVP de demostración</p>
        <h1>Consola de riesgo de acceso</h1>
        <p className="muted small">Autenticación contra la base de datos (usuarios y sesiones).</p>

        <label className="field">
          <span>Email</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus autoComplete="username" />
        </label>

        <label className="field">
          <span>Contraseña</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </label>

        {error && <p className="login-error">{error}</p>}

        <button className="primary" type="submit" disabled={loading}>
          {loading ? 'Entrando…' : 'Entrar'}
        </button>

        <div className="login-hint">
          <p className="muted small">Usuarios de demo:</p>
          <ul className="muted small">
            <li><code>admin@enviame.io</code> / <code>admin123</code> — Administrador</li>
            <li><code>operador@enviame.io</code> / <code>operador123</code> — Operador</li>
            <li><code>viewer@enviame.io</code> / <code>viewer123</code> — Observador</li>
          </ul>
        </div>
      </form>
    </div>
  )
}

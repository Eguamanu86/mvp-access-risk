-- Esquema de la base de datos de riesgo de acceso (PostgreSQL).
-- Se aplica una sola vez (DDL explicito versionado), no con sync().

SET client_encoding = 'UTF8';

CREATE TABLE IF NOT EXISTS access_risk_decisions (
  id                BIGSERIAL PRIMARY KEY,
  execution_id      VARCHAR(64),
  username          VARCHAR(190),
  device_known      BOOLEAN,
  failed_attempts   INTEGER,
  location_shift_km INTEGER,
  hour              INTEGER,
  velocity_kmh      INTEGER,
  score             NUMERIC(6, 4),
  level             VARCHAR(10),
  decision          VARCHAR(20),
  fallback          BOOLEAN,
  circuit           VARCHAR(20),
  latency_ms        INTEGER,
  model_version     VARCHAR(20),
  outcome           VARCHAR(20),
  labeled_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_decisions_created_at ON access_risk_decisions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_decisions_outcome ON access_risk_decisions (outcome);

-- Autenticacion: usuarios y sesiones (login/logout reales).
CREATE TABLE IF NOT EXISTS auth_users (
  id            BIGSERIAL PRIMARY KEY,
  email         VARCHAR(190) UNIQUE NOT NULL,
  name          VARCHAR(190),
  role          VARCHAR(20) NOT NULL DEFAULT 'viewer',
  password_hash VARCHAR(255) NOT NULL,
  password_salt VARCHAR(64) NOT NULL,
  active        BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  token      VARCHAR(128) PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked    BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON auth_sessions (user_id);

-- Verificacion
SELECT COUNT(*) AS decisions FROM access_risk_decisions;

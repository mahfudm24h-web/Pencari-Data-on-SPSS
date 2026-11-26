import pg from "pg";
import { config } from "./config";

if (!config.databaseUrl) {
  throw new Error("DATABASE_URL is not set. See .env.example.");
}

export const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10 });

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);

CREATE TABLE IF NOT EXISTS datasets (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  row_count   INTEGER NOT NULL DEFAULT 0,
  payload     JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS datasets_user_idx ON datasets(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS search_logs (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider      TEXT NOT NULL,
  model         TEXT NOT NULL,
  mode          TEXT NOT NULL,
  query         TEXT NOT NULL,
  status        TEXT NOT NULL,
  input_tokens  INTEGER,
  output_tokens INTEGER,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS search_logs_user_idx ON search_logs(user_id, created_at DESC);
`;

/** Creates tables if missing. Retries while the database container is still starting. */
export async function migrate(attempts = 15): Promise<void> {
  for (let i = 1; ; i++) {
    try {
      await pool.query(SCHEMA);
      return;
    } catch (err) {
      if (i >= attempts) throw err;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

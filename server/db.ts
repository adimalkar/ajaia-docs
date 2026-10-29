import { createClient, type Client, type InArgs } from "@libsql/client";

export type DB = Client;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name          TEXT NOT NULL,
  password_hash TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS documents (
  id           TEXT PRIMARY KEY,
  owner_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  content_html TEXT NOT NULL DEFAULT '',
  version      INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  updated_by   INTEGER REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_documents_owner ON documents(owner_id);

CREATE TABLE IF NOT EXISTS document_shares (
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN ('viewer', 'editor')),
  created_at  TEXT NOT NULL,
  PRIMARY KEY (document_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_shares_user ON document_shares(user_id);
`;

/**
 * Connects to SQLite through libSQL and applies the schema.
 * `url` is a local file ("file:data/docs.db"), ":memory:" for tests, or a hosted
 * Turso database ("libsql://…", with `authToken`) in production.
 */
export async function openDb(url: string, authToken?: string): Promise<DB> {
  const db = createClient({ url, authToken });
  await db.executeMultiple(SCHEMA);
  return db;
}

/**
 * Hosted database settings from the environment. Accepts our own names (TURSO_DATABASE_URL /
 * TURSO_AUTH_TOKEN) and the names the Vercel Turso integration creates with prefix "TURSO"
 * (TURSO_URL / TURSO_AUTH_TOKEN). Returns undefined when no hosted database is configured.
 */
export function hostedDbFromEnv(env = process.env): { url: string; authToken?: string } | undefined {
  const url = env.TURSO_DATABASE_URL ?? env.TURSO_URL;
  if (!url) return undefined;
  return { url, authToken: env.TURSO_AUTH_TOKEN ?? env.TURSO_DATABASE_AUTH_TOKEN ?? env.TURSO_TOKEN };
}

export async function all<T>(db: DB, sql: string, args: InArgs = []): Promise<T[]> {
  return (await db.execute({ sql, args })).rows as unknown as T[];
}

export async function get<T>(db: DB, sql: string, args: InArgs = []): Promise<T | undefined> {
  return (await all<T>(db, sql, args))[0];
}

export async function run(db: DB, sql: string, args: InArgs = []) {
  const rs = await db.execute({ sql, args });
  return { changes: rs.rowsAffected, lastInsertRowid: Number(rs.lastInsertRowid) };
}

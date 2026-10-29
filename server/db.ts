import Database from "better-sqlite3";

export type DB = Database.Database;

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

/** Opens (or creates) the SQLite database and applies the schema. Use ":memory:" in tests. */
export function openDb(file: string): DB {
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  return db;
}

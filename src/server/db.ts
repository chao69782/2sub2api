import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'

const schema = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;

CREATE TABLE IF NOT EXISTS secret_blobs (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  ciphertext BLOB NOT NULL,
  nonce BLOB NOT NULL,
  auth_tag BLOB NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS managed_accounts (
  id TEXT PRIMARY KEY,
  email_normalized TEXT NOT NULL,
  email_display TEXT NOT NULL,
  desired_remote_name TEXT,
  password_secret_id TEXT,
  totp_secret_id TEXT,
  notes TEXT NOT NULL DEFAULT '',
  tags_json TEXT NOT NULL DEFAULT '[]',
  auth_policy TEXT NOT NULL DEFAULT 'managed_login',
  auth_status TEXT NOT NULL DEFAULT 'not_authorized',
  health_status TEXT NOT NULL DEFAULT 'unknown',
  sync_status TEXT NOT NULL DEFAULT 'not_synced',
  selected_proxy_id INTEGER,
  token_expires_at TEXT,
  last_auth_at TEXT,
  last_refresh_at TEXT,
  last_check_at TEXT,
  next_check_at TEXT,
  last_error_code TEXT,
  last_error_summary TEXT,
  import_profile_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  FOREIGN KEY(password_secret_id) REFERENCES secret_blobs(id),
  FOREIGN KEY(totp_secret_id) REFERENCES secret_blobs(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS managed_accounts_email_active
  ON managed_accounts(email_normalized) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS sub2api_links (
  account_id TEXT PRIMARY KEY,
  remote_account_id INTEGER NOT NULL UNIQUE,
  remote_name TEXT NOT NULL DEFAULT '',
  last_snapshot_json TEXT NOT NULL DEFAULT '{}',
  last_synced_at TEXT NOT NULL,
  FOREIGN KEY(account_id) REFERENCES managed_accounts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS oauth_sessions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  sub2api_session_id TEXT NOT NULL,
  state TEXT NOT NULL UNIQUE,
  proxy_id INTEGER,
  auth_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  consumed_at TEXT,
  FOREIGN KEY(account_id) REFERENCES managed_accounts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  account_id TEXT,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  run_after TEXT NOT NULL,
  locked_by TEXT,
  locked_until TEXT,
  error_code TEXT,
  error_summary TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  finished_at TEXT,
  FOREIGN KEY(account_id) REFERENCES managed_accounts(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS jobs_due ON jobs(status, run_after);

CREATE TABLE IF NOT EXISTS health_checks (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  status TEXT NOT NULL,
  latency_ms INTEGER,
  error_code TEXT,
  summary TEXT NOT NULL DEFAULT '',
  checked_at TEXT NOT NULL,
  FOREIGN KEY(account_id) REFERENCES managed_accounts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS audit_events (
  id TEXT PRIMARY KEY,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  account_id TEXT,
  result TEXT NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}',
  source_ip TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_runtime_state (
  username TEXT PRIMARY KEY,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  session_version INTEGER NOT NULL DEFAULT 1,
  last_login_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  csrf_token TEXT NOT NULL,
  session_version INTEGER NOT NULL,
  source_ip TEXT,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
`

export function openDatabase(dataDir: string): Database.Database {
  fs.mkdirSync(dataDir, { recursive: true })
  const db = new Database(path.join(dataDir, 'workbench.db'))
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')
  db.exec(schema)
  const accountColumns = new Set(
    (db.pragma('table_info(managed_accounts)') as Array<{ name: string }>).map((column) => column.name)
  )
  if (!accountColumns.has('desired_remote_name')) {
    db.exec('ALTER TABLE managed_accounts ADD COLUMN desired_remote_name TEXT')
  }
  const purgeLegacySoftDeletes = db.transaction(() => {
    const rows = db.prepare(`
      SELECT password_secret_id, totp_secret_id
      FROM managed_accounts WHERE deleted_at IS NOT NULL
    `).all() as Array<{ password_secret_id: string | null; totp_secret_id: string | null }>
    if (!rows.length) return
    db.prepare('DELETE FROM managed_accounts WHERE deleted_at IS NOT NULL').run()
    for (const row of rows) {
      for (const secretId of [row.password_secret_id, row.totp_secret_id]) {
        if (!secretId) continue
        db.prepare(`
          DELETE FROM secret_blobs
          WHERE id = ? AND NOT EXISTS (
            SELECT 1 FROM managed_accounts
            WHERE password_secret_id = ? OR totp_secret_id = ?
          )
        `).run(secretId, secretId, secretId)
      }
    }
  })
  purgeLegacySoftDeletes()
  db.exec(`
    UPDATE managed_accounts
    SET desired_remote_name = (
      SELECT json_extract(j.payload_json, '$.accountName')
      FROM jobs j
      WHERE j.account_id = managed_accounts.id AND j.type = 'authorize'
      ORDER BY j.created_at DESC LIMIT 1
    )
    WHERE desired_remote_name IS NULL AND EXISTS (
      SELECT 1 FROM jobs j
      WHERE j.account_id = managed_accounts.id AND j.type = 'authorize'
        AND json_extract(j.payload_json, '$.accountName') IS NOT NULL
    )
  `)
  db.prepare(`
    UPDATE jobs SET error_code = 'OPENAI_SECURITY_CHALLENGE',
      error_summary = 'OpenAI 登录触发 Cloudflare 安全验证（HTTP 403），自动授权无法继续'
    WHERE error_code = 'MANUAL_ACTION_REQUIRED' AND error_summary = '检测到验证码或安全检查'
  `).run()
  db.prepare(`
    UPDATE managed_accounts SET last_error_code = 'OPENAI_SECURITY_CHALLENGE',
      last_error_summary = 'OpenAI 登录触发 Cloudflare 安全验证（HTTP 403），自动授权无法继续'
    WHERE last_error_code = 'MANUAL_ACTION_REQUIRED' AND last_error_summary = '检测到验证码或安全检查'
  `).run()
  db.prepare("UPDATE managed_accounts SET auth_policy = 'managed_login' WHERE auth_policy <> 'managed_login'").run()
  return db
}

export type WorkbenchDatabase = Database.Database

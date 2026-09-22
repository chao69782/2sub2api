import crypto from 'node:crypto'
import type { AccountImportOverrides, AuthorizationJobStatus, ManagedAccount, RuntimeSettings } from '../shared/types.js'
import type { WorkbenchDatabase } from './db.js'
import { SecretCipher } from './crypto.js'

const now = () => new Date().toISOString()
const id = () => crypto.randomUUID()

interface AccountRow {
  id: string
  email_display: string
  desired_remote_name: string | null
  notes: string
  tags_json: string
  auth_status: ManagedAccount['authStatus']
  health_status: ManagedAccount['healthStatus']
  sync_status: ManagedAccount['syncStatus']
  remote_account_id: number | null
  remote_name: string | null
  selected_proxy_id: number | null
  token_expires_at: string | null
  last_auth_at: string | null
  last_refresh_at: string | null
  last_check_at: string | null
  next_check_at: string | null
  last_error_code: string | null
  last_error_summary: string | null
  import_overrides_json: string | null
  authorization_job_status: AuthorizationJobStatus | null
  authorization_error_code: string | null
  authorization_error_summary: string | null
  authorization_updated_at: string | null
  authorization_finished_at: string | null
  auto_reauthorization_count: number
  last_snapshot_json: string
  import_profile_version: number
  created_at: string
  updated_at: string
}

function mapAccount(row: AccountRow): ManagedAccount {
  let usage: { five_hour?: { utilization?: number }; seven_day?: { utilization?: number } } = {}
  let importOverrides: AccountImportOverrides | null = null
  try { usage = JSON.parse(row.last_snapshot_json || '{}') as typeof usage } catch { /* ignore malformed snapshots */ }
  try {
    const parsed = row.import_overrides_json ? JSON.parse(row.import_overrides_json) as unknown : null
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) importOverrides = parsed as AccountImportOverrides
  } catch { /* ignore malformed per-account settings */ }
  return {
    id: row.id,
    email: row.email_display,
    notes: row.notes,
    tags: JSON.parse(row.tags_json),
    authStatus: row.auth_status,
    healthStatus: row.health_status,
    syncStatus: row.sync_status,
    sub2apiAccountId: row.remote_account_id,
    sub2apiAccountName: row.remote_name || row.desired_remote_name || null,
    selectedProxyId: row.selected_proxy_id,
    tokenExpiresAt: row.token_expires_at,
    lastAuthAt: row.last_auth_at,
    lastRefreshAt: row.last_refresh_at,
    lastCheckAt: row.last_check_at,
    nextCheckAt: row.next_check_at,
    lastErrorCode: row.last_error_code,
    lastErrorSummary: row.last_error_summary,
    lastAuthorizationStatus: row.authorization_job_status,
    lastAuthorizationErrorCode: row.authorization_error_code,
    lastAuthorizationErrorSummary: row.authorization_error_summary,
    lastAuthorizationAt: row.authorization_finished_at ?? row.authorization_updated_at,
    autoReauthorizationCount: Number(row.auto_reauthorization_count ?? 0),
    usageFiveHourPercent: typeof usage.five_hour?.utilization === 'number' ? usage.five_hour.utilization : null,
    usageSevenDayPercent: typeof usage.seven_day?.utilization === 'number' ? usage.seven_day.utilization : null,
    importOverrides,
    importProfileVersion: row.import_profile_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

const accountSelect = `
SELECT a.*, l.remote_account_id, l.remote_name,
  j.status AS authorization_job_status,
  j.error_code AS authorization_error_code,
  j.error_summary AS authorization_error_summary,
  j.updated_at AS authorization_updated_at,
  j.finished_at AS authorization_finished_at
  ,(SELECT COUNT(*) FROM jobs attempts WHERE attempts.account_id = a.id AND attempts.type = 'authorize') AS auto_reauthorization_count
  ,COALESCE(l.last_snapshot_json, '{}') AS last_snapshot_json
FROM managed_accounts a
LEFT JOIN sub2api_links l ON l.account_id = a.id
LEFT JOIN jobs j ON j.id = (
  SELECT latest.id FROM jobs latest
  WHERE latest.account_id = a.id AND latest.type = 'authorize'
  ORDER BY latest.created_at DESC LIMIT 1
)
`

export class AccountRepository {
  constructor(private readonly db: WorkbenchDatabase, private readonly cipher: SecretCipher) {}

  list(search = ''): ManagedAccount[] {
    const query = search.trim()
      ? `${accountSelect} WHERE a.deleted_at IS NULL AND a.email_display LIKE ? ORDER BY a.created_at DESC`
      : `${accountSelect} WHERE a.deleted_at IS NULL ORDER BY a.created_at DESC`
    const rows = query.includes('LIKE')
      ? this.db.prepare(query).all(`%${search.trim()}%`)
      : this.db.prepare(query).all()
    return (rows as AccountRow[]).map(mapAccount)
  }

  get(accountId: string): ManagedAccount | null {
    const row = this.db.prepare(`${accountSelect} WHERE a.id = ? AND a.deleted_at IS NULL`).get(accountId) as AccountRow | undefined
    return row ? mapAccount(row) : null
  }

  existsByEmail(email: string): boolean {
    return Boolean(this.db.prepare('SELECT 1 FROM managed_accounts WHERE email_normalized = ? AND deleted_at IS NULL').get(email.trim().toLowerCase()))
  }

  create(input: { email: string; password: string; totpSecret: string; notes?: string; importProfileVersion?: number }): ManagedAccount {
    const created = now()
    const accountId = id()
    const passwordId = this.insertSecret('openai_password', input.password)
    const totpId = this.insertSecret('openai_totp', input.totpSecret)
    const transaction = this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO managed_accounts (
          id, email_normalized, email_display, password_secret_id, totp_secret_id,
          notes, auth_policy, import_profile_version, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'managed_login', ?, ?, ?)
      `).run(
        accountId,
        input.email.trim().toLowerCase(),
        input.email.trim(),
        passwordId,
        totpId,
        input.notes ?? '',
        input.importProfileVersion ?? 1,
        created,
        created
      )
    })
    try {
      transaction()
    } catch (error) {
      this.db.prepare('DELETE FROM secret_blobs WHERE id IN (?, ?)').run(passwordId, totpId)
      throw error
    }
    return this.get(accountId)!
  }

  update(accountId: string, input: { email?: string; password?: string; totpSecret?: string; notes?: string; importOverrides?: AccountImportOverrides | null }): ManagedAccount {
    const current = this.db.prepare('SELECT * FROM managed_accounts WHERE id = ? AND deleted_at IS NULL').get(accountId) as Record<string, unknown> | undefined
    if (!current) throw new Error('ACCOUNT_NOT_FOUND')
    const updates: string[] = []
    const values: unknown[] = []
    if (input.email !== undefined) {
      updates.push('email_normalized = ?', 'email_display = ?')
      values.push(input.email.trim().toLowerCase(), input.email.trim())
    }
    if (input.notes !== undefined) { updates.push('notes = ?'); values.push(input.notes) }
    if (input.importOverrides !== undefined) {
      updates.push('import_overrides_json = ?')
      values.push(input.importOverrides === null ? null : JSON.stringify(input.importOverrides))
    }
    if (input.password) {
      const secretId = String(current.password_secret_id ?? '')
      if (secretId) this.updateSecret(secretId, input.password)
      else { updates.push('password_secret_id = ?'); values.push(this.insertSecret('openai_password', input.password)) }
    }
    if (input.totpSecret) {
      const secretId = String(current.totp_secret_id ?? '')
      if (secretId) this.updateSecret(secretId, input.totpSecret)
      else { updates.push('totp_secret_id = ?'); values.push(this.insertSecret('openai_totp', input.totpSecret)) }
    }
    if (updates.length) {
      updates.push('updated_at = ?')
      values.push(now(), accountId)
      this.db.prepare(`UPDATE managed_accounts SET ${updates.join(', ')} WHERE id = ?`).run(...values)
    }
    return this.get(accountId)!
  }

  hardDelete(accountId: string): void {
    const transaction = this.db.transaction(() => {
      const row = this.db.prepare(`
        SELECT password_secret_id, totp_secret_id FROM managed_accounts WHERE id = ?
      `).get(accountId) as { password_secret_id: string | null; totp_secret_id: string | null } | undefined
      if (!row) throw new Error('ACCOUNT_NOT_FOUND')

      this.db.prepare('DELETE FROM managed_accounts WHERE id = ?').run(accountId)
      const secretIds = [row.password_secret_id, row.totp_secret_id].filter((value): value is string => Boolean(value))
      for (const secretId of secretIds) {
        this.db.prepare(`
          DELETE FROM secret_blobs
          WHERE id = ? AND NOT EXISTS (
            SELECT 1 FROM managed_accounts
            WHERE password_secret_id = ? OR totp_secret_id = ?
          )
        `).run(secretId, secretId, secretId)
      }
    })
    transaction()
  }

  getSecrets(accountId: string): { password: string; totpSecret: string } {
    const row = this.db.prepare(`
      SELECT password_secret_id, totp_secret_id FROM managed_accounts WHERE id = ? AND deleted_at IS NULL
    `).get(accountId) as { password_secret_id: string | null; totp_secret_id: string | null } | undefined
    if (!row?.password_secret_id || !row.totp_secret_id) throw new Error('ACCOUNT_SECRETS_MISSING')
    return { password: this.readSecret(row.password_secret_id), totpSecret: this.readSecret(row.totp_secret_id) }
  }

  setOAuthPending(accountId: string, proxyId: number | null): void {
    this.db.prepare(`UPDATE managed_accounts SET auth_status = 'authorizing', selected_proxy_id = ?, updated_at = ? WHERE id = ?`).run(proxyId, now(), accountId)
  }

  setDesiredRemoteName(accountId: string, accountName: string): void {
    this.db.prepare('UPDATE managed_accounts SET desired_remote_name = ?, updated_at = ? WHERE id = ?')
      .run(accountName.trim(), now(), accountId)
  }

  linkRemote(accountId: string, remote: { id: number; name?: string; expiresAt?: string | null }, proxyId: number | null): void {
    const timestamp = now()
    const transaction = this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO sub2api_links(account_id, remote_account_id, remote_name, last_snapshot_json, last_synced_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(account_id) DO UPDATE SET
          remote_account_id = excluded.remote_account_id,
          remote_name = excluded.remote_name,
          last_snapshot_json = excluded.last_snapshot_json,
          last_synced_at = excluded.last_synced_at
      `).run(accountId, remote.id, remote.name ?? '', JSON.stringify(remote), timestamp)
      this.db.prepare(`
        UPDATE managed_accounts SET auth_status = 'authorized', health_status = 'unknown', sync_status = 'synced',
          selected_proxy_id = ?, token_expires_at = ?, last_auth_at = ?, updated_at = ?, last_error_code = NULL,
          last_error_summary = NULL WHERE id = ?
      `).run(proxyId, remote.expiresAt ?? null, timestamp, timestamp, accountId)
    })
    transaction()
  }

  syncRemote(accountId: string, remote: { id: number; name?: string; expiresAt?: string | null; status?: string; schedulable?: boolean; five_hour?: unknown; seven_day?: unknown }): void {
    const timestamp = now()
    const transaction = this.db.transaction(() => {
      const previous = this.db.prepare('SELECT last_snapshot_json FROM sub2api_links WHERE account_id = ? AND remote_account_id = ?').get(accountId, remote.id) as { last_snapshot_json?: string } | undefined
      let snapshot: Record<string, unknown> = {}
      try { snapshot = JSON.parse(previous?.last_snapshot_json || '{}') as Record<string, unknown> } catch { /* replace malformed snapshot */ }
      snapshot = { ...snapshot, ...remote }
      this.db.prepare(`
        UPDATE sub2api_links SET remote_name = ?, last_snapshot_json = ?, last_synced_at = ?
        WHERE account_id = ? AND remote_account_id = ?
      `).run(remote.name ?? '', JSON.stringify(snapshot), timestamp, accountId, remote.id)
      this.db.prepare(`
        UPDATE managed_accounts SET sync_status = 'synced', token_expires_at = COALESCE(?, token_expires_at),
          updated_at = ? WHERE id = ?
      `).run(remote.expiresAt ?? null, timestamp, accountId)
    })
    transaction()
  }

  markHealth(accountId: string, input: { status: ManagedAccount['healthStatus']; errorCode?: string | null; summary?: string | null; checkedAt?: string }): void {
    const checkedAt = input.checkedAt ?? now()
    this.db.prepare(`
      UPDATE managed_accounts SET health_status = ?, last_check_at = ?, last_error_code = ?,
        last_error_summary = ?, updated_at = ? WHERE id = ?
    `).run(input.status, checkedAt, input.errorCode ?? null, input.summary ?? null, checkedAt, accountId)
  }

  markRefresh(accountId: string, success: boolean, errorCode?: string, summary?: string): void {
    const timestamp = now()
    this.db.prepare(`
      UPDATE managed_accounts SET auth_status = ?, last_refresh_at = ?, last_error_code = ?,
        last_error_summary = ?, updated_at = ? WHERE id = ?
    `).run(success ? 'authorized' : 'reauth_required', success ? timestamp : null, errorCode ?? null, summary ?? null, timestamp, accountId)
  }

  markAuthorizationFailure(accountId: string, manualAction: boolean, errorCode: string, summary: string): void {
    this.db.prepare(`
      UPDATE managed_accounts SET auth_status = ?, last_error_code = ?, last_error_summary = ?, updated_at = ?
      WHERE id = ?
    `).run(manualAction ? 'manual_action_required' : 'reauth_required', errorCode, summary, now(), accountId)
  }

  setNextCheck(accountId: string, nextCheckAt: string | null): void {
    this.db.prepare('UPDATE managed_accounts SET next_check_at = ?, updated_at = ? WHERE id = ?').run(nextCheckAt, now(), accountId)
  }

  setSyncStatus(accountId: string, status: ManagedAccount['syncStatus']): void {
    this.db.prepare('UPDATE managed_accounts SET sync_status = ?, updated_at = ? WHERE id = ?').run(status, now(), accountId)
  }

  createOAuthSession(input: { accountId: string; sub2apiSessionId: string; state: string; proxyId: number | null; authUrl: string }): string {
    const sessionId = id()
    const created = new Date()
    const expires = new Date(created.getTime() + 10 * 60_000)
    this.db.prepare(`
      INSERT INTO oauth_sessions(id, account_id, sub2api_session_id, state, proxy_id, auth_url, expires_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(sessionId, input.accountId, input.sub2apiSessionId, input.state, input.proxyId, input.authUrl, expires.toISOString(), created.toISOString())
    return sessionId
  }

  getOAuthSession(accountId: string, state: string): Record<string, unknown> | null {
    return (this.db.prepare(`
      SELECT * FROM oauth_sessions WHERE account_id = ? AND state = ? AND status = 'pending' AND expires_at > ?
    `).get(accountId, state, now()) as Record<string, unknown> | undefined) ?? null
  }

  consumeOAuthSession(sessionId: string): void {
    this.db.prepare("UPDATE oauth_sessions SET status = 'consumed', consumed_at = ? WHERE id = ?").run(now(), sessionId)
  }

  private insertSecret(kind: string, plain: string): string {
    const secretId = id()
    const encrypted = this.cipher.encrypt(plain)
    const timestamp = now()
    this.db.prepare(`INSERT INTO secret_blobs(id, kind, ciphertext, nonce, auth_tag, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(secretId, kind, encrypted.ciphertext, encrypted.nonce, encrypted.authTag, timestamp, timestamp)
    return secretId
  }

  private updateSecret(secretId: string, plain: string): void {
    const encrypted = this.cipher.encrypt(plain)
    this.db.prepare('UPDATE secret_blobs SET ciphertext = ?, nonce = ?, auth_tag = ?, updated_at = ? WHERE id = ?')
      .run(encrypted.ciphertext, encrypted.nonce, encrypted.authTag, now(), secretId)
  }

  private readSecret(secretId: string): string {
    const row = this.db.prepare('SELECT ciphertext, nonce, auth_tag FROM secret_blobs WHERE id = ?').get(secretId) as {
      ciphertext: Buffer; nonce: Buffer; auth_tag: Buffer
    } | undefined
    if (!row) throw new Error('SECRET_NOT_FOUND')
    return this.cipher.decrypt({ ciphertext: row.ciphertext, nonce: row.nonce, authTag: row.auth_tag })
  }
}

export type JobType = 'authorize' | 'refresh' | 'health_test'
export type JobStatus = 'pending' | 'running' | 'completed' | 'failed'

export interface WorkbenchJob {
  id: string
  accountId: string | null
  type: JobType
  status: JobStatus
  payload: Record<string, unknown>
  attempts: number
  maxAttempts: number
  runAfter: string
  errorCode: string | null
  errorSummary: string | null
  createdAt: string
  updatedAt: string
}

interface JobRow {
  id: string
  account_id: string | null
  type: JobType
  status: JobStatus
  payload_json: string
  attempts: number
  max_attempts: number
  run_after: string
  error_code: string | null
  error_summary: string | null
  created_at: string
  updated_at: string
}

function mapJob(row: JobRow): WorkbenchJob {
  return {
    id: row.id,
    accountId: row.account_id,
    type: row.type,
    status: row.status,
    payload: JSON.parse(row.payload_json),
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    runAfter: row.run_after,
    errorCode: row.error_code,
    errorSummary: row.error_summary,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export class JobRepository {
  constructor(private readonly db: WorkbenchDatabase) {}

  enqueue(input: { accountId: string; type: JobType; payload?: Record<string, unknown>; runAfter?: string; maxAttempts?: number }): WorkbenchJob {
    const existing = this.db.prepare(`
      SELECT * FROM jobs WHERE account_id = ? AND type = ? AND status IN ('pending', 'running')
      ORDER BY created_at DESC LIMIT 1
    `).get(input.accountId, input.type) as JobRow | undefined
    if (existing) return mapJob(existing)

    const timestamp = now()
    const jobId = id()
    this.db.prepare(`
      INSERT INTO jobs(id, account_id, type, status, payload_json, max_attempts, run_after, created_at, updated_at)
      VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?)
    `).run(jobId, input.accountId, input.type, JSON.stringify(input.payload ?? {}), input.maxAttempts ?? 3, input.runAfter ?? timestamp, timestamp, timestamp)
    return this.get(jobId)!
  }

  get(jobId: string): WorkbenchJob | null {
    const row = this.db.prepare('SELECT * FROM jobs WHERE id = ?').get(jobId) as JobRow | undefined
    return row ? mapJob(row) : null
  }

  releaseLocks(): void {
    const timestamp = now()
    this.db.prepare(`
      UPDATE jobs SET status = 'pending', locked_by = NULL, locked_until = NULL, updated_at = ?
      WHERE status = 'running'
    `).run(timestamp)
  }

  claimNext(workerId: string, lockSeconds = 300): WorkbenchJob | null {
    const claim = this.db.transaction(() => {
      const timestamp = now()
      this.db.prepare(`
        UPDATE jobs SET status = 'pending', locked_by = NULL, locked_until = NULL, updated_at = ?
        WHERE status = 'running' AND locked_until IS NOT NULL AND locked_until <= ?
      `).run(timestamp, timestamp)
      const row = this.db.prepare(`
        SELECT * FROM jobs WHERE status = 'pending' AND run_after <= ? ORDER BY run_after, created_at LIMIT 1
      `).get(timestamp) as JobRow | undefined
      if (!row) return null
      const lockedUntil = new Date(Date.now() + lockSeconds * 1000).toISOString()
      const changed = this.db.prepare(`
        UPDATE jobs SET status = 'running', attempts = attempts + 1, locked_by = ?, locked_until = ?, updated_at = ?
        WHERE id = ? AND status = 'pending'
      `).run(workerId, lockedUntil, timestamp, row.id)
      return changed.changes ? this.get(row.id) : null
    })
    return claim()
  }

  complete(jobId: string): void {
    const timestamp = now()
    this.db.prepare(`
      UPDATE jobs SET status = 'completed', locked_by = NULL, locked_until = NULL, finished_at = ?, updated_at = ?
      WHERE id = ?
    `).run(timestamp, timestamp, jobId)
  }

  fail(job: WorkbenchJob, errorCode: string, errorSummary: string, retryAfter?: string): void {
    const timestamp = now()
    const shouldRetry = job.attempts < job.maxAttempts && Boolean(retryAfter)
    this.db.prepare(`
      UPDATE jobs SET status = ?, run_after = ?, locked_by = NULL, locked_until = NULL,
        error_code = ?, error_summary = ?, finished_at = ?, updated_at = ? WHERE id = ?
    `).run(
      shouldRetry ? 'pending' : 'failed',
      shouldRetry ? retryAfter! : job.runAfter,
      errorCode,
      errorSummary.slice(0, 500),
      shouldRetry ? null : timestamp,
      timestamp,
      job.id
    )
  }
}

export class SettingsRepository {
  constructor(private readonly db: WorkbenchDatabase, private readonly defaults: RuntimeSettings) {}

  get(): { value: RuntimeSettings; version: number } {
    const row = this.db.prepare("SELECT value_json, version FROM app_settings WHERE key = 'runtime'").get() as { value_json: string; version: number } | undefined
    if (!row) return { value: structuredClone(this.defaults), version: 1 }
    const saved = JSON.parse(row.value_json) as Partial<RuntimeSettings>
    const scheduler = {
      checkIntervalMinutes: saved.scheduler?.checkIntervalMinutes ?? this.defaults.scheduler.checkIntervalMinutes
    }
    const importDefaults = { ...this.defaults.importDefaults, ...saved.importDefaults }
    delete (importDefaults as Record<string, unknown>).accountNameTemplate
    delete (importDefaults as Record<string, unknown>).notesTemplate
    delete (importDefaults as Record<string, unknown>).rateMultiplier
    return {
      value: {
        scheduler,
        importDefaults
      },
      version: row.version
    }
  }

  save(value: RuntimeSettings): { value: RuntimeSettings; version: number } {
    const current = this.get()
    const version = current.version + 1
    this.db.prepare(`
      INSERT INTO app_settings(key, value_json, version, updated_at) VALUES ('runtime', ?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, version = excluded.version, updated_at = excluded.updated_at
    `).run(JSON.stringify(value), version, now())
    return { value, version }
  }
}

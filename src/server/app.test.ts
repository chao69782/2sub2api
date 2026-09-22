import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { AppConfig } from './config.js'
import { openDatabase, type WorkbenchDatabase } from './db.js'
import { buildApp, buildModelRestrictionMapping, buildSub2apiCredentialsUpdate, buildSub2apiEmailCredentialUpdate } from './app.js'

const cleanup: Array<() => Promise<void> | void> = []
afterEach(async () => {
  while (cleanup.length) await cleanup.pop()?.()
})

function config(directory: string): AppConfig {
  return {
    configPath: 'test', dataDir: directory, adminPassword: 'test-password', masterKey: Buffer.alloc(32, 4),
    sessionSecret: 'a-session-cookie-secret-longer-than-32-characters', sub2apiAdminKey: 'admin-key',
    server: { host: '127.0.0.1', port: 1000, trust_proxy: false, cookie_secure: false },
    auth: { username: 'admin', password_file: 'test', session_idle_minutes: 30, session_absolute_hours: 12, max_failed_attempts: 5, lockout_minutes: 15 },
    security: { master_key_file: 'test', session_secret_file: 'test' },
    sub2api: { base_url: 'http://127.0.0.1:9/api/v1', admin_key_file: 'test', request_timeout_seconds: 3 },
    scheduler: { check_interval_minutes: 5 },
    import_defaults: { model_whitelist: [], model_mapping: {}, concurrency: 3, priority: 50, group_ids: [], load_factor: null, auto_pause_on_expired: true, proxy_policy: 'auto', fixed_proxy_id: null }
  }
}

describe('model restrictions', () => {
  it('keeps whitelist IDs as identity mappings and lets explicit mappings override them', () => {
    expect(buildModelRestrictionMapping(
      ['gpt-5.4', 'o3'],
      { 'gpt-5.4': 'gpt-5.4-codex', 'client-alias': 'gpt-5.4' }
    )).toEqual({
      'gpt-5.4': 'gpt-5.4-codex',
      o3: 'o3',
      'client-alias': 'gpt-5.4'
    })
  })

  it('keeps OAuth account metadata when applying model restrictions', () => {
    expect(buildSub2apiCredentialsUpdate({
      email: 'stale@example.com',
      chatgpt_account_id: 'account-123',
      plan_type: 'plus',
      subscription_expires_at: '2027-01-01T00:00:00Z'
    }, 'Owner@Example.com', { 'gpt-5.4': 'gpt-5.4' })).toEqual({
      email: 'owner@example.com',
      chatgpt_account_id: 'account-123',
      plan_type: 'plus',
      subscription_expires_at: '2027-01-01T00:00:00Z',
      model_mapping: { 'gpt-5.4': 'gpt-5.4' }
    })
  })

  it('backfills an account email without dropping other credential metadata', () => {
    expect(buildSub2apiEmailCredentialUpdate({
      chatgpt_account_id: 'account-123',
      model_mapping: { 'gpt-5.4': 'gpt-5.4' }
    }, 'Owner@Example.com')).toEqual({
      email: 'owner@example.com',
      chatgpt_account_id: 'account-123',
      model_mapping: { 'gpt-5.4': 'gpt-5.4' }
    })
  })
})

describe('administrator session protection', () => {
  it('requires a signed session and CSRF token for writes', async () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'auth-workbench-app-'))
    const db: WorkbenchDatabase = openDatabase(directory)
    db.prepare("INSERT INTO app_settings(key, value_json, version, updated_at) VALUES ('runtime', ?, 3, ?)")
      .run(JSON.stringify({ importDefaults: { accountNameTemplate: '{email}', notesTemplate: 'legacy', rateMultiplier: 2 } }), new Date().toISOString())
    const app = await buildApp(config(directory), db)
    cleanup.push(async () => {
      await app.close()
      db.close()
      fs.rmSync(directory, { recursive: true, force: true })
    })

    const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'admin', password: 'test-password' } })
    expect(login.statusCode).toBe(200)
    const body = login.json<{ csrfToken: string }>()
    const setCookie = login.headers['set-cookie']
    const cookie = (Array.isArray(setCookie) ? setCookie[0] : setCookie)?.split(';')[0]
    expect(cookie).toContain('workbench_session=')

    const runtimeSettings = await app.inject({ method: 'GET', url: '/api/settings', headers: { cookie: cookie! } })
    expect(runtimeSettings.statusCode).toBe(200)
    expect(runtimeSettings.json().version).toBe(3)
    expect(runtimeSettings.json().value.importDefaults.modelWhitelist).toEqual([])
    expect(runtimeSettings.json().value.importDefaults).not.toHaveProperty('accountNameTemplate')
    expect(runtimeSettings.json().value.importDefaults).not.toHaveProperty('notesTemplate')
    expect(runtimeSettings.json().value.importDefaults).not.toHaveProperty('rateMultiplier')

    const rejected = await app.inject({ method: 'POST', url: '/api/accounts/import/preview', headers: { cookie: cookie! }, payload: { text: 'a@example.com--password--JBSWY3DPEHPK3PXP' } })
    expect(rejected.statusCode).toBe(403)

    const accepted = await app.inject({ method: 'POST', url: '/api/accounts/import/preview', headers: { cookie: cookie!, 'x-csrf-token': body.csrfToken }, payload: { text: 'a@example.com--password--JBSWY3DPEHPK3PXP' } })
    expect(accepted.statusCode).toBe(200)
    expect(accepted.json().validCount).toBe(1)

    const imported = await app.inject({ method: 'POST', url: '/api/accounts/import', headers: { cookie: cookie!, 'x-csrf-token': body.csrfToken }, payload: { text: 'a@example.com--password--JBSWY3DPEHPK3PXP' } })
    expect(imported.statusCode).toBe(201)
    const accountId = imported.json().created[0].id as string
    const queued = await app.inject({ method: 'POST', url: `/api/accounts/${accountId}/authorize/auto`, headers: { cookie: cookie!, 'x-csrf-token': body.csrfToken }, payload: { accountName: 'Primary OpenAI' } })
    expect(queued.statusCode).toBe(202)
    expect(queued.json().job.payload).toEqual({ accountName: 'Primary OpenAI', automatic: false })
    expect(db.prepare('SELECT auth_status FROM managed_accounts WHERE id = ?').get(accountId)).toEqual({ auth_status: 'authorizing' })
    const listed = await app.inject({ method: 'GET', url: '/api/accounts', headers: { cookie: cookie! } })
    expect(listed.statusCode).toBe(200)
    expect(listed.json().items[0].sub2apiAccountName).toBe('Primary OpenAI')
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AppConfig } from './config.js'
import { Sub2APIClient, Sub2APIError } from './sub2api.js'

function config(): AppConfig {
  return {
    configPath: 'test', dataDir: 'test', adminPassword: 'test', masterKey: Buffer.alloc(32),
    sessionSecret: 'session', sub2apiAdminKey: 'admin-key',
    server: { host: '127.0.0.1', port: 1000, trust_proxy: false, cookie_secure: false },
    auth: { username: 'admin', password_file: 'test', session_idle_minutes: 30, session_absolute_hours: 12, max_failed_attempts: 5, lockout_minutes: 15 },
    security: { master_key_file: 'test', session_secret_file: 'test' },
    sub2api: { base_url: 'http://sub2api.test/api/v1', admin_key_file: 'test', request_timeout_seconds: 3 },
    scheduler: { check_interval_minutes: 5 },
    import_defaults: { model_whitelist: [], model_mapping: {}, concurrency: 3, priority: 50, group_ids: [], load_factor: null, auto_pause_on_expired: true, proxy_policy: 'auto', fixed_proxy_id: null }
  }
}

function response(data: unknown): Response {
  return new Response(JSON.stringify({ code: 0, message: 'ok', data }), { status: 200, headers: { 'content-type': 'application/json' } })
}

afterEach(() => vi.unstubAllGlobals())

describe('Sub2API proxy selection', () => {
  it('prefers least-used available proxy and then lowest latency', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response([
      { id: 1, name: 'busy', status: 'active', account_count: 8, latency_ms: 20 },
      { id: 2, name: 'slow', status: 'active', account_count: 1, latency_ms: 200 },
      { id: 3, name: 'fast', status: 'active', account_count: 1, latency_ms: 40 },
      { id: 4, name: 'failed', status: 'active', account_count: 0, latency_status: 'failed' },
      { id: 5, name: 'inactive', status: 'inactive', account_count: 0, latency_ms: 1 }
    ])))
    await expect(new Sub2APIClient(config()).selectProxy('auto', null)).resolves.toMatchObject({ id: 3 })
  })

  it('uses direct mode when the available proxy list is empty', async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      if (init?.method === 'POST') return response({ auth_url: 'https://auth.openai.com/test?state=x', session_id: 'session' })
      return response([])
    })
    vi.stubGlobal('fetch', fetchMock)
    const client = new Sub2APIClient(config())
    await expect(client.selectProxy('auto', null)).resolves.toBeNull()
    await client.generateOpenAIAuthUrl(null)
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({})
  })

  it('rejects an unavailable fixed proxy', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response([])))
    await expect(new Sub2APIClient(config()).selectProxy('fixed', 99)).rejects.toBeInstanceOf(Sub2APIError)
  })
})

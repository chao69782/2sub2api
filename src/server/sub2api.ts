import type { AppConfig } from './config.js'

interface Envelope<T> {
  code: number
  message: string
  reason?: string
  data: T
}

export interface Sub2APIProxy {
  id: number
  name: string
  protocol?: string
  host?: string
  port?: number
  username?: string | null
  password?: string | null
  status: 'active' | 'inactive' | 'expired'
  account_count?: number
  latency_ms?: number
  latency_status?: 'success' | 'failed'
  quality_status?: 'healthy' | 'warn' | 'challenge' | 'failed'
  expires_at?: string | null
}

export interface Sub2APIGroup {
  id: number
  name: string
  platform: string
  status?: string
}

export interface Sub2APIAccount {
  id: number
  name: string
  notes?: string | null
  status?: string
  schedulable?: boolean
  credentials?: Record<string, unknown>
  extra?: Record<string, unknown>
  expires_at?: number | null
}

export interface Sub2APIUsageWindow { utilization?: number | null; resets_at?: string | null; remaining_seconds?: number }
export interface Sub2APIUsage {
  five_hour?: Sub2APIUsageWindow | null
  seven_day?: Sub2APIUsageWindow | null
  needs_reauth?: boolean
  error_code?: string
  error?: string
}

function parseExpiry(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return new Date(value < 10_000_000_000 ? value * 1000 : value).toISOString()
  }
  if (typeof value === 'string' && value.trim()) {
    const numeric = Number(value)
    if (Number.isFinite(numeric) && numeric > 0) {
      return new Date(numeric < 10_000_000_000 ? numeric * 1000 : numeric).toISOString()
    }
    const timestamp = Date.parse(value)
    if (Number.isFinite(timestamp)) return new Date(timestamp).toISOString()
  }
  return null
}

export function sub2apiTokenExpiresAt(account: Sub2APIAccount): string | null {
  return parseExpiry(account.credentials?.expires_at) ?? parseExpiry(account.expires_at)
}

export class Sub2APIError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message)
  }
}

export class Sub2APIClient {
  private readonly baseUrl: string
  constructor(private readonly config: AppConfig) {
    this.baseUrl = config.sub2api.base_url.replace(/\/$/, '')
  }

  async testConnection(): Promise<{ ok: true; accountCount: number }> {
    const data = await this.request<{ items: unknown[]; total: number }>('/admin/accounts?page=1&page_size=1&platform=openai')
    return { ok: true, accountCount: data.total ?? data.items?.length ?? 0 }
  }

  listGroups(): Promise<Sub2APIGroup[]> {
    return this.request('/admin/groups/all?platform=openai')
  }

  listProxies(): Promise<Sub2APIProxy[]> {
    return this.request('/admin/proxies/all?with_count=true')
  }

  listOpenAIAccounts(): Promise<{ items: Sub2APIAccount[]; total: number }> {
    return this.request('/admin/accounts?page=1&page_size=1000&platform=openai')
  }

  generateOpenAIAuthUrl(proxyId: number | null): Promise<{ auth_url: string; session_id: string }> {
    return this.request('/admin/openai/generate-auth-url', { method: 'POST', body: { ...(proxyId ? { proxy_id: proxyId } : {}) } })
  }

  createFromOAuth(payload: {
    session_id: string
    code: string
    state: string
    proxy_id?: number
    name: string
    concurrency: number
    priority: number
    group_ids: number[]
  }): Promise<Sub2APIAccount> {
    return this.request('/admin/openai/create-from-oauth', { method: 'POST', body: payload })
  }

  exchangeCode(payload: { session_id: string; code: string; state: string; proxy_id?: number }): Promise<Record<string, unknown>> {
    return this.request('/admin/openai/exchange-code', { method: 'POST', body: payload })
  }

  applyOAuthCredentials(accountId: number, credentials: Record<string, unknown>): Promise<Sub2APIAccount> {
    return this.request(`/admin/accounts/${accountId}/apply-oauth-credentials`, {
      method: 'POST', body: { type: 'oauth', credentials }
    })
  }

  refreshOpenAIAccount(accountId: number): Promise<Sub2APIAccount> {
    return this.request(`/admin/openai/accounts/${accountId}/refresh`, { method: 'POST', body: {} })
  }

  queryAccountUsage(accountId: number): Promise<Sub2APIUsage> {
    return this.request(`/admin/accounts/${accountId}/usage?source=active&force=true`)
  }

  updateAccount(accountId: number, body: Record<string, unknown>): Promise<Sub2APIAccount> {
    return this.request(`/admin/accounts/${accountId}`, { method: 'PUT', body })
  }

  setAccountSchedulable(accountId: number, schedulable: boolean): Promise<Sub2APIAccount> {
    return this.request(`/admin/accounts/${accountId}/schedulable`, { method: 'POST', body: { schedulable } })
  }

  clearAccountError(accountId: number): Promise<Sub2APIAccount> {
    return this.request(`/admin/accounts/${accountId}/clear-error`, { method: 'POST', body: {} })
  }

  deleteAccount(accountId: number): Promise<void> {
    return this.request(`/admin/accounts/${accountId}`, { method: 'DELETE' })
  }

  async selectProxy(policy: 'auto' | 'direct' | 'fixed', fixedProxyId: number | null): Promise<Sub2APIProxy | null> {
    if (policy === 'direct') return null
    const proxies = await this.listProxies()
    const current = Date.now()
    const candidates = proxies.filter((proxy) =>
      proxy.status === 'active' &&
      (!proxy.expires_at || new Date(proxy.expires_at).getTime() > current) &&
      proxy.latency_status !== 'failed' &&
      proxy.quality_status !== 'failed'
    )
    if (policy === 'fixed') {
      const selected = candidates.find((proxy) => proxy.id === fixedProxyId)
      if (!selected) throw new Sub2APIError(400, 'FIXED_PROXY_UNAVAILABLE', '配置的固定代理不可用')
      return selected
    }
    if (!candidates.length) return null
    const selected = candidates.sort((left, right) =>
      (left.account_count ?? 0) - (right.account_count ?? 0) ||
      (left.latency_ms ?? Number.MAX_SAFE_INTEGER) - (right.latency_ms ?? Number.MAX_SAFE_INTEGER) ||
      left.id - right.id
    )[0]!
    return this.withProxyEndpoint(selected)
  }

  private async withProxyEndpoint(proxy: Sub2APIProxy): Promise<Sub2APIProxy> {
    if (proxy.host && proxy.port) return proxy
    try {
      const detailed = await this.request<Sub2APIProxy>(`/admin/proxies/${proxy.id}`)
      return { ...proxy, ...detailed }
    } catch {
      return proxy
    }
  }

  private async request<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), this.config.sub2api.request_timeout_seconds * 1000)
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: options.method ?? 'GET',
        signal: controller.signal,
        headers: { 'content-type': 'application/json', 'x-api-key': this.config.sub2apiAdminKey },
        ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {})
      })
      const raw = (await response.json().catch(() => null)) as Envelope<T> | null
      if (!response.ok || !raw || raw.code !== 0) {
        const message = String(raw?.message ?? `Sub2API request failed with HTTP ${response.status}`).slice(0, 500)
        const envelopeStatus = typeof raw?.code === 'number' && raw.code >= 400 && raw.code <= 599 ? raw.code : response.status
        throw new Sub2APIError(envelopeStatus, String(raw?.reason ?? raw?.code ?? 'SUB2API_ERROR'), message)
      }
      return raw.data
    } catch (error) {
      if (error instanceof Sub2APIError) throw error
      if (error instanceof Error && error.name === 'AbortError') throw new Sub2APIError(504, 'SUB2API_TIMEOUT', 'Sub2API 请求超时')
      throw new Sub2APIError(502, 'SUB2API_UNAVAILABLE', '无法连接 Sub2API')
    } finally {
      clearTimeout(timeout)
    }
  }
}

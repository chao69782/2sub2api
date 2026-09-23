import type { AccountImportOverrides, AccountUsageSummary, ManagedAccount, RuntimeSettings } from '../shared/types'

let csrfToken = ''

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message) }
}

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, {
    credentials: 'include',
    ...options,
    headers: {
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(!['GET', 'HEAD'].includes(options.method ?? 'GET') && csrfToken ? { 'x-csrf-token': csrfToken } : {}),
      ...options.headers
    }
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new ApiError(response.status, data.code ?? 'REQUEST_FAILED', data.message ?? '请求失败')
  return data as T
}

export const api = {
  setCsrf(value: string) { csrfToken = value },
  login(username: string, password: string) {
    return request<{ user: { username: string }; csrfToken: string }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) })
  },
  me() { return request<{ user: { username: string }; csrfToken: string }>('/api/auth/me') },
  logout() { return request('/api/auth/logout', { method: 'POST' }) },
  listAccounts(search = '') { return request<{ items: ManagedAccount[]; usageSummary: AccountUsageSummary }>(`/api/accounts?search=${encodeURIComponent(search)}`) },
  exportAccounts(ids: string[]) { window.location.assign(`/api/accounts/export.txt?ids=${encodeURIComponent(ids.join(','))}`) },
  previewImport(text: string) { return request<{ rows: Array<Record<string, unknown>>; validCount: number }>('/api/accounts/import/preview', { method: 'POST', body: JSON.stringify({ text }) }) },
  importAccounts(text: string) { return request<{ created: ManagedAccount[]; errors: Array<{ line: number; message: string }> }>('/api/accounts/import', { method: 'POST', body: JSON.stringify({ text }) }) },
  updateAccount(id: string, body: Record<string, unknown>) { return request<ManagedAccount>(`/api/accounts/${id}`, { method: 'PUT', body: JSON.stringify(body) }) },
  deleteAccount(id: string, deleteRemote: boolean) { return request(`/api/accounts/${id}?deleteRemote=${deleteRemote}`, { method: 'DELETE' }) },
  autoAuthorize(id: string, accountName: string, importOverrides: AccountImportOverrides | null) {
    return request(`/api/accounts/${id}/authorize/auto`, { method: 'POST', body: JSON.stringify({ accountName, importOverrides }) })
  },
  refreshAccount(id: string) { return request(`/api/accounts/${id}/refresh`, { method: 'POST' }) },
  getSettings() { return request<{ value: RuntimeSettings; version: number }>('/api/settings') },
  saveSettings(value: RuntimeSettings) { return request<{ value: RuntimeSettings; version: number }>('/api/settings', { method: 'PUT', body: JSON.stringify(value) }) },
  testSub2api() { return request<{ ok: true; accountCount: number }>('/api/settings/test-sub2api', { method: 'POST' }) },
  listGroups() { return request<{ items: Array<{ id: number; name: string; platform: string }> }>('/api/metadata/groups') },
  listProxies() { return request<{ items: Array<{ id: number; name: string; account_count?: number; latency_ms?: number }> }>('/api/metadata/proxies') }
}

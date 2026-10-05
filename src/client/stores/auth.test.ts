import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { isNavigationFailure, NavigationFailureType } from 'vue-router'
import { api } from '../api'
import { router } from '../router'
import { useAuthStore } from './auth'

vi.mock('vue-router', async () => {
  const actual = await vi.importActual<typeof import('vue-router')>('vue-router')
  return { ...actual, createWebHistory: actual.createMemoryHistory }
})

function response(status = 200, body: unknown = { user: { username: 'admin' }, csrfToken: 'restored-csrf' }) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

beforeEach(() => {
  setActivePinia(createPinia())
  api.setCsrf('saved-csrf')
  vi.stubGlobal('fetch', vi.fn())
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('login state restoration', () => {
  it('recovers after a network error and a temporary service error', async () => {
    const auth = useAuthStore()
    vi.mocked(fetch)
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(response(503, { message: '服务暂不可用' }))
      .mockResolvedValueOnce(response())

    const restoring = auth.restore()
    expect(auth.restoring).toBe(true)
    expect(auth.ready).toBe(false)
    await vi.runAllTimersAsync()
    await restoring

    expect(fetch).toHaveBeenCalledTimes(3)
    expect(auth.username).toBe('admin')
    expect(auth.ready).toBe(true)
    expect(auth.restoring).toBe(false)
    expect(auth.restoreError).toBe('')
    vi.mocked(fetch).mockResolvedValueOnce(response(200, {}))
    await api.previewImport('')
    expect(vi.mocked(fetch).mock.calls[3]?.[1]?.headers).toMatchObject({ 'x-csrf-token': 'restored-csrf' })
  })

  it('clears the username and CSRF token only when the server returns 401', async () => {
    const auth = useAuthStore()
    auth.username = 'saved-admin'
    vi.mocked(fetch).mockResolvedValueOnce(response(401, { code: 'UNAUTHORIZED' }))

    await auth.restore()

    expect(fetch).toHaveBeenCalledTimes(1)
    expect(auth.username).toBe('')
    expect(auth.ready).toBe(true)
    expect(auth.restoreError).toBe('')
    vi.mocked(fetch).mockResolvedValueOnce(response(200, {}))
    await api.previewImport('')
    expect(vi.mocked(fetch).mock.calls[1]?.[1]?.headers).not.toHaveProperty('x-csrf-token')
  })

  it('preserves existing credentials on sustained network failure and supports a later retry', async () => {
    const auth = useAuthStore()
    auth.username = 'saved-admin'
    vi.mocked(fetch).mockRejectedValue(new TypeError('Failed to fetch'))

    const restoring = auth.restore()
    await vi.runAllTimersAsync()
    await restoring

    expect(fetch).toHaveBeenCalledTimes(3)
    expect(auth.username).toBe('saved-admin')
    expect(auth.ready).toBe(false)
    expect(auth.restoring).toBe(false)
    expect(auth.restoreError).toContain('重试')
    vi.mocked(fetch).mockResolvedValueOnce(response(200, {}))
    await api.previewImport('')
    expect(vi.mocked(fetch).mock.calls[3]?.[1]?.headers).toMatchObject({ 'x-csrf-token': 'saved-csrf' })

    vi.mocked(fetch).mockResolvedValueOnce(response())
    await auth.restore()
    expect(auth.username).toBe('admin')
    expect(auth.ready).toBe(true)
    expect(auth.restoreError).toBe('')
  })

  it('does not mark persistent server failures as a logged out session', async () => {
    const auth = useAuthStore()
    auth.username = 'saved-admin'
    vi.mocked(fetch).mockImplementation(async () => response(503, {}))

    const restoring = auth.restore()
    await vi.runAllTimersAsync()
    await restoring

    expect(fetch).toHaveBeenCalledTimes(3)
    expect(auth.username).toBe('saved-admin')
    expect(auth.ready).toBe(false)
    expect(auth.restoreError).toContain('重试')
  })

  it('shares an in-flight restoration instead of sending competing requests', async () => {
    const auth = useAuthStore()
    let resolveResponse!: (value: Response) => void
    vi.mocked(fetch).mockReturnValue(new Promise((resolve) => { resolveResponse = resolve }))

    const first = auth.restore()
    const second = auth.restore()
    expect(fetch).toHaveBeenCalledTimes(1)
    resolveResponse(response())
    await Promise.all([first, second])
    expect(auth.ready).toBe(true)
  })

  it('resets the recovery state after a successful login and clears credentials after logout', async () => {
    const auth = useAuthStore()
    auth.restoreError = '恢复失败'
    auth.pendingPath = '/settings?tab=security#sessions'
    vi.mocked(fetch).mockResolvedValueOnce(response())

    await auth.login('admin', 'password')

    expect(auth.ready).toBe(true)
    expect(auth.restoreError).toBe('')
    expect(auth.pendingPath).toBe('')
    vi.mocked(fetch).mockResolvedValueOnce(response(200, {}))
    await auth.logout()
    expect(auth.username).toBe('')
    expect(auth.ready).toBe(true)
    vi.mocked(fetch).mockResolvedValueOnce(response(200, {}))
    await api.previewImport('')
    expect(vi.mocked(fetch).mock.calls[2]?.[1]?.headers).not.toHaveProperty('x-csrf-token')
  })
})

describe('navigation during login state restoration', () => {
  it('blocks failed restoration and retains the requested query and hash for retry', async () => {
    const auth = useAuthStore()
    auth.ready = true
    auth.username = 'admin'
    await router.replace('/accounts')
    auth.ready = false
    vi.mocked(fetch).mockRejectedValue(new TypeError('Failed to fetch'))

    const navigation = router.push('/settings?tab=security#sessions')
    await vi.runAllTimersAsync()
    const failure = await navigation

    expect(isNavigationFailure(failure, NavigationFailureType.aborted)).toBe(true)
    expect(router.currentRoute.value.name).toBe('accounts')
    expect(auth.pendingPath).toBe('/settings?tab=security#sessions')
    expect(auth.username).toBe('admin')
    expect(auth.ready).toBe(false)

    vi.mocked(fetch).mockResolvedValueOnce(response())
    await auth.restore()
    await router.replace(auth.pendingPath)
    expect(router.currentRoute.value.fullPath).toBe('/settings?tab=security#sessions')
  })

  it('redirects a confirmed expired session to login with the full original destination', async () => {
    const auth = useAuthStore()
    auth.ready = true
    auth.username = 'admin'
    await router.replace('/accounts')
    auth.ready = false
    vi.mocked(fetch).mockResolvedValueOnce(response(401, { code: 'UNAUTHORIZED' }))

    await router.push('/settings?tab=security#sessions')

    expect(router.currentRoute.value.name).toBe('login')
    expect(router.currentRoute.value.query.redirect).toBe('/settings?tab=security#sessions')
    expect(auth.pendingPath).toBe('')
  })

  it('does not block or restore an already verified session', async () => {
    const auth = useAuthStore()
    auth.ready = true
    auth.username = 'admin'

    await router.replace('/accounts')
    await router.push('/settings')

    expect(router.currentRoute.value.name).toBe('settings')
    expect(fetch).not.toHaveBeenCalled()
  })
})

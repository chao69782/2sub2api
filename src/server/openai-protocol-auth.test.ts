import { authenticator } from 'otplib'
import { describe, expect, it, vi } from 'vitest'
import type { ChromeHttpResponse } from './chrome-http.js'
import { CookieJar } from './cookie-jar.js'
import { finishChatGptOAuth, rotateTotpInAuthenticatedSession, rotateTotpWithSessionReset, startChatGptLogin } from './openai-protocol-auth.js'
import { ManualActionRequiredError } from './openai-auth-errors.js'
import type { TotpRotationStep } from '../shared/types.js'

function authResponse(status: number, json: unknown, headers: Record<string, string> = {}): ChromeHttpResponse {
  return { status, url: 'https://chatgpt.com/', text: JSON.stringify(json), headers: new Headers(headers), json: () => json as Record<string, unknown> }
}

function loginClient(signIn: ChromeHttpResponse, csrf = authResponse(200, { csrfToken: 'csrf-secret' })) {
  return {
    navigateHeaders: () => ({ 'user-agent': 'test-browser' }),
    request: vi.fn<Parameters<typeof startChatGptLogin>[0]['request']>().mockResolvedValueOnce(csrf).mockResolvedValueOnce(signIn)
  }
}

describe('ChatGPT login initialization', () => {
  it.each(['/api/accounts/authorize', '/authorize', '/oauth/authorize', '/api/accounts/oauth/authorize'])('accepts the trusted %s route without losing OAuth parameters', async (path) => {
    const url = `https://auth.openai.com${path}?state=private-state&code_challenge=private-challenge&device_id=device-id`
    const client = loginClient(authResponse(200, { url }))
    await expect(startChatGptLogin(client)).resolves.toBe(url)
    expect(client.request).toHaveBeenNthCalledWith(1, 'https://chatgpt.com/api/auth/csrf', expect.any(Object))
    const [signInUrl, init] = client.request.mock.calls[1]!
    expect(signInUrl).toBe('https://chatgpt.com/api/auth/signin/openai')
    expect(init).toMatchObject({ method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', origin: 'https://chatgpt.com' } })
    expect(Object.fromEntries(new URLSearchParams(init?.body))).toEqual({ csrfToken: 'csrf-secret', callbackUrl: 'https://chatgpt.com/', json: 'true' })
  })

  it.each([302, 303, 307])('accepts HTTP %s with an authorization Location header', async (status) => {
    const url = 'https://auth.openai.com/authorize?state=private-state'
    const client = loginClient(authResponse(status, null, { location: url }))
    await expect(startChatGptLogin(client)).resolves.toBe(url)
  })

  it.each([
    'https://auth.openai.com.evil.example/authorize?token=private-token',
    'http://auth.openai.com/authorize?token=private-token',
    'https://private-user:private-password@auth.openai.com/authorize',
    'https://auth.openai.com:8443/authorize?token=private-token',
    'javascript:private-token',
    'invalid-url'
  ])('rejects an untrusted or malformed sign-in URL: %s', async (url) => {
    const error = await startChatGptLogin(loginClient(authResponse(200, { url }))).catch((error: unknown) => error)
    expect(error).toMatchObject({ code: 'CHATGPT_SESSION_FAILED', message: expect.stringContaining('HTTP 200') })
    for (const sensitive of ['private-token', 'private-user', 'private-password']) {
      expect((error as Error).message).not.toContain(sensitive)
    }
  })

  it('reports an OAuth error redirect without exposing its query parameters or response body', async () => {
    const client = loginClient(authResponse(200, {
      url: 'https://chatgpt.com/api/auth/error?error=OAuthSignin&state=private-state&token=private-token',
      csrfToken: 'private-csrf'
    }))
    const error = await startChatGptLogin(client).catch((error: unknown) => error)
    expect(error).toMatchObject({ code: 'CHATGPT_SESSION_FAILED', message: expect.stringContaining('error=OAuthSignin') })
    for (const sensitive of ['private-state', 'private-token', 'private-csrf']) {
      expect((error as Error).message).not.toContain(sensitive)
    }
  })

  it('rejects an error returned on the trusted authorization domain', async () => {
    await expect(startChatGptLogin(loginClient(authResponse(200, { url: 'https://auth.openai.com/authorize?error=access_denied' }))))
      .rejects.toMatchObject({ code: 'CHATGPT_SESSION_FAILED', message: expect.stringContaining('error=access_denied') })
  })

  it.each([403, 429])('identifies HTTP %s as a security challenge at both initialization stages', async (status) => {
    for (const stage of ['csrf', 'signin']) {
      const blocked = authResponse(status, {}, { 'content-type': 'text/html' })
      const client = stage === 'csrf' ? loginClient(authResponse(200, {}), blocked) : loginClient(blocked)
      await expect(startChatGptLogin(client)).rejects.toMatchObject({ code: 'OPENAI_SECURITY_CHALLENGE', message: expect.stringContaining(`HTTP ${status}`) })
      expect(client.request).toHaveBeenCalledTimes(stage === 'csrf' ? 1 : 2)
    }
  })

  it('does not continue after a CSRF error redirect', async () => {
    const client = loginClient(authResponse(200, {}), authResponse(302, null, { location: '/api/auth/signin?csrf=true&state=private-state' }))
    const error = await startChatGptLogin(client).catch((error: unknown) => error)
    expect(error).toMatchObject({ code: 'CHATGPT_SESSION_FAILED', message: expect.stringContaining('CSRF 校验失败') })
    expect((error as Error).message).not.toContain('private-state')
    expect(client.request).toHaveBeenCalledTimes(1)
  })

  it.each([null, {}, []])('handles a missing CSRF token in %j without starting sign-in', async (json) => {
    const client = loginClient(authResponse(200, {}), authResponse(200, json))
    await expect(startChatGptLogin(client)).rejects.toMatchObject({ code: 'CHATGPT_SESSION_FAILED', message: expect.stringContaining('无法初始化 ChatGPT 登录会话') })
    expect(client.request).toHaveBeenCalledTimes(1)
  })

  it.each([200, 500])('reports HTTP %s and content type when sign-in returns HTML instead of a URL', async (status) => {
    const response = authResponse(status, {}, { 'content-type': 'text/html; charset=utf-8' })
    response.text = '<html>private-response-body</html>'
    const error = await startChatGptLogin(loginClient(response)).catch((error: unknown) => error)
    expect(error).toMatchObject({ code: 'CHATGPT_SESSION_FAILED', message: expect.stringContaining(`HTTP ${status}；text/html`) })
    expect((error as Error).message).not.toContain('private-response-body')
  })

  it('rejects an HTTP failure even when the response contains a valid authorization URL', async () => {
    await expect(startChatGptLogin(loginClient(authResponse(401, { url: 'https://auth.openai.com/authorize' }))))
      .rejects.toMatchObject({ code: 'CHATGPT_SESSION_FAILED', message: expect.stringContaining('HTTP 401') })
  })

  it('rejects a challenge response even when it contains an authorization URL', async () => {
    await expect(startChatGptLogin(loginClient(authResponse(200, { url: 'https://auth.openai.com/authorize' }, { 'cf-mitigated': 'challenge' }))))
      .rejects.toMatchObject({ code: 'OPENAI_SECURITY_CHALLENGE' })
  })
})

describe('ChatGPT login continuation', () => {
  it.each(['personal', 'organization'])('selects a %s workspace before completing login', async (kind) => {
    let selectedId = ''
    const client = {
      cookies: new CookieJar(),
      navigateHeaders: () => ({}),
      authHeaders: () => ({}),
      follow: async (url: string) => ({ status: 200, url, text: '', headers: new Headers() }),
      request: async (url: string, init?: { body?: string }) => {
        const json = url.endsWith('/workspace/list')
          ? { workspaces: [{ id: 'selected-workspace', kind }] }
          : { continue_url: 'https://chatgpt.com/' }
        if (url.endsWith('/workspace/select')) selectedId = JSON.parse(init?.body || '{}').workspace_id
        return { status: 200, url, text: JSON.stringify(json), headers: new Headers(), json: () => json }
      }
    } as unknown as Parameters<typeof finishChatGptOAuth>[0]
    const completed = await finishChatGptOAuth(client, 'https://auth.openai.com/workspace', {}, {}, {})
    expect(completed.url).toBe('https://chatgpt.com/')
    expect(selectedId).toBe('selected-workspace')
  })
})

describe('2FA rotation with device logout', () => {
  const oldSecret = 'JBSWY3DPEHPK3PXP'
  const newSecret = 'JBSWY3DPEHPK3PXPJBSWY3DP'

  function rotationSession(events: string[], logoutStatus = 200) {
    const responses = [
      { status: 200, json: { factors: { totp: [{ id: 'old-factor' }] } } },
      { status: 200, json: {} },
      { status: 200, json: { session_id: 'new-session', secret: newSecret } },
      { status: 200, json: {} },
      { status: 200, json: { mfa_enabled_v2: true, factors: { totp: [{ id: 'new-factor' }] } } },
      { status: logoutStatus, json: {} }
    ]
    return {
      mfaVerified: true,
      api: vi.fn(async (path: string) => { events.push(path); return responses.shift()! })
    }
  }

  it('rotates and saves the new secret before logout, then logs in with the saved secret', async () => {
    const events: string[] = []
    const session = rotationSession(events)
    const fresh = { mfaVerified: true, api: vi.fn() }
    const login = vi.fn(async (_secret: string) => { events.push('login'); return events.length === 1 ? session : fresh })
    const progress: TotpRotationStep[] = []
    await rotateTotpWithSessionReset({
      totpSecret: oldSecret, onStep: (step) => progress.push(step),
      stageSecret: (secret) => { expect(secret).toBe(newSecret); events.push('stage') },
      saveSecret: () => { events.push('save'); return newSecret }
    }, login)
    expect(progress).toEqual(['login', 'rotate_totp', 'save_secret', 'logout_devices', 'relogin'])
    expect(login.mock.calls.map(([secret]) => secret)).toEqual([oldSecret, newSecret])
    expect(session.api).toHaveBeenLastCalledWith('/accounts/logout_all', undefined, 'POST')
    expect(fresh.api).not.toHaveBeenCalled()
    expect(events).toEqual([
      'login', '/accounts/mfa_info', '/accounts/mfa/user/disable_in_house', '/accounts/mfa/enroll',
      'stage', '/accounts/mfa/user/activate_enrollment', '/accounts/mfa_info', 'save', '/accounts/logout_all', 'login'
    ])
  })

  it.each([302, 401, 403, 500])('keeps the saved secret and stops before re-login when logout returns HTTP %s', async (status) => {
    const session = rotationSession([], status)
    const login = vi.fn(async () => session)
    const stageSecret = vi.fn()
    const saveSecret = vi.fn(() => newSecret)
    const progress: TotpRotationStep[] = []
    await expect(rotateTotpWithSessionReset({ totpSecret: oldSecret, stageSecret, saveSecret, onStep: (step) => progress.push(step) }, login))
      .rejects.toMatchObject({ code: 'CHATGPT_LOGOUT_ALL_FAILED' })
    expect(progress).toEqual(['login', 'rotate_totp', 'save_secret', 'logout_devices'])
    expect(login).toHaveBeenCalledTimes(1)
    expect(session.api).toHaveBeenLastCalledWith('/accounts/logout_all', undefined, 'POST')
    expect(stageSecret).toHaveBeenCalledExactlyOnceWith(newSecret)
    expect(saveSecret).toHaveBeenCalledTimes(1)
  })

  it('reports that the new secret was saved when the fresh login fails', async () => {
    const login = vi.fn().mockResolvedValueOnce(rotationSession([], 204))
      .mockRejectedValueOnce(new ManualActionRequiredError('需要邮箱验证', 'EMAIL_VERIFICATION_REQUIRED'))
    const stageSecret = vi.fn()
    const saveSecret = vi.fn(() => newSecret)
    await expect(rotateTotpWithSessionReset({ totpSecret: oldSecret, stageSecret, saveSecret }, login))
      .rejects.toMatchObject({ code: 'EMAIL_VERIFICATION_REQUIRED', message: expect.stringContaining('新 2FA 已保存') })
    expect(login.mock.calls).toEqual([[oldSecret], [newSecret]])
    expect(saveSecret).toHaveBeenCalledTimes(1)
  })

  it('saves an already activated pending secret before logout without rotating it again', async () => {
    const staleApi = vi.fn(async () => ({ status: 200, json: {} }))
    const freshApi = vi.fn()
    const login = vi.fn().mockResolvedValueOnce({ mfaVerified: true, api: staleApi }).mockResolvedValueOnce({ mfaVerified: true, api: freshApi })
    const stageSecret = vi.fn()
    const saveSecret = vi.fn(() => newSecret)
    await rotateTotpWithSessionReset({ totpSecret: oldSecret, pendingTotpSecret: newSecret, stageSecret, saveSecret }, login)
    expect(login.mock.calls).toEqual([[newSecret], [newSecret]])
    expect(staleApi).toHaveBeenCalledExactlyOnceWith('/accounts/logout_all', undefined, 'POST')
    expect(freshApi).not.toHaveBeenCalled()
    expect(stageSecret).not.toHaveBeenCalled()
    expect(saveSecret).toHaveBeenCalledTimes(1)
  })

  it('falls back from an inactive pending secret, rotates, and uses the newly saved secret for fresh login', async () => {
    const login = vi.fn().mockRejectedValueOnce(new ManualActionRequiredError('2FA 验证失败', 'MFA_VERIFICATION_FAILED'))
      .mockResolvedValueOnce(rotationSession([])).mockResolvedValueOnce({ mfaVerified: true, api: vi.fn() })
    const stageSecret = vi.fn()
    await rotateTotpWithSessionReset({ totpSecret: oldSecret, pendingTotpSecret: newSecret, stageSecret, saveSecret: () => newSecret }, login)
    expect(login.mock.calls).toEqual([[newSecret], [oldSecret], [newSecret]])
    expect(stageSecret).toHaveBeenCalledExactlyOnceWith(newSecret)
  })

  it('does not retry with another secret on a login security failure', async () => {
    const login = vi.fn().mockRejectedValue(new ManualActionRequiredError('安全验证', 'OPENAI_SECURITY_CHALLENGE'))
    const stageSecret = vi.fn()
    const saveSecret = vi.fn(() => newSecret)
    await expect(rotateTotpWithSessionReset({ totpSecret: oldSecret, pendingTotpSecret: newSecret, stageSecret, saveSecret }, login))
      .rejects.toMatchObject({ code: 'OPENAI_SECURITY_CHALLENGE' })
    expect(login).toHaveBeenCalledTimes(1)
    expect(stageSecret).not.toHaveBeenCalled()
    expect(saveSecret).not.toHaveBeenCalled()
  })

  it('resumes after a saved-secret checkpoint without enrolling or saving another secret', async () => {
    const api = vi.fn(async () => ({ status: 200, json: {} }))
    const login = vi.fn(async () => ({ mfaVerified: true, api }))
    const stageSecret = vi.fn()
    const saveSecret = vi.fn(() => newSecret)
    await rotateTotpWithSessionReset({ totpSecret: newSecret, secretSaved: true, stageSecret, saveSecret }, login)
    expect(login.mock.calls).toEqual([[newSecret], [newSecret]])
    expect(api).toHaveBeenCalledExactlyOnceWith('/accounts/logout_all', undefined, 'POST')
    expect(stageSecret).not.toHaveBeenCalled()
    expect(saveSecret).not.toHaveBeenCalled()
  })

  it('does not log out when confirming or saving the new secret fails', async () => {
    for (const failure of ['confirm', 'save']) {
      const session = rotationSession([])
      const originalApi = session.api.getMockImplementation()!
      session.api.mockImplementation(async (path: string) => {
        if (failure === 'confirm' && path.endsWith('activate_enrollment')) return { status: 400, json: {} }
        return originalApi(path)
      })
      const login = vi.fn(async () => session)
      const saveSecret = vi.fn(() => { throw new Error('密钥保存失败') })
      await expect(rotateTotpWithSessionReset({ totpSecret: oldSecret, stageSecret: vi.fn(), saveSecret }, login)).rejects.toThrow()
      expect(session.api.mock.calls.some(([path]) => path === '/accounts/logout_all')).toBe(false)
      expect(saveSecret).toHaveBeenCalledTimes(failure === 'save' ? 1 : 0)
      expect(login).toHaveBeenCalledTimes(1)
    }
  })
})

describe('OpenAI 2FA rotation protocol', () => {
  it('stages the issued secret before activation and confirms the new factor', async () => {
    const secret = 'JBSWY3DPEHPK3PXPJBSWY3DP'
    const steps: string[] = []
    let staged = ''
    const responses = [
      { status: 200, json: { mfa_enabled_v2: true, factors: { totp: [{ id: 'old-factor' }] } } },
      { status: 200, json: {} },
      { status: 200, json: { session_id: 'new-session', secret } },
      { status: 200, json: {} },
      { status: 200, json: { mfa_enabled_v2: true, factors: { totp: [{ id: 'old-factor' }] } } },
      { status: 200, json: { mfa_enabled_v2: true, factors: { totp: [{ id: 'new-factor' }] } } }
    ]
    await rotateTotpInAuthenticatedSession(async (path, body) => {
      steps.push(path)
      if (path.endsWith('activate_enrollment')) {
        expect(staged).toBe(secret)
        expect(body).toEqual({ code: authenticator.generate(secret), factor_type: 'totp', session_id: 'new-session', source: 'settings' })
      }
      return responses.shift()!
    }, (value) => { staged = value; steps.push('stage') })
    expect(steps).toEqual([
      '/accounts/mfa_info', '/accounts/mfa/user/disable_in_house', '/accounts/mfa/enroll',
      'stage', '/accounts/mfa/user/activate_enrollment', '/accounts/mfa_info', '/accounts/mfa_info'
    ])
  })

  it('does not save a secret when enrollment fails after disabling the old factor', async () => {
    let staged = false
    const responses = [
      { status: 200, json: { factors: { totp: [{ id: 'old-factor' }] } } },
      { status: 200, json: {} },
      { status: 403, json: {} }
    ]
    await expect(rotateTotpInAuthenticatedSession(async () => responses.shift()!, () => { staged = true }))
      .rejects.toMatchObject({ code: 'MFA_ENROLL_FAILED' })
    expect(staged).toBe(false)
  })

  it('refuses to remove an ambiguous set of existing factors', async () => {
    let calls = 0
    await expect(rotateTotpInAuthenticatedSession(async () => {
      calls += 1
      return { status: 200, json: { factors: { totp: [{ id: 'one' }, { id: 'two' }] } } }
    }, () => {})).rejects.toMatchObject({ code: 'MULTIPLE_TOTP_FACTORS' })
    expect(calls).toBe(1)
  })

  it('refuses an existing factor without an ID', async () => {
    let calls = 0
    await expect(rotateTotpInAuthenticatedSession(async () => {
      calls += 1
      return { status: 200, json: { factors: { totp: [{}] } } }
    }, () => {})).rejects.toMatchObject({ code: 'MFA_INFO_INVALID' })
    expect(calls).toBe(1)
  })
})

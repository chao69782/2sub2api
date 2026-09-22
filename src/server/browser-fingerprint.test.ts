import { describe, expect, it } from 'vitest'
import {
  applyChromeVersion,
  buildBrowserEnvironment,
  createFingerprintSession,
  pickBrowserProfile,
  validateBrowserProfile
} from './browser-fingerprint.js'
import { extraHttpHeaders, fingerprintInitScript, injectionProfile, playwrightContextOptions, playwrightLaunchArgs } from './playwright-fingerprint.js'
import { decodeConfig, encodeConfig, fnv1aHash, formatFingerprintDate, generateFingerprintData, generateRequirementsToken } from './sentinel-fingerprint.js'

describe('browser fingerprint profile', () => {
  it('keeps UA, client hints, navigator and timezone internally consistent', () => {
    const profile = buildBrowserEnvironment({ country: 'CN', timezone: 'Asia/Shanghai' }, undefined, 'macOS')
    expect(validateBrowserProfile(profile)).toEqual([])
    expect(profile.navigatorLanguage).toBe('zh-CN')
    expect(profile.navigatorLanguages).toContain('zh-CN')
    expect(profile.timezoneIana).toBe('Asia/Shanghai')
    expect(profile.userAgent).toContain(`Chrome/${profile.chromeFullVersion}`)
    expect(profile.secChUa).toContain(`v="${profile.chromeMajor}"`)
    expect(profile.navigatorPlatform).toBe('MacIntel')
    expect(profile.viewportWidth).toBeGreaterThan(0)
    expect(profile.viewportHeight).toBeGreaterThan(0)
    expect(profile.webglRenderer).toContain('Apple')
  })

  it('uses a Linux Chrome profile that matches Docker Chromium', () => {
    const profile = buildBrowserEnvironment({ country: 'CN' }, undefined, 'Linux')
    expect(validateBrowserProfile(profile)).toEqual([])
    expect(profile.browserOs).toBe('Linux')
    expect(profile.userAgent).toContain('X11; Linux x86_64')
    expect(profile.navigatorPlatform).toBe('Linux x86_64')
    expect(profile.secChUaPlatform).toContain('Linux')
    expect(profile.webglRenderer).toContain('SwiftShader')
  })

  it('picks a stable desktop profile for the same seed', () => {
    const first = pickBrowserProfile('user@example.com')
    const second = pickBrowserProfile('user@example.com')
    expect(first.screenWidth).toBe(second.screenWidth)
    expect(first.hardwareConcurrency).toBe(second.hardwareConcurrency)
    expect(first.jsHeapSizeLimit).toBe(second.jsHeapSizeLimit)
    expect(pickBrowserProfile('other@example.com').screenWidth + pickBrowserProfile('other@example.com').hardwareConcurrency)
      .toBeTypeOf('number')
  })

  it('realigns Chrome UA and Client Hints to the launched browser version', () => {
    const profile = applyChromeVersion(buildBrowserEnvironment(undefined, undefined, 'macOS'), '131.0.6778.85')
    expect(validateBrowserProfile(profile)).toEqual([])
    expect(profile.chromeMajor).toBe('131')
    expect(profile.chromeFullVersion).toBe('131.0.6778.85')
    expect(profile.userAgent).toContain('Chrome/131.0.6778.85')
    expect(profile.secChUa).toContain('v="131"')
    expect(profile.secChUaFullVersionList).toContain('v="131.0.6778.85"')
  })

  it('reuses device and Sentinel IDs for the same account seed', () => {
    const first = createFingerprintSession('a@example.com')
    const second = createFingerprintSession('a@example.com')
    expect(first.deviceId).toBe(second.deviceId)
    expect(first.sentinelSid).toBe(second.sentinelSid)
    expect(first.profile.screenWidth).toBe(second.profile.screenWidth)
    expect(first.deviceId).not.toBe(createFingerprintSession('b@example.com').deviceId)
  })
})

describe('Sentinel p fingerprint', () => {
  it('encodes a 25-item config the same way as the SDK TextEncoder + btoa path', () => {
    const config = [2730, 'Sun Jul 19 2026 21:36:16 GMT+0800 (China Standard Time)', 4395630592, 1, 'Mozilla/5.0', 'https://sentinel.openai.com/sentinel/20260810913b/sdk.js', null, 'zh-CN', 'zh-CN', 1, 'login−[object NavigatorLogin]', 'cookie', 'scrollX', 1234.5, 'device-id', '', 6, 1_000_000.1, 0, 0, 0, 0, 0, 0, 0]
    const encoded = encodeConfig(config)
    expect(encoded).toBe(Buffer.from(JSON.stringify(config), 'utf8').toString('base64'))
    expect(decodeConfig(encoded)).toEqual(config)
    expect(decodeConfig(encoded)).toHaveLength(25)
  })

  it('matches the SDK FNV-1a 32-bit mix', () => {
    expect(fnv1aHash('abc')).toBe('1cc93dbc')
  })

  it('formats Date.toString using the profile timezone instead of the host timezone', () => {
    const date = new Date('2026-07-19T13:36:16.000Z')
    expect(formatFingerprintDate(date, 8 * 60, 'China Standard Time')).toBe(
      'Sun Jul 19 2026 21:36:16 GMT+0800 (China Standard Time)'
    )
  })

  it('builds a requirements token whose decoded p array matches the session profile', () => {
    const session = createFingerprintSession('token@example.com')
    const token = generateRequirementsToken(session.sentinelSid, session.profile)
    expect(token.startsWith('gAAAAAC')).toBe(true)
    expect(token.endsWith('~S')).toBe(true)
    const config = decodeConfig(token.slice('gAAAAAC'.length, -2))
    expect(config).toHaveLength(25)
    expect(config[0]).toBe(session.profile.screenWidth + session.profile.screenHeight)
    expect(config[2]).toBe(session.profile.jsHeapSizeLimit)
    expect(config[4]).toBe(session.profile.userAgent)
    expect(config[6]).toBeNull()
    expect(config[7]).toBe(session.profile.navigatorLanguage)
    expect(config[14]).toBe(session.sentinelSid)
    expect(config[16]).toBe(session.profile.hardwareConcurrency)
    expect(config[24]).toBe(0)
  })

  it('samples navigator/document/window keys from the Chrome HAR set', () => {
    const session = createFingerprintSession('keys@example.com')
    const config = generateFingerprintData(session.sentinelSid, 1, 0, session.profile, () => 0)
    expect(String(config[10])).toContain('createAuctionNonce')
    expect(typeof config[11]).toBe('string')
    expect(config[12]).toBe('window')
  })
})

describe('Playwright fingerprint injection', () => {
  it('maps the browser profile onto context options and stealth headers', () => {
    const profile = applyChromeVersion(buildBrowserEnvironment({ country: 'CN' }, undefined, 'Linux'), '146.0.0.0')
    const options = playwrightContextOptions(profile)
    expect(options.userAgent).toBe(profile.userAgent)
    expect(options.locale).toBe('zh-CN')
    expect(options.timezoneId).toBe('Asia/Shanghai')
    expect(options.viewport).toEqual({ width: profile.viewportWidth, height: profile.viewportHeight })
    expect(options.screen).toEqual({ width: profile.screenWidth, height: profile.screenHeight })
    expect(options.extraHTTPHeaders?.['Accept-Language']).toContain('zh-CN')
    expect(options.extraHTTPHeaders?.['sec-ch-ua']).toBe(profile.secChUa)
    expect(options.extraHTTPHeaders).not.toHaveProperty('sec-ch-ua-full-version-list')
  })

  it('emits an init script that hides webdriver without spoofing WebGL or plugins', () => {
    const profile = injectionProfile(buildBrowserEnvironment(undefined, undefined, 'Linux'))
    const script = fingerprintInitScript(profile)
    expect(script).toContain('Navigator.prototype, \'webdriver\'')
    expect(script).toContain('hardwareConcurrency')
    expect(script).not.toContain('PDF Viewer')
    expect(script).not.toContain('WebGLRenderingContext')
    expect(playwrightLaunchArgs('zh-CN')).toEqual(expect.arrayContaining([
      '--disable-blink-features=AutomationControlled',
      '--lang=zh-CN'
    ]))
  })

  it('does not send high-entropy Client Hints by default', () => {
    expect(extraHttpHeaders(buildBrowserEnvironment(undefined, undefined, 'Linux'))).not.toHaveProperty('sec-ch-ua-arch')
  })
})

describe('protocol OAuth helpers', () => {
  it('extracts continue_url and MFA factor id from Auth JSON', async () => {
    const { extractContinueUrl, extractFactorId, isEmailOtpStep, isMfaStep } = await import('./openai-protocol-auth.js')
    expect(extractContinueUrl({ page: { continue_url: 'https://auth.openai.com/mfa-challenge/abc' } })).toBe('https://auth.openai.com/mfa-challenge/abc')
    expect(extractFactorId({ page: { payload: { factor_id: 'abc' } } }, '')).toBe('abc')
    expect(isMfaStep({ page: { type: 'mfa_challenge' } }, '')).toBe(true)
    expect(isEmailOtpStep({ page: { type: 'email_verification' } }, '')).toBe(true)
    expect(isEmailOtpStep({ page: { type: 'login_password' } }, 'https://auth.openai.com/log-in/password')).toBe(false)
  })

  it('reads workspace id from oai-client-auth-session cookie', async () => {
    const { workspaceIdFromSessionCookie, isConsentUrl, isCallbackUrl } = await import('./openai-protocol-auth.js')
    const payload = Buffer.from(JSON.stringify({ workspaces: [{ id: 'ws-codex-1', kind: 'organization' }] })).toString('base64url')
    expect(workspaceIdFromSessionCookie(`${payload}.sig.sig`)).toBe('ws-codex-1')
    expect(isConsentUrl('https://auth.openai.com/sign-in-with-chatgpt/codex/consent')).toBe(true)
    expect(isCallbackUrl('http://localhost:1455/auth/callback?code=abc&state=x')).toBe(true)
  })

  it('prefers team workspace over personal space', async () => {
    const { pickPreferredWorkspace, workspacesFromPayload } = await import('./openai-protocol-auth.js')
    const options = workspacesFromPayload({
      'oai-client-auth-session': {
        workspaces: [
          { id: 'personal-1', name: 'Personal', personal: true, structure: 'personal' },
          { id: 'team-9', name: '工作站', kind: 'organization', personal: false }
        ]
      }
    })
    expect(pickPreferredWorkspace(options)).toMatchObject({ id: 'team-9', personal: false })
    expect(pickPreferredWorkspace(workspacesFromPayload({
      workspaces: [{ id: 'only-personal', title: '个人空间', personal: true }]
    }))).toBeNull()
    expect(pickPreferredWorkspace(workspacesFromPayload({
      workspaces: [{ id: 'other-workspace', title: '其他空间', type: 'workspace', personal: false }]
    }))).toBeNull()
  })
})

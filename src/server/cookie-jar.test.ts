import { describe, expect, it } from 'vitest'
import { CookieJar } from './cookie-jar.js'
import { localSentinelHeader } from './sentinel-client.js'
import { createFingerprintSession } from './browser-fingerprint.js'

describe('CookieJar', () => {
  it('stores domain cookies and returns them for matching hosts', () => {
    const jar = new CookieJar()
    jar.applySetCookie('oai-did=abc; Domain=.openai.com; Path=/', 'https://auth.openai.com/log-in')
    jar.applySetCookie(['__cf_bm=token; Domain=.openai.com; Path=/'], 'https://auth.openai.com/log-in')
    expect(jar.header('https://auth.openai.com/api/accounts/password/verify')).toContain('oai-did=abc')
    expect(jar.header('https://auth.openai.com/api/accounts/password/verify')).toContain('__cf_bm=token')
    expect(jar.header('https://example.com/')).toBe('')
  })
})

describe('local Sentinel header', () => {
  it('builds a JSON header with p/c/id/flow', () => {
    const session = createFingerprintSession('sentinel@example.com', null, 'macOS')
    const header = localSentinelHeader({ token: 'challenge-token' }, 'password_verify', session.deviceId, session.profile)
    const parsed = JSON.parse(header) as { p: string; c: string; id: string; flow: string }
    expect(parsed.c).toBe('challenge-token')
    expect(parsed.id).toBe(session.deviceId)
    expect(parsed.flow).toBe('password_verify')
    expect(parsed.p.startsWith('gAAAAA')).toBe(true)
  })
})

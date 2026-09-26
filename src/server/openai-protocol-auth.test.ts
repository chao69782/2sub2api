import { authenticator } from 'otplib'
import { describe, expect, it } from 'vitest'
import { rotateTotpInAuthenticatedSession } from './openai-protocol-auth.js'

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

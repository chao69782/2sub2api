import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { SENTINEL_SV, type BrowserProfile, type FingerprintSession } from './browser-fingerprint.js'
import {
  buildSentinelRequestBody,
  buildSentinelTokenHeader,
  generateRequirementsToken,
  getEnforcementToken
} from './sentinel-fingerprint.js'

const FLOW_PAGE_URL: Record<string, string> = {
  authorize_continue: 'https://auth.openai.com/log-in',
  password_verify: 'https://auth.openai.com/log-in/password',
  username_password_create: 'https://auth.openai.com/log-in/password'
}

export function sentinelAssetPaths(): { runner: string; sdk: string } {
  const root = process.cwd()
  return {
    runner: path.resolve(root, 'sentinel/sentinel-runner.cjs'),
    sdk: path.resolve(root, 'sentinel/sdk.js')
  }
}

export async function runSentinelRunner(input: {
  challenge: Record<string, unknown>
  flow: string
  session: FingerprintSession
  cookie?: string
}): Promise<string> {
  const { runner, sdk } = sentinelAssetPaths()
  if (!fs.existsSync(runner) || !fs.existsSync(sdk)) {
    throw new Error('SENTINEL_ASSETS_MISSING')
  }
  const profile = input.session.profile
  const challengeProof = typeof input.challenge._request_p === 'string' ? input.challenge._request_p : ''
  const challenge = Object.fromEntries(Object.entries(input.challenge).filter(([key]) => key !== '_request_p'))
  const challengeFile = path.join(os.tmpdir(), `sentinel-${input.flow}-${Date.now()}.json`)
  fs.writeFileSync(challengeFile, JSON.stringify(challenge))
  const args = [
    runner,
    '--challenge-file', challengeFile,
    '--sdk', sdk,
    '--flow', input.flow,
    '--device-id', input.session.deviceId,
    '--sentinel-sid', input.session.sentinelSid,
    '--challenge-proof', challengeProof,
    '--react-listening-key', input.session.reactListeningKey,
    '--react-container-key', input.session.reactContainerKey,
    '--react-resources-key', input.session.reactResourcesKey,
    '--page-url', FLOW_PAGE_URL[input.flow] || 'https://auth.openai.com/log-in',
    '--user-agent', profile.userAgent,
    '--browser-family', profile.browserFamily,
    '--navigator-platform', profile.navigatorPlatform,
    '--navigator-vendor', profile.navigatorVendor,
    '--user-agent-data-platform', profile.userAgentDataPlatform,
    '--language', profile.navigatorLanguage,
    '--languages', profile.navigatorLanguages.join(','),
    '--time-zone', profile.timezoneIana,
    '--timezone-name', profile.timezoneName,
    '--timezone-offset-minutes', String(profile.timezoneOffsetMinutes),
    '--width', String(profile.screenWidth),
    '--height', String(profile.screenHeight),
    '--avail-width', String(profile.screenAvailWidth),
    '--avail-height', String(profile.screenAvailHeight),
    '--outer-width', String(profile.outerWidth),
    '--outer-height', String(profile.outerHeight),
    '--inner-width', String(profile.viewportWidth),
    '--inner-height', String(profile.viewportHeight),
    '--color-depth', String(profile.colorDepth),
    '--cores', String(profile.hardwareConcurrency),
    '--cookie', input.cookie || `oai-did=${input.session.deviceId}`,
    '--script-src', `https://sentinel.openai.com/sentinel/${SENTINEL_SV}/sdk.js`,
    '--build-id', ''
  ]
  try {
    return await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, args, { stdio: ['ignore', 'pipe', 'pipe'] })
      let stdout = ''
      let stderr = ''
      child.stdout.on('data', (chunk) => { stdout += String(chunk) })
      child.stderr.on('data', (chunk) => { stderr += String(chunk) })
      const timer = setTimeout(() => {
        child.kill()
        reject(new Error('SENTINEL_RUNNER_TIMEOUT'))
      }, 60_000)
      child.on('error', reject)
      child.on('close', (code) => {
        clearTimeout(timer)
        if (code !== 0) {
          reject(new Error(`sentinel-runner 退出码 ${code}: ${stderr || stdout}`.slice(0, 500)))
          return
        }
        const token = stdout.trim()
        if (!token) {
          reject(new Error(`sentinel-runner 输出为空: ${stderr}`.slice(0, 500)))
          return
        }
        resolve(token)
      })
    })
  } finally {
    fs.unlink(challengeFile, () => undefined)
  }
}

export function localSentinelHeader(
  challenge: Record<string, unknown>,
  flow: string,
  deviceId: string,
  profile?: Partial<BrowserProfile>
): string {
  const p = getEnforcementToken(challenge, deviceId, profile)
  return buildSentinelTokenHeader(p, '', String(challenge.token ?? ''), deviceId, flow)
}

export async function buildSentinelHeaders(input: {
  challenge: Record<string, unknown>
  flow: string
  session: FingerprintSession
  cookie?: string
}): Promise<{ token: string; so?: string }> {
  let raw: string
  try {
    raw = await runSentinelRunner(input)
  } catch (error) {
    if (error instanceof Error && error.message === 'SENTINEL_ASSETS_MISSING') {
      raw = localSentinelHeader(input.challenge, input.flow, input.session.deviceId, input.session.profile)
    } else {
      throw error
    }
  }
  const parsed = JSON.parse(raw) as Record<string, unknown>
  const soValue = parsed._so ?? parsed.so
  delete parsed._so
  delete parsed.so
  const token = JSON.stringify(parsed)
  if (!soValue) return { token }
  return {
    token,
    so: JSON.stringify({
      so: soValue,
      c: parsed.c ?? input.challenge.token ?? '',
      id: input.session.deviceId,
      flow: input.flow
    })
  }
}

export function sentinelRequestProof(session: FingerprintSession, flow: string): string {
  const profile = {
    ...session.profile,
    buildId: null,
    scriptSrcSamples: [`https://sentinel.openai.com/sentinel/${SENTINEL_SV}/sdk.js`]
  }
  const sid = flow === 'password_verify' ? session.sentinelIframeSid : session.sentinelSid
  return generateRequirementsToken(sid, profile)
}

export function sentinelReqBody(session: FingerprintSession, flow: string, proof: string): string {
  return buildSentinelRequestBody(proof, session.deviceId, flow)
}

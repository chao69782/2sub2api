import { authenticator } from 'otplib'
import { SENTINEL_SV, type FingerprintSession } from './browser-fingerprint.js'
import { chromeRequest } from './chrome-http.js'
import { CookieJar } from './cookie-jar.js'
import { ManualActionRequiredError } from './openai-auth-errors.js'
import { buildSentinelHeaders, sentinelReqBody, sentinelRequestProof } from './sentinel-client.js'

export interface ProtocolAuthInput {
  authUrl: string
  email: string
  password: string
  totpSecret: string
  session: FingerprintSession
}

interface JsonRecord {
  [key: string]: unknown
}

function extraHttpHeadersFromProfileLocal(session: FingerprintSession): Record<string, string> {
  const profile = session.profile
  return {
    'user-agent': profile.userAgent,
    'accept-language': profile.acceptLanguage,
    'sec-ch-ua': profile.secChUa,
    'sec-ch-ua-mobile': profile.secChUaMobile,
    'sec-ch-ua-platform': profile.secChUaPlatform
  }
}

export function extractContinueUrl(result: JsonRecord | null | undefined): string {
  if (!result || typeof result !== 'object') return ''
  const page = result.page && typeof result.page === 'object' ? result.page as JsonRecord : {}
  const values = [result.continue_url, result.continueUrl, page.continue_url, page.url, result.url]
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

export function extractFactorId(result: JsonRecord | null | undefined, continueUrl: string): string {
  const page = result?.page && typeof result.page === 'object' ? result.page as JsonRecord : {}
  const payload = page.payload && typeof page.payload === 'object' ? page.payload as JsonRecord : {}
  const fromPayload = String(payload.factor_id || '').trim()
  if (fromPayload) return fromPayload
  if (continueUrl.includes('/mfa-challenge/')) return continueUrl.replace(/\/$/, '').split('/').pop() || ''
  return ''
}

export function isMfaStep(result: JsonRecord | null | undefined, continueUrl: string): boolean {
  const page = result?.page && typeof result.page === 'object' ? result.page as JsonRecord : {}
  const type = String(page.type || result?.type || '').toLowerCase()
  return continueUrl.includes('/mfa-challenge') || type.includes('mfa')
}

export function isEmailOtpStep(result: JsonRecord | null | undefined, continueUrl: string): boolean {
  const page = result?.page && typeof result.page === 'object' ? result.page as JsonRecord : {}
  const type = String(page.type || '').toLowerCase()
  return /email[-_]verification|email[-_]otp/.test(`${continueUrl} ${type}`)
}

export function isCallbackUrl(url: string): boolean {
  return url.startsWith('http://localhost:1455/auth/callback') || url.startsWith('http://127.0.0.1:1455/auth/callback')
}

export function isConsentUrl(url: string): boolean {
  return /sign-in-with-chatgpt\/codex\/consent|\/workspace/.test(url)
}

export function decodeJwtSegment(segment: string): JsonRecord {
  try {
    const padded = segment.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - segment.length % 4) % 4)
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as JsonRecord
  } catch {
    return {}
  }
}

export interface WorkspaceOption {
  id: string
  name: string
  personal: boolean
  organization: boolean
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}
}

function decodeMaybeUri(value: string): string {
  const trimmed = value.trim().replace(/^"|"$/g, '')
  try { return decodeURIComponent(trimmed) } catch { return trimmed }
}

export function parseSessionPayload(raw: string): JsonRecord {
  const value = decodeMaybeUri(raw)
  if (!value) return {}
  if (value.startsWith('{') || value.startsWith('[')) {
    try { return JSON.parse(value) as JsonRecord } catch { return {} }
  }
  return decodeJwtSegment(value.split('.')[0] || '')
}

function workspaceName(item: JsonRecord): string {
  return String(item.name || item.title || item.workspace_name || item.workspaceName || item.display_name || '').trim()
}

function workspaceId(item: JsonRecord): string {
  return String(item.id || item.workspace_id || item.workspaceId || item.account_id || item.organization_id || '').trim()
}

function workspaceKind(item: JsonRecord): string {
  return String(item.kind || item.workspace_kind || item.workspaceKind || item.type || '').trim().toLowerCase()
}

export function isPersonalWorkspace(item: JsonRecord): boolean {
  const kind = workspaceKind(item)
  if (kind === 'personal' || kind === 'user') return true
  if (kind === 'organization' || kind === 'team' || kind === 'workspace' || kind === 'business' || kind === 'enterprise') return false
  if (item.personal === true || item.is_personal === true || item.isPersonal === true) return true
  const hay = `${item.kind || ''} ${item.structure || ''} ${item.type || ''} ${item.workspace_type || ''} ${item.plan_type || ''} ${workspaceName(item)}`.toLowerCase()
  if (/workspace|team|business|enterprise|organization|工作站|团队|公司/.test(hay)) return false
  return /personal|个人|free|guest/.test(hay)
}

function isOrganizationWorkspace(item: JsonRecord): boolean {
  const kind = workspaceKind(item)
  if (kind === 'organization') return true
  if (item.organization === true || item.is_organization === true || item.isOrganization === true) return true
  return false
}

export function workspacesFromPayload(payload: JsonRecord | null | undefined): WorkspaceOption[] {
  const root = asRecord(payload)
  const session = asRecord(root['oai-client-auth-session'] || root.session || root)
  const lists = [
    session.workspaces,
    session.accounts,
    asRecord(session.orgs).data,
    session.organizations,
    root.workspaces,
    root.accounts
  ]
  const out: WorkspaceOption[] = []
  const seen = new Set<string>()
  for (const list of lists) {
    if (!Array.isArray(list)) continue
    for (const entry of list) {
      const item = asRecord(entry)
      const nested = asRecord(item.account)
      const merged = { ...nested, ...item }
      const id = workspaceId(merged)
      if (!id || seen.has(id)) continue
      seen.add(id)
      out.push({
        id,
        name: workspaceName(merged),
        personal: isPersonalWorkspace(merged),
        organization: isOrganizationWorkspace(merged)
      })
    }
  }
  return out
}

export function workspacesFromHtml(html: string): WorkspaceOption[] {
  const out: WorkspaceOption[] = []
  const next = html.match(/<script id="__NEXT_DATA__"[^>]*>([^<]+)<\/script>/i)
  if (next?.[1]) {
    try { out.push(...workspacesFromPayload(JSON.parse(next[1]) as JsonRecord)) } catch { /* ignore */ }
  }
  for (const match of html.matchAll(/"workspaces"\s*:\s*(\[[\s\S]*?\])/g)) {
    try {
      out.push(...workspacesFromPayload({ workspaces: JSON.parse(match[1]!) }))
    } catch { /* ignore */ }
  }
  return out
}

export function pickPreferredWorkspace(options: WorkspaceOption[]): WorkspaceOption | null {
  return options.find((item) => item.organization) || null
}

export function workspaceIdFromSessionCookie(raw: string): string {
  return pickPreferredWorkspace(workspacesFromPayload(parseSessionPayload(raw)))?.id || ''
}

function extractNextUrl(result: JsonRecord, location: string | null): string {
  if (location) return location
  for (const key of ['redirect_url', 'continue_url', 'url', 'next', 'location']) {
    const value = result[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  const page = result.page && typeof result.page === 'object' ? result.page as JsonRecord : {}
  for (const key of ['redirect_url', 'continue_url', 'url', 'next']) {
    const value = page[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

class AuthHttpClient {
  constructor(
    private readonly session: FingerprintSession,
    readonly cookies: CookieJar
  ) {}

  private commonHeaders(): Record<string, string> {
    return extraHttpHeadersFromProfileLocal(this.session)
  }

  navigateHeaders(referer = ''): Record<string, string> {
    return {
      ...this.commonHeaders(),
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'sec-fetch-site': referer ? 'cross-site' : 'none',
      'sec-fetch-mode': 'navigate',
      'sec-fetch-dest': 'document',
      'upgrade-insecure-requests': '1',
      ...(referer ? { referer } : { 'sec-fetch-user': '?1' })
    }
  }

  authHeaders(referer: string): Record<string, string> {
    return {
      ...this.commonHeaders(),
      accept: 'application/json',
      'content-type': 'application/json',
      origin: 'https://auth.openai.com',
      referer,
      'sec-fetch-site': 'same-origin',
      'sec-fetch-mode': 'cors',
      'sec-fetch-dest': 'empty'
    }
  }

  sentinelHeaders(): Record<string, string> {
    return {
      ...this.commonHeaders(),
      accept: 'application/json',
      'content-type': 'application/json',
      origin: 'https://auth.openai.com',
      referer: `https://sentinel.openai.com/backend-api/sentinel/frame.html?sv=${SENTINEL_SV}`,
      'oai-device-id': this.session.deviceId,
      'sec-fetch-site': 'same-site',
      'sec-fetch-mode': 'cors',
      'sec-fetch-dest': 'empty'
    }
  }

  request(url: string, init: { method?: string; headers?: Record<string, string>; body?: string } = {}) {
    return chromeRequest(this.cookies, url, init)
  }

  async follow(url: string, headers: Record<string, string>, limit = 12): Promise<{ status: number; url: string; text: string; headers: Headers }> {
    let current = url
    let last = { status: 0, url, text: '', headers: new Headers() }
    for (let i = 0; i < limit; i++) {
      const response = await this.request(current, { headers })
      last = { status: response.status, url: current, text: response.text, headers: response.headers }
      if (response.status === 403 || response.status === 429) {
        throw new ManualActionRequiredError(
          `OpenAI 登录触发安全验证（HTTP ${response.status}）：${current}`,
          'OPENAI_SECURITY_CHALLENGE'
        )
      }
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location')
        if (!location) break
        const next = new URL(location, current).toString()
        if (next.startsWith('http://localhost:1455/auth/callback') || next.startsWith('http://127.0.0.1:1455/auth/callback')) {
          return { status: 302, url: next, text: '', headers: response.headers }
        }
        current = next
        continue
      }
      return { status: response.status, url: current, text: response.text, headers: response.headers }
    }
    return last
  }
}

async function requestSentinel(client: AuthHttpClient, session: FingerprintSession, flow: string): Promise<{ token: string; so?: string }> {
  const frameUrl = `https://sentinel.openai.com/backend-api/sentinel/frame.html?sv=${SENTINEL_SV}`
  await client.request(frameUrl, { headers: client.navigateHeaders('https://auth.openai.com/') })
  const proof = sentinelRequestProof(session, flow)
  const body = sentinelReqBody(session, flow, proof)
  const response = await client.request('https://sentinel.openai.com/backend-api/sentinel/req', {
    method: 'POST',
    headers: client.sentinelHeaders(),
    body
  })
  if (response.status >= 400) {
    throw new ManualActionRequiredError(
      `Sentinel challenge 请求失败（HTTP ${response.status}）`,
      'OPENAI_SECURITY_CHALLENGE'
    )
  }
  const challenge: JsonRecord = { ...response.json(), _request_p: proof }
  const pow = challenge.proofofwork && typeof challenge.proofofwork === 'object' ? challenge.proofofwork as JsonRecord : {}
  const turnstile = challenge.turnstile && typeof challenge.turnstile === 'object' ? challenge.turnstile as JsonRecord : {}
  console.info(`[sentinel] flow=${flow} pow=${Boolean(pow.required)} turnstile=${Boolean(turnstile.required)}`)
  return buildSentinelHeaders({
    challenge,
    flow,
    session,
    cookie: client.cookies.snapshot()
  })
}

async function postAuth(client: AuthHttpClient, url: string, payload: JsonRecord, referer: string, sentinel?: { token: string; so?: string }): Promise<{ status: number; json: JsonRecord; text: string; location: string }> {
  const headers = client.authHeaders(referer)
  if (sentinel?.token) headers['openai-sentinel-token'] = sentinel.token
  if (sentinel?.so) headers['openai-sentinel-so-token'] = sentinel.so
  const response = await client.request(url, { method: 'POST', headers, body: JSON.stringify(payload) })
  if (response.status === 403 || response.status === 429) {
    throw new ManualActionRequiredError(
      `OpenAI 登录触发安全验证（HTTP ${response.status}）：${url}`,
      'OPENAI_SECURITY_CHALLENGE'
    )
  }
  const json = response.json()
  ingestAuthSessionCookie(client, json)
  return {
    status: response.status,
    json,
    text: response.text,
    location: response.headers.get('location') || ''
  }
}

function ingestAuthSessionCookie(client: AuthHttpClient, json: JsonRecord): void {
  const session = json['oai-client-auth-session']
  if (!session || typeof session !== 'object') return
  const encoded = encodeURIComponent(JSON.stringify(session))
  client.cookies.applySetCookie(`oai-client-auth-session=${encoded}; Domain=.openai.com; Path=/`, 'https://auth.openai.com/')
}

async function followToCallback(client: AuthHttpClient, startUrl: string, referer: string): Promise<{ url: string; text: string }> {
  if (isCallbackUrl(startUrl)) return { url: startUrl, text: '' }
  const finished = await client.follow(startUrl, client.navigateHeaders(referer))
  if (isCallbackUrl(finished.url)) return { url: finished.url, text: finished.text }
  const code = (() => {
    try { return new URL(finished.url).searchParams.get('code') } catch { return null }
  })()
  const state = (() => {
    try { return new URL(finished.url).searchParams.get('state') } catch { return null }
  })()
  if (code && state) return { url: finished.url, text: finished.text }
  if (isConsentUrl(finished.url)) return { url: finished.url, text: finished.text }
  throw new ManualActionRequiredError(`未拿到 OAuth 回调：${finished.url} ${finished.text.slice(0, 160)}`)
}

function collectWorkspaces(client: AuthHttpClient, ...payloads: Array<JsonRecord | string | null | undefined>): WorkspaceOption[] {
  const found: WorkspaceOption[] = []
  for (const cookie of client.cookies.all()) {
    if (!/auth-session|workspace|account/i.test(cookie.name)) continue
    found.push(...workspacesFromPayload(parseSessionPayload(cookie.value)))
  }
  for (const payload of payloads) {
    if (!payload) continue
    if (typeof payload === 'string') found.push(...workspacesFromHtml(payload), ...workspacesFromPayload(parseSessionPayload(payload)))
    else found.push(...workspacesFromPayload(payload))
  }
  const unique = new Map<string, WorkspaceOption>()
  for (const item of found) unique.set(item.id, item)
  return [...unique.values()]
}

export async function authorizeWithSentinel(input: ProtocolAuthInput): Promise<string> {
  const cookies = new CookieJar()
  cookies.applySetCookie(`oai-did=${input.session.deviceId}; Domain=.openai.com; Path=/`, 'https://auth.openai.com/')
  cookies.applySetCookie(`oai-locale=${input.session.profile.navigatorLanguage}; Domain=.openai.com; Path=/`, 'https://auth.openai.com/')
  const client = new AuthHttpClient(input.session, cookies)
  console.info(`[sentinel] protocol authorize start device_id=${input.session.deviceId.slice(0, 12)} ua=${input.session.profile.userAgent.slice(0, 72)}`)

  const authPage = await client.follow(input.authUrl, client.navigateHeaders(''))
  if (authPage.status >= 400) {
    throw new ManualActionRequiredError(
      `OpenAI 登录触发安全验证（HTTP ${authPage.status}）：${authPage.url}`,
      'OPENAI_SECURITY_CHALLENGE'
    )
  }

  const emailSentinel = await requestSentinel(client, input.session, 'authorize_continue')
  const emailResult = await postAuth(
    client,
    'https://auth.openai.com/api/accounts/authorize/continue',
    { username: { kind: 'email', value: input.email } },
    'https://auth.openai.com/log-in',
    emailSentinel
  )
  if (emailResult.status >= 400) {
    throw new ManualActionRequiredError(`提交邮箱失败（HTTP ${emailResult.status}）：${emailResult.text.slice(0, 220)}`)
  }
  if (isEmailOtpStep(emailResult.json, extractContinueUrl(emailResult.json))) {
    throw new ManualActionRequiredError('当前页面要求邮箱验证码，本工作台只支持邮箱+密码+2FA')
  }

  const passwordSentinel = await requestSentinel(client, input.session, 'password_verify')
  const passwordResult = await postAuth(
    client,
    'https://auth.openai.com/api/accounts/password/verify',
    { password: input.password },
    'https://auth.openai.com/log-in/password',
    passwordSentinel
  )
  if (passwordResult.status >= 400) {
    throw new ManualActionRequiredError(`密码验证失败（HTTP ${passwordResult.status}）：${passwordResult.text.slice(0, 220)}`)
  }
  let continueUrl = extractContinueUrl(passwordResult.json)
  let result = passwordResult.json
  if (isEmailOtpStep(result, continueUrl)) {
    throw new ManualActionRequiredError('密码验证后要求邮箱验证码，本工作台只支持邮箱+密码+2FA')
  }
  if (isMfaStep(result, continueUrl)) {
    const factorId = extractFactorId(result, continueUrl)
    if (!factorId) throw new ManualActionRequiredError('密码验证后进入 2FA，但未返回 factor_id')
    const issued = await postAuth(
      client,
      'https://auth.openai.com/api/accounts/mfa/issue_challenge',
      { id: factorId, type: 'totp', force_fresh_challenge: false },
      'https://auth.openai.com/mfa-challenge'
    )
    if (issued.status >= 400) {
      throw new ManualActionRequiredError(`发起 2FA 失败（HTTP ${issued.status}）：${issued.text.slice(0, 220)}`)
    }
    const verified = await postAuth(
      client,
      'https://auth.openai.com/api/accounts/mfa/verify',
      { id: factorId, type: 'totp', code: authenticator.generate(input.totpSecret) },
      `https://auth.openai.com/mfa-challenge/${factorId}`
    )
    if (verified.status >= 400) {
      throw new ManualActionRequiredError(`2FA 验证失败（HTTP ${verified.status}）：${verified.text.slice(0, 220)}`)
    }
    continueUrl = extractContinueUrl(verified.json) || continueUrl
    result = verified.json
  }
  if (!continueUrl) {
    throw new ManualActionRequiredError(`登录成功但没有 OAuth 回调地址：${JSON.stringify(result).slice(0, 220)}`)
  }
  if (!continueUrl.startsWith('http')) continueUrl = `https://auth.openai.com${continueUrl}`
  ingestAuthSessionCookie(client, result)
  const knownWorkspaces = collectWorkspaces(client, result, emailResult.json, passwordResult.json)
  if (knownWorkspaces.length > 0 && !pickPreferredWorkspace(knownWorkspaces)) {
    throw new ManualActionRequiredError('未检测到组织空间（Team），仅检测到个人空间或其他 workspace，未导入 Sub2API', 'PERSONAL_WORKSPACE_ONLY')
  }
  let afterLogin = await followToCallback(client, continueUrl, 'https://auth.openai.com/log-in/password')
  if (isCallbackUrl(afterLogin.url)) return afterLogin.url
  if (isConsentUrl(afterLogin.url)) {
    const listed = await client.request('https://auth.openai.com/api/accounts/workspace/list', {
      headers: client.authHeaders('https://auth.openai.com/sign-in-with-chatgpt/codex/consent')
    }).catch(() => null)
    const workspaces = collectWorkspaces(
      client,
      result,
      emailResult.json,
      passwordResult.json,
      afterLogin.text,
      listed?.json() ?? null
    )
    const selectedWorkspace = pickPreferredWorkspace(workspaces)
    if (!selectedWorkspace) {
      throw new ManualActionRequiredError('未检测到组织空间（Team），仅检测到个人空间或其他 workspace，未导入 Sub2API', 'PERSONAL_WORKSPACE_ONLY')
    }
    console.info(`[sentinel] consent workspace_id=${selectedWorkspace.id} name=${selectedWorkspace.name || '-'} personal=${selectedWorkspace.personal}`)
    const selected = await postAuth(
      client,
      'https://auth.openai.com/api/accounts/workspace/select',
      { workspace_id: selectedWorkspace.id },
      'https://auth.openai.com/sign-in-with-chatgpt/codex/consent'
    )
    if (selected.status >= 400) {
      throw new ManualActionRequiredError(`选择 workspace 失败（HTTP ${selected.status}）：${selected.text.slice(0, 220)}`)
    }
    const selectedNext = extractNextUrl(selected.json, selected.location)
    if (!selectedNext) {
      throw new ManualActionRequiredError(`workspace/select 后没有下一跳：${selected.text.slice(0, 220)}`)
    }
    const selectedUrl = selectedNext.startsWith('http') ? selectedNext : `https://auth.openai.com${selectedNext}`
    afterLogin = await followToCallback(client, selectedUrl, 'https://auth.openai.com/sign-in-with-chatgpt/codex/consent')
    if (isCallbackUrl(afterLogin.url)) return afterLogin.url
  }
  throw new ManualActionRequiredError(`未拿到 OAuth 回调：${afterLogin.url}`)
}

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify'
import cookie from '@fastify/cookie'
import fastifyStatic from '@fastify/static'
import { z } from 'zod'
import type { AccountImportOverrides, AccountUsageSummary, ImportDefaults, ManagedAccount, RuntimeSettings, UsageAvailabilityEstimate, UsageWindowKind, UsageWindowSummary } from '../shared/types.js'
import { AuthService } from './auth.js'
import type { AppConfig } from './config.js'
import { configRuntimeSettings } from './config.js'
import { SecretCipher } from './crypto.js'
import type { WorkbenchDatabase } from './db.js'
import { parseCredentialText, normalizeTotpSecret } from './import-parser.js'
import { AccountRepository, JobRepository, SettingsRepository, type WorkbenchJob } from './repositories.js'
import { Sub2APIClient, Sub2APIError, sub2apiTokenExpiresAt, type Sub2APIAccount } from './sub2api.js'
import { ManualActionRequiredError, OpenAIAuthDriver } from './openai-auth-driver.js'

const schedulerSchema = z.object({
  checkIntervalMinutes: z.number().int().min(1).max(1440)
})
const TOKEN_REFRESH_WINDOW_MINUTES = 15
const REAUTH_FAILURE_COOLDOWN_HOURS = 6
const modelWhitelistSchema = z.array(z.string().trim().min(1).max(200).refine((value) => !value.includes('*'), '模型白名单只允许填写准确的模型 ID'))
const importProfileShape = {
  modelWhitelist: modelWhitelistSchema,
  concurrency: z.number().int().min(0).max(1000),
  priority: z.number().int().min(0).max(100000),
  groupIds: z.array(z.number().int().positive()),
  loadFactor: z.number().int().min(1).max(10000).nullable(),
  autoPauseOnExpired: z.boolean(),
  proxyPolicy: z.enum(['auto', 'direct', 'fixed']),
  fixedProxyId: z.number().int().positive().nullable()
} as const
const validateImportProfile = (
  value: { modelWhitelist: string[]; proxyPolicy: 'auto' | 'direct' | 'fixed'; fixedProxyId: number | null },
  ctx: z.RefinementCtx
) => {
  if (new Set(value.modelWhitelist).size !== value.modelWhitelist.length) {
    ctx.addIssue({ code: 'custom', path: ['modelWhitelist'], message: '模型白名单中存在重复 ID' })
  }
  if (value.proxyPolicy === 'fixed' && !value.fixedProxyId) {
    ctx.addIssue({ code: 'custom', message: 'fixedProxyId is required for fixed proxy policy' })
  }
}
const accountImportOverridesSchema = z.object(importProfileShape).superRefine(validateImportProfile)
const importDefaultsSchema = z.object({
  ...importProfileShape,
  modelMapping: z.record(z.string().min(1), z.string().min(1)),
}).superRefine(validateImportProfile)
const runtimeSettingsSchema = z.object({
  scheduler: schedulerSchema,
  importDefaults: importDefaultsSchema
})

export function buildModelRestrictionMapping(modelWhitelist: string[], explicitMapping: Record<string, string>): Record<string, string> {
  return Object.assign(Object.fromEntries(modelWhitelist.map((modelId) => [modelId, modelId])), explicitMapping)
}

export function resolveAccountImportDefaults(globalDefaults: ImportDefaults, overrides: AccountImportOverrides | null): ImportDefaults {
  return overrides ? { ...globalDefaults, ...overrides, modelMapping: globalDefaults.modelMapping } : globalDefaults
}

export function buildSub2apiCredentialsUpdate(
  remoteCredentials: Record<string, unknown> | undefined,
  email: string,
  modelMapping: Record<string, string>
): Record<string, unknown> {
  return {
    ...buildSub2apiEmailCredentialUpdate(remoteCredentials, email),
    model_mapping: modelMapping
  }
}

export function buildSub2apiEmailCredentialUpdate(
  remoteCredentials: Record<string, unknown> | undefined,
  email: string
): Record<string, unknown> {
  return { ...remoteCredentials, email: email.trim().toLowerCase() }
}

function sourceIp(request: FastifyRequest): string {
  return request.ip || request.socket.remoteAddress || ''
}

function redactAuditDetails(value: Record<string, unknown>): Record<string, unknown> {
  const blocked = new Set(['password', 'totpSecret', 'access_token', 'refresh_token', 'id_token', 'adminKey'])
  return Object.fromEntries(Object.entries(value).filter(([key]) => !blocked.has(key)))
}

function summarizeUsageWindow(accounts: ManagedAccount[], field: 'usageFiveHourPercent' | 'usageSevenDayPercent'): UsageWindowSummary {
  let total = 0
  let queriedCount = 0
  for (const account of accounts) {
    const value = account[field]
    if (typeof value !== 'number' || !Number.isFinite(value)) continue
    total += value
    queriedCount += 1
  }
  return { averagePercent: queriedCount ? total / queriedCount : null, queriedCount }
}

const usageWindowDefinitions: Array<{
  kind: UsageWindowKind
  durationSeconds: number
  percentField: 'usageFiveHourPercent' | 'usageSevenDayPercent'
  remainingField: 'usageFiveHourRemainingSeconds' | 'usageSevenDayRemainingSeconds'
}> = [
  { kind: 'five_hour', durationSeconds: 5 * 60 * 60, percentField: 'usageFiveHourPercent', remainingField: 'usageFiveHourRemainingSeconds' },
  { kind: 'seven_day', durationSeconds: 7 * 24 * 60 * 60, percentField: 'usageSevenDayPercent', remainingField: 'usageSevenDayRemainingSeconds' }
]

function estimateWindowAvailability(
  accounts: ManagedAccount[],
  definition: typeof usageWindowDefinitions[number]
): UsageAvailabilityEstimate | null {
  let remainingCapacity = 0
  let consumptionRatePerSecond = 0
  let earliestResetSeconds = Number.POSITIVE_INFINITY
  let sampleCount = 0

  for (const account of accounts) {
    const utilization = account[definition.percentField]
    const remainingSeconds = account[definition.remainingField]
    if (
      typeof utilization !== 'number' || !Number.isFinite(utilization) || utilization < 0 || utilization >= 100 ||
      typeof remainingSeconds !== 'number' || !Number.isFinite(remainingSeconds) || remainingSeconds < 0 || remainingSeconds > definition.durationSeconds
    ) continue
    const elapsedSeconds = definition.durationSeconds - remainingSeconds
    if (elapsedSeconds < 60) continue
    remainingCapacity += 100 - utilization
    consumptionRatePerSecond += utilization / elapsedSeconds
    earliestResetSeconds = Math.min(earliestResetSeconds, remainingSeconds)
    sampleCount += 1
  }

  if (!sampleCount || !Number.isFinite(earliestResetSeconds)) return null
  const secondsUntilExhaustion = consumptionRatePerSecond > 0 ? remainingCapacity / consumptionRatePerSecond : Number.POSITIVE_INFINITY
  const exhaustsBeforeReset = secondsUntilExhaustion < earliestResetSeconds
  return {
    status: exhaustsBeforeReset ? 'exhausts_before_reset' : 'sustainable_until_reset',
    remainingSeconds: Math.max(0, Math.round(exhaustsBeforeReset ? secondsUntilExhaustion : earliestResetSeconds)),
    limitingWindow: definition.kind,
    consumptionRatePercentPerHour: Number(((consumptionRatePerSecond * 60 * 60) / sampleCount).toFixed(2)),
    sampleCount
  }
}

export function estimateAccountUsageAvailability(accounts: ManagedAccount[]): UsageAvailabilityEstimate {
  const estimates = usageWindowDefinitions
    .map((definition) => estimateWindowAvailability(accounts, definition))
    .filter((estimate): estimate is UsageAvailabilityEstimate => estimate !== null)
  const exhausting = estimates
    .filter((estimate) => estimate.status === 'exhausts_before_reset')
    .sort((left, right) => (left.remainingSeconds ?? Number.POSITIVE_INFINITY) - (right.remainingSeconds ?? Number.POSITIVE_INFINITY))[0]
  if (exhausting) return exhausting
  const sustainable = estimates
    .sort((left, right) => (left.remainingSeconds ?? Number.POSITIVE_INFINITY) - (right.remainingSeconds ?? Number.POSITIVE_INFINITY))[0]
  return sustainable ?? {
    status: 'insufficient_data', remainingSeconds: null, limitingWindow: null,
    consumptionRatePercentPerHour: null, sampleCount: 0
  }
}

function summarizeAccountUsage(accounts: ManagedAccount[]): AccountUsageSummary {
  const eligibleAccounts = accounts.filter((account) => {
    const knownValues = [account.usageFiveHourPercent, account.usageSevenDayPercent]
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
    return knownValues.length > 0 && knownValues.every((value) => value < 100)
  })
  return {
    accountCount: accounts.length,
    eligibleAccountCount: eligibleAccounts.length,
    fiveHour: summarizeUsageWindow(eligibleAccounts, 'usageFiveHourPercent'),
    sevenDay: summarizeUsageWindow(eligibleAccounts, 'usageSevenDayPercent'),
    availability: estimateAccountUsageAvailability(eligibleAccounts)
  }
}

export async function buildApp(config: AppConfig, db: WorkbenchDatabase): Promise<FastifyInstance> {
  const app = Fastify({
    trustProxy: config.server.trust_proxy,
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
      redact: ['req.headers.cookie', 'req.headers.x-api-key', 'body.password', 'body.totpSecret']
    }
  })
  await app.register(cookie, { secret: config.sessionSecret, hook: 'onRequest' })

  const auth = new AuthService(db, config)
  const accounts = new AccountRepository(db, new SecretCipher(config.masterKey))
  const jobs = new JobRepository(db)
  const settings = new SettingsRepository(db, configRuntimeSettings(config))
  const sub2api = new Sub2APIClient(config)
  const authDriver = new OpenAIAuthDriver()

  const validateImportTarget = async (profile: AccountImportOverrides | ImportDefaults) => {
    if (profile.groupIds.length) {
      const groups = await sub2api.listGroups()
      const validGroupIds = new Set(groups.filter((group) => group.platform === 'openai').map((group) => group.id))
      if (profile.groupIds.some((groupId) => !validGroupIds.has(groupId))) throw new Error('包含无效的 OpenAI 分组 ID')
    }
    if (profile.proxyPolicy === 'fixed') await sub2api.selectProxy('fixed', profile.fixedProxyId)
  }

  const audit = (request: FastifyRequest, action: string, result: string, accountId?: string, details: Record<string, unknown> = {}) => {
    db.prepare(`INSERT INTO audit_events(id, actor, action, account_id, result, details_json, source_ip, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(crypto.randomUUID(), request.authUser?.username ?? 'system', action, accountId ?? null, result, JSON.stringify(redactAuditDetails(details)), sourceIp(request), new Date().toISOString())
  }
  const systemAudit = (action: string, result: string, accountId?: string, details: Record<string, unknown> = {}) => {
    db.prepare(`INSERT INTO audit_events(id, actor, action, account_id, result, details_json, created_at) VALUES (?, 'system', ?, ?, ?, ?, ?)`)
      .run(crypto.randomUUID(), action, accountId ?? null, result, JSON.stringify(redactAuditDetails(details)), new Date().toISOString())
  }

  const beginOAuth = async (accountId: string) => {
    const account = accounts.get(accountId)
    if (!account) throw new Error('ACCOUNT_NOT_FOUND')
    const defaults = resolveAccountImportDefaults(settings.get().value.importDefaults, account.importOverrides)
    const proxy = await sub2api.selectProxy(defaults.proxyPolicy, defaults.fixedProxyId)
    const generated = await sub2api.generateOpenAIAuthUrl(null)
    const state = new URL(generated.auth_url).searchParams.get('state')
    if (!state) throw new Error('Sub2API 授权 URL 缺少 state')
    const sessionId = accounts.createOAuthSession({
      accountId, sub2apiSessionId: generated.session_id, state,
      proxyId: proxy?.id ?? null, authUrl: generated.auth_url
    })
    accounts.setOAuthPending(accountId, proxy?.id ?? null)
    return {
      sessionId,
      authUrl: generated.auth_url,
      proxy: proxy ? { id: proxy.id, name: proxy.name } : null,
      expiresInSeconds: 600
    }
  }

  const completeOAuth = async (accountId: string, callbackUrl: string, accountName: string) => {
    const callback = new URL(callbackUrl)
    const code = callback.searchParams.get('code')
    const state = callback.searchParams.get('state')
    if (!code || !state) throw new Error('CALLBACK_INVALID')
    const oauth = accounts.getOAuthSession(accountId, state)
    const account = accounts.get(accountId)
    if (!oauth || !account) throw new Error('OAUTH_SESSION_INVALID')
    const defaults = resolveAccountImportDefaults(settings.get().value.importDefaults, account.importOverrides)
    const proxyId = typeof oauth.proxy_id === 'number' ? oauth.proxy_id : null
    let remote: Sub2APIAccount
    if (account.sub2apiAccountId) {
      const token = await sub2api.exchangeCode({
        session_id: String(oauth.sub2api_session_id), code, state,
        ...(proxyId ? { proxy_id: proxyId } : {})
      })
      const credentials: Record<string, unknown> = {}
      for (const key of ['access_token', 'refresh_token', 'id_token', 'client_id', 'email', 'chatgpt_account_id', 'chatgpt_user_id', 'organization_id', 'plan_type', 'subscription_expires_at']) {
        if (token[key] !== undefined && token[key] !== '') credentials[key] = token[key]
      }
      if (typeof token.expires_at === 'number') credentials.expires_at = new Date(token.expires_at * 1000).toISOString()
      remote = await sub2api.applyOAuthCredentials(account.sub2apiAccountId, credentials)
    } else {
      remote = await sub2api.createFromOAuth({
        session_id: String(oauth.sub2api_session_id), code, state,
        ...(proxyId ? { proxy_id: proxyId } : {}),
        name: accountName,
        concurrency: defaults.concurrency,
        priority: defaults.priority,
        group_ids: defaults.groupIds
      })
    }
    const modelMapping = buildModelRestrictionMapping(defaults.modelWhitelist, defaults.modelMapping)
    remote = await sub2api.updateAccount(remote.id, {
      name: accountName,
      credentials: buildSub2apiCredentialsUpdate(remote.credentials, account.email, modelMapping),
      concurrency: defaults.concurrency,
      priority: defaults.priority,
      group_ids: defaults.groupIds,
      ...(proxyId ? { proxy_id: proxyId } : {}),
      load_factor: defaults.loadFactor,
      auto_pause_on_expired: defaults.autoPauseOnExpired
    })
    // A successful OAuth flow must clear the remote error flag before the
    // account is returned to Sub2API's scheduler.  Sub2API owns the remote
    // error state; the workbench only restores the account after reauth.
    await sub2api.clearAccountError(remote.id)
    remote = await sub2api.setAccountSchedulable(remote.id, true)
    accounts.consumeOAuthSession(String(oauth.id))
    accounts.linkRemote(accountId, { id: remote.id, name: remote.name, expiresAt: sub2apiTokenExpiresAt(remote) }, proxyId)
    const usage = await sub2api.queryAccountUsage(remote.id).catch(() => null)
    if (usage) accounts.syncRemote(accountId, { id: remote.id, name: remote.name, expiresAt: sub2apiTokenExpiresAt(remote), five_hour: usage.five_hour, seven_day: usage.seven_day })
    accounts.markHealth(accountId, { status: usage ? 'healthy' : 'unknown', summary: usage ? '用量窗口查询成功' : null })
    return { account: accounts.get(accountId), remote, usage, proxyId }
  }

  const runManagedOAuth = async (accountId: string, requestedAccountName?: string) => {
    const account = accounts.get(accountId)
    if (!account) throw new Error('ACCOUNT_NOT_FOUND')
    const secrets = accounts.getSecrets(accountId)
    const started = await beginOAuth(accountId)
    const callbackUrl = await authDriver.authorize({
      authUrl: started.authUrl,
      email: account.email,
      ...secrets
    })
    return completeOAuth(accountId, callbackUrl, requestedAccountName?.trim() || account.sub2apiAccountName || account.email)
  }

  app.get('/health/live', async () => ({ status: 'live' }))
  app.get('/health/ready', async (_request, reply) => {
    try {
      db.prepare('SELECT 1').get()
      return { status: 'ready' }
    } catch {
      return reply.code(503).send({ status: 'not_ready' })
    }
  })

  app.post('/api/auth/login', async (request, reply) => {
    const body = z.object({ username: z.string(), password: z.string().min(1) }).parse(request.body)
    try {
      const session = await auth.login(body.username, body.password, sourceIp(request))
      auth.setSessionCookie(reply, session.token)
      audit(request, 'auth.login', 'success')
      return { user: { username: config.auth.username }, csrfToken: session.csrfToken }
    } catch (error) {
      audit(request, 'auth.login', 'failed')
      const locked = error instanceof Error && error.message === 'LOGIN_LOCKED'
      return reply.code(locked ? 429 : 401).send({ code: locked ? 'LOGIN_LOCKED' : 'INVALID_CREDENTIALS', message: locked ? '登录尝试过多，请稍后再试' : '账号或密码错误' })
    }
  })

  app.addHook('onRequest', async (request, reply) => {
    if (!request.url.startsWith('/api/') || request.url === '/api/auth/login') return
    const session = auth.authenticate(request)
    if (!session) return reply.code(401).send({ code: 'UNAUTHORIZED', message: '请先登录' })
    request.authUser = session
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      const csrf = request.headers['x-csrf-token']
      if (typeof csrf !== 'string' || csrf !== session.csrfToken) {
        return reply.code(403).send({ code: 'CSRF_INVALID', message: '请求校验失败，请刷新页面重试' })
      }
    }
  })

  app.get('/api/auth/me', async (request) => ({ user: { username: request.authUser!.username }, csrfToken: request.authUser!.csrfToken }))
  app.post('/api/auth/logout', async (request, reply) => {
    auth.logout(request)
    reply.clearCookie('workbench_session', { path: '/' })
    audit(request, 'auth.logout', 'success')
    return { ok: true }
  })

  app.get('/api/accounts', async (request) => {
    const query = z.object({ search: z.string().optional() }).parse(request.query)
    const allAccounts = accounts.list()
    return {
      items: query.search?.trim() ? accounts.list(query.search) : allAccounts,
      usageSummary: summarizeAccountUsage(allAccounts)
    }
  })

  app.get('/api/accounts/export.txt', async (_request, reply) => {
    const query = z.object({ ids: z.string().optional() }).parse(_request.query)
    const requestedIds = query.ids ? new Set(query.ids.split(',').filter(Boolean)) : new Set<string>()
    const selected = accounts.list().filter((account) => requestedIds.has(account.id))
    if (!selected.length) return reply.code(400).send({ code: 'NO_ACCOUNTS_SELECTED', message: '请先选择要导出的账号' })
    const lines = selected.map((account) => {
      const secrets = accounts.getSecrets(account.id)
      return `${account.email}---${secrets.password}---${secrets.totpSecret}`
    })
    return reply
      .header('content-type', 'text/plain; charset=utf-8')
      .header('content-disposition', 'attachment; filename="accounts.txt"')
      .send(`${lines.join('\n')}${lines.length ? '\n' : ''}`)
  })

  app.post('/api/accounts/import/preview', async (request) => {
    const body = z.object({ text: z.string().max(2_000_000) }).parse(request.body)
    const seen = new Set<string>()
    const rows = parseCredentialText(body.text).filter(({ result }) => !(result.ok === false && result.reason === 'empty')).map(({ line, result }) => {
      if (!result.ok) return { line, status: result.reason, email: null, passwordLength: null, totpValid: false, message: result.message }
      const duplicate = seen.has(result.value.email) || accounts.existsByEmail(result.value.email)
      seen.add(result.value.email)
      return {
        line,
        status: duplicate ? 'duplicate' : 'valid',
        email: result.value.email,
        passwordLength: result.value.password.length,
        totpValid: true,
        message: duplicate ? '邮箱已存在' : '可导入'
      }
    })
    return { rows, validCount: rows.filter((row) => row.status === 'valid').length }
  })

  app.post('/api/accounts/import', async (request, reply) => {
    const body = z.object({ text: z.string().max(2_000_000) }).parse(request.body)
    const profile = settings.get()
    const created = []
    const errors = []
    const seen = new Set<string>()
    for (const item of parseCredentialText(body.text)) {
      if (!item.result.ok) {
        if (item.result.reason !== 'empty') errors.push({ line: item.line, message: item.result.message })
        continue
      }
      if (seen.has(item.result.value.email) || accounts.existsByEmail(item.result.value.email)) {
        errors.push({ line: item.line, message: '邮箱已存在' })
        continue
      }
      seen.add(item.result.value.email)
      created.push(accounts.create({ ...item.result.value, importProfileVersion: profile.version }))
    }
    audit(request, 'accounts.import', errors.length ? 'partial' : 'success', undefined, { created: created.length, errors: errors.length })
    return reply.code(created.length ? 201 : 400).send({ created, errors })
  })

  app.put('/api/accounts/:id', async (request) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params)
    const body = z.object({
      email: z.string().email().optional(), password: z.string().min(1).optional(),
      totpSecret: z.string().optional(), notes: z.string().max(5000).optional(),
      importOverrides: accountImportOverridesSchema.nullable().optional()
    }).parse(request.body)
    const totpSecret = body.totpSecret ? normalizeTotpSecret(body.totpSecret) : undefined
    if (body.totpSecret && !totpSecret) throw new Error('2FA 密钥格式无效')
    if (body.importOverrides) await validateImportTarget(body.importOverrides)
    const account = accounts.update(params.id, { ...body, ...(totpSecret ? { totpSecret } : {}) })
    audit(request, 'account.update', 'success', params.id)
    return account
  })

  app.delete('/api/accounts/:id', async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params)
    const query = z.object({ deleteRemote: z.enum(['true', 'false']).default('false') }).parse(request.query)
    const account = accounts.get(params.id)
    if (!account) return reply.code(404).send({ code: 'ACCOUNT_NOT_FOUND', message: '账号不存在' })
    if (query.deleteRemote === 'true' && account.sub2apiAccountId) await sub2api.deleteAccount(account.sub2apiAccountId)
    accounts.hardDelete(params.id)
    audit(request, 'account.delete', 'success', params.id, { deleteRemote: query.deleteRemote === 'true' })
    return { ok: true }
  })

  app.get('/api/settings', async () => settings.get())
  app.put('/api/settings', async (request) => {
    const value = runtimeSettingsSchema.parse(request.body) as RuntimeSettings
    await validateImportTarget(value.importDefaults)
    const saved = settings.save(value)
    audit(request, 'settings.update', 'success', undefined, { version: saved.version })
    return saved
  })

  app.post('/api/settings/test-sub2api', async (request) => {
    const result = await sub2api.testConnection()
    audit(request, 'sub2api.test', 'success')
    return result
  })

  app.get('/api/metadata/groups', async () => ({ items: await sub2api.listGroups() }))
  app.get('/api/metadata/proxies', async () => ({
    items: (await sub2api.listProxies()).map((proxy) => ({
      id: proxy.id,
      name: proxy.name,
      status: proxy.status,
      account_count: proxy.account_count,
      latency_ms: proxy.latency_ms,
      latency_status: proxy.latency_status,
      quality_status: proxy.quality_status,
      expires_at: proxy.expires_at
    }))
  }))

  app.post('/api/accounts/:id/authorize/auto', async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params)
    const body = z.object({
      accountName: z.string().trim().min(1).max(200),
      importOverrides: accountImportOverridesSchema.nullable().optional()
    }).parse(request.body)
    const account = accounts.get(params.id)
    if (!account) return reply.code(404).send({ code: 'ACCOUNT_NOT_FOUND', message: '账号不存在' })
    accounts.getSecrets(params.id)
    if (body.importOverrides) await validateImportTarget(body.importOverrides)
    if (body.importOverrides !== undefined) accounts.update(params.id, { importOverrides: body.importOverrides })
    accounts.setDesiredRemoteName(params.id, body.accountName)
    const job = jobs.enqueue({ accountId: params.id, type: 'authorize', payload: { accountName: body.accountName, automatic: false }, maxAttempts: 2 })
    accounts.setOAuthPending(params.id, account.selectedProxyId)
    audit(request, 'oauth.auto.queued', 'success', params.id, { jobId: job.id, accountImportOverrides: Boolean(body.importOverrides) })
    return reply.code(202).send({ job })
  })

  app.post('/api/accounts/:id/refresh', async (request, reply) => {
    const params = z.object({ id: z.string().uuid() }).parse(request.params)
    const account = accounts.get(params.id)
    if (!account?.sub2apiAccountId) return reply.code(400).send({ code: 'ACCOUNT_NOT_SYNCED', message: '账号尚未导入 Sub2API' })
    try {
      const remote = await sub2api.refreshOpenAIAccount(account.sub2apiAccountId)
      accounts.markRefresh(params.id, true)
      accounts.syncRemote(params.id, { id: remote.id, name: remote.name, expiresAt: sub2apiTokenExpiresAt(remote) })
      audit(request, 'oauth.refresh', 'success', params.id)
      return { account: accounts.get(params.id), remote }
    } catch (error) {
      const code = error instanceof Sub2APIError ? error.code : 'REFRESH_FAILED'
      accounts.markRefresh(params.id, false, code, error instanceof Error ? error.message : '刷新失败')
      audit(request, 'oauth.refresh', 'failed', params.id, { code })
      throw error
    }
  })

  const workerId = `worker-${crypto.randomUUID()}`
  jobs.releaseLocks()
  let workerRunning = false
  const retryAt = (job: WorkbenchJob) => new Date(Date.now() + Math.min(15, 2 ** job.attempts) * 60_000).toISOString()
  const isAuthFailure = (error: unknown) => error instanceof Sub2APIError && error.status === 401
  const usageIsLimited = (usage: { five_hour?: { utilization?: number | null } | null; seven_day?: { utilization?: number | null } | null }) =>
    Math.max(usage.five_hour?.utilization ?? 0, usage.seven_day?.utilization ?? 0) >= 100
  const canAutoReauthorize = (account: ReturnType<AccountRepository['get']>) => Boolean(
    account && account.authStatus !== 'manual_action_required' &&
    (!account.nextCheckAt || new Date(account.nextCheckAt).getTime() <= Date.now())
  )

  const executeJob = async (job: WorkbenchJob) => {
    if (!job.accountId) {
      jobs.fail(job, 'JOB_ACCOUNT_MISSING', '任务缺少账号')
      return
    }
    const account = accounts.get(job.accountId)
    if (!account) {
      jobs.fail(job, 'ACCOUNT_NOT_FOUND', '账号不存在或已删除')
      return
    }

    if (job.type === 'authorize') {
      try {
        const requestedAccountName = typeof job.payload.accountName === 'string' ? job.payload.accountName : undefined
        const result = await runManagedOAuth(account.id, requestedAccountName)
        accounts.setNextCheck(account.id, null)
        jobs.complete(job.id)
        systemAudit('worker.oauth_reauthorize', 'success', account.id, { remoteAccountId: result.remote.id })
      } catch (error) {
        const manual = error instanceof ManualActionRequiredError
        const code = manual ? error.code : error instanceof Sub2APIError ? error.code : 'REAUTH_FAILED'
        const summary = error instanceof Error ? error.message : '重新授权失败'
        accounts.markAuthorizationFailure(account.id, manual, code, summary)
        jobs.fail(job, code, summary, manual ? undefined : retryAt(job))
        if (!manual && job.attempts >= job.maxAttempts) {
          accounts.setNextCheck(account.id, new Date(Date.now() + REAUTH_FAILURE_COOLDOWN_HOURS * 60 * 60_000).toISOString())
        }
        systemAudit('worker.oauth_reauthorize', manual ? 'manual_action_required' : 'failed', account.id, { code })
      }
      return
    }

    if (!account.sub2apiAccountId) {
      jobs.fail(job, 'ACCOUNT_NOT_SYNCED', '账号尚未导入 Sub2API')
      return
    }

    if (job.type === 'refresh') {
      try {
        const remote = await sub2api.refreshOpenAIAccount(account.sub2apiAccountId)
        accounts.markRefresh(account.id, true)
        accounts.syncRemote(account.id, { id: remote.id, name: remote.name, expiresAt: sub2apiTokenExpiresAt(remote) })
        jobs.complete(job.id)
        systemAudit('worker.oauth_refresh', 'success', account.id)
      } catch (error) {
        const code = error instanceof Sub2APIError ? error.code : 'REFRESH_FAILED'
        const summary = error instanceof Error ? error.message : '刷新失败'
        accounts.markRefresh(account.id, false, code, summary)
        jobs.fail(job, code, summary, isAuthFailure(error) ? undefined : retryAt(job))
        if (isAuthFailure(error) && canAutoReauthorize(account)) {
          jobs.enqueue({ accountId: account.id, type: 'authorize', payload: { automatic: true }, runAfter: new Date().toISOString(), maxAttempts: 2 })
        }
        systemAudit('worker.oauth_refresh', 'failed', account.id, { code })
      }
      return
    }

    let usage
    try {
      usage = await sub2api.queryAccountUsage(account.sub2apiAccountId)
      accounts.syncRemote(account.id, { id: account.sub2apiAccountId, name: account.sub2apiAccountName ?? '', expiresAt: account.tokenExpiresAt, five_hour: usage.five_hour, seven_day: usage.seven_day })
    } catch (error) {
      const code = error instanceof Sub2APIError ? error.code : 'HEALTH_CHECK_FAILED'
      const summary = error instanceof Error ? error.message : '健康检测失败'
      // Usage-window refresh is display-only. It must never initiate OAuth.
      accounts.markHealth(account.id, { status: 'network_error', errorCode: code, summary })
      jobs.fail(job, code, summary, retryAt(job))
      return
    }

    accounts.markHealth(account.id, {
      status: 'healthy',
      errorCode: null,
      summary: usageIsLimited(usage) ? '用量已达到 100%，账号处于限流状态' : '用量窗口查询成功'
    })
    jobs.complete(job.id)
  }

  const workerTick = async () => {
    if (workerRunning) return
    workerRunning = true
    try {
      const job = jobs.claimNext(workerId)
      if (job) await executeJob(job)
    } catch (error) {
      systemAudit('worker.tick', 'failed', undefined, { code: error instanceof Error ? error.message : 'WORKER_FAILED' })
    } finally {
      workerRunning = false
    }
  }

  let schedulerRunning = false
  let lastRemoteSyncAt = 0
  let lastAuthorizationScanAt = 0
  const schedulerTick = async () => {
    if (schedulerRunning) return
    schedulerRunning = true
    try {
      const runtime = settings.get().value.scheduler
      const timestamp = Date.now()
      const allAccounts = accounts.list()

      if (timestamp - lastRemoteSyncAt >= runtime.checkIntervalMinutes * 60_000) {
        try {
          const remote = await sub2api.listOpenAIAccounts()
          const remoteById = new Map(remote.items.map((item) => [item.id, item]))
          for (const account of allAccounts) {
            if (!account.sub2apiAccountId) continue
            const snapshot = remoteById.get(account.sub2apiAccountId)
            if (snapshot) {
              let synchronizedSnapshot = snapshot
              if (typeof snapshot.credentials?.email !== 'string' || !snapshot.credentials.email.trim()) {
                try {
                  synchronizedSnapshot = await sub2api.updateAccount(snapshot.id, {
                    credentials: buildSub2apiEmailCredentialUpdate(snapshot.credentials, account.email)
                  })
                  systemAudit('scheduler.remote_email_backfill', 'success', account.id, { remoteAccountId: snapshot.id })
                } catch (error) {
                  systemAudit('scheduler.remote_email_backfill', 'failed', account.id, {
                    remoteAccountId: snapshot.id,
                    code: error instanceof Sub2APIError ? error.code : 'EMAIL_BACKFILL_FAILED'
                  })
                }
              }
              accounts.syncRemote(account.id, {
                id: synchronizedSnapshot.id,
                name: synchronizedSnapshot.name,
                expiresAt: sub2apiTokenExpiresAt(synchronizedSnapshot),
                status: synchronizedSnapshot.status,
                schedulable: synchronizedSnapshot.schedulable
              })

              // Sub2API is the source of truth for account health.  Its
              // `status=error` means the upstream token was rejected (401),
              // so queue reauthorization without running a model test or a
              // usage-window request.  Do not mutate the local health state:
              // Sub2API already owns the error/scheduling flags remotely.
              if (String(synchronizedSnapshot.status ?? '').toLowerCase() === 'error') {
                if (canAutoReauthorize(account)) {
                  const queued = jobs.enqueue({
                    accountId: account.id,
                    type: 'authorize',
                    payload: { automatic: true },
                    runAfter: new Date().toISOString(),
                    maxAttempts: 2
                  })
                  systemAudit('scheduler.sub2api_account_error', 'queued', account.id, {
                    remoteAccountId: synchronizedSnapshot.id,
                    jobId: queued.id
                  })
                } else {
                  systemAudit('scheduler.sub2api_account_error', 'skipped', account.id, {
                    remoteAccountId: synchronizedSnapshot.id
                  })
                }
              }
            } else {
              accounts.setSyncStatus(account.id, 'remote_missing')
            }
          }
          lastRemoteSyncAt = timestamp
        } catch (error) {
          systemAudit('scheduler.remote_sync', 'failed', undefined, { code: error instanceof Sub2APIError ? error.code : 'SYNC_FAILED' })
        }
      }

      const authorizationScanDue = timestamp - lastAuthorizationScanAt >= runtime.checkIntervalMinutes * 60_000
      for (const account of allAccounts) {
        if (account.authStatus === 'disabled') continue
        const coolingDown = account.nextCheckAt && new Date(account.nextCheckAt).getTime() > timestamp

        if (authorizationScanDue && !coolingDown) {
          if (account.sub2apiAccountId) {
            const expiresAt = account.tokenExpiresAt ? new Date(account.tokenExpiresAt).getTime() : Number.MAX_SAFE_INTEGER
            if (expiresAt - timestamp <= TOKEN_REFRESH_WINDOW_MINUTES * 60_000) {
              jobs.enqueue({ accountId: account.id, type: 'refresh' })
            } else if (account.authStatus === 'reauth_required') {
              jobs.enqueue({ accountId: account.id, type: 'authorize', payload: { automatic: true }, maxAttempts: 2 })
            }
          }
        }

        const healthDue = account.sub2apiAccountId && (
          !account.lastCheckAt || timestamp - new Date(account.lastCheckAt).getTime() >= runtime.checkIntervalMinutes * 60_000
        )
        if (healthDue) {
          jobs.enqueue({ accountId: account.id, type: 'health_test' })
        }
      }
      if (authorizationScanDue) lastAuthorizationScanAt = timestamp
    } finally {
      schedulerRunning = false
    }
  }
  const schedulerTimer = setInterval(() => { void schedulerTick() }, 30_000)
  const workerTimer = setInterval(() => { void workerTick() }, 2_000)
  app.addHook('onClose', async () => {
    clearInterval(schedulerTimer)
    clearInterval(workerTimer)
    clearTimeout(schedulerBootstrap)
    clearTimeout(workerBootstrap)
  })
  const schedulerBootstrap = setTimeout(() => { void schedulerTick() }, 2_000)
  const workerBootstrap = setTimeout(() => { void workerTick() }, 3_000)

  const clientRoot = path.resolve('dist/client')
  if (fs.existsSync(clientRoot)) {
    await app.register(fastifyStatic, { root: clientRoot, wildcard: false })
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api/')) return reply.code(404).send({ code: 'NOT_FOUND', message: '接口不存在' })
      return reply.sendFile('index.html')
    })
  }

  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error, code: error instanceof Sub2APIError ? error.code : undefined }, 'request_failed')
    if (error instanceof z.ZodError) return reply.code(400).send({ code: 'VALIDATION_ERROR', message: error.issues[0]?.message ?? '参数错误' })
    if (error instanceof Sub2APIError) return reply.code(error.status >= 400 && error.status < 600 ? error.status : 502).send({ code: error.code, message: error.message })
    if (error instanceof Error && error.message === 'ACCOUNT_NOT_FOUND') return reply.code(404).send({ code: 'ACCOUNT_NOT_FOUND', message: '账号不存在' })
    return reply.code(500).send({ code: 'INTERNAL_ERROR', message: error instanceof Error ? error.message.slice(0, 300) : '服务器错误' })
  })

  return app
}

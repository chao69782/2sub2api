import fs from 'node:fs'
import path from 'node:path'
import YAML from 'yaml'
import { z } from 'zod'
import type { RuntimeSettings } from '../shared/types.js'

const durationInt = (min: number, max: number) => z.number().int().min(min).max(max)

const configSchema = z.object({
  server: z.object({
    host: z.string().default('0.0.0.0'),
    port: z.number().int().min(1).max(65535).default(1000),
    trust_proxy: z.boolean().default(false),
    cookie_secure: z.boolean().default(false)
  }),
  auth: z.object({
    username: z.string().min(3).max(64).regex(/^[A-Za-z0-9._-]+$/),
    password_hash: z.string().optional(),
    password_file: z.string().optional(),
    session_idle_minutes: durationInt(0, 1440).default(0),
    session_absolute_hours: durationInt(0, 876000).default(0),
    max_failed_attempts: durationInt(1, 20).default(5),
    lockout_minutes: durationInt(1, 1440).default(15)
  }).superRefine((value, ctx) => {
    if (Boolean(value.password_hash) === Boolean(value.password_file)) {
      ctx.addIssue({ code: 'custom', message: 'auth.password_hash and auth.password_file must be configured exclusively' })
    }
  }),
  security: z.object({
    master_key_file: z.string().min(1),
    session_secret_file: z.string().min(1)
  }),
  sub2api: z.object({
    base_url: z.string().url(),
    admin_key_file: z.string().min(1),
    request_timeout_seconds: durationInt(3, 300).default(30)
  }),
  scheduler: z.object({
    check_interval_minutes: durationInt(1, 1440).default(5)
  }),
  import_defaults: z.object({
    model_whitelist: z.array(z.string().trim().min(1).max(200).refine((value) => !value.includes('*'), 'model whitelist entries must be exact model IDs')).default([
      'codex-auto-review', 'gpt-5.5', 'gpt-5.6-luna', 'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-6-astra'
    ]),
    model_mapping: z.record(z.string(), z.string()).default({ 'gpt-5.3-codex-spark': 'gpt-5.6-luna' }),
    concurrency: z.number().int().min(0).max(1000).default(3),
    priority: z.number().int().min(0).max(100000).default(50),
    group_ids: z.array(z.number().int().positive()).default([]),
    load_factor: z.number().int().min(1).max(10000).nullable().default(null),
    auto_pause_on_expired: z.boolean().default(true),
    proxy_policy: z.enum(['auto', 'direct', 'fixed']).default('auto'),
    fixed_proxy_id: z.number().int().positive().nullable().default(null)
  })
})

export type AppConfig = z.infer<typeof configSchema> & {
  configPath: string
  dataDir: string
  adminPassword: string | null
  masterKey: Buffer
  sessionSecret: string
  sub2apiAdminKey: string
}

function readSecret(file: string, label: string): string {
  try {
    const value = fs.readFileSync(file, 'utf8').trim()
    if (!value) throw new Error('file is empty')
    return value
  } catch (error) {
    throw new Error(`Unable to read ${label} from ${file}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function parseMasterKey(value: string): Buffer {
  const trimmed = value.trim()
  const key = /^[0-9a-f]{64}$/i.test(trimmed) ? Buffer.from(trimmed, 'hex') : Buffer.from(trimmed, 'base64')
  if (key.length !== 32) throw new Error('Master key must decode to exactly 32 bytes')
  return key
}

export function loadConfig(): AppConfig {
  const configPath = path.resolve(process.env.APP_CONFIG_FILE ?? './config.yaml')
  const raw = YAML.parse(fs.readFileSync(configPath, 'utf8'))
  const parsed = configSchema.parse(raw)
  const adminPassword = parsed.auth.password_file ? readSecret(parsed.auth.password_file, 'admin password') : null
  return {
    ...parsed,
    configPath,
    dataDir: path.resolve(process.env.DATA_DIR ?? './data'),
    adminPassword,
    masterKey: parseMasterKey(readSecret(parsed.security.master_key_file, 'master key')),
    sessionSecret: readSecret(parsed.security.session_secret_file, 'session secret'),
    sub2apiAdminKey: readSecret(parsed.sub2api.admin_key_file, 'Sub2API admin key')
  }
}

export function configRuntimeSettings(config: AppConfig): RuntimeSettings {
  return {
    scheduler: {
      checkIntervalMinutes: config.scheduler.check_interval_minutes
    },
    importDefaults: {
      modelWhitelist: config.import_defaults.model_whitelist,
      modelMapping: config.import_defaults.model_mapping,
      concurrency: config.import_defaults.concurrency,
      priority: config.import_defaults.priority,
      groupIds: config.import_defaults.group_ids,
      loadFactor: config.import_defaults.load_factor,
      autoPauseOnExpired: config.import_defaults.auto_pause_on_expired,
      proxyPolicy: config.import_defaults.proxy_policy,
      fixedProxyId: config.import_defaults.fixed_proxy_id
    }
  }
}

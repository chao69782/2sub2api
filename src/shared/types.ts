export type AuthStatus =
  | 'not_authorized'
  | 'authorizing'
  | 'authorized'
  | 'refresh_due'
  | 'refreshing'
  | 'reauth_required'
  | 'manual_action_required'
  | 'disabled'

export type HealthStatus =
  | 'unknown'
  | 'healthy'
  | 'degraded'
  | 'rate_limited'
  | 'invalid_credentials'
  | 'upstream_blocked'
  | 'network_error'

export type SyncStatus = 'not_synced' | 'syncing' | 'synced' | 'sync_failed' | 'remote_missing'
export type ProxyPolicy = 'auto' | 'direct' | 'fixed'
export type AuthorizationJobStatus = 'pending' | 'running' | 'completed' | 'failed'

export interface ImportDefaults {
  modelWhitelist: string[]
  modelMapping: Record<string, string>
  concurrency: number
  priority: number
  groupIds: number[]
  loadFactor: number | null
  autoPauseOnExpired: boolean
  proxyPolicy: ProxyPolicy
  fixedProxyId: number | null
}

export interface SchedulerSettings {
  checkIntervalMinutes: number
}

export interface RuntimeSettings {
  scheduler: SchedulerSettings
  importDefaults: ImportDefaults
}

export interface ManagedAccount {
  id: string
  email: string
  notes: string
  tags: string[]
  authStatus: AuthStatus
  healthStatus: HealthStatus
  syncStatus: SyncStatus
  sub2apiAccountId: number | null
  sub2apiAccountName: string | null
  selectedProxyId: number | null
  tokenExpiresAt: string | null
  lastAuthAt: string | null
  lastRefreshAt: string | null
  lastCheckAt: string | null
  nextCheckAt: string | null
  lastErrorCode: string | null
  lastErrorSummary: string | null
  lastAuthorizationStatus: AuthorizationJobStatus | null
  lastAuthorizationErrorCode: string | null
  lastAuthorizationErrorSummary: string | null
  lastAuthorizationAt: string | null
  autoReauthorizationCount: number
  usageFiveHourPercent: number | null
  usageSevenDayPercent: number | null
  importProfileVersion: number
  createdAt: string
  updatedAt: string
}

export interface ImportPreviewRow {
  line: number
  status: 'valid' | 'invalid' | 'ambiguous' | 'duplicate'
  email: string | null
  passwordLength: number | null
  totpValid: boolean
  message: string
}

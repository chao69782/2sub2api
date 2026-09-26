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

export type AccountImportOverrides = Omit<ImportDefaults, 'modelMapping'>

export interface SchedulerSettings {
  checkIntervalMinutes: number
}

export interface RuntimeSettings {
  scheduler: SchedulerSettings
  importDefaults: ImportDefaults
}

export interface UsageWindowSummary {
  averagePercent: number | null
  queriedCount: number
}

export type UsageAvailabilityStatus = 'exhausts_before_reset' | 'sustainable_until_reset' | 'insufficient_data'
export type UsageWindowKind = 'five_hour' | 'seven_day'

export interface UsageAvailabilityEstimate {
  status: UsageAvailabilityStatus
  remainingSeconds: number | null
  limitingWindow: UsageWindowKind | null
  consumptionRatePercentPerHour: number | null
  sampleCount: number
}

export interface AccountUsageSummary {
  accountCount: number
  eligibleAccountCount: number
  fiveHour: UsageWindowSummary
  sevenDay: UsageWindowSummary
  availability: UsageAvailabilityEstimate
}

export interface AccountListResponse {
  items: ManagedAccount[]
  total: number
  page: number
  pageSize: number
  usageSummary: AccountUsageSummary
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
  usageFiveHourRemainingSeconds: number | null
  usageSevenDayRemainingSeconds: number | null
  importOverrides: AccountImportOverrides | null
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

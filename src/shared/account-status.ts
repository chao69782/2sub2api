import type { HealthStatus, ManagedAccount } from './types.js'

export function isSchedulingPaused(account: Pick<ManagedAccount, 'schedulingPaused' | 'sub2apiSchedulable'>): boolean {
  return account.schedulingPaused === true || account.sub2apiSchedulable === false
}

export function displayHealthStatus(account: Pick<ManagedAccount, 'healthStatus' | 'sub2apiStatus' | 'usageFiveHourPercent' | 'usageSevenDayPercent'>): HealthStatus {
  if (account.sub2apiStatus?.toLowerCase() === 'error') return 'invalid_credentials'
  return Math.max(account.usageFiveHourPercent ?? 0, account.usageSevenDayPercent ?? 0) >= 100
    ? 'rate_limited'
    : account.healthStatus
}

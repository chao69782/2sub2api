import type { HealthStatus, ManagedAccount } from './types.js'

export function displayHealthStatus(account: Pick<ManagedAccount, 'healthStatus' | 'sub2apiStatus' | 'usageFiveHourPercent' | 'usageSevenDayPercent'>): HealthStatus {
  if (account.sub2apiStatus?.toLowerCase() === 'error') return 'invalid_credentials'
  return Math.max(account.usageFiveHourPercent ?? 0, account.usageSevenDayPercent ?? 0) >= 100
    ? 'rate_limited'
    : account.healthStatus
}

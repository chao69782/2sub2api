import type { HealthStatus, ManagedAccount } from './types.js'

export function displayHealthStatus(account: Pick<ManagedAccount, 'healthStatus' | 'usageFiveHourPercent' | 'usageSevenDayPercent'>): HealthStatus {
  return Math.max(account.usageFiveHourPercent ?? 0, account.usageSevenDayPercent ?? 0) >= 100
    ? 'rate_limited'
    : account.healthStatus
}

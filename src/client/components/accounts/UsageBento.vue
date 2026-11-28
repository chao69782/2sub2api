<template>
  <section aria-labelledby="usage-bento-title" class="space-y-3">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div class="flex items-center gap-2">
        <Activity :size="15" class="text-accent" aria-hidden="true" />
        <h2 id="usage-bento-title" class="text-xs font-semibold uppercase tracking-wider text-ink-muted">
          用量与可用时长概览
        </h2>
      </div>
      <span v-if="summary" class="font-mono text-xs text-ink-muted">
        纳入统计 <strong class="font-medium text-ink-primary">{{ summary.eligibleAccountCount }}</strong> / {{ summary.accountCount }} 个账号
      </span>
    </div>

    <!-- Loading Skeleton -->
    <div v-if="!summary && loading" class="grid gap-4 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1.45fr]">
      <div v-for="i in 3" :key="i" class="surface-card h-[148px] animate-pulse p-5">
        <div class="h-4 w-24 rounded bg-subtle"></div>
        <div class="mt-4 h-9 w-28 rounded bg-subtle"></div>
        <div class="mt-5 h-2 w-full rounded-full bg-subtle"></div>
      </div>
    </div>

    <!-- Empty / Unavailable -->
    <div v-else-if="!summary" class="surface-card flex h-28 items-center justify-center text-sm text-ink-muted">
      用量统计暂不可用
    </div>

    <!-- Bento Grid -->
    <div v-else class="grid gap-4 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1.45fr]">
      <!-- 5h & 7d Window Cards -->
      <article
        v-for="win in usageWindows"
        :key="win.key"
        class="surface-card flex flex-col justify-between p-5"
      >
        <div class="flex items-center justify-between gap-2">
          <span class="text-sm font-medium text-ink-secondary">{{ win.label }}</span>
          <span class="rounded-full bg-subtle px-2 py-0.5 font-mono text-[11px] text-ink-muted">
            {{ win.queriedCount }}/{{ summary.eligibleAccountCount }}
          </span>
        </div>

        <div class="my-3 flex items-baseline gap-2">
          <span class="font-mono text-3xl font-semibold tracking-tight text-ink-primary tabular-nums">
            {{ averageUsageLabel(win.averagePercent) }}
          </span>
          <span class="text-xs text-ink-muted">平均占用</span>
        </div>

        <div class="space-y-1.5">
          <div class="h-2 w-full overflow-hidden rounded-full bg-subtle">
            <div
              class="h-full rounded-full transition-all duration-300"
              :style="{
                width: progressWidth(win.averagePercent),
                backgroundColor: usageToneColor(win.averagePercent)
              }"
            ></div>
          </div>
        </div>
      </article>

      <!-- Availability Main Card -->
      <article
        class="surface-card relative flex flex-col justify-between overflow-hidden p-5 md:col-span-2 xl:col-span-1"
      >
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center gap-2 text-sm font-medium text-ink-secondary">
            <Clock3 :size="16" class="text-ink-muted" aria-hidden="true" />
            <span>预计剩余可用时间</span>
          </div>
          <span class="pill-badge text-[11px]" :style="availabilityBadgeStyle">
            <span class="h-1.5 w-1.5 rounded-full bg-current"></span>
            {{ availabilityWindowLabel }}
          </span>
        </div>

        <div class="my-2.5 flex flex-wrap items-baseline justify-between gap-2">
          <p
            class="font-mono text-3xl font-semibold tracking-tight tabular-nums"
            :style="{ color: availabilityPrimaryColor }"
          >
            {{ availabilityPrimaryLabel }}
          </p>
          <span class="font-mono text-xs font-medium text-ink-secondary">
            {{ availabilityRateLabel }}
          </span>
        </div>

        <p class="text-xs leading-5 text-ink-muted">{{ availabilityDetail }}</p>
      </article>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Activity, Clock3 } from 'lucide-vue-next'
import type { AccountUsageSummary } from '../../../shared/types'

const props = defineProps<{
  summary: AccountUsageSummary | null
  loading: boolean
}>()

const usageWindows = computed(() => {
  const s = props.summary
  if (!s) return []
  return [
    { key: '5h', label: '5 小时窗口', ...s.fiveHour },
    { key: '7d', label: '7 天窗口', ...s.sevenDay }
  ]
})

const availability = computed(() => props.summary?.availability ?? null)

const availabilityWindowLabel = computed(() => {
  if (availability.value?.limitingWindow === 'five_hour') return '受限于 5 小时窗口'
  if (availability.value?.limitingWindow === 'seven_day') return '受限于 7 天窗口'
  return '等待数据'
})

const availabilityPrimaryLabel = computed(() => {
  const estimate = availability.value
  if (!estimate || estimate.status === 'insufficient_data' || estimate.remainingSeconds === null) return '样本不足'
  const duration = formatDuration(estimate.remainingSeconds)
  return estimate.status === 'exhausts_before_reset' ? `约 ${duration}` : `至少 ${duration}`
})

const availabilityDetail = computed(() => {
  const estimate = availability.value
  if (!estimate || estimate.status === 'insufficient_data') {
    return '等待用量窗口返回重置时间和足够的运行样本。'
  }
  if (estimate.status === 'exhausts_before_reset') {
    return `${availabilityWindowLabel.value.replace('受限于 ', '')}按当前平均消耗速度预计会先达到 100%。`
  }
  return `${availabilityWindowLabel.value.replace('受限于 ', '')}将在此后重置，按当前平均速度不会提前耗尽。`
})

const availabilityRateLabel = computed(() => {
  const estimate = availability.value
  if (!estimate || estimate.status === 'insufficient_data' || estimate.consumptionRatePercentPerHour === null) {
    return '暂无法计算速率'
  }
  if (estimate.consumptionRatePercentPerHour === 0) {
    return `0%/小时 · ${estimate.sampleCount} 样本`
  }
  return `${Number(estimate.consumptionRatePercentPerHour.toFixed(1))}%/小时 · ${estimate.sampleCount} 样本`
})

const availabilityPrimaryColor = computed(() => {
  if (availability.value?.status === 'sustainable_until_reset') return 'var(--status-ok)'
  if (availability.value?.status === 'exhausts_before_reset') return 'var(--status-warn)'
  return 'var(--text-primary)'
})

const availabilityBadgeStyle = computed(() => {
  if (availability.value?.status === 'sustainable_until_reset') {
    return { backgroundColor: 'var(--status-ok-bg)', color: 'var(--status-ok)' }
  }
  if (availability.value?.status === 'exhausts_before_reset') {
    return { backgroundColor: 'var(--status-warn-bg)', color: 'var(--status-warn)' }
  }
  return { backgroundColor: 'var(--status-neutral-bg)', color: 'var(--status-neutral)' }
})

function averageUsageLabel(value: number | null): string {
  return value === null ? '—' : `${Number(value.toFixed(1))}%`
}

function progressWidth(value: number | null): string {
  return `${Math.min(Math.max(value ?? 0, 0), 100)}%`
}

function usageToneColor(value: number | null): string {
  if (value === null) return 'var(--border-strong)'
  if (value >= 90) return 'var(--status-danger)'
  if (value >= 70) return 'var(--status-warn)'
  return 'var(--accent)'
}

function formatDuration(value: number): string {
  const totalMinutes = Math.max(0, Math.round(value / 60))
  if (totalMinutes < 1) return '不足 1 分钟'
  const days = Math.floor(totalMinutes / (24 * 60))
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60)
  const minutes = totalMinutes % 60
  if (days) return `${days} 天${hours ? ` ${hours} 小时` : ''}`
  if (hours) return `${hours} 小时${minutes ? ` ${minutes} 分钟` : ''}`
  return `${minutes} 分钟`
}
</script>

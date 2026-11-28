<template>
  <!-- Compact clickable pill for table rows / cards -->
  <button
    v-if="compact"
    type="button"
    class="mt-1.5 inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-opacity hover:opacity-85"
    :style="statusStyle(progress?.status ?? fallbackStatus)"
    :title="progress ? progress.summary : fallbackLabel"
    @click="emit('inspect')"
  >
    <LoaderCircle v-if="progress?.status === 'running'" :size="12" class="shrink-0 animate-spin" aria-hidden="true" />
    <CircleAlert v-else-if="(progress?.status ?? fallbackStatus) === 'failed'" :size="12" class="shrink-0" aria-hidden="true" />
    <CircleCheck v-else-if="(progress?.status ?? fallbackStatus) === 'completed'" :size="12" class="shrink-0" aria-hidden="true" />
    <Clock3 v-else :size="12" class="shrink-0" aria-hidden="true" />
    <span class="truncate">{{ progress ? progress.summary : fallbackLabel }}</span>
    <ChevronRight :size="12" class="shrink-0 opacity-70" aria-hidden="true" />
  </button>

  <!-- Full vertical timeline stepper for detail drawer -->
  <div v-else class="space-y-4">
    <div v-if="progress" class="space-y-4">
      <div class="flex items-center justify-between gap-3 rounded-control border border-line-subtle bg-subtle/60 px-3.5 py-3">
        <div class="flex min-w-0 items-center gap-2.5">
          <span
            class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
            :style="statusStyle(progress.status)"
          >
            <LoaderCircle v-if="progress.status === 'running'" :size="15" class="animate-spin" />
            <CircleAlert v-else-if="progress.status === 'failed'" :size="15" />
            <CircleCheck v-else-if="progress.status === 'completed'" :size="15" />
            <Clock3 v-else :size="15" />
          </span>
          <div class="min-w-0">
            <div class="text-xs text-ink-muted">当前状态</div>
            <div class="truncate text-sm font-medium text-ink-primary">{{ progress.summary }}</div>
          </div>
        </div>
      </div>

      <ol class="relative space-y-1 pl-1" aria-label="2FA 更换与导入操作步骤">
        <li
          v-for="(step, index) in progress.steps"
          :key="step.id"
          class="relative flex items-start gap-3.5 pb-5 last:pb-0"
          :aria-current="step.status === 'running' || step.status === 'waiting' || step.status === 'failed' ? 'step' : undefined"
        >
          <!-- Connector line -->
          <span
            v-if="index < progress.steps.length - 1"
            class="absolute left-[13px] top-7 h-[calc(100%-1.25rem)] w-px"
            :style="{
              backgroundColor: step.status === 'completed' ? 'var(--status-ok)' : 'var(--border-strong)'
            }"
            aria-hidden="true"
          ></span>

          <!-- Step Node -->
          <span
            class="relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-mono font-medium"
            :style="nodeStyle(step.status)"
          >
            <CircleCheck v-if="step.status === 'completed'" :size="15" />
            <LoaderCircle v-else-if="step.status === 'running'" :size="15" class="animate-spin" />
            <CircleAlert v-else-if="step.status === 'failed'" :size="15" />
            <span v-else>{{ index + 1 }}</span>
          </span>

          <!-- Step Content -->
          <div class="flex min-w-0 flex-1 items-center justify-between gap-2 pt-1">
            <span
              class="text-sm font-medium"
              :class="step.status === 'pending' ? 'text-ink-muted' : 'text-ink-primary'"
            >
              {{ step.label }}
            </span>
            <span class="pill-badge text-[11px]" :style="statusStyle(step.status)">
              {{ statusLabels[step.status] }}
            </span>
          </div>
        </li>
      </ol>

      <div
        v-if="progress.error"
        class="rounded-control border px-3.5 py-3 text-xs leading-5"
        style="border-color: var(--status-danger-bg); background-color: var(--status-danger-bg); color: var(--status-danger)"
        role="alert"
      >
        <div class="mb-1 font-semibold">失败原因</div>
        <p class="break-words">{{ progress.error }}</p>
      </div>

      <div
        v-if="progress.importing && progress.status === 'failed'"
        class="rounded-control border border-line-subtle bg-subtle/60 px-3.5 py-2.5 text-xs leading-5 text-ink-secondary"
      >
        新 2FA 密钥已安全保存，无需重新更换，可直接点击下方按钮重试自动授权并导入 Sub2API。
      </div>
    </div>

    <div v-else class="rounded-control border border-line-subtle bg-subtle/60 px-4 py-3 text-sm text-ink-secondary">
      {{ fallbackLabel }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { ChevronRight, CircleAlert, CircleCheck, Clock3, LoaderCircle } from 'lucide-vue-next'
import type { ManagedAccount } from '../../shared/types'
import { totpRotationProgress, type RotationStepStatus } from '../../shared/totp-rotation'

const props = withDefaults(
  defineProps<{
    account: ManagedAccount
    fallbackLabel: string
    compact?: boolean
  }>(),
  { compact: false }
)

const emit = defineEmits<{ inspect: [] }>()

const progress = computed(() => totpRotationProgress(props.account))
const fallbackStatus = computed<RotationStepStatus>(() => {
  if (props.account.totpRotationStatus === 'failed') return 'failed'
  if (props.account.totpRotationStatus === 'running') return 'running'
  if (props.account.totpRotationStatus === 'pending') return 'waiting'
  if (props.account.totpRotationStatus === 'completed') return 'completed'
  return 'pending'
})

const statusLabels: Record<RotationStepStatus, string> = {
  pending: '未开始',
  waiting: '等待执行',
  running: '进行中',
  completed: '已完成',
  failed: '失败'
}

function statusStyle(status: RotationStepStatus) {
  if (status === 'completed') return { backgroundColor: 'var(--status-ok-bg)', color: 'var(--status-ok)' }
  if (status === 'failed') return { backgroundColor: 'var(--status-danger-bg)', color: 'var(--status-danger)' }
  if (status === 'running' || status === 'waiting') return { backgroundColor: 'var(--status-info-bg)', color: 'var(--status-info)' }
  return { backgroundColor: 'var(--status-neutral-bg)', color: 'var(--status-neutral)' }
}

function nodeStyle(status: RotationStepStatus) {
  if (status === 'completed') {
    return { backgroundColor: 'var(--status-ok-bg)', borderColor: 'var(--status-ok)', color: 'var(--status-ok)' }
  }
  if (status === 'failed') {
    return { backgroundColor: 'var(--status-danger-bg)', borderColor: 'var(--status-danger)', color: 'var(--status-danger)' }
  }
  if (status === 'running' || status === 'waiting') {
    return { backgroundColor: 'var(--status-info-bg)', borderColor: 'var(--status-info)', color: 'var(--status-info)' }
  }
  return { backgroundColor: 'var(--bg-surface)', borderColor: 'var(--border-strong)', color: 'var(--text-muted)' }
}
</script>

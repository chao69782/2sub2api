<template>
  <details v-if="progress" class="mt-1 whitespace-normal text-left text-xs font-normal" :open="progress.status !== 'completed'" :aria-label="`${account.email} 的操作步骤`">
    <summary class="flex min-h-11 cursor-pointer items-center gap-1.5 rounded py-1 leading-5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600" :class="tone(progress.status)">
      <LoaderCircle v-if="progress.status === 'running'" :size="14" class="shrink-0 animate-spin" aria-hidden="true" />
      <CircleAlert v-else-if="progress.status === 'failed'" :size="14" class="shrink-0" aria-hidden="true" />
      <CircleCheck v-else-if="progress.status === 'completed'" :size="14" class="shrink-0" aria-hidden="true" />
      <Clock3 v-else :size="14" class="shrink-0" aria-hidden="true" />
      <span class="min-w-0 flex-1">{{ progress.summary }}</span>
      <ChevronDown :size="14" class="shrink-0" aria-hidden="true" />
    </summary>
    <ol class="mt-1 space-y-2 rounded-md border border-slate-200 bg-slate-50 p-2" aria-label="操作步骤">
      <li v-for="(step, index) in progress.steps" :key="step.id" class="flex items-start gap-1.5 leading-5" :class="tone(step.status)" :aria-current="step.status === 'running' || step.status === 'waiting' || step.status === 'failed' ? 'step' : undefined">
        <CircleCheck v-if="step.status === 'completed'" :size="14" class="mt-0.5 shrink-0" aria-hidden="true" />
        <LoaderCircle v-else-if="step.status === 'running'" :size="14" class="mt-0.5 shrink-0 animate-spin" aria-hidden="true" />
        <CircleAlert v-else-if="step.status === 'failed'" :size="14" class="mt-0.5 shrink-0" aria-hidden="true" />
        <span v-else class="w-3.5 shrink-0 text-center tabular-nums">{{ index + 1 }}</span>
        <span class="min-w-0 flex-1">{{ step.label }}</span>
        <span class="shrink-0">{{ statusLabels[step.status] }}</span>
      </li>
    </ol>
    <p v-if="progress.error" class="mt-2 break-words leading-5 text-red-700" role="alert">{{ progress.error }}</p>
    <p v-if="progress.importing && progress.status === 'failed'" class="mt-1 leading-5 text-slate-600">新 2FA 已保存，可单独重试自动授权。</p>
  </details>
  <p v-else class="mt-1 whitespace-normal text-xs font-normal" :class="account.totpRotationStatus === 'failed' ? 'text-red-700' : 'text-slate-500'">{{ fallbackLabel }}</p>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { ChevronDown, CircleAlert, CircleCheck, Clock3, LoaderCircle } from 'lucide-vue-next'
import type { ManagedAccount } from '../../shared/types'
import { totpRotationProgress, type RotationStepStatus } from '../../shared/totp-rotation'

const props = defineProps<{ account: ManagedAccount; fallbackLabel: string }>()
const progress = computed(() => totpRotationProgress(props.account))
const statusLabels: Record<RotationStepStatus, string> = { pending: '未开始', waiting: '等待执行', running: '进行中', completed: '已完成', failed: '失败' }
function tone(status: RotationStepStatus): string {
  return status === 'failed' ? 'text-red-700' : status === 'completed' ? 'text-emerald-700' : status === 'running' || status === 'waiting' ? 'text-blue-700' : 'text-slate-500'
}
</script>

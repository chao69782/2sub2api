<template>
  <span class="pill-badge" :style="badgeStyle">
    <span class="relative flex h-1.5 w-1.5 shrink-0">
      <span
        v-if="isActive"
        class="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-60"
      ></span>
      <span class="relative inline-flex h-1.5 w-1.5 rounded-full bg-current"></span>
    </span>
    {{ label }}
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ value: string }>()

const labels: Record<string, string> = {
  not_authorized: '未授权',
  authorizing: '授权中',
  authorized: '已授权',
  refresh_due: '待刷新',
  refreshing: '刷新中',
  reauth_required: '需重授权',
  manual_action_required: '需人工',
  disabled: '已停用',
  unknown: '未知',
  healthy: '健康',
  degraded: '异常',
  rate_limited: '限流',
  invalid_credentials: '凭据失效',
  upstream_blocked: '上游阻止',
  network_error: '网络错误',
  not_synced: '未同步',
  syncing: '同步中',
  synced: '已同步',
  sync_failed: '同步失败',
  remote_missing: '下游缺失',
  valid: '有效',
  invalid: '无效',
  ambiguous: '歧义',
  duplicate: '重复'
}

const label = computed(() => labels[props.value] ?? props.value)
const isActive = computed(() => ['authorizing', 'refreshing', 'syncing'].includes(props.value))

const badgeStyle = computed(() => {
  if (['healthy', 'authorized', 'synced', 'valid'].includes(props.value)) {
    return { backgroundColor: 'var(--status-ok-bg)', color: 'var(--status-ok)' }
  }
  if (['reauth_required', 'invalid_credentials', 'sync_failed', 'invalid', 'upstream_blocked'].includes(props.value)) {
    return { backgroundColor: 'var(--status-danger-bg)', color: 'var(--status-danger)' }
  }
  if (isActive.value) {
    return { backgroundColor: 'var(--status-info-bg)', color: 'var(--status-info)' }
  }
  if (['manual_action_required', 'rate_limited', 'degraded', 'ambiguous', 'duplicate', 'network_error', 'remote_missing'].includes(props.value)) {
    return { backgroundColor: 'var(--status-warn-bg)', color: 'var(--status-warn)' }
  }
  return { backgroundColor: 'var(--status-neutral-bg)', color: 'var(--status-neutral)' }
})
</script>

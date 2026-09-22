<template><span class="badge whitespace-nowrap" :class="tone"><span class="h-1.5 w-1.5 shrink-0 rounded-full bg-current"></span>{{ label }}</span></template>
<script setup lang="ts">
import { computed } from 'vue'
const props = defineProps<{ value: string }>()
const labels: Record<string, string> = { not_authorized: '未授权', authorizing: '授权中', authorized: '已授权', refresh_due: '待刷新', refreshing: '刷新中', reauth_required: '需重授权', manual_action_required: '需人工', disabled: '已停用', unknown: '未知', healthy: '健康', degraded: '异常', rate_limited: '限流', invalid_credentials: '凭据失效', upstream_blocked: '上游阻止', network_error: '网络错误', not_synced: '未同步', syncing: '同步中', synced: '已同步', sync_failed: '同步失败', remote_missing: '下游缺失', valid: '有效', invalid: '无效', ambiguous: '歧义', duplicate: '重复' }
const label = computed(() => labels[props.value] ?? props.value)
const tone = computed(() => ['healthy', 'authorized', 'synced', 'valid'].includes(props.value) ? 'bg-emerald-50 text-emerald-700' : ['reauth_required', 'invalid_credentials', 'sync_failed', 'invalid'].includes(props.value) ? 'bg-red-50 text-red-700' : ['authorizing', 'refreshing', 'syncing'].includes(props.value) ? 'bg-blue-50 text-blue-700' : ['manual_action_required', 'rate_limited', 'degraded', 'ambiguous', 'duplicate'].includes(props.value) ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-slate-600')
</script>

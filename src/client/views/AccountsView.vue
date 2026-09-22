<template>
  <section>
    <div class="mb-4 flex flex-wrap items-center gap-3">
      <div>
        <h1 class="text-xl font-semibold">账号</h1>
        <p class="mt-0.5 text-sm text-slate-500">共 {{ accounts.length }} 个账号</p>
      </div>
      <div class="ml-auto flex w-full flex-wrap items-center gap-2 sm:w-auto">
        <div class="relative w-full sm:w-auto">
          <Search class="pointer-events-none absolute left-3 top-3.5 text-slate-400" :size="17" />
          <input v-model="search" class="input w-full pl-9 sm:w-64" placeholder="搜索邮箱" @input="debouncedLoad" />
        </div>
        <button class="button button-primary" @click="openImport"><Plus :size="17" />添加账号</button>
        <button class="button" title="导出选中的账号---密码---2FA" :disabled="!selectedIds.length" @click="api.exportAccounts(selectedIds)"><Download :size="17" />导出选中 ({{ selectedIds.length }})</button>
        <button class="icon-button" title="刷新列表" aria-label="刷新列表" @click="load"><RefreshCw :size="17" /></button>
      </div>
    </div>

    <div v-if="message" class="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{{ message }}</div>
    <div v-if="error" class="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{{ error }}</div>

    <div class="panel overflow-hidden">
      <div v-if="loading" class="flex h-48 items-center justify-center text-slate-500"><LoaderCircle class="animate-spin" :size="22" /></div>
      <div v-else-if="!accounts.length" class="flex h-48 flex-col items-center justify-center text-slate-500">
        <Users :size="28" class="mb-2" />
        <span>暂无账号</span>
      </div>
      <div v-else>
        <div class="divide-y divide-slate-200 md:hidden">
          <article v-for="account in accounts" :key="account.id" class="space-y-3 p-4">
            <div class="min-w-0">
              <div class="truncate font-medium" :title="account.email">{{ account.email }}</div>
              <div class="mt-1 truncate text-sm text-slate-700" :title="account.sub2apiAccountName || ''">Sub2API：{{ account.sub2apiAccountName || '未设置' }}</div>
            </div>
            <dl class="grid grid-cols-3 gap-2 text-xs">
              <div><dt class="mb-1 text-slate-500">自动重授权次数</dt><dd>{{ account.autoReauthorizationCount }}</dd></div>
              <div><dt class="mb-1 text-slate-500">健康</dt><dd><StatusBadge :value="displayHealthStatus(account)" /></dd></div>
              <div><dt class="mb-1 text-slate-500">同步</dt><dd><StatusBadge :value="account.syncStatus" /></dd></div>
            </dl>
            <div class="rounded-md bg-slate-50 px-3 py-2 text-xs">
              <div class="mb-1.5 text-slate-500">用量窗口</div>
              <div v-if="account.usageFiveHourPercent !== null || account.usageSevenDayPercent !== null" class="space-y-1.5 text-slate-600">
                <div v-for="item in [{ label: '5h', value: account.usageFiveHourPercent }, { label: '7d', value: account.usageSevenDayPercent }]" :key="item.label" class="flex items-center gap-2">
                  <span class="w-5 shrink-0">{{ item.label }}</span><div class="h-1.5 flex-1 rounded-full bg-slate-200"><div class="h-1.5 rounded-full bg-emerald-500" :style="{ width: usageWidth(item.value) }" /></div><span class="w-9 text-right">{{ usageLabel(item.value) }}</span>
                </div>
              </div>
              <span v-else class="text-slate-400">未查询</span>
            </div>
            <div class="rounded-md bg-slate-50 px-3 py-2 text-xs" :class="authorizationResult(account).tone">
              <div class="font-medium">授权结果：{{ authorizationResult(account).label }}</div>
              <div class="mt-1 break-words text-slate-600">{{ authorizationResult(account).detail }}</div>
            </div>
            <div class="text-xs text-slate-500">最近检查：{{ formatTime(account.lastCheckAt) }}</div>
            <div class="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
              <button class="icon-button" title="自动授权或重新授权" aria-label="自动授权或重新授权" @click="openAuthorization(account)"><Bot :size="16" /></button>
              <button class="icon-button" title="编辑" aria-label="编辑" @click="edit(account)"><Pencil :size="16" /></button>
              <button class="icon-button text-red-600" title="删除" aria-label="删除" @click="remove(account)"><Trash2 :size="16" /></button>
            </div>
          </article>
        </div>
        <div class="hidden overflow-x-auto md:block">
        <table class="min-w-[1520px] w-full table-fixed text-left text-sm">
          <thead class="border-b border-slate-200 bg-slate-50 text-xs font-medium uppercase text-slate-500">
            <tr>
              <th class="w-[54px] px-4 py-3"><input type="checkbox" :checked="allSelected" aria-label="全选账号" @change="toggleAll" /></th>
              <th class="w-[230px] px-4 py-3">邮箱</th>
              <th class="w-[190px] px-4 py-3">Sub2API 名称</th>
              <th class="w-[190px] px-3 py-3">授权结果</th>
              <th class="w-[80px] whitespace-normal px-3 py-3 text-center">重授权次数</th>
              <th class="w-[170px] px-3 py-3">用量窗口</th>
              <th class="w-[112px] px-2 py-3 text-center">健康</th>
              <th class="w-[100px] px-4 py-3 text-center">同步</th>
              <th class="w-[150px] px-4 py-3">最近检查</th>
              <th class="sticky right-0 z-20 w-[270px] border-l border-slate-200 bg-slate-50 px-4 py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100">
            <tr v-for="account in accounts" :key="account.id" class="group align-middle hover:bg-slate-50">
              <td class="px-4 py-3"><input v-model="selectedIds" type="checkbox" :value="account.id" :aria-label="`选择 ${account.email}`" /></td>
              <td class="truncate px-4 py-3 font-medium" :title="account.email">{{ account.email }}</td>
              <td class="truncate px-4 py-3 text-slate-700" :title="account.sub2apiAccountName || ''">{{ account.sub2apiAccountName || '-' }}</td>
              <td class="px-4 py-3" :title="authorizationResult(account).title">
                <div class="font-medium" :class="authorizationResult(account).tone">{{ authorizationResult(account).label }}</div>
                <div class="mt-0.5 line-clamp-2 break-words text-xs leading-5 text-slate-500">{{ authorizationResult(account).detail }}</div>
              </td>
              <td class="px-3 py-3 text-center text-slate-600">{{ account.autoReauthorizationCount }}</td>
              <td class="px-3 py-3">
                <div v-if="account.usageFiveHourPercent !== null || account.usageSevenDayPercent !== null" class="space-y-1.5 text-xs text-slate-600">
                  <div v-for="item in [{ label: '5h', value: account.usageFiveHourPercent }, { label: '7d', value: account.usageSevenDayPercent }]" :key="item.label" class="flex items-center gap-1.5">
                    <span class="w-5 shrink-0">{{ item.label }}</span><div class="h-1.5 min-w-12 flex-1 rounded-full bg-slate-200"><div class="h-1.5 rounded-full bg-emerald-500" :style="{ width: usageWidth(item.value) }" /></div><span class="w-9 text-right">{{ usageLabel(item.value) }}</span>
                  </div>
                </div>
                <span v-else class="text-xs text-slate-400">未查询</span>
              </td>
              <td class="px-2 py-3 align-middle text-center">
                <div class="flex min-w-0 flex-col items-center justify-center">
                  <StatusBadge :value="displayHealthStatus(account)" />
                  <div v-if="displayHealthStatus(account) !== 'healthy' && account.lastErrorSummary" class="mt-1.5 w-full truncate px-1 text-xs leading-4 text-red-600" :title="account.lastErrorSummary">
                    {{ shortError(account.lastErrorSummary) }}
                  </div>
                </div>
              </td>
              <td class="px-4 py-3 text-center"><StatusBadge :value="account.syncStatus" /></td>
              <td class="px-4 py-3 text-slate-500">{{ formatTime(account.lastCheckAt) }}</td>
              <td class="sticky right-0 z-10 border-l border-slate-200 bg-white px-4 py-3 group-hover:bg-slate-50">
                <div class="flex justify-end gap-1">
                  <button class="icon-button" title="自动授权或重新授权" aria-label="自动授权或重新授权" @click="openAuthorization(account)"><Bot :size="16" /></button>
                  <button class="icon-button" title="编辑" aria-label="编辑" @click="edit(account)"><Pencil :size="16" /></button>
                  <button class="icon-button text-red-600" title="删除" aria-label="删除" @click="remove(account)"><Trash2 :size="16" /></button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        </div>
      </div>
    </div>

    <ModalDialog v-model:open="importOpen" title="添加账号" width="max-w-5xl">
      <div class="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <label class="label" for="credentialText">账号数据</label>
          <textarea id="credentialText" v-model="credentialText" class="textarea h-64 font-mono" spellcheck="false" placeholder="邮箱--密码--2FA密钥"></textarea>
          <div class="mt-4 flex gap-2">
            <button class="button" :disabled="!credentialText.trim() || importing" @click="preview"><ScanSearch :size="17" />预检</button>
            <button class="button button-primary" :disabled="!validCount || importing" @click="submitImport"><LoaderCircle v-if="importing" :size="17" class="animate-spin" /><Upload v-else :size="17" />导入 {{ validCount || '' }}</button>
          </div>
        </div>
        <div class="min-w-0">
          <div class="mb-2 flex items-center justify-between"><span class="text-sm font-medium">预检结果</span><span class="text-xs text-slate-500">有效 {{ validCount }}</span></div>
          <div class="h-[354px] overflow-auto rounded-md border border-slate-200">
            <table class="w-full text-left text-sm">
              <thead class="sticky top-0 bg-slate-50 text-xs text-slate-500"><tr><th class="px-3 py-2">行</th><th class="px-3 py-2">邮箱</th><th class="px-3 py-2">状态</th></tr></thead>
              <tbody class="divide-y divide-slate-100">
                <tr v-for="row in previewRows" :key="String(row.line)"><td class="px-3 py-2">{{ row.line }}</td><td class="max-w-48 truncate px-3 py-2">{{ row.email || row.message }}</td><td class="px-3 py-2"><StatusBadge :value="String(row.status)" /></td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </ModalDialog>

    <ModalDialog v-model:open="editOpen" title="编辑账号" width="max-w-lg">
      <form class="space-y-4" @submit.prevent="saveEdit">
        <div><label class="label">邮箱</label><input v-model="editForm.email" class="input" type="email" required /></div>
        <div><label class="label">备注</label><textarea v-model="editForm.notes" class="textarea" rows="3"></textarea></div>
        <div><label class="label">新密码</label><input v-model="editForm.password" class="input" type="password" autocomplete="new-password" /></div>
        <div><label class="label">新 2FA 密钥</label><input v-model="editForm.totpSecret" class="input font-mono" /></div>
        <div class="flex justify-end gap-2"><button type="button" class="button" @click="editOpen = false">取消</button><button class="button button-primary">保存</button></div>
      </form>
    </ModalDialog>

    <ModalDialog v-model:open="authOpen" title="自动授权" width="max-w-lg">
      <form class="space-y-4" @submit.prevent="queueAuthorization">
        <div><label class="label" for="sub2apiAccountName">Sub2API 账号名称</label><input id="sub2apiAccountName" v-model="authSub2apiName" class="input" maxlength="200" required /></div>
        <div class="flex justify-end gap-2"><button type="button" class="button" @click="authOpen = false">取消</button><button class="button button-primary" :disabled="!authSub2apiName.trim() || authorizing"><LoaderCircle v-if="authorizing" :size="17" class="animate-spin" /><Bot v-else :size="17" />开始自动授权</button></div>
      </form>
    </ModalDialog>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { Bot, Download, LoaderCircle, Pencil, Plus, RefreshCw, ScanSearch, Search, Trash2, Upload, Users } from 'lucide-vue-next'
import type { ManagedAccount } from '../../shared/types'
import { api } from '../api'
import ModalDialog from '../components/ModalDialog.vue'
import StatusBadge from '../components/StatusBadge.vue'

const accounts = ref<ManagedAccount[]>([])
const selectedIds = ref<string[]>([])
const allSelected = computed(() => accounts.value.length > 0 && accounts.value.every((account) => selectedIds.value.includes(account.id)))
const loading = ref(false)
const importing = ref(false)
const authorizing = ref(false)
const search = ref('')
const error = ref('')
const message = ref('')
const importOpen = ref(false)
const credentialText = ref('')
const previewRows = ref<Array<Record<string, unknown>>>([])
const validCount = computed(() => previewRows.value.filter((row) => row.status === 'valid').length)
const editOpen = ref(false)
const editingId = ref('')
const editForm = ref({ email: '', notes: '', password: '', totpSecret: '' })
const authOpen = ref(false)
const authAccountId = ref('')
const authSub2apiName = ref('')
let searchTimer: number | undefined
let statusPollTimer: number | undefined
const refreshWhenVisible = () => { if (document.visibilityState === 'visible') void pollStatuses() }

function formatTime(value: string | null) { return value ? new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '-' }
function shortError(value: string): string {
  let summary = value.trim()
  try {
    const parsed = JSON.parse(summary) as Record<string, unknown>
    const message = typeof parsed.message === 'string' ? parsed.message : typeof parsed.error === 'string' ? parsed.error : ''
    const status = typeof parsed.status === 'number' ? `HTTP ${parsed.status}：` : ''
    if (message) summary = `${status}${message}`
  } catch {
    summary = summary.replace(/\s+/g, ' ')
  }
  return summary.length > 58 ? `${summary.slice(0, 58)}…` : summary
}
function usageWidth(value: number | null): string { return `${Math.min(Math.max(value ?? 0, 0), 100)}%` }
function usageLabel(value: number | null): string { return value === null ? '-' : `${Math.round(value)}%` }
function displayHealthStatus(account: ManagedAccount): string {
  return Math.max(account.usageFiveHourPercent ?? 0, account.usageSevenDayPercent ?? 0) >= 100 ? 'rate_limited' : account.healthStatus
}
function authorizationResult(account: ManagedAccount) {
  const code = account.lastAuthorizationErrorCode
  const errorDetail = account.lastAuthorizationErrorSummary || '授权失败，未返回详细原因'
  if (account.lastAuthorizationStatus === 'failed') {
    return { label: '失败', detail: errorDetail, title: code ? `${code}: ${errorDetail}` : errorDetail, tone: 'text-red-700' }
  }
  if (account.lastAuthorizationStatus === 'pending' || account.lastAuthorizationStatus === 'running') {
    const detail = account.lastAuthorizationStatus === 'pending' ? '等待后台执行' : '后台正在执行自动授权'
    return { label: '进行中', detail, title: detail, tone: 'text-blue-700' }
  }
  if (account.lastAuthorizationStatus === 'completed' || account.lastAuthAt) {
    const detail = `完成时间：${formatTime(account.lastAuthAt || account.lastAuthorizationAt)}`
    return { label: '成功', detail, title: detail, tone: 'text-emerald-700' }
  }
  return { label: '未执行', detail: '尚无授权记录', title: '尚无授权记录', tone: 'text-slate-600' }
}
function setResult(text: string, isError = false) { error.value = isError ? text : ''; message.value = isError ? '' : text }
function toggleAll(event: Event) { const checked = (event.target as HTMLInputElement).checked; selectedIds.value = checked ? accounts.value.map((account) => account.id) : [] }
async function load() { loading.value = true; try { accounts.value = (await api.listAccounts(search.value)).items; selectedIds.value = selectedIds.value.filter((id) => accounts.value.some((account) => account.id === id)) } catch (e) { setResult(e instanceof Error ? e.message : '加载失败', true) } finally { loading.value = false } }
async function pollStatuses() { try { accounts.value = (await api.listAccounts(search.value)).items } catch { /* Keep the current list during transient polling failures. */ } }
function debouncedLoad() { window.clearTimeout(searchTimer); searchTimer = window.setTimeout(load, 250) }
function openImport() { credentialText.value = ''; previewRows.value = []; importOpen.value = true }
async function preview() { try { const response = await api.previewImport(credentialText.value); previewRows.value = response.rows } catch (e) { setResult(e instanceof Error ? e.message : '预检失败', true) } }
async function submitImport() { importing.value = true; try { const result = await api.importAccounts(credentialText.value); importOpen.value = false; setResult(`已导入 ${result.created.length} 个账号${result.errors.length ? `，${result.errors.length} 行未导入` : ''}`); await load() } catch (e) { setResult(e instanceof Error ? e.message : '导入失败', true) } finally { importing.value = false } }
function edit(account: ManagedAccount) { editingId.value = account.id; editForm.value = { email: account.email, notes: account.notes, password: '', totpSecret: '' }; editOpen.value = true }
async function saveEdit() { try { const body = { ...editForm.value }; if (!body.password) delete (body as Partial<typeof body>).password; if (!body.totpSecret) delete (body as Partial<typeof body>).totpSecret; await api.updateAccount(editingId.value, body); editOpen.value = false; setResult('账号已更新'); await load() } catch (e) { setResult(e instanceof Error ? e.message : '保存失败', true) } }
async function remove(account: ManagedAccount) { const remote = Boolean(account.sub2apiAccountId) && confirm('同时删除 Sub2API 中的账号？\n选择“取消”将只永久删除工作台记录。'); if (!confirm(`确认永久删除 ${account.email}？\n本地账号、加密凭据及关联记录将被物理删除，且不可恢复。`)) return; try { await api.deleteAccount(account.id, remote); setResult('账号已永久删除'); await load() } catch (e) { setResult(e instanceof Error ? e.message : '删除失败', true) } }
function openAuthorization(account: ManagedAccount) { authAccountId.value = account.id; authSub2apiName.value = account.sub2apiAccountName || account.email; authOpen.value = true }
async function queueAuthorization() { authorizing.value = true; try { await api.autoAuthorize(authAccountId.value, authSub2apiName.value.trim()); authOpen.value = false; setResult('自动授权任务已开始'); await load() } catch (e) { setResult(e instanceof Error ? e.message : '自动授权启动失败', true) } finally { authorizing.value = false } }
onMounted(() => {
  void load()
  statusPollTimer = window.setInterval(() => {
    if (document.visibilityState === 'visible') void pollStatuses()
  }, 5_000)
  document.addEventListener('visibilitychange', refreshWhenVisible)
  window.addEventListener('focus', refreshWhenVisible)
})
onUnmounted(() => {
  window.clearTimeout(searchTimer)
  window.clearInterval(statusPollTimer)
  document.removeEventListener('visibilitychange', refreshWhenVisible)
  window.removeEventListener('focus', refreshWhenVisible)
})
</script>

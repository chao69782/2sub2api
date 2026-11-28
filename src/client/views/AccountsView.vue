<template>
  <section class="space-y-6">
    <!-- Page Header -->
    <header class="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight text-ink-primary sm:text-[26px]">账号工作台</h1>
        <p class="mt-1 text-sm text-ink-muted">集中管理 OpenAI 凭据、自动授权、2FA 轮换与 Sub2API 同步状态</p>
      </div>
      <div class="flex items-center gap-2.5">
        <button
          type="button"
          class="btn"
          title="手动刷新列表"
          :disabled="loading"
          @click="load"
        >
          <RefreshCw :size="15" :class="{ 'animate-spin': loading }" />
          <span class="hidden sm:inline">刷新</span>
        </button>
        <button type="button" class="btn btn-primary" @click="importOpen = true">
          <Plus :size="16" />
          <span>添加账号</span>
        </button>
      </div>
    </header>

    <!-- Bento Usage Dashboard -->
    <UsageBento :summary="usageSummary" :loading="loading" />

    <!-- Accounts Main Surface -->
    <div class="surface-card overflow-hidden">
      <!-- Toolbar -->
      <div class="space-y-3.5 border-b border-line-subtle p-4 sm:p-5">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex items-center gap-2.5">
            <h2 class="text-sm font-semibold text-ink-primary">账号列表</h2>
            <span class="rounded-full bg-subtle px-2 py-0.5 font-mono text-xs text-ink-secondary">{{ total }}</span>
            <span v-if="hasListFilter" class="text-xs text-ink-muted">· 已应用筛选</span>
          </div>

          <!-- Search Box -->
          <div class="relative w-full sm:w-72">
            <Search
              class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted"
              :size="15"
              aria-hidden="true"
            />
            <input
              v-model="search"
              class="field-input h-9 pl-9 pr-8 text-xs"
              aria-label="搜索邮箱"
              placeholder="搜索邮箱地址…"
              @input="debouncedLoad"
            />
            <button
              v-if="search"
              type="button"
              class="icon-btn absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 text-ink-muted"
              aria-label="清空搜索"
              @click="clearSearch"
            >
              <X :size="13" />
            </button>
          </div>
        </div>

        <!-- Status Quick Filter Pills -->
        <div class="flex flex-wrap items-center gap-1.5" role="group" aria-label="按健康状态筛选">
          <button
            v-for="pill in statusFilterPills"
            :key="pill.value"
            type="button"
            class="h-7 rounded-full border px-3 text-xs font-medium transition-colors"
            :class="
              healthStatusFilter === pill.value
                ? 'border-accent bg-accent-soft text-accent'
                : 'border-line-subtle bg-transparent text-ink-secondary hover:bg-subtle hover:text-ink-primary'
            "
            @click="selectHealthFilter(pill.value)"
          >
            {{ pill.label }}
          </button>
        </div>
      </div>

      <!-- Loading State -->
      <div v-if="loading && !accounts.length" class="flex h-56 flex-col items-center justify-center gap-3 text-ink-muted">
        <LoaderCircle class="animate-spin text-accent" :size="22" />
        <span class="text-xs">正在加载账号数据…</span>
      </div>

      <!-- Empty State -->
      <div v-else-if="!accounts.length" class="flex min-h-[260px] flex-col items-center justify-center gap-3 p-8 text-center">
        <div class="flex h-12 w-12 items-center justify-center rounded-full bg-subtle text-ink-muted">
          <Users :size="22" aria-hidden="true" />
        </div>
        <div>
          <h3 class="text-sm font-semibold text-ink-primary">
            {{ hasListFilter ? '没有符合筛选条件的账号' : '还没有任何账号' }}
          </h3>
          <p class="mt-1 max-w-xs text-xs leading-5 text-ink-muted">
            {{ hasListFilter ? '尝试更换搜索关键词或清除状态筛选条件' : '导入邮箱、密码与 2FA 密钥，立即开始自动化授权与调度管理' }}
          </p>
        </div>
        <button v-if="hasListFilter" type="button" class="btn btn-sm mt-1" @click="resetFilters">清除筛选</button>
        <button v-else type="button" class="btn btn-primary btn-sm mt-1" @click="importOpen = true">
          <Plus :size="14" />添加第一个账号
        </button>
      </div>

      <!-- Account List Content -->
      <template v-else>
        <!-- Mobile Card List -->
        <div class="divide-y divide-line-subtle lg:hidden">
          <article
            v-for="account in accounts"
            :key="account.id"
            class="space-y-3.5 p-4 transition-colors"
            :class="{ 'bg-accent-soft/40': selectedIds.includes(account.id) }"
          >
            <div class="flex items-start gap-3">
              <input
                v-model="selectedIds"
                type="checkbox"
                class="mt-1"
                :value="account.id"
                :aria-label="`选择 ${account.email}`"
              />
              <div class="min-w-0 flex-1">
                <div class="truncate text-sm font-medium text-ink-primary" :title="account.email">
                  {{ account.email }}
                </div>
                <div class="mt-0.5 truncate font-mono text-xs text-ink-muted">
                  Sub2API：{{ account.sub2apiAccountName || '未设置' }}
                </div>
                <TotpRotationProgress
                  v-if="account.totpRotationStatus"
                  :account="account"
                  :fallback-label="totpRotationLabel(account)"
                  compact
                  @inspect="openRotationDrawer(account)"
                />
              </div>
              <StatusBadge :value="displayHealthStatus(account)" />
            </div>

            <!-- Status & Metrics Strip -->
            <div class="flex flex-wrap items-center gap-2 text-xs">
              <StatusBadge :value="account.syncStatus" />
              <span
                v-if="isSchedulingPaused(account)"
                class="pill-badge"
                style="background-color: var(--status-warn-bg); color: var(--status-warn)"
              >
                已暂停调度
              </span>
              <span class="ml-auto font-mono text-[11px] text-ink-muted">
                重授权 {{ account.autoReauthorizationCount }} 次
              </span>
            </div>

            <!-- Usage Bars -->
            <div class="rounded-control bg-subtle/60 px-3 py-2.5 text-xs">
              <div
                v-if="account.usageFiveHourPercent !== null || account.usageSevenDayPercent !== null"
                class="space-y-2"
              >
                <div
                  v-for="item in usageItems(account)"
                  :key="item.label"
                  class="flex items-center gap-2.5"
                >
                  <span class="w-6 shrink-0 font-mono text-[11px] text-ink-muted">{{ item.label }}</span>
                  <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-surface">
                    <div
                      class="h-full rounded-full"
                      :style="{ width: usageWidth(item.value), backgroundColor: usageBarColor(item.value) }"
                    ></div>
                  </div>
                  <span class="w-9 text-right font-mono text-[11px] text-ink-secondary">{{ usageLabel(item.value) }}</span>
                </div>
              </div>
              <span v-else class="text-ink-muted">用量窗口暂未查询</span>
            </div>

            <!-- Authorization Result -->
            <div class="flex items-start justify-between gap-2 text-xs">
              <div class="min-w-0">
                <span class="font-medium" :style="{ color: authorizationResult(account).color }">
                  授权{{ authorizationResult(account).label }}
                </span>
                <span class="ml-1.5 break-words text-ink-muted">{{ authorizationResult(account).detail }}</span>
              </div>
              <span class="shrink-0 font-mono text-[11px] text-ink-muted">{{ formatTime(account.lastCheckAt) }}</span>
            </div>

            <!-- Mobile Action Bar -->
            <div class="flex items-center gap-1.5 border-t border-line-subtle pt-3">
              <button
                type="button"
                class="btn btn-sm h-10 flex-1"
                @click="openAuthorization(account, 'authorize')"
              >
                <Bot :size="15" /><span>授权</span>
              </button>
              <button
                type="button"
                class="icon-btn h-10 w-10"
                :title="schedulingActionLabel(account)"
                :aria-label="schedulingActionLabel(account)"
                :disabled="!account.sub2apiAccountId || changingSchedulingIds.has(account.id)"
                @click="toggleScheduling(account)"
              >
                <LoaderCircle v-if="changingSchedulingIds.has(account.id)" class="animate-spin" :size="16" />
                <Play v-else-if="isSchedulingPaused(account)" :size="16" />
                <Pause v-else :size="16" />
              </button>
              <button
                type="button"
                class="icon-btn h-10 w-10"
                title="更换 2FA 并导入 Sub2API"
                aria-label="更换 2FA 并导入 Sub2API"
                :disabled="rotationInProgress(account)"
                @click="openAuthorization(account, 'rotate_totp')"
              >
                <KeyRound :size="16" />
              </button>
              <button
                type="button"
                class="icon-btn h-10 w-10"
                title="查看安全凭据"
                aria-label="查看安全凭据"
                @click="openCredentials(account)"
              >
                <Eye :size="16" />
              </button>
              <button
                type="button"
                class="icon-btn icon-btn-danger h-10 w-10"
                title="删除账号"
                aria-label="删除账号"
                @click="askDelete(account)"
              >
                <Trash2 :size="16" />
              </button>
            </div>
          </article>
        </div>

        <!-- Desktop Precision Table -->
        <div class="hidden overflow-x-auto lg:block">
          <table class="w-full min-w-[980px] text-left text-sm">
            <thead class="border-b border-line-subtle bg-subtle/50 text-xs font-medium text-ink-muted">
              <tr>
                <th class="w-11 px-4 py-3">
                  <input type="checkbox" :checked="allSelected" aria-label="全选当前页账号" @change="toggleAll" />
                </th>
                <th class="min-w-[230px] px-3 py-3">账号 / Sub2API</th>
                <th class="w-[140px] px-3 py-3">健康与调度</th>
                <th class="w-[156px] px-3 py-3">用量窗口</th>
                <th class="min-w-[170px] px-3 py-3">授权与同步</th>
                <th class="w-[126px] px-3 py-3">最近检查</th>
                <th class="w-[216px] px-4 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-line-subtle">
              <tr
                v-for="account in accounts"
                :key="account.id"
                class="transition-colors hover:bg-subtle/45"
                :class="{ 'bg-accent-soft/45 hover:bg-accent-soft/60': selectedIds.includes(account.id) }"
              >
                <!-- Select -->
                <td class="px-4 py-3.5 align-middle">
                  <input
                    v-model="selectedIds"
                    type="checkbox"
                    :value="account.id"
                    :aria-label="`选择 ${account.email}`"
                  />
                </td>

                <!-- Identity -->
                <td class="px-3 py-3.5 align-middle">
                  <div class="max-w-[260px] truncate font-medium text-ink-primary" :title="account.email">
                    {{ account.email }}
                  </div>
                  <div class="mt-0.5 flex items-center gap-1.5 text-xs text-ink-muted">
                    <span class="max-w-[200px] truncate font-mono" :title="account.sub2apiAccountName || ''">
                      {{ account.sub2apiAccountName || '未命名 Sub2API 账号' }}
                    </span>
                  </div>
                  <TotpRotationProgress
                    v-if="account.totpRotationStatus"
                    :account="account"
                    :fallback-label="totpRotationLabel(account)"
                    compact
                    @inspect="openRotationDrawer(account)"
                  />
                </td>

                <!-- Health & Scheduling -->
                <td class="px-3 py-3.5 align-middle">
                  <div class="flex flex-col items-start gap-1.5">
                    <StatusBadge :value="displayHealthStatus(account)" />
                    <span
                      v-if="isSchedulingPaused(account)"
                      class="pill-badge text-[11px]"
                      style="background-color: var(--status-warn-bg); color: var(--status-warn)"
                    >
                      已暂停调度
                    </span>
                    <span
                      v-if="account.sub2apiStatus?.toLowerCase() === 'error'"
                      class="max-w-[130px] truncate text-[11px]"
                      style="color: var(--status-danger)"
                      title="Sub2API 账号错误"
                    >
                      Sub2API 账号错误
                    </span>
                    <span
                      v-else-if="displayHealthStatus(account) !== 'healthy' && account.lastErrorSummary"
                      class="max-w-[130px] truncate text-[11px]"
                      style="color: var(--status-danger)"
                      :title="account.lastErrorSummary"
                    >
                      {{ shortError(account.lastErrorSummary) }}
                    </span>
                  </div>
                </td>

                <!-- Usage Bars -->
                <td class="px-3 py-3.5 align-middle">
                  <div
                    v-if="account.usageFiveHourPercent !== null || account.usageSevenDayPercent !== null"
                    class="space-y-2"
                  >
                    <div v-for="item in usageItems(account)" :key="item.label" class="flex items-center gap-2">
                      <span class="w-5 shrink-0 font-mono text-[11px] text-ink-muted">{{ item.label }}</span>
                      <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-subtle">
                        <div
                          class="h-full rounded-full transition-all duration-300"
                          :style="{ width: usageWidth(item.value), backgroundColor: usageBarColor(item.value) }"
                        ></div>
                      </div>
                      <span class="w-8 text-right font-mono text-[11px] text-ink-secondary">
                        {{ usageLabel(item.value) }}
                      </span>
                    </div>
                  </div>
                  <span v-else class="text-xs text-ink-muted">未查询</span>
                </td>

                <!-- Auth & Sync -->
                <td class="px-3 py-3.5 align-middle" :title="authorizationResult(account).title">
                  <div class="flex flex-wrap items-center gap-1.5">
                    <StatusBadge :value="account.syncStatus" />
                    <span
                      v-if="account.autoReauthorizationCount > 0"
                      class="rounded-md bg-subtle px-1.5 py-0.5 font-mono text-[11px] text-ink-muted"
                      :title="`自动重授权 ${account.autoReauthorizationCount} 次`"
                    >
                      ×{{ account.autoReauthorizationCount }}
                    </span>
                  </div>
                  <div class="mt-1.5 flex items-baseline gap-1.5 text-xs">
                    <span class="shrink-0 font-medium" :style="{ color: authorizationResult(account).color }">
                      {{ authorizationResult(account).label }}
                    </span>
                    <span class="max-w-[160px] truncate text-ink-muted">
                      {{ authorizationResult(account).detail }}
                    </span>
                  </div>
                </td>

                <!-- Last Check -->
                <td class="px-3 py-3.5 align-middle font-mono text-xs text-ink-muted">
                  {{ formatTime(account.lastCheckAt) }}
                </td>

                <!-- Actions -->
                <td class="px-4 py-3.5 text-right align-middle">
                  <div class="inline-flex items-center justify-end gap-1">
                    <button
                      type="button"
                      class="btn btn-sm mr-1"
                      title="自动授权或重新授权"
                      @click="openAuthorization(account, 'authorize')"
                    >
                      <Bot :size="14" />
                      <span>授权</span>
                    </button>
                    <button
                      type="button"
                      class="icon-btn h-8 w-8"
                      :title="schedulingActionLabel(account)"
                      :aria-label="schedulingActionLabel(account)"
                      :disabled="!account.sub2apiAccountId || changingSchedulingIds.has(account.id)"
                      @click="toggleScheduling(account)"
                    >
                      <LoaderCircle v-if="changingSchedulingIds.has(account.id)" class="animate-spin" :size="15" />
                      <Play v-else-if="isSchedulingPaused(account)" :size="15" />
                      <Pause v-else :size="15" />
                    </button>
                    <button
                      type="button"
                      class="icon-btn h-8 w-8"
                      title="更换 2FA、退出设备并导入 Sub2API"
                      aria-label="更换 2FA、退出设备并导入 Sub2API"
                      :disabled="rotationInProgress(account)"
                      @click="openAuthorization(account, 'rotate_totp')"
                    >
                      <KeyRound :size="15" />
                    </button>
                    <button
                      type="button"
                      class="icon-btn h-8 w-8"
                      title="查看安全凭据"
                      aria-label="查看安全凭据"
                      @click="openCredentials(account)"
                    >
                      <Eye :size="15" />
                    </button>
                    <button
                      type="button"
                      class="icon-btn icon-btn-danger h-8 w-8"
                      title="删除账号"
                      aria-label="删除账号"
                      @click="askDelete(account)"
                    >
                      <Trash2 :size="15" />
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>

      <!-- Pagination -->
      <nav
        v-if="!loading && total > 0"
        class="flex flex-wrap items-center justify-between gap-3 border-t border-line-subtle px-4 py-3 text-xs text-ink-muted sm:px-5"
        aria-label="账号列表分页"
      >
        <span class="font-mono">显示 {{ pageStart }}–{{ pageEnd }} / {{ total }}</span>
        <div class="flex flex-wrap items-center gap-2">
          <label class="flex items-center gap-1.5" for="account-page-size">
            <span>每页</span>
            <select
              id="account-page-size"
              v-model.number="pageSize"
              class="field-select h-8 w-[72px] px-2 text-xs"
              @change="resetPageAndLoad"
            >
              <option :value="20">20</option>
              <option :value="50">50</option>
              <option :value="100">100</option>
            </select>
          </label>
          <div class="inline-flex items-center gap-1">
            <button type="button" class="btn btn-sm" :disabled="page <= 1" @click="changePage(1)">首页</button>
            <button type="button" class="btn btn-sm" :disabled="page <= 1" @click="changePage(page - 1)">上一页</button>
            <span class="px-2 font-mono text-ink-primary">{{ page }} / {{ totalPages }}</span>
            <button type="button" class="btn btn-sm" :disabled="page >= totalPages" @click="changePage(page + 1)">下一页</button>
            <button type="button" class="btn btn-sm" :disabled="page >= totalPages" @click="changePage(totalPages)">末页</button>
          </div>
        </div>
      </nav>
    </div>

    <!-- Floating Batch Selection Bar -->
    <Transition name="fade-scale">
      <div
        v-if="selectedIds.length > 0"
        class="fixed bottom-16 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-full border border-line-strong bg-elevated px-4 py-2 shadow-elevated md:bottom-6"
        role="region"
        aria-label="批量操作"
      >
        <span class="text-xs font-medium text-ink-primary">
          已选 <strong class="font-mono text-accent">{{ selectedIds.length }}</strong> 个账号
        </span>
        <span class="h-4 w-px bg-line-subtle" aria-hidden="true"></span>
        <button
          type="button"
          class="btn btn-primary btn-sm rounded-full"
          title="导出选中的账号---密码---2FA"
          @click="api.exportAccounts(selectedIds)"
        >
          <Download :size="14" />
          <span>导出选中</span>
        </button>
        <button type="button" class="btn btn-ghost btn-sm rounded-full" @click="selectedIds = []">
          清空
        </button>
      </div>
    </Transition>

    <!-- 2FA Rotation Timeline Slide Drawer -->
    <SlideDrawer
      v-model:open="drawerOpen"
      title="2FA 更换与导入进度"
      :subtitle="inspectedAccount?.email"
    >
      <TotpRotationProgress
        v-if="inspectedAccount"
        :account="inspectedAccount"
        :fallback-label="totpRotationLabel(inspectedAccount)"
      />
      <template v-if="inspectedAccount" #footer>
        <div class="flex items-center justify-end gap-2">
          <button type="button" class="btn btn-sm" @click="drawerOpen = false">关闭</button>
          <button
            type="button"
            class="btn btn-primary btn-sm"
            @click="retryFromDrawer(inspectedAccount)"
          >
            <Bot :size="14" />
            <span>重新自动授权</span>
          </button>
        </div>
      </template>
    </SlideDrawer>

    <!-- Modals -->
    <AccountImportModal v-model:open="importOpen" @imported="handleImported" />
    <AccountCredentialsModal v-model:open="credentialsOpen" :credentials="credentials" />
    <AccountAuthModal
      v-model:open="authOpen"
      :mode="authMode"
      :account="authAccount"
      :defaults="globalSettings?.importDefaults ?? null"
      :groups="groups"
      :proxies="proxies"
      @queued="handleAuthQueued"
    />

    <!-- Custom Delete Confirmation Dialog -->
    <ConfirmDialog
      v-model:open="deleteOpen"
      title="永久删除账号"
      :message="`确认永久删除 ${deleteTarget?.email || ''}？`"
      description="本地账号记录、加密凭据及关联任务历史将被彻底物理删除，且不可恢复。"
      confirm-label="确认永久删除"
      danger
      :loading="deleting"
      :checkbox-label="deleteTarget?.sub2apiAccountId ? '同时删除 Sub2API 中的对应远端账号' : undefined"
      :checkbox-value="deleteRemote"
      @update:checkbox-value="deleteRemote = $event"
      @confirm="confirmDelete"
    />
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  Bot,
  Download,
  Eye,
  KeyRound,
  LoaderCircle,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Users,
  X
} from 'lucide-vue-next'
import { displayHealthStatus, isSchedulingPaused } from '../../shared/account-status'
import type { AccountUsageSummary, HealthStatus, ManagedAccount, RuntimeSettings } from '../../shared/types'
import { api } from '../api'
import AccountAuthModal from '../components/accounts/AccountAuthModal.vue'
import AccountCredentialsModal, { type CredentialPayload } from '../components/accounts/AccountCredentialsModal.vue'
import AccountImportModal from '../components/accounts/AccountImportModal.vue'
import UsageBento from '../components/accounts/UsageBento.vue'
import ConfirmDialog from '../components/ConfirmDialog.vue'
import SlideDrawer from '../components/SlideDrawer.vue'
import StatusBadge from '../components/StatusBadge.vue'
import TotpRotationProgress from '../components/TotpRotationProgress.vue'
import { showToast } from '../composables/useToast'

const statusFilterPills: ReadonlyArray<{ value: HealthStatus | ''; label: string }> = [
  { value: '', label: '全部状态' },
  { value: 'healthy', label: '健康' },
  { value: 'rate_limited', label: '限流' },
  { value: 'degraded', label: '异常' },
  { value: 'invalid_credentials', label: '凭据失效' },
  { value: 'upstream_blocked', label: '上游阻止' },
  { value: 'network_error', label: '网络错误' },
  { value: 'unknown', label: '未知' }
]

const accounts = ref<ManagedAccount[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = ref(20)
const search = ref('')
const healthStatusFilter = ref<HealthStatus | ''>('')
const usageSummary = ref<AccountUsageSummary | null>(null)
const selectedIds = ref<string[]>([])
const loading = ref(false)
const changingSchedulingIds = ref(new Set<string>())

const totalPages = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))
const pageStart = computed(() => (total.value ? (page.value - 1) * pageSize.value + 1 : 0))
const pageEnd = computed(() => Math.min(page.value * pageSize.value, total.value))
const hasListFilter = computed(() => Boolean(search.value.trim() || healthStatusFilter.value))
const allSelected = computed(
  () => accounts.value.length > 0 && accounts.value.every((account) => selectedIds.value.includes(account.id))
)

// Modals & Drawer State
const importOpen = ref(false)
const credentialsOpen = ref(false)
const credentials = ref<CredentialPayload | null>(null)
watch(credentialsOpen, (open) => {
  if (!open) credentials.value = null
})

const authOpen = ref(false)
const authMode = ref<'authorize' | 'rotate_totp'>('authorize')
const authAccount = ref<ManagedAccount | null>(null)

const drawerOpen = ref(false)
const inspectedAccountId = ref<string | null>(null)
const inspectedAccount = computed(
  () => accounts.value.find((item) => item.id === inspectedAccountId.value) ?? null
)

const deleteOpen = ref(false)
const deleteTarget = ref<ManagedAccount | null>(null)
const deleteRemote = ref(false)
const deleting = ref(false)

// Cached Metadata for Auth Modal
const globalSettings = ref<RuntimeSettings | null>(null)
const groups = ref<Array<{ id: number; name: string }>>([])
const proxies = ref<Array<{ id: number; name: string; account_count?: number; latency_ms?: number }>>([])
let groupsMetadataLoaded = false
let proxiesMetadataLoaded = false
let authorizationMetadataRequest: Promise<void> | null = null

let searchTimer: number | undefined
let statusPollTimer: number | undefined
let listRequestId = 0

const refreshWhenVisible = () => {
  if (document.visibilityState === 'visible') void pollStatuses()
}

function formatTime(value: string | null) {
  return value ? new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '—'
}

function shortError(value: string): string {
  let summary = value.trim()
  try {
    const parsed = JSON.parse(summary) as Record<string, unknown>
    const msg = typeof parsed.message === 'string' ? parsed.message : typeof parsed.error === 'string' ? parsed.error : ''
    const status = typeof parsed.status === 'number' ? `HTTP ${parsed.status}：` : ''
    if (msg) summary = `${status}${msg}`
  } catch {
    summary = summary.replace(/\s+/g, ' ')
  }
  return summary.length > 48 ? `${summary.slice(0, 48)}…` : summary
}

function usageItems(account: ManagedAccount) {
  return [
    { label: '5h', value: account.usageFiveHourPercent },
    { label: '7d', value: account.usageSevenDayPercent }
  ]
}

function usageWidth(value: number | null): string {
  return `${Math.min(Math.max(value ?? 0, 0), 100)}%`
}

function usageLabel(value: number | null): string {
  return value === null ? '—' : `${Math.round(value)}%`
}

function usageBarColor(value: number | null): string {
  if (value === null) return 'var(--border-strong)'
  if (value >= 90) return 'var(--status-danger)'
  if (value >= 70) return 'var(--status-warn)'
  return 'var(--accent)'
}

function authorizationResult(account: ManagedAccount) {
  const code = account.lastAuthorizationErrorCode
  const errorDetail = account.lastAuthorizationErrorSummary || '授权失败，未返回详细原因'
  if (account.lastAuthorizationStatus === 'failed') {
    return {
      label: '失败',
      detail: errorDetail,
      title: code ? `${code}: ${errorDetail}` : errorDetail,
      color: 'var(--status-danger)'
    }
  }
  if (account.lastAuthorizationStatus === 'pending' || account.lastAuthorizationStatus === 'running') {
    const detail = account.lastAuthorizationStatus === 'pending' ? '等待后台执行' : '正在执行自动授权'
    return { label: '进行中', detail, title: detail, color: 'var(--status-info)' }
  }
  if (account.lastAuthorizationStatus === 'completed' || account.lastAuthAt) {
    const detail = formatTime(account.lastAuthAt || account.lastAuthorizationAt)
    return { label: '已授权', detail, title: `完成时间：${detail}`, color: 'var(--status-ok)' }
  }
  return { label: '未执行', detail: '尚无记录', title: '尚无授权记录', color: 'var(--text-muted)' }
}

function totpRotationLabel(account: ManagedAccount): string {
  if (account.totpRotationStatus === 'pending') return '2FA 更换：等待执行'
  if (account.totpRotationStatus === 'running') return '2FA 更换：进行中'
  if (account.totpRotationStatus === 'failed') return `2FA 更换失败：${account.totpRotationError || '请重试'}`
  return `2FA 已更换：${formatTime(account.totpRotatedAt)}`
}

function rotationInProgress(account: ManagedAccount): boolean {
  return (
    account.totpRotationStatus === 'pending' ||
    account.totpRotationStatus === 'running' ||
    (account.totpRotationStep === 'import_sub2api' &&
      (account.totpRotationImportStatus === 'pending' || account.totpRotationImportStatus === 'running'))
  )
}

function schedulingActionLabel(account: ManagedAccount): string {
  if (!account.sub2apiAccountId) return '授权后可调整调度'
  if (changingSchedulingIds.value.has(account.id)) return '正在更新调度'
  return isSchedulingPaused(account) ? '恢复调度' : '暂停调度'
}

function toggleAll(event: Event) {
  const visibleIds = new Set(accounts.value.map((account) => account.id))
  selectedIds.value = (event.target as HTMLInputElement).checked
    ? [...new Set([...selectedIds.value, ...visibleIds])]
    : selectedIds.value.filter((id) => !visibleIds.has(id))
}

async function refreshAccounts(showLoading: boolean) {
  const requestId = ++listRequestId
  if (showLoading) loading.value = true
  try {
    const response = await api.listAccounts({
      search: search.value,
      status: healthStatusFilter.value,
      page: page.value,
      pageSize: pageSize.value
    })
    if (requestId !== listRequestId) return
    accounts.value = response.items
    total.value = response.total
    page.value = response.page
    usageSummary.value = response.usageSummary
  } catch (cause) {
    if (showLoading && requestId === listRequestId) {
      showToast(cause instanceof Error ? cause.message : '加载账号列表失败', 'error')
    }
  } finally {
    if (requestId === listRequestId) loading.value = false
  }
}

async function load() {
  await refreshAccounts(true)
}

async function pollStatuses() {
  if (!loading.value) await refreshAccounts(false)
}

function debouncedLoad() {
  page.value = 1
  listRequestId += 1
  loading.value = true
  window.clearTimeout(searchTimer)
  searchTimer = window.setTimeout(load, 250)
}

function selectHealthFilter(status: HealthStatus | '') {
  if (healthStatusFilter.value === status) return
  healthStatusFilter.value = status
  resetPageAndLoad()
}

function clearSearch() {
  search.value = ''
  resetPageAndLoad()
}

function resetFilters() {
  search.value = ''
  healthStatusFilter.value = ''
  resetPageAndLoad()
}

function resetPageAndLoad() {
  window.clearTimeout(searchTimer)
  page.value = 1
  void load()
}

function changePage(nextPage: number) {
  if (nextPage < 1 || nextPage > totalPages.value || nextPage === page.value) return
  page.value = nextPage
  void load()
}

async function toggleScheduling(account: ManagedAccount) {
  if (!account.sub2apiAccountId || changingSchedulingIds.value.has(account.id)) return
  const schedulable = isSchedulingPaused(account)
  changingSchedulingIds.value.add(account.id)
  try {
    await api.setAccountSchedulable(account.id, schedulable)
    showToast(`${account.email} 已${schedulable ? '恢复' : '暂停'}调度`, 'success')
    await refreshAccounts(false)
  } catch (cause) {
    showToast(cause instanceof Error ? cause.message : '更新调度状态失败', 'error')
  } finally {
    changingSchedulingIds.value.delete(account.id)
  }
}

async function openCredentials(account: ManagedAccount) {
  try {
    credentials.value = await api.viewCredentials(account.id)
    credentialsOpen.value = true
  } catch (cause) {
    showToast(cause instanceof Error ? cause.message : '读取凭据失败', 'error')
  }
}

async function loadAuthorizationMetadata() {
  if (globalSettings.value && groupsMetadataLoaded && proxiesMetadataLoaded) return
  if (authorizationMetadataRequest) return authorizationMetadataRequest

  authorizationMetadataRequest = (async () => {
    let settingsError: unknown
    const requests: Array<Promise<void>> = []
    if (!globalSettings.value) {
      requests.push(
        api
          .getSettings()
          .then((configuration) => {
            globalSettings.value = configuration.value
          })
          .catch((cause) => {
            settingsError = cause
          })
      )
    }
    if (!groupsMetadataLoaded) {
      requests.push(
        api
          .listGroups()
          .then((response) => {
            groups.value = response.items
            groupsMetadataLoaded = true
          })
          .catch(() => {})
      )
    }
    if (!proxiesMetadataLoaded) {
      requests.push(
        api
          .listProxies()
          .then((response) => {
            proxies.value = response.items
            proxiesMetadataLoaded = true
          })
          .catch(() => {})
      )
    }
    await Promise.all(requests)
    if (!globalSettings.value) throw settingsError ?? new Error('无法读取全局导入配置')
  })()

  try {
    await authorizationMetadataRequest
  } finally {
    authorizationMetadataRequest = null
  }
}

async function openAuthorization(account: ManagedAccount, mode: 'authorize' | 'rotate_totp') {
  try {
    await loadAuthorizationMetadata()
    authAccount.value = account
    authMode.value = mode
    authOpen.value = true
  } catch (cause) {
    showToast(cause instanceof Error ? cause.message : '授权配置加载失败', 'error')
  }
}

function openRotationDrawer(account: ManagedAccount) {
  inspectedAccountId.value = account.id
  drawerOpen.value = true
}

function retryFromDrawer(account: ManagedAccount) {
  drawerOpen.value = false
  void openAuthorization(account, 'authorize')
}

function askDelete(account: ManagedAccount) {
  deleteTarget.value = account
  deleteRemote.value = false
  deleteOpen.value = true
}

async function confirmDelete() {
  if (!deleteTarget.value || deleting.value) return
  deleting.value = true
  try {
    const target = deleteTarget.value
    const remote = Boolean(target.sub2apiAccountId) && deleteRemote.value
    await api.deleteAccount(target.id, remote)
    selectedIds.value = selectedIds.value.filter((id) => id !== target.id)
    deleteOpen.value = false
    showToast(`已永久删除 ${target.email}`, 'success')
    await load()
  } catch (cause) {
    showToast(cause instanceof Error ? cause.message : '删除失败', 'error')
  } finally {
    deleting.value = false
  }
}

function handleImported(summary: string) {
  showToast(summary, 'success')
  void load()
}

function handleAuthQueued(summary: string) {
  showToast(summary, 'success')
  void load()
}

onMounted(() => {
  void load()
  void loadAuthorizationMetadata().catch(() => {})
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

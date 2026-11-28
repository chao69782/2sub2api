<template>
  <section class="space-y-6">
    <!-- Sticky Header -->
    <header
      class="glass-bar sticky top-14 z-20 -mx-4 flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 sm:-mx-6 sm:px-6 md:top-0 lg:-mx-10 lg:px-10"
    >
      <div class="min-w-0">
        <div class="flex items-center gap-2.5">
          <h1 class="text-xl font-semibold tracking-tight text-ink-primary sm:text-2xl">系统设置</h1>
          <span v-if="version > 0" class="rounded-full bg-subtle px-2.5 py-0.5 font-mono text-[11px] text-ink-muted">
            v{{ version }}
          </span>
          <span
            v-if="hasChanges"
            class="pill-badge text-[11px]"
            style="background-color: var(--status-warn-bg); color: var(--status-warn)"
          >
            <span class="h-1.5 w-1.5 rounded-full bg-current"></span>
            未保存
          </span>
        </div>
        <p class="mt-0.5 text-xs text-ink-muted sm:text-sm">管理主动检测调度、Sub2API 全局导入模板与模型路由规则</p>
      </div>

      <div class="flex items-center gap-2">
        <button type="button" class="btn" :disabled="testing" @click="testConnection">
          <LoaderCircle v-if="testing" :size="15" class="animate-spin" />
          <PlugZap v-else :size="15" />
          <span>测试 Sub2API</span>
        </button>
        <button type="button" class="btn btn-primary" :disabled="saving || !settings" @click="save">
          <LoaderCircle v-if="saving" :size="15" class="animate-spin" />
          <Save v-else :size="15" />
          <span>保存设置</span>
        </button>
      </div>
    </header>

    <!-- Loading Skeleton -->
    <div v-if="!settings" class="surface-card flex h-56 flex-col items-center justify-center gap-3 text-ink-muted">
      <LoaderCircle :size="22" class="animate-spin text-accent" />
      <span class="text-xs">正在加载工作台配置…</span>
    </div>

    <!-- Settings Workspace: Left Anchor Nav + Right Sections -->
    <div v-else class="grid items-start gap-6 xl:grid-cols-[200px_minmax(0,1fr)]">
      <!-- Sticky Section Nav (Desktop) -->
      <nav class="sticky top-24 hidden space-y-1 xl:block" aria-label="设置分区目录">
        <a
          v-for="item in sectionNav"
          :key="item.id"
          :href="`#${item.id}`"
          class="flex items-center gap-2.5 rounded-control px-3 py-2 text-xs font-medium text-ink-secondary transition-colors hover:bg-subtle hover:text-ink-primary"
        >
          <component :is="item.icon" :size="15" class="shrink-0 text-ink-muted" aria-hidden="true" />
          <span>{{ item.label }}</span>
        </a>
      </nav>

      <!-- Section Cards -->
      <div class="space-y-5">
        <!-- 1. Scheduler -->
        <section id="section-scheduler" class="surface-card scroll-mt-24 overflow-hidden">
          <header class="border-b border-line-subtle bg-subtle/40 px-5 py-4 sm:px-6">
            <h2 class="text-sm font-semibold text-ink-primary">检测与刷新调度</h2>
            <p class="mt-0.5 text-xs text-ink-muted">定期同步 Sub2API 状态、检查令牌有效性并在失效后触发自动重授权</p>
          </header>
          <div class="p-5 sm:p-6">
            <div class="max-w-xs">
              <NumberField
                v-model="settings.scheduler.checkIntervalMinutes"
                label="主动检测间隔"
                suffix="分钟"
                :min="1"
                :max="1440"
              />
            </div>
          </div>
        </section>

        <!-- 2. Sub2API Import Defaults -->
        <section id="section-import" class="surface-card scroll-mt-24 overflow-hidden">
          <header class="border-b border-line-subtle bg-subtle/40 px-5 py-4 sm:px-6">
            <h2 class="text-sm font-semibold text-ink-primary">Sub2API 全局导入模板</h2>
            <p class="mt-0.5 text-xs text-ink-muted">作为新账号自动授权或选择“使用全局配置”时的默认参数</p>
          </header>

          <div class="grid gap-6 p-5 sm:p-6 lg:grid-cols-2">
            <!-- Left Numeric & Toggle -->
            <div class="space-y-4">
              <div class="grid gap-4 sm:grid-cols-3 lg:grid-cols-2">
                <NumberField v-model="settings.importDefaults.concurrency" label="并发数量" :min="0" :max="1000" />
                <NumberField v-model="settings.importDefaults.priority" label="优先级" :min="0" :max="100000" />
                <NullableNumberField v-model="settings.importDefaults.loadFactor" label="负载系数" :min="1" :max="10000" />
              </div>

              <label
                class="flex cursor-pointer items-start gap-3 rounded-control border border-line-subtle bg-subtle/40 p-3.5 text-sm transition-colors hover:bg-subtle/70"
              >
                <input v-model="settings.importDefaults.autoPauseOnExpired" type="checkbox" class="mt-0.5" />
                <span>
                  <span class="block font-medium text-ink-primary">账号过期后自动暂停</span>
                  <span class="mt-0.5 block text-xs text-ink-muted">当授权令牌过期或异常时自动暂停 Sub2API 调度分配</span>
                </span>
              </label>
            </div>

            <!-- Right Groups & Proxy -->
            <div class="space-y-5">
              <fieldset>
                <legend class="field-label">OpenAI 分组</legend>
                <div class="max-h-40 space-y-1 overflow-auto rounded-control border border-line-subtle bg-canvas/50 p-2">
                  <label
                    v-for="group in groups"
                    :key="group.id"
                    class="flex min-h-9 cursor-pointer items-center gap-2.5 rounded-md px-2.5 text-xs transition-colors"
                    :class="
                      settings.importDefaults.groupIds.includes(group.id)
                        ? 'bg-accent-soft/70 text-ink-primary'
                        : 'text-ink-secondary hover:bg-subtle'
                    "
                  >
                    <input v-model="settings.importDefaults.groupIds" type="checkbox" :value="group.id" />
                    <span class="truncate font-medium">{{ group.name }}</span>
                    <span class="ml-auto font-mono text-[11px] text-ink-muted">ID {{ group.id }}</span>
                  </label>
                  <div v-if="!groups.length" class="px-2 py-4 text-center text-xs text-ink-muted">没有可用分组</div>
                </div>
              </fieldset>

              <fieldset>
                <legend class="field-label">代理分配策略</legend>
                <div class="grid grid-cols-3 rounded-control border border-line-subtle bg-subtle p-0.5 text-xs">
                  <button
                    v-for="policy in proxyPolicies"
                    :key="policy.value"
                    type="button"
                    class="h-8 rounded-[7px] font-medium transition-all"
                    :class="
                      settings.importDefaults.proxyPolicy === policy.value
                        ? 'bg-surface text-ink-primary shadow-sm'
                        : 'text-ink-muted hover:text-ink-primary'
                    "
                    @click="settings.importDefaults.proxyPolicy = policy.value"
                  >
                    {{ policy.label }}
                  </button>
                </div>

                <select
                  v-if="settings.importDefaults.proxyPolicy === 'fixed'"
                  v-model.number="settings.importDefaults.fixedProxyId"
                  class="field-select mt-3"
                  aria-label="固定代理"
                >
                  <option :value="null">选择代理</option>
                  <option v-for="proxy in proxies" :key="proxy.id" :value="proxy.id">
                    {{ proxy.name }} · {{ proxy.account_count || 0 }} 个账号 ·
                    {{ proxy.latency_ms ? `${proxy.latency_ms} ms` : '未测速' }}
                  </option>
                </select>
                <div
                  v-else-if="settings.importDefaults.proxyPolicy === 'auto'"
                  class="mt-3 rounded-control bg-subtle/60 px-3.5 py-2.5 text-xs leading-5 text-ink-muted"
                >
                  当前可用 <strong class="font-mono text-ink-primary">{{ proxies.length }}</strong> 个代理；按账号数最少、延迟最低自动选择，列表为空时直连。
                </div>
              </fieldset>
            </div>
          </div>
        </section>

        <!-- 3. Model Whitelist -->
        <section id="section-whitelist" class="surface-card scroll-mt-24 overflow-hidden">
          <header class="flex flex-wrap items-center justify-between gap-3 border-b border-line-subtle bg-subtle/40 px-5 py-4 sm:px-6">
            <div>
              <h2 class="text-sm font-semibold text-ink-primary">模型白名单</h2>
              <p class="mt-0.5 text-xs text-ink-muted">允许调度的准确模型 ID，不支持通配符</p>
            </div>
            <button type="button" class="btn btn-sm" @click="addWhitelistRow">
              <Plus :size="14" />添加模型
            </button>
          </header>

          <div class="p-5 sm:p-6">
            <div v-if="whitelistRows.length" class="space-y-2.5">
              <div
                v-for="(_, index) in whitelistRows"
                :key="index"
                class="grid grid-cols-[minmax(0,1fr)_36px] items-center gap-2.5"
              >
                <input
                  v-model="whitelistRows[index]"
                  class="field-input font-mono text-xs"
                  placeholder="例如 gpt-5.4"
                  aria-label="模型 ID"
                  spellcheck="false"
                />
                <button
                  type="button"
                  class="icon-btn icon-btn-danger h-10 w-9"
                  title="删除模型"
                  aria-label="删除模型"
                  @click="whitelistRows.splice(index, 1)"
                >
                  <Trash2 :size="15" />
                </button>
              </div>
            </div>
            <div v-else class="rounded-control border border-dashed border-line-strong py-6 text-center text-xs text-ink-muted">
              未设置模型白名单，点击右上角“添加模型”新增条目
            </div>
          </div>
        </section>

        <!-- 4. Model Mapping -->
        <section id="section-mapping" class="surface-card scroll-mt-24 overflow-hidden">
          <header class="flex flex-wrap items-center justify-between gap-3 border-b border-line-subtle bg-subtle/40 px-5 py-4 sm:px-6">
            <div>
              <h2 class="text-sm font-semibold text-ink-primary">模型映射</h2>
              <p class="mt-0.5 text-xs text-ink-muted">将客户端请求的模型 ID 映射至上游实际模型</p>
            </div>
            <button type="button" class="btn btn-sm" @click="addModelRow">
              <Plus :size="14" />添加映射
            </button>
          </header>

          <div class="p-5 sm:p-6">
            <div v-if="modelRows.length" class="space-y-2.5">
              <div
                class="hidden grid-cols-[minmax(0,1fr)_20px_minmax(0,1fr)_36px] items-center gap-2.5 px-1 text-[11px] font-medium text-ink-muted sm:grid"
              >
                <span>客户端模型</span>
                <span></span>
                <span>上游模型</span>
                <span></span>
              </div>
              <div
                v-for="(row, index) in modelRows"
                :key="index"
                class="grid grid-cols-[minmax(0,1fr)_36px] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_20px_minmax(0,1fr)_36px] sm:gap-2.5"
              >
                <input
                  v-model="row.source"
                  class="field-input font-mono text-xs"
                  placeholder="客户端模型"
                  aria-label="客户端模型"
                  spellcheck="false"
                />
                <ArrowRight :size="14" class="hidden justify-self-center text-ink-muted sm:block" aria-hidden="true" />
                <input
                  v-model="row.target"
                  class="field-input col-start-1 row-start-2 font-mono text-xs sm:col-start-auto sm:row-start-auto"
                  placeholder="上游模型"
                  aria-label="上游模型"
                  spellcheck="false"
                />
                <button
                  type="button"
                  class="icon-btn icon-btn-danger col-start-2 row-start-1 h-10 w-9 sm:col-start-auto sm:row-start-auto"
                  title="删除映射"
                  aria-label="删除映射"
                  @click="modelRows.splice(index, 1)"
                >
                  <Trash2 :size="15" />
                </button>
              </div>
            </div>
            <div v-else class="rounded-control border border-dashed border-line-strong py-6 text-center text-xs text-ink-muted">
              未设置模型映射，点击右上角“添加映射”新增规则
            </div>
          </div>
        </section>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  ArrowRight,
  Clock3,
  GitFork,
  ListChecks,
  LoaderCircle,
  PlugZap,
  Plus,
  Save,
  SlidersHorizontal,
  Trash2
} from 'lucide-vue-next'
import type { ProxyPolicy, RuntimeSettings } from '../../shared/types'
import { api } from '../api'
import NullableNumberField from '../components/NullableNumberField.vue'
import NumberField from '../components/NumberField.vue'
import { showToast } from '../composables/useToast'

const sectionNav = [
  { id: 'section-scheduler', label: '检测与刷新', icon: Clock3 },
  { id: 'section-import', label: 'Sub2API 导入模板', icon: SlidersHorizontal },
  { id: 'section-whitelist', label: '模型白名单', icon: ListChecks },
  { id: 'section-mapping', label: '模型映射', icon: GitFork }
]

const proxyPolicies: ReadonlyArray<{ value: ProxyPolicy; label: string }> = [
  { value: 'auto', label: '自动选择' },
  { value: 'direct', label: '不使用代理' },
  { value: 'fixed', label: '固定代理' }
]

const settings = ref<RuntimeSettings | null>(null)
const version = ref(0)
const groups = ref<Array<{ id: number; name: string }>>([])
const proxies = ref<Array<{ id: number; name: string; account_count?: number; latency_ms?: number }>>([])
const whitelistRows = ref<string[]>([])
const modelRows = ref<Array<{ source: string; target: string }>>([])
const saving = ref(false)
const testing = ref(false)
const savedSnapshot = ref('')

function serializeState() {
  if (!settings.value) return ''
  return JSON.stringify({
    settings: settings.value,
    whitelistRows: whitelistRows.value,
    modelRows: modelRows.value
  })
}

const hasChanges = computed(() => Boolean(savedSnapshot.value) && serializeState() !== savedSnapshot.value)

function addWhitelistRow() {
  whitelistRows.value.push('')
}

function addModelRow() {
  modelRows.value.push({ source: '', target: '' })
}

async function load() {
  try {
    const [configuration, groupResponse, proxyResponse] = await Promise.all([
      api.getSettings(),
      api.listGroups(),
      api.listProxies()
    ])
    settings.value = configuration.value
    version.value = configuration.version
    groups.value = groupResponse.items
    proxies.value = proxyResponse.items
    whitelistRows.value = [...configuration.value.importDefaults.modelWhitelist]
    modelRows.value = Object.entries(configuration.value.importDefaults.modelMapping).map(([source, target]) => ({
      source,
      target
    }))
    savedSnapshot.value = serializeState()
  } catch (cause) {
    showToast(cause instanceof Error ? cause.message : '设置加载失败', 'error')
  }
}

async function save() {
  if (!settings.value) return
  saving.value = true
  try {
    const whitelist = whitelistRows.value.map((modelId) => modelId.trim()).filter(Boolean)
    if (new Set(whitelist).size !== whitelist.length) throw new Error('模型白名单中存在重复 ID')
    if (whitelist.some((modelId) => modelId.includes('*'))) throw new Error('模型白名单只允许填写准确的模型 ID')

    const mapping: Record<string, string> = {}
    for (const row of modelRows.value) {
      const source = row.source.trim()
      if (!source) continue
      if (mapping[source]) throw new Error(`模型 ${source} 重复`)
      const target = row.target.trim()
      if (!target) throw new Error(`模型 ${source} 缺少上游模型`)
      mapping[source] = target
    }
    settings.value.importDefaults.modelWhitelist = whitelist
    settings.value.importDefaults.modelMapping = mapping

    const result = await api.saveSettings(settings.value)
    settings.value = result.value
    version.value = result.version
    whitelistRows.value = [...result.value.importDefaults.modelWhitelist]
    modelRows.value = Object.entries(result.value.importDefaults.modelMapping).map(([source, target]) => ({
      source,
      target
    }))
    savedSnapshot.value = serializeState()
    showToast('工作台设置已保存', 'success')
  } catch (cause) {
    showToast(cause instanceof Error ? cause.message : '保存失败', 'error')
  } finally {
    saving.value = false
  }
}

async function testConnection() {
  testing.value = true
  try {
    const result = await api.testSub2api()
    showToast(`Sub2API 连接成功，当前 OpenAI 账号总数 ${result.accountCount}`, 'success')
  } catch (cause) {
    showToast(cause instanceof Error ? cause.message : 'Sub2API 连接失败', 'error')
  } finally {
    testing.value = false
  }
}

onMounted(load)
</script>

<template>
  <ModalDialog
    :open="open"
    :title="mode === 'rotate_totp' ? '更换 2FA 并导入 Sub2API' : '自动授权配置'"
    :subtitle="account?.email || ''"
    width="max-w-4xl"
    @update:open="emit('update:open', $event)"
  >
    <form id="account-auth-form" class="space-y-5" @submit.prevent="submit">
      <div
        v-if="mode === 'rotate_totp'"
        class="rounded-control border border-line-subtle bg-subtle/60 px-4 py-3 text-xs leading-5 text-ink-secondary"
      >
        确认后将更换并保存新 2FA 密钥。仅有当前登录设备时直接按此配置授权并导入 Sub2API；存在多个设备或无法确认设备数量时，先退出所有设备并重新登录，再授权导入。
      </div>

      <div>
        <label class="field-label" for="sub2apiAccountName">Sub2API 账号名称</label>
        <input
          id="sub2apiAccountName"
          v-model="sub2apiName"
          class="field-input"
          maxlength="200"
          required
        />
      </div>

      <!-- Profile Switcher -->
      <fieldset class="space-y-2.5">
        <legend class="field-label">账号导入配置策略</legend>
        <div class="grid gap-3 sm:grid-cols-2">
          <label
            class="flex cursor-pointer items-start gap-3 rounded-card border p-3.5 transition-colors"
            :class="
              useGlobal
                ? 'border-accent bg-accent-soft/60'
                : 'border-line-subtle bg-surface hover:bg-subtle/60'
            "
          >
            <input v-model="useGlobal" class="mt-0.5" type="radio" name="accountImportProfile" :value="true" />
            <span>
              <span class="block text-sm font-medium text-ink-primary">使用全局配置</span>
              <span class="mt-0.5 block text-xs leading-5 text-ink-muted">跟随设置页中的导入模板、模型白名单与映射</span>
            </span>
          </label>

          <label
            class="flex cursor-pointer items-start gap-3 rounded-card border p-3.5 transition-colors"
            :class="
              !useGlobal
                ? 'border-accent bg-accent-soft/60'
                : 'border-line-subtle bg-surface hover:bg-subtle/60'
            "
          >
            <input v-model="useGlobal" class="mt-0.5" type="radio" name="accountImportProfile" :value="false" />
            <span>
              <span class="block text-sm font-medium text-ink-primary">使用账号专属配置</span>
              <span class="mt-0.5 block text-xs leading-5 text-ink-muted">保存到该账号，后续自动重授权持续复用</span>
            </span>
          </label>
        </div>
      </fieldset>

      <!-- Account-Specific Overrides -->
      <div v-if="!useGlobal" class="space-y-4">
        <section class="overflow-hidden rounded-card border border-line-subtle bg-surface">
          <header class="border-b border-line-subtle bg-subtle/50 px-4 py-3">
            <h3 class="text-xs font-semibold uppercase tracking-wider text-ink-secondary">Sub2API 导入模板</h3>
          </header>
          <div class="space-y-4 p-4">
            <div class="grid gap-4 sm:grid-cols-3">
              <NumberField v-model="overrides.concurrency" label="并发数量" :min="0" :max="1000" />
              <NumberField v-model="overrides.priority" label="优先级" :min="0" :max="100000" />
              <NullableNumberField v-model="overrides.loadFactor" label="负载系数" :min="1" :max="10000" />
            </div>

            <label class="flex cursor-pointer items-center gap-2.5 text-sm text-ink-primary">
              <input v-model="overrides.autoPauseOnExpired" type="checkbox" />
              <span>账号过期后自动暂停调度</span>
            </label>

            <div class="grid gap-5 lg:grid-cols-2">
              <fieldset>
                <legend class="field-label">OpenAI 分组</legend>
                <div class="max-h-36 space-y-1 overflow-auto rounded-control border border-line-subtle bg-canvas/50 p-2">
                  <label
                    v-for="group in groups"
                    :key="group.id"
                    class="flex min-h-8 cursor-pointer items-center gap-2 rounded-md px-2 text-xs text-ink-primary hover:bg-subtle"
                  >
                    <input v-model="overrides.groupIds" type="checkbox" :value="group.id" />
                    <span class="truncate">{{ group.name }}</span>
                    <span class="ml-auto font-mono text-[11px] text-ink-muted">ID {{ group.id }}</span>
                  </label>
                  <div v-if="!groups.length" class="px-2 py-3 text-center text-xs text-ink-muted">没有可用分组</div>
                </div>
              </fieldset>

              <fieldset>
                <legend class="field-label">代理分配</legend>
                <div class="grid grid-cols-3 rounded-control border border-line-subtle bg-subtle p-0.5 text-xs">
                  <button
                    v-for="policy in proxyPolicies"
                    :key="policy.value"
                    type="button"
                    class="h-8 rounded-[7px] font-medium transition-all"
                    :class="
                      overrides.proxyPolicy === policy.value
                        ? 'bg-surface text-ink-primary shadow-sm'
                        : 'text-ink-muted hover:text-ink-primary'
                    "
                    @click="overrides.proxyPolicy = policy.value"
                  >
                    {{ policy.label }}
                  </button>
                </div>
                <select
                  v-if="overrides.proxyPolicy === 'fixed'"
                  v-model.number="overrides.fixedProxyId"
                  class="field-select mt-3"
                  aria-label="固定代理"
                >
                  <option :value="null">选择代理</option>
                  <option v-for="proxy in proxies" :key="proxy.id" :value="proxy.id">
                    {{ proxy.name }} · {{ proxy.account_count || 0 }} 个账号
                  </option>
                </select>
                <p
                  v-else-if="overrides.proxyPolicy === 'auto'"
                  class="mt-3 rounded-control bg-subtle/60 px-3 py-2 text-xs leading-5 text-ink-muted"
                >
                  按账号数最少、延迟最低自动选择；无可用代理时直连。
                </p>
              </fieldset>
            </div>
          </div>
        </section>

        <section class="rounded-card border border-line-subtle bg-surface p-4">
          <label class="field-label" for="accountModelWhitelist">模型白名单</label>
          <textarea
            id="accountModelWhitelist"
            v-model="modelWhitelistText"
            class="field-textarea min-h-[112px] font-mono text-xs"
            spellcheck="false"
            placeholder="每行一个准确的模型 ID，例如：&#10;gpt-5.6-luna&#10;gpt-5.6-sol"
          ></textarea>
          <p class="mt-2 text-xs text-ink-muted">仅对该账号生效，每行一个准确的模型 ID，不支持通配符。</p>
        </section>

        <section class="rounded-card border border-line-subtle bg-surface p-4" aria-labelledby="accountModelMappingTitle">
          <div class="mb-3 flex items-center justify-between gap-3">
            <h3 id="accountModelMappingTitle" class="text-xs font-semibold uppercase tracking-wider text-ink-secondary">
              模型映射
            </h3>
            <button type="button" class="btn btn-sm" @click="modelRows.push({ source: '', target: '' })">
              <Plus :size="14" />添加映射
            </button>
          </div>
          <div
            v-for="(row, index) in modelRows"
            :key="index"
            class="mb-2.5 grid grid-cols-[minmax(0,1fr)_36px] gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_36px]"
          >
            <input v-model="row.source" class="field-input font-mono text-xs" placeholder="客户端模型 ID" spellcheck="false" />
            <input
              v-model="row.target"
              class="field-input col-start-1 row-start-2 font-mono text-xs sm:col-start-auto sm:row-start-auto"
              placeholder="上游模型 ID"
              spellcheck="false"
            />
            <button
              type="button"
              class="icon-btn icon-btn-danger col-start-2 row-start-1 h-10 w-9 sm:col-start-auto sm:row-start-auto"
              title="删除模型映射"
              :aria-label="`删除第 ${index + 1} 条模型映射`"
              @click="modelRows.splice(index, 1)"
            >
              <Trash2 :size="15" />
            </button>
          </div>
          <p v-if="!modelRows.length" class="py-3 text-center text-xs text-ink-muted">未设置模型映射</p>
          <p class="mt-2 text-xs text-ink-muted">留空表示不添加额外映射；同名映射优先于白名单，后续重授权持续复用。</p>
        </section>
      </div>

      <div
        v-if="authError"
        class="rounded-control border px-3.5 py-2.5 text-xs leading-5"
        style="border-color: var(--status-danger-bg); background-color: var(--status-danger-bg); color: var(--status-danger)"
        role="alert"
      >
        {{ authError }}
      </div>
    </form>

    <template #footer>
      <div class="flex items-center justify-end gap-2.5">
        <button type="button" class="btn" :disabled="submitting" @click="emit('update:open', false)">取消</button>
        <button
          type="submit"
          form="account-auth-form"
          class="btn btn-primary"
          :disabled="!sub2apiName.trim() || submitting"
        >
          <LoaderCircle v-if="submitting" :size="16" class="animate-spin" />
          <KeyRound v-else-if="mode === 'rotate_totp'" :size="16" />
          <Bot v-else :size="16" />
          <span>{{ mode === 'rotate_totp' ? '开始更换 2FA' : '开始自动授权' }}</span>
        </button>
      </div>
    </template>
  </ModalDialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { Bot, KeyRound, LoaderCircle, Plus, Trash2 } from 'lucide-vue-next'
import type { AccountImportOverrides, ImportDefaults, ManagedAccount, ProxyPolicy } from '../../../shared/types'
import { api } from '../../api'
import ModalDialog from '../ModalDialog.vue'
import NullableNumberField from '../NullableNumberField.vue'
import NumberField from '../NumberField.vue'

const props = defineProps<{
  open: boolean
  mode: 'authorize' | 'rotate_totp'
  account: ManagedAccount | null
  defaults: ImportDefaults | null
  groups: Array<{ id: number; name: string }>
  proxies: Array<{ id: number; name: string; account_count?: number; latency_ms?: number }>
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  queued: [message: string]
}>()

const proxyPolicies: ReadonlyArray<{ value: ProxyPolicy; label: string }> = [
  { value: 'auto', label: '自动选择' },
  { value: 'direct', label: '不使用代理' },
  { value: 'fixed', label: '固定代理' }
]

const sub2apiName = ref('')
const useGlobal = ref(false)
const modelWhitelistText = ref('')
const modelRows = ref<Array<{ source: string; target: string }>>([])
const authError = ref('')
const submitting = ref(false)
const overrides = ref<AccountImportOverrides>({
  modelWhitelist: [],
  modelMapping: {},
  concurrency: 3,
  priority: 50,
  groupIds: [],
  loadFactor: null,
  autoPauseOnExpired: true,
  proxyPolicy: 'auto',
  fixedProxyId: null
})

function overridesFromDefaults(defaults: ImportDefaults): AccountImportOverrides {
  return {
    modelWhitelist: [...defaults.modelWhitelist],
    modelMapping: { ...defaults.modelMapping },
    concurrency: defaults.concurrency,
    priority: defaults.priority,
    groupIds: [...defaults.groupIds],
    loadFactor: defaults.loadFactor,
    autoPauseOnExpired: defaults.autoPauseOnExpired,
    proxyPolicy: defaults.proxyPolicy,
    fixedProxyId: defaults.fixedProxyId
  }
}

function cloneOverrides(value: AccountImportOverrides): AccountImportOverrides {
  return {
    ...value,
    modelMapping: { ...value.modelMapping },
    modelWhitelist: [...value.modelWhitelist],
    groupIds: [...value.groupIds]
  }
}

watch(
  () => [props.open, props.account, props.defaults] as const,
  ([open, account, defaults]) => {
    if (!open || !account || !defaults) return
    const selected = account.importOverrides ? cloneOverrides(account.importOverrides) : overridesFromDefaults(defaults)
    if (!selected.modelMappingConfigured && !Object.keys(selected.modelMapping).length) {
      selected.modelMapping = { ...defaults.modelMapping }
    }
    sub2apiName.value = account.sub2apiAccountName || account.email
    useGlobal.value = false
    overrides.value = selected
    modelWhitelistText.value = selected.modelWhitelist.join('\n')
    modelRows.value = Object.entries(selected.modelMapping).map(([source, target]) => ({ source, target }))
    authError.value = ''
  },
  { immediate: true }
)

function buildOverrides(): AccountImportOverrides | null {
  if (useGlobal.value) return null
  const modelWhitelist = modelWhitelistText.value
    .split(/[\r\n,]+/)
    .map((modelId) => modelId.trim())
    .filter(Boolean)
  if (new Set(modelWhitelist).size !== modelWhitelist.length) throw new Error('模型白名单中存在重复 ID')
  if (modelWhitelist.some((modelId) => modelId.includes('*'))) throw new Error('模型白名单只允许填写准确的模型 ID')

  const entries: Array<[string, string]> = []
  const sources = new Set<string>()
  for (const row of modelRows.value) {
    const source = row.source.trim()
    const target = row.target.trim()
    if (!source && !target) continue
    if (!source) throw new Error('模型映射缺少客户端模型')
    if (!target) throw new Error(`模型 ${source} 缺少上游模型`)
    if (sources.has(source)) throw new Error(`模型 ${source} 重复`)
    sources.add(source)
    entries.push([source, target])
  }
  if (overrides.value.proxyPolicy === 'fixed' && !overrides.value.fixedProxyId) {
    throw new Error('请选择固定代理')
  }
  return {
    ...overrides.value,
    modelWhitelist,
    modelMapping: Object.fromEntries(entries),
    modelMappingConfigured: true,
    groupIds: [...overrides.value.groupIds],
    fixedProxyId: overrides.value.proxyPolicy === 'fixed' ? overrides.value.fixedProxyId : null
  }
}

async function submit() {
  if (!props.account || submitting.value) return
  const rotating = props.mode === 'rotate_totp'
  submitting.value = true
  authError.value = ''
  try {
    const importOverrides = buildOverrides()
    if (rotating) {
      await api.rotateTotp(props.account.id, sub2apiName.value.trim(), importOverrides)
    } else {
      await api.autoAuthorize(props.account.id, sub2apiName.value.trim(), importOverrides)
    }
    emit('update:open', false)
    emit(
      'queued',
      rotating
        ? `2FA 更换任务已开始，${importOverrides ? '已保存账号专属配置' : '使用全局配置'}，完成后自动导入 Sub2API`
        : importOverrides
          ? '自动授权任务已开始，已保存账号专属配置'
          : '自动授权任务已开始，使用全局配置'
    )
  } catch (cause) {
    authError.value = cause instanceof Error ? cause.message : rotating ? '启动 2FA 更换失败' : '自动授权启动失败'
  } finally {
    submitting.value = false
  }
}
</script>

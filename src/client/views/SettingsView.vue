<template>
  <section>
    <div class="mb-4 flex flex-wrap items-center gap-3">
      <div><h1 class="text-xl font-semibold">设置</h1><p class="mt-0.5 text-sm text-slate-500">配置版本 {{ version }}</p></div>
      <div class="ml-auto flex w-full flex-wrap gap-2 sm:w-auto">
        <button class="button" :disabled="testing" @click="testConnection"><LoaderCircle v-if="testing" :size="17" class="animate-spin" /><PlugZap v-else :size="17" />测试 Sub2API</button>
        <button class="button button-primary" :disabled="saving || !settings" @click="save"><LoaderCircle v-if="saving" :size="17" class="animate-spin" /><Save v-else :size="17" />保存</button>
      </div>
    </div>
    <div v-if="message" class="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{{ message }}</div>
    <div v-if="error" class="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{{ error }}</div>

    <div v-if="!settings" class="panel flex h-48 items-center justify-center"><LoaderCircle :size="22" class="animate-spin text-slate-500" /></div>
    <div v-else class="space-y-5">
      <section class="panel">
        <header class="panel-header"><Clock3 :size="18" class="mr-2 text-slate-500" /><h2 class="font-semibold">检测与刷新</h2></header>
        <div class="max-w-md p-4">
          <NumberField v-model="settings.scheduler.checkIntervalMinutes" label="主动检测间隔" suffix="分钟" :min="1" :max="1440" />
        </div>
      </section>

      <section class="panel">
        <header class="panel-header"><SlidersHorizontal :size="18" class="mr-2 text-slate-500" /><h2 class="font-semibold">Sub2API 导入模板</h2></header>
        <div class="grid gap-6 p-4 xl:grid-cols-2">
          <div class="space-y-4">
            <div class="grid gap-4 sm:grid-cols-2">
              <NumberField v-model="settings.importDefaults.concurrency" label="并发数量" :min="0" :max="1000" />
              <NumberField v-model="settings.importDefaults.priority" label="优先级" :min="0" :max="100000" />
              <NullableNumberField v-model="settings.importDefaults.loadFactor" label="负载系数" :min="1" :max="10000" />
            </div>
            <label class="flex h-10 items-center gap-3 text-sm"><input v-model="settings.importDefaults.autoPauseOnExpired" type="checkbox" class="h-4 w-4 accent-emerald-700" />账号过期后自动暂停</label>
          </div>

          <div class="space-y-4">
            <fieldset>
              <legend class="label">OpenAI 分组</legend>
              <div class="max-h-36 overflow-auto rounded-md border border-slate-200 p-2">
                <label v-for="group in groups" :key="group.id" class="flex min-h-9 items-center gap-2 rounded px-2 text-sm hover:bg-slate-50">
                  <input v-model="settings.importDefaults.groupIds" type="checkbox" :value="group.id" class="h-4 w-4 accent-emerald-700" />
                  <span>{{ group.name }}</span><span class="ml-auto text-xs text-slate-400">ID {{ group.id }}</span>
                </label>
                <div v-if="!groups.length" class="px-2 py-3 text-sm text-slate-500">没有可用分组</div>
              </div>
            </fieldset>
            <fieldset>
              <legend class="label">代理分配</legend>
              <div class="flex flex-wrap gap-4 text-sm">
                <label class="flex items-center gap-2"><input v-model="settings.importDefaults.proxyPolicy" type="radio" value="auto" />自动选择</label>
                <label class="flex items-center gap-2"><input v-model="settings.importDefaults.proxyPolicy" type="radio" value="direct" />不使用代理</label>
                <label class="flex items-center gap-2"><input v-model="settings.importDefaults.proxyPolicy" type="radio" value="fixed" />固定代理</label>
              </div>
              <select v-if="settings.importDefaults.proxyPolicy === 'fixed'" v-model.number="settings.importDefaults.fixedProxyId" class="input mt-3">
                <option :value="null">选择代理</option>
                <option v-for="proxy in proxies" :key="proxy.id" :value="proxy.id">{{ proxy.name }} · {{ proxy.account_count || 0 }} 个账号 · {{ proxy.latency_ms ? `${proxy.latency_ms} ms` : '未测速' }}</option>
              </select>
              <div v-else-if="settings.importDefaults.proxyPolicy === 'auto'" class="mt-3 rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-600">
                当前可用 {{ proxies.length }} 个；按账号数最少、延迟最低选择，列表为空时不使用代理。
              </div>
            </fieldset>
          </div>
        </div>
      </section>

      <section class="panel">
        <header class="panel-header"><ShieldCheck :size="18" class="mr-2 text-slate-500" /><h2 class="font-semibold">模型白名单</h2><button class="button ml-auto" @click="addWhitelistRow"><Plus :size="16" />添加</button></header>
        <div class="p-4">
          <div class="mb-2 grid grid-cols-[minmax(0,1fr)_44px] gap-3 text-xs font-medium text-slate-500"><span>模型 ID</span><span></span></div>
          <div v-for="(_, index) in whitelistRows" :key="index" class="mb-2 grid grid-cols-[minmax(0,1fr)_44px] gap-3">
            <input v-model="whitelistRows[index]" class="input font-mono" placeholder="gpt-5.4" aria-label="模型 ID" />
            <button class="icon-button text-red-600" title="删除模型" aria-label="删除模型" @click="whitelistRows.splice(index, 1)"><Trash2 :size="16" /></button>
          </div>
          <div v-if="!whitelistRows.length" class="py-4 text-center text-sm text-slate-500">未设置模型白名单</div>
        </div>
      </section>

      <section class="panel">
        <header class="panel-header"><Waypoints :size="18" class="mr-2 text-slate-500" /><h2 class="font-semibold">模型映射</h2><button class="button ml-auto" @click="addModelRow"><Plus :size="16" />添加</button></header>
        <div class="p-4">
          <div class="mb-2 hidden grid-cols-[minmax(0,1fr)_minmax(0,1fr)_44px] gap-3 text-xs font-medium text-slate-500 sm:grid"><span>客户端模型</span><span>上游模型</span><span></span></div>
          <div v-for="(row, index) in modelRows" :key="index" class="mb-3 grid grid-cols-[minmax(0,1fr)_44px] gap-2 sm:mb-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_44px] sm:gap-3">
            <input v-model="row.source" class="input min-w-0 font-mono" placeholder="客户端模型" aria-label="客户端模型" />
            <input v-model="row.target" class="input col-start-1 row-start-2 min-w-0 font-mono sm:col-start-auto sm:row-start-auto" placeholder="上游模型" aria-label="上游模型" />
            <button class="icon-button col-start-2 row-start-1 text-red-600 sm:col-start-auto sm:row-start-auto" title="删除模型" aria-label="删除模型" @click="modelRows.splice(index, 1)"><Trash2 :size="16" /></button>
          </div>
          <div v-if="!modelRows.length" class="py-4 text-center text-sm text-slate-500">未设置模型映射</div>
        </div>
      </section>
    </div>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { Clock3, LoaderCircle, PlugZap, Plus, Save, ShieldCheck, SlidersHorizontal, Trash2, Waypoints } from 'lucide-vue-next'
import type { RuntimeSettings } from '../../shared/types'
import { api } from '../api'
import NumberField from '../components/NumberField.vue'
import NullableNumberField from '../components/NullableNumberField.vue'

const settings = ref<RuntimeSettings | null>(null)
const version = ref(0)
const groups = ref<Array<{ id: number; name: string }>>([])
const proxies = ref<Array<{ id: number; name: string; account_count?: number; latency_ms?: number }>>([])
const whitelistRows = ref<string[]>([])
const modelRows = ref<Array<{ source: string; target: string }>>([])
const saving = ref(false)
const testing = ref(false)
const message = ref('')
const error = ref('')

function setResult(text: string, isError = false) { error.value = isError ? text : ''; message.value = isError ? '' : text }
function addWhitelistRow() { whitelistRows.value.push('') }
function addModelRow() { modelRows.value.push({ source: '', target: '' }) }

async function load() {
  try {
    const [configuration, groupResponse, proxyResponse] = await Promise.all([api.getSettings(), api.listGroups(), api.listProxies()])
    settings.value = configuration.value
    version.value = configuration.version
    groups.value = groupResponse.items
    proxies.value = proxyResponse.items
    whitelistRows.value = [...configuration.value.importDefaults.modelWhitelist]
    modelRows.value = Object.entries(configuration.value.importDefaults.modelMapping).map(([source, target]) => ({ source, target }))
  } catch (cause) { setResult(cause instanceof Error ? cause.message : '设置加载失败', true) }
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
    setResult('设置已保存')
  } catch (cause) { setResult(cause instanceof Error ? cause.message : '保存失败', true) } finally { saving.value = false }
}

async function testConnection() {
  testing.value = true
  try { const result = await api.testSub2api(); setResult(`连接成功，OpenAI 账号总数 ${result.accountCount}`) }
  catch (cause) { setResult(cause instanceof Error ? cause.message : '连接失败', true) }
  finally { testing.value = false }
}

onMounted(load)
</script>

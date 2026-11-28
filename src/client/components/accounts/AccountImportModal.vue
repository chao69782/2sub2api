<template>
  <ModalDialog
    :open="open"
    title="批量添加账号"
    subtitle="粘贴账号凭据，导入时自动校验格式并跳过重复邮箱"
    width="max-w-5xl"
    @update:open="emit('update:open', $event)"
  >
    <div class="grid gap-5 lg:grid-cols-[1.15fr_1fr]">
      <!-- Left Editor -->
      <div class="min-w-0">
        <div class="mb-2 flex items-center justify-between gap-2">
          <label class="field-label mb-0" for="credentialText">账号数据</label>
          <span class="font-mono text-[11px] text-ink-muted">
            {{ nonEmptyLineCount }} 行 · 邮箱--密码--2FA密钥
          </span>
        </div>
        <textarea
          id="credentialText"
          v-model="credentialText"
          class="field-textarea min-h-[260px] resize-y font-mono text-xs leading-6"
          spellcheck="false"
          placeholder="user@example.com--YourPassword--JBSWY3DPEHPK3PXP"
          :disabled="importing"
          @input="handleInput"
        ></textarea>
        <p class="mt-2 text-xs leading-5 text-ink-muted">
          每行一个账号，两个分隔符均支持连续 2 个及以上半角 <code class="rounded bg-subtle px-1 py-0.5 font-mono">-</code>。
        </p>
      </div>

      <!-- Right Preview Table -->
      <div class="min-w-0">
        <div class="mb-2 flex items-center justify-between gap-2">
          <span class="field-label mb-0">校验结果</span>
          <span class="font-mono text-[11px] text-ink-muted">有效 {{ validCount }} / {{ previewRows.length }}</span>
        </div>
        <div
          class="min-h-[260px] max-h-[380px] overflow-auto rounded-control border border-line-subtle bg-surface"
          aria-live="polite"
          :aria-busy="importing"
        >
          <table v-if="previewRows.length" class="w-full text-left text-xs">
            <thead class="sticky top-0 border-b border-line-subtle bg-subtle/90 text-ink-muted backdrop-blur-sm">
              <tr>
                <th class="w-12 px-3 py-2.5 font-medium">行</th>
                <th class="px-3 py-2.5 font-medium">邮箱 / 详情</th>
                <th class="w-20 px-3 py-2.5 text-right font-medium">状态</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-line-subtle">
              <tr v-for="row in previewRows" :key="String(row.line)">
                <td class="px-3 py-2.5 font-mono text-ink-muted">{{ row.line }}</td>
                <td class="max-w-[200px] break-words px-3 py-2.5 text-ink-primary" :title="String(row.message)">
                  {{ row.email || row.message }}
                </td>
                <td class="px-3 py-2.5 text-right">
                  <StatusBadge :value="String(row.status)" />
                </td>
              </tr>
            </tbody>
          </table>
          <div
            v-else
            class="flex min-h-[258px] flex-col items-center justify-center gap-2.5 p-6 text-center text-ink-muted"
          >
            <div class="flex h-10 w-10 items-center justify-center rounded-full bg-subtle">
              <LoaderCircle v-if="importing" :size="18" class="animate-spin text-accent" />
              <ScanSearch v-else :size="18" />
            </div>
            <p class="text-xs leading-5">{{ importing ? '正在校验账号格式并导入…' : '点击“开始导入”后自动校验并显示每行结果' }}</p>
          </div>
        </div>
      </div>
    </div>

    <div
      v-if="importError"
      class="mt-4 rounded-control border px-3.5 py-2.5 text-xs leading-5"
      style="border-color: var(--status-danger-bg); background-color: var(--status-danger-bg); color: var(--status-danger)"
      role="alert"
    >
      {{ importError }}
    </div>

    <template #footer>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <p class="text-xs text-ink-muted">有效账号将直接加密入库，无效或重复行自动跳过</p>
        <div class="flex items-center gap-2">
          <button type="button" class="btn" :disabled="importing" @click="emit('update:open', false)">取消</button>
          <button
            type="button"
            class="btn btn-primary"
            :disabled="!credentialText.trim() || importing"
            :aria-busy="importing"
            @click="submitImport"
          >
            <LoaderCircle v-if="importing" :size="16" class="animate-spin" />
            <Upload v-else :size="16" />
            <span>{{ importing ? '导入中…' : '开始导入' }}</span>
          </button>
        </div>
      </div>
    </template>
  </ModalDialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { LoaderCircle, ScanSearch, Upload } from 'lucide-vue-next'
import { api } from '../../api'
import ModalDialog from '../ModalDialog.vue'
import StatusBadge from '../StatusBadge.vue'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{
  'update:open': [value: boolean]
  imported: [summary: string]
}>()

const credentialText = ref('')
const previewRows = ref<Array<Record<string, unknown>>>([])
const importing = ref(false)
const importError = ref('')

const validCount = computed(() => previewRows.value.filter((row) => row.status === 'valid').length)
const nonEmptyLineCount = computed(
  () => credentialText.value.split(/\r?\n/).filter((line) => line.trim().length > 0).length
)

watch(
  () => props.open,
  (open) => {
    if (open) {
      credentialText.value = ''
      previewRows.value = []
      importError.value = ''
    }
  }
)

function handleInput() {
  previewRows.value = []
  importError.value = ''
}

async function submitImport() {
  if (importing.value || !credentialText.value.trim()) return
  const text = credentialText.value
  importing.value = true
  importError.value = ''
  previewRows.value = []
  try {
    const preview = await api.previewImport(text)
    previewRows.value = preview.rows
    if (!preview.validCount) {
      importError.value = '没有可导入的账号，请检查格式或重复邮箱'
      return
    }
    const result = await api.importAccounts(text)
    emit('update:open', false)
    emit(
      'imported',
      `已导入 ${result.created.length} 个账号${result.errors.length ? `，${result.errors.length} 行未导入` : ''}`
    )
  } catch (cause) {
    importError.value = cause instanceof Error ? cause.message : '导入失败'
  } finally {
    importing.value = false
  }
}
</script>

<template>
  <ModalDialog
    :open="open"
    title="账号安全凭据"
    subtitle="本地解密展示 · 请注意屏幕与剪贴板安全"
    width="max-w-lg"
    @update:open="emit('update:open', $event)"
  >
    <div v-if="credentials" class="space-y-4">
      <!-- Email -->
      <div>
        <label class="field-label" for="cred-email">登录邮箱</label>
        <div class="flex items-center gap-2">
          <input id="cred-email" class="field-input font-mono text-xs" :value="credentials.email" readonly />
          <button
            type="button"
            class="btn h-10 shrink-0 px-3"
            :title="copiedKey === 'email' ? '已复制' : '复制邮箱'"
            @click="copyValue('email', credentials.email)"
          >
            <Check v-if="copiedKey === 'email'" :size="15" style="color: var(--status-ok)" />
            <Copy v-else :size="15" />
            <span class="text-xs">{{ copiedKey === 'email' ? '已复制' : '复制' }}</span>
          </button>
        </div>
      </div>

      <!-- Password -->
      <div>
        <label class="field-label" for="cred-password">账号密码</label>
        <div class="flex items-center gap-2">
          <div class="relative min-w-0 flex-1">
            <input
              id="cred-password"
              class="field-input pr-10 font-mono text-xs"
              :type="showPassword ? 'text' : 'password'"
              :value="credentials.password"
              readonly
              autocomplete="off"
            />
            <button
              type="button"
              class="icon-btn absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2"
              :title="showPassword ? '隐藏密码' : '显示密码'"
              :aria-label="showPassword ? '隐藏密码' : '显示密码'"
              @click="showPassword = !showPassword"
            >
              <EyeOff v-if="showPassword" :size="15" />
              <Eye v-else :size="15" />
            </button>
          </div>
          <button
            type="button"
            class="btn h-10 shrink-0 px-3"
            :title="copiedKey === 'password' ? '已复制' : '复制密码'"
            @click="copyValue('password', credentials.password)"
          >
            <Check v-if="copiedKey === 'password'" :size="15" style="color: var(--status-ok)" />
            <Copy v-else :size="15" />
            <span class="text-xs">{{ copiedKey === 'password' ? '已复制' : '复制' }}</span>
          </button>
        </div>
      </div>

      <!-- 2FA Secret -->
      <div>
        <label class="field-label" for="cred-totp">2FA 验证器密钥</label>
        <div class="flex items-center gap-2">
          <div class="relative min-w-0 flex-1">
            <input
              id="cred-totp"
              class="field-input pr-10 font-mono text-xs"
              :type="showTotp ? 'text' : 'password'"
              :value="credentials.totpSecret"
              readonly
              autocomplete="off"
            />
            <button
              type="button"
              class="icon-btn absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2"
              :title="showTotp ? '隐藏 2FA 密钥' : '显示 2FA 密钥'"
              :aria-label="showTotp ? '隐藏 2FA 密钥' : '显示 2FA 密钥'"
              @click="showTotp = !showTotp"
            >
              <EyeOff v-if="showTotp" :size="15" />
              <Eye v-else :size="15" />
            </button>
          </div>
          <button
            type="button"
            class="btn h-10 shrink-0 px-3"
            :title="copiedKey === 'totp' ? '已复制' : '复制 2FA 密钥'"
            @click="copyValue('totp', credentials.totpSecret)"
          >
            <Check v-if="copiedKey === 'totp'" :size="15" style="color: var(--status-ok)" />
            <Copy v-else :size="15" />
            <span class="text-xs">{{ copiedKey === 'totp' ? '已复制' : '复制' }}</span>
          </button>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="flex justify-end">
        <button type="button" class="btn" @click="emit('update:open', false)">关闭</button>
      </div>
    </template>
  </ModalDialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { Check, Copy, Eye, EyeOff } from 'lucide-vue-next'
import { showToast } from '../../composables/useToast'
import ModalDialog from '../ModalDialog.vue'

export interface CredentialPayload {
  email: string
  password: string
  totpSecret: string
}

const props = defineProps<{
  open: boolean
  credentials: CredentialPayload | null
}>()

const emit = defineEmits<{ 'update:open': [value: boolean] }>()

const showPassword = ref(false)
const showTotp = ref(false)
const copiedKey = ref<string | null>(null)
let copyTimer: number | undefined

watch(
  () => props.open,
  (open) => {
    if (!open) {
      showPassword.value = false
      showTotp.value = false
      copiedKey.value = null
      window.clearTimeout(copyTimer)
    }
  }
)

async function copyValue(key: string, value: string) {
  try {
    await navigator.clipboard.writeText(value)
    copiedKey.value = key
    window.clearTimeout(copyTimer)
    copyTimer = window.setTimeout(() => {
      copiedKey.value = null
    }, 1800)
  } catch {
    showToast('无法访问剪贴板，请手动选中复制', 'error')
  }
}
</script>

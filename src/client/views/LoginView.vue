<template>
  <main class="ambient-grid relative flex min-h-screen flex-col bg-canvas text-ink-primary">
    <!-- Subtle Ambient Glow -->
    <div
      class="pointer-events-none fixed inset-0 overflow-hidden"
      aria-hidden="true"
    >
      <div
        class="absolute -left-24 -top-24 h-[420px] w-[420px] rounded-full opacity-20 blur-3xl"
        style="background: radial-gradient(circle, var(--accent) 0%, transparent 70%)"
      ></div>
      <div
        class="absolute -bottom-32 right-0 h-[360px] w-[360px] rounded-full opacity-15 blur-3xl"
        style="background: radial-gradient(circle, var(--status-info) 0%, transparent 70%)"
      ></div>
    </div>

    <!-- Top Utility Bar -->
    <header class="relative z-10 flex items-center justify-between px-5 py-4 sm:px-8">
      <div class="flex items-center gap-2.5">
        <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-accent-ink shadow-sm">
          <ShieldCheck :size="17" :stroke-width="2" />
        </div>
        <span class="text-sm font-semibold tracking-tight text-ink-primary">OpenAI 账号授权工作台</span>
      </div>
      <ThemeToggle />
    </header>

    <!-- Main Split Stage -->
    <div class="relative z-10 mx-auto flex w-full max-w-5xl flex-1 items-center justify-center px-4 py-8 sm:px-8">
      <div class="grid w-full items-center gap-10 lg:grid-cols-[1.15fr_400px] lg:gap-14">
        <!-- Left Narrative Panel (Desktop) -->
        <section class="hidden space-y-8 lg:block" aria-label="工作台能力概览">
          <div class="space-y-3">
            <span class="pill-badge" style="background-color: var(--accent-soft); color: var(--accent)">
              <span class="h-1.5 w-1.5 rounded-full bg-current"></span>
              Sub2API 协同运维中心
            </span>
            <h1 class="text-3xl font-semibold leading-tight tracking-tight text-ink-primary">
              集中管控凭据、<br />自动化 OAuth 授权与健康调度
            </h1>
            <p class="max-w-md text-sm leading-6 text-ink-secondary">
              面向管理员的一体化授权与凭据工作台，支持批量账号导入、六步 2FA 密钥轮换、用量窗口监控与托管重授权。
            </p>
          </div>

          <ul class="space-y-4">
            <li
              v-for="feature in features"
              :key="feature.title"
              class="flex items-start gap-3.5 rounded-card border border-line-subtle bg-surface/75 p-4 backdrop-blur-sm"
            >
              <div
                class="flex h-9 w-9 shrink-0 items-center justify-center rounded-control"
                style="background-color: var(--accent-soft); color: var(--accent)"
              >
                <component :is="feature.icon" :size="18" aria-hidden="true" />
              </div>
              <div class="min-w-0">
                <div class="text-sm font-medium text-ink-primary">{{ feature.title }}</div>
                <p class="mt-0.5 text-xs leading-5 text-ink-muted">{{ feature.description }}</p>
              </div>
            </li>
          </ul>
        </section>

        <!-- Right Login Form Card -->
        <form
          class="surface-card mx-auto w-full max-w-md p-7 sm:p-8 lg:mx-0"
          @submit.prevent="submit"
        >
          <div class="mb-7">
            <h2 class="text-xl font-semibold tracking-tight text-ink-primary">管理员登录</h2>
            <p class="mt-1.5 text-xs leading-5 text-ink-muted">请输入工作台管理员凭据以继续访问</p>
          </div>

          <div class="space-y-4">
            <div>
              <label class="field-label" for="username">管理员账号</label>
              <input
                id="username"
                v-model="username"
                class="field-input"
                autocomplete="username"
                placeholder="例如 admin"
                required
                autofocus
              />
            </div>

            <div>
              <label class="field-label" for="password">登录密码</label>
              <div class="relative">
                <input
                  id="password"
                  v-model="password"
                  class="field-input pr-10"
                  :type="showPassword ? 'text' : 'password'"
                  autocomplete="current-password"
                  placeholder="请输入密码"
                  required
                />
                <button
                  type="button"
                  class="icon-btn absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2 text-ink-muted"
                  :title="showPassword ? '隐藏密码' : '显示密码'"
                  :aria-label="showPassword ? '隐藏密码' : '显示密码'"
                  @click="showPassword = !showPassword"
                >
                  <EyeOff v-if="showPassword" :size="16" />
                  <Eye v-else :size="16" />
                </button>
              </div>
            </div>
          </div>

          <div
            v-if="error"
            class="mt-4 rounded-control border px-3.5 py-2.5 text-xs leading-5"
            style="border-color: var(--status-danger-bg); background-color: var(--status-danger-bg); color: var(--status-danger)"
            role="alert"
          >
            {{ error }}
          </div>

          <button
            class="btn btn-primary mt-6 h-11 w-full text-sm font-medium"
            :disabled="loading"
            :aria-busy="loading"
          >
            <LoaderCircle v-if="loading" :size="17" class="animate-spin" />
            <LogIn v-else :size="17" />
            <span>{{ loading ? '正在验证…' : '登录工作台' }}</span>
          </button>
        </form>
      </div>
    </div>

    <footer class="relative z-10 px-6 py-4 text-center text-xs text-ink-muted">
      本地加密存储 · AES-256-GCM 凭据保护
    </footer>
  </main>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Activity, Eye, EyeOff, KeyRound, LoaderCircle, Lock, LogIn, ShieldCheck } from 'lucide-vue-next'
import ThemeToggle from '../components/ThemeToggle.vue'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const username = ref('')
const password = ref('')
const showPassword = ref(false)
const loading = ref(false)
const error = ref('')

const features = [
  {
    icon: Lock,
    title: 'AES-256-GCM 凭据加密',
    description: '账号密码与 2FA 密钥均在本地主密钥保护下加密存储，支持安全导出与审计。'
  },
  {
    icon: KeyRound,
    title: '六步 2FA 轮换与托管重授权',
    description: '自动检测设备、按需登出并无缝导入 Sub2API，完整追踪每个任务执行节点。'
  },
  {
    icon: Activity,
    title: '用量窗口与可用时长预测',
    description: '实时聚合 5 小时与 7 天消耗速率，精准预估剩余可用时间与调度状态。'
  }
]

async function submit() {
  loading.value = true
  error.value = ''
  try {
    await auth.login(username.value, password.value)
    await router.push(typeof route.query.redirect === 'string' ? route.query.redirect : '/accounts')
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '登录失败'
  } finally {
    loading.value = false
  }
}
</script>

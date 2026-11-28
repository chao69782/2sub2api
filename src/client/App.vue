<template>
  <ToastHost />

  <!-- Session Restore Stage -->
  <main
    v-if="!auth.ready"
    class="ambient-grid relative flex min-h-screen items-center justify-center overflow-hidden bg-canvas px-4 text-ink-primary"
  >
    <div
      class="pointer-events-none absolute -top-32 left-1/2 h-[360px] w-[540px] -translate-x-1/2 rounded-full opacity-25 blur-3xl"
      style="background: radial-gradient(circle, var(--accent) 0%, transparent 70%)"
      aria-hidden="true"
    ></div>

    <div class="surface-card relative z-10 w-full max-w-sm p-7">
      <div class="mb-6 flex items-center gap-3">
        <div class="flex h-10 w-10 items-center justify-center rounded-[11px] bg-accent text-accent-ink shadow-sm">
          <ShieldCheck :size="20" :stroke-width="2" />
        </div>
        <div>
          <h1 class="text-base font-semibold tracking-tight text-ink-primary">OpenAI 账号授权工作台</h1>
          <p class="font-mono text-[11px] text-ink-muted">正在验证管理员会话</p>
        </div>
      </div>

      <div
        v-if="auth.restoreError"
        class="rounded-control border px-3.5 py-3 text-sm leading-6"
        style="border-color: var(--status-danger-bg); background-color: var(--status-danger-bg); color: var(--status-danger)"
        role="alert"
      >
        {{ auth.restoreError }}
      </div>
      <div v-else class="flex items-center gap-2.5 text-sm text-ink-secondary" role="status">
        <LoaderCircle :size="18" class="shrink-0 text-accent motion-safe:animate-spin" aria-hidden="true" />
        <span>正在恢复登录状态…</span>
      </div>

      <button
        v-if="auth.restoreError"
        type="button"
        class="btn btn-primary mt-5 w-full"
        :disabled="auth.restoring"
        @click="retryRestore"
      >
        <RefreshCw :size="16" :class="{ 'animate-spin': auth.restoring }" aria-hidden="true" />
        重新尝试
      </button>
    </div>
  </main>

  <!-- Login Route -->
  <RouterView v-else-if="route.name === 'login'" />

  <!-- Authenticated Workbench Shell -->
  <AppShell v-else :username="auth.username" @logout="logout">
    <RouterView />
  </AppShell>
</template>

<script setup lang="ts">
import { RouterView, useRoute, useRouter } from 'vue-router'
import { LoaderCircle, RefreshCw, ShieldCheck } from 'lucide-vue-next'
import AppShell from './components/AppShell.vue'
import ToastHost from './components/ToastHost.vue'
import { initTheme } from './composables/useTheme'
import { useAuthStore } from './stores/auth'

initTheme()

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

async function retryRestore() {
  const target = auth.pendingPath || `${window.location.pathname}${window.location.search}${window.location.hash}`
  await auth.restore()
  if (!auth.ready) return
  auth.pendingPath = ''
  const destination = router.resolve(target)
  await router.replace({ path: destination.path, query: destination.query, hash: destination.hash, force: true })
}

async function logout() {
  await auth.logout()
  await router.push('/login')
}
</script>

<template>
  <main v-if="!auth.ready" class="flex min-h-screen items-center justify-center bg-slate-100 px-4 text-slate-900">
    <div class="w-full max-w-sm rounded-md border border-slate-200 bg-white p-6 shadow-sm">
      <div class="mb-6 flex items-center gap-3">
        <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-emerald-700 font-semibold text-white">OA</div>
        <h1 class="text-lg font-semibold">账号授权工作台</h1>
      </div>
      <p v-if="auth.restoreError" class="text-sm leading-6 text-slate-700" role="alert">{{ auth.restoreError }}</p>
      <div v-else class="flex items-center gap-2 text-sm text-slate-600" role="status">
        <LoaderCircle :size="18" class="shrink-0 motion-safe:animate-spin" aria-hidden="true" />
        <span>正在恢复登录状态…</span>
      </div>
      <button v-if="auth.restoreError" type="button" class="button button-primary mt-5 w-full" :disabled="auth.restoring" @click="retryRestore">
        <RefreshCw :size="17" aria-hidden="true" />重新尝试
      </button>
    </div>
  </main>
  <RouterView v-else-if="route.name === 'login'" />
  <div v-else class="min-h-screen bg-slate-50 text-slate-900">
    <header class="border-b border-slate-200 bg-white">
      <div class="mx-auto flex h-14 max-w-[1600px] items-center px-4 lg:px-6">
        <div class="flex shrink-0 items-center gap-3 font-semibold">
          <div class="flex h-8 w-8 items-center justify-center rounded-md bg-emerald-600 text-white">OA</div>
          <span class="hidden md:inline">账号授权工作台</span>
        </div>
        <nav class="ml-2 flex h-full items-center gap-1 sm:ml-6 lg:ml-10" aria-label="主导航">
          <RouterLink to="/accounts" class="nav-link"><Users :size="17" />账号</RouterLink>
          <RouterLink to="/settings" class="nav-link"><Settings :size="17" />设置</RouterLink>
        </nav>
        <div class="ml-auto flex items-center gap-3 text-sm text-slate-600">
          <span class="hidden sm:inline">{{ auth.username }}</span>
          <button class="icon-button" title="退出登录" aria-label="退出登录" @click="logout"><LogOut :size="18" /></button>
        </div>
      </div>
    </header>
    <main class="mx-auto max-w-[1600px] px-4 py-5 lg:px-6"><RouterView /></main>
  </div>
</template>

<script setup lang="ts">
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { LoaderCircle, LogOut, RefreshCw, Settings, Users } from 'lucide-vue-next'
import { useAuthStore } from './stores/auth'

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
async function logout() { await auth.logout(); await router.push('/login') }
</script>

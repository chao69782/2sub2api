<template>
  <RouterView v-if="route.name === 'login'" />
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
import { LogOut, Settings, Users } from 'lucide-vue-next'
import { useAuthStore } from './stores/auth'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
async function logout() { await auth.logout(); await router.push('/login') }
</script>

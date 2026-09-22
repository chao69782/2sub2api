<template>
  <main class="flex min-h-screen items-center justify-center bg-slate-100 px-4">
    <form class="w-full max-w-sm rounded-md border border-slate-200 bg-white p-6 shadow-sm" @submit.prevent="submit">
      <div class="mb-6 flex items-center gap-3">
        <div class="flex h-10 w-10 items-center justify-center rounded-md bg-emerald-700 font-semibold text-white">OA</div>
        <div>
          <h1 class="text-lg font-semibold">账号授权工作台</h1>
          <p class="text-sm text-slate-500">管理员登录</p>
        </div>
      </div>
      <label class="label" for="username">账号</label>
      <input id="username" v-model="username" class="input mb-4" autocomplete="username" required autofocus />
      <label class="label" for="password">密码</label>
      <input id="password" v-model="password" class="input" type="password" autocomplete="current-password" required />
      <p v-if="error" class="mt-3 text-sm text-red-600" role="alert">{{ error }}</p>
      <button class="button button-primary mt-5 w-full" :disabled="loading">
        <LoaderCircle v-if="loading" :size="17" class="animate-spin" />
        <LogIn v-else :size="17" />
        登录
      </button>
    </form>
  </main>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { LoaderCircle, LogIn } from 'lucide-vue-next'
import { useAuthStore } from '../stores/auth'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()
const username = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')

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

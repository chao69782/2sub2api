<template>
  <main class="login-page flex min-h-screen items-center justify-center px-4">
    <form class="login-card w-full max-w-sm" @submit.prevent="submit">
      <div class="brand-mark mb-6">OA</div>
      <h1>账号授权工作台</h1>
      <p class="login-description">管理员入口 · 授权与凭据管理</p>
      <label class="label" for="username">账号</label>
      <input id="username" v-model="username" class="input mb-4" autocomplete="username" required autofocus />
      <label class="label" for="password">密码</label>
      <input id="password" v-model="password" class="input" type="password" autocomplete="current-password" required />
      <p v-if="error" class="mt-3 text-sm text-red-600" role="alert">{{ error }}</p>
      <button class="button button-primary mt-6 w-full" :disabled="loading" :aria-busy="loading">
        <LoaderCircle v-if="loading" :size="18" class="animate-spin" />
        <LogIn v-else :size="18" />
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

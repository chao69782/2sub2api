import { createRouter, createWebHistory } from 'vue-router'
import LoginView from './views/LoginView.vue'
import AccountsView from './views/AccountsView.vue'
import SettingsView from './views/SettingsView.vue'
import { useAuthStore } from './stores/auth'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', name: 'login', component: LoginView },
    { path: '/', redirect: '/accounts' },
    { path: '/accounts', name: 'accounts', component: AccountsView, meta: { auth: true } },
    { path: '/settings', name: 'settings', component: SettingsView, meta: { auth: true } }
  ]
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  if (!auth.ready) await auth.restore()
  if (to.meta.auth && !auth.username) return { name: 'login', query: { redirect: to.fullPath } }
  if (to.name === 'login' && auth.username) return { name: 'accounts' }
})

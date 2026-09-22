import { defineStore } from 'pinia'
import { api } from '../api'

export const useAuthStore = defineStore('auth', {
  state: () => ({ username: '', ready: false }),
  actions: {
    async restore() {
      try {
        const response = await api.me()
        this.username = response.user.username
        api.setCsrf(response.csrfToken)
      } catch {
        this.username = ''
      } finally {
        this.ready = true
      }
    },
    async login(username: string, password: string) {
      const response = await api.login(username, password)
      this.username = response.user.username
      api.setCsrf(response.csrfToken)
    },
    async logout() {
      await api.logout()
      this.username = ''
      api.setCsrf('')
    }
  }
})

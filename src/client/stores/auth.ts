import { defineStore } from 'pinia'
import { api, ApiError } from '../api'

const pendingRestores = new WeakMap<object, Promise<void>>()

export const useAuthStore = defineStore('auth', {
  state: () => ({ username: '', ready: false, restoring: false, restoreError: '', pendingPath: '' }),
  actions: {
    restore(): Promise<void> {
      const pending = pendingRestores.get(this)
      if (pending) return pending

      this.ready = false
      this.restoring = true
      this.restoreError = ''
      const restoration = (async () => {
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const response = await api.me()
            this.username = response.user.username
            api.setCsrf(response.csrfToken)
            this.ready = true
            return
          } catch (cause) {
            if (cause instanceof ApiError && cause.status === 401) {
              this.username = ''
              api.setCsrf('')
              this.ready = true
              return
            }
            const retryable = !(cause instanceof ApiError) || cause.status >= 500
            if (!retryable || attempt === 2) {
              this.restoreError = '暂时无法恢复登录状态，请检查网络或服务状态后重试。'
              return
            }
            await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)))
          }
        }
      })().finally(() => {
        this.restoring = false
        pendingRestores.delete(this)
      })
      pendingRestores.set(this, restoration)
      return restoration
    },
    async login(username: string, password: string) {
      const response = await api.login(username, password)
      this.username = response.user.username
      api.setCsrf(response.csrfToken)
      this.ready = true
      this.restoreError = ''
      this.pendingPath = ''
    },
    async logout() {
      await api.logout()
      this.username = ''
      api.setCsrf('')
      this.ready = true
      this.restoreError = ''
      this.pendingPath = ''
    }
  }
})

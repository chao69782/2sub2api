import { ref } from 'vue'

export type ToastTone = 'success' | 'error' | 'info'

export interface ToastItem {
  id: number
  message: string
  tone: ToastTone
}

const toasts = ref<ToastItem[]>([])
let nextId = 1

export function dismissToast(id: number) {
  toasts.value = toasts.value.filter((item) => item.id !== id)
}

export function showToast(message: string, tone: ToastTone = 'info', durationMs = 4200) {
  const text = message.trim()
  if (!text) return
  const id = nextId++
  toasts.value = [...toasts.value.slice(-3), { id, message: text, tone }]
  if (durationMs > 0 && typeof window !== 'undefined') {
    window.setTimeout(() => dismissToast(id), durationMs)
  }
}

export function useToast() {
  return {
    toasts,
    showToast,
    dismissToast
  }
}

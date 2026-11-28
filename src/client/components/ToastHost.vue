<template>
  <Teleport to="body">
    <div
      class="pointer-events-none fixed right-4 top-4 z-[80] flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2.5 sm:right-6 sm:top-6"
      aria-live="polite"
      aria-atomic="false"
    >
      <TransitionGroup name="toast">
        <div
          v-for="item in toasts"
          :key="item.id"
          role="status"
          class="pointer-events-auto flex items-start gap-3 rounded-card border border-line-subtle bg-elevated px-4 py-3 text-sm shadow-elevated"
        >
          <span
            class="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
            :style="toneStyle(item.tone)"
            aria-hidden="true"
          >
            <Check v-if="item.tone === 'success'" :size="13" />
            <AlertCircle v-else-if="item.tone === 'error'" :size="13" />
            <Info v-else :size="13" />
          </span>
          <p class="min-w-0 flex-1 break-words leading-5 text-ink-primary">{{ item.message }}</p>
          <button
            type="button"
            class="icon-btn -mr-1.5 -mt-1 h-7 w-7 text-ink-muted"
            aria-label="关闭通知"
            @click="dismissToast(item.id)"
          >
            <X :size="14" />
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { AlertCircle, Check, Info, X } from 'lucide-vue-next'
import { useToast, type ToastTone } from '../composables/useToast'

const { toasts, dismissToast } = useToast()

function toneStyle(tone: ToastTone) {
  if (tone === 'success') return { backgroundColor: 'var(--status-ok-bg)', color: 'var(--status-ok)' }
  if (tone === 'error') return { backgroundColor: 'var(--status-danger-bg)', color: 'var(--status-danger)' }
  return { backgroundColor: 'var(--status-info-bg)', color: 'var(--status-info)' }
}
</script>

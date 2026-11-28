<template>
  <Teleport to="body">
    <Transition name="fade-scale">
      <div
        v-if="open"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-[4px] sm:p-6"
        @mousedown.self="emit('update:open', false)"
      >
        <section
          ref="dialog"
          class="flex max-h-[calc(100dvh-2rem)] w-full flex-col overflow-hidden rounded-modal border border-line-subtle bg-elevated shadow-elevated focus:outline-none sm:max-h-[calc(100dvh-3rem)]"
          :class="width || 'max-w-lg'"
          role="dialog"
          aria-modal="true"
          :aria-label="title"
          tabindex="-1"
          @keydown="handleKeydown"
        >
          <header class="flex min-h-[60px] shrink-0 items-center justify-between gap-4 border-b border-line-subtle px-5 py-3.5 sm:px-6">
            <div class="min-w-0">
              <h2 class="truncate text-base font-semibold text-ink-primary">{{ title }}</h2>
              <p v-if="subtitle" class="mt-0.5 truncate text-xs text-ink-muted">{{ subtitle }}</p>
            </div>
            <button
              type="button"
              class="icon-btn -mr-1.5 h-8 w-8 shrink-0"
              title="关闭"
              aria-label="关闭"
              @click="emit('update:open', false)"
            >
              <X :size="17" />
            </button>
          </header>
          <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 sm:p-6">
            <slot />
          </div>
          <footer v-if="$slots.footer" class="shrink-0 border-t border-line-subtle bg-surface/80 px-5 py-3.5 sm:px-6">
            <slot name="footer" />
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { nextTick, onUnmounted, ref, watch } from 'vue'
import { X } from 'lucide-vue-next'

const props = defineProps<{ open: boolean; title: string; subtitle?: string; width?: string }>()
const emit = defineEmits<{ 'update:open': [value: boolean] }>()

const dialog = ref<HTMLElement | null>(null)
let previousFocus: HTMLElement | null = null
let previousOverflow = ''
let previousPaddingRight = ''

function restoreBodyScroll() {
  document.body.style.overflow = previousOverflow
  document.body.style.paddingRight = previousPaddingRight
}

watch(
  () => props.open,
  async (open) => {
    if (open) {
      previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
      previousOverflow = document.body.style.overflow
      previousPaddingRight = document.body.style.paddingRight
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth
      const paddingRight = Number.parseFloat(window.getComputedStyle(document.body).paddingRight) || 0
      if (scrollbarWidth > 0) document.body.style.paddingRight = `${paddingRight + scrollbarWidth}px`
      document.body.style.overflow = 'hidden'
      await nextTick()
      dialog.value?.focus({ preventScroll: true })
    } else {
      restoreBodyScroll()
      previousFocus?.focus({ preventScroll: true })
    }
  }
)

onUnmounted(() => {
  if (props.open) restoreBodyScroll()
})

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    emit('update:open', false)
    return
  }
  if (event.key !== 'Tab' || !dialog.value) return
  const controls = [
    ...dialog.value.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]'
    )
  ].filter((element) => element.offsetParent !== null)
  if (!controls.length) return
  const target = event.shiftKey ? controls.at(-1) : controls[0]
  if (document.activeElement === dialog.value || document.activeElement === (event.shiftKey ? controls[0] : controls.at(-1))) {
    event.preventDefault()
    target?.focus()
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="drawer-slide">
      <div
        v-if="open"
        class="fixed inset-0 z-50 flex justify-end bg-black/45 backdrop-blur-[3px]"
        @mousedown.self="emit('update:open', false)"
      >
        <section
          ref="drawer"
          class="drawer-panel flex h-full w-full max-w-md flex-col border-l border-line-subtle bg-elevated shadow-elevated focus:outline-none"
          role="dialog"
          aria-modal="true"
          :aria-label="title"
          tabindex="-1"
          @keydown.esc.prevent="emit('update:open', false)"
        >
          <header class="flex min-h-[64px] shrink-0 items-center justify-between gap-3 border-b border-line-subtle px-5 py-4">
            <div class="min-w-0">
              <h2 class="truncate text-base font-semibold text-ink-primary">{{ title }}</h2>
              <p v-if="subtitle" class="mt-0.5 truncate font-mono text-xs text-ink-muted">{{ subtitle }}</p>
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
          <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5">
            <slot />
          </div>
          <footer v-if="$slots.footer" class="shrink-0 border-t border-line-subtle bg-surface/80 px-5 py-3.5">
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

const props = defineProps<{ open: boolean; title: string; subtitle?: string }>()
const emit = defineEmits<{ 'update:open': [value: boolean] }>()

const drawer = ref<HTMLElement | null>(null)
let previousOverflow = ''

watch(
  () => props.open,
  async (open) => {
    if (open) {
      previousOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
      await nextTick()
      drawer.value?.focus({ preventScroll: true })
    } else {
      document.body.style.overflow = previousOverflow
    }
  }
)

onUnmounted(() => {
  if (props.open) document.body.style.overflow = previousOverflow
})
</script>

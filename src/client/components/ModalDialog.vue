<template>
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" @mousedown.self="emit('update:open', false)">
      <section ref="dialog" class="dialog-surface max-h-[90vh] w-full overflow-auto rounded-md bg-white shadow-xl" :class="width" role="dialog" aria-modal="true" :aria-label="title" tabindex="-1" @keydown="handleKeydown">
        <header class="dialog-header flex h-16 items-center border-b border-slate-200 px-5"><h2 class="font-medium">{{ title }}</h2><button class="icon-button ml-auto" title="关闭" aria-label="关闭" @click="emit('update:open', false)"><X :size="18" /></button></header>
        <div class="dialog-body"><slot /></div>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { nextTick, onUnmounted, ref, watch } from 'vue'
import { X } from 'lucide-vue-next'
const props = defineProps<{ open: boolean; title: string; width?: string }>()
const emit = defineEmits<{ 'update:open': [value: boolean] }>()
const dialog = ref<HTMLElement | null>(null)
let previousFocus: HTMLElement | null = null
let previousOverflow = ''
watch(() => props.open, async (open) => {
  if (open) {
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    await nextTick()
    dialog.value?.focus({ preventScroll: true })
  } else {
    document.body.style.overflow = previousOverflow
    previousFocus?.focus({ preventScroll: true })
  }
})
onUnmounted(() => { if (props.open) document.body.style.overflow = previousOverflow })
function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') { event.preventDefault(); emit('update:open', false); return }
  if (event.key !== 'Tab' || !dialog.value) return
  const controls = [...dialog.value.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]')].filter((element) => element.offsetParent !== null)
  const target = event.shiftKey ? controls.at(-1) : controls[0]
  if (document.activeElement === dialog.value || document.activeElement === (event.shiftKey ? controls[0] : controls.at(-1))) {
    event.preventDefault()
    target?.focus()
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" @mousedown.self="emit('update:open', false)">
      <section class="max-h-[90vh] w-full overflow-auto rounded-md bg-white shadow-xl" :class="width" role="dialog" aria-modal="true" :aria-label="title">
        <header class="flex h-14 items-center border-b border-slate-200 px-5"><h2 class="font-semibold">{{ title }}</h2><button class="icon-button ml-auto" title="关闭" aria-label="关闭" @click="emit('update:open', false)"><X :size="18" /></button></header>
        <div class="p-5"><slot /></div>
      </section>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { X } from 'lucide-vue-next'
defineProps<{ open: boolean; title: string; width?: string }>()
const emit = defineEmits<{ 'update:open': [value: boolean] }>()
</script>

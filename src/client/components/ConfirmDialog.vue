<template>
  <ModalDialog :open="open" :title="title" width="max-w-md" @update:open="emit('update:open', $event)">
    <div class="flex items-start gap-3.5">
      <div
        class="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
        :style="
          danger
            ? { backgroundColor: 'var(--status-danger-bg)', color: 'var(--status-danger)' }
            : { backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }
        "
        aria-hidden="true"
      >
        <AlertTriangle v-if="danger" :size="20" />
        <HelpCircle v-else :size="20" />
      </div>
      <div class="min-w-0 flex-1 space-y-2">
        <p class="text-sm leading-6 text-ink-primary">{{ message }}</p>
        <p v-if="description" class="text-xs leading-5 text-ink-muted">{{ description }}</p>

        <label
          v-if="checkboxLabel"
          class="mt-3 flex cursor-pointer items-start gap-2.5 rounded-control border border-line-subtle bg-subtle/60 p-3 text-xs leading-5 text-ink-secondary"
        >
          <input
            type="checkbox"
            class="mt-0.5"
            :checked="checkboxValue"
            @change="emit('update:checkboxValue', ($event.target as HTMLInputElement).checked)"
          />
          <span>{{ checkboxLabel }}</span>
        </label>
      </div>
    </div>

    <template #footer>
      <div class="flex items-center justify-end gap-2.5">
        <button type="button" class="btn" :disabled="loading" @click="emit('update:open', false)">
          {{ cancelLabel }}
        </button>
        <button
          type="button"
          class="btn"
          :class="danger ? 'btn-danger' : 'btn-primary'"
          :disabled="loading"
          @click="emit('confirm')"
        >
          <LoaderCircle v-if="loading" :size="16" class="animate-spin" />
          {{ confirmLabel }}
        </button>
      </div>
    </template>
  </ModalDialog>
</template>

<script setup lang="ts">
import { AlertTriangle, HelpCircle, LoaderCircle } from 'lucide-vue-next'
import ModalDialog from './ModalDialog.vue'

withDefaults(
  defineProps<{
    open: boolean
    title: string
    message: string
    description?: string
    confirmLabel?: string
    cancelLabel?: string
    danger?: boolean
    loading?: boolean
    checkboxLabel?: string
    checkboxValue?: boolean
  }>(),
  {
    confirmLabel: '确认',
    cancelLabel: '取消',
    danger: false,
    loading: false,
    checkboxValue: false
  }
)

const emit = defineEmits<{
  'update:open': [value: boolean]
  'update:checkboxValue': [value: boolean]
  confirm: []
}>()
</script>

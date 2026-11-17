<template><label class="block min-w-0"><span class="label">{{ label }}</span><div class="relative"><input :value="modelValue" class="input font-mono" :class="{ 'pr-16': suffix }" type="number" :min="min" :max="max" :step="step" @input="emit('update:modelValue', Number(($event.target as HTMLInputElement).value))" /><span v-if="suffix" class="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-slate-500">{{ suffix }}</span></div></label></template>
<script setup lang="ts">
withDefaults(defineProps<{ modelValue: number; label: string; min: number; max: number; step?: number; suffix?: string }>(), { step: 1, suffix: '' })
const emit = defineEmits<{ 'update:modelValue': [value: number] }>()
</script>

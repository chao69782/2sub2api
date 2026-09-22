<template><label><span class="label">{{ label }}</span><div class="relative"><input :value="modelValue" class="input pr-20" type="number" :min="min" :max="max" :step="step" @input="emit('update:modelValue', Number(($event.target as HTMLInputElement).value))" /><span v-if="suffix" class="pointer-events-none absolute right-3 top-2.5 text-xs text-slate-400">{{ suffix }}</span></div></label></template>
<script setup lang="ts">
withDefaults(defineProps<{ modelValue: number; label: string; min: number; max: number; step?: number; suffix?: string }>(), { step: 1, suffix: '' })
const emit = defineEmits<{ 'update:modelValue': [value: number] }>()
</script>

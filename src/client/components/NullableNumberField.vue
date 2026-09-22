<template><label><span class="label">{{ label }}</span><input :value="modelValue ?? ''" class="input" type="number" :min="min" :max="max" :step="step" placeholder="不设置" @input="update" /></label></template>
<script setup lang="ts">
withDefaults(defineProps<{ modelValue: number | null; label: string; min: number; max: number; step?: number }>(), { step: 1 })
const emit = defineEmits<{ 'update:modelValue': [value: number | null] }>()
function update(event: Event) { const value = (event.target as HTMLInputElement).value; emit('update:modelValue', value === '' ? null : Number(value)) }
</script>

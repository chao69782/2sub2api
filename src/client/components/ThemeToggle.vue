<template>
  <button
    v-if="compact"
    type="button"
    class="icon-btn"
    :title="`当前主题：${currentLabel}（点击切换）`"
    :aria-label="`切换主题，当前为${currentLabel}`"
    @click="cycle"
  >
    <Monitor v-if="mode === 'system'" :size="17" />
    <Sun v-else-if="mode === 'light'" :size="17" />
    <Moon v-else :size="17" />
  </button>

  <div
    v-else
    class="inline-grid grid-cols-3 rounded-control border border-line-subtle bg-subtle p-0.5"
    role="radiogroup"
    aria-label="界面主题"
  >
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      role="radio"
      :aria-checked="mode === option.value"
      :title="option.label"
      class="inline-flex h-7 items-center justify-center gap-1.5 rounded-[7px] px-2.5 text-xs font-medium transition-all duration-150"
      :class="
        mode === option.value
          ? 'bg-surface text-ink-primary shadow-sm'
          : 'text-ink-muted hover:text-ink-primary'
      "
      @click="setThemeMode(option.value)"
    >
      <component :is="option.icon" :size="14" aria-hidden="true" />
      <span v-if="showLabels">{{ option.short }}</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Monitor, Moon, Sun } from 'lucide-vue-next'
import { useTheme, type ThemeMode } from '../composables/useTheme'

const props = withDefaults(defineProps<{ compact?: boolean; showLabels?: boolean }>(), {
  compact: false,
  showLabels: false
})

const { mode, setThemeMode } = useTheme()

const options: ReadonlyArray<{ value: ThemeMode; label: string; short: string; icon: typeof Monitor }> = [
  { value: 'system', label: '跟随系统主题', short: '系统', icon: Monitor },
  { value: 'light', label: '浅色主题', short: '浅色', icon: Sun },
  { value: 'dark', label: '深色主题', short: '深色', icon: Moon }
]

const currentLabel = computed(() => options.find((item) => item.value === mode.value)?.label ?? '跟随系统主题')

function cycle() {
  const order: ThemeMode[] = ['system', 'light', 'dark']
  const next = order[(order.indexOf(mode.value) + 1) % order.length]!
  setThemeMode(next)
}
</script>

<template>
  <div class="flex min-h-screen bg-canvas text-ink-primary">
    <!-- Desktop Left App Rail -->
    <aside
      class="sticky top-0 hidden h-screen shrink-0 flex-col border-r border-line-subtle bg-surface transition-[width] duration-200 ease-out md:flex"
      :class="collapsed ? 'w-[72px]' : 'w-[244px]'"
      aria-label="主侧边栏"
    >
      <!-- Brand -->
      <div class="flex h-16 items-center gap-3 border-b border-line-subtle px-4">
        <div
          class="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-accent text-accent-ink shadow-sm"
          aria-hidden="true"
        >
          <ShieldCheck :size="19" :stroke-width="2" />
        </div>
        <div v-if="!collapsed" class="min-w-0 flex-1">
          <div class="truncate text-sm font-semibold tracking-tight text-ink-primary">授权工作台</div>
          <div class="truncate font-mono text-[11px] text-ink-muted">OpenAI · Sub2API</div>
        </div>
        <button
          v-if="!collapsed"
          type="button"
          class="icon-btn h-8 w-8 text-ink-muted"
          title="收起侧边栏"
          aria-label="收起侧边栏"
          @click="toggleCollapsed"
        >
          <PanelLeftClose :size="16" />
        </button>
      </div>

      <!-- Navigation -->
      <nav class="flex-1 space-y-1 p-3" aria-label="主导航">
        <RouterLink
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          class="group flex h-10 items-center gap-3 rounded-control px-3 text-sm font-medium transition-colors"
          :class="[
            isActive(item.to)
              ? 'bg-accent-soft text-accent'
              : 'text-ink-secondary hover:bg-subtle hover:text-ink-primary',
            collapsed ? 'justify-center px-0' : ''
          ]"
          :title="collapsed ? item.label : undefined"
        >
          <component :is="item.icon" :size="18" class="shrink-0" aria-hidden="true" />
          <span v-if="!collapsed" class="truncate">{{ item.label }}</span>
        </RouterLink>
      </nav>

      <!-- Bottom Controls -->
      <div class="space-y-3 border-t border-line-subtle p-3">
        <div v-if="collapsed" class="flex flex-col items-center gap-2">
          <button
            type="button"
            class="icon-btn"
            title="展开侧边栏"
            aria-label="展开侧边栏"
            @click="toggleCollapsed"
          >
            <PanelLeftOpen :size="17" />
          </button>
          <ThemeToggle compact />
          <button
            type="button"
            class="icon-btn icon-btn-danger"
            title="退出登录"
            aria-label="退出登录"
            @click="emit('logout')"
          >
            <LogOut :size="17" />
          </button>
        </div>

        <template v-else>
          <div class="flex items-center justify-between gap-2 px-1">
            <span class="text-xs text-ink-muted">界面主题</span>
            <ThemeToggle />
          </div>

          <div class="flex items-center gap-2.5 rounded-control border border-line-subtle bg-subtle/60 px-2.5 py-2">
            <div class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-soft font-mono text-xs font-semibold uppercase text-accent">
              {{ avatarLetter }}
            </div>
            <div class="min-w-0 flex-1">
              <div class="truncate font-mono text-xs font-medium text-ink-primary">{{ username }}</div>
              <div class="flex items-center gap-1.5 text-[11px] text-ink-muted">
                <span class="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                <span>管理员会话</span>
              </div>
            </div>
            <button
              type="button"
              class="icon-btn icon-btn-danger h-8 w-8"
              title="退出登录"
              aria-label="退出登录"
              @click="emit('logout')"
            >
              <LogOut :size="15" />
            </button>
          </div>
        </template>
      </div>
    </aside>

    <!-- Main Column -->
    <div class="flex min-w-0 flex-1 flex-col">
      <!-- Mobile Header -->
      <header class="glass-bar sticky top-0 z-30 flex h-14 items-center justify-between gap-3 px-4 md:hidden">
        <div class="flex items-center gap-2.5">
          <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-accent-ink">
            <ShieldCheck :size="16" />
          </div>
          <span class="text-sm font-semibold text-ink-primary">授权工作台</span>
        </div>
        <div class="flex items-center gap-1">
          <ThemeToggle compact />
          <button
            type="button"
            class="icon-btn icon-btn-danger h-9 w-9"
            title="退出登录"
            aria-label="退出登录"
            @click="emit('logout')"
          >
            <LogOut :size="17" />
          </button>
        </div>
      </header>

      <!-- Main Workspace Canvas -->
      <main class="mx-auto w-full max-w-[1480px] flex-1 px-4 pb-24 pt-6 sm:px-6 md:pb-12 md:pt-8 lg:px-10">
        <slot />
      </main>
    </div>

    <!-- Mobile Bottom Tab Bar -->
    <nav
      class="glass-bar fixed inset-x-0 bottom-0 z-30 grid grid-cols-2 border-b-0 border-t border-line-subtle px-3 py-1.5 md:hidden"
      aria-label="移动端主导航"
    >
      <RouterLink
        v-for="item in navItems"
        :key="item.to"
        :to="item.to"
        class="flex flex-col items-center justify-center gap-1 rounded-control py-1.5 text-xs font-medium transition-colors"
        :class="isActive(item.to) ? 'text-accent' : 'text-ink-muted'"
      >
        <component :is="item.icon" :size="19" aria-hidden="true" />
        <span>{{ item.shortLabel }}</span>
      </RouterLink>
    </nav>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { LogOut, PanelLeftClose, PanelLeftOpen, Settings, ShieldCheck, Users } from 'lucide-vue-next'
import ThemeToggle from './ThemeToggle.vue'

const props = defineProps<{ username: string }>()
const emit = defineEmits<{ logout: [] }>()

const route = useRoute()
const SIDEBAR_KEY = 'oaw-sidebar-collapsed'

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(SIDEBAR_KEY) === '1'
  } catch {
    return false
  }
}

const collapsed = ref(readCollapsed())

function toggleCollapsed() {
  collapsed.value = !collapsed.value
  try {
    window.localStorage.setItem(SIDEBAR_KEY, collapsed.value ? '1' : '0')
  } catch {
    // Ignore storage errors.
  }
}

const navItems = [
  { to: '/accounts', label: '账号工作台', shortLabel: '账号', icon: Users },
  { to: '/settings', label: '系统设置', shortLabel: '设置', icon: Settings }
]

const avatarLetter = computed(() => (props.username.trim()[0] || 'A').toUpperCase())

function isActive(path: string) {
  return route.path === path || route.path.startsWith(`${path}/`)
}
</script>

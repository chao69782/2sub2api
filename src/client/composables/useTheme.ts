import { computed, ref } from 'vue'

export type ThemeMode = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

const STORAGE_KEY = 'oaw-theme'

const mode = ref<ThemeMode>('system')
const systemDark = ref(false)
let initialized = false

function readStoredMode(): ThemeMode {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw
  } catch {
    // Ignore storage access errors in private contexts.
  }
  return 'system'
}

const resolvedTheme = computed<ResolvedTheme>(() => {
  if (mode.value === 'system') return systemDark.value ? 'dark' : 'light'
  return mode.value
})

function applyThemeToDocument(theme: ResolvedTheme) {
  const root = document.documentElement
  root.classList.toggle('dark', theme === 'dark')
  root.style.colorScheme = theme
}

export function initTheme() {
  if (initialized || typeof window === 'undefined') return
  initialized = true
  mode.value = readStoredMode()
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  systemDark.value = media.matches
  applyThemeToDocument(resolvedTheme.value)

  const handleChange = (event: MediaQueryListEvent) => {
    systemDark.value = event.matches
    if (mode.value === 'system') {
      applyThemeToDocument(resolvedTheme.value)
    }
  }
  media.addEventListener('change', handleChange)
}

export function setThemeMode(nextMode: ThemeMode) {
  mode.value = nextMode
  try {
    window.localStorage.setItem(STORAGE_KEY, nextMode)
  } catch {
    // Ignore storage write errors.
  }
  applyThemeToDocument(resolvedTheme.value)
}

export function useTheme() {
  initTheme()
  return {
    mode,
    resolvedTheme,
    setThemeMode
  }
}

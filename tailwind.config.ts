import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/client/**/*.{vue,ts}'],
  darkMode: 'class',
  theme: { extend: {} },
  plugins: []
} satisfies Config

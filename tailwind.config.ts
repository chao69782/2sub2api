import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/client/**/*.{vue,ts}'],
  darkMode: 'class',
  theme: { extend: { colors: { slate: {
    50: '#f6f7f7', 100: '#eef0ef', 200: '#dfe4e2', 300: '#c6ceca', 400: '#82918a',
    500: '#64736b', 600: '#4b5952', 700: '#35433b', 800: '#24332b', 900: '#17251d', 950: '#101a14'
  } } } },
  plugins: []
} satisfies Config

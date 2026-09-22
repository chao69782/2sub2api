import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src/client', import.meta.url)) } },
  build: { outDir: 'dist/client', emptyOutDir: true },
  server: { port: 5173, proxy: { '/api': 'http://127.0.0.1:1000', '/health': 'http://127.0.0.1:1000' } }
})

/// <reference types="vitest" />
import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    proxy: {
      '/characters': 'http://localhost:8080',
      '/expedition-runs': 'http://localhost:8080',
    },
  },
  test: {
    environment: 'happy-dom',
    globals: true,
  },
})

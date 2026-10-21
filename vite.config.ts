import { resolve } from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  build: {
    rollupOptions: {
      input: { main: resolve(import.meta.dirname, 'index.html'), gallery: resolve(import.meta.dirname, 'gallery.html') },
    },
  },
})

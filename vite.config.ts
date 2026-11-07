import { defineConfig } from 'vite'

// Two pages: the transmission, and /how/, the essay on how it works.
export default defineConfig({
  build: { rollupOptions: { input: { main: 'index.html', how: 'how/index.html' } } },
})

import { defineConfig } from 'vite'

// Two pages: the transmission, and /how/, the essay on how it works. Each build has an id, written beside the pages
// as version.json, so a page a cache kept can tell it is old (main.ts) and what it loads can be asked for fresh.
const BUILD = Date.now().toString(36)
export default defineConfig({
  define: { __BUILD__: JSON.stringify(BUILD) },
  build: { rollupOptions: { input: { main: 'index.html', how: 'how/index.html' } } },
  plugins: [{ name: 'version', generateBundle() { this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ id: BUILD }) }) } }],
})

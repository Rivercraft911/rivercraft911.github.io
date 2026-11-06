// Screenshots of the scope at given scene times: node scripts/shot.mjs [outDir] t1 t2 ...
import { createServer } from 'vite'
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const [out = 'shots', ...times] = process.argv.slice(2)
mkdirSync(out, { recursive: true })
const server = await createServer({ server: { port: 5199 }, logLevel: 'error' })
await server.listen()
const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-unsafe-webgpu', '--enable-gpu', '--use-angle=metal'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 })
page.on('console', (m) => console.log('[page]', m.type(), m.text()))
page.on('pageerror', (e) => console.log('[error]', e.message))
for (const t of times.length ? times : ['1']) {
  await page.goto(`http://localhost:5199/?auto&pause&t=${t}`)
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${out}/t${t}.png` })
  console.log(`${out}/t${t}.png`)
}
await browser.close()
await server.close()

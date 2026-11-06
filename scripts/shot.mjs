// Screenshots of the scope at given scene times: node scripts/shot.mjs [outDir] t1 t2 ... [--q query]
// --q adds query params to the page, e.g. --q specimen; --size WxH sets the viewport (default 1280x720)
import { createServer } from 'vite'
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const args = process.argv.slice(2), qi = args.indexOf('--q')
const extra = qi < 0 ? '' : `&${args.splice(qi, 2)[1]}`
const si = args.indexOf('--size'), [width, height] = (si < 0 ? '1280x720' : args.splice(si, 2)[1]).split('x').map(Number)
const [out = 'shots', ...times] = args
mkdirSync(out, { recursive: true })
const server = await createServer({ server: { port: 5199 }, logLevel: 'error' })
await server.listen()
const base = server.resolvedUrls.local[0] // the port it got: other checkouts may hold the default
const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-unsafe-webgpu', '--enable-gpu', '--use-angle=metal'] })
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 })
page.on('console', (m) => console.log('[page]', m.type(), m.text()))
page.on('pageerror', (e) => console.log('[error]', e.message))
for (const t of times.length ? times : ['1']) {
  await page.goto(`${base}?auto&pause&t=${t}${extra}`)
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${out}/t${t}.png` })
  console.log(`${out}/t${t}.png`)
}
await browser.close()
await server.close()

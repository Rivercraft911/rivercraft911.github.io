// Frame times at given scene times, headless Chrome on the real GPU: node scripts/fps.mjs t1 t2 ...
import { createServer } from 'vite'
import { chromium } from 'playwright'

const server = await createServer({ server: { port: 5198 }, logLevel: 'error' })
await server.listen()
const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-unsafe-webgpu', '--use-angle=metal'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
for (const t of process.argv.slice(2)) {
  await page.goto(`http://localhost:5198/?auto&t=${t}`)
  await page.waitForTimeout(800)
  const ts = await page.evaluate(() => new Promise((done) => {
    const ts = []
    const f = (n) => (ts.push(n), ts.length < 120 ? requestAnimationFrame(f) : done(ts))
    requestAnimationFrame(f)
  }))
  const d = ts.slice(1).map((x, i) => x - ts[i]).sort((a, b) => a - b)
  console.log(`t=${t}\tmedian ${d[d.length >> 1].toFixed(1)} ms\tp95 ${d[Math.floor(d.length * 0.95)].toFixed(1)} ms`)
}
await browser.close()
await server.close()

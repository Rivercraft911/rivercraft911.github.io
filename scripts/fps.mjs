// Frame times at given scene times, headless Chrome on the real GPU:
// node scripts/fps.mjs [--dpr n] [--size WxH] [--throttle n] [--q tier] t1 t2 ...
// Prints median/p95 of the frame interval (paced by vsync: misses show here), of each frame's work (its
// start until the GPU has finished it: the cost, and the headroom under the interval), and the tier the
// quality governor settled on. --throttle slows the CPU n×; --q pins a tier.
import { createServer } from 'vite'
import { chromium } from 'playwright'

const args = process.argv.slice(2), opt = { dpr: '2', size: '1440x900', throttle: '1' }, times = []
for (let i = 0; i < args.length; i++) args[i].startsWith('--') ? (opt[args[i].slice(2)] = args[++i]) : times.push(args[i])
const [width, height] = opt.size.split('x').map(Number)

const server = await createServer({ server: { port: 5198 }, logLevel: 'error' })
await server.listen()
const browser = await chromium.launch({ channel: 'chrome', args: ['--enable-unsafe-webgpu', '--use-angle=metal'] })
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: Number(opt.dpr) })
const cdp = await page.context().newCDPSession(page)
await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(opt.throttle) })
console.log(`${width}x${height} @${opt.dpr}x  cpu ÷${opt.throttle}${opt.q ? `  q=${opt.q}` : ''}`)
for (const t of times) {
  await page.goto(`http://localhost:5198/?auto&t=${t}${opt.q ? `&q=${opt.q}` : ''}`)
  await page.waitForTimeout(4000) // let the governor settle
  const [ts, work] = await page.evaluate(() => new Promise((done) => {
    const ts = [], work = []
    const f = (n) => {
      ts.push(n)
      window.__device.queue.onSubmittedWorkDone().then(() => work.push(performance.now() - n))
      ts.length < 240 ? requestAnimationFrame(f) : setTimeout(() => done([ts, work]), 100)
    }
    requestAnimationFrame(f)
  }))
  const stat = (d) => (d.sort((a, b) => a - b), `median ${d[d.length >> 1].toFixed(1)}  p95 ${d[Math.floor(d.length * 0.95)].toFixed(1)} ms`)
  const tier = await page.evaluate(() => window.__tier)
  console.log(`t=${t}\tframe ${stat(ts.slice(1).map((x, i) => x - ts[i]))}\twork ${stat(work)}\ttier ${tier}`)
}
await browser.close()
await server.close()

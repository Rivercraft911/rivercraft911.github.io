// Records a clip of the intro, picture and sound, as an mp4: node scripts/clip.mjs out.mp4 [from=0] [seconds=30] [WxH=1280x720]
import { createServer } from 'vite'
import { chromium } from 'playwright'
import { rmSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

const [out = 'clip.mp4', from = '0', secs = '30', size = '1280x720'] = process.argv.slice(2)
const [width, height] = size.split('x').map(Number)
const server = await createServer({ server: { port: 5196 }, logLevel: 'error' })
await server.listen()
const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--enable-unsafe-webgpu', '--enable-gpu', '--use-angle=metal', '--autoplay-policy=no-user-gesture-required'],
})
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 })
page.on('pageerror', (e) => console.log('[error]', e.message))
const chunks = []
let done
const finished = new Promise((r) => (done = r))
await page.exposeFunction('__chunk', (b64) => chunks.push(Buffer.from(b64, 'base64')))
page.on('console', (m) => m.type() !== 'debug' && console.log('[page]', m.text()))
await page.exposeFunction('__done', () => done())
await page.goto(`http://localhost:5196/?t=${from}&rec=${secs}`)
await finished
const webm = out.replace(/\.mp4$/, '') + '.webm'
writeFileSync(webm, Buffer.concat(chunks))
await browser.close()
await server.close()
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', webm, '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', out])
rmSync(webm)
console.log(out)

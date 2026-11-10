// How loud the soundtrack is, a second at a time, in three bands, from a recording made as clip.mjs makes one:
// node scripts/hear.mjs [from=0] [seconds=20] [--q query] [--spec out.png]
// Each row is a second of the timeline and its RMS in dBFS (a full-scale square is 0) below 200 Hz, from 200 Hz to
// 2 kHz and from 2 to 8 kHz; then each band's mean and quietest second. --spec also draws the whole recording's
// log-frequency spectrogram. The recording is a scratch file, gone when this exits.
import { createServer } from 'vite'
import { chromium } from 'playwright'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

const args = process.argv.slice(2), opt = (k, i = args.indexOf(k)) => (i < 0 ? undefined : args.splice(i, 2)[1])
const extra = opt('--q'), spec = opt('--spec')
const [from = '0', secs = '20'] = args
const BANDS = [[0, 200], [200, 2000], [2000, 8000]], SR = 48000, FLOOR = -120
const dir = mkdtempSync(join(tmpdir(), 'hear-')), webm = join(dir, 'hear.webm')
let server, browser
try {
  server = await createServer({ server: { port: 5195 }, logLevel: 'error' })
  await server.listen()
  browser = await chromium.launch({
    channel: 'chrome',
    args: ['--enable-unsafe-webgpu', '--enable-gpu', '--use-angle=metal', '--autoplay-policy=no-user-gesture-required'],
  })
  const page = await browser.newPage({ viewport: { width: 160, height: 90 }, deviceScaleFactor: 1 })
  page.on('pageerror', (e) => console.log('[error]', e.message))
  // The recorder starts before the clock does: note when, and when the first audio reaches the worklet.
  await page.addInitScript(() => {
    const start = MediaRecorder.prototype.start, post = MessagePort.prototype.postMessage
    MediaRecorder.prototype.start = function (...a) { return (window.__r0 = performance.now()), start.apply(this, a) }
    MessagePort.prototype.postMessage = function (m, ...a) {
      if (m instanceof Float32Array && window.__r0 && !window.__a0) window.__a0 = performance.now()
      return post.call(this, m, ...a)
    }
  })
  const chunks = []
  let done
  const finished = new Promise((r) => (done = r))
  await page.exposeFunction('__chunk', (b64) => chunks.push(Buffer.from(b64, 'base64')))
  await page.exposeFunction('__done', () => done())
  await page.goto(`${server.resolvedUrls.local[0]}?t=${from}&rec=${secs}${extra ? `&${extra}` : ''}`)
  await finished
  const lead = await page.evaluate(() => (window.__a0 - window.__r0) / 1000)
  writeFileSync(webm, Buffer.concat(chunks))
  await browser.close(), await server.close()
  ;(browser = undefined), (server = undefined)

  // Each band through a 0.1 s linear-phase FIR (edges some 20 Hz wide), the three stereo pairs side by side.
  const band = ([lo, hi], i) => `[s${i}]firequalizer=gain='if(between(f,${lo},${hi}),0,-200)':delay=0.05:zero_phase=1,aformat=sample_fmts=fltp:channel_layouts=stereo[b${i}]`
  const graph = `[0:a]atrim=start=${lead.toFixed(3)},aresample=${SR},asplit=3[s0][s1][s2];${BANDS.map(band).join(';')};[b0][b1][b2]amerge=inputs=3[out]`
  const pcm = execFileSync('ffmpeg', ['-loglevel', 'error', '-i', webm, '-filter_complex', graph, '-map', '[out]', '-f', 'f32le', '-'], { maxBuffer: 1 << 30, stdio: ['ignore', 'pipe', 'inherit'] })
  const x = new Float32Array(pcm.buffer, pcm.byteOffset, pcm.length >> 2), n = Math.floor(x.length / 6 / SR)
  const db = (p) => Math.max(FLOOR, 10 * Math.log10(p))
  const rows = Array.from({ length: n }, (_, s) =>
    BANDS.map((_, b) => {
      let p = 0
      for (let i = s * SR * 6 + 2 * b, e = (s + 1) * SR * 6; i < e; i += 6) p += x[i] * x[i] + x[i + 1] * x[i + 1]
      return db(p / (2 * SR))
    }),
  )
  const col = (v) => (typeof v === 'number' ? v.toFixed(1) : v).padStart(9)
  console.log(`recorder lead-in ${(lead * 1000).toFixed(0)} ms, trimmed; rows are timeline seconds, dBFS RMS`)
  console.log('     t' + ['<200', '200-2k', '2k-8k'].map(col).join(''))
  rows.forEach((r, s) => console.log(String(Number(from) + s).padStart(6) + r.map(col).join('')))
  const mean = BANDS.map((_, b) => db(rows.reduce((a, r) => a + 10 ** (r[b] / 10), 0) / n)) // of power, not of dB
  const low = BANDS.map((_, b) => rows.reduce((m, r, s) => (r[b] < rows[m][b] ? s : m), 0))
  console.log('  mean' + mean.map(col).join(''))
  console.log(' least' + low.map((s, b) => col(`${rows[s][b].toFixed(1)}@${Number(from) + s}`)).join(''))

  if (spec)
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', webm, '-lavfi', 'showspectrumpic=s=1600x800:fscale=log:start=20:stop=20000:legend=1', spec]),
      console.log(spec)
} finally {
  await browser?.close()
  await server?.close()
  rmSync(dir, { recursive: true, force: true })
}

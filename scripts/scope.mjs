// What a scope on the headphone jack would draw. Plays the page from <from> for <seconds>, catching the exact
// L/R the page hands its speakers (before any codec) and the screen (as clip.mjs records it), then renders L/R
// as an XY phosphor beside each frame, so anyone can see what a real scope would draw:
// node scripts/scope.mjs <from> <seconds> <out.png> [--every s | --at t1,t2,…] [--q query] [--size WxH] [--scale v] [--wav out.wav]
// One row every --every seconds (default: eight rows), or at each time --at lists: the timeline time, the screen,
// and the scope, the same size.
// The scope is AC-coupled (5 Hz), as a headphone jack is, with a graticule of 10 × 8 divisions. --wav also keeps
// the stereo pair, 48 kHz float, to play into a real one.
import { createServer } from 'vite'
import { chromium } from 'playwright'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { deflateSync } from 'node:zlib'

const args = process.argv.slice(2), opt = (k, d, i = args.indexOf(k)) => (i < 0 ? d : args.splice(i, 2)[1])
const extra = opt('--q', ''), size = opt('--size', '640x360'), wav = opt('--wav')
// By default each axis is set as the page sets its gain for the screen's x and y (src/beam/scope.ts), so the scope
// shows the frame as the screen does; --scale v spans ±v on both.
const [, GX, GY] = /GX = ([\d.]+), GY = ([\d.]+)/.exec(readFileSync('src/beam/scope.ts', 'utf8')).map(Number)
const [width, height] = size.split('x').map(Number), scale = opt('--scale')
const SX = scale ? Number(scale) : (GX * width) / height, SY = scale ? Number(scale) : GY
const [from = '0', secs = '4', out = 'scope.png'] = args
const every = Number(opt('--every', String(Math.max(0.25, Number(secs) / 8)))), marks = opt('--at')?.split(',').map(Number)
const SR = 48000, HZ = 60
const dir = mkdtempSync(join(tmpdir(), 'scope-')), webm = join(dir, 'rec.webm')

let server, browser
try {
  server = await createServer({ server: { port: 5194 }, logLevel: 'error' })
  await server.listen()
  browser = await chromium.launch({
    channel: 'chrome',
    args: ['--enable-unsafe-webgpu', '--enable-gpu', '--use-angle=metal', '--autoplay-policy=no-user-gesture-required'],
  })
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 })
  page.on('pageerror', (e) => console.log('[error]', e.message))
  // The speakers' pair as the page posts it to its worklet (L, R, then the spatial voices, interleaved), each
  // frame's wall time, and when the recorder started.
  await page.addInitScript(() => {
    let C = 0
    const W = window.AudioWorkletNode
    window.AudioWorkletNode = class extends W {
      constructor(ctx, name, o) {
        super(ctx, name, o)
        C = 2 + (o?.processorOptions?.voices ?? 0)
      }
    }
    const post = MessagePort.prototype.postMessage
    MessagePort.prototype.postMessage = function (m, ...a) {
      if (m === null && C) window.__pcm(`@${window.__frames.length}`) // the clock was reset: what follows starts at that frame's t
      if (m instanceof Float32Array && C) {
        const n = m.length / C, lr = new Float32Array(2 * n)
        for (let i = 0; i < n; i++) (lr[2 * i] = m[i * C]), (lr[2 * i + 1] = m[i * C + 1])
        let s = ''
        const b = new Uint8Array(lr.buffer)
        for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000))
        window.__pcm(btoa(s))
      }
      return post.call(this, m, ...a)
    }
    const start = MediaRecorder.prototype.start
    MediaRecorder.prototype.start = function (...a) { return (window.__r0 = performance.now()), start.apply(this, a) }
    const raf = window.requestAnimationFrame.bind(window)
    window.__frames = []
    window.requestAnimationFrame = (cb) => raf((n) => (cb.name === 'tick' && window.__frames.push(performance.now()), cb(n)))
  })
  // the pair laid out on the timeline: each run of samples from where the page's clock put it
  const SPAN = Math.ceil((Number(secs) + 2) * SR), x = new Float32Array(2 * SPAN), t0 = Number(from)
  let at = 0, resets = 0, begun = false, done
  const chunks = [], finished = new Promise((r) => (done = r))
  await page.exposeFunction('__pcm', (b64) => {
    if (b64[0] === '@') return void ((at = Math.max(0, Math.round((Number(b64.slice(1)) / HZ) * SR))), resets++, (begun = true))
    const b = Buffer.from(b64, 'base64'), v = new Float32Array(b.buffer, b.byteOffset, b.length >> 2)
    if (!begun) (at = Math.round(-t0 * SR)), (begun = true) // it began at 0, before the first frame
    for (let i = 0; i < v.length && at + (i >> 1) < SPAN; i++) if (at + (i >> 1) >= 0) x[2 * at + i] = v[i]
    at += v.length >> 1
  })
  await page.exposeFunction('__chunk', (b64) => chunks.push(Buffer.from(b64, 'base64')))
  await page.exposeFunction('__done', () => done())
  // ?hz pins the clock to the frames, so the first sample's time is known and every frame is 1/60 s of timeline;
  // the recording runs over, since frames may run slow and its last second may not be handed over before it ends
  await page.goto(`${server.resolvedUrls.local[0]}?t=${from}&rec=${1.5 * Number(secs) + 1.5}&hz=${HZ}${extra ? `&${extra}` : ''}`)
  await finished
  const { frames, r0 } = await page.evaluate(() => ({ frames: window.__frames, r0: window.__r0 }))
  writeFileSync(webm, Buffer.concat(chunks))

  const n = SPAN, a0 = t0
  if (resets > 1) console.log(`(the page's audio clock was reset ${resets - 1}× mid-run; each run of samples is placed where it began)`)
  // AC coupling (5 Hz) and the page's own 16 kHz low-pass
  const L = new Float32Array(n), R = new Float32Array(n), hp = Math.exp((-2 * Math.PI * 5) / SR), lp = 1 - Math.exp((-2 * Math.PI * 16000) / SR)
  for (let c = 0; c < 2; c++) {
    const o = c ? R : L
    let px = 0, py = 0, y = 0
    for (let i = 0; i < n; i++) {
      const v = x[2 * i + c]
      py = hp * (py + v - px), px = v
      o[i] = y += lp * (py - y)
    }
  }
  if (wav) {
    const h = Buffer.alloc(44), d = Buffer.from(x.buffer, x.byteOffset, Math.round(Number(secs) * SR) * 8)
    h.write('RIFF', 0), h.writeUInt32LE(36 + d.length, 4), h.write('WAVEfmt ', 8), h.writeUInt32LE(16, 16), h.writeUInt16LE(3, 20)
    h.writeUInt16LE(2, 22), h.writeUInt32LE(SR, 24), h.writeUInt32LE(SR * 8, 28), h.writeUInt16LE(8, 32), h.writeUInt16LE(32, 34)
    h.write('data', 36), h.writeUInt32LE(d.length, 40)
    writeFileSync(wav, Buffer.concat([h, d])), console.log(wav)
  }

  // Each row: the frame shown at timeline time T, and the phosphor the pair left by then (the last 40 ms, fading).
  const H = 360, Wd = Math.round((H * width) / height), rows = []
  const reached = t0 + frames.length / HZ, all = marks ?? Array.from({ length: Math.max(1, Math.floor(Number(secs) / every)) }, (_, k) => t0 + (k + 0.5) * every)
  const times = all.filter((T) => T < reached - 0.2)
  if (times.length < all.length) console.log(`(frames ran slow: the page reached t ${reached.toFixed(2)}, so the rows after it are left out)`)
  for (const T of times) {
    const k = Math.min(frames.length - 1, Math.max(0, Math.round((T - Number(from)) * HZ) - 1)), v = (frames[k] - r0) / 1000
    const shot = join(dir, `f${rows.length}.png`)
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', v.toFixed(3), '-i', webm, '-frames:v', '1', shot])
    rows.push({ T, screen: readFileSync(shot).toString('base64'), scope: png(xy(L, R, Math.round((T - a0) * SR), Wd, H), Wd, H).toString('base64') })
  }
  const html = `<body style="margin:0;background:#000;color:#8c9;font:13px monospace">${rows.map((r) =>
    `<div style="display:flex;gap:8px;align-items:center;padding:4px 8px"><div style="width:64px">t ${r.T.toFixed(2)}</div>` +
    `<img src="data:image/png;base64,${r.screen}" style="height:${H}px"><img src="data:image/png;base64,${r.scope}"></div>`).join('')}</body>`
  const sheet = await browser.newPage({ viewport: { width: 96 + 2 * Wd + 16, height: 200 }, deviceScaleFactor: 1 })
  await sheet.setContent(html)
  await sheet.screenshot({ path: out, fullPage: true })
  console.log(`${out}: ${rows.length} rows from t ${t0}`)
} finally {
  await browser?.close()
  await server?.close()
  rmSync(dir, { recursive: true, force: true })
}

// The XY phosphor: each sample's energy spread along its segment to the next, so where the beam is slow it is
// bright and its jumps are faint, fading with a 15 ms persistence, over 40 ms; then a blur, and a soft shoulder.
function xy(L, R, end, S, H) {
  const E = new Float32Array(S * H), kx = S / 2 / SX, ky = H / 2 / SY, W = Math.round(0.04 * SR)
  const dep = (x, y, e) => {
    const i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j
    if (i < 0 || j < 0 || i >= S - 1 || j >= H - 1) return
    E[j * S + i] += e * (1 - fx) * (1 - fy), E[j * S + i + 1] += e * fx * (1 - fy)
    E[(j + 1) * S + i] += e * (1 - fx) * fy, E[(j + 1) * S + i + 1] += e * fx * fy
  }
  for (let i = Math.max(1, end - W); i < Math.min(end, L.length); i++) {
    const x0 = S / 2 + L[i - 1] * kx, y0 = H / 2 - R[i - 1] * ky, x1 = S / 2 + L[i] * kx, y1 = H / 2 - R[i] * ky
    const m = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2)), e = Math.exp(-(end - i) / (0.015 * SR)) / m
    for (let j = 0; j < m; j++) dep(x0 + ((x1 - x0) * (j + 0.5)) / m, y0 + ((y1 - y0) * (j + 0.5)) / m, e)
  }
  const B = blur(E, S, H, 1), G = blur(B, S, H, 6)
  const lit = [...B].filter((v) => v > 0).sort((a, b) => a - b), ref = (lit[Math.floor(lit.length * 0.98)] || 1) * 0.5
  const img = Buffer.alloc(S * H * 3)
  for (let p = 0; p < S * H; p++) {
    const v = 1 - Math.exp(-(B[p] + 0.25 * G[p]) / ref), gx = p % S, gy = Math.floor(p / S), grid = gx % (S / 10) < 1 || gy % (H / 8) < 1 ? 0.07 : 0
    img[3 * p] = 255 * Math.min(1, 0.35 * v + grid + 0.6 * v * v * v), img[3 * p + 1] = 255 * Math.min(1, v + grid), img[3 * p + 2] = 255 * Math.min(1, 0.55 * v + grid + 0.5 * v * v * v)
  }
  return img
}
function blur(a, S, H, s) {
  const r = Math.ceil(2.5 * s), w = Array.from({ length: 2 * r + 1 }, (_, i) => Math.exp(-((i - r) ** 2) / (2 * s * s))), t = w.reduce((a, b) => a + b)
  const o = new Float32Array(a.length), o2 = new Float32Array(a.length)
  for (let y = 0; y < H; y++) for (let x = 0; x < S; x++) {
    let v = 0
    for (let i = -r; i <= r; i++) v += w[i + r] * a[y * S + Math.min(S - 1, Math.max(0, x + i))]
    o[y * S + x] = v / t
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < S; x++) {
    let v = 0
    for (let i = -r; i <= r; i++) v += w[i + r] * o[Math.min(H - 1, Math.max(0, y + i)) * S + x]
    o2[y * S + x] = v / t
  }
  return o2
}
// An RGB PNG: the rows unfiltered, deflated, in their chunks.
function png(rgb, w, h) {
  const crc = (b) => {
    let c = ~0
    for (const v of b) {
      c ^= v
      for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
    }
    return ~c >>> 0
  }
  const chunk = (type, data) => {
    const b = Buffer.alloc(12 + data.length)
    b.writeUInt32BE(data.length, 0), b.write(type, 4), data.copy(b, 8), b.writeUInt32BE(crc(b.subarray(4, 8 + data.length)), 8 + data.length)
    return b
  }
  const ihdr = Buffer.alloc(13), raw = Buffer.alloc(h * (1 + 3 * w))
  ihdr.writeUInt32BE(w, 0), ihdr.writeUInt32BE(h, 4), (ihdr[8] = 8), (ihdr[9] = 2)
  for (let y = 0; y < h; y++) rgb.copy(raw, y * (1 + 3 * w) + 1, y * 3 * w, (y + 1) * 3 * w)
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}

import { Beam } from './beam/beam'
import { Audio } from './audio/audio'
import { LOOK, Phosphor } from './gpu/phosphor'
import { Timeline } from './acts/timeline'
import { input, space, view, type Frame } from './acts/scene'
import { idle } from './acts/idle'
import { specimen } from './acts/specimen'
import { tune } from './acts/tune'
import { receive } from './acts/receive'
import { fall } from './acts/fall'

const canvas = document.querySelector('canvas')!
const q = new URLSearchParams(location.search)
const beam = new Beam()
const audio = new Audio()
const timeline = new Timeline(q.has('specimen') ? [specimen] : [tune, receive, fall])
const frame: Frame = { ch: [] }
const look = { ...LOOK }

const gpu = await Phosphor.create(canvas, beam.max).catch(() => {
  document.body.classList.add('no-gpu')
  throw new Error('WebGPU unavailable')
})

let on = q.has('auto')
let t = Number(q.get('t') ?? 0)
let speed = q.has('pause') ? 0 : 1
let last = performance.now()

function power() {
  if (on) return
  on = true
  audio.start().catch(() => {})
}

addEventListener('pointerdown', power)

// ?rec=<seconds>: record what the canvas shows and the speakers play; scripts/clip.mjs collects it.
if (q.has('rec')) {
  const w = window as unknown as { __chunk(b64: string): void; __done(): void }
  await audio.start()
  const tracks = [...canvas.captureStream(60).getVideoTracks(), ...audio.tap().getAudioTracks()]
  const rec = new MediaRecorder(new MediaStream(tracks), { mimeType: 'video/webm;codecs=vp9,opus', videoBitsPerSecond: 16e6 })
  rec.ondataavailable = (e) => {
    const r = new FileReader()
    r.onload = () => w.__chunk((r.result as string).split(';base64,')[1])
    r.readAsDataURL(e.data)
  }
  rec.onstop = () => setTimeout(() => w.__done(), 500)
  rec.start(1000)
  on = true
  setTimeout(() => rec.stop(), Number(q.get('rec')) * 1000)
}
addEventListener('pointermove', (e) => ((input.x = (2 * e.clientX) / innerWidth - 1), (input.y = 1 - (2 * e.clientY) / innerHeight)))
addEventListener('keydown', (e) => {
  if (!on) return power()
  const k = e.key
  if (k === ' ') speed = speed ? 0 : 1
  else if (k === 'ArrowRight') t += 5
  else if (k === 'ArrowLeft') t = Math.max(0, t - 5)
  else if (k === 'm') audio.mute()
  else if (k >= '1' && k <= '9') t = timeline.starts[+k - 1] ?? t
})

// Quality governor. The display's own interval is the fastest recent frame (and no display is slower
// than 50 Hz, so a page that is slow from its first frame still knows it); when frames run long against
// it for half a second, shed load a tier: cap the beam, coarsen the glare, then render fewer pixels.
// Eight seconds of clean frames earn a tier back; falling straight back out of a tier doubles that wait.
// ?q=<tier> pins.
const TIERS = [
  { rate: Infinity, lo: 0, scale: 1 },
  { rate: 2.4e6, lo: 0, scale: 1 },
  { rate: 2.4e6, lo: 1, scale: 1 },
  { rate: 2.4e6, lo: 1, scale: 0.75 },
]
const hz = 1 / (Number(q.get('hz')) || Infinity) // ?hz=N steps the clock 1/N per frame, whatever the display does
const pin = q.get('q')
let tier = Math.min(TIERS.length - 1, Number(pin) || 0)
let interval = 1 / 50, ema = interval, strain = 0, patience = 2, climbed = false, warm = 60
const probe = globalThis as { __tier?: number; __device?: GPUDevice } // for scripts/fps.mjs
const tell = () => (probe.__tier = tier)
probe.__device = gpu.device
tell()

function govern(dt: number) {
  if (pin || !(dt > 0 && dt < 0.25) || warm-- > 0) return // startup and tab switches are not load
  interval = Math.min(1 / 50, dt, interval + (dt - interval) * 0.002)
  ema += (dt - ema) * 0.1
  strain = Math.max(-patience, strain + (ema > interval * 1.2 ? dt : -dt / 4))
  if (strain > 0.5 && tier < TIERS.length - 1) tier++, (patience *= climbed ? 2 : 1), (climbed = false)
  else if (strain <= -patience && tier > 0) tier--, (climbed = true)
  else return
  strain = 0, (ema = interval), tell() // judge the new tier on its own frames
}

function tick(now: number) {
  govern((now - last) / 1000)
  const dt = hz || Math.min(0.1, Math.max(1e-3, (now - last) / 1000))
  last = now
  if (on) t += dt * speed

  const Q = TIERS[tier]
  const dpr = Math.min(2, devicePixelRatio) * Q.scale, w = Math.round(innerWidth * dpr), h = Math.round(innerHeight * dpr)
  if (canvas.width !== w || canvas.height !== h) (canvas.width = w), (canvas.height = h)
  gpu.resize(w, h, Q.lo)
  view.a = canvas.width / canvas.height

  frame.ch.length = 0
  const voice = on ? timeline.build(t, frame) : (idle.build(now / 1000, frame), undefined)
  beam.rate = Math.min(Q.rate, frame.rate ?? 1.2e6)
  Object.assign(look, LOOK, frame.look)
  beam.frame(frame.ch, t - dt, dt)
  gpu.draw(beam, view.a, dt, look)

  if (on) for (let i = 0; i < space.length; i += 3) audio.place(i / 3, space[i], space[i + 1], space[i + 2])
  if (on) audio.feed(t, voice) // the voice is a function of time: it plays this frame's scene ahead
  requestAnimationFrame(tick)
}

requestAnimationFrame(tick)

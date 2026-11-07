import { Beam } from './beam/beam'
import { Audio } from './audio/audio'
import { LOOK, Phosphor } from './gpu/phosphor'
import { Timeline } from './acts/timeline'
import { input, space, view, type Frame } from './acts/scene'
import { idle } from './acts/idle'
import { specimen } from './acts/specimen'
import { hook } from './acts/hook'
import { meander } from './acts/meander'
import { valley } from './acts/valley'
import { ident } from './acts/ident'
import { finaleA } from './acts/finaleA'
import { wrap } from './acts/wrap'
import { indra } from './acts/indra'
import { stutter } from './acts/stutter'
import { ophanim } from './acts/ophanim'
import { ascii, CHARS } from './acts/ascii'
import { load } from './beam/font'
import { band, direct } from './band/band'
import { edit } from './acts/edit'
import { r01 } from './world/r01'

const canvas = document.querySelector('canvas')!
const q = new URLSearchParams(location.search)
const beam = new Beam()
const audio = new Audio()
// ?fall plays only the fall, from the lip of the falls on (the pool needs their history); ?ident and ?end the last stretch. ?band and deep
// links (/<project>, /qsl) skip the intro and land in the band.
const hole = finaleA // the finale: the cathedral falls in
// ?short: the transmission in about 25 s, each scene cut to its best stretch and played a little faster
const SHORT = [
  edit(hook, [[0.9, 5.3, 2.2]]),
  edit(meander, [[0, 3.3, 1.65]]),
  edit(valley, [[0, 11, 3.2], [15.3, 21.3, 2]]), // the opening and the flight, then straight to the falls landing
  edit(wrap, [[0, 2.5, 1.6]]),
  edit(ascii, [[0, 3.5, 2]]),
  edit(stutter, [[2, 6, 1]]), // the cuts as they are: they land on beats
  edit(hole, [[1.6, 8.2, 1.8]]),
  edit(ident, [[0, 7.2, 2]]),
  band,
]
const scenes = q.has('specimen')
  ? [specimen]
  : q.get('world') === 'r01'
    ? [r01]
    : direct()
      ? [band]
      : q.has('fall')
        ? [valley, wrap, ascii, indra, stutter, ophanim, hole]
        : q.has('ident')
          ? [ident]
          : q.has('end')
            ? [hole, ident, band]
            : q.has('short')
              ? SHORT
              : [hook, meander, valley, wrap, ascii, indra, stutter, ophanim, hole, ident, band]
const timeline = new Timeline(scenes)
const frame: Frame = { ch: [] }
const look = { ...LOOK }

const gpu = await Phosphor.create(canvas, beam.max).catch(() => {
  document.body.classList.add('no-gpu')
  throw new Error('WebGPU unavailable')
})

load('tech').then((face) => gpu.glyphs(face, CHARS)) // the raster's character generator

let on = q.has('auto') || q.has('world') || direct()
let t = Number(q.get('t') ?? (q.has('fall') ? 12 : 0))
let speed = q.has('pause') ? 0 : 1
let last = performance.now()
let heard = q.has('auto') || q.has('rec') //the speakers wait for a gesture; the band starts without one

function power() {
  if (heard) return
  on = heard = true
  audio.start().catch(() => {})
}

addEventListener('pointerdown', power)

// The way out, for whoever has somewhere to be: straight to the band, past everything before it.
const out = scenes.length > 1 && scenes.at(-1) === band ? timeline.starts[scenes.length - 1] : 0
const skip = document.querySelector<HTMLElement>('#skip')!, leave = skip.querySelector('button')!
leave.textContent = Math.random() < 0.5 ? 'I hate fun (skip)' : 'I have important things to do (skip)'
leave.onclick = () => (t = Math.max(t, out))

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
  else if (k === 'Escape') t = Math.max(t, out)
  else if (k >= '1' && k <= '9') t = timeline.starts[+k - 1] ?? t
})

// Quality governor. The display's own interval is the fastest recent frame (and no display is slower
// than 50 Hz, so a page that is slow from its first frame still knows it); when frames run long against
// it for half a second, shed load a tier: cap the beam, coarsen the glare, then render fewer pixels.
// Eight seconds of clean frames earn a tier back; falling straight back out of a tier doubles that wait.
// ?q=<tier> pins.
const TIERS = [
  { rate: Infinity, lo: 0, scale: 1, field: 0.5 },
  { rate: 2.4e6, lo: 0, scale: 1, field: 0.5 },
  { rate: 2.4e6, lo: 1, scale: 1, field: 0.375 },
  { rate: 2.4e6, lo: 1, scale: 0.75, field: 0.375 },
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
  const away = on && t < out
  if (skip.hidden === away) skip.hidden = !away

  const Q = TIERS[tier]
  const dpr = Math.min(2, devicePixelRatio) * Q.scale, w = Math.round(innerWidth * dpr), h = Math.round(innerHeight * dpr)
  if (canvas.width !== w || canvas.height !== h) (canvas.width = w), (canvas.height = h)
  gpu.resize(w, h, Q.lo)
  gpu.raster.scale = Q.field
  view.a = canvas.width / canvas.height

  frame.ch.length = 0
  const voice = on ? timeline.build(t, frame) : (idle.build(now / 1000, frame), undefined)
  beam.rate = Math.min(Q.rate, frame.rate ?? 1.2e6)
  Object.assign(look, LOOK, frame.look)
  beam.frame(frame.ch, t - dt, dt)
  gpu.draw(beam, view.a, dt, look, frame.field, dpr)

  if (on) for (let i = 0; i < space.length; i += 3) audio.place(i / 3, space[i], space[i + 1], space[i + 2])
  if (on) audio.feed(t, voice) // the voice is a function of time: it plays this frame's scene ahead
  requestAnimationFrame(tick)
}

requestAnimationFrame(tick)

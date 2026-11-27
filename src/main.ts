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
import { wrap } from './acts/wrap'
import { ascii, CHARS } from './acts/ascii'
import { tour } from './acts/tour'
import { reveal, named } from './acts/reveal'
import { load } from './beam/font'
import { edit } from './acts/edit'
import { ASCII, REVEAL, TOUR, VALLEY, WRAP } from './acts/clock'
import { r01 } from './world/r01'
import { attach, planet } from './world/planet'
import { deep } from './world/pages'

const canvas = document.querySelector('canvas')!
const q = new URLSearchParams(location.search)
const beam = new Beam()
const audio = new Audio()
// The transmission: the scope's opening, the valley and its falls, the whirlpool and its text, the tour through River's
// places, the climb out of the storm, the name, and the planet, which is the portfolio. ?fall plays it from the lip of
// the falls on (the pool needs their history); ?tour from the tour; ?reveal from the climb; ?ident the name. A deep
// link to a place (/<project>) skips it all and lands there.
const FILM = [hook, meander, valley, wrap, ascii, tour, reveal, named, planet]
// ?short: the transmission in about half the time, each scene cut to its best stretch and played a little faster
const SHORT = [
  edit(hook, [[0.45, 3.6, 1.6]]),
  edit(meander, [[0, 4.2, 2]]),
  edit(valley, [[0, 7, 2], [7, VALLEY, 1.3]]), // the valley quickly, the falls nearly as they are
  edit(wrap, [[0, WRAP, 1.3]]),
  edit(ascii, [[0, ASCII, 1.6]]),
  edit(tour, [[0, TOUR, 1.2]]),
  edit(reveal, [[0, REVEAL, 1.3]]),
  edit(named, [[0, ident.dur, 1.6]]),
  planet,
]
const from = (s: typeof hook) => FILM.slice(FILM.indexOf(s))
const scenes = q.has('specimen')
  ? [specimen]
  : q.get('world') === 'r01'
    ? [r01]
    : q.get('world') === 'planet' || deep() >= 0 // a deep link to a place: the world, there
      ? [planet]
      : q.has('fall')
        ? from(valley)
        : q.has('tour')
          ? from(tour)
          : q.has('reveal')
            ? from(reveal)
            : q.has('ident')
              ? from(named)
              : q.has('short')
                ? SHORT
                : FILM
const timeline = new Timeline(scenes)
const frame: Frame = { ch: [] }
const look = { ...LOOK }

const gpu = await Phosphor.create(canvas, beam.max).catch(() => {
  document.body.classList.add('no-gpu')
  throw new Error('WebGPU unavailable')
})

load('tech').then((face) => gpu.glyphs(face, CHARS)) // the raster's character generator
attach(gpu.device) // the planet's models start loading now, long before it is reached

let on = q.has('auto') || q.has('world') || deep() >= 0
let t = Number(q.get('t') ?? (q.has('fall') ? 7.5 : 0))
let speed = q.has('pause') ? 0 : 1
let last = performance.now()
let heard = q.has('auto') || q.has('rec') // the speakers wait for a gesture

function power() {
  if (heard) return
  on = heard = true
  audio.start().catch(() => {})
}

addEventListener('pointerdown', power)

// The way out, for whoever has somewhere to be: straight to the planet, past everything before it.
const out = scenes.length > 1 && scenes.at(-1) === planet ? timeline.starts[scenes.length - 1] : 0
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
  gpu.draw(beam, view.a, dt, look, frame.field, dpr, frame.drops, tier)

  if (on) for (let i = 0; i < space.length; i += 3) audio.place(i / 3, space[i], space[i + 1], space[i + 2])
  if (on) audio.feed(t, voice) // the voice is a function of time: it plays this frame's scene ahead
  requestAnimationFrame(tick)
}

requestAnimationFrame(tick)

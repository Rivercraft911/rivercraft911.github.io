import { Beam } from './beam/beam'
import { Audio } from './audio/audio'
import { LOOK, Phosphor } from './gpu/phosphor'
import { Timeline } from './acts/timeline'
import { view, type Frame } from './acts/scene'
import { idle } from './acts/idle'
import { wave } from './acts/wave'
import { xy } from './acts/xy'
import { knot } from './acts/knot'
import { nameScene } from './acts/name'
import { cwScene } from './acts/cw'
import { iqScene } from './acts/iq'
import { waterfall } from './acts/waterfall'
import { ascii } from './acts/ascii'

const canvas = document.querySelector('canvas')!
const q = new URLSearchParams(location.search)
const beam = new Beam()
const audio = new Audio()
const timeline = new Timeline([wave, xy, knot, nameScene, cwScene, iqScene, waterfall, ascii])
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
addEventListener('keydown', (e) => {
  if (!on) return power()
  const k = e.key
  if (k === ' ') speed = speed ? 0 : 1
  else if (k === 'ArrowRight') t += 5
  else if (k === 'ArrowLeft') t = Math.max(0, t - 5)
  else if (k === 'm') audio.mute()
  else if (k >= '1' && k <= '9') t = timeline.starts[+k - 1] ?? t
})

function tick(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000)
  last = now
  if (on) t += dt * speed

  const dpr = Math.min(2, devicePixelRatio), w = Math.round(innerWidth * dpr), h = Math.round(innerHeight * dpr)
  if (canvas.width !== w || canvas.height !== h) (canvas.width = w), (canvas.height = h)
  gpu.resize(w, h)
  view.a = canvas.width / canvas.height

  frame.ch.length = 0
  if (on) timeline.build(t, frame)
  else idle.build(now / 1000, frame)
  beam.rate = frame.rate ?? 1.2e6
  Object.assign(look, LOOK, frame.look)
  beam.frame(frame.ch, t - dt, dt)
  gpu.draw(beam, view.a, dt, now / 1000, look)

  if (on) audio.feed(t, timeline.build(t + 0.05, frame) || undefined)
  requestAnimationFrame(tick)
}

requestAnimationFrame(tick)

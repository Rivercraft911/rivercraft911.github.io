// World 01 · R-01, the raster. River's RGB raster laser projector, run as its firmware runs it, in a dark
// room. Every number is R-01's own: 320 × 120 at a 15 fps target is 1800 lines a second, one a facet of a
// 4-facet polygon, so 450 rev/s (27 000 RPM); the beam is on the wall for the middle 30 % of each 555 µs
// sweep, so 320 pixels take a 1.92 MHz pixel clock; the galvo steps the odd lines down, then the even
// lines back up (raster.c); each laser has four channels with binary-weighted currents, 16 levels.
//
// Time is the projector's own, slowed: it starts 48 000× slow, one pixel at a time, and spins up to real
// time, where the frame is whole. The raster (r01.wgsl) is the room, the mirrors, and the wall's light as
// a pure function of the scan; the beam is the laser light in the air, sampled at the projector's time.
// The speakers hear the facet sensor and the laser power, box-filtered to the audio rate.
import { Path } from '../beam/path'
import type { Fn } from '../beam/beam'
import { draw, tex } from '../beam/math'
import { R01 } from '../gpu/fields'
import type { Field } from '../gpu/raster'
import { aim, project, seen } from '../acts/reality'
import { TAU, glide, smooth, view, type Frame, type Scene } from '../acts/scene'
import { cover, panel, type Page } from './panel'

const NX = 320, NY = 120
const LINE = 1 / 1800 // s: one facet, one line
const W0 = 0.35, WIN = 0.3 // the beam is on the wall for the middle 30 % of a sweep
const D = 3, AW = (WIN * Math.PI) / 2, ET = 0.27, EB = -0.105, GX = 0.22, PA = 0.06 // as r01.wgsl

// The frame: 4-bit levels a laser, and per line the running sum of each laser's power, for the speakers.
const lv = new Uint8Array(NX * NY * 3)
const sum = new Float32Array(NY * (NX + 1) * 3) // [line][x][c]: power summed over pixels < x
const slot = new Float32Array(121 * 3) // power summed over the frame's slots before j
const mean = [0, 0, 0]
const field: Field = { shader: R01, k: 1, p: new Float32Array(32) }
let fresh = false

const lin = (v: number) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
fetch(`${import.meta.env.BASE_URL}media/r01/raster.png`)
  .then((r) => r.blob())
  .then(createImageBitmap)
  .then((b) => {
    const c = new OffscreenCanvas(NX, NY).getContext('2d')!
    c.drawImage(b, 0, 0, NX, NY)
    const px = c.getImageData(0, 0, NX, NY).data, bytes = new Uint8Array(NX * NY * 2)
    for (let i = 0; i < NX * NY; i++) {
      // quantised in linear light: the four binary-weighted currents sum to a power
      const r = Math.round(15 * lin(px[4 * i])), g = Math.round(15 * lin(px[4 * i + 1])), b = Math.round(15 * lin(px[4 * i + 2]))
      lv.set([r, g, b], 3 * i)
      bytes[2 * i] = 16 * r + g
      bytes[2 * i + 1] = 16 * b
    }
    for (let L = 0; L < NY; L++)
      for (let x = 0; x < NX; x++)
        for (let c = 0; c < 3; c++) sum[(L * (NX + 1) + x + 1) * 3 + c] = sum[(L * (NX + 1) + x) * 3 + c] + lv[(L * NX + x) * 3 + c] / 15
    for (let j = 0; j < NY; j++)
      for (let c = 0; c < 3; c++) slot[(j + 1) * 3 + c] = slot[j * 3 + c] + sum[(line(j) * (NX + 1) + NX) * 3 + c]
    for (let c = 0; c < 3; c++) mean[c] = slot[NY * 3 + c] / (NX * NY)
    field.rows = { data: bytes, at: 0, n: NY }
    fresh = true
  })

// The galvo's order: slot j of a frame paints line 1, 3, …, 119, then 118, 116, …, 0.
const line = (j: number) => (j < 60 ? 2 * Math.max(0, j) + 1 : 238 - 2 * Math.min(119, j))

// Laser power summed from the frame's top to q facets into it, each laser, in pixel-widths.
function energy(q: number, c: number) {
  const F = Math.floor(q / NY), j = Math.floor(q - F * NY), x = ((q - F * NY - j - W0) / WIN) * NX
  let e = F * slot[NY * 3 + c] + slot[j * 3 + c]
  if (x <= 0) return e
  const L = line(j), i = Math.min(NX, Math.floor(x)), row = L * (NX + 1) * 3
  e += sum[row + i * 3 + c]
  if (i < NX) e += (x - i) * (lv[(L * NX + i) * 3 + c] / 15)
  return e
}

// The slow motion, as log10 of projector seconds a second, keyed in scene seconds: one pixel at a time,
// then lines, then the frame, then real time. After the intro it breathes: real time, back down to see
// the lines, and up again, every PERIOD seconds.
const SLOW = [[0, -4.68], [6, -4.68], [11, -2.1], [19, -2.1], [25, 0], [45, 0], [49, -2.1], [59, -2.1], [65, 0]] as const
const LOOP = 25, PERIOD = 40
const CUM = [0]
for (let k = 1; k < SLOW.length; k++) CUM.push(CUM[k - 1] + span(k, SLOW[k][0]))
function span(k: number, t: number) {
  const [t0, l0] = SLOW[k - 1], [t1, l1] = SLOW[k], s0 = 10 ** l0, b = (Math.LN10 * (l1 - l0)) / (t1 - t0)
  return b ? (s0 * (Math.exp(b * (t - t0)) - 1)) / b : s0 * (t - t0)
}
const at = (t: number) => (t < LOOP ? t : LOOP + ((((t - LOOP) % PERIOD) + PERIOD) % PERIOD))
const Q0 = W0 + (WIN * 86) / NX // we tune in on the first line, at pixel 86
const speed = { s: 0 }
// Facets swept by scene time t (float64 throughout), and the speed then, in speed.s.
function scan(t: number) {
  const u = at(t), n = Math.round((t - u) / PERIOD), last = SLOW.length - 1
  let k = 1
  while (k < last && u >= SLOW[k][0]) k++
  const [t0, l0] = SLOW[k - 1], [t1, l1] = SLOW[k]
  speed.s = 10 ** (l0 + ((l1 - l0) * Math.min(1, Math.max(0, (u - t0) / (t1 - t0)))))
  const loop = CUM[last] - CUM[SLOW.findIndex((s) => s[0] === LOOP)]
  return Q0 + (CUM[k - 1] + span(k, Math.min(u, t1)) + n * loop) / LINE
}

// Where the beam is at scan q: on the facet (H), on the wall (W), its colour, and whether it is on.
const B = { on: false, hx: 0, hy: 0, wx: 0, wy: 0, r: 0, g: 0, b: 0, e: 0 }
function beamAt(q: number) {
  const F = Math.floor(q / NY), j = Math.floor(q - F * NY), f = q - Math.floor(q), L = line(j)
  const h = (f - W0) / WIN, th = (Math.PI / 2) * (1 - f) // the facet's normal, azimuth from +z
  const e = (B.e = ET - ((L + 0.5) / NY) * (ET - EB))
  B.on = h >= 0 && h < 1
  // from the galvo along (−cos ε, sin ε, 0) to the facet's plane
  // (with the beam off, where it would land at the window's edge: the facet's far end is at infinity)
  const nx = Math.sin(Math.min(Math.max(th, 0.55), 1.02)), k = (PA - nx * GX) / (-nx * Math.cos(e))
  B.hx = GX - k * Math.cos(e), B.hy = k * Math.sin(e)
  if (!B.on) return (B.r = B.g = B.b = 0), B
  const a = AW - 2 * AW * h, i = Math.min(NX - 1, Math.floor(h * NX)), o = (L * NX + i) * 3
  B.wx = D * Math.tan(a)
  B.wy = (D * Math.tan(e)) / Math.cos(a)
  B.r = lv[o] / 15, B.g = lv[o + 1] / 15, B.b = lv[o + 2] / 15
  return B
}

// A segment on screen, cut where it passes behind the eye: its ends into C; false if none of it shows.
const C = [0, 0, 0, 0]
function clip(ax: number, ay: number, az: number, bx: number, by: number, bz: number) {
  const p = field.p, near = 0.03
  const da = (ax - p[0]) * p[12] + (ay - p[1]) * p[13] + (az - p[2]) * p[14]
  const db = (bx - p[0]) * p[12] + (by - p[1]) * p[13] + (bz - p[2]) * p[14]
  if (da < near && db < near) return false
  if (da < near || db < near) {
    const k = (near - da) / (db - da), x = ax + (bx - ax) * k, y = ay + (by - ay) * k, z = az + (bz - az) * k
    if (da < near) (ax = x), (ay = y), (az = z)
    else (bx = x), (by = y), (bz = z)
  }
  project(p, ax, ay, az), (C[0] = seen.x), (C[1] = seen.y)
  project(p, bx, by, bz), (C[2] = seen.x), (C[3] = seen.y)
  return true
}

// The fan: strokes from the facet to the wall, each at its own instant of the scan, ending in the spot.
// When a frame spans many lines, the strokes are spread over the windows alone: the dark 70 % is dark.
const STROKES = 300
let q0 = 0, dq = 0, k0 = -1
const S = { on: false, x0: 0, y0: 0, x1: 0, y1: 0, r: 0, g: 0, b: 0, dwell: 0.3 }
const fan: Fn = (_, s, u) => {
  const k = Math.floor(u * STROKES), a = u * STROKES - k
  if (k !== k0) {
    k0 = k
    let q = q0 + ((k + 0.5) / STROKES) * dq
    if (dq > 2) q = Math.floor(q) + W0 + WIN * (q - Math.floor(q))
    const b = beamAt(q)
    S.on = b.on && b.r + b.g + b.b > 0 && clip(b.hx, b.hy, 0, b.wx, b.wy, D)
    S.x0 = C[0], S.y0 = C[1], S.x1 = C[2], S.y1 = C[3]
    S.r = b.r, S.g = b.g, S.b = b.b
    S.on &&= Number.isFinite(S.x0 + S.y0 + S.x1 + S.y1 + S.r + S.g + S.b) // one NaN would scar the phosphor for good
    S.dwell = dq > 2 ? 0.05 : 0.35
  }
  const m = Math.min(1, Math.max(0, (a - 0.06) / (0.94 - S.dwell)))
  s.x = S.x0 + (S.x1 - S.x0) * m
  s.y = S.y0 + (S.y1 - S.y0) * m
  s.z = S.on ? 1 : 0
  s.r = S.r, s.g = S.g, s.b = S.b
}

// The fixed beams, lasers to facet, each at its power averaged over this frame.
const optics = new Path()
function seg(c: readonly number[], ...ps: number[][]) {
  if (!(c[0] + c[1] + c[2] > 0.002)) return // dark, or not a number
  optics.color(c[0], c[1], c[2], 1)
  for (let i = 1; i < ps.length; i++) {
    const [ax, ay, az] = ps[i - 1], [bx, by, bz] = ps[i]
    if (clip(ax, ay, az, bx, by, bz)) optics.moveTo(C[0], C[1]).lineTo(C[2], C[3])
  }
}
const avg = [0, 0, 0]

// The camera: [t, eye xyz, target xyz, fov]. The intro, then the loop's own path.
const INTRO = [
  [0, 0.36, 0.1, 0.32, 0.03, 0.02, 0.0, 0.62],
  [3.5, 0.27, 0.07, 0.25, 0.03, 0.02, 0.02, 0.62],
  [6.5, 0.2, 0.15, 0.5, -0.05, 0.5, 2.5, 0.8],
  [9.5, 0.35, 0.4, 1.6, 0.6, 0.75, 3, 0.8],
  [14, 0.9, 0.45, 0.6, 0.1, 0.35, 3, 0.95],
  [20, -0.55, 0.6, -1.5, 0.15, 0.2, 2, 0.9],
  [LOOP, 1.3, -0.35, 0.3, 0.05, 0.15, 1.6, 1.0],
]
const ORBIT = [
  [LOOP, 1.3, -0.35, 0.3, 0.05, 0.15, 1.6, 1.0],
  [LOOP + 9, 0.5, 0.2, 2.0, -0.1, 0.3, 3, 1.1],
  [LOOP + 17, -1.0, 0.5, 0.8, 0.1, 0.1, 0.5, 0.9],
  [LOOP + 24, 0.32, 0.12, 0.3, 0.02, 0.02, 0.04, 0.65],
  [LOOP + 29, 0.05, 0.25, 1.0, 0, 0.4, 3, 0.9],
  [LOOP + 34, -0.4, 0.6, -1.2, 0.2, 0.3, 2.5, 0.85],
  [LOOP + PERIOD, 1.3, -0.35, 0.3, 0.05, 0.15, 1.6, 1.0],
]
const cam = [0, 0, 0, 0, 0, 0, 0], fwd = [0, 0, 0], up = [0, 1, 0]

// The live equation: what the scan is doing now, with the values it is running on.
const eqp = new Path()
const vals = [0, 0, 0, 0]
function say(f: Frame, src: string, c: readonly number[]) {
  eqp.clear().color(c[0], c[1], c[2], 0.9)
  draw(eqp, tex(src), -view.a * 0.9, 0.86, 0.055, 0, 1, vals)
  f.ch.push({ w: 0.15, path: eqp })
}
const INK = [0.95, 0.9, 1]
// Which equation, until when: 0 the reflection, 1 the bits, 2 the line order, 3 the spin, 4 the pixel
// clock, 5 the wall. The intro by scene time, then the loop by its own.
const BEATS = [[5, 0], [11, 1], [19, 2], [LOOP, 3]] as const
const LOOPED = [[8, 4], [20, 5], [24, 3], [34, 2], [PERIOD, 3]] as const

const M = `${import.meta.env.BASE_URL}media/r01/`
const PAGE: Page = {
  name: 'R-01',
  what: 'An RGB raster laser projector. A spinning polygon mirror sweeps each line, a galvo steps the lines down: 320 × 120, in colour.',
  problem:
    'Paint a colour image with three lasers and two moving mirrors. At the 15 fps target that is 1800 lines a second, one per facet of a 4-facet polygon spinning at 27 000 RPM, and the beam is on the wall for only the middle 30 % of each 555 µs sweep: 320 pixels there is a 1.92 MHz pixel clock, out of a MangoPi’s GPIO, locked to the mirror.',
  built: [
    'The firmware. An IR sensor sees each facet go by; an interrupt clocks the mirror’s period and arms a timer for the instant the beam reaches the screen; then each of the 320 pixels goes out on its own absolute timestamp, so jitter never accumulates. The galvo steps odd lines down and even lines back up, so it never makes a big jump, and the framebuffers swap at the top.',
    'The laser driver: twelve iC-HG30 switches, four per laser, their currents set binary-weighted by MCP4728 DACs, so the enable pins are the colour. And the mechanics, in parametric CAD: 129 parts, 19 of them custom. With Amy, for CS107E.',
  ],
  proof: [
    '1.83 MHz',
    'The pixel loop, up from 637 kHz. Read each GPIO port once a line instead of once a pixel, and precompute every colour at boot into four port words, so a pixel is one lookup and four writes; then overclock. Measured over 32 000 palette writes through the real inner loop.',
  ],
  status: 'On demo day the polygon motor caught fire and the galvo never moved, so R-01 has not yet drawn a frame. This world is the one its firmware was written to paint. R-02 is planned.',
  media: [
    { src: `${M}polyspin.mp4`, alt: 'The polygon motor spinning up', video: true },
    { src: `${M}laser-driver.jpg`, alt: 'The laser driver boards: four switched channels per laser' },
    { src: `${M}blinktest.mp4`, alt: 'The blink test, one laser', video: true },
    { src: `${M}laser-brain.jpg`, alt: 'LaserBrain, the power and interface board for the MangoPi' },
    { src: `${M}cad.jpg`, alt: 'The CAD: optics, polygon and galvo on the aluminium plate, the boards below' },
  ],
  link: ['source on GitHub', 'https://github.com/Rivercraft911/R-01_Raster_Laser_Projector'],
}

let last = NaN, side = 0
export const r01: Scene = {
  dur: Infinity,
  build(t, f) {
    panel(PAGE)
    const dt = Math.min(0.1, Math.max(1e-3, t - last || 1 / 60))
    last = t

    // the scan, this frame
    const q = scan(t), s = speed.s
    q0 = scan(t - dt), dq = q - q0, k0 = -1
    const F = Math.floor(q / NY), qm = q - F * NY, b = beamAt(q)

    // the camera
    const u = at(t)
    glide(t < LOOP ? INTRO : ORBIT, u, cam)
    fwd[0] = cam[3] - cam[0], fwd[1] = cam[4] - cam[1], fwd[2] = cam[5] - cam[2]
    const p = field.p
    aim(p, cam, fwd, up, cam[6])
    // with the page open, the subject sits in the middle of what is left of the screen
    side += (cover() - side) * (1 - Math.exp(-4 * dt))
    const d = Math.hypot(fwd[0], fwd[1], fwd[2]) * Math.tan(cam[6] / 2) * side * view.a
    fwd[0] += d * p[4], fwd[1] += d * p[5], fwd[2] += d * p[6]
    aim(p, cam, fwd, up, cam[6])
    p[16] = qm, p[17] = F, p[18] = s / LINE, p[19] = 1.6
    p[20] = (Math.PI / 2) * (1 - (q - Math.floor(q))), p[21] = Math.min(Math.PI / 2, (Math.PI / 2) * dq)
    p[22] = b.e, p[23] = dq > 0.5 ? ET - EB : 0
    const lit = Math.min(1, (F * NY + qm) / NY)
    p[24] = mean[0] * lit * 1.6, p[25] = mean[1] * lit * 1.6, p[26] = mean[2] * lit * 1.6, p[27] = t % 64
    // each laser's power over this frame (or now, when the frame is a sliver of a facet)
    for (let c = 0; c < 3; c++) avg[c] = dq < 0.02 ? (c ? (c > 1 ? b.b : b.g) : b.r) : (energy(q, c) - energy(q0, c)) / (dq * (NX / WIN))
    p[28] = avg[0], p[29] = avg[1], p[30] = avg[2], p[31] = Q0
    if (!fresh) field.rows = undefined
    fresh = false
    f.field = field
    f.rate = 2e6

    // the light in the air
    optics.clear()
    seg([avg[0], 0, 0], [GX, 0, -0.85], [GX, 0, -0.62])
    seg([0, avg[1], 0], [GX + 0.12, 0, -0.62], [GX, 0, -0.62])
    seg([avg[0], avg[1], 0], [GX, 0, -0.62], [GX, 0, -0.42])
    seg([0, 0, avg[2]], [GX + 0.12, 0, -0.42], [GX, 0, -0.42])
    seg(avg, [GX, 0, -0.42], [GX, 0, 0], [b.hx, b.hy, 0])
    f.ch.push({ w: 0.35, path: optics }, { w: 1, fn: fan, gain: 1.2 })

    // the equation of the moment
    const beats = t < LOOP ? BEATS : LOOPED, x = t < LOOP ? t : u - LOOP
    let k = 0
    while (k < beats.length - 1 && x >= beats[k][0]) k++
    const beat = beats[k][1]
    if (beat === 0) {
      vals[0] = (180 / Math.PI) * (AW - (2 * AW * ((q % 1) - W0)) / WIN)
      say(f, '\\alpha=2\\varphi-90°=\\num{0}{-00.0}°', INK)
    } else if (beat === 1) {
      const L = line(Math.floor(qm)), i = Math.max(0, Math.min(NX - 1, Math.floor((((q % 1) - W0) / WIN) * NX))), o = (L * NX + i) * 3
      for (let k = 0; k < 4; k++) vals[k] = (lv[o + 1] >> k) & 1 // the green laser's four channels
      say(f, 'I_G=I_0(\\num{0}{0}+2\\cdot\\num{1}{0}+4\\cdot\\num{2}{0}+8\\cdot\\num{3}{0})', [0.45, 1, 0.55])
    } else if (beat === 2) {
      vals[0] = line(Math.floor(qm))
      say(f, 'n=1,3,5,\\ldots,119,118,\\ldots,2,0\\qquad n=\\num{0}{000}', INK)
    } else if (beat === 3) {
      vals[0] = 27000 * s, vals[1] = 1800 * s
      say(f, '\\Omega=\\num{0}{00000}\\,RPM\\qquad f_{line}=4\\,\\Omega/60=\\num{1}{0000}\\,Hz', INK)
    } else if (beat === 4) say(f, 'f_{px}=\\frac{320}{0.3\\cdot 555\\,\\mu s}=1.92\\,MHz', INK)
    else say(f, 'x=D\\,tan\\,\\alpha\\qquad y=\\frac{D\\,tan\\,\\epsilon}{cos\\,\\alpha}', INK)

    return voice
  },
}

// The speakers: the facet sensor (a tick a facet when slow, the facet rate's tone when fast) and the
// lasers' power, averaged over each sample's span of the scan, red left and blue right, DC blocked.
let aq = NaN, aT = NaN
const x1 = [0, 0], y1 = [0, 0], e0 = [0, 0, 0], pw = [0, 0, 0], ch = [0, 0]
const voice = (tt: number, o: { l: number; r: number }) => {
  const q = scan(tt), s = speed.s, rate = s / LINE // facets a second, heard
  const step = tt - aT > 0 && tt - aT < 1e-3
  for (let c = 0; c < 3; c++) {
    const e = energy(q, c)
    pw[c] = step && q > aq + 1e-12 ? (e - e0[c]) / ((q - aq) * (NX / WIN)) : NaN
    e0[c] = e
  }
  if (pw[0] !== pw[0]) beamAt(q), (pw[0] = B.r), (pw[1] = B.g), (pw[2] = B.b)
  aq = q, aT = tt
  ch[0] = pw[0] + 0.5 * pw[1], ch[1] = pw[2] + 0.5 * pw[1]
  const age = ((q % 1) * LINE) / s // seconds since the facet sensor fired
  const tick = 0.3 * Math.exp(-Math.max(0, age) / 0.002) * Math.sin(TAU * 2200 * age) * (1 - smooth(25, 60, rate))
  const tone = 0.16 * smooth(25, 200, rate) * (Math.sin(TAU * q) + 0.4 * Math.sin((TAU * q) / 4))
  for (let c = 0; c < 2; c++) {
    const y = ch[c] - x1[c] + 0.995 * y1[c]
    x1[c] = ch[c], y1[c] = y
  }
  o.l += 0.35 * y1[0] + tick + tone
  o.r += 0.35 * y1[1] + tick + tone
}

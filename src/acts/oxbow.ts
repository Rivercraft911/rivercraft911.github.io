// Cutoffs. Each loop's sinuosity keeps climbing (1/J₀(ω): at ω ≈ 2.2 its neighbours touch) until the
// neck breaks through. The river takes the shortcut and runs straight there again, and the stranded loop
// closes into an oxbow lake that relaxes round. A shorter river traced at the same speed is a higher
// tone, so every cutoff steps the pitch up. The courses the river has left glow on in the colours of
// Fisk's 1944 maps, each era its own. Real meanders lean downstream; Kinoshita's third harmonic skews them.
import { Path } from '../beam/path'
import { morph } from '../beam/morph'
import { WATER } from './meander'
import { TAU, clamp, lock, mix, smooth, view, type Scene } from './scene'

const N = 900
const LOOPS = 3
const JS = 0.03, JF = 0.012 // Kinoshita skewness and flatness
const CUT = 2.25 // sinuosity at which a neck breaks
const SPEED = 55 * 2.6 // scene units per second the speakers run the river: 55 Hz at the start
export const FISK = [[1, 0.45, 0.62], [0.35, 0.6, 1], [1, 0.82, 0.3], [0.45, 1, 0.6]] as const

// Each loop's ω: climbing until its cutoff, then snapping straight and starting to wander again.
const CUTS = [3.4, 1.5, 5.6] // when each loop breaks through
const loopOmega = (j: number, t: number) => {
  const c = CUTS[j]
  return t < c ? mix(2.0, CUT, smooth(0, c, t) ** 0.8) : lock([[c, CUT], [c, 0.7], [c + 2.5, 1.3]], t, 6, 0.45)
}

// The heading at s ∈ [0, 1]: a sine-generated curve whose ω varies loop by loop, skewed.
function theta(s: number, t: number) {
  const x = s * LOOPS, j = Math.min(LOOPS - 1, Math.floor(x)), f = x - j
  const w = mix(loopOmega(j, t), loopOmega(Math.min(LOOPS - 1, j + (f > 0.5 ? 1 : 0)), t), smooth(0.85, 1, f) * 0.5)
  const k = TAU * x
  return w * Math.sin(k) + w ** 3 * (JS * Math.cos(3 * k) - JF * Math.sin(3 * k))
}

// The course at time t into xs, ys (screen units, fixed scale), returning its length.
let scale = 0
function course(t: number, xs: Float64Array, ys: Float64Array, A: number) {
  let x = 0, y = 0
  for (let i = 0; i < N; i++) {
    xs[i] = x, ys[i] = y
    const th = theta(i / (N - 1), t)
    x += Math.cos(th), y += Math.sin(th)
  }
  if (!scale) scale = (2 * A) / (x * 1.0) // the scale the meander left us with, then held
  for (let i = 0; i < N; i++) (xs[i] = xs[i] * scale - A), (ys[i] = (ys[i] - ys[0]) * scale)
  return N * scale
}

const xs = new Float64Array(N), ys = new Float64Array(N), gx = new Float64Array(N), gy = new Float64Array(N)
const live = new Path(), ghosts = new Path()
const lakes = CUTS.map(() => ({ loop: new Path(), round: new Path(), out: new Path(), made: false }))

// The stranded loop at the moment of cutoff, and the round lake it relaxes into.
function strand(j: number, A: number) {
  const L = lakes[j]
  course(CUTS[j], gx, gy, A)
  const a = Math.floor(((j + 0.12) / LOOPS) * (N - 1)), b = Math.ceil(((j + 0.88) / LOOPS) * (N - 1))
  let cx = 0, cy = 0, rx = 0, ry = 0
  for (let i = a; i <= b; i++) cx += gx[i], cy += gy[i]
  cx /= b - a + 1, cy /= b - a + 1
  for (let i = a; i <= b; i++) (rx = Math.max(rx, Math.abs(gx[i] - cx))), (ry = Math.max(ry, Math.abs(gy[i] - cy)))
  L.loop.clear().color(WATER[0], WATER[1], WATER[2], 0.8).moveTo(gx[a], gy[a])
  for (let i = a + 1; i <= b; i++) L.loop.lineTo(gx[i], gy[i])
  L.loop.lineTo(gx[a], gy[a])
  L.round.clear().color(0.5, 0.75, 1, 0.55).moveTo(cx + 0.8 * rx, cy)
  for (let i = 1; i <= 96; i++) L.round.lineTo(cx + 0.8 * rx * Math.cos((TAU * i) / 96), cy + 0.7 * ry * Math.sin((TAU * i) / 96))
  L.made = true
}

// A river as its centreline and two banks, current rolling downstream.
function draw(p: Path, x: Float64Array, y: Float64Array, t: number, c: readonly number[], i0: number, width: number) {
  for (const side of [0, -1, 1]) {
    for (let i = 0; i < N; i++) {
      const j = Math.min(N - 1, i + 1), h = Math.max(1, i - 1), dx = x[j] - x[h], dy = y[j] - y[h], n = Math.hypot(dx, dy) || 1
      const px = x[i] - (side * width * dy) / n, py = y[i] + (side * width * dx) / n
      const glow = side ? 0.35 : 0.65 + 0.35 * Math.cos(TAU * ((6 * i) / N - 0.9 * t))
      p.color(c[0], c[1], c[2], i0 * glow)
      i ? p.lineTo(px, py) : p.moveTo(px, py)
    }
  }
}

let length = 1, phase = 0, last = 0
export const oxbow: Scene = {
  dur: 9,
  build(t, f) {
    const A = view.a * 0.9, width = 0.018 * smooth(0, 3, t)
    length = course(t, xs, ys, A)
    draw(live.clear(), xs, ys, t, WATER, 1, width)
    f.ch.push({ w: 1, path: live })

    // The old courses, one per era, and the lakes the cutoffs left.
    ghosts.clear()
    for (let e = 0; e < 4; e++) {
      const te = e * 1.9
      if (t < te + 0.6) continue
      course(te, gx, gy, A)
      const c = FISK[e]
      draw(ghosts, gx, gy, te, c, 0.3 * smooth(te + 0.6, te + 1.6, t), 0)
    }
    f.ch.push({ w: 0.6, path: ghosts })
    lakes.forEach((L, j) => {
      if (t < CUTS[j]) return
      if (!L.made) strand(j, A)
      f.ch.push({ w: 0.25, path: morph(L.loop, L.round, clamp(lock([[0, 0], [CUTS[j] + 0.3, 1]], t, 3, 0.6), 0, 1.1), L.out, 400) })
    })

    return (tt, o) => {
      // run the river there and back at a constant speed: the shorter it gets, the higher it sings
      if (tt < last || tt - last > 0.2) phase = 0
      phase = (phase + ((tt - last) * SPEED) / length) % 2
      last = tt
      const u = phase < 1 ? phase : 2 - phase, fi = u * (N - 1), i = Math.min(N - 2, Math.floor(fi)), k = fi - i
      const s = 1 / A
      o.l = 0.85 * s * (xs[i] + (xs[i + 1] - xs[i]) * k)
      o.r = 1.4 * s * (ys[i] + (ys[i + 1] - ys[i]) * k)
    }
  },
}

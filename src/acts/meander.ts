// The wave becomes a river. The square wave stops being a height and becomes a heading: a river turns
// by θ(s) = ω·S(s) as it runs, so the square's flat tops become straight reaches and the trace folds
// into a zigzag. Then the harmonics let go, highest first, and the elbows round off into the curve
// real rivers follow, the sine-generated meander (Langbein & Leopold, 1966). Its tangent e^{iθ} is
// phase modulation with index ω, so as ω swells the loops swell and Bessel sidebands bloom in its sound.
// A second, longer bend joins it, and the line is the valley's river seen from above, where it lies.
import { Path } from '../beam/path'
import { morph } from '../beam/morph'
import { AMP, F, LAST, PERIODS, square } from './hook'
import { M1, M2, MAP, PHI, RIVER_EQ, W1, W2, glow, mapped } from './valley'
import { Say } from './say'
import { TAU, clamp, lock, mix, smooth, view, type Scene } from './scene'

const N = 900 // points along the reach
const ONES = new Float64Array(LAST + 1).fill(1)
const END = 3.5 // the valley picks up its current's phase from here
const FLOW = 55 // Hz: how fast the speakers run the river, there and back
export const WATER = [0.5, 0.78, 1] as const // Coe's lidar blue

// Harmonic k lets go of the heading, the highest first, quickening down to the fundamental.
const DROP = (k: number) => 0.4 + 1.6 * (1 - k / LAST) ** 2.2
const W = new Float64Array(LAST + 1)
function heading(t: number) {
  W[0] = 1
  for (let k = 1; k <= LAST; k++) W[k] = 1 - lock([[0, 0], [DROP(k), 1]], t, 12, 0.6)
}
const omega = (t: number) => lock([[0, 0.9], [1, 1.45], [2.1, W1]], t, 4.5, 0.75)
const second = (t: number) => W2 * smooth(1.8, 2.7, t)

// The reach: integrate the heading over the first MAP metres, then fit it to the screen.
const xs = new Float64Array(N), ys = new Float64Array(N)
function reach(w: number, w2: number, A: number) {
  let x = 0, y = 0, minx = 0, maxx = 0, miny = 0, maxy = 0
  for (let i = 0; i < N; i++) {
    const u = i / (N - 1), th = w * (Math.PI / 4) * square((u * PERIODS) / F, W) + w2 * Math.sin((TAU * u * MAP) / M2 + PHI)
    xs[i] = x, ys[i] = y
    x += Math.cos(th), y += Math.sin(th)
    minx = Math.min(minx, x), maxx = Math.max(maxx, x), miny = Math.min(miny, y), maxy = Math.max(maxy, y)
  }
  const k = Math.min((2 * A) / (maxx - minx), 1.5 / Math.max(1e-6, maxy - miny)), cx = (minx + maxx) / 2, cy = (miny + maxy) / 2
  for (let i = 0; i < N; i++) (xs[i] = (xs[i] - cx) * k), (ys[i] = (ys[i] - cy) * k)
}

// The river as a path, brightness rolling downstream like a current.
function river(p: Path, t: number) {
  p.clear()
  for (let i = 0; i < N; i++) {
    p.color(WATER[0], WATER[1], WATER[2], glow(i / (N - 1), t))
    i ? p.lineTo(xs[i], ys[i]) : p.moveTo(xs[i], ys[i])
  }
  return p
}

// The hook's last trace, as a path: three periods of the full square, steady on its trigger.
function trace(p: Path, A: number) {
  p.clear()
  for (let i = 0; i < N; i++) {
    const u = i / (N - 1), y = AMP * square((u * PERIODS) / F, ONES)
    i ? p.lineTo(mix(-A, A, u), y) : p.moveTo(-A, y)
  }
  return p
}

// The live equation: the square as a heading, then the two sines it leaves behind.
const SQ = '\\theta(s) = \\omega\\, \\frac{4}{\\pi} \\sum_{k=0}^{N} \\frac{\\sin((2k+1)\\, 2\\pi s / M_1)}{2k+1}'
// Sinuosity, channel length over valley length: 1/J₀(ω) for the sine-generated curve.
const j0 = (x: number) => {
  let s = 0, term = 1
  for (let m = 0; m < 12; m++) (s += term), (term *= -(x * x) / 4 / ((m + 1) * (m + 1)))
  return s
}
const eq = new Say()

const a = new Path(), b = new Path(), m = new Path(), map = new Path(), o = { x: 0, y: 0 }

// The river read back at u ∈ [0, 1], for the speakers.
function at(u: number) {
  const f = clamp(u) * (N - 1), i = Math.min(N - 2, Math.floor(f)), k = f - i
  o.x = xs[i] + (xs[i + 1] - xs[i]) * k, o.y = ys[i] + (ys[i + 1] - ys[i]) * k
  return o
}

export const meander: Scene = {
  dur: END,
  build(t, f) {
    const A = view.a * 0.9, fold = clamp(lock([[0, 0], [0.05, 1]], t, 8, 0.7), 0, 1.15)
    const w = omega(t), w2 = second(t), land = clamp(lock([[0, 0], [2.5, 1]], t, 7, 0.85), 0, 1.05)
    heading(t)
    reach(w, w2, A)
    let r = river(b, t)
    if (land > 0) r = morph(r, mapped(map, t), land, m, N) // registered onto the land it will run through
    f.ch.push({ w: 1, path: fold < 1 || t < 1 ? morph(trace(a, A), r, fold, m, N) : r })

    let n = 0
    for (let k = 0; k <= LAST; k++) if (W[k] > 0.5) n = k
    eq.say(f, t, n > 0 || t < 1.8 ? SQ : RIVER_EQ, WATER, n > 0 || t < 1.8
      ? [['\\omega', w, 2], ['N', n, 0], ['\\sigma', 1 / j0(w), 3]]
      : [['\\omega_1', w, 2], ['\\omega_2', w2, 2], ['M_1', M1, 0], ['M_2', M2, 0]])

    const hand = smooth(0.1, 0.9, t), s = 1 / (0.9 * view.a)
    return (tt, out) => {
      // the hook's sweep and square, handing over to the river run there and back
      const ph = ((tt * FLOW) % 1) * 2, p = at(ph < 1 ? ph : 2 - ph)
      out.l = mix(0.3 * (2 * (((tt * F) / PERIODS) % 1) - 1), 0.35 * p.x * s, hand)
      out.r = mix(0.9 * AMP * square(tt, ONES), 0.35 * p.y * s * 1.6, hand)
    }
  },
}

// The wave becomes a river. The square wave stops being a height and becomes a heading: a river turns
// by θ(s) = ω·S(s) as it runs, so the square's flat tops become straight reaches and the trace folds
// into a zigzag. Then the harmonics let go, highest first, and the elbows round off into the curve
// real rivers follow, the sine-generated meander (Langbein & Leopold, 1966). Its tangent e^{iθ} is
// phase modulation with index ω, so as ω climbs the loops swell and Bessel sidebands bloom in its sound.
import { Path } from '../beam/path'
import { morph } from '../beam/morph'
import { AMP, F, LAST, PERIODS, square } from './hook'
import { TAU, clamp, lock, mix, smooth, view, type Scene } from './scene'

const N = 900 // points along the reach
const ONES = new Float64Array(LAST + 1).fill(1)
const PACE = 1.5 // the meander's story runs this much faster than its clock
const END = 9 // its story time at the end
const FLOW = 55 // Hz: how fast the speakers run the river, there and back
export const WATER = [0.62, 0.86, 1] as const // Coe's lidar blue, white where it runs hot

// Harmonic k lets go of the heading, the highest first, quickening down to the fundamental.
const DROP = (k: number) => 1.2 + 2.4 * (1 - k / LAST) ** 2.2
const W = new Float64Array(LAST + 1)
function heading(t: number) {
  W[0] = 1
  for (let k = 1; k <= LAST; k++) W[k] = 1 - lock([[0, 0], [DROP(k), 1]], t, 10, 0.6)
}
export const omega = (t: number) => lock([[0, 0.9], [4.6, 1.3], [6.4, 1.6]], t, 3, 0.75)

// The reach: integrate the heading, then fit it to the screen. xs, ys hold it in screen units.
export const xs = new Float64Array(N), ys = new Float64Array(N)
export function reach(w: number, A: number) {
  let x = 0, y = 0, minx = 0, maxx = 0, miny = 0, maxy = 0
  for (let i = 0; i < N; i++) {
    const u = i / (N - 1), th = w * (Math.PI / 4) * square(u * PERIODS / F, W)
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
    const u = i / (N - 1), glow = 0.65 + 0.35 * Math.cos(TAU * (6 * u - 0.9 * t))
    p.color(WATER[0], WATER[1], WATER[2], glow)
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

const a = new Path(), b = new Path(), m = new Path(), o = { x: 0, y: 0 }

// The river as the meander leaves it, for the valley to grow out of.
export function last(p: Path) {
  heading(END)
  reach(omega(END), view.a * 0.9)
  return river(p, END)
}

// The river read back at u ∈ [0, 1], for the speakers.
function at(u: number) {
  const f = clamp(u) * (N - 1), i = Math.min(N - 2, Math.floor(f)), k = f - i
  o.x = xs[i] + (xs[i + 1] - xs[i]) * k, o.y = ys[i] + (ys[i + 1] - ys[i]) * k
  return o
}

export const meander: Scene = {
  dur: END / PACE,
  build(t, f) {
    t *= PACE
    const A = view.a * 0.9, fold = clamp(lock([[0, 0], [0.3, 1]], t, 5, 0.7), 0, 1.15)
    heading(t)
    reach(omega(t), A)
    const r = river(b, t)
    f.ch.push({ w: 1, path: fold < 1 || t < 1.5 ? morph(trace(a, A), r, fold, m, N) : r })
    const hand = smooth(0.2, 1.6, t), s = 1 / (0.9 * view.a)
    return (tt, out) => {
      // the hook's sweep and square, handing over to the river run there and back
      const ph = ((tt * FLOW) % 1) * 2, p = at(ph < 1 ? ph : 2 - ph)
      out.l = mix(0.3 * (2 * (((tt * F) / PERIODS) % 1) - 1), 0.85 * p.x * s, hand)
      out.r = mix(0.9 * AMP * square(tt, ONES), 0.85 * p.y * s * 1.6, hand)
    }
  },
}

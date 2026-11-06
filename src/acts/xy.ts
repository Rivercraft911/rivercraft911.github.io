// X-Y mode: the timebase is swapped for a second oscillator and the square wave folds into Lissajous figures.
import { Path } from '../beam/path'
import { text } from '../beam/font'
import { F, square } from './wave'
import { TAU, mix, smooth, view, type Scene } from './scene'

const W = TAU * F
const R = 0.62
const RATIOS = [[1, 1], [1, 2], [2, 3], [3, 4], [3, 2]]
const HOLD = 2, GLIDE = 0.7 // each stop holds, then glides to the next over the last GLIDE seconds
const glideAt = (i: number) => 1.6 + (i + 1) * HOLD - GLIDE
const label = new Path()

// ∫ multiplier dt for axis c (0 = x, 1 = y): integrating keeps the phase continuous through a glide.
function phase(c: number, t: number) {
  let p = RATIOS[0][c] * t
  for (let i = 0; i + 1 < RATIOS.length; i++) {
    const x = t - glideAt(i), k = x / GLIDE
    if (x <= 0) break
    p += (RATIOS[i + 1][c] - RATIOS[i][c]) * (k < 1 ? GLIDE * (k ** 3 - k ** 4 / 2) : x - GLIDE / 2)
  }
  return p
}
const ratio = (c: number, t: number) => (phase(c, t + 1e-3) - phase(c, t)) / 1e-3

const num = (v: number) => (Math.abs(v - Math.round(v)) < 0.005 ? (Math.round(v) === 1 ? '' : String(Math.round(v))) : v.toFixed(2))

export const xy: Scene = {
  dur: 12,
  build(t, f) {
    const A = view.a * 0.92, m = smooth(0, 1.6, t)
    const a = ratio(0, t), b = ratio(1, t), d = Math.PI / 2 + 0.9 * t
    const x = (tt: number) => Math.sin(W * phase(0, tt) + d)
    const y = (tt: number) => Math.sin(W * phase(1, tt))

    f.ch.push({
      w: 1,
      fn: (tt, s) => {
        const ph = ((tt * F) / 3) % 1
        s.x = mix((2 * ph - 1) * A, R * x(tt), m)
        s.y = mix(0.5 * square(tt, 21, 1), R * y(tt), m)
        if (ph > 0.985 && m < 0.5) s.z = 0
      },
    })

    label.clear()
    text(label, `x = sin(${num(a)}ωt + δ)`, -A, -0.76, 0.05)
    text(label, `y = sin(${num(b)}ωt)`, -A, -0.89, 0.05)
    text(label, `δ = ${(d % TAU).toFixed(2)}`, A, -0.89, 0.05, 1)
    text(label, 'X-Y', A, 0.86, 0.05, 1)
    f.ch.push({ w: 0.3, gain: 0.7, path: label.reveal(smooth(0.8, 2, t)) })
    f.look = { tau: 0.09 }
    return (tt, o) => ((o.l = mix(0, x(tt), m)), (o.r = mix(square(tt, 21, 1), y(tt), m)))
  },
}

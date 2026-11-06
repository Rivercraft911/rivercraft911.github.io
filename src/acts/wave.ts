// Power on: a hot dot, the trace stretching across, then a square wave assembled from its harmonics.
import { Path } from '../beam/path'
import { text } from '../beam/font'
import { TAU, hash, smooth, view, type Scene } from './scene'

export const F = 110 // Hz; everything in act zero is a harmonic of this
const W = TAU * F
const label = new Path()

// Odd harmonics present at scene time t, and how far the newest has faded in.
export function harmonics(t: number): [number, number] {
  const k = Math.max(0, (t - 4.5) / 0.75)
  return k >= 10 ? [21, 1] : [1 + 2 * Math.floor(k), smooth(0, 0.4, k % 1)]
}

// f(t) = Σ sin(nωt)/n over odd n, which converges to a square wave of height π/4.
export function square(t: number, N: number, fresh: number) {
  let s = 0
  for (let n = 1; n <= N; n += 2) s += (Math.sin(n * W * t) / n) * (n === N && n > 1 ? fresh : 1)
  return s
}

export const wave: Scene = {
  dur: 13,
  build(t, f) {
    const A = view.a * 0.92
    const width = smooth(0.5, 1.3, t), amp = 0.5 * smooth(1.6, 3.4, t)
    const [N, fresh] = harmonics(t)
    const y = (tt: number) => amp * square(tt, N, fresh)

    f.ch.push({
      w: 1,
      gain: t < 0.5 ? 0.15 + 2 * smooth(0, 0.5, t) : 1,
      fn: (tt, s) => {
        const ph = ((tt * F) / 3) % 1 // three periods per sweep, triggered on the rising zero crossing
        s.x = (2 * ph - 1) * A * width
        s.y = y(tt) + 0.004 * hash(tt * 1e6)
        if (ph > 0.985) s.z = 0
      },
    })
    label.clear()
    const x = -A, s = 0.05
    text(label, N > 1 ? 'f(t) = Σ sin(nωt) / n' : 'f(t) = sin(ωt)', x, -0.76, s)
    const ns = Array.from({ length: (N + 1) / 2 }, (_, i) => 2 * i + 1)
    text(label, 'n = ' + (ns.length > 5 ? `1, 3, 5, ..., ${N}` : ns.join(', ')), x, -0.89, s)
    text(label, `ω = 2π · ${F} Hz`, A, -0.89, s, 1)
    f.ch.push({ w: 0.3, gain: 0.7, path: label.reveal(smooth(2.2, 3.4, t)) })
    return (tt, o) => void (o.l = o.r = y(tt))
  },
}

// R3 · Indra. The prime bubbles burst into Indra's pearls: the Maskit Kleinian group's balls in upper
// half-space (indra.wgsl), grown a generation of the group at a time, each a soap film. We fall into the
// attracting fixed point of w = ab, where the group's picture repeats itself shrunk by |λ| and turned by
// arg λ: half a period per octave of the choir's descent, so the dive spirals forever and is a loop. On the
// floor the beam plays the chaos game: every sample one more random word of the group applied to a point
// of the limit set, so it lands on the limit set too, the dust the pearls shrink toward. The choir's period turns from the octave to φ, which never lines up (Tenney), and
// the rising choir is ring-modulated, its spectrum inverted, so it falls.
import { INDRA as SHADER } from '../gpu/fields'
import type { Field } from '../gpu/raster'
import { descent, place, sing } from './choir'
import { AT as R2, DUR as R2DUR } from './primes'
import { aim, equation, jump, project, seen, splice } from './reality'
import { TAU, mix, smooth, type Scene } from './scene'

export const AT = R2 + R2DUR
export const DUR = 9
const A = 1.95859, B = 0.0112 // the trace of a: a pearl necklace that spirals as it shrinks
const MU = { re: -B, im: A } // a(z) = μ + 1/z
const PER = 0.5 // periods of w per octave of descent

// w = ab = [[−iμ, −i(2μ + 1)], [−i, −2i]]: its fixed points z = (p − s ± √(tr² − 4)) / 2r, and the multiplier
// λ = 1/(r z + s)² at the attracting one, z₊.
type Z = [number, number]
const mul = (a: Z, b: Z): Z => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]]
const div = (a: Z, b: Z): Z => {
  const d = b[0] * b[0] + b[1] * b[1]
  return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]
}
const root = (a: Z): Z => {
  const m = Math.hypot(a[0], a[1])
  return [Math.sqrt((m + a[0]) / 2), Math.sign(a[1] || 1) * Math.sqrt((m - a[0]) / 2)]
}
const W = { p: [MU.im, -MU.re] as Z, r: [0, -1] as Z, s: [0, -2] as Z }
const TR: Z = [W.p[0] + W.s[0], W.p[1] + W.s[1]], D = root(((x: Z): Z => [x[0] - 4, x[1]])(mul(TR, TR)))
const PS: Z = [W.p[0] - W.s[0], W.p[1] - W.s[1]], R2X: Z = [2 * W.r[0], 2 * W.r[1]]
const fixed = [div([PS[0] + D[0], PS[1] + D[1]], R2X), div([PS[0] - D[0], PS[1] - D[1]], R2X)]
const mult = (z: Z) => {
  const d = mul(W.r, z)
  return div([1, 0], mul([d[0] + W.s[0], d[1] + W.s[1]], [d[0] + W.s[0], d[1] + W.s[1]]))
}
const [ZP, ZM] = Math.hypot(...mult(fixed[0])) < 1 ? fixed : [fixed[1], fixed[0]]
const LAMBDA = mult(ZP), SHRINK = Math.hypot(LAMBDA[0], LAMBDA[1]), TURN = Math.atan2(LAMBDA[1], LAMBDA[0])
const HALF = -0.5 / Math.log(SHRINK) // ln |q|² to powers of λ
const POWERS = Array.from({ length: 41 }, (_, i): Z => [SHRINK ** (i - 20) * Math.cos(TURN * (i - 20)), SHRINK ** (i - 20) * Math.sin(TURN * (i - 20))]) // λⁿ, n = −20 … 20

const field: Field = { shader: SHADER, k: 1, p: new Float32Array(28) }
const eye = [0, 0, 0], fwd = [1, 0, 0], up = [0, 0, 1]
const EQ = [0.85, 0.78, 1]

// The chaos game: a point of the limit set, walked by random words of the group.
const z = { re: 0, im: 0, last: 0, seed: 1 }
{
  // start on the fixed point of a: z² − μz − 1 = 0
  const dr = MU.re * MU.re - MU.im * MU.im + 4, di = 2 * MU.re * MU.im, m = Math.hypot(dr, di)
  const sr = Math.sqrt((m + dr) / 2), si = Math.sign(di) * Math.sqrt((m - dr) / 2)
  z.re = (MU.re + sr) / 2, z.im = (MU.im + si) / 2
}
function walk() {
  z.seed = (z.seed * 16807) % 2147483647
  const r = z.seed / 2147483647, k = Math.floor(r * 3) - 1 // a power of b first: −1, 0 or 1
  let g = (z.seed >> 4) & 1 // then a or a⁻¹, never straight back
  if (!k && g === (z.last ^ 1)) g ^= 1
  z.last = g
  const re = z.re + 2 * k, im = z.im
  if (g === 0) {
    const d = re * re + im * im
    z.re = MU.re + re / d, z.im = MU.im - im / d
  } else {
    const x = re - MU.re, y = im - MU.im, d = x * x + y * y
    z.re = x / d, z.im = -y / d
  }
  z.re -= 2 * Math.round(z.re / 2) // back into one period by a power of b: still on the limit set
}

export const indra: Scene = {
  dur: DUR,
  build(t, f) {
    const T = t + AT, kick = jump(t, f, true, 0.6), p = field.p
    const s0 = PER * (descent(T) - descent(AT)), f0 = s0 - Math.floor(s0)
    const k = SHRINK ** f0, c = Math.cos(TURN * f0), sn = Math.sin(TURN * f0), H = 1.2
    const ex = H * (0.12 + 0.06 * Math.sin(0.4 * t)), ey = H * 0.06 * Math.sin(0.3 * t), ez = H * mix(1.6, 1, smooth(0, 4, t))
    eye[0] = k * (c * ex - sn * ey), eye[1] = k * (sn * ex + c * ey), eye[2] = k * ez
    const fx = -0.12, fy = 0.08 * Math.sin(0.27 * t)
    fwd[0] = c * fx - sn * fy, fwd[1] = sn * fx + c * fy, fwd[2] = -1
    up[0] = c, up[1] = sn, up[2] = 0
    aim(p, eye, fwd, up, 1.25 + kick)
    p[16] = A, p[17] = B, p[18] = Math.min(12, 1 + Math.floor(t * 6)), p[19] = smooth(0, 0.3, t)
    p[20] = 0.4 * t, p[21] = 0.06, p[22] = k * H
    p[24] = ZM[0], p[25] = ZM[1], p[26] = ZM[0] - ZP[0], p[27] = ZM[1] - ZP[1]
    f.field = field

    // the limit set on the floor, a dot per walk, carried by a power of w to the scale we are falling at
    const near = k * H
    let lit = false, ok = false
    f.ch.push({
      w: 0.45 * smooth(1.5, 3, t),
      fn: (_, s) => {
        if ((lit = !lit)) {
          walk()
          let q = div([z.re - ZP[0], z.im - ZP[1]], [z.re - ZM[0], z.im - ZM[1]])
          const n = Math.round(Math.log((q[0] * q[0] + q[1] * q[1]) / (near * near)) * HALF)
          q = mul(q, POWERS[Math.max(0, Math.min(40, n + 20))])
          ok = project(p, q[0], q[1], 0)
          s.x = seen.x, s.y = seen.y, s.z = 0
          return
        }
        s.z = ok ? (0.6 * near) / (0.2 * near + seen.d) : 0
        s.r = 0.85, s.g = 0.8, s.b = 1
      },
    })
    equation(f, 'a(z)=\\mu+\\frac{1}{z}\\quad b(z)=z+2', EQ)
    f.rate = 2.4e6
    place(T)

    return (tt, o) => {
      if (splice(tt, o)) return
      sing(tt + AT, o, 1, { gold: smooth(0, 1.5, tt), prime: 1 - smooth(0, 1.5, tt) })
    }
  },
}

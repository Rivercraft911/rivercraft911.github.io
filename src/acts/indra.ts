// R3 · Indra. Down the drain into Indra's pearls: the Maskit Kleinian group's balls in upper half-space
// (pearls.wgsl), each a soap film, the text that read them eaten back by them. We fall into the
// attracting fixed point of w = ab, where the group's picture repeats itself shrunk by |λ| and turned by
// arg λ: half a period per octave of the choir's descent, so the dive spirals forever and is a loop. On the
// floor the beam plays the chaos game: every sample one more random word of the group applied to a point
// of the limit set, so it lands on the limit set too, the dust the pearls shrink toward. The choir's period turns from the octave to φ, which never lines up (Tenney), and
// the rising choir is ring-modulated, its spectrum inverted, so it falls.
import { INDRA as SHADER } from '../gpu/fields'
import type { Field } from '../gpu/raster'
import { descent, place, sing } from './choir'
import { AT as R1END } from './ascii'
import { A, B, GROUP, GROUP_INK, H, LENS, MU, PER, SHRINK, TURN, ZM, ZP, div, eye, fall, fwd, mul, up } from './drain'
import { aim, equation, project, seen } from './reality'
import { smooth, type Scene } from './scene'

export const AT = R1END // the choir's clock when this reality begins: as we come through the drain
export const DUR = 4.5
const HALF = -0.5 / Math.log(SHRINK) // ln |q|² to powers of λ
const POWERS = Array.from({ length: 41 }, (_, i): [number, number] => [SHRINK ** (i - 20) * Math.cos(TURN * (i - 20)), SHRINK ** (i - 20) * Math.sin(TURN * (i - 20))]) // λⁿ, n = −20 … 20

const field: Field = { shader: SHADER, k: 1, p: new Float32Array(28), res: 0.85 } // the films hide the softness; the march they paid for keeps the chains steady

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
    const T = t + AT, p = field.p // no jump: we come through the drain, on the camera that brought us
    const s0 = PER * (descent(T) - descent(AT)), k = fall(s0 - Math.floor(s0), t)
    aim(p, eye, fwd, up, LENS)
    p[16] = A, p[17] = B, p[18] = 14, p[19] = 1.2 // deeper: more of the limit set resolves
    p[20] = 0.4 * t, p[21] = 0.06, p[22] = k * H
    p[24] = ZM[0], p[25] = ZM[1], p[26] = ZM[0] - ZP[0], p[27] = ZM[1] - ZP[1]
    f.field = field

    // the limit set on the floor, a dot per walk, carried by a power of w to the scale we are falling at
    const near = k * H
    let lit = false, ok = false
    f.ch.push({
      w: 0.45 * smooth(1, 2.2, t),
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
    equation(f, GROUP, GROUP_INK)
    f.rate = 2.4e6
    place(T)

    return (tt, o) => sing(tt + AT, o, 1, { gold: smooth(0, 1.5, tt) })
  },
}

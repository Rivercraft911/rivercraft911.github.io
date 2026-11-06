// R2 · Primes on a helix. A jump, and the tube is wound with the integers, C to a turn (primes.wgsl): at
// C = 30 the primes keep to φ(30) = 8 spokes, an 8PSK seen end-on; C slides to the primorial 210 and its
// 48 spokes, then off every whole number, and the spokes wind into spiral arms. We fall from 1 at a pace
// of turns per octave of the choir's descent. Over it the beam traces ζ(½ + it) as an IQ spiral, through the
// tunnel's vanishing point at every zero. The zeros sound: each is a partial of a bell chord, struck as the
// spiral passes through nothing, and the chord swells wherever the zeros' own sum, −2 Σ cos(γ log x), says
// x is a prime: Riemann's explicit formula counting out 2, 3, 5, 7, 11 … as log x advances with the fall.
import { Path } from '../beam/path'
import { DT, TABLE, ZEROS } from '../dsp/zeta'
import { PRIMES as SHADER, SIEVE } from '../gpu/fields'
import type { Field } from '../gpu/raster'
import { ascii } from './ascii'
import { descent, place, sing } from './choir'
import { aim, equation, jump, splice } from './reality'
import { DUR as WRAP, LEAD } from './wrap'
import { TAU, mix, smooth, type Scene } from './scene'

export const AT = LEAD + WRAP + ascii.dur // the choir's clock when this reality begins
export const DUR = 9
const R = 1, L = 0.21 // the tube's radius, and one turn's length: at C = 30 the lattice is square
const TURNS = 6 // turns we fall per octave of descent

// The sieve, packed on the wheel of 30: bit b of byte k says whether 30k + RES[b] is prime.
const RES = [1, 7, 11, 13, 17, 19, 23, 29], BYTES = SIEVE[0] * SIEVE[1], N = 30 * BYTES
const wheel = new Uint8Array(BYTES)
{
  const odd = new Uint8Array(N >> 1) // odd n composite, at n >> 1
  for (let i = 3; i * i < N; i += 2) if (!odd[i >> 1]) for (let j = i * i; j < N; j += 2 * i) odd[j >> 1] = 1
  for (let k = 0; k < BYTES; k++) for (let b = 0; b < 8; b++) if (30 * k + RES[b] > 1 && !odd[(30 * k + RES[b]) >> 1]) wheel[k] |= 1 << b
}
let sent = false

// The winding: 30 to a turn, then the primorial 210, then Sacks' (β = ½, C = 1).
const SACKS = [5.4, 7.6]
const turn = (t: number) => 30 * 7 ** smooth(2.4, 4.4, t) * (1 / 210) ** smooth(SACKS[0], SACKS[1], t)
const beta = (t: number) => 1 - 0.5 * smooth(SACKS[0], SACKS[1], t)
const phi = (c: number) => {
  let r = c
  for (let p = 2, n = c; p <= n; p++) if (n % p === 0) for (r -= r / p; n % p === 0; ) n /= p
  return r
}

// The zeta spiral's height, rising with the fall.
const Z0 = 6, ZR = 6
const height = (t: number) => Z0 + ZR * t
const STRUCK = ZEROS.map((g) => (g - Z0) / ZR) // when the spiral passes through each zero

const field: Field = { shader: SHADER, k: 1, p: new Float32Array(24) }
const eye = [0, 0, 0], fwd = [0, 0, 1], up = [0, 1, 0]
const spiral = new Path()
const GOLD = [1, 0.72, 0.28], EQ = [0.7, 0.88, 1]

export const primes: Scene = {
  dur: DUR,
  build(t, f) {
    const T = t + AT, kick = jump(t, f), p = field.p
    const sway = 0.12 * smooth(0, 3, t)
    eye[0] = sway * Math.sin(0.5 * t), eye[1] = sway * Math.cos(0.37 * t)
    eye[2] = -1.4 + L * TURNS * (descent(T) - descent(AT))
    const roll = 0.08 * t
    up[0] = Math.sin(roll), up[1] = Math.cos(roll)
    fwd[0] = 0.04 * Math.sin(0.3 * t), fwd[1] = 0.04 * Math.cos(0.23 * t)
    aim(p, eye, fwd, up, 1.3 + kick)
    const C = turn(t), Ci = Math.round(C), whole = Math.abs(C - Ci) < 0.02 && t < SACKS[0]
    p[7] = R, p[11] = C, p[15] = L
    p[16] = smooth(0, 0.4, t), p[17] = smooth(7.8, 8.9, t), p[18] = whole ? Ci / phi(Ci) : 0, p[19] = whole ? Ci : 0
    p[20] = beta(t)
    field.rows = sent ? undefined : { data: wheel, at: 0, n: SIEVE[1] }
    sent = true
    f.field = field

    // ζ(½ + it) as I and Q, the last stretch of it brightest, its head a point
    const h = height(t), S = 0.2, a = Math.max(0, h - 30)
    spiral.clear()
    for (let s = a; s <= h; s += 0.04) {
      const i = 2 * Math.round(s / DT), k = (s - a) / (h - a || 1)
      spiral.color(GOLD[0], mix(GOLD[1], 0.95, k * k), mix(GOLD[2], 0.8, k * k), 0.15 + 0.85 * k * k)
      s === a ? spiral.moveTo(S * TABLE[i], S * TABLE[i + 1]) : spiral.lineTo(S * TABLE[i], S * TABLE[i + 1])
    }
    const i = 2 * Math.round(h / DT)
    spiral.color(1, 0.95, 0.85, 1).dot(S * TABLE[i], S * TABLE[i + 1], 0.04)
    f.ch.push({ w: 1, path: spiral })
    equation(f, '\\zeta(s)=\\sum n^{-s}=\\prod_p (1-p^{-s})^{-1}', EQ)
    f.rate = 2e6
    place(T)

    return (tt, o) => {
      if (splice(tt, o)) return
      const TT = tt + AT
      sing(TT, o, 1, { prime: smooth(0, 2, tt) })
      // x doubles with every octave of descent; −2 Σ cos(γ log x) peaks at the primes and their powers
      const u = Math.log(2) * (1 + descent(TT) - descent(AT))
      let pulse = 0, chord = 0, bell = 0
      for (let k = 0; k < ZEROS.length; k++) {
        const g = ZEROS[k], f0 = g * (110 / ZEROS[0])
        pulse -= 2 * Math.cos(g * u)
        chord += Math.sin(TAU * f0 * tt) / (1 + 0.15 * k)
        const age = tt - STRUCK[k]
        if (age > 0 && age < 4) bell += Math.exp(-age / 0.9) * Math.sin(TAU * 2 * f0 * age) * (1 - Math.exp(-age / 0.002))
      }
      const swell = Math.min(1, Math.max(0, (pulse - 4) / 11)) * smooth(0, 0.5, tt) * (1 - smooth(8.4, 9, tt))
      const v = 0.016 * swell * swell * chord
      o.l += v + 0.05 * bell, o.r += v + 0.05 * bell
    }
  },
}

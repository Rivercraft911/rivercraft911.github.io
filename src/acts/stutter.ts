// R4 · The multiverse stutter. Hard cuts, faster and faster, through six worlds, each a reality of its own
// with its own light and its own corruption of the choir, each still running while we are elsewhere: a
// kaleidoscopic IFS (ring-modulated), the Amazing Surface (through a comb), the Kaliset (granulated), a
// Lyapunov fractal on the DVB-S2 start-of-frame word (through the logistic map), Newton's method on 32APSK
// (every sample pair hard-decided to the constellation), and the {4,3,5} honeycomb (the choir run
// backwards, its fall reflected into a rise). The cuts accelerate from 1.9 s to a third of a second; only
// the slow ones flash, so there are never more than three flashes a second.
import type { Stereo } from '../audio/audio'
import { Path } from '../beam/path'
import { APSK32 } from '../dsp/dvbs2'
import { HONEYCOMB, KALISET, KIFS, LYAPUNOV, MANDALAY, NEWTON } from '../gpu/fields'
import type { Field } from '../gpu/raster'
import { descent, place, sing } from './choir'
import { AT as R3, DUR as R3DUR } from './indra'
import { aim, equation, jump, splice } from './reality'
import { TAU, hash, smooth, type Frame, type Scene } from './scene'

export const AT = R3 + R3DUR
export const DUR = 9
const SR = 48000

// When each cut lands, and which world it opens on.
const LENGTHS = [1.9, 1.4, 1.05, 0.8, 0.6, 0.45, 0.42, 0.38, 0.35, 0.34, 0.34, 0.34, 0.34, 0.34]
const STARTS = LENGTHS.map((_, i) => LENGTHS.slice(0, i).reduce((a, b) => a + b, 0))
const cut = (t: number) => {
  let i = 0
  while (i + 1 < STARTS.length && t >= STARTS[i + 1]) i++
  return i
}

type World = {
  shader: number
  eq: string
  ink: readonly number[]
  set(p: Float32Array, t: number, fall: number, kick: number): void
  beam?(f: Frame, t: number): void
  bend(tt: number, o: Stereo, from: number): void // mutates what the choir sang
}

const eye = [0, 0, 0], fwd = [0, 0, 1], up = [0, 1, 0]
const set3 = (a: number[], x: number, y: number, z: number) => ((a[0] = x), (a[1] = y), (a[2] = z), a)

// Per-voice delay lines for the stateful corruptions.
const LINE = 1 << 15, lines = [0, 1, 2].map(() => new Float32Array(LINE))
let w = 0
const remember = (o: Stereo) => {
  w = (w + 1) & (LINE - 1)
  for (let i = 0; i < 3; i++) lines[i][w] = o.s[i]
}
const past = (i: number, d: number) => lines[i][(w - d + LINE) & (LINE - 1)]
const combs = [0, 1, 2].map(() => new Float32Array(LINE)) // the comb's own output, fed back

const roots = new Path()

const WORLDS: World[] = [
  {
    shader: KIFS,
    eq: 'p\\to 3R|p|-2c',
    ink: [0.75, 1, 0.9],
    set(p, t, fall, kick) {
      aim(p, set3(eye, 0, 0, 2 * fall), set3(fwd, 0.05 * Math.sin(0.7 * t), 0.05 * Math.cos(0.5 * t), 1), set3(up, Math.sin(0.2 * t), Math.cos(0.2 * t), 0), 1.4 + kick)
      p[16] = 0.12 + 0.1 * Math.sin(0.31 * t), p[17] = 0.08 * Math.sin(0.23 * t + 1), p[18] = 1, p[19] = 2
    },
    bend(tt, o) {
      const c = Math.sin(TAU * 311 * tt)
      for (let i = 0; i < 3; i++) o.s[i] *= 2 * c
    },
  },
  {
    shader: MANDALAY,
    eq: 'p\\to s\\frac{B(p)}{\\min(|p|^2,1)}+c',
    ink: [1, 0.78, 0.4],
    set(p, t, fall, kick) {
      aim(p, set3(eye, -1.6 + 0.35 * fall, 0.3 + 0.2 * Math.sin(0.3 * t), -2.75), set3(fwd, 1, -0.25, 0.75), set3(up, 0, 1, 0), 1.3 + kick)
      p[16] = -1.5 - 0.04 * Math.sin(0.3 * t), p[17] = 1
    },
    bend(_, o) {
      // a comb on each voice: y[n] = x[n] + 0.9 y[n − D], tuned to A, C♯, E
      for (let i = 0; i < 3; i++) {
        const y = 0.7 * o.s[i] + 0.9 * combs[i][(w - Math.round(SR / [110, 138.6, 164.8][i]) + LINE) & (LINE - 1)]
        o.s[i] = combs[i][w] = y
      }
    },
  },
  {
    shader: KALISET,
    eq: 'p\\to\\frac{|p|}{p\\cdot p}-c',
    ink: [0.8, 0.6, 1],
    set(p, t, fall, kick) {
      const a = 0.3 * t
      aim(p, set3(eye, 0.5 + 0.2 * Math.sin(a), 0.3 * fall, fall), set3(fwd, 0.3 * Math.sin(0.4 * t), 0.3, 1), set3(up, Math.sin(0.1 * t), 1, 0), 1.2 + kick)
      p[16] = 0.53, p[17] = 0.53, p[18] = 0.53 + 0.02 * Math.sin(0.2 * t), p[19] = 1
      p[20] = 0.85, p[21] = 0.009
    },
    bend(tt, o) {
      // grains: four overlapping 50 ms windows, each replaying a random moment of the last quarter second
      const G = 2400, n = Math.round(tt * SR)
      for (let i = 0; i < 3; i++) {
        let y = 0
        for (let j = 0; j < 4; j++) {
          const ph = (n + (j * G) / 4) % G, k = Math.floor((n + (j * G) / 4) / G)
          const back = G + Math.floor((0.5 + 0.5 * hash(k * 13.1 + j * 7.7 + i)) * 9600)
          y += past(i, back - ph) * (0.5 - 0.5 * Math.cos((TAU * ph) / G))
        }
        o.s[i] = 0.9 * y
      }
    },
  },
  {
    shader: LYAPUNOV,
    eq: '\\lambda=\\frac{1}{N}\\sum\\ln|r_n(1-2x_n)|',
    ink: [1, 0.85, 0.35],
    set(p, t, _, kick) {
      const k = Math.exp(-0.1 * t) // zooming on a superstable star, where the dark curves cross
      p[16] = 3.22 - 0.07 * k, p[17] = 3.24 + 0.11 * k, p[18] = 0.5 * k * (1 + 0.5 * kick), p[19] = 1
    },
    bend(_, o) {
      // through the logistic map twice, at r just shy of 4
      for (let i = 0; i < 3; i++) {
        let x = Math.min(1, Math.max(0, 0.5 + 1.8 * o.s[i]))
        x = 3.9 * x * (1 - x)
        x = 3.9 * x * (1 - x)
        o.s[i] = 0.45 * (x - 0.5)
      }
    },
  },
  {
    shader: NEWTON,
    eq: "z\\to z-\\frac{p(z)}{p'(z)}",
    ink: [0.6, 1, 0.8],
    set(p, t, _, kick) {
      p[16] = 0.05 * Math.sin(0.3 * t), p[17] = 0.05 * Math.cos(0.2 * t), p[18] = 1.15 * (1 + kick), p[19] = 1
      p[20] = 0.25 * t
    },
    beam(f, t) {
      // the roots themselves, where the field's zoom puts them
      roots.clear()
      const ph = 0.25 * t, c = [0.05 * Math.sin(0.3 * t), 0.05 * Math.cos(0.2 * t)], k = 1.15
      for (let i = 0; i < APSK32.pts.length; i += 2) {
        const x = APSK32.pts[i], y = APSK32.pts[i + 1]
        const rx = x * Math.cos(ph) - y * Math.sin(ph), ry = x * Math.sin(ph) + y * Math.cos(ph)
        roots.color(1, 1, 1, 1).dot((rx - c[0]) / k, (ry - c[1]) / k, 0.03)
      }
      f.ch.push({ w: 0.3, path: roots })
    },
    bend(_, o) {
      // each pair of voices as I and Q, hard-decided to the nearest point of 32APSK
      const s = 0.22
      for (const [a, b] of [[0, 1], [2, 0]]) {
        const x = o.s[a] / s, y = o.s[b] / s
        let best = 0, bd = Infinity
        for (let k = 0; k < APSK32.pts.length; k += 2) {
          const d = (APSK32.pts[k] - x) ** 2 + (APSK32.pts[k + 1] - y) ** 2
          if (d < bd) (bd = d), (best = k)
        }
        o.s[a] = s * APSK32.pts[best]
        if (a === 0) o.s[b] = s * APSK32.pts[best + 1]
      }
    },
  },
  {
    shader: HONEYCOMB,
    eq: '\\{4,3,5\\}',
    ink: [0.8, 0.5, 1],
    set(p, t, fall, kick) {
      aim(p, eye, set3(fwd, 1, 0.15 * Math.sin(0.3 * t), 0.12 * Math.cos(0.2 * t)), set3(up, 0, Math.cos(0.15 * t), Math.sin(0.15 * t)), 1.5 + kick)
      p[16] = 1.0618 * (fall % 1), p[17] = 1
    },
    bend() {}, // the reflection is in when it sings, below
  },
]

const field: Field = { shader: KIFS, k: 1, p: new Float32Array(28) }

export const stutter: Scene = {
  dur: DUR,
  build(t, f) {
    const T = t + AT, i = cut(t), tc = t - STARTS[i], W = WORLDS[i % WORLDS.length]
    const kick = jump(tc, f, LENGTHS[i] >= 0.6, 0.3)
    const fall = descent(T) - descent(AT)
    field.p.fill(0)
    W.set(field.p, t, fall, kick)
    field.shader = W.shader
    f.field = field
    W.beam?.(f, t)
    equation(f, W.eq, W.ink)
    f.rate = 2e6
    place(T)

    return (tt, o) => {
      const j = cut(tt), from = STARTS[j], V = WORLDS[j % WORLDS.length]
      if (splice(tt - from, o)) return
      const TT = tt + AT
      sing(V.shader === HONEYCOMB ? 2 * (from + AT) - TT : TT, o, smooth(0, 0.03, tt - from), { gold: 1 })
      remember(o)
      V.bend(tt, o, from)
    }
  },
}

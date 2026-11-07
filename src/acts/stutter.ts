// R4 · The multiverse stutter. Hard cuts, faster and faster, through ten worlds, each a reality of its own
// with its own light and its own corruption of the choir, each still running while we are elsewhere: a
// kaleidoscopic IFS (ring-modulated), the Mandelbulb (through T_n, its own angle multiplication), the
// Amazing Surface (through a comb), a pseudo-Kleinian (played backwards, inverted in time), the Kaliset
// (granulated), an Apollonian packing (an octave up, a smaller copy of itself), a Lyapunov fractal on the
// DVB-S2 start-of-frame word (through the logistic map), a Sierpinski tetrahedron (gated by the gasket's
// own k & (k >> 3) rhythm), Newton's method on 32APSK (every sample pair hard-decided to the
// constellation), and the {4,3,5} honeycomb (the choir's descent reflected, its fall run back up). The
// first pass shows each world for a second down to 0.6 s, then they come round again faster, to a third
// of a second; only cuts of 0.6 s or more flash, so there are never more than two flashes a second.
// ?w=<n> pins world n, for review.
import type { Stereo } from '../audio/audio'
import { Path } from '../beam/path'
import { APSK32 } from '../dsp/dvbs2'
import { APOLLONIAN, BULB, HONEYCOMB, KALISET, KIFS, KLEINIAN, LYAPUNOV, MANDALAY, NEWTON, SIERPINSKI } from '../gpu/fields'
import type { Field } from '../gpu/raster'
import { descent, place, sing, type Mood } from './choir'
import { AT as R3, DUR as R3DUR } from './indra'
import { aim, equation, jump, splice } from './reality'
import { TAU, hash, smooth, type Frame, type Scene } from './scene'

export const AT = R3 + R3DUR
const SR = 48000

// When each cut lands, and which world it opens on.
const LENGTHS = [1.01, 0.95, 0.85, 0.78, 0.72, 0.68, 0.64, 0.6, 0.6, 0.6, 0.5, 0.46, 0.42, 0.4, 0.38, 0.36, 0.35, 0.34, 0.34, 0.34, 0.34, 0.34]
const STARTS = LENGTHS.map((_, i) => LENGTHS.slice(0, i).reduce((a, b) => a + b, 0))
export const DUR = STARTS[STARTS.length - 1] + LENGTHS[LENGTHS.length - 1]
const PIN = Number(new URLSearchParams(location.search).get('w') ?? -1)
const cut = (t: number) => {
  if (PIN >= 0) return PIN
  let i = 0
  while (i + 1 < STARTS.length && t >= STARTS[i + 1]) i++
  return i
}

type World = {
  shader: number
  eq: string | ((t: number) => string)
  mood?: Mood
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
const held = [0, 0, 0] // Newton's last decided symbol
let sym = 0
// After every bend: a soft clip and a gentle low-pass (about 6 kHz), so no corruption can turn into a
// full-scale screech, however loud the choir has grown; each keeps its character under the ceiling.
const tamed = new Float64Array(3)
const tame = (o: Stereo) => {
  for (let i = 0; i < 3; i++) {
    const x = o.s[i]
    o.s[i] = tamed[i] += (x / (1 + 2 * Math.abs(x)) - tamed[i]) * 0.55
  }
}

const roots = new Path()
const power = (t: number) => 7.5 + 1.5 * Math.sin(0.45 * t)

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
    shader: BULB,
    eq: (t) => `z\\to z^{${power(t).toFixed(1)}}+c`,
    ink: [0.75, 0.82, 1],
    mood: { gold: 1, prime: 1 },
    set(p, t, fall, kick) {
      const a = 0.25 * t, r = 1.8 - 0.4 * smooth(0, 13, t) - 0.05 * Math.sin(0.5 * fall)
      aim(p, set3(eye, r * Math.cos(a), 0.5 * Math.sin(0.3 * t), r * Math.sin(a)), set3(fwd, -Math.cos(a) + 0.4 * Math.sin(a), -0.3 * Math.sin(0.3 * t), -Math.sin(a) - 0.4 * Math.cos(a)), set3(up, 0.2 * Math.sin(0.2 * t), 1, 0), 1.2 + kick)
      p[16] = power(t), p[17] = 1
    },
    bend(_, o, from) {
      // the bulb's own move, angles times n, as a waveshaper: cos(n acos x), the Chebyshev polynomial T_n
      const n = power(from)
      for (let i = 0; i < 3; i++) o.s[i] = 0.25 * Math.cos(n * Math.acos(Math.max(-1, Math.min(1, o.s[i] / 0.25))))
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
    shader: KLEINIAN,
    eq: 'p\\to\\max(1,\\frac{k}{|p|^2})(2\\,\\clamp(p)-p)',
    ink: [0.6, 0.85, 1],
    mood: { gold: 0.5, dread: 0.3 },
    set(p, t, fall, kick) {
      aim(p, set3(eye, 0.1 * Math.sin(0.3 * t), 0.15 * fall, 0.05 * Math.cos(0.4 * t)), set3(fwd, 0.25 * Math.sin(0.2 * t), 1, 0.15 * Math.cos(0.25 * t)), set3(up, Math.sin(0.1 * t), 0, Math.cos(0.1 * t)), 1.4 + kick)
      p[16] = 0.808, p[17] = 1.167, p[18] = 0.70968, p[19] = 1
    },
    bend(tt, o) {
      // inversion, heard: overlapping grains of the last fifth of a second, played backwards
      const G = 9600, n = Math.round(tt * SR)
      for (let i = 0; i < 3; i++) {
        let y = 0
        for (let j = 0; j < 2; j++) {
          const ph = (n + (j * G) / 2) % G
          y += past(i, 2 * ph) * (0.5 - 0.5 * Math.cos((TAU * ph) / G))
        }
        o.s[i] = y
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
    shader: APOLLONIAN,
    eq: 'p\\to\\frac{s}{|p|^2}\\,p',
    ink: [1, 0.8, 0.7],
    mood: {},
    set(p, t, fall, kick) {
      const z = 0.4 * fall
      aim(p, set3(eye, 0.3 * Math.sin(0.4 * t), 0.35 + 0.1 * Math.cos(0.3 * t), z), set3(fwd, 0.4 * Math.sin(0.23 * t), -0.1, 1), set3(up, Math.sin(0.12 * t), 1, 0), 1.3 + kick)
      p[16] = 1.15 + 0.08 * Math.sin(0.2 * t), p[17] = 1
    },
    bend(tt, o) {
      // every sphere a smaller copy: the choir an octave up, read from its own past at twice the speed
      const G = 2400, n = Math.round(tt * SR)
      for (let i = 0; i < 3; i++) {
        let y = 0
        for (let j = 0; j < 2; j++) {
          const ph = (n + (j * G) / 2) % G
          y += past(i, G - ph) * (0.5 - 0.5 * Math.cos((TAU * ph) / G))
        }
        o.s[i] = y
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
    shader: SIERPINSKI,
    eq: 'p\\to 2Rp-(1,1,1)',
    ink: [0.5, 1, 0.65],
    mood: { gold: 1, dread: 0.5 },
    set(p, t, fall, kick) {
      const a = 0.2 * t, r = 1.7 - 0.7 * smooth(0, 13, t)
      aim(p, set3(eye, r * Math.cos(a), 0.6 + 0.3 * Math.sin(0.25 * t), r * Math.sin(a)), set3(fwd, -Math.cos(a), -0.3, -Math.sin(a)), set3(up, 0, 1, 0), 1.1 + kick)
      p[16] = 0.25 * Math.sin(0.17 * t + 0.5 * fall), p[17] = 0.2 * Math.cos(0.13 * t), p[18] = 1
    },
    bend(tt, o) {
      // the gasket as a rhythm: a 32nd sounds only where its count k has k & (k >> 3) = 0
      const k = Math.floor(tt * 24)
      if (k & (k >> 3)) for (let i = 0; i < 3; i++) o.s[i] *= 0.1
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
      // each pair of voices as I and Q, hard-decided to the nearest point of 32APSK, once a symbol (8
      // samples) and held between, so it steps like a modem, not hisses like noise
      const s = 0.22
      if (sym++ & 7) return void ((o.s[0] = held[0]), (o.s[1] = held[1]), (o.s[2] = held[2]))
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
      held[0] = o.s[0], held[1] = o.s[1], held[2] = o.s[2]
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
    bend() {}, // the reflection is in how it sings, below
  },
]

const field: Field = { shader: KIFS, k: 1, p: new Float32Array(28) }
const GOLD = { gold: 1 }, mirrored = { gold: 1, mirror: 0 }
const MIRROR = (at: number) => ((mirrored.mirror = at), mirrored)

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
    equation(f, typeof W.eq === 'string' ? W.eq : W.eq(t), W.ink)
    f.rate = 2e6
    place(T)

    return (tt, o) => {
      const j = cut(tt), from = STARTS[j], V = WORLDS[j % WORLDS.length]
      if (splice(tt - from, o)) return
      const TT = tt + AT
      sing(TT, o, smooth(0, 0.03, tt - from), V.shader === HONEYCOMB ? MIRROR(from + AT) : V.mood ?? GOLD)
      remember(o)
      V.bend(tt, o, from)
      tame(o)
    }
  },
}

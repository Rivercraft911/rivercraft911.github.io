// Tuning in. The tube degausses, the spot opens into one harmonic, and the whole screen condenses out of
// its own Fourier series: the name is one periodic signal x(t) + i·y(t), and the beam draws its partial
// sum as N climbs. The speakers play that same signal at 50 Hz, so the sound brightens exactly as the
// picture sharpens, until N passes what an ear can hear and only the eye keeps resolving. Then every
// term but one lets go, and what is left, c_1 e^{iω₀t}, is a carrier.
import { Path } from '../beam/path'
import { load, measure, text, use } from '../beam/font'
import { draw, eq, morphEq, roll, tex } from '../beam/math'
import { Series } from '../dsp/fourier'
import { TAU, clamp, lock, mix, smooth, view, type Scene } from './scene'

use(await load('tech')) // River's pick: EMS Tech, a drafting hand

const F0 = 50 // Hz: how often the speakers trace the screen
const EAR = Math.floor(20_000 / F0) // the last harmonic anyone can hear
const DEGAUSS = 0.7
const OPEN: [number, number][] = [[0, 0], [DEGAUSS, 1]]
// log₂ N: one harmonic, then doubling, each step locking in a little faster than the last.
const STEPS = [1.3, 1.9, 2.4, 2.85, 3.3, 3.7, 4.1, 4.5, 4.9, 5.3, 5.7]
const LOG_N: [number, number][] = [[0, 0], ...STEPS.map((t, i): [number, number] => [t, i])]
const T_LET = 8 // every term but c_1 lets go
const KEEP: [number, number][] = [[0, 1], [T_LET + 0.9, 0]]
LOG_N.push([T_LET, 0])

const EQ_SUM = tex('@lhs{x(t) + i\\,y(t)} = @sum{\\sum_{n=-N}^{N}} @c{c_n}\\, @e{e^{i n \\omega_0 t}}')
const EQ_ONE = tex('@lhs{x(t) + i\\,y(t)} = @c{c_1}\\, @e{e^{i \\omega_0 t}}')
const BINS = 72 // comb bins per side, log-spaced over n = 1 … 2^10

const see = new Series(4096) // what the beam draws
const hear = new Series(4096) // what the speakers play: the same sum, capped at hearing
const comb = new Float64Array(2 * BINS + 1)
const pic = new Path(), ink = new Path(), mid = eq()
const o = { x: 0, y: 0, z: 0 }, d = { x: 0, y: 0 }
let aspect = 0, scale = 1, nSee = -1, nHear = -1, kSee = -1, kHear = -1

// The screen as one closed path, its spectrum, and the comb of |c_n| in log bins.
function compose() {
  const name = 'RIVER DOWDY', size = Math.min(0.22, (1.6 * view.a) / measure(name, 1))
  pic.clear()
  text(pic, name, 0, -0.02, size, 0.5)
  text(pic, 'signals · silicon · light · orbit', 0, -0.2, 0.055, 0.5)
  see.load(pic)
  hear.load(pic)
  scale = 0.8 / Math.max(...Array.from(see.x.keys(), (i) => Math.abs(see.x[i])), 0.5)
  comb.fill(0)
  for (let n = 1; n <= 1024; n++) {
    const b = Math.min(BINS - 1, Math.floor((Math.log2(n) / 10) * BINS))
    comb[BINS + 1 + b] = Math.max(comb[BINS + 1 + b], see.mag(n))
    comb[BINS - 1 - b] = Math.max(comb[BINS - 1 - b], see.mag(-n))
  }
  comb[BINS] = see.mag(0)
  const top = Math.max(...comb)
  for (let i = 0; i < comb.length; i++) comb[i] = (comb[i] / top) ** 0.45
  aspect = view.a
  nSee = nHear = kSee = kHear = -1
}

// The degauss coil's decaying 60 Hz swing, seen as the spot shaking and heard as the thunk.
const degauss = (t: number, s: { x: number; y: number }) => {
  const e = 0.3 * Math.exp(-t / 0.16) * smooth(0, 0.02, t)
  s.x = e * Math.sin(TAU * 60 * t), s.y = 0.7 * e * Math.sin(TAU * 60 * t + 1.3)
}

export const tune: Scene = {
  dur: 11,
  build(t, f) {
    if (aspect !== view.a) compose()
    const N = 2 ** lock(LOG_N, t, 9, 0.6), keep = clamp(lock(KEEP, t, 4, 0.8), 0, 1.2)
    if (Math.abs(N - nSee) > 1e-3 || keep !== kSee) see.band(N, keep), (nSee = N), (kSee = keep)
    const Nh = Math.min(N, EAR)
    if (Math.abs(Nh - nHear) > 1e-3 || keep !== kHear) hear.band(Nh, keep), (nHear = Nh), (kHear = keep)
    const open = lock(OPEN, t, 12, 0.5)

    f.ch.push({
      w: 1,
      fn: (tt, s, u) => {
        if (tt < DEGAUSS) return degauss(tt, s)
        see.at(u, o)
        s.x = o.x * open, s.y = o.y * open
        s.z = mix(1, clamp(o.z * 1.15), smooth(1, 2, N) * keep)
      },
    })

    // The live math: the sum, the comb filling in term by term, the count of terms.
    const A = view.a, show = smooth(1.2, 2, t)
    ink.clear().intensity(show)
    const let_ = smooth(T_LET + 0.6, T_LET + 2, t)
    draw(ink, let_ > 0 ? morphEq(EQ_SUM, EQ_ONE, let_, mid) : EQ_SUM, 0, -0.52, 0.075, 0.5, show)
    const cw = A * 0.62, base = -0.9, gone = 1 - let_
    for (let i = 0; i < comb.length; i++) {
      const b = i - BINS, n = b && 2 ** ((Math.abs(b) - 0.5) * (10 / BINS))
      const lit = b === 1 ? 1 : clamp(N - n + 1) * gone, x = (b / BINS) * cw
      if (lit <= 0.01 || comb[i] < 0.02) continue
      ink.intensity(show * lit * (n > EAR ? 0.45 : 1)).moveTo(x, base).lineTo(x, base + 0.13 * comb[i])
    }
    if (gone > 0) {
      const ear = (Math.log2(EAR) / 10) * cw
      ink.intensity(0.35 * show * gone).moveTo(ear, base - 0.015).lineTo(ear, base + 0.16)
      text(ink, '20 kHz', ear + 0.02, base + 0.12, 0.03)
      ink.intensity(0.8 * show * gone)
      text(ink, '|c_n|', -cw - 0.05, base + 0.02, 0.04, 1)
      const nx = cw + 0.12 + text(ink, 'N = ', cw + 0.12, base + 0.02, 0.04)
      roll(ink, Math.round(Math.min(N, 1024)), nx, base + 0.02, 0.045, 0, 0, 0.8 * show * gone)
    }
    f.ch.push({ w: 0.3, gain: 0.8, path: ink })

    return (tt, out) => {
      if (tt < DEGAUSS) return degauss(tt, d), (out.l = 2.4 * d.x), void (out.r = 2.4 * d.y)
      hear.at(F0 * tt, o)
      const k = lock(OPEN, tt, 12, 0.5) * scale * 0.9
      out.l = o.x * k, out.r = o.y * k
    }
  },
}

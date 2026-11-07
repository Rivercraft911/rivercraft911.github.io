// Power-on and the hook. The tube degausses, the spot opens into a timebase, and a square wave builds
// itself out of odd harmonics on a quickening beat. Each one lands like a loop locking, overshooting
// and ringing before it settles, so the Gibbs ears flicker as the edges sharpen. A real scope in YT
// mode: L is the sweep, R is the signal.
import { GREEN } from '../beam/beam'
import { Say } from './say'
import { TAU, lock, mix, smooth, view, type Scene } from './scene'

export const F = 110 // Hz
export const PERIODS = 3 // periods per sweep
export const LAST = 50 // harmonics 1, 3, … 101
export const AMP = 0.42
const DEGAUSS = 0.7
const T1 = 0.9 // the fundamental arrives
const T_HARM = 1.4, T_FULL = 4.6 // the odd harmonics land between these, quickening
export const lands = (k: number) => (k ? T_HARM + (T_FULL - T_HARM) * (k / LAST) ** 0.55 : T1)

// Each harmonic's weight at time t: a step through an underdamped loop.
const W = new Float64Array(LAST + 1)
export function weights(t: number, w = W) {
  for (let k = 0; k <= LAST; k++) w[k] = t < lands(k) ? 0 : lock([[0, 0], [lands(k), 1]], t, 16, 0.3)
  return w
}

// The partial sum at time tt: (4/π) Σ w_k sin((2k+1)ωt) / (2k+1).
export function square(tt: number, w = W) {
  let s = 0
  for (let k = 0; k <= LAST; k++) if (w[k]) s += (w[k] * Math.sin(TAU * (2 * k + 1) * F * tt)) / (2 * k + 1)
  return (4 / Math.PI) * s
}

// Where the timebase is in its sweep, and whether it is retracing.
export const sweep = (tt: number) => ((tt * F) / PERIODS) % 1

// The degauss coil's decaying 60 Hz swing: the spot shakes and the speakers thunk.
export function degauss(t: number, o: { x: number; y: number }) {
  const e = 0.3 * Math.exp(-t / 0.16) * smooth(0, 0.02, t)
  o.x = e * Math.sin(TAU * 60 * t), o.y = 0.7 * e * Math.sin(TAU * 60 * t + 1.3)
}

// The live equation: the partial sum written out while it is short, then summed, N counting up.
const SIN = (n: number) => (n > 1 ? ` + \\frac{1}{${n}} \\sin ${n}\\omega t` : '\\sin \\omega t')
const SUM = (k: number) => (k < 0 ? 'y(t) = 0' : k > 3 ? 'y(t) = \\frac{4}{\\pi} \\sum_{k=0}^{N} \\frac{\\sin((2k+1)\\, \\omega t)}{2k+1}'
  : `y(t) = \\frac{4}{\\pi} (${[1, 3, 5, 7].slice(0, k + 1).map(SIN).join('')}${k === 3 ? ' + ...' : ''})`)
const eq = new Say()

const d = { x: 0, y: 0 }
export const hook: Scene = {
  dur: 5.3,
  build(t, f) {
    const A = view.a * 0.9, open = lock([[0, 0], [DEGAUSS, 1]], t, 9, 0.55)
    weights(t)
    let fresh = Infinity // time since the latest landing
    let N = -1
    for (let k = 0; k <= LAST && lands(k) <= t; k++) (fresh = t - lands(k)), (N = k)
    eq.say(f, t, SUM(N), GREEN, N < 0 ? [['t', t, 3]] : [['N', N, 0], ['f_N', (2 * N + 1) * F, 0], ['t', t, 3]])

    f.ch.push({
      w: 1,
      fn: (tt, s) => {
        if (tt < DEGAUSS) return degauss(tt, s)
        const ph = sweep(tt)
        s.x = open * mix(-A, A, ph)
        s.y = AMP * square(tt)
        s.z = ph > 0.985 ? 0 : 1 + 1.5 * Math.exp(-fresh / 0.05) // each landing flashes the trace
      },
    })
    return (tt, o) => {
      if (tt < DEGAUSS) return degauss(tt, d), (o.l = 2.4 * d.x), void (o.r = 2.4 * d.y)
      o.l = 0.3 * open * (2 * sweep(tt) - 1)
      o.r = 0.9 * AMP * square(tt)
    }
  },
}

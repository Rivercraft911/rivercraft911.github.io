// The singularity. Everything left of the fall streams inward on logarithmic spirals, and the beam
// draws what a gravitational-wave detector would hear from two bodies falling together: for a binary
// seen face-on the two polarizations h₊ and h× are a circle, its frequency sweeping up as (t_c − t)^−3/8
// and its amplitude as f^2/3. That is the only rising sound in the whole piece. At merger it rings down,
// a damped sinusoid, into the dot the oscilloscope powered on with, and the speakers fall silent.
import { TAU, clamp, hash, smooth, type Scene } from './scene'

const TC = 6 // merger
const F0 = 24 // Hz at the start of the inspiral
const FR = 250, DAMP = 0.12 // ringdown frequency and decay
const T0 = TC + 0.0001 // τ at t = 0 is TC

// Inspiral frequency f(τ) = F0 (TC / τ)^(3/8) with τ = TC − t; its phase, integrated in closed form.
const freq = (t: number) => Math.min(FR * 1.6, F0 * (T0 / Math.max(1e-3, TC - t)) ** 0.375)
const phase = (t: number): number => {
  if (t >= TC) return phase(TC - 1e-3) + TAU * FR * (t - TC)
  const tau = TC - t
  return TAU * F0 * T0 ** 0.375 * (T0 ** 0.625 - tau ** 0.625) / 0.625
}
const amp = (t: number) => (t < TC ? 0.06 * (freq(t) / F0) ** (2 / 3) : 0.06 * (FR * 1.6 / F0) ** (2 / 3) * Math.exp(-(t - TC) / DAMP))

const PAL = [[1, 0.85, 0.3], [0.1, 0.95, 0.9], [0.85, 0.7, 1], [0.45, 1, 0.62], [1, 0.25, 0.4], [0.5, 0.78, 1]]

export const singularity: Scene = {
  dur: 8,
  build(t, f) {
    const fall = smooth(0, 1, t) * (1 - smooth(TC - 1, TC, t))
    // the infall: arms of every colour the journey had, wound tighter as they go
    if (fall > 0)
      f.ch.push({
        w: 0.8 * fall,
        fn: (tt, s, u) => {
          const k = Math.floor(u * 90), a = u * 90 - k, c = PAL[k % PAL.length], seed = hash(k * 7.31)
          const age = (tt * (0.35 + 0.2 * (t / TC)) + 0.5 + 0.5 * seed) % 1, th = (k / 90) * TAU + 9 * age + 2 * a * (1 - age)
          const r = 1.4 * Math.exp(-3.2 * age) * (1 + 0.15 * a)
          s.x = r * Math.cos(th) * 1.4, s.y = r * Math.sin(th)
          s.r = c[0], s.g = c[1], s.b = c[2]
          s.z = a < 0.02 ? 0 : 0.5 * (1 - age) * (0.4 + age)
        },
      })
    // the chirp: h₊ and h× as x and y
    f.ch.push({
      w: 1,
      fn: (tt, s) => {
        const p = phase(tt), A = clamp(amp(tt), 0, 0.85)
        s.x = A * Math.cos(p), s.y = A * Math.sin(p)
        s.r = 1, s.g = 0.95, s.b = 0.85
        s.z = 0.4 + 0.8 * smooth(0, TC, tt)
      },
    })
    f.look = { tau: 0.08 }
    return (tt, o) => {
      const p = phase(tt), A = clamp(amp(tt), 0, 0.85)
      o.l = A * Math.cos(p), o.r = A * Math.sin(p)
    }
  },
}

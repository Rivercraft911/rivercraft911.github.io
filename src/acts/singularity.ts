// The singularity. A last jump, and a black hole hangs in the last world (hole.wgsl): the 24-cell, still
// turning, becomes its sky and is lensed into an Einstein ring around the shadow; a disk of the spectrum
// circles it, blue where it comes toward us. We fall in on a slow spiral while every world of the fall
// streams past us into it, arms of every colour the journey had, wound tighter as they go, and the
// choirs sing us down. Then the whole picture collapses into one point, and the beam draws what a
// gravitational-wave detector would hear from two bodies falling together: for a binary seen face-on
// the two polarizations h₊ and h× are a circle, its frequency sweeping up as (t_c − t)^−3/8 and its
// amplitude as f^2/3. That is the only rising sound in the whole piece. At merger it rings down, a damped
// sinusoid, into the dot the oscilloscope powered on with, and the speakers fall silent.
import { HOLE } from '../gpu/fields'
import type { Field } from '../gpu/raster'
import { place, sing } from './choir'
import { AT as R5, DUR as R5DUR, rotation, L, R } from './ophanim'
import { aim, equation, jump, splice } from './reality'
import { INKS } from './stutter'
import { TAU, clamp, hash, mix, smooth, type Scene } from './scene'

export const AT = R5 + R5DUR
const TC = 10 // merger
const FALL = 7.5 // the picture starts to collapse
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

const field: Field = { shader: HOLE, k: 1, p: new Float32Array(28) }
const eye = [0, 0, 0], fwd = [0, 0, 0], up = [0, 1, 0]
const look = { tau: 0.08 }

export const singularity: Scene = {
  dur: 13,
  build(t, f) {
    const T = t + AT, kick = jump(t, f, true, 0.6), p = field.p
    // a spiral in, from 24 M to 8, the disk tipping from below us to edge on
    const D = mix(24, 8, smooth(0, FALL + 1, t)), az = 0.5 + 0.12 * t, el = mix(0.3, 0.06, smooth(0, FALL, t))
    eye[0] = D * Math.cos(el) * Math.cos(az), eye[1] = D * Math.sin(el), eye[2] = D * Math.cos(el) * Math.sin(az)
    fwd[0] = -eye[0], fwd[1] = -eye[1], fwd[2] = -eye[2]
    aim(p, eye, fwd, up, 0.95 + kick)
    rotation(R5DUR + t)
    p[16] = L[0], p[17] = L[1], p[18] = L[2], p[19] = L[3]
    p[20] = R[0], p[21] = R[1], p[22] = R[2], p[23] = R[3]
    const z = Math.exp(1.6 * Math.max(0, t - FALL) ** 1.6) // the collapse: the picture shrinks to a point
    p[24] = 3 * t, p[25] = z, p[26] = Math.min(4, Math.sqrt(z)) * (z < 400 ? 1 : 0)
    if (p[26] > 0) f.field = field

    const fall = smooth(0, 1, t) * (1 - smooth(FALL - 0.5, FALL + 1.5, t)), rs = (Math.sqrt(27) / D) * p[3]
    // the infall: arms of every colour the journey had, wound tighter as they go, gone at the shadow's edge
    if (fall > 0)
      f.ch.push({
        w: 1.2 * fall,
        fn: (tt, s, u) => {
          const k = Math.floor(u * 90), a = u * 90 - k, c = INKS[k % INKS.length], seed = hash(k * 7.31)
          const age = (tt * (0.3 + 0.2 * (t / FALL)) + 0.5 + 0.5 * seed) % 1, th = (k / 90) * TAU + 9 * age + 2 * a * (1 - age)
          const r = 2 * Math.exp(-3.2 * age) * (1 + 0.15 * a)
          s.x = r * Math.cos(th) * 1.3, s.y = r * Math.sin(th) * 0.8
          s.r = c[0], s.g = c[1], s.b = c[2]
          s.z = a < 0.02 || r < rs ? 0 : (1 - age) * (0.4 + age) * smooth(rs, 1.5 * rs, r)
        },
      })
    // the chirp: h₊ and h× as x and y
    f.ch.push({
      w: 1,
      fn: (tt, s) => {
        const p = phase(tt), A = clamp(amp(tt), 0, 0.85)
        s.x = A * Math.cos(p), s.y = A * Math.sin(p)
        s.r = 1, s.g = 0.95, s.b = 0.85
        s.z = 0.05 + 1.15 * smooth(FALL - 1, TC, tt)
      },
    })
    const said = 1 - smooth(TC - 0.5, TC + 0.5, t)
    if (said > 0) equation(f, t < FALL ? "u''+u=3u^2" : 'f\\propto(t_c-t)^{-3/8}', [1, 0.9, 0.75], 0.9 * said)
    f.rate = 2e6
    f.look ??= look
    place(T)
    return (tt, o) => {
      const p = phase(tt), A = clamp(amp(tt), 0, 0.85)
      if (splice(tt, o)) return
      sing(tt + AT, o, 1 - smooth(FALL, TC, tt), { dread: 1 })
      o.l = A * Math.cos(p), o.r = A * Math.sin(p)
    }
  },
}

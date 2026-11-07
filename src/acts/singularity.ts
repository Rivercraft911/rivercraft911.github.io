// The singularity. A last jump, and a spinning black hole hangs in the aisle of a fractal nave (hole.wgsl),
// turning a disk of glowing gas, every ray of light bent as Kerr's metric bends it: the arches wrapped
// into rings round a D-shaped shadow, the far side of the disk lensed over the top of the hole and under
// it, and through the holes in the walls, bent into view, every world we fell through. Then we fall in: the horizon opens onto a Mandelbulb, and we fall into it as fast
// as the choir falls, a fractal with no bottom. Then the whole picture collapses into one point, and the
// beam draws what a gravitational-wave detector would hear from two bodies falling together: for a binary
// seen face-on the two polarizations h₊ and h× are a circle, its frequency sweeping up as (t_c − t)^−3/8
// and its amplitude as f^2/3. That is the only rising sound in the whole piece. At merger it rings down, a
// damped sinusoid, into the dot the oscilloscope powered on with, and the speakers fall silent.
import { HOLE } from '../gpu/fields'
import type { Field } from '../gpu/raster'
import { descent, place, sing } from './choir'
import { indra } from './indra'
import { ophanim, AT as R5, DUR as R5DUR } from './ophanim'
import { aim, equation, jump, splice } from './reality'
import { stutter } from './stutter'
import { TAU, clamp, mix, smooth, type Frame, type Scene } from './scene'

export const AT = R5 + R5DUR // 50 on the choir's clock; the collapse, AT + FALL, is choir.END
const OPEN = 6.5 // the horizon opens
const FALL = 10.5 // the picture starts to collapse
const TC = 13 // merger
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

// The hole spins: a = 0.94, and the gas's inner edge sits at the innermost
// stable circular orbit, Bardeen's r = 3 + Z₂ − √((3 − Z₁)(3 + Z₁ + 2Z₂)).
const SPIN = 0.94
const Z1 = 1 + Math.cbrt(1 - SPIN * SPIN) * (Math.cbrt(1 + SPIN) + Math.cbrt(1 - SPIN)), Z2 = Math.sqrt(3 * SPIN * SPIN + Z1 * Z1)
const ISCO = 3 + Z2 - Math.sqrt((3 - Z1) * (3 + Z1 + 2 * Z2))


// The worlds as their own scenes show them, for the raster to sweep into any shot it never took itself
// (when the fall was skipped).
function worlds() {
  const f: Frame = { ch: [] }, out: Field[] = []
  const has = (x?: Field) => !x || out.some((o) => o.shader === x.shader)
  const take = (s: Scene, t: number) => {
    f.ch.length = 0
    s.build(t, f)
    if (!has(f.field)) out.push({ ...f.field!, p: f.field!.p.slice() })
  }
  take(indra, 6)
  for (let t = 0; t < stutter.dur; t += 0.05) if ((stutter.build(t, f), !has(f.field))) take(stutter, t + 0.3)
  take(ophanim, 2.5)
  return out
}

const field: Field = { shader: HOLE, k: 1, p: new Float32Array(44) }
const eye = [0, 0, 0], fwd = [0, 0, 0], up = [0, 0, 1]
const look = { tau: 0.08 }
const DREAD = { dread: 1 }
// The bulb's camera closes on a point of its surface that stays rough at every scale (found by a search),
// along the ray that found it.
const AIM = [0.694737, 0.389077, 0.596482], INTO = [-0.7621, -0.1682, -0.6252], beye = [0, 0, 0], bup = [0, 0, 0]
const PER = 1.7 // octaves of the bulb's zoom per octave of the choir's descent

export const singularity: Scene = {
  dur: TC + 2,
  build(t, f) {
    field.bake ??= worlds() // before anything of ours: the other scenes' builds share the equation's path
    const T = t + AT, kick = jump(t, f, true, 0.6), p = field.p
    // a spiral in, round with the spin, from 22 M down to 4, rising off the disk as it nears
    const D = mix(22, 4, smooth(0.5, OPEN + 2.5, t) ** 1.3), az = 0.4 + 0.09 * t + 0.6 * smooth(3, OPEN + 3, t)
    const el = mix(0.12, 0.55, smooth(2, OPEN + 2.5, t))
    eye[0] = D * Math.cos(el) * Math.cos(az), eye[1] = D * Math.cos(el) * Math.sin(az), eye[2] = D * Math.sin(el)
    fwd[0] = -eye[0], fwd[1] = -eye[1], fwd[2] = -eye[2]
    aim(p, eye, fwd, up, 0.95 + kick)
    const z = Math.exp(1.6 * Math.max(0, t - FALL) ** 1.6) // the collapse: the picture shrinks to a point
    p[16] = 12 + 3 * t, p[17] = z, p[18] = Math.min(4, Math.sqrt(z)) * (z < 400 ? 1 : 0), p[19] = smooth(OPEN, OPEN + 1, t)
    p[20] = SPIN, p[21] = ISCO, p[22] = 0.25, p[23] = 1
    // the bulb, its zoom as fast as the choir falls
    const d = 1.4 * 2 ** (-PER * Math.max(0, descent(T) - descent(AT + OPEN))), w = 0.3 * t
    for (let i = 0; i < 3; i++) beye[i] = AIM[i] - d * INTO[i]
    bup[0] = Math.cos(w), bup[1] = -Math.cos(w), bup[2] = Math.sin(w) // rolling as it goes
    aim(p.subarray(24), beye, INTO, bup, 0.95 + kick)
    p[31] = 8, p[39] = 0.35
    p[40] = 2, p[41] = 0.3, p[42] = 50
    field.res = t < OPEN ? 1 : 0.75 // the bulb is dear, and smeared by the fall into it
    if (p[18] > 0) f.field = field

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
    if (said > 0) equation(f, t < OPEN ? 'H=\\frac{p^2-1-f(1+l\\cdot p)^2}{2}' : t < FALL ? 'z\\to z^8+c' : 'f=f_0(1-t/t_c)^{-3/8}', [1, 0.9, 0.75], 0.9 * said)
    f.rate = 2e6
    if (t > FALL) f.look ??= look // the chirp's long trail
    place(T)
    return (tt, o) => {
      const p = phase(tt), A = clamp(amp(tt), 0, 0.85)
      if (splice(tt, o)) return
      sing(tt + AT, o, 1, DREAD) // the choir cuts off itself at the collapse, choir.END
      o.l = A * Math.cos(p), o.r = A * Math.sin(p)
    }
  },
}

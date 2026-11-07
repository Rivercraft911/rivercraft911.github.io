// The singularity. A last jump, and a black hole hangs among every world we fell through (hole.wgsl): twelve
// rings, each the raster's own last frame of a world, lit in the order we fell, orbiting in planes of
// their own, lensed over and under the shadow and piled up in the photon ring; and the worlds again in
// the faces of a dodecahedral sky that the hole bends round itself. The beam draws light: a ray in each
// world's colour, solutions of the equation on screen, u″ + u = 3u², bent round the hole, the closest
// winding into it. Then the horizon opens: inside the shadow the whole picture repeats, shrunk and turned,
// and inside its shadow again, and we fall through it level by level as fast as the choir falls, a fractal
// with no bottom. Then the whole picture collapses into one point, and the beam draws what a
// gravitational-wave detector would hear from two bodies falling together: for a binary seen face-on
// the two polarizations h₊ and h× are a circle, its frequency sweeping up as (t_c − t)^−3/8 and its
// amplitude as f^2/3. That is the only rising sound in the whole piece. At merger it rings down, a damped
// sinusoid, into the dot the oscilloscope powered on with, and the speakers fall silent.
import { Path } from '../beam/path'
import { HOLE } from '../gpu/fields'
import type { Field } from '../gpu/raster'
import { descent, place, sing } from './choir'
import { indra } from './indra'
import { ophanim, AT as R5, DUR as R5DUR } from './ophanim'
import { aim, equation, jump, splice } from './reality'
import { INKS, stutter } from './stutter'
import { TAU, clamp, mix, smooth, view, type Frame, type Scene } from './scene'

export const AT = R5 + R5DUR // 57.5 on the choir's clock; the collapse, AT + FALL, is choir.END
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

// The hole spins: a = 0.94, its horizon at r₊ = 1 + √(1 − a²), and the gas's inner edge at the innermost
// stable circular orbit, Bardeen's r = 3 + Z₂ − √((3 − Z₁)(3 + Z₁ + 2Z₂)).
const SPIN = 0.94, RH = 1 + Math.sqrt(1 - SPIN * SPIN)
const Z1 = 1 + Math.cbrt(1 - SPIN * SPIN) * (Math.cbrt(1 + SPIN) + Math.cbrt(1 - SPIN)), Z2 = Math.sqrt(3 * SPIN * SPIN + Z1 * Z1)
const ISCO = 3 + Z2 - Math.sqrt((3 - Z1) * (3 + Z1 + 2 * Z2))

// Light, as the shader has it (hole.wgsl): H = ½ (|p|² − 1 − f (1 + l·p)²) in Kerr–Schild coordinates, here
// in the equatorial plane, where f = 2/r and l = (rx + ay, ry − ax) / (r² + a²). Each ray comes in from
// the left at impact parameter b, by RK4, to the horizon or back out, as x, y in M and the length along
// it, every fifth of an M. The light that orbits with the spin (below) can wind in to b = 6 cos(⅓ acos −SPIN)
// − SPIN before it is lost; against it (above), only to 6 cos(⅓ acos SPIN) + SPIN.
const kerr = (x: number, y: number, px: number, py: number, o: number[]) => {
  const r2 = x * x + y * y - SPIN * SPIN, r = Math.sqrt(r2), R2 = r2 + SPIN * SPIN, f = 2 / r
  const lx = (r * x + SPIN * y) / R2, ly = (r * y - SPIN * x) / R2, k = 1 + lx * px + ly * py
  const S = x * px + y * py, dL = S / R2 - (2 * r * (r * S + SPIN * (y * px - x * py))) / (R2 * R2), w = (f * k * dL - k * k / r2) / r
  o[0] = px - f * k * lx, o[1] = py - f * k * ly
  o[2] = w * x + (f * k * (r * px - SPIN * py)) / R2, o[3] = w * y + (f * k * (r * py + SPIN * px)) / R2
  return r
}
const BC = [6 * Math.cos(Math.acos(SPIN) / 3) + SPIN, 6 * Math.cos(Math.acos(-SPIN) / 3) - SPIN]
const RAYS = [0.48, 0.85, 0.98, 0.9985, 1.0008, 1.02, 1.1, 1.27, 1.54, 1.92, 2.5, 3.27].map((m, i) => {
  const out: number[] = [], k1 = [0, 0, 0, 0], k2 = [0, 0, 0, 0], k3 = [0, 0, 0, 0], k4 = [0, 0, 0, 0]
  const side = i % 2 ? -1 : 1
  let x = -40, y = side * m * BC[i % 2], s = 0
  // on the light cone: k² (1 − f L²) − 2 f L k − (1 + f) = 0, L = l·x̂
  const r0 = Math.sqrt(x * x + y * y - SPIN * SPIN), f = 2 / r0, L = (r0 * x + SPIN * y) / (r0 * r0 + SPIN * SPIN), qa = 1 - f * L * L
  let px = (f * L + Math.sqrt(f * f * L * L + qa * (1 + f))) / qa, py = 0
  for (let n = 0; n < 20000; n++) {
    const r = kerr(x, y, px, py, k1)
    if (r < RH + 0.01 || (r > 40 && x * k1[0] + y * k1[1] > 0)) break
    const h = Math.min(0.02 * (r - RH), 0.05 * r)
    kerr(x + (h / 2) * k1[0], y + (h / 2) * k1[1], px + (h / 2) * k1[2], py + (h / 2) * k1[3], k2)
    kerr(x + (h / 2) * k2[0], y + (h / 2) * k2[1], px + (h / 2) * k2[2], py + (h / 2) * k2[3], k3)
    kerr(x + h * k3[0], y + h * k3[1], px + h * k3[2], py + h * k3[3], k4)
    x += (h / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]), y += (h / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1])
    px += (h / 6) * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]), py += (h / 6) * (k1[3] + 2 * k2[3] + 2 * k3[3] + k4[3])
    if (r > 32) continue
    const j = out.length, d = j ? Math.hypot(x - out[j - 3], y - out[j - 2]) : 0
    if (j && d < 0.2) continue
    out.push(x, y, (s += d))
  }
  return out
})
const light = new Path()

// The rays at screen scale k, written on from the left at 30 M a second with pulses running down them.
function rays(k: number, t: number, i0: number) {
  light.clear()
  const front = 30 * t, W = view.a * 1.05
  RAYS.forEach((r, i) => {
    const c = INKS[(i + i0) % INKS.length]
    let pen = false
    for (let j = 0; j < r.length && r[j + 2] < front; j += 3) {
      const x = r[j] * k, y = r[j + 1] * k, ago = (front - r[j + 2]) % 14
      if (Math.abs(x) > W || Math.abs(y) > 1.05) {
        pen = false
        continue
      }
      light.color(c[0], c[1], c[2], 0.04 + Math.exp(-((ago - 1) ** 2) / 0.6))
      pen ? light.lineTo(x, y) : light.moveTo(x, y)
      pen = true
    }
  })
  return light
}

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
// The bulb's camera closes on a point of its surface, a crevice, along the ray that found it.
const AIM = [0.694737, 0.389077, 0.596482], INTO = [-0.7621, -0.1682, -0.6252], beye = [0, 0, 0], bup = [0, 0, 0]
const PER = 1.3 // octaves of the bulb's zoom per octave of the choir's descent

export const singularity: Scene = {
  dur: TC + 2,
  build(t, f) {
    field.bake ??= worlds() // before anything of ours: the other scenes' builds share the equation's path
    const T = t + AT, kick = jump(t, f, true, 0.6), p = field.p
    // a spiral in, dragged round with the spin, from 30 M down to 4, rising off the disk as it nears
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
    p[31] = 12, p[39] = 0.5
    p[40] = 2, p[41] = 0.3, p[42] = 50, p[43] = 0
    if (p[18] > 0) f.field = field

    const lit = smooth(0.6, 1.5, t) * (1 - smooth(OPEN - 1, OPEN + 0.3, t))
    if (lit > 0) f.ch.push({ w: 0.8 * lit, path: rays(p[3] / D, t - 0.6, 0) })
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

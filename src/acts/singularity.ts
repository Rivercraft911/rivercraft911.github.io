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
const PER = 0.45 // levels of the horizon per octave of the choir's descent
const PSI = 0.6 // each level turned by this much

// Inspiral frequency f(τ) = F0 (TC / τ)^(3/8) with τ = TC − t; its phase, integrated in closed form.
const freq = (t: number) => Math.min(FR * 1.6, F0 * (T0 / Math.max(1e-3, TC - t)) ** 0.375)
const phase = (t: number): number => {
  if (t >= TC) return phase(TC - 1e-3) + TAU * FR * (t - TC)
  const tau = TC - t
  return TAU * F0 * T0 ** 0.375 * (T0 ** 0.625 - tau ** 0.625) / 0.625
}
const amp = (t: number) => (t < TC ? 0.06 * (freq(t) / F0) ** (2 / 3) : 0.06 * (FR * 1.6 / F0) ** (2 / 3) * Math.exp(-(t - TC) / DAMP))

// Light, as Binet has it: u″ = 3u² − u from u = 0, u′ = 1/b far off to the left, by RK4 in φ, to the
// horizon or back out. Each ray as x, y in M and the length along it, every fifth of an M.
const RAYS = [2.5, 4.4, 5.1, 5.19, 5.2, 5.3, 5.7, 6.6, 8, 10, 13, 17].map((b, i) => {
  const out: number[] = [], acc = (u: number) => 3 * u * u - u, h = 0.004, side = i % 2 ? -1 : 1
  let u = 0, w = 1 / b, phi = 0, s = 0
  while (phi < 6 * Math.PI && u >= 0 && u < 0.5) {
    const k1 = w, l1 = acc(u), k2 = w + (h / 2) * l1, l2 = acc(u + (h / 2) * k1)
    const k3 = w + (h / 2) * l2, l3 = acc(u + (h / 2) * k2), k4 = w + h * l3, l4 = acc(u + h * k3)
    u += (h / 6) * (k1 + 2 * k2 + 2 * k3 + k4), w += (h / 6) * (l1 + 2 * l2 + 2 * l3 + l4), phi += h
    if (u < 1 / 32) continue
    const x = -Math.cos(phi) / u, y = (side * Math.sin(phi)) / u, n = out.length
    const d = n ? Math.hypot(x - out[n - 3], y - out[n - 2]) : 0
    if (n && d < 0.2 && u < 0.5) continue
    out.push(x, y, (s += d))
  }
  return out
})
const light = new Path()

// The rays at screen scale k, written on from the left at 30 M a second with pulses running down them.
function rays(k: number, t: number, i0: number) {
  light.clear()
  const front = 30 * t, A = view.a * 1.05
  RAYS.forEach((r, i) => {
    const c = INKS[(i + i0) % INKS.length]
    let pen = false
    for (let j = 0; j < r.length && r[j + 2] < front; j += 3) {
      const x = r[j] * k, y = r[j + 1] * k, ago = (front - r[j + 2]) % 14
      if (Math.abs(x) > A || Math.abs(y) > 1.05) {
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

const field: Field = { shader: HOLE, k: 1, p: new Float32Array(52) }
const eye = [0, 0, 0], fwd = [0, 0, 0], up = [0, 1, 0]
const look = { tau: 0.08 }
const DREAD = { dread: 1 }

export const singularity: Scene = {
  dur: TC + 2,
  build(t, f) {
    field.bake ??= worlds() // before anything of ours: the other scenes' builds share the equation's path
    const T = t + AT, kick = jump(t, f, true, 0.6), p = field.p
    // a spiral in, from 30 M to 10, always outside the rings
    const D = mix(30, 10, smooth(0, OPEN + 0.5, t)), az = 0.5 + 0.08 * t, el = mix(0.4, 0.18, smooth(0, OPEN, t))
    eye[0] = D * Math.cos(el) * Math.cos(az), eye[1] = D * Math.sin(el), eye[2] = D * Math.cos(el) * Math.sin(az)
    fwd[0] = -eye[0], fwd[1] = -eye[1], fwd[2] = -eye[2]
    aim(p, eye, fwd, up, 0.95 + kick)
    // the shadow's edge on screen, as a static observer at D sees it: sin α = (√27 / D) √(1 − 2/D)
    const r1 = p[3] * Math.tan(Math.asin((Math.sqrt(27) / D) * Math.sqrt(1 - 2 / D)))
    const z = Math.exp(1.6 * Math.max(0, t - FALL) ** 1.6) // the collapse: the picture shrinks to a point
    p[16] = 8 * t, p[17] = z, p[18] = Math.min(4, Math.sqrt(z)) * (z < 400 ? 1 : 0), p[19] = smooth(OPEN, OPEN + 1, t)
    p[20] = t > OPEN ? PER * (descent(T) - descent(AT + OPEN)) : 0
    p[21] = Math.max(0.9, Math.log((Math.hypot(view.a, 1) + 0.15) / r1)), p[22] = PSI, p[23] = 0.8 * r1
    // ring i, world i: lit in the order we fell, then spiralling down toward the photon sphere, where
    // its light is redshifted away into the photon ring
    const sink = 1 - 0.55 * smooth(2.5, OPEN + 0.5, t)
    for (let i = 0; i < 12; i++) {
      p[24 + i] = 3 + (1 + 0.55 * i) * sink
      p[36 + i] = smooth(0.2 + 0.2 * i, 0.5 + 0.2 * i, t)
    }
    p[48] = 0.012, p[49] = 0.3
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
    if (said > 0) equation(f, t < OPEN ? "u''+u=3u^2" : t < FALL ? 'z\\to Ke^{i\\psi}z' : 'f=f_0(1-t/t_c)^{-3/8}', [1, 0.9, 0.75], 0.9 * said)
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

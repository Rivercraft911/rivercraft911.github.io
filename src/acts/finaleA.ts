// The finale, take A: the cathedral falls in. R5's Julia set, as its last frame showed it, is still on
// screen when a hole opens in the middle of it (holeA.wgsl) and bends it into a ring, and it falls in,
// turning, and behind it is a cathedral without end, a pseudo-Kleinian lit by the hole's fire, its arches
// wrapped into Einstein rings round a black shadow and a blazing photon ring. Then the cathedral itself is
// torn in: every stone drawn from where it fell from, spaghettified, wound round the hole by the shear of
// its orbits into a maelstrom, glowing as it heats. And we fall: from rest, on an orbit with angular
// momentum L = 3.5M, short of the 4M that would save us, so it winds round as it plunges, faster and
// faster, across the photon ring, to the horizon. One flash, silence, and the dot the oscilloscope
// powered on with.
// The ring is drawn by the beam as well, and is a signal: what a gravitational-wave detector would hear
// from what spirals in, h₊ and h× seen face-on, a circle sweeping up in frequency as (t_c − t)^−3/8 and
// in strength as f^1/3, climbing with the choir's swell to the cut. The speakers play it, h₊ left, h×
// right.
import { HOLEA, JULIA4, WORLDS } from '../gpu/fields'
import type { Field } from '../gpu/raster'
import { room } from '../audio/audio'
import { place, sing } from './choir'
import { PEAK, R6 as AT } from './clock' // PEAK: the horizon, one flash, then silence; the cut is AT + PEAK, with choir.END just past it
import { ophanim } from './ophanim'
import { aim, equation, jump } from './reality'
import { TAU, clamp, hash, mix, smooth, type Frame, type Scene } from './scene'

const DOT = PEAK + 0.7 // and the dot

// The hole opens: its mass grows from nothing to M = 1.
const mass = (t: number) => smooth(0, 0.7, t)
// The Julia set falls in, turning faster as it shrinks, as water down a drain.
const SW0 = 0.3, SW1 = 1.7
// The world torn in: K, the infall that has drawn each stone in from r₀^3/2 = r^3/2 + K; its orbits' wind;
// and how much of what has fallen far is gas.
const TEAR = 1.9
const infall = (t: number) => 260 * clamp((t - TEAR) / (PEAK - TEAR)) ** 1.5
const wind = (t: number) => 30 * clamp((t - TEAR) / (PEAK + 1 - TEAR)) ** 1.5
const molten = (t: number) => smooth(TEAR + 0.5, TEAR + 2.2, t)

// The eye's fall: from r = 26, r^3/2 running down ever faster to the horizon at PEAK, above the plane
// the stone falls into.
const R0 = 26, RH = 2.06
const incl = (t: number) => mix(0.2, 0.6, smooth(2.8, 5.2, t))
const radius = (t: number) => (R0 ** 1.5 - (R0 ** 1.5 - RH ** 1.5) * clamp(t / PEAK) ** 1.4) ** (2 / 3)
// How it winds round: E = 1, L = 3.5 (a plunge: no orbit with L < 4M is saved). dφ/dr = (L/r²) / (dr/dτ),
// (dr/dτ)² = 2/r − L²/r² + 2L²/r³; φ(r) tabulated once, from R0 down.
const L = 3.5, PHI = new Float64Array(1025)
const rAt = (i: number) => R0 - ((R0 - 2) * i) / 1024
for (let i = 1; i <= 1024; i++) {
  const r = (rAt(i) + rAt(i - 1)) / 2
  PHI[i] = PHI[i - 1] + (((L / (r * r)) / Math.sqrt(2 / r - (L * L) / (r * r) + (2 * L * L) / (r * r * r))) * (R0 - 2)) / 1024
}
const phi = (r: number) => {
  const f = clamp((R0 - r) / (R0 - 2)) * 1024, i = Math.min(1023, Math.floor(f))
  return mix(PHI[i], PHI[i + 1], f - i)
}
const fov = (t: number) => mix(1.1, 1.7, smooth(4.2, PEAK, t))

// The Julia set's last frame, swept into its shot if R5 never ran (?end).
function julia() {
  const f: Frame = { ch: [] }
  ophanim.build(1.5, f)
  return [{ ...f.field!, p: f.field!.p.slice() }]
}

// Where the eye is at t, into o.
function place3(t: number, o: number[]) {
  const r = radius(t), ph = -Math.PI / 2 + phi(r) + 0.25 * t, i = incl(t)
  o[0] = r * Math.cos(ph) * Math.cos(i), o[1] = r * Math.sin(ph) * Math.cos(i), o[2] = r * Math.sin(i)
  return r
}
// And how fast it falls, in the static frame: √(2M/r), along its path.
const eye = [0, 0, 0], ahead = [0, 0, 0], vel = [0, 0, 0]
function fall(t: number) {
  const r = place3(t, eye)
  place3(t + 1e-3, ahead)
  const n = Math.hypot(ahead[0] - eye[0], ahead[1] - eye[1], ahead[2] - eye[2]) || 1, b = Math.min(0.995, Math.sqrt((2 * mass(t)) / r))
  for (let i = 0; i < 3; i++) vel[i] = (b * (ahead[i] - eye[i])) / n
  return r
}
// The static frame's direction d as the falling eye sees it, into o: cos θ′ = (cos θ + β) / (1 + β cos θ).
function seen(d: ArrayLike<number>, o: number[]) {
  const b = Math.hypot(vel[0], vel[1], vel[2])
  if (b < 1e-6) return (o[0] = d[0]), (o[1] = d[1]), (o[2] = d[2]), o
  const c = (d[0] * vel[0] + d[1] * vel[1] + d[2] * vel[2]) / b, cs = (c + b) / (1 + b * c)
  const sx = d[0] - (c * vel[0]) / b, sy = d[1] - (c * vel[1]) / b, sz = d[2] - (c * vel[2]) / b
  const k = Math.sqrt(Math.max(0, 1 - cs * cs)) / (Math.hypot(sx, sy, sz) || 1)
  o[0] = (cs * vel[0]) / b + k * sx, o[1] = (cs * vel[1]) / b + k * sy, o[2] = (cs * vel[2]) / b + k * sz
  return o
}

const field: Field = { shader: HOLEA, k: 1, p: new Float32Array(60) }
const fwd = [0, 0, 0], up = [0, 0, 1], inward = [0, 0, 0], e1 = [0, 0, 0], e2 = [0, 0, 0], d3 = [0, 0, 0], s3 = [0, 0, 0]
const FIRST = new Float32Array(16) // the eye at t = 0
fall(0), aim(FIRST, eye, [-eye[0], -eye[1], -eye[2]], up, fov(0))
const DREAD = { dread: 1, gold: 0 }
let gain = 1
const live = [0], crisp = { tau: 0.03 }
const ring = { cos: 1, sin: 0, on: false }

// The chirp: f = K (t_c − t)^−3/8, 200 Hz 2.5 s before the cut and 1 kHz at it, 35 ms short of
// coalescence; its phase in closed form.
const TC = PEAK + 2.5 / (5 ** (8 / 3) - 1), KC = 200 * (TC - PEAK + 2.5) ** 0.375
const freq = (t: number) => KC * (TC - t) ** -0.375
const phase = (t: number) => (TAU * KC * (TC ** 0.625 - (TC - t) ** 0.625)) / 0.625
const amp = (t: number) => 1.5 * (freq(t) / freq(PEAK)) ** (1 / 3)

export const finaleA: Scene = {
  dur: DOT + 0.3,
  build(t, f) {
    field.bake ??= julia()
    const p = field.p, M = mass(t)
    ring.on = false
    if (t >= PEAK) {
      // the one flash: the last picture, burnt white
      jump(t - PEAK, f, true, 0)
      if (t < PEAK + 0.04) (p[27] = 3), (f.field = field)
    }
    else {
      // the eye looks where it sees the hole, rolling as it winds round
      const r = fall(t)
      for (let i = 0; i < 3; i++) inward[i] = -eye[i] / r
      seen(inward, fwd)
      const roll = 0.4 * phi(r), sx = fwd[1], sy = -fwd[0], sn = Math.hypot(sx, sy) || 1
      up[0] = (Math.sin(roll) * sx) / sn, up[1] = (Math.sin(roll) * sy) / sn, up[2] = Math.cos(roll)
      aim(p, eye, fwd, up, fov(t))
      p[16] = t, p[17] = M, p[18] = 1, p[19] = (0.5 + 2 * Math.exp(-(((t - SW1) / 0.12) ** 2))) * smooth(3.2, 5, r) // flaring as the Julia set goes
      p[20] = infall(t), p[21] = wind(t), p[22] = molten(t), p[23] = 1.5
      p[24] = vel[0], p[25] = vel[1], p[26] = vel[2], p[27] = 0
      // the card: square to the first line of sight, past the hole, filling the view as R5 left it, then
      // falling in, shrinking and turning ever faster
      const k = clamp((t - SW0) / (SW1 - SW0)), j = 1 - k * k, at = mix(1.5, 8, j)
      for (let i = 0; i < 3; i++) (p[28 + i] = FIRST[12 + i] * at), (p[32 + i] = FIRST[4 + i]), (p[36 + i] = FIRST[8 + i])
      p[31] = j > 0 ? (R0 + at) * Math.tan(fov(0) / 2) * j : 0
      p[35] = 1.5 * (1 / (j + 0.12) - 1 / 1.12)
      p[39] = smooth(0.1, 0.5, t)
      p[40] = WORLDS.indexOf(JULIA4), p[41] = 5, p[42] = 1.5, p[43] = 0.07
      p[44] = 14, p[45] = 9
      field.res = 0.75
      f.field = field
      // the photon ring, where the eye sees it: in the static frame a cone round the inward direction,
      // sin ψ = 3√3 M √(1 − 2M/r) / r, past 90° inside 3M
      const s = (3 * Math.sqrt(3) * M * Math.sqrt(Math.max(0, 1 - (2 * M) / r))) / r, psi = r > 3 * M ? Math.asin(Math.min(1, s)) : Math.PI - Math.asin(Math.min(1, s))
      ring.cos = Math.cos(psi), ring.sin = Math.sin(psi), ring.on = M > 0.05 && r > 4
      // e1, e2 across the inward direction, e1 as near the screen's right as it can be
      const rd = p[4] * inward[0] + p[5] * inward[1] + p[6] * inward[2]
      for (let i = 0; i < 3; i++) e1[i] = p[4 + i] - rd * inward[i]
      const n1 = Math.hypot(e1[0], e1[1], e1[2])
      for (let i = 0; i < 3; i++) e1[i] /= n1
      e2[0] = inward[1] * e1[2] - inward[2] * e1[1], e2[1] = inward[2] * e1[0] - inward[0] * e1[2], e2[2] = inward[0] * e1[1] - inward[1] * e1[0]
    }

    // the chirp, h₊ and h× face-on, drawn on the photon ring; at the end the dot alone, as station
    // identification finds it
    if (ring.on) {
      const z = M * 0.5
      f.ch.push({
        w: 1,
        fn: (tt, s) => {
          const ph = phase(tt), c = Math.cos(ph), sn = Math.sin(ph)
          for (let i = 0; i < 3; i++) d3[i] = ring.cos * inward[i] + ring.sin * (c * e1[i] - sn * e2[i])
          seen(d3, s3)
          const dz = s3[0] * p[12] + s3[1] * p[13] + s3[2] * p[14], k = p[3] / Math.max(0.05, dz)
          s.x = clamp(k * (s3[0] * p[4] + s3[1] * p[5] + s3[2] * p[6]), -3, 3), s.y = clamp(k * (s3[0] * p[8] + s3[1] * p[9] + s3[2] * p[10]), -3, 3)
          s.r = 1, s.g = 0.85, s.b = 0.6, s.z = dz > 0.05 ? z : 0
        },
      })
    }
    if (t > DOT) f.ch.push({ w: 1, fn: (_, s) => ((s.x = 0.004 * hash(Math.random() * 1e4)), (s.y = 0.004 * hash(Math.random() * 1e4)), (s.z = 0.6)) })
    if (t < TEAR) equation(f, "x''=-3M\\frac{h^2x}{r^5}", [1, 0.85, 0.6], 0.9)
    else if (t < PEAK - 2.5) (live[0] = infall(t)), equation(f, 'r_0=(r^{3/2}+K)^{2/3}\\qquad K=\\num{0}{000}', [1, 0.8, 0.5], 0.9, live)
    else if (t < PEAK) (live[0] = freq(t)), equation(f, 'f=f_0\\,(1-t/t_c)^{-3/8}=\\num{0}{0000}\\,Hz', [1, 0.85, 0.6], 0.9, live)
    f.rate = 2e6
    f.look ??= crisp
    if (t < PEAK) place(AT + t)
    return (tt, o) => {
      const cut = 1 - smooth(PEAK - 0.005, PEAK, tt)
      if (tt < PEAK - 0.005) gain = room.gain
      room.gain = gain * cut // the choir and its hall cut dead
      if (tt >= PEAK) return
      DREAD.dread = smooth(-2.5, 0.5, tt), DREAD.gold = 1 - smooth(-2, 1, tt) // ophanim's mood, carried on
      sing(AT + tt, o, 0.75 + 0.35 * smooth(0, PEAK, tt), DREAD)
      const ph = phase(tt), A = amp(tt) * smooth(0.5, 4.7, tt) * cut
      o.l = A * Math.cos(ph), o.r = A * Math.sin(ph)
    }
  },
}

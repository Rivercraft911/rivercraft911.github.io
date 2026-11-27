// R0 · The whirlpool. The river ends in a shaft: it goes over the rim all the way round and falls, and at
// the foot the water has nowhere to go but down a drain, so the pool there turns. It is night, and the moon
// stands high over the mouth. Every angle of the rim is a frequency and the water going over there is as heavy
// as that band of the soundtrack is loud; every drop carries the spectrum of the moment it went over
// (drops.wgsl), and the pool is the soundtrack's waterfall plot, wound round its drain: the spectrum each parcel
// fell with is a dye in it, frequency its hue and power its light, angle for log-frequency and log-radius for
// age, the choir's partials its spiral arms. The water spins up into a vortex and drinks it all down, and we
// ride in after it, onto its axis, and sink toward the drain.
import { heard } from '../audio/audio'
import { BINS, F0, PER as PER_BIN, Waterfall } from '../dsp/waterfall'
import { ROWS, WRAP as SHADER } from '../gpu/fields'
import { LANES, type Drops } from '../gpu/drops'
import type { Field } from '../gpu/raster'
import { descent, place, rate, sing } from './choir'
import { ASCII, WRAP as DUR, LEAD } from './clock' // LEAD: how long the choir has been falling when the wrap begins
import { aim } from './reality'
import { TAU, clamp, mix, smooth, type Frame, type Scene } from './scene'

const PER = 360 // rows printed per octave of the choir's descent
const MAX = 256 // most rows printed in a frame
const FRESH = 48 // history a fresh sheet back-fills at once: more costs a visible hitch

// The shaft, in units of 11 m (M), the drain at the origin, x across, y downstream, z up, the pool's still
// water at z = 0. The river leaves the rim (radius RIM, HF up) inward at V and falls under GF, a slowed
// gravity, for FALL seconds, landing on the ring of radius R: 80 Hz to 8 kHz over half of it (ARC, from A0,
// the angle from downstream toward +x), mirrored on the other half. The water is drawn in at β = BETA × the
// rate the choir falls, so each octave it falls carries the water BETA e-folds in. The vortex: its core, and
// how many radians its water turns for every e-fold it is drawn in, K = Γ / 2πβr_c². So its circulation
// follows the inflow β, and its depth the circulation.
export const M = 11, R = 1.2, ARC = Math.PI, A0 = Math.PI / 2, FALL = 3.4
export const GF = 5, V = 1.6 // m/s², m/s
export const RIM = R + (V * FALL) / M, HF = (0.5 * GF * FALL * FALL) / M
export const RC = 0.18
const BETA = 1.4, K = 10, G = 9.81 / M
const U0 = (PER_BIN * Math.log2(80 / F0)) / BINS, DU = (PER_BIN * Math.log2(100)) / BINS // and where they are on the rows
const LIFE = 2 // a droplet's mean seconds in the pool before it is lost in it
const SMAX = 15 // the longest (drops.wgsl)

// When the choir's descent passed D, near T: Newton on the descent, whose slope is its rate.
function when(D: number, T: number) {
  for (let i = 0; i < 3; i++) T -= (descent(T) - D) / rate(T)
  return T
}

// The printer: a row for every 1/PER octave the choir falls, each read at the moment the choir was there.
// A fresh sheet starts with as much history as the speakers still remember. Like a receiver's display it
// sets its own reference level: the loudest rows of the last second or two read just under white.
const water = new Waterfall()
// How loud lane b (0 at 80 Hz, 1 at 8 kHz) is going over the rim now, 0..1 over the display's range.
export const loud = (b: number) => Math.max(0, water.last[Math.round((U0 + b * DU) * (BINS - 1))] - field.p[25]) ** 2
const rows = new Uint8Array(2 * BINS * MAX)
const lanes = new Uint8Array(LANES * MAX), lane = new Float32Array(LANES), fed = { data: lanes, at: 0, n: 0 } // the same rows as the droplets carry them: a lane's loudest bin, 80 Hz to 8 kHz
const printer = { k: 0, from: 0, T: -1, ref: -1 }
function print(T: number, now: number, f: Field) {
  T += LEAD // on the choir's clock
  const head = descent(T) * PER, top = Math.floor(head), pr = printer, dt = T - pr.T
  if (dt < 0 || dt > 0.5 || top - pr.k > MAX) {
    // a jump: start a fresh sheet, as far back as the speakers remember
    pr.k = pr.from = top - Math.min(FRESH, Math.floor((heard.buf.length / heard.sr - 0.05) * rate(T) * PER))
    pr.ref = -1
  }
  pr.T = T
  const n = top - pr.k
  let hi = 0
  for (let i = 0; i < n; i++) {
    hi = Math.max(hi, water.row(now - (T - when((pr.k + 1 + i) / PER, T)), rows, 2 * i * BINS))
    for (let l = 0, w = water.last; l < LANES; l++) {
      const a = Math.round((U0 + ((l - 0.5) * DU) / (LANES - 1)) * BINS), b = Math.round((U0 + ((l + 0.5) * DU) / (LANES - 1)) * BINS)
      let v = 0
      for (let m = a; m <= b; m++) v = Math.max(v, w[m])
      lanes[i * LANES + l] = Math.round(255 * (lane[l] += (v - lane[l]) * 0.12)) // held a few rows: noise settles to its level, a tone stays a line
    }
  }
  if (n > 0) pr.ref = pr.ref < 0 ? hi : pr.ref + (hi - pr.ref) * (1 - Math.exp(-dt / 1.5))
  f.rows = n > 0 ? { data: rows, at: (((pr.k + 1) % ROWS) + ROWS) % ROWS, n } : undefined
  fed.at = f.rows?.at ?? 0, fed.n = n
  pr.k = top
  return head
}

// The pool as it is at T: how far it has spun up, its inflow β, its circulation Γ, the depth of its funnel,
// how far its water turns an e-fold (K), r_c², and the drain's radius. A pure function of T, so the camera
// can be flown through it ahead of time; `pool` is the pool now. Its axis is the z axis of these units (the
// valley's SHAFT places it), for whatever comes after.
export type Pool = { wet: number; beta: number; gamma: number; H: number; K: number; k: number; R: number; hole: number }
export function poolAt(T: number, o: Pool) {
  o.wet = 0.3 + 0.7 * smooth(-5, 1.5, T)
  o.beta = BETA * rate(T + LEAD)
  o.gamma = TAU * o.beta * RC * RC * K * o.wet
  o.H = (o.gamma * o.gamma) / (8 * Math.PI ** 2 * G * RC * RC)
  o.K = K * o.wet
  o.hole = HOLE * smooth(DUR + 0.2, DUR + 1.6, T)
  return o
}
const HOLE = 0.07
export const pool: Pool = { wet: 0, beta: 0, gamma: 0, H: 0, K: 0, k: RC * RC, R, hole: 0 }
// The free surface, and how fast the water at r is turning, rad/s (clockwise seen from above).
export const surface = (r: number, p = pool) => (-p.H * p.k) / (r * r + p.k)
export const swirl = (r: number, p = pool) => p.gamma / (TAU * (r * r + p.k))
// The plot's palette: frequency as colour, 80 Hz to 8 kHz in seven even stops, linear light (wrap.wgsl and
// drops.wgsl hue()), its levels shown tilted 22 dB across the band (wrap.wgsl TILT).
export const HUE = [[1, 0.08, 0.04], [1, 0.35, 0.05], [1, 0.75, 0.15], [0.3, 1, 0.35], [0.1, 0.75, 1], [0.2, 0.3, 1], [0.55, 0.2, 1]]
// The moon, high over the mouth behind us as we come to the lip: the way toward it, and its light.
const MOON = [0.25, -0.33, 0.91].map((v, _, a) => v / Math.hypot(...a))
const MOONLIGHT = 1.1

// The camera, in the pool's units, from the lip (T = JOIN) to the drain: one path. It is designed as plain functions of
// T (how far out from the axis, how far round it, how high, which way it looks, the lens), sampled every STEP seconds
// as the control points of a uniform cubic B-spline, so its position, velocity and acceleration never jump. Its first
// three points are the run's own position, velocity and acceleration at the lip (join, from valley.ts), so it carries
// straight on from it. Over the lip and down inside the curtain, circling the shaft the way the pool turns; down to
// the water as it blossoms into the plot, drawn in along a streamline and turning with it; onto the axis, looking
// straight down it, sinking toward the drain; and as the drain opens, down its throat into the dark.
const OUT = DUR + ASCII // when it is gone down the drain
export const OVER = OUT - 1.9, DROP = OUT - 1.25 // when the drain is open under it, and when it drops into it
const STEP = 0.2, CH = 7 // knots; channels: r, φ (round from downstream toward +x), z, yaw, pitch, roll, lens
const S5 = (a: number, b: number, x: number) => {
  const k = clamp((x - a) / (b - a))
  return k * k * k * (k * (6 * k - 15) + 10)
}
// As the whirlpool ends it is on the axis at ZE, over the funnel's floor, sinking at SINK units/s; it turns with the
// water a third as fast, but never faster than TURN rad/s besides its own slow circling.
const ZE = -0.42, SINK = 0.3, TURN = 1.15
let T0 = 0, ctl = new Float64Array(0), n = 0
// The run's three last moments (eye, target, lens at T − 2ε, T − ε, T), as channels.
function channels(k: ArrayLike<number>, o: number[]) {
  const fx = k[3] - k[0], fy = k[4] - k[1], fz = k[5] - k[2]
  o[0] = Math.hypot(k[0], k[1]), o[1] = Math.atan2(k[0], k[1]), o[2] = k[2]
  if (o[1] < 0) o[1] += TAU // coming in from upstream: round the far side of π, not through it
  o[3] = Math.atan2(fx, fy), o[4] = Math.atan2(fz, Math.hypot(fx, fy)), o[5] = 0, o[6] = k[6]
  return o
}
export function join(T: number, run: ArrayLike<number>[], eps: number) {
  T0 = T
  const [a, b, c] = run.map((k) => channels(k, [])), p = c, v = c.map((x, i) => (3 * x - 4 * b[i] + a[i]) / (2 * eps)), acc = c.map((x, i) => (x - 2 * b[i] + a[i]) / (eps * eps))
  const END = OUT + 1
  n = Math.ceil((END - T0) / STEP) + 3
  ctl = new Float64Array(n * CH)
  // the run's state as the spline's first three points: (C₀ + 4C₁ + C₂)/6 = p, (C₂ − C₀)/2h = v, (C₀ − 2C₁ + C₂)/h² = a
  for (let i = 0; i < CH; i++) {
    const c1 = p[i] - (acc[i] * STEP * STEP) / 6
    ctl[i] = c1 + (acc[i] * STEP * STEP) / 2 - v[i] * STEP
    ctl[CH + i] = c1
    ctl[2 * CH + i] = c1 + (acc[i] * STEP * STEP) / 2 + v[i] * STEP
  }
  // the design, integrated finely: q the e-folds the circle has been drawn in, φ how far round
  const st = poolAt(T0, { ...pool }), d = new Array(CH).fill(0), dt = STEP / 20, R0 = 1.12, alpha0 = p[1] - Math.PI - p[3]
  let q = 0, ph = p[1]
  for (let k = 3, i = 0; k < n; i++) {
    const t = T0 + i * dt, s = t - T0
    poolAt(t, st)
    const r = R0 * Math.exp(-q) * (1 - S5(-0.6, 1.5, t)) + (p[0] - R0) * Math.exp(-1.3 * s)
    if (t > T0 + (k - 1) * STEP - 1e-9) {
      const skim = surface(r, st) + 0.07 + 0.3 * r, fall = mix(p[2], skim, S5(T0 + 0.3, -4.6, t))
      const axis = ZE - SINK * (t - DUR) - 0.45 * Math.max(0, t - DROP) ** 2
      const alpha = alpha0 + (0.3 - alpha0) * S5(T0, T0 + 1.5, t) + 0.4 * S5(-5, -1, t) // how far ahead of the axis it looks
      d[0] = r, d[1] = ph, d[2] = mix(Math.max(fall, axis), axis, S5(2, 3, t)) // on the axis it sinks on, down the drain once it opens
      d[3] = ph - Math.PI - alpha
      d[4] = p[4] + (-0.66 - p[4]) * S5(T0, T0 + 1.1, t) - 0.12 * S5(-8, -4.5, t) - 0.3 * S5(-4.5, -1, t) - (Math.PI / 2 - 1.08) * S5(-1.5, 1.4, t)
      d[5] = 0
      d[6] = p[6] + (1.2 - p[6]) * S5(T0, T0 + 0.9, t) - 0.05 * S5(-7, -4, t) + 0.3 * S5(-3, 1.5, t)
      // leaving the run: from its own course, carried on, into the design
      const w = S5(T0, T0 + 1.2, t)
      for (let j = 0; j < CH; j++) ctl[k * CH + j] = mix(p[j] + v[j] * s + 0.5 * acc[j] * s * s, d[j], w)
      k++
    }
    q += (0.03 + 0.5 * S5(-5.5, -0.5, t)) * dt
    ph += (0.16 + 0.2 * (1 - S5(-6, -3, t)) + TURN * Math.tanh((0.35 * swirl(r, st)) / TURN)) * dt // round the shaft as we come down it, then with the water
  }
  // how it ends
  const e = 1e-3, a0 = [...ride(DUR - e).eye], y0 = ch[3], b1 = [...ride(DUR + e).eye], y1 = ch[3], end = ride(DUR)
  ending.eye = [...end.eye], ending.fwd = [...end.fwd], ending.up = [...end.up], ending.fov = end.fov
  ending.v = b1.map((x, i) => (x - a0[i]) / (2 * e)), ending.spin = (y1 - y0) / (2 * e)
}
// The ride as the whirlpool ends (T = DUR), for whatever comes after: its pose, its velocity (units/s) and how fast
// the picture turns about the axis (rad/s; the yaw, clockwise seen from above, as the water turns).
export const ending = { eye: [0, 0, 0], fwd: [0, 0, -1], up: [0, 1, 0], fov: 0, v: [0, 0, 0], spin: 0 }
// The camera at T, in the pool's units: eye, forward, up, lens.
export const pose = { eye: [0, 0, 0], fwd: [0, 0, 0], up: [0, 0, 1], fov: 1 }
const ch = new Array(CH).fill(0)
export function ride(T: number) {
  const x = clamp((T - T0) / STEP, 0, n - 3 - 1e-9), i = Math.floor(x), u = x - i, v = 1 - u
  const b0 = (v * v * v) / 6, b1 = (3 * u * u * u - 6 * u * u + 4) / 6, b2 = (-3 * u * u * u + 3 * u * u + 3 * u + 1) / 6, b3 = (u * u * u) / 6
  for (let j = 0, o = i * CH; j < CH; j++, o++) ch[j] = b0 * ctl[o] + b1 * ctl[o + CH] + b2 * ctl[o + 2 * CH] + b3 * ctl[o + 3 * CH]
  const [r, ph, z, yaw, pitch, roll, fov] = ch, { eye, fwd, up } = pose
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), cr = Math.cos(roll), sr = Math.sin(roll)
  eye[0] = r * Math.sin(ph), eye[1] = r * Math.cos(ph), eye[2] = z
  fwd[0] = cp * sy, fwd[1] = cp * cy, fwd[2] = sp
  // right is level, from the yaw alone, so looking straight down the picture turns as the yaw does; up = right × forward, rolled
  up[0] = -sp * sy * cr + cy * sr, up[1] = -sp * cy * cr - sy * sr, up[2] = cp * cr
  pose.fov = fov
  return pose
}

// How far the pool has blossomed into the plot: as we come down inside the curtain toward it.
const bloom = (T: number) => smooth(-7.6, -4, T)

// A raster is a fresh picture each frame: under the beam's slow phosphor a moving one would leave a
// ghost of itself every frame behind, strobing echoes, not a blur. Its light fades within the frame.
export const TAU_RASTER = 0.006

// The shaft at fall time T into the frame: the raster's field, the droplets, and the spectrum's new rows for
// both. `light` is the raster's gain (dark, it only prints), `rain` the droplets' brightness, `n` the share of
// them in play, `plume` the mist breathed out of the mouth, `veil` the mist close round the lens.
const field: Field = { shader: SHADER, k: 1, p: new Float32Array(52), res: 1.5 } // finer than the usual raster: the curtain's ligaments
const drops: Drops = { k: 1, n: 1, p: new Float32Array(112) }
export function vortex(T: number, now: number, f: Frame, light = 1, rain = 1, n = 1, plume = 0, veil = 0) {
  const p = field.p, q = drops.p, head = print(T, now, field), Tc = T + LEAD
  const { wet, H, K, hole } = poolAt(T, pool), fell = PER * (descent(Tc) - descent(Tc - FALL))
  p[7] = wet, p[11] = veil, p[15] = hole
  p[16] = R, p[17] = A0, p[18] = ARC, p[19] = light
  p[20] = head % ROWS, p[21] = PER / BETA, p[22] = head - printer.from, p[23] = fell
  p[24] = 0.9, p[25] = Math.min(0.3, Math.max(-0.15, printer.ref - 0.8)) // the landing's white water; the reference level, as an offset in the rows' units
  p[26] = H, p[27] = RC
  p[28] = K, p[29] = T, p[30] = U0, p[31] = DU
  p[32] = RIM, p[33] = HF, p[34] = FALL, p[35] = plume
  p[36] = MOON[0], p[37] = MOON[1], p[38] = MOON[2], p[39] = MOONLIGHT
  p[40] = p[41] = bloom(T)
  p[46] = p[47] = 0
  field.k = +(light > 0)
  field.cell = undefined
  f.field = field
  f.look = { tau: TAU_RASTER }

  q[16] = R, q[17] = RIM, q[18] = HF, q[19] = FALL
  q[20] = T, q[21] = 1.5, q[22] = p[40], q[23] = 1
  q[24] = p[20], q[25] = p[21], q[26] = fell, q[27] = p[25]
  q[28] = H, q[29] = RC * RC, q[30] = K, q[31] = hole
  q[34] = A0, q[35] = LIFE
  q[36] = 38, q[37] = 0.7, q[38] = 1.1, q[39] = 0.12
  q[40] = 0.05, q[41] = 1, q[42] = p[22]
  q[44] = MOON[0], q[45] = MOON[1], q[46] = MOON[2], q[47] = MOONLIGHT
  for (let j = 0; j < 64; j++) q[48 + j] = PER * (descent(Tc) - descent(Tc - (j * SMAX) / 63))
  drops.k = rain, drops.n = n, drops.rows = fed.n > 0 ? fed : undefined
  f.drops = drops
  return field
}
// Through this eye: the raster and the droplets see the shaft through one camera.
export function sight(eye: ArrayLike<number>, fwd: ArrayLike<number>, up: ArrayLike<number>, fov: number) {
  aim(field.p, eye, fwd, up, fov)
  drops.p.set(field.p.subarray(0, 15))
}
export function fly(T: number) {
  const { eye, fwd, up, fov } = ride(T)
  sight(eye, fwd, up, fov)
}

export const wrap: Scene = {
  dur: DUR,
  build(t, f) {
    vortex(t, (f.at ?? 0) + t, f)
    fly(t)
    place(t + LEAD)
    return (tt, o) => sing(tt + LEAD, o)
  },
}

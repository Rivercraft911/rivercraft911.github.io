// R0 · The whirlpool. The river ends in a shaft: it goes over the rim all the way round and falls, and at
// the foot the water has nowhere to go but down a drain, so the pool there turns. Every angle of the rim is
// a frequency and every drop carries the spectrum of the moment it went over (drops.wgsl), so the curtain
// is a waterfall plot of the soundtrack, the pool an SDR waterfall wound round its drain, angle for
// log-frequency and log-radius for age, and the choir's partials, octaves apart, its spiral arms. The water
// spins up into a vortex and drinks the spectrum down in log spirals, and we ride a streamline in after it.
import { heard } from '../audio/audio'
import { BINS, F0, PER as PER_BIN, Waterfall } from '../dsp/waterfall'
import { ROWS, WRAP as SHADER } from '../gpu/fields'
import { LANES, type Drops } from '../gpu/drops'
import type { Field } from '../gpu/raster'
import { descent, place, rate, sing } from './choir'
import { ASCII, WRAP as DUR, LEAD } from './clock' // LEAD: how long the choir has been falling when the wrap begins
import { aim } from './reality'
import { Say } from './say'
import { TAU, glide, mix, smooth, type Frame, type Scene } from './scene'

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
// can be flown through it ahead of time; `pool` is the pool now, for the beam to draw on it too.
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
// The free surface, how far the water at r has turned since it landed, and how fast it is turning, rad/s.
export const surface = (r: number, p = pool) => (-p.H * p.k) / (r * r + p.k)
export const turned = (r: number, p = pool) => 0.5 * p.K * Math.log((1 + p.k / (r * r)) / (1 + p.k / (R * R)))
export const swirl = (r: number, p = pool) => p.gamma / (TAU * (r * r + p.k))
// The vortex's axis, for whoever comes back up it: the drain at the origin, +z up, M metres to the unit;
// `pool` is its state, and poolAt(T) its state at any wrap time (valley.ts SHAFT places it in the valley).
export const AXIS = { up: [0, 0, 1], M, RIM, HF, R, RC }

// The camera, in the pool's units. From high in the shaft, looking down on the disc the spectrum makes (the
// valley flies it there, and on until T = 0), it swoops down to the water and is taken by it: it rides a
// streamline in, r = r₀e^(−at), turning as the water turns, ω = Γ / 2π(r² + r_c²), so faster the further it
// falls, banking into the funnel, and at the last it is over the drain and goes down it. Keys: time, eye,
// what it looks at, the lens, and which way is up.
const RIDE = -0.5, OUT = DUR + ASCII // when it joins the streamline, and when it is gone down the drain
export const KEYS: number[][] = [
  [-2.6, 0.25, 0.9, 2, 0, -0.1, 0, 1.0, 0, 0, 1],
  [-1.4, 0.95, 0.5, 0.9, 0, -0.1, -0.1, 1.05, 0, 0, 1],
]
{
  const p = poolAt(0, { ...pool })
  let ph = 1.5
  for (let T = RIDE; T <= OUT + 0.001; T += 0.1) {
    poolAt(T, p)
    const end = smooth(OUT - 0.9, OUT - 0.2, T), in_ = smooth(RIDE, DUR + 1, T) // over the drain at the last; how far into the ride
    const r = Math.exp(-0.36 * (T - RIDE)) * (1 - end), ri = r * mix(0.5, 0.42, in_), ahead = ph + mix(0.8, 1.5, in_)
    const c = Math.cos(ph), s = Math.sin(ph), bank = 0.9 * in_ * (1 - end), lid = surface(Math.max(p.hole, 1e-3), p)
    KEYS.push([
      T, r * s, r * c, mix(Math.max(surface(r, p), lid) + 0.07 + 0.3 * r, lid - 0.1, smooth(OUT - 0.5, OUT, T)), // down it at the last
      ri * Math.sin(ahead), ri * Math.cos(ahead), surface(ri, p) - 0.4 * end,
      mix(1.15, 1.35, in_),
      -bank * s + end * Math.cos(ph), -bank * c - end * Math.sin(ph), 1 - end,
    ])
    ph += 0.1 * 0.32 * swirl(Math.max(r, 0.12), p) // a third as fast as the water, so it streams past
  }
}
const key: number[] = [], to = [0, 0, 0], upward = [0, 0, 1]

// A raster is a fresh picture each frame: under the beam's slow phosphor a moving one would leave a
// ghost of itself every frame behind, strobing echoes, not a blur. Its light fades within the frame.
export const TAU_RASTER = 0.006

// The shaft at fall time T into the frame: the raster's field, the droplets, and the spectrum's new rows
// for both. `light` is the raster's gain (dark, it only prints), `plot` how far the water has turned from
// water to the plot's colours, `rain` the droplets' brightness, `n` the share of them in play.
const field: Field = { shader: SHADER, k: 1, p: new Float32Array(52), res: 1.5 } // finer than the usual raster: its partials are filaments
const drops: Drops = { k: 1, n: 1, p: new Float32Array(112) }
export const live = [0, 0, 0] // the circulation, the inflow, the spiral's pitch in degrees: for the equation
export function vortex(T: number, now: number, f: Frame, light = 1, plot = 1, rain = 1, n = 1) {
  const p = field.p, q = drops.p, head = print(T, now, field), Tc = T + LEAD
  const { wet, beta, gamma, H, K, hole } = poolAt(T, pool), fell = PER * (descent(Tc) - descent(Tc - FALL))
  p[7] = wet, p[15] = hole
  p[16] = R, p[17] = A0, p[18] = ARC, p[19] = light
  p[20] = head % ROWS, p[21] = PER / BETA, p[22] = head - printer.from, p[23] = fell
  p[24] = 0.9, p[25] = Math.min(0.3, Math.max(-0.15, printer.ref - 0.8)) // the landing's white water; the reference level, as an offset in the rows' units
  p[26] = H, p[27] = RC
  p[28] = K, p[29] = plot, p[30] = U0, p[31] = DU
  p[32] = RIM, p[33] = HF, p[34] = 1, p[35] = 1
  p[46] = p[47] = 0
  field.k = +(light > 0)
  field.res = T < 0 ? 1 : 1.5 // finest once we are down on the water
  field.cell = undefined
  f.field = field
  f.look = { tau: TAU_RASTER }

  q[16] = R, q[17] = RIM, q[18] = HF, q[19] = FALL
  q[20] = T, q[21] = 1.5, q[22] = plot
  q[24] = p[20], q[25] = p[21], q[26] = fell, q[27] = p[25]
  q[28] = H, q[29] = RC * RC, q[30] = K, q[31] = hole
  q[34] = A0, q[35] = LIFE
  q[36] = 38, q[37] = 0.7, q[38] = 1.1, q[39] = 0.12
  q[40] = 0.05, q[41] = 1.4, q[42] = p[22]
  for (let j = 0; j < 64; j++) q[48 + j] = PER * (descent(Tc) - descent(Tc - (j * SMAX) / 63))
  drops.k = rain, drops.n = n, drops.rows = fed.n > 0 ? fed : undefined
  f.drops = drops

  live[0] = gamma * M * M // m²/s
  live[1] = beta
  live[2] = (Math.atan(1 / K) * 360) / TAU // on the axis, where tan α = 2πβr_c² / Γ = 1 / K: the arms' pitch
  return field
}
// Through this eye: the raster and the droplets see the shaft through one camera.
export function sight(eye: ArrayLike<number>, fwd: ArrayLike<number>, up: ArrayLike<number>, fov: number) {
  aim(field.p, eye, fwd, up, fov)
  drops.p.set(field.p.subarray(0, 15))
}
export function fly(T: number) {
  const k = glide(KEYS, T, key)
  to[0] = k[3] - k[0], to[1] = k[4] - k[1], to[2] = k[5] - k[2]
  upward[0] = k[7], upward[1] = k[8], upward[2] = k[9]
  sight(k, to, upward, k[6])
}

// The live equation, top left, one for the whole way down: the lip's, the fall's, the plot's and the
// vortex's, each growing out of the last term by term. Its clock is T, so it carries across the scenes.
export const say = new Say()
export const VORTEX_INK = [0.62, 0.88, 1]
export const VORTEX = 'z = -\\frac{\\Gamma^2}{8 \\pi^2 g\\,(r^2 + r_c^2)},\\; \\tan \\alpha = \\frac{u_r}{u_\\theta} = \\frac{2 \\pi \\beta\\,(r^2 + r_c^2)}{\\Gamma}'
export const turning = (f: Frame, T: number, i = 1) => say.say(f, T, VORTEX, VORTEX_INK, [['\\Gamma', live[0], 0], ['\\beta', live[1], 2], ['\\alpha', live[2], 1]], i)

export const wrap: Scene = {
  dur: DUR,
  build(t, f) {
    vortex(t, (f.at ?? 0) + t, f)
    fly(t)
    turning(f, t)
    place(t + LEAD)
    return (tt, o) => sing(tt + LEAD, o)
  },
}

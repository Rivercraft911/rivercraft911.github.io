// R0 · The whirlpool. The falls come down into a plunge pool that is already turning, and we come down with
// them, into the water. Every lane of the curtain is a frequency; it lands on a ring round the drain and
// the water carries it in, so the pool is an SDR waterfall of the soundtrack itself, the falling choir's
// real short-time spectrum, angle for log-frequency and log-radius for age: the rows run inward exactly as
// fast as the choir falls, and its partials, octaves apart, are spiral arms. The water spins up into a
// vortex and drinks the spectrum down in log spirals, and we are pulled round and down after it.
import { heard } from '../audio/audio'
import { BINS, F0, PER as PER_BIN, Waterfall } from '../dsp/waterfall'
import { ROWS, WRAP as SHADER } from '../gpu/fields'
import type { Field } from '../gpu/raster'
import { descent, place, rate, sing } from './choir'
import { WRAP as DUR, LEAD } from './clock' // LEAD: how long the choir has been falling when the wrap begins
import { aim, equation } from './reality'
import { TAU, glide, smooth, type Frame, type Scene } from './scene'

const PER = 360 // rows printed per octave of the choir's descent
const MAX = 256 // most rows printed in a frame
const FRESH = 48 // history a fresh sheet back-fills at once: more costs a visible hitch

// The pool, in its own units of 11 m (M): the falls land on a ring of radius R round the drain, 80 Hz to
// 8 kHz over the half of it under the curtain (ARC, from A0, the angle from downstream toward +x), FALL
// seconds after they went over. The water is drawn in at β = BETA × the rate the choir falls, so each octave
// it falls carries the water BETA e-folds in. The vortex: its core, and how many radians its water turns
// for every e-fold it is drawn in, K = Γ / 2πβr_c². So its circulation follows the inflow β, and its depth
// the circulation.
export const M = 11, R = 1.2, ARC = Math.PI, A0 = Math.PI / 2, FALL = 3.4
const BETA = 1.4, RC = 0.18, K = 10, G = 9.81 / M
const U0 = (PER_BIN * Math.log2(80 / F0)) / BINS, DU = (PER_BIN * Math.log2(100)) / BINS // and where they are on the rows

// When the choir's descent passed D, near T: Newton on the descent, whose slope is its rate.
function when(D: number, T: number) {
  for (let i = 0; i < 3; i++) T -= (descent(T) - D) / rate(T)
  return T
}

// The printer: a row for every 1/PER octave the choir falls, each read at the moment the choir was there.
// A fresh sheet starts with as much history as the speakers still remember. Like a receiver's display it
// sets its own reference level: the loudest rows of the last second or two read just under white.
const water = new Waterfall(), rows = new Uint8Array(2 * BINS * MAX)
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
  for (let i = 0; i < n; i++) hi = Math.max(hi, water.row(now - (T - when((pr.k + 1 + i) / PER, T)), rows, 2 * i * BINS))
  if (n > 0) pr.ref = pr.ref < 0 ? hi : pr.ref + (hi - pr.ref) * (1 - Math.exp(-dt / 1.5))
  f.rows = n > 0 ? { data: rows, at: (((pr.k + 1) % ROWS) + ROWS) % ROWS, n } : undefined
  pr.k = top
  return head
}

// The camera, in the pool's units: x across, y downstream, z up, the drain at the origin. From face to
// face with the falls (the valley flies it until T = 0) it rises up and over as the plot pours down into
// the pool, looking down on the disc it makes, then swoops down round it with the current and into the
// funnel. Keys: time, eye, what it looks at, and the lens.
export const KEYS = [
  [-1.6, 0.35, 0.75, 2.45, 0, -0.15, 0, 1.0],
  [-0.4, 0.95, 0.15, 0.85, 0, -0.05, -0.2, 1.05],
  [0.8, 0.45, -0.55, 0.1, 0.05, 0.1, -0.4, 1.1],
  [1.6, -0.05, -0.6, -0.02, 0, 0, -0.55, 1.15],
  [2.5, -0.4, -0.12, -0.12, 0, 0, -0.8, 1.2],
  [4, -0.15, 0.12, -0.2, 0, 0, -0.95, 1.25],
]
const key: number[] = [], up = [0, 0, 1]
function look(T: number, p: Float32Array) {
  const k = glide(KEYS, T, key)
  aim(p, k, [k[3] - k[0], k[4] - k[1], k[5] - k[2]], up, k[6])
}

// A raster is a fresh picture each frame: under the beam's slow phosphor a moving one would leave a
// ghost of itself every frame behind, strobing echoes, not a blur. Its light fades within the frame.
export const TAU_RASTER = 0.006

// The pool as it is at T: how far it has spun up, its inflow, the depth of its funnel, and how far its
// water has turned (dΦ per e-fold at the core), for the beam to draw on it too.
export const pool = { wet: 0, beta: 0, H: 0, K: 0, k: RC * RC, R }
export const surface = (r: number) => (-pool.H * pool.k) / (r * r + pool.k)
export const turned = (r: number) => 0.5 * pool.K * Math.log((1 + pool.k / (r * r)) / (1 + pool.k / (R * R)))

// The whirlpool at fall time T into the frame: the raster's field and its new rows. Dark (gain 0), it
// only prints.
const field: Field = { shader: SHADER, k: 1, p: new Float32Array(52), res: 1.5 } // finer than the usual raster: its partials are filaments
export const live = [0, 0] // the circulation and the inflow, for the equation
export function vortex(T: number, now: number, f: Frame, gain = 1) {
  const p = field.p, head = print(T, now, field), wet = (pool.wet = 0.25 + 0.75 * smooth(-2, 1.5, T))
  const beta = (pool.beta = BETA * rate(T + LEAD)), gamma = TAU * beta * RC * RC * K * wet // the inflow's rate and the circulation
  pool.H = (gamma * gamma) / (8 * Math.PI ** 2 * G * RC * RC), pool.K = K * wet
  look(T, p)
  p[7] = wet, p[15] = 0
  p[16] = R, p[17] = A0, p[18] = ARC, p[19] = gain
  p[20] = head % ROWS, p[21] = PER / BETA, p[22] = head - printer.from, p[23] = PER * (descent(T + LEAD) - descent(T + LEAD - FALL))
  p[24] = 0.15, p[25] = Math.min(0.3, Math.max(-0.15, printer.ref - 0.8)) // the landing's white water; the reference level, as an offset in the rows' units
  p[26] = pool.H, p[27] = RC
  p[28] = pool.K, p[30] = U0, p[31] = DU
  p[46] = p[47] = 0
  field.k = +(gain > 0)
  field.cell = undefined
  f.field = field
  f.look = { tau: TAU_RASTER }
  live[0] = gamma * M * M // m²/s
  live[1] = beta
  return field
}

export const VORTEX_INK = [0.55, 0.85, 1]
export const VORTEX = 'z=-\\frac{\\Gamma^2}{8\\pi^2g\\,(r^2+r_c^2)}\\qquad\\Gamma=\\num{0}{000}\\qquad\\frac{dr}{dt}=-\\num{1}{0.00}\\,r'
export const wrap: Scene = {
  dur: DUR,
  build(t, f) {
    vortex(t, (f.at ?? 0) + t, f)
    equation(f, VORTEX, VORTEX_INK, 0.9, live)
    place(t + LEAD)
    return (tt, o) => sing(tt + LEAD, o)
  },
}

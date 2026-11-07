// R0 · The whirlpool. The fall begins on an SDR waterfall of the soundtrack itself: the falling choir's real
// short-time spectrum, log-frequency across, rows printing at the top. It opens where the valley's falls
// flattened into a plot, at the same scale and in the same place, looking straight down on it as on water.
// The plot curls until its edges meet, 8 kHz on 80 Hz, a disc round a drain: the lip is the rim, where the
// present is printed, angle is pitch and log-radius is age, so the rows run inward exactly as fast as the
// choir falls, and the Shepard choir's partials, octaves apart, are spokes round the wheel. Then the water
// spins up into a vortex and drinks the spectrum down in log spirals, and we are pulled down after it.
import { heard } from '../audio/audio'
import { BINS, F0, PER as PER_BIN, Waterfall } from '../dsp/waterfall'
import { ROWS, WRAP as SHADER } from '../gpu/fields'
import type { Field } from '../gpu/raster'
import { descent, place, rate, sing } from './choir'
import { aim, equation } from './reality'
import { TAU, clamp, glide, smooth, view, type Frame, type Scene } from './scene'

export const LEAD = 21 // how long the choir has been falling when the wrap begins: valley.DUR − valley.SING
export const DUR = 5
const PER = 360 // rows printed per octave of the choir's descent
const MAX = 256 // most rows printed in a frame
const FRESH = 48 // history a fresh sheet back-fills at once: more costs a visible hitch

// The valley's falls end flat as a plot: 80 Hz to 8 kHz across 2.3 half-widths, 800 Hz centred, the lip
// at y = 0.42 and 3.4 s of history in the 1.55 below it. Seen from S0 away through a lens 0.9 rad wide, the
// sheet in its plane lies exactly there, and scrolls as fast: L of it to each octave the choir falls.
const LIP = 0.42, S0 = 1 / Math.tan(0.45), L = 1.55 / 3.4 / rate(LEAD)
// The vortex: its core, and how many radians its water turns for every e-fold it is drawn in, K = Γ / 2πβr_c².
// So its circulation follows the inflow β, and its depth the circulation. A unit of the plot is 11 m.
const RC = 0.18, K = 10, M = 11, G = 9.81 / M
let aspect = 0, W = 1, C1 = 1 // the plot's width, and the curl that closes it
const U0 = (PER_BIN * Math.log2(80 / F0)) / BINS, DU = (PER_BIN * Math.log2(100)) / BINS // and where they are on the rows
function chart() {
  if (view.a === aspect) return
  aspect = view.a
  W = 2.3 * aspect
  C1 = TAU / W
}

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

// The camera: straight down on the plot, then round and down into the funnel. Keys: time, elevation,
// azimuth, distance, how far it has moved over the drain, how deep it looks, and the lens.
const KEYS = [
  [0, Math.PI / 2, 0, S0, 0, 0, 0.9],
  [0.7, Math.PI / 2, 0, S0, 0.1, 0, 0.9],
  [2.2, Math.PI / 2, 0.3, 0.62 * S0, 1, 0, 0.95],
  [3.6, 0.8, 1, 1, 1, -0.2, 1.1],
  [5, 1.15, 1.8, 0.75, 1, -0.4, 1.2],
  [10, 1.4, 3, 0.55, 1, -0.55, 1.2],
]
const key = [0, 0, 0, 0, 0, 0], eye = [0, 0, 0], fwd = [0, 0, -1], up = [0, 1, 0]
function look(T: number, p: Float32Array, kick: number) {
  const [el, az, dist, over, deep, fov] = glide(KEYS, T, key)
  const ty = over * (LIP - 1 / C1), ce = Math.cos(el), se = Math.sin(el)
  eye[0] = dist * ce * Math.sin(az)
  eye[1] = ty - dist * ce * Math.cos(az)
  eye[2] = deep + dist * se
  fwd[0] = -ce * Math.sin(az), fwd[1] = ce * Math.cos(az), fwd[2] = -se
  up[0] = -se * Math.sin(az), up[1] = se * Math.cos(az), up[2] = ce
  aim(p, eye, fwd, up, fov + kick)
}

// A raster is a fresh picture each frame: under the beam's slow phosphor a moving one would leave a
// ghost of itself every frame behind, strobing echoes, not a blur. Its light fades within the frame.
const TAU_RASTER = 0.006

// The whirlpool at fall time T into the frame: the raster's field and its new rows.
const field: Field = { shader: SHADER, k: 1, p: new Float32Array(32), res: 1.5 } // finer than the usual raster: its partials are filaments
const live = [0, 0]
export function vortex(T: number, now: number, f: Frame, kick = 0, gain = 1) {
  chart()
  const p = field.p, head = print(T, now, field), c = Math.max(1e-3, C1 * smooth(0.4, 2.2, T) ** 1.5), wet = smooth(1.7, 3.5, T)
  const beta = c * L * rate(T + LEAD), gamma = TAU * beta * RC * RC * K * wet // the inflow's rate and the circulation
  look(T, p, kick)
  p[16] = c, p[17] = LIP, p[18] = (-c * W) / 2, p[19] = c * W
  p[20] = head % ROWS, p[21] = PER / L, p[22] = head - printer.from, p[23] = gain
  p[24] = 0.3 * (1 - smooth(0.4, 1.5, T)) // the plot opens with its black lifted, as the valley's is; it sinks as it curls
  p[25] = clamp(printer.ref - 0.8, -0.15, 0.3) // the reference level, as an offset in the rows' units
  p[26] = (gamma * gamma) / (8 * Math.PI ** 2 * G * RC * RC), p[27] = RC
  p[28] = K * wet, p[29] = 1 / C1, p[30] = U0, p[31] = DU
  p[7] = wet
  field.cell = undefined
  f.field = field
  f.look = { tau: TAU_RASTER }
  live[0] = gamma * M * M // m²/s
  live[1] = beta
  return field
}

const EQ = [0.55, 0.85, 1]
export const wrap: Scene = {
  dur: DUR,
  fade: 1.2, // the valley's flattened falls hand over to this sheet, printing the same plot
  build(t, f) {
    vortex(t, (f.at ?? 0) + t, f, 0, clamp(t / 1.2))
    if (t > 1.2) equation(f, 'z=-\\frac{\\Gamma^2}{8\\pi^2g\\,(r^2+r_c^2)}\\qquad\\Gamma=\\num{0}{000}\\qquad\\frac{dr}{dt}=-\\num{1}{0.00}\\,r', EQ, 0.9 * clamp(t - 1.2), live)
    place(t + LEAD)
    return (tt, o) => sing(tt + LEAD, o)
  },
}

// R0 · Wrap. The fall begins on an SDR waterfall of the soundtrack itself: the falling choir's real
// short-time spectrum, log-frequency across, rows printing at the top. It opens where the valley's falls
// flattened into a plot, at the same scale and in the same place, and we dive into it. The sheet rolls up
// around us until one octave is once around: the nine octaves lie on top of each other, the choir's
// partials (octaves apart) fall into register, and the walls of the tube we fall down are its pitch
// helices, angle for pitch class and depth for time. The head, where the present is printed, glows at the
// end of the tube: we fall toward now and never reach it.
import { BINS, F0, OCTAVES, Waterfall } from '../dsp/waterfall'
import { ROWS, WRAP as SHADER } from '../gpu/fields'
import type { Field } from '../gpu/raster'
import { place, sing } from './choir'
import { TAU, clamp, lock, mix, smooth, view, type Frame, type Scene } from './scene'

export const LEAD = 21 // how long the choir has been falling when the wrap begins: valley.DUR − valley.SING
export const DUR = 7
const W = TAU // an octave's width on the sheet: once around a tube of radius 1
const DY = 0.01 // sheet per printed row
const MAX = 512 // most rows printed in a frame

// The valley's falls end flat as a plot: 80 Hz to 8 kHz across 2.3 half-widths, the lip at y = 0.42 and
// 3.4 s of history in the 1.55 below it. The sheet opens as the same plot: how far away it is, where its
// head prints and how fast it scrolls are set to match, through a lens 0.9 rad wide, 800 Hz centred.
const S0 = 1 / Math.tan(0.45), MID = (Math.log2(800 / F0) - OCTAVES / 2) * W
let d0 = 1, v0 = 1, h0 = 1, aspect = 0

// How fast we travel along the sheet's time axis (first its scroll, then our fall), and how far ahead of
// us the head prints. Their integral is tabulated, and inverted to find when each row was printed.
const speed = (T: number) => mix(v0, 6, smooth(0.8, 3, T)) + 3 * smooth(3.9, 6.5, T) + 6 * smooth(8, 16, T)
const ahead = (T: number) => mix(h0, 10, smooth(2.4, 5, T))
const DT = 1 / 500, Y = new Float64Array(60 * 500), H = new Float64Array(Y.length)
function chart() {
  if (view.a === aspect) return
  aspect = view.a
  d0 = (W * S0 * Math.log2(100)) / (2.3 * aspect)
  h0 = (0.42 * d0) / S0
  v0 = ((1.55 / 3.4) * d0) / S0
  for (let i = 1; i < Y.length; i++) Y[i] = Y[i - 1] + speed(i * DT) * DT
  for (let i = 0; i < Y.length; i++) H[i] = Y[i] + ahead(i * DT)
}
const lerp = (a: Float64Array, T: number) => {
  const x = clamp(T / DT, 0, a.length - 1.001), i = Math.floor(x)
  return a[i] + (a[i + 1] - a[i]) * (x - i)
}
const travel = (T: number) => lerp(Y, T)
const head = (T: number) => lerp(H, T)
function printedAt(y: number) {
  let lo = 0, hi = H.length - 1
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1
    H[m] < y ? (lo = m) : (hi = m)
  }
  return (lo + (y - H[lo]) / (H[hi] - H[lo] || 1)) * DT // before the wrap began, the first scroll held
}

// The camera and the sheet at fall time T.
const cam = { eye: [0, 0, 0], r: [1, 0, 0], u: [0, 1, 0], f: [0, 0, -1], s: 1, rho: 1, cz: 0 }
function look(T: number, kick = 0) {
  chart()
  const d = d0 * (1 / d0) ** smooth(1, 3.4, T) // our distance from the sheet: a dive, steady in log scale
  const c = Math.max(1e-3, smooth(2.4, 4.2, T)) // its curl
  const p = lock([[0, 0], [1.8, Math.PI / 2]], T, 2.2, 0.8) // we pitch up to skim the sheet, then look down the tube it closes into
  const fov = mix(0.9, 1.35, smooth(3, 5.5, T)) + kick
  const v = cam
  v.rho = W / (TAU * c)
  v.cz = v.rho - d
  v.eye[0] = MID * (1 - smooth(1, 2.8, T))
  v.eye[1] = travel(T)
  v.f[1] = Math.sin(p), v.f[2] = -Math.cos(p)
  v.u[1] = Math.cos(p), v.u[2] = Math.sin(p)
  v.s = 1 / Math.tan(fov / 2)
}

// The printer: rows of the waterfall at even spacing along the sheet, each at the moment it was printed.
// A fresh sheet starts with as much history as the speakers still remember. Like a receiver's display it
// sets its own reference level: the loudest rows of the last second or two read just under white.
const water = new Waterfall(), rows = new Uint8Array(2 * BINS * MAX)
const printer = { k: 0, from: 0, T: -1, ref: -1 }
function print(T: number, now: number, f: Field) {
  const top = Math.floor(head(T) / DY), pr = printer, dt = T - pr.T
  if (dt < 0 || dt > 0.5 || top - pr.k > MAX) (pr.k = pr.from = top - MAX), (pr.ref = -1) // a jump: start a fresh sheet
  pr.T = T
  const n = top - pr.k
  let hi = 0
  for (let i = 0; i < n; i++) hi = Math.max(hi, water.row(now - (T - printedAt((pr.k + 1 + i) * DY)), rows, 2 * i * BINS))
  if (n > 0) pr.ref = pr.ref < 0 ? hi : pr.ref + (hi - pr.ref) * (1 - Math.exp(-dt / 1.5))
  f.rows = n > 0 ? { data: rows, at: (((pr.k + 1) % ROWS) + ROWS) % ROWS, n } : undefined
  pr.k = top
  return top
}

// A raster is a fresh picture each frame: under the beam's slow phosphor a moving one would leave a
// ghost of itself every frame behind, strobing echoes, not a blur. Its light fades within the frame.
const TAU_RASTER = 0.006

// The tube at fall time T into the frame: the raster's field and its new rows.
const field: Field = { shader: SHADER, k: 1, p: new Float32Array(28), res: 1.5 } // its lines are drawn a pixel wide
export function tube(T: number, now: number, f: Frame, kick = 0, gain = 1, spot = 0.9) {
  look(T, kick)
  const top = print(T, now, field), v = cam, p = field.p
  p.set(v.eye), (p[3] = v.s)
  p.set(v.r, 4), (p[7] = v.rho)
  p.set(v.u, 8), (p[11] = v.cz)
  p.set(v.f, 12), (p[15] = W)
  p[16] = top * DY, p[17] = DY, p[18] = top % ROWS, p[19] = ROWS
  p[20] = gain, p[21] = top - printer.from, p[22] = speed(T), p[23] = spot
  p[24] = 0.3 * (1 - smooth(0.6, 2.2, T)) // the plot opens with its black lifted, as the valley's is; it sinks as we dive
  p[25] = clamp(printer.ref - 0.8, -0.15, 0.3) // the reference level, as an offset in the rows' units
  field.cell = undefined
  f.field = field
  f.look = { tau: TAU_RASTER }
  return field
}

export const wrap: Scene = {
  dur: DUR,
  fade: 1.2, // the valley's flattened falls hand over to this sheet, printing the same plot
  build(t, f) {
    tube(t, (f.at ?? 0) + t, f, 0, clamp(t / 1.2))
    place(t + LEAD)
    return (tt, o) => sing(tt + LEAD, o)
  },
}

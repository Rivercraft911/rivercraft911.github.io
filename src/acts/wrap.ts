// R0 · Wrap. The fall begins on an SDR waterfall of the soundtrack itself: the falling choir's real
// short-time spectrum, log-frequency across, rows printing at the top under the beam's live spectrum
// trace. We dive into it, and the sheet rolls up around us until one octave is once around: the nine
// octaves lie on top of each other, the choir's partials (octaves apart) fall into register, and the
// walls of the tube we fall down are its pitch helices, angle for pitch class and depth for time. The
// head, where the present is printed, stays ahead of us as a ring: we fall toward now and never reach it.
import { Path } from '../beam/path'
import { BINS, PER, Waterfall } from '../dsp/waterfall'
import { ROWS, WRAP as SHADER } from '../gpu/fields'
import type { Field } from '../gpu/raster'
import { place, sing } from './choir'
import { TAU, clamp, lock, mix, smooth, type Frame, type Scene } from './scene'

export const LEAD = 1.5 // how long the choir has been falling when the wrap begins
export const DUR = 7
const W = TAU // an octave's width on the sheet: once around a tube of radius 1
const DY = 0.01 // sheet per printed row
const MAX = 256 // most rows printed in a frame

// How fast we travel along the sheet's time axis (first its scroll, then our fall), and how far ahead of
// us the head prints. Their integral is tabulated, and inverted to find when each row was printed.
export const speed = (T: number) => 6 + 8 * smooth(1.2, 0, T) + 3 * smooth(3.9, 6.5, T) + 6 * smooth(8, 16, T)
const ahead = (T: number) => mix(8, 10, smooth(2.8, 5, T))
const DT = 1 / 500, Y = new Float64Array(60 * 500), H = new Float64Array(Y.length)
for (let i = 1; i < Y.length; i++) Y[i] = Y[i - 1] + speed(i * DT) * DT
for (let i = 0; i < Y.length; i++) H[i] = Y[i] + ahead(i * DT)
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
  return (lo + (y - H[lo]) / (H[hi] - H[lo] || 1)) * DT
}

// The camera and the sheet at fall time T. Pure: the field shader and the beam both see through it.
export const view = { eye: [0, 0, 0], r: [1, 0, 0], u: [0, 1, 0], f: [0, 0, -1], s: 1, rho: 1, cz: 0, pitch: 0 }
export function look(T: number, kick = 0) {
  const d = 22 * (1 / 22) ** smooth(1, 3.4, T) // our distance from the sheet: a dive, steady in log scale
  const c = Math.max(1e-3, smooth(2.4, 4.2, T)) // its curl
  const p = lock([[0, 0], [2.7, Math.PI / 2]], T, 2.2, 0.8) // we pitch up to look down the tube as it closes
  const fov = mix(0.9, 1.35, smooth(3, 5.5, T)) + kick
  const v = view
  v.rho = W / (TAU * c)
  v.cz = v.rho - d
  v.eye[1] = travel(T)
  v.f[1] = Math.sin(p), v.f[2] = -Math.cos(p)
  v.u[1] = Math.cos(p), v.u[2] = Math.sin(p)
  v.s = 1 / Math.tan(fov / 2)
  v.pitch = clamp(p / (Math.PI / 2))
}

// Screen position of a point, or false behind us.
const o = { x: 0, y: 0, z: 0 }
function project(x: number, y: number, z: number) {
  const { eye, r, u, f, s } = view, dx = x - eye[0], dy = y - eye[1], dz = z - eye[2]
  const depth = dx * f[0] + dy * f[1] + dz * f[2]
  if (depth < 0.05) return false
  o.x = ((dx * r[0] + dy * r[1] + dz * r[2]) * s) / depth
  o.y = ((dx * u[0] + dy * u[1] + dz * u[2]) * s) / depth
  o.z = depth
  return true
}

// The printer: rows of the waterfall at even spacing along the sheet, each at the moment it was printed.
const water = new Waterfall(), rows = new Uint8Array(BINS * MAX)
const printer = { k: 0, from: 0, T: -1 }
function print(T: number, now: number, f: Field) {
  const top = Math.floor(head(T) / DY), pr = printer
  if (T < pr.T || T - pr.T > 0.5 || top - pr.k > MAX) pr.k = pr.from = top - 1 // a jump: start a fresh sheet
  pr.T = T
  const n = top - pr.k
  for (let i = 0; i < n; i++) water.row(now - (T - printedAt((pr.k + 1 + i) * DY)), rows, i * BINS)
  f.rows = n > 0 ? { data: rows, at: (pr.k + 1) % ROWS, n } : undefined
  pr.k = top
  return top
}

// The live spectrum the head is printing, traced by the beam along the head: a panadapter over the flat
// waterfall, and once rolled, a ring at the end of the tunnel with every octave folded onto it.
const trace = new Path()
function head_(p: Path, y: number) {
  const { rho, cz, pitch } = view, l = water.last, h = mix(2.4, 0.55, pitch)
  let pen = false
  for (let m = 0; m < BINS; m += 2) {
    const x = (m / PER - 4.5) * W, a = x / rho, sa = Math.sin(a), ca = Math.cos(a), s = l[m] * h
    const px = rho * sa - pitch * s * sa, py = y + (1 - pitch) * s, pz = cz - rho * ca + pitch * s * ca
    if (!project(px, py, pz)) {
      pen = false
      continue
    }
    p.color(1, mix(0.75, 0.95, l[m]), mix(0.45, 0.85, l[m]), (0.25 * (1 - pitch) + l[m] * l[m]) * mix(1.2, 0.35, pitch))
    pen ? p.lineTo(o.x, o.y) : p.moveTo(o.x, o.y)
    pen = true
  }
  return p
}

// The tube at fall time T into the frame: the raster's field, its new rows, and the head's trace.
const field: Field = { shader: SHADER, k: 1, p: new Float32Array(24) }
export function tube(T: number, now: number, f: Frame, kick = 0) {
  look(T, kick)
  const top = print(T, now, field), v = view, p = field.p, y = top * DY
  p.set(v.eye), (p[3] = v.s)
  p.set(v.r, 4), (p[7] = v.rho)
  p.set(v.u, 8), (p[11] = v.cz)
  p.set(v.f, 12), (p[15] = W)
  p[16] = y, p[17] = DY, p[18] = top % ROWS, p[19] = ROWS
  p[20] = 1, p[21] = top - printer.from
  field.cell = undefined
  f.field = field
  f.ch.push({ w: 1, path: head_(trace.clear(), y) })
  f.rate = 2e6
  return field
}

export const wrap: Scene = {
  dur: DUR,
  build(t, f) {
    tube(t, (f.at ?? 0) + t, f)
    place(t + LEAD)
    return (tt, o) => sing(tt + LEAD, o)
  },
}

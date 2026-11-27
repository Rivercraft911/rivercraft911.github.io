// R-01, the lighthouse: River's RGB raster laser projector at work on an optical breadboard, before the screen it
// paints. All of it is River's: the projector as his Onshape assembly has it (bake-models.mjs bakes it in the pieces
// that move), his two boards as KiCad builds them, set where the assembly sets them, and the frames its firmware
// carries (r01-frames.ts). Its numbers are its own: a 4-facet polygon at 27 000 RPM sweeps 1800 lines a second, one a
// facet, the beam out for the middle 30 % of each sweep, ±27°; 320 pixels, each on its own timestamp; the galvo steps
// the odd lines down and the even lines back up; each laser's four binary-weighted currents give it 16 levels, through
// the firmware's rrrgggbb palette (config.c). The beam's path is the assembly's, straightened through its optics' middles.
//
// It runs at life's speed, 15 frames a second, and the eye holds a frame whole: the picture steady on the screen, and in
// the air between, a pyramid of rays, one to each patch of the picture in that patch's colour, out of the white beam the
// three lasers make at the dichroics. To print a frame it slows to 2000× (a line a second, the beam crossing the
// screen) and quickens back to life as it paints. What is shown is what a camera sees whose shutter is open at least a
// whole facet, and a whole frame once frames come faster than one and a half a second, so nothing ever blinks faster
// than three times a second. A scanned beam on a flat screen draws a pincushion, x = D tan α, y = D tan ε / cos α: so
// does this one. The light in the air is the beams' scatter in a little haze, brightest looking down a beam and toward
// where it heads, drawn many times brighter than it would be; where they meet a mirror or a dichroic, a glint.
//
// Once it has printed it comes apart: the lid lifts, then the deck with its optics, then the air duct, and River's two
// boards come out beside it, each a part; a click on one stands it up before the camera, turning, both faces. A click
// on the screen, or on R-01, prints the next frame.
import { TAU, clamp, smooth } from '../../acts/scene'
import { box, make, prism, quad, tube, type Mat } from '../make'
import { ctx, cross, dot, frame, part, site, solid, turn, unit, type V } from '../ctx'
import { PLACES, type About, type Steer } from '../places'
import { FRAMES } from './r01-frames'
import type { Model, Placed } from '../../gpu/mesh'

// ---- R-01, in its assembly's frame: mm, x and y across the deck, z down, as River's Onshape exported it -----------------
const MM = 0.13 / 182 // radii a millimetre: R-01, 182 mm wide, as wide as a landmark here
const FLOOR = 6.35 // z of its feet's soles
// The light's path: the lasers' apertures (red, green, blue), where the two dichroics join green and blue to red, the
// polygon's facet, the galvo's mirror; z the beam's height, the middle of the polygon's 2 mm facets.
const ZB = -138.3, RED = [-31.9, 25.2], GREEN = [-17.9, 39.2], BLUE = [7.1, 39.2], D1 = [-17.9, 25.2], D2 = [7.1, 25.2], P = [48.93, 25.2]
const G = [44.62, 9.3, -136.6], GAX = [Math.SQRT1_2, -Math.SQRT1_2, 0], GN = [Math.SQRT1_2, Math.SQRT1_2, 0] // the galvo's mirror, its axis, its normal at rest
const POLY = [51.55, 33.42, -138.28] // the polygon's middle; its square's facets face 45° off x, as assembled
// The throw: the polygon's beam, off the galvo at rest. Right of it as it goes, and up.
const DIN = unit([G[0] - P[0], G[1] - P[1], 0]), K = dot(DIN, GN), T = DIN.map((x, i) => x - 2 * K * GN[i]), S = [-T[1], T[0], 0], U = [0, 0, -1]
const TILT = 1 / (2 * Math.abs(K)) // the galvo's turn for a turn of the beam: its axis lies in the beam's plane, so not ½
// The screen, D along the throw from the galvo's mirror: its middle, and its panel's half width and height round the
// picture; and the breadboard, along the throw from under R-01's middle, across it, and thick.
const D = 200, SC = [G[0] + D * T[0], G[1] + D * T[1], G[2]], SW = 112, SH = 50
const B0 = -125, B1 = 275, BS = 125, BT = 25
const CROSS = Math.hypot((B1 - B0) / 2, BS) * MM // the breadboard's half diagonal, radii

// ---- the scan ------------------------------------------------------------------------------------------------------------
const NX = 320, NY = 120
const W0 = 0.35, WIN = 0.3, AW = (WIN * Math.PI) / 2 // the beam is out for the middle 30 % of a facet: ±27°
const E = (NY / NX) * AW // and the frame spans ±10.1° of elevation: square pixels at its middle (assumed)
const line = (j: number) => (j < 60 ? 2 * j + 1 : 238 - 2 * j) // slot j of a frame paints this line: the galvo's order
const slot = (L: number) => (L & 1 ? (L - 1) / 2 : 119 - L / 2)
const alpha = (h: number) => AW * (2 * h - 1) // a sweep h of the way across, left to right as it throws
const elev = (L: number) => E * (1 - (2 * L) / NY) // the top of line L
// Where on the screen (mm right and up of its middle) the beam lands at sweep h, elevation e.
const su = (h: number) => D * Math.tan(alpha(h)), sv = (h: number, e: number) => (D * Math.tan(e)) / Math.cos(alpha(h))

// The lasers' light, linear: 638, 520 and 450 nm (assumed), as near as the display's primaries come.
const LASER = [[1, 0.02, 0.005], [0.02, 1, 0.12], [0.1, 0.02, 1]]
// A byte's level on laser c, 0–15, as the firmware's palette makes it: rrr × 15/7, ggg × 15/7, bb × 5.
const lv = (v: number, c: number) => (c === 2 ? (v & 3) * 5 : ((((v >> (c ? 2 : 5)) & 7) * 15) / 7) | 0)

// The frames, unpacked, with each line's running sum of each laser's power along it (in pixels at full power) and each
// slot's, in the galvo's order, so the light over any span of the scan is a difference of two sums; and the first slot
// with any light in it.
const pics = FRAMES.map((s) => {
  const b = Uint8Array.from(atob(s), (ch) => ch.charCodeAt(0)), px = new Uint8Array(NX * NY)
  for (let i = 0, o = 0; i < b.length; i += 2) px.fill(b[i + 1], o, (o += b[i]))
  const sum = new Float32Array(NY * (NX + 1) * 3), slots = new Float32Array((NY + 1) * 3)
  for (let L = 0; L < NY; L++)
    for (let x = 0; x < NX; x++)
      for (let c = 0, o = (L * (NX + 1) + x) * 3; c < 3; c++) sum[o + 3 + c] = sum[o + c] + lv(px[L * NX + x], c) / 15
  for (let j = 0; j < NY; j++) for (let c = 0; c < 3; c++) slots[(j + 1) * 3 + c] = slots[j * 3 + c] + sum[(line(j) * (NX + 1) + NX) * 3 + c]
  let first = 0
  while (first < NY - 1 && slots[(first + 1) * 3] + slots[(first + 1) * 3 + 1] + slots[(first + 1) * 3 + 2] === 0) first++
  return { px, sum, slots, first }
})
type Pic = (typeof pics)[number]
// Laser c's light from the frame's start to q facets into it (pixels at full power).
function energy(f: Pic, q: number, c: number) {
  const F = Math.floor(q / NY), j = Math.floor(q - F * NY), x = ((q - F * NY - j - W0) / WIN) * NX
  let e = F * f.slots[NY * 3 + c] + f.slots[j * 3 + c]
  if (x <= 0) return e
  const row = line(j) * (NX + 1) * 3, i = Math.min(NX, Math.floor(x))
  e += f.sum[row + i * 3 + c]
  if (i < NX) e += (x - i) * (f.sum[row + (i + 1) * 3 + c] - f.sum[row + i * 3 + c])
  return e
}

// ---- what is not in the CAD, in millimetres -------------------------------------------------------------------------
// Each frame as its light on the screen: a run of a line's pixels the same byte is one quad, in the pincushion the scan
// draws, each line standing DZ further back than the one painted before it, so a dark card drawn between two depths
// shows exactly the lines painted so far (and the screen's face lies behind them all). Model x right, y up, z out of
// the screen toward R-01.
const DZ = 0.002
const ink = new Map<number, Mat>(), pixel = (v: number) => ink.get(v) ?? (ink.set(v, { col: [0, 1, 2].map((i) => LASER.reduce((a, l, c) => a + (l[i] * lv(v, c)) / 15, 0)).concat(1), metal: 0, rough: 1 }), ink.get(v)!)
pics.forEach((f, k) =>
  make(`r01-frame-${k}`, () => {
    for (let L = 0; L < NY; L++)
      for (let x = 0, z = -slot(L) * DZ, et = elev(L), eb = elev(L + 1); x < NX; ) {
        const v = f.px[L * NX + x]
        let w = 1
        while (x + w < NX && w < 32 && f.px[L * NX + x + w] === v) w++ // (short enough that its edges follow the bow)
        const h0 = x / NX, h1 = (x + w) / NX
        if (v) quad(pixel(v), [su(h0), sv(h0, eb), z], [su(h1), sv(h1, eb), z], [su(h1), sv(h1, et), z], [su(h0), sv(h0, et), z], [0, 0, 1])
        x += w
      }
  }),
)
const BLACK = { col: [0.012, 0.012, 0.014, 1], metal: 0, rough: 0.85 }
make('r01-card', () => box(BLACK, [-0.5, -0.5, -0.5], [0.5, 0.5, 0.5]))
// The screen: a black panel in a thin aluminium frame, its face behind every line of a frame; it stands on two optical
// posts, which slide in their holders on the breadboard (a post a unit long, drawn as long as it stands).
make('r01-screen', () => {
  const alu = { col: [0.5, 0.51, 0.53, 1], metal: 1, rough: 0.35 }
  box(BLACK, [-SW, -SH, -6], [SW, SH, -0.3])
  for (const s of [-1, 1]) box(alu, [s > 0 ? SW : -SW - 3, -SH - 3, -6], [s > 0 ? SW + 3 : -SW, SH + 3, 1.5]), box(alu, [-SW, s > 0 ? SH : -SH - 3, -6], [SW, s > 0 ? SH + 3 : -SH, 1.5])
})
make('r01-post', () => tube({ col: [0.62, 0.62, 0.64, 1], metal: 1, rough: 0.22 }, [0, 0, 0], [0, 1, 0], 6.35, 6.35, 1, 24, true))
const POST = [-1, 1].map((s) => [0, 1].map((i) => SC[i] + s * (SW - 30) * S[i] + 3 * T[i]).concat(FLOOR - 6)) // their feet, in their holders
// The optical breadboard: black anodised aluminium, M6 holes on a 25 mm grid, and the screen's post holders. Model x
// along the throw, y up, z across it to the right; its top 0.
make('r01-bench', () => {
  const plate = { col: [0.03, 0.032, 0.036, 1], metal: 0.8, rough: 0.45 }, hole = { col: [0.003, 0.003, 0.004, 1], metal: 0, rough: 1 }
  box(plate, [B0, -BT, -BS], [B1, 0, BS])
  for (let x = B0 + 12.5; x < B1; x += 25) for (let z = 12.5 - BS; z < BS; z += 25) tube(hole, [x, 0, z], [0, 1, 0], 3.3, 3.3, 0.05, 10)
  for (const f of POST) {
    const x = f[0] * T[0] + f[1] * T[1], z = f[0] * S[0] + f[1] * S[1]
    box(BLACK, [x - 16, 0, z - 16], [x + 16, 6, z + 16])
  }
})
// The polygon at speed, as a camera's shutter takes it: within its facets' inradius always mirror, out to their corners
// less and less of the time, 1 − (4/π) acos(a/r) of it. Model y its axis.
make('r01-whirl', () => {
  const a = 14.2 / 2, at = (r: number) => ({ col: [0.92, 0.92, 0.93, 1 - (4 / Math.PI) * Math.acos(a / r)], metal: 1, rough: 0.06 })
  tube({ col: [0.92, 0.92, 0.93, 1], metal: 1, rough: 0.06 }, [0, -1, 0], [0, 1, 0], a, a, 2, 48, true)
  for (const r of [7.6, 8.4, 9.3]) tube(at(r), [0, -1, 0], [0, 1, 0], r, r, 2, 48)
})
// Light in the air, per laser: a pencil (a unit square, drawn to face the eye) and a sweep's sheet (a triangle, its apex
// at the origin). Barely there, they add their light to what is behind them.
for (let c = 0; c < 3; c++) {
  const m = { col: [...LASER[c], 1 / 255], metal: 0, rough: 1 }
  make(`r01-ray-${c}`, () => prism(m, [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]], 0, 0))
  make(`r01-fan-${c}`, () => prism(m, [[0, 0], [1, -1], [1, 1]], 0, 0))
}
// And each frame's light in the air, as the eye holds it: from the galvo's mirror (D out of the screen) a ray to every
// RAYth pixel of every other line, where it is lit, a pixel wide where it lands and in that pixel's colour (each ray
// standing for the light to the pixels round it); the lines in groups of GROUP slots, so the rays of only the lines
// painted lately can be drawn. Screen coordinates, as the frame's.
const RAY = 32, GROUP = 8
const tint = new Map<number, Mat>()
pics.forEach((f, k) => {
  for (let g = 0; g < NY / GROUP; g++)
    make(`r01-air-${k}-${g}`, () => {
      for (let j = g * GROUP; j < (g + 1) * GROUP; j += 2)
        for (let L = line(j), x = 0; x < NX; x += RAY) {
          const i = x + RAY / 2, c = [0, 1, 2].map((ch) => lv(f.px[L * NX + i], ch) / 15), key = f.px[L * NX + i]
          if (!key) continue
          const m = tint.get(key) ?? (tint.set(key, { col: [0, 1, 2].map((q) => LASER.reduce((a, l, ch) => a + l[q] * c[ch], 0)).concat(1 / 255), metal: 0, rough: 1 }), tint.get(key)!)
          const h = (i + 0.5) / NX, u = su(h), v = sv(h, elev(L + 0.5)), w = (su(h + 0.5 / NX) - su(h - 0.5 / NX)) / 2
          quad(m, [0, 0, D], [u - w, v, 0], [u + w, v, 0], [u + w, v, 0], [0, 0, 1])
        }
    })
})

// ---- where it all is, this frame ----------------------------------------------------------------------------------------
const n: V = [0, 0, 0], e: V = [0, 0, 0], N: V = [0, 0, 0], Tw: V = [0, 0, 0], Sw: V = [0, 0, 0], A: V = [0, 0, 0], B: V = [0, 0, 0], O: V = [0, 0, 0]
// An assembly point (mm) in the world, and an assembly direction.
const at = (p: ArrayLike<number>, o: V) => {
  for (let i = 0; i < 3; i++) o[i] = O[i] + MM * (p[0] * A[i] + p[1] * B[i] - p[2] * n[i])
  return o
}
const dir = (p: ArrayLike<number>, o: V) => {
  for (let i = 0; i < 3; i++) o[i] = p[0] * A[i] + p[1] * B[i] - p[2] * n[i]
  return o
}
// Model `id`, its own origin at assembly point p, its axes along assembly directions X, Y, Z (their lengths scale it),
// `unit` mm a model unit (River's GLBs are in metres). Its light: lit by the sky `k`, its own `glow`.
const wx: V = [0, 0, 0], wy: V = [0, 0, 0], wz: V = [0, 0, 0], q: V = [0, 0, 0], c: V = [0, 0, 0]
function put(id: string, p: ArrayLike<number>, X: ArrayLike<number>, Y: ArrayLike<number>, Z: ArrayLike<number>, unit = 1000, k = 1, glow = 0) {
  const m = ctx.models[id]
  if (!m) return
  const mx = (m.lo[0] + m.hi[0]) / 2, my = (m.lo[1] + m.hi[1]) / 2, mz = (m.lo[2] + m.hi[2]) / 2
  for (let i = 0; i < 3; i++) q[i] = p[i] + unit * (X[i] * mx + Y[i] * my + Z[i] * mz)
  solid(id, at(q, c), dir(X, wx), dir(Y, wy), dir(Z, wz), MM * unit * Math.max(m.hi[0] - m.lo[0], m.hi[1] - m.lo[1], m.hi[2] - m.lo[2]), k, glow)
}
const X0 = [1, 0, 0], Y0 = [0, 1, 0], Z0 = [0, 0, 1], NT = [-T[0], -T[1], 0], sc = [...SC], PY = [0, 0, 0]

// ---- the state of things -----------------------------------------------------------------------------------------------
// The projector's own time in facets swept, and the slowing (log10 of how many times slower than life): running, and
// starting a frame. A print: fade what is on the screen and slow, then paint the next frame from facet q0, a line or two
// at the slowest, then quickening back to life. (It starts at the frame's first line with light in it: the dark ones
// before are painted as soon as the screen is dark.) It comes apart a while after it has printed on arriving.
const RUN = 0, START = Math.log10(2000), FADE = 0.8, DWELL = 1.6, QUICKEN = 4, APART = 9
let qf = 0.5, shown = 0, next = 0, q0 = -NY, printed = NY, from = -Infinity, began = -1e9, lit = 1, visit = false
function print() {
  if (ctx.t - began < FADE) return
  next = (shown + 1) % pics.length, began = ctx.t, printed = -1
}
// A click on the screen, or on R-01 itself (or its name), prints the next frame, and the camera goes to watch it.
addEventListener('part', (ev) => {
  const id = (ev as CustomEvent<string>).detail
  if (id === 'screen' || id === 'r01') print()
})
// What is coming apart, and the boards picked: each a critically damped follower, [where, how fast].
const go = new Float64Array(6), turned = [0, 0] // (and how long each board has been turning, picked)
function ease(i: number, to: number, w: number, dt: number) {
  go[i + 1] += (w * w * (to - go[i]) - 2 * w * go[i + 1]) * dt
  go[i] += go[i + 1] * dt
  return clamp(go[i])
}
export const now = { L: 0, on: 0, pic: pics[0] } // the line being painted and whether the lasers are on (for the voice)
// What the world's music answers (sound.ts): each line as it is painted, its pitch its brightest laser's harmonic of
// the 120 Hz root (red the second, green the third, blue the fifth; 0 for a dark line), and each frame's end, the root.
export const events = { n: 0, f: 0 }
let counted = 0

// ---- the beams ---------------------------------------------------------------------------------------------------------
// Light in the air is light, not a thing: the path tracer, which takes only what holds still, is not to take it for a
// lamp. So it never holds still: each frame a pencil, a sheet and a glint is drawn turned end for end (the same light),
// and every other frame the rays come one place later among the solids.
let flip = 1
const NOTHING: Placed = { model: undefined as unknown as Model, m: new Array(12).fill(0), k: 0, glow: 0 } // a solid of no size
// The brightness of a pencil, a sheet's and the rays' lift over a pencil's light spread as they spread it, a glint's,
// and the beams' width (mm, assumed).
const RAYK = 50000, FANK = 2, AIRK = 20000, GLINT = 2500, BEAM = 1.2
// How much light a haze sends toward the eye at angle th from a beam's way: Henyey–Greenstein, g 0.6, against its sideways.
const hg = (cos: number) => ((1 + 0.36) / (1 + 0.36 - 1.2 * cos)) ** 1.5
const ra: V = [0, 0, 0], rb: V = [0, 0, 0], ax: V = [0, 0, 0], ay: V = [0, 0, 0], az: V = [0, 0, 0], mid: V = [0, 0, 0], to: V = [0, 0, 0]
// Laser c's pencil from assembly point a to b, its power p (of full, averaged over the shutter).
function ray(ch: number, a: ArrayLike<number>, b: ArrayLike<number>, p: number) {
  if (!(p > 1e-3)) return
  at(a, ra), at(b, rb)
  for (let i = 0; i < 3; i++) (ax[i] = rb[i] - ra[i]), (mid[i] = (ra[i] + rb[i]) / 2), (to[i] = ctx.E[i] - mid[i])
  const L = Math.hypot(ax[0], ax[1], ax[2]), d = Math.hypot(to[0], to[1], to[2]), cos = dot(ax, to) / (L * d)
  const w = Math.max(BEAM * MM, (1.6 * d) / ctx.ppr) // never under a pixel and a half wide: its light spread over it
  cross(ax, to, ay), unit(ay), cross(ax, ay, az), unit(az)
  for (let i = 0; i < 3; i++) (ax[i] *= flip), (ay[i] *= w * flip)
  solid(`r01-ray-${ch}`, mid, ax, ay, az, 1, 0, (RAYK * p * hg(cos) * BEAM * MM) / (w * Math.max(Math.sqrt(1 - cos * cos), 0.15)))
}
// Laser c's sheet from apex a to the segment b0–b1, power p, swept through `wide` radians: a pencil's light spread over
// the sheet, as many times fainter as the sheet is wider than a beam, seen through it.
function fan(ch: number, a: ArrayLike<number>, b0: ArrayLike<number>, b1: ArrayLike<number>, p: number, wide: number) {
  if (!(p > 1e-3)) return
  at(a, ra), at(b0, rb), at(b1, mid)
  for (let i = 0; i < 3; i++) (ax[i] = (rb[i] + mid[i]) / 2 - ra[i]), (ay[i] = ((mid[i] - rb[i]) / 2) * flip), (to[i] = ctx.E[i] - ra[i] - ax[i] * 0.67)
  cross(ax, ay, az), unit(az)
  const L = Math.hypot(ax[0], ax[1], ax[2]), d = Math.hypot(to[0], to[1], to[2]), cos = dot(ax, to) / (L * d), face = Math.abs(dot(az, to)) / d
  const spread = Math.max(1, (0.67 * L * wide) / (BEAM * MM))
  for (let i = 0; i < 3; i++) ra[i] += ax[i] / 2 // (a model is placed by its box's middle; this one's is 2 across)
  solid(`r01-fan-${ch}`, ra, ax, ay, az, 2, 0, (FANK * RAYK * p * hg(cos)) / spread / Math.max(face, 0.3))
}

// A glint of laser c's light where it meets an optic at assembly point a, s mm across, as bright as p.
function glint(ch: number, a: ArrayLike<number>, s: number, p: number) {
  if (!(p > 1e-3)) return
  at(a, mid)
  for (let i = 0; i < 3; i++) (ax[i] = ctx.p[4 + i] * s * MM * flip), (ay[i] = ctx.p[8 + i] * s * MM * flip), (az[i] = ctx.p[12 + i])
  solid(`r01-ray-${ch}`, mid, ax, ay, az, 1, 0, GLINT * p)
}
// How much of the time a window of the scan from slot a to b (facets since the frame began) spends on slots j0 to j1.
function within(a: number, b: number, j0: number, j1: number) {
  let s = 0
  for (let k = Math.floor((a - j1) / NY); k * NY + j0 < b; k++) s += Math.max(0, Math.min(b, k * NY + j1) - Math.max(a, k * NY + j0))
  return s / Math.max(b - a, 1e-9)
}

// ---- each frame ----------------------------------------------------------------------------------------------------------
const TURN = -0.35 // the throw's bearing, east of north
const e0 = [0, 0, 0], e1 = [0, 0, 0], e2 = [0, 0, 0], e3 = [0, 0, 0], avg = [0, 0, 0], Q0: number[] = [0, 0, 0], Q1: number[] = [0, 0, 0]
const card = [0, 0, 0], cx = [0, 0, 0], cy = [0, 0, 0], cz = [0, 0, 0]
export function draw(k: number) {
  const Pl = PLACES[k], t = ctx.t, dt = Math.max(0, ctx.dt), here = ctx.focus === k
  site(Pl.lat, Pl.lon, n), frame(n, e, N)
  const far = Math.hypot(n[0] - ctx.E[0], n[1] - ctx.E[1], n[2] - ctx.E[2])
  for (let i = 0; i < 3; i++) (Tw[i] = Math.cos(TURN) * N[i] + Math.sin(TURN) * e[i]), (Sw[i] = 0)
  cross(Tw, n, Sw)
  // the assembly's x and y in the world, the throw being T in it; the breadboard's middle is the place, its corners on
  // the ground, so its top stands over the ground in its middle by its thickness less the planet's fall over its half diagonal
  for (let i = 0; i < 3; i++) (A[i] = T[0] * Tw[i] - T[1] * Sw[i]), (B[i] = T[1] * Tw[i] + T[0] * Sw[i])
  const top = 1.0005 - (CROSS * CROSS) / 2 + (BT + FLOOR) * MM
  for (let i = 0; i < 3; i++) O[i] = n[i] * top - Tw[i] * MM * ((B0 + B1) / 2)

  // ---- the projector's time: a print slows it, paints, and quickens; else it runs ----
  if (here && ctx.since >= 0.6 && !visit) (visit = true), print() // arriving, it prints the next frame
  if (!here) visit = false
  const u = t - began, painting = u >= FADE
  if (painting && printed < 0) (shown = next), (printed = from = pics[next].first), (q0 = Math.ceil(qf) - printed)
  const lg = u < FADE ? RUN + (START - RUN) * smooth(0, FADE, u) : START + (RUN - START) * smooth(FADE + DWELL, FADE + DWELL + QUICKEN, u)
  const rate = 1800 / 10 ** lg // facets a second, here
  qf += rate * Math.min(dt, 0.1)
  lit = u < FADE ? 1 - smooth(0, FADE, u) : 1 // the frame on the screen, fading as a print begins
  const f = pics[shown], qn = qf - q0 // facets into the frame
  if (printed >= 0) printed = Math.min(NY, qn)
  // What the eye holds of the scan (facets): a display frame's worth, or a whole facet once the beam would blink three
  // times a second; a quarter second's once lines come fast; a whole frame once frames come faster than one and a half a
  // second (so nothing in the air flickers); and never from before the frame being printed began.
  const shut = rate * dt + (1 - rate * dt) * clamp((rate - 1) / 2), held = Math.max(shut, rate * 0.25 * smooth(3, 8, rate), NY * smooth(60, 180, rate))
  const win = Math.min(qn - from, held), qa = qn - Math.max(win, 0), j = ((Math.floor(qn) % NY) + NY) % NY
  const on = painting ? 1 : 0 // (the lasers are dark while the screen fades)
  for (let ch = 0; ch < 3; ch++) {
    const p = win > 0 ? (on * Math.max(0, energy(f, qn, ch) - energy(f, qa, ch))) / ((win * NX) / WIN) : 0
    avg[ch] += (p - avg[ch]) * (1 - Math.exp(-dt / 0.12)) // (and the eye's own tenth of a second: no line's light snaps on or off)
  }
  now.L = line(j), now.on = on, now.pic = f
  if (Math.floor(qn) !== counted && (counted = Math.floor(qn)) >= 0 && on && (rate < 25 || (j === NY - 1 && rate < 240))) {
    // (lines only while they come slower than 25 a second, frames' ends slower than 2)
    const row = now.L * (NX + 1) * 3, lum = [0, 1, 2].map((c) => f.sum[row + 3 * NX + c] - f.sum[row + c]), c = lum.indexOf(Math.max(...lum))
    events.n++, (events.f = j === NY - 1 ? 120 : lum[c] > 0 ? 120 * HARM[c] : 0)
  }
  const ha = Math.floor(qa) === Math.floor(qn) ? clamp((qa - Math.floor(qa) - W0) / WIN) : 0, hb = clamp((qn - Math.floor(qn) - W0) / WIN)
  const fast = win >= 1, h0 = fast ? 0 : ha, h1 = fast ? 1 : hb

  // ---- coming apart, and the boards picked ----
  const apart = ease(0, here && (ctx.since > APART || ctx.picked === 'laserbrain' || ctx.picked === 'laserdriver') ? 1 : 0, 2.2, Math.min(dt, 0.05))
  const kLid = smooth(0, 0.55, apart), kDeck = smooth(0.2, 0.75, apart), kDuct = smooth(0.3, 0.8, apart), kOut = smooth(0.45, 1, apart)
  const pB = smooth(0, 1, ease(2, ctx.picked === 'laserbrain' ? 1 : 0, 3, Math.min(dt, 0.05))), pD = smooth(0, 1, ease(4, ctx.picked === 'laserdriver' ? 1 : 0, 3, Math.min(dt, 0.05)))
  const up = -95 * kDeck // the deck and all on it

  // ---- the hardware ----
  put('r01-bench', [0, 0, FLOOR], T, U, S, 1)
  put('r01-base', [0, 21.69, -61.82], X0, Y0, Z0)
  put('r01-duct', [0, 1.62, -69 - 45 * kDuct], X0, Y0, Z0)
  put('r01-deck', [0, 1.62, -107.1 + up], X0, Y0, Z0)
  put('r01-lid', [-1.59, 1.62, -144.68 - 175 * kLid], X0, Y0, Z0)
  // the galvo's mirror, stood up to throw the beam level, then turned for the line being painted (at speed, a blur about
  // its middle)
  const tilt = Math.PI / 2 - TILT * (elev(now.L) - E / NY) * (1 - smooth(30, 300, rate))
  turn(X0, GAX, tilt, e0), turn(Y0, GAX, tilt, e1), turn(Z0, GAX, tilt, e2)
  put('r01-galvo-mirror', [G[0], G[1], G[2] + up], e0, e1, e2)
  // the polygon: its facet at the middle of its sweep halfway through each facet's time; at speed, a blur
  const th = -0.1309 - (qf - 0.5) * (Math.PI / 2), spin = rate / 4
  e0[0] = Math.cos(th), e0[1] = Math.sin(th), e0[2] = 0, e1[0] = -Math.sin(th), e1[1] = Math.cos(th), e1[2] = 0
  if (spin < 1.5) put('r01-polygon-mirror', [POLY[0], POLY[1], POLY[2] + up], e0, e1, Z0)
  else put('r01-whirl', [POLY[0], POLY[1], POLY[2] + up], X0, U, [0, 1, 0], 1)
  // River's boards: where the assembly has them, KiCad's x and its y down the page turned 135° about the vertical,
  // top up; out beside R-01 as it comes apart; and picked, lifted a little where they are and stood up, turning
  if (far < 1.2) {
    board('laserdriver', [-26.87, 10.24, -98.22 + up], [-26.87 - 200 * S[0] + 20 * T[0], 10.24 - 200 * S[1] + 20 * T[1], -165], kOut, pD, 0, dt, here)
    board('laserbrain', [0, 1.61, -46.71], [-60 * T[0] - 175 * S[0], -60 * T[1] - 175 * S[1], -70], kOut, pB, 1, dt, here)
  }

  // ---- the screen and what is painted on it ----
  // (as it comes apart the screen rises with the optics, on its posts, so the light stays level and true)
  sc[0] = SC[0], sc[1] = SC[1], sc[2] = SC[2] + up
  put('r01-screen', sc, S, U, NT, 1)
  for (const f of POST) (PY[2] = sc[2] + SH + 3 - f[2]), put('r01-post', f, S, PY, NT, 1) // (up from its foot to the panel)
  put(`r01-frame-${shown}`, sc, S, U, NT, 1, 0, 22 * lit)
  // the card behind the lines painted so far; and in front of the line being painted, over what the beam has yet to reach
  const done = printed < 0 ? NY : Math.floor(printed), zc = printed < 0 ? -(NY + 0.25) * DZ : -(done + 0.25) * DZ
  for (let i = 0; i < 3; i++) (card[i] = sc[i] - zc * T[i]), (cx[i] = 2 * SW * S[i]), (cy[i] = 2 * SH * U[i]), (cz[i] = (DZ / 8) * NT[i])
  put('r01-card', card, cx, cy, cz, 1)
  if (printed >= 0 && done < NY) {
    const L = line(done), h = clamp((qn - Math.floor(qn) - W0) / WIN), x0 = su(h), ym = sv(h, elev(L + 0.5))
    for (let i = 0; i < 3; i++) (card[i] = sc[i] + ((x0 + SW) / 2) * S[i] + ym * U[i] - (-done + 0.75) * DZ * T[i]), (cx[i] = (SW - x0) * S[i]), (cy[i] = 4 * (sv(h, E / NY) - sv(h, 0)) * U[i])
    put('r01-card', card, cx, cy, cz, 1)
  }

  // ---- the light in the air ----
  if (far < 1.5) {
    // the three lasers, green joining red at the first dichroic and blue at the second, all three on to the facet; a
    // glint where each meets an optic
    const z = ZB + up
    flip = -flip
    e0[0] = RED[0], e0[1] = RED[1], e0[2] = z, e1[0] = P[0], e1[1] = P[1], e1[2] = z, e3[0] = G[0], e3[1] = G[1], e3[2] = G[2] + up
    ray(0, e0, e1, avg[0])
    e0[0] = GREEN[0], e0[1] = GREEN[1], e2[0] = D1[0], e2[1] = D1[1], e2[2] = z
    ray(1, e0, e2, avg[1]), ray(1, e2, e1, avg[1]), glint(0, e2, 3, avg[0]), glint(1, e2, 3, avg[1])
    e0[0] = BLUE[0], e0[1] = BLUE[1], e2[0] = D2[0], e2[1] = D2[1]
    ray(2, e0, e2, avg[2]), ray(2, e2, e1, avg[2])
    for (let ch = 0; ch < 3; ch++) glint(ch, e2, 3, avg[ch]), glint(ch, e1, 4, avg[ch]), glint(ch, e3, 4, avg[ch])
    // from the facet to the galvo's mirror, through the angles swept
    sweep(h0, Q0, G[2] + up), sweep(h1, Q1, G[2] + up)
    const wide = (h1 - h0) * 2 * AW, kept = smooth(1.5, 4, win) // (how much more than a line the eye holds)
    for (let ch = 0; ch < 3; ch++) fan(ch, e1, Q0, Q1, avg[ch], wide)
    // and from it out to the screen: the line being swept, or, as the eye holds more of the scan, the rays of the lines
    // painted lately, each group of them as bright as its share of the time
    if (kept < 1) {
      screen(h0, now.L, Q0), screen(h1, now.L, Q1)
      for (let ch = 0; ch < 3; ch++) fan(ch, e3, Q0, Q1, avg[ch] * (1 - kept), wide)
    }
    if (kept > 0 && on) {
      for (let i = 0; i < 3; i++) e0[i] = (sc[i] + e3[i]) / 2
      at(e0, mid)
      for (let i = 0; i < 3; i++) to[i] = ctx.E[i] - mid[i]
      const ward = hg(dot(to, Tw) / Math.hypot(to[0], to[1], to[2])) // (the haze's scatter toward the eye, from the throw)
      if (flip > 0 && ctx.models['r01-card']) (NOTHING.model = ctx.models['r01-card']), ctx.items.push(NOTHING) // (it only moves the rays along one)
      for (let g = 0; g < NY / GROUP; g++) {
        const w = within(qa, qn, g * GROUP, (g + 1) * GROUP)
        if (w > 1e-3) put(`r01-air-${shown}-${g}`, sc, S, U, NT, 1, 0, AIRK * ward * w * kept)
      }
    }
  }

  // ---- what can be clicked (each as big as it is, so the camera comes to it as near as that) ----
  if (here) {
    part('screen', at(sc, c), (SW + 3) * MM)
    part('optics', at([0, 1.62, -135 + up], c), 90 * MM)
    part('r01', at([0, 21.69, -61.82], c), 111 * MM)
  }
}

// Where the beam meets the galvo's mirror at sweep h: off the facet, turned by twice the facet's turn, the other way
// round from how it leaves the galvo.
const dd = [0, 0, 0]
function sweep(h: number, o: number[], z: number) {
  const a = -alpha(h), ca = Math.cos(a), sa = Math.sin(a)
  dd[0] = DIN[0] * ca - DIN[1] * sa, dd[1] = DIN[0] * sa + DIN[1] * ca
  const s = ((G[0] - P[0]) * GN[0] + (G[1] - P[1]) * GN[1]) / (dd[0] * GN[0] + dd[1] * GN[1])
  o[0] = P[0] + s * dd[0], o[1] = P[1] + s * dd[1], o[2] = z
}
// Where on the screen line L's middle is at sweep h (assembly mm).
function screen(h: number, L: number, o: number[]) {
  const x = su(h), y = sv(h, elev(L + 0.5))
  for (let i = 0; i < 3; i++) o[i] = sc[i] + x * S[i] + y * U[i]
}

// A board at rest at assembly point `rest`, out beside R-01 at `out` as it comes apart (k), and picked (p) lifted a
// little higher where it is and stood up, turning slowly about the vertical: both its faces, where the camera comes to
// see them. Its axes: KiCad's x, the board's top, KiCad's y down the page; as assembled, turned 135° about the
// vertical, top up.
const RZ = [-Math.SQRT1_2, -Math.SQRT1_2, 0], DOWN = [0, 0, 1], hold = [0, 0, 0], BY = [0, 0, 0], BZ = [0, 0, 0], BX = [0, 0, 0]
const FACE = Math.atan2(-S[1], -S[0]), LIFT = 45 // (standing, it first faces the camera's side of R-01)
function board(id: string, rest: number[], out: number[], k: number, p: number, which: number, dt: number, here: boolean) {
  const m = ctx.models[id]
  if (!m) return
  turned[which] = p > 0.01 ? turned[which] + dt : 0
  const a = FACE + 0.35 * turned[which]
  BY[0] = Math.cos(a), BY[1] = Math.sin(a), BY[2] = 0
  for (let i = 0; i < 3; i++) {
    hold[i] = rest[i] + (out[i] - rest[i]) * k - (i === 2 ? LIFT * p : 0)
    BY[i] = U[i] + (BY[i] - U[i]) * p
    BZ[i] = RZ[i] + (DOWN[i] - RZ[i]) * p
  }
  unit(BY)
  const kk = dot(BY, BZ)
  for (let i = 0; i < 3; i++) BZ[i] -= kk * BY[i]
  unit(BZ), cross(BY, BZ, BX)
  put(id, hold, BX, BY, BZ)
  if (here) part(id, at(hold, c), 500 * MM * Math.max(m.hi[0] - m.lo[0], m.hi[2] - m.lo[2]))
}

// ---- the camera ----------------------------------------------------------------------------------------------------------
// At rest the camera stands behind R-01 and to its left, the light going away from it to the screen; arriving, it starts
// close on the optics and draws back; when it comes apart, nearer the boards. (A part picked, the world takes the camera
// to it.)
const off = [0, 0, 0], LOOK = [0, 0, 0], OPTICS = [10, 25, ZB], MIDDLE = [(G[0] + SC[0]) / 2, (G[1] + SC[1]) / 2, G[2] + 10]
export function steer(since: number, _picked: string, o: Steer) {
  if (!n[0] && !n[1] && !n[2]) return false // (not drawn yet)
  const [d, pitch, yaw] = PLACES[PLACES.findIndex((P) => P.id === 'lighthouse')].view
  const on = (p: number[]) => {
    at(p, off)
    for (let i = 0; i < 3; i++) o.at[i] = off[i] - n[i] * 1.01
  }
  if (since > APART) {
    on([-90 * S[0], -90 * S[1], -150])
    return (o.d = d * 0.95), (o.pitch = pitch * 0.8), (o.yaw = yaw - 0.25), true
  }
  // arriving: close on the three lasers joining as the first line is swept, slowly; then back, as it quickens, to the
  // light between it and the screen
  const k = smooth(2.8, 6.5, since)
  for (let i = 0; i < 3; i++) LOOK[i] = OPTICS[i] + (MIDDLE[i] - OPTICS[i]) * k
  on(LOOK)
  return (o.d = 0.26 + (d - 0.26) * k), (o.pitch = 0.62 + (pitch - 0.62) * k), (o.yaw = yaw + 0.35 * (1 - k)), true
}

// What can be clicked here.
export const about: Record<string, About> = {
  laserdriver: {
    name: 'LaserDriverRGB',
    does: 'Twelve iC-HG30 laser switches, four to a laser, each channel’s current set at boot by one of three MCP4728 DACs in binary weights, so the enable pins are the colour: 16 levels a laser, switched pixel by pixel.',
    board: 'laserdriver',
  },
  laserbrain: {
    name: 'LaserBrain',
    does: 'The MangoPi’s hat, with Amy: every rail from one 15 V jack (−5 V for the galvo, 3.5, 6 and 9 V for the lasers, 12 and 24 V for the polygon), the galvo’s SPI DAC made differential, the polygon’s clock lifted to 5 V, the facet sensor, and the cable to the laser driver.',
    board: 'laserbrain',
  },
  optics: { name: 'The optics', does: 'Three lasers; two dichroic mirrors join green and then blue to red; the polygon, four facets on a printer’s motor, sweeps each line while an IR sensor sees each facet go by; the galvo steps the lines.' },
  screen: { name: 'The frame', does: '320 × 120, odd lines down and even lines back up; click to print the next.' },
  r01: { name: 'R-01', does: 'Three lasers joined by two dichroics, a polygon sweeping each line, a galvo stepping them; click to print the next frame.' },
}

// What it sounds like: the frame as a chord. A photodiode under it hears the lines go by, so all it can hear is the line
// rate's harmonics; here each laser is one of them over a 120 Hz root, red the second, green the third, blue the fifth
// (a major triad, in just intonation), each as loud as its own light along the line being painted, so the chord follows
// the picture as it is drawn, down the frame and back up; and silent while the screen fades for the next.
const HARM = [2, 3, 5], amp = [0, 0, 0], turns = [0, 0, 0, 0, 0, 0]
let read = -1
export function voice(_t: number, dt: number) {
  if (now.L !== read || !now.on) {
    read = now.L
    const row = now.L * (NX + 1) * 3
    for (let c = 0; c < 3; c++) amp[c] += 0.25 * (now.on * ((now.pic.sum[row + 3 * NX + c] - now.pic.sum[row + c]) / NX) - amp[c]) // over a few lines
  }
  let v = 0
  for (let k = 0; k < 6; k++) {
    // each a pair a fifth of a hertz apart, so the light shimmers
    turns[k] += dt * (HARM[k >> 1] * 120 + (k & 1 ? 0.2 : 0)), turns[k] -= Math.floor(turns[k])
    v += amp[k >> 1] * Math.sin(TAU * turns[k])
  }
  return 0.3 * v
}

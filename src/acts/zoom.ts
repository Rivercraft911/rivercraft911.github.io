// The long zoom: one fall in scale, from GPS orbit to inside a magnetorquer coil, through River's boards, without a
// cut. One camera falls on one curve: ln D, D its distance to where it is falling, runs down at a rate that only
// slows where the next thing must be seen whole.
//
// Orbit. The GPS constellation with its 24 slots idealised as a Walker 55°: 24/6/1, six planes 60° apart, four
// satellites a plane on circular orbits of a = 26 560 km, so T = 2π√(a³/μ) = 11.97 h. Time runs 3600× fast while
// we are high and slows in proportion as we fall, to real time on the ice. Every satellite above the receiver's
// horizon sends a ray down to it, dashed by its own C/A code: PRN 1 to 24 in slot order, each chip G1 ⊕ G2 with
// that PRN's phase taps (IS-GPS-200), the chips stretched to be seen, running down the ray.
// The ice. The receiver walks a wandering route at 1.4 m/s on the East Antarctic plateau, and the graticule
// subdivides as we fall to it, a decade of degrees at a time. Metres off, the dot is the receiver itself, the
// GNSS IQ Breakout, lying on the ice.
// The boards. Each hangs under the hole of the one above at the size that fits it whole in the hole, so the fall
// goes on through the hole into the next (boards.wgsl). The readout is the true width of the frame at the board
// we are falling to.
// The coil. Through PEEP's via, SAMWISE's magnetorquer: its copper drawn from the board's own tracks, the layers
// pulled apart, a pulse of current running the spiral down through them, and the dipole's field lines,
// r = L sin²θ, blooming out of its centre as we fall into it: a dipole looks the same at every scale.
import { Path } from '../beam/path'
import { draw, roll, tex } from '../beam/math'
import { BOARDS as LIST, load, tiles, type Board } from '../boards'
import { BOARDS as SHADER } from '../gpu/fields'
import { pictures, type Field } from '../gpu/raster'
import { place, sing } from './choir'
import { RZ as AT, ZOOM as DUR } from './clock'
import { aim, equation, jump, project, seen, splice } from './reality'
import { TAU, clamp, mix, noise, smooth, view, type Frame, type Scene } from './scene'

const DEG = Math.PI / 180, RE = 6.371e9 // mm
const AG = 2.656e10, MU = 398600.4418, PERIOD = TAU * Math.sqrt(26560 ** 3 / MU) // mm; km³/s²; s
const WE = 7.2921159e-5, SINI = Math.sin(55 * DEG), COSI = Math.cos(55 * DEG) // the Earth's turn, rad/s; the planes' tilt

// The C/A codes: G1 = 1 + x³ + x¹⁰ and G2 = 1 + x² + x³ + x⁶ + x⁸ + x⁹ + x¹⁰ from all ones, G2 read at each PRN's taps.
const TAPS = [[2, 6], [3, 7], [4, 8], [5, 9], [1, 9], [2, 10], [1, 8], [2, 9], [3, 10], [2, 3], [3, 4], [5, 6], [6, 7], [7, 8], [8, 9], [9, 10], [1, 4], [2, 5], [3, 6], [4, 7], [5, 8], [6, 9], [1, 3], [4, 6]]
const CODES = TAPS.map(([a, b]) => {
  const g1 = new Uint8Array(11).fill(1), g2 = new Uint8Array(11).fill(1), c = new Uint8Array(1023)
  for (let i = 0; i < 1023; i++) {
    c[i] = g1[10] ^ g2[a] ^ g2[b]
    const f1 = g1[3] ^ g1[10], f2 = g2[2] ^ g2[3] ^ g2[6] ^ g2[8] ^ g2[9] ^ g2[10]
    g1.copyWithin(2, 1, 10), g2.copyWithin(2, 1, 10)
    g1[1] = f1, g2[1] = f2
  }
  return c
})

// The stack. Board k + 1 hangs under board k's hole, its centre under the hole's, scaled by s[k] so its diagonal
// spans FIT of the hole, deep enough (dz[k], board k mm) to be seen whole as we pass through. The coil hangs
// deeper, so there is room to slow before it.
const B = LIST.map((b) => {
  const [hx, hy, d] = b.hole ?? [b.w / 2, b.h / 2, 0]
  return { w: b.w, h: b.h, ox: b.w / 2 - hx, oy: hy - b.h / 2, d, rho: Math.hypot(b.w, b.h) / 2 } // o: its centre from its hole, frame axes
})
const FOV = 0.9, T2 = Math.tan(FOV / 2), LAST = B.length - 1
const FIT = [0.9, 0.9, 0.3, 0.9, 0.9, 0.6], DEEP = [1.15, 1.15, 1.15, 1.15, 1.15, 3.2] // smaller in the big hole and the last: none flashes past
const s = B.slice(1).map((n, k) => (FIT[k] * B[k].d) / 2 / n.rho)
const dz = s.map((sk, k) => (DEEP[k] * sk * B[k + 1].rho) / T2)
const tail = B.map((_, k) => { // from board k down to where the stack converges, board k mm
  let t = 0
  for (let j = k, m = 1; j < s.length; m *= s[j++]) t += m * dz[j]
  return t
})
const lnS = B.map((_, k) => s.slice(0, k).reduce((a, x) => a + Math.log(x), 0)) // board k's mm, in board 0's
const lnX = B.map((_, k) => lnS[k] + Math.log(tail[k] || 1)) // ln D as we pass through board k's hole

// The site, on the East Antarctic plateau, and the frame everything before the boards is drawn in: east, north, up
// there, mm, from the GNSS board's hole (the receiver lies with its centre on the site).
const LAT = -80 * DEG, LON = 30 * DEG, sl = Math.sin(LAT), cl = Math.cos(LAT), so = Math.sin(LON), co = Math.cos(LON)
const SITE = [RE * cl * co, RE * cl * so, RE * sl]
function frame(x: number, y: number, z: number, o: number[]) {
  const dx = x - SITE[0], dy = y - SITE[1], dz = z - SITE[2]
  o[0] = -so * dx + co * dy + B[0].ox
  o[1] = -sl * co * dx - sl * so * dy + cl * dz + B[0].oy
  o[2] = cl * co * dx + cl * so * dy + sl * dz
  return o
}
const geo = (lat: number, lon: number, o: number[]) => frame(RE * Math.cos(lat) * Math.cos(lon), RE * Math.cos(lat) * Math.sin(lon), RE * Math.sin(lat), o)
const O = frame(0, 0, 0, [0, 0, 0]), P = [B[0].ox, B[0].oy, 0]
// we start on the polar axis, 14 Earth radii south, turned a little off it to see the shells in depth
const V1 = [0.25, -cl, -sl], n1 = Math.hypot(...V1), EYE1 = V1.map((v, i) => O[i] + (14 * RE * v) / n1)
const A1 = Math.hypot(EYE1[0] - P[0], EYE1[1] - P[1], EYE1[2] - P[2]), N1 = EYE1.map((v, i) => (v - P[i]) / A1)

// The rate of the fall, e-folds of D a second: a slow push in orbit; the dive, its rate a hump on a line, fastest
// early so the last metres are slow enough to see, sized so it lands LAND over the receiver at T_ICE; through the
// boards a rate rising by RISE, sized so it passes PEEP's hole at T_PEEP; then braking for the coil, a breath, and
// on into the coil's centre.
const T_DIVE = 1.3, T_ICE = 2.1, T_PEEP = 5.6, R0 = 0.12, R_ICE = 5, LAND = 90 // mm over the receiver
const BOARDS_E = Math.log(LAND) - lnX[LAST - 1], RISE = (2 * (BOARDS_E - R_ICE * (T_PEEP - T_ICE))) / (T_PEEP - T_ICE) ** 2
const hump = (u: number) => Math.sin(Math.PI * u ** 0.55) ** 2
let MEAN = 0
for (let i = 0; i < 1000; i++) MEAN += hump((i + 0.5) / 1000) / 1000
const HUMP = ((Math.log(A1 / LAND) - R0 * T_DIVE) / (T_ICE - T_DIVE) - (R0 + R_ICE) / 2) / MEAN
const R_PEEP = R_ICE + RISE * (T_PEEP - T_ICE)
function rate(t: number) {
  if (t < T_DIVE) return R0
  if (t < T_ICE) {
    const u = (t - T_DIVE) / (T_ICE - T_DIVE)
    return mix(R0, R_ICE, u) + HUMP * hump(u)
  }
  if (t < T_PEEP) return R_ICE + RISE * (t - T_ICE)
  return 0.5 + (R_PEEP - 0.5) * (1 - smooth(T_PEEP, T_PEEP + 0.22, t)) + 4.5 * smooth(6.45, DUR, t) ** 2
}
// ln D and the clock the world runs on (time-lapse: 3600×, then 1.4 per metre of height, to real time), tabled.
const STEP = 1e-3, NT = Math.ceil((DUR + 0.2) / STEP), LND = new Float64Array(NT), WORLD = new Float64Array(NT)
LND[0] = Math.log(A1)
for (let i = 1; i < NT; i++) {
  LND[i] = LND[i - 1] - 0.5 * (rate((i - 1) * STEP) + rate(i * STEP)) * STEP
  WORLD[i] = WORLD[i - 1] + clamp(1.4e-3 * Math.exp(LND[i]), 1, 3600) * STEP
}
const at = (a: Float64Array, t: number) => {
  const f = clamp(t / STEP, 0, NT - 1.001), i = Math.floor(f)
  return a[i] + (a[i + 1] - a[i]) * (f - i)
}
const when = (lnd: number) => { // the time ln D falls through lnd
  let i = 0
  while (i < NT - 1 && LND[i] > lnd) i++
  return i * STEP
}
const CROSS = lnX.slice(0, LAST).map(when) // through each board's hole
const T_BOARD = when(Math.log(2500)) // the dot is the receiver
const T_STOP = when(Math.log(1500)), STOP = at(WORLD, T_STOP) // the walk ends
const T_FIELD = when(Math.log(6000)) // the receiver is more than a speck

// The walk, back from where it ends, on the clock the world runs on: 1.4 m/s, slowing to a stop, its heading
// wandering at three scales. East and north, mm, from the site.
const WALK = 0.25, NW = 4000, ROUTE = new Float64Array(2 * NW)
for (let i = NW - 1; i > 0; i--) {
  const w = STOP - (NW - 1 - i) * WALK, th = 2.2 * noise(w / 300) + 1.1 * noise(w / 45 + 7) + 0.5 * noise(w / 7 + 13), v = 1400 * smooth(0, 4, STOP - w)
  ROUTE[2 * i - 2] = ROUTE[2 * i] - v * WALK * Math.cos(th)
  ROUTE[2 * i - 1] = ROUTE[2 * i + 1] - v * WALK * Math.sin(th)
}
const walker = (w: number, o: number[]) => {
  const f = clamp(NW - 1 - (STOP - w) / WALK, 0, NW - 1.001), i = Math.floor(f), k = f - i
  o[0] = mix(ROUTE[2 * i], ROUTE[2 * i + 2], k) + P[0], o[1] = mix(ROUTE[2 * i + 1], ROUTE[2 * i + 3], k) + P[1], o[2] = 0
  return o
}

// The pictures, decoded off the main thread a mip at a time and queued for the raster to copy in a few a frame,
// long before the zoom.
export async function preload() {
  load('coil').then(coil)
  for (const t of tiles.flat()) {
    const blob = await (await fetch(t.src)).blob()
    for (let m = 0; m < 10; m++) {
      const img = await createImageBitmap(blob, { resizeWidth: Math.max(1, Math.round(t.w / 2 ** m)), resizeHeight: Math.max(1, Math.round(t.h / 2 ** m)), resizeQuality: 'high', premultiplyAlpha: 'premultiply' })
      pictures.push({ shader: SHADER, img, x: t.x >> m, y: t.y >> m, mip: m })
      while (pictures.length > 4) await new Promise(requestAnimationFrame)
    }
  }
}

// The coil: each layer's copper in its frame (mm from its centre, y up), the spiral of each of the five that
// have one run outside in, and its turns and area, counted: N is the turns, A their mean area.
const CU: number[][][] = [], SPIRAL: { l: number; p: number[]; at: Float64Array }[] = []
let TURNS = 0, AREA = 0, RUN = 0
function coil(b: Board) {
  const cx = b.w / 2, cy = b.h / 2
  for (const tr of b.tracks) {
    const p: number[] = []
    for (let i = 3; i < tr.length; i += 2) p.push(tr[i] - cx, cy - tr[i + 1])
    ;(CU[tr[0]] ??= []).push(p)
    if (p.length < 100) continue
    if (Math.hypot(p[0], p[1]) < Math.hypot(p.at(-2)!, p.at(-1)!)) for (let i = 0, j = p.length - 2; i < j; i += 2, j -= 2) [p[i], p[i + 1], p[j], p[j + 1]] = [p[j], p[j + 1], p[i], p[i + 1]]
    const at = new Float64Array(p.length / 2)
    let wind = 0, area = 0
    for (let i = 2; i < p.length; i += 2) {
      at[i / 2] = at[i / 2 - 1] + Math.hypot(p[i] - p[i - 2], p[i + 1] - p[i - 1])
      wind += Math.atan2(p[i - 2] * p[i + 1] - p[i - 1] * p[i], p[i - 2] * p[i] + p[i - 1] * p[i + 1])
      area += p[i - 2] * p[i + 1] - p[i] * p[i - 1]
    }
    SPIRAL.push({ l: tr[0], p, at })
    TURNS += Math.abs(wind) / TAU, AREA += Math.abs(area) / 2
  }
  SPIRAL.sort((a, b) => a.l - b.l)
  RUN = SPIRAL.reduce((a, sp) => a + sp.at[sp.at.length - 1], 0)
  AREA /= TURNS
}
const I0 = 0.1 // A: a drive for the picture, not SAMWISE's own

// The camera, each frame: which board's frame it is in (−1: the Earth's), where it is, and the frame's width.
const field: Field = { shader: SHADER, k: 1, p: new Float32Array(40), res: 2 }
const cam = field.p, eye = [0, 0, 0], fwd = [0, 0, 0], up = [0, 0, 0], q = [0, 0, 0], r = [0, 0, 0]
const ST = { k: -1, h: 0, A: 0, fov: FOV, sep: 0, zc: 0 }
const turn = (t: number) => 0.1 * t + 0.03 * t * t
function pose(t: number) {
  const lnd = at(LND, t), psi = turn(t)
  up[0] = Math.sin(psi), up[1] = Math.cos(psi), up[2] = 0
  if (t < T_ICE) {
    // orbit and dive: down a line from the site that swings from the polar axis to the vertical
    const A = (ST.A = Math.exp(lnd) - tail[0]), k = smooth(1.35, 1.95, t), g = smooth(T_DIVE, 1.8, t)
    for (let i = 0; i < 3; i++) q[i] = mix(N1[i], i === 2 ? 1 : 0, k)
    const n = Math.hypot(q[0], q[1], q[2])
    for (let i = 0; i < 3; i++) (eye[i] = P[i] + (A * q[i]) / n), (fwd[i] = mix(O[i], P[i], g) - eye[i])
    ST.k = -1, ST.h = A, ST.fov = mix(0.7, FOV, smooth(1.4, 2.0, t))
  } else {
    let k = 0
    while (k < LAST && t >= CROSS[k]) k++
    const h = Math.exp(lnd - lnS[k]) - tail[k], e0 = k ? lnX[k - 1] : Math.log(LAND), f = k < LAST ? smooth(0, 0.7, (e0 - lnd) / (e0 - lnX[k])) : 1
    ST.k = k, ST.h = h, ST.fov = FOV
    if (k < LAST) {
      eye[0] = B[k].ox * (1 - f), eye[1] = B[k].oy * (1 - f), eye[2] = h
      fwd[0] = fwd[1] = 0, fwd[2] = -1
    } else {
      // the coil: tilting off the vertical as its layers part, orbiting with the turn, falling into the centre
      const e = mix(Math.PI / 2, 0.85, smooth(5.75, 6.5, t)), a = Math.atan2(-up[1], -up[0])
      ST.sep = mix(0.32, 9, smooth(5.85, 6.6, t)), ST.zc = -2.5 * ST.sep * smooth(T_PEEP, 6.2, t)
      eye[0] = h * Math.cos(e) * Math.cos(a), eye[1] = h * Math.cos(e) * Math.sin(a), eye[2] = ST.zc + h * Math.sin(e)
      fwd[0] = -eye[0], fwd[1] = -eye[1], fwd[2] = ST.zc - eye[2]
      up[0] *= Math.sin(e), up[1] *= Math.sin(e), up[2] = Math.cos(e)
    }
  }
  aim(cam, eye, fwd, up, ST.fov)
}
const width = (d: number) => 2 * d * Math.tan(ST.fov / 2) * view.a

// A stroke through points of the frame: each lands where the camera sees it, the pen lifted where it does not.
let pen = false
function to(p: Path, x: number, y: number, z: number, ok = true) {
  if (!ok || !project(cam, x, y, z) || Math.abs(seen.x) > 9 || Math.abs(seen.y) > 9) return void (pen = false)
  pen ? p.lineTo(seen.x, seen.y) : p.moveTo(seen.x, seen.y)
  pen = true
}
// Is the Earth between the eye and (x, y, z)? And does a point on its surface face the eye?
function hidden(x: number, y: number, z: number) {
  const dx = x - eye[0], dy = y - eye[1], dz = z - eye[2], fx = eye[0] - O[0], fy = eye[1] - O[1], fz = eye[2] - O[2]
  const a = dx * dx + dy * dy + dz * dz, b = fx * dx + fy * dy + fz * dz, c = fx * fx + fy * fy + fz * fz - RE * RE, d = b * b - a * c
  return d > 0 && (-b - Math.sqrt(d)) / a > 0 && (-b - Math.sqrt(d)) / a < 1
}
const faces = (x: number, y: number, z: number) => (x - O[0]) * (eye[0] - x) + (y - O[1]) * (eye[1] - y) + (z - O[2]) * (eye[2] - z) > 0

const grid = new Path(), shells = new Path(), sats = new Path(), rays = new Path(), walk = new Path(), cu = new Path(), lines = new Path(), out = new Path()

// The graticule: level L every 15·10^−L degrees of latitude and five times that of longitude (15° at L = 0),
// each level brightening in as its spacing opens past a hundredth of the frame.
function graticule(ground: number, k: number) {
  grid.clear()
  const F = 2 * ground * Math.tan(ST.fov / 2)
  for (let L = 0; L <= 8; L++) {
    const d = 15 * 10 ** -L, dl = L ? 5 * d : 15, w = k * smooth(0.025, 0.1, (d * DEG * RE) / F)
    if (w < 0.02) continue
    grid.color(0.55, 0.8, 1, 0.3 * w)
    const wl = Math.min(90, (1.3 * F * view.a) / (RE * DEG)), lat0 = LAT / DEG, lon0 = LON / DEG
    const wo = Math.min(180, wl / cl), n = L ? 16 : 60
    for (let la = Math.ceil((lat0 - wl) / d) * d, m = 0; la <= lat0 + wl && m < 60; la += d, m++) {
      if (Math.abs(la) > 89.99) continue
      pen = false
      for (let i = 0; i <= n; i++) {
        geo(la * DEG, (lon0 - wo + (2 * wo * i) / n) * DEG, r)
        to(grid, r[0], r[1], r[2], faces(r[0], r[1], r[2]))
      }
    }
    for (let lo = Math.ceil((lon0 - wo) / dl) * dl, m = 0; lo <= lon0 + wo && m < 60; lo += dl, m++) {
      pen = false
      for (let i = 0; i <= n; i++) {
        geo(Math.max(-90, Math.min(90, lat0 - wl + (2 * wl * i) / n)) * DEG, lo * DEG, r)
        to(grid, r[0], r[1], r[2], faces(r[0], r[1], r[2]))
      }
    }
  }
}

// Satellite i (PRN i + 1) at world time w, into o: its plane's node, its slot's phase in the plane, the Earth's turn.
function sat(i: number, w: number, o: number[], u = (((i & 3) * 90 + (i >> 2) * 15) * DEG) + (TAU * w) / PERIOD) {
  const node = (i >> 2) * 60 * DEG, x = Math.cos(u), y = Math.sin(u) * COSI, th = WE * w
  const X = x * Math.cos(node) - y * Math.sin(node), Y = x * Math.sin(node) + y * Math.cos(node)
  return frame(AG * (X * Math.cos(th) + Y * Math.sin(th)), AG * (Y * Math.cos(th) - X * Math.sin(th)), AG * Math.sin(u) * SINI, o)
}
const S = [0, 0, 0], W = [0, 0, 0]
let range = 0
function constellation(t: number, w: number, k: number, chip: number) {
  shells.clear(), sats.clear(), rays.clear()
  walker(w, W)
  let best = -1
  for (let i = 0; i < 24; i++) {
    if (!(i & 3)) {
      // the plane's orbit, faint, broken where the Earth is in front of it
      shells.color(0.5, 0.7, 1, 0.07 * k)
      pen = false
      for (let j = 0; j <= 96; j++) sat(i, w, S, (TAU * j) / 96), to(shells, S[0], S[1], S[2], !hidden(S[0], S[1], S[2]))
    }
    sat(i, w, S)
    if (!hidden(S[0], S[1], S[2]) && project(cam, S[0], S[1], S[2])) sats.color(1, 0.97, 0.9, k).dot(seen.x, seen.y, 0.04)
    // the ray, from a satellite over the receiver's horizon (5° up): its chips, from the ground up
    const dx = S[0] - W[0], dy = S[1] - W[1], dz = S[2] - W[2], len = Math.hypot(dx, dy, dz)
    if (dz / len < 0.09) continue
    if (dz / len > best) (best = dz / len), (range = len)
    const code = CODES[i], hue = i / 24
    rays.color(0.75 + 0.25 * Math.cos(TAU * hue), 0.8 + 0.2 * Math.cos(TAU * (hue - 0.33)), 0.85 + 0.15 * Math.cos(TAU * (hue - 0.67)), 0.55 * k)
    for (let c = 0, l = 0; c < 400 && l < len; c++, l += chip) {
      const n = Math.floor(c + 40 * t) % 1023 // the code runs down the ray
      if (!code[n]) continue
      const a = l / len, b = Math.min(len, l + chip * 0.999) / len
      if (project(cam, W[0] + dx * b, W[1] + dy * b, W[2] + dz * b)) {
        const bx = seen.x, by = seen.y
        if (project(cam, W[0] + dx * a, W[1] + dy * a, W[2] + dz * a) && Math.abs(bx) + Math.abs(by) < 12) rays.moveTo(seen.x, seen.y).lineTo(bx, by)
      }
    }
  }
}

// The receiver's route behind it, fading with age, and the receiver.
function route(w: number, k: number, dot: number) {
  walk.clear().color(1, 0.9, 0.75)
  const back = clamp(1e-3 * ST.A, 3, 400)
  pen = false
  for (let i = 0; i <= 64; i++) {
    walk.intensity(0.7 * k * (i / 64))
    walker(w - back * (1 - i / 64), r)
    to(walk, r[0], r[1], 0)
  }
  walker(w, W)
  if (dot > 0.01 && project(cam, W[0], W[1], 0)) walk.color(1, 0.75, 0.45, dot).dot(seen.x, seen.y, 0.08)
}

// The coil's copper, layer l at depth l · sep; the pulse, its head running the spirals outside in, top layer down;
// and the field lines of its dipole, about the centre of the stack.
function copper(t: number) {
  cu.clear(), lines.clear()
  const z = (l: number) => -l * ST.sep
  CU.forEach((ps, l) => {
    cu.color(1, 0.5, 0.2, (l ? 0.04 * smooth(0.5, 4, ST.sep) : 0.035) * (1 - 0.1 * l)) // the layers under the top one show as they part
    for (const p of ps) {
      pen = false
      for (let i = 0; i < p.length; i += 2) to(cu, p[i], p[i + 1], z(l))
    }
  })
  const head = (RUN * (t - 5.95)) / 0.9, TAILLEN = 420
  if (head > 0 && head < RUN + TAILLEN) {
    let base = 0
    for (const sp of SPIRAL) {
      const a = head - TAILLEN - base, b = head - base, n = sp.at.length, end = sp.at[n - 1]
      base += end
      if (b < 0 || a > end) continue
      // the stretch of the spiral between a and b, its ends cut where they fall between vertices
      pen = false
      for (let i = 1; i < n; i++) {
        const s0 = sp.at[i - 1], s1 = sp.at[i]
        if (s1 < a || s0 > b) continue
        for (let m = 0; m < 2; m++) {
          const e = m ? Math.min(b, s1) : Math.max(a, s0), k = (e - s0) / (s1 - s0 || 1), x = mix(sp.p[2 * i - 2], sp.p[2 * i], k), y = mix(sp.p[2 * i - 1], sp.p[2 * i + 1], k)
          cu.color(0.85, 0.95, 1, 0.2 + 0.8 * ((e - a) / TAILLEN) ** 2)
          to(cu, x, y, z(sp.l))
        }
      }
    }
  }
  const bloom = smooth(6.2, 6.9, t)
  if (bloom <= 0) return
  // r = L sin²θ, about the axis through the stack's centre: L in steps of 1.6 round the eye's distance, so the
  // family that fills the frame is always there as we fall into it
  const D = ST.h, l0 = Math.floor(Math.log(D * 0.15) / Math.log(1.6))
  for (let j = l0; j < l0 + 8; j++) {
    const L = 1.6 ** j, kk = smooth(0.12, 0.3, L / D) * (1 - smooth(2.5, 4.5, L / D))
    if (kk < 0.02) continue
    lines.color(0.55, 0.7, 1, 0.22 * kk)
    for (let m = 0; m < 8; m++) {
      const ph = (m * Math.PI) / 4 + 0.2, cx = Math.cos(ph), cy = Math.sin(ph)
      for (let side = 0; side < 2; side++) {
        pen = false
        for (let i = 0; i <= 24; i++) {
          const th = 0.06 + (Math.PI / 2 - 0.06) * bloom * (i / 24), a = side ? Math.PI - th : th, rr = L * Math.sin(a) ** 2
          to(lines, rr * Math.sin(a) * cx, rr * Math.sin(a) * cy, ST.zc + rr * Math.cos(a))
        }
      }
    }
  }
}

// The readout, under the equation: the true width of the frame where we are falling.
const UNITS = ['km', 'm', 'mm', '\\mu m'], UNIT = [1e-6, 1e-3, 1, 1e3], DEC = [0, 2, 2, 1]
function readout(f: Frame, w: number) {
  const u = w >= 1e6 ? 0 : w >= 1e3 ? 1 : w >= 0.1 ? 2 : 3, z = 0.042, x = -view.a * 0.9, y = 0.86 - 2.7 * 0.055
  out.clear().color(0.8, 0.85, 0.9, 0.75)
  let cx = x + draw(out, tex('w ='), x, y, z, 0, 0.75) + 0.3 * z
  cx += roll(out, w * UNIT[u], cx, y, z, u === 2 && w >= 10 ? 1 : DEC[u], 0, 0.75) + 0.3 * z
  draw(out, tex(UNITS[u]), cx, y, z, 0, 0.75)
  f.ch.push({ w: 0.12, path: out })
}

const vals = [0, 0, 0, 0]
export const zoom: Scene = {
  dur: DUR,
  build(t, f) {
    const T = t + AT, w = at(WORLD, t)
    pose(t)
    f.look = { tau: t < T_BOARD ? 0.03 : 0.004 } // a raster rushing past leaves a ghost of each frame where its edges were
    jump(t, f, false)
    f.rate = 2e6
    place(T)
    if (t < T_ICE) {
      // orbit and ice, drawn by the beam; the receiver on it as we land
      const ground = ST.A, sky = smooth(500, 2e4, ground), chip = mix(0.003, 0.05, smooth(1.4, 1.95, t)) * ground
      graticule(ground, sky * mix(0.5, 1, smooth(2e4, 2e6, ground)))
      constellation(t, w, sky, chip)
      route(w, smooth(600, 4000, ground), 1 - smooth(3500, 1500, ground))
      f.ch.push({ w: 0.6, path: grid }, { w: 0.2, path: shells }, { w: 0.3, path: rays }, { w: 0.12, path: sats }, { w: 0.15, path: walk })
      vals[0] = t < T_DIVE ? PERIOD / 3600 : range * 1e-6
      equation(f, t < T_DIVE ? 'T=2\\pi√\\frac{a^3}{\\mu}=\\num{0}{00.000}\\,h' : '\\rho_i=|s_i-x|+c\\,\\delta t\\qquad|s-x|=\\num{0}{00000}\\,km', [0.65, 0.9, 1], 0.9, vals)
      readout(f, width(ground > 0.2 * RE ? Math.hypot(eye[0] - O[0], eye[1] - O[1], eye[2] - O[2]) : ground))
    } else if (ST.k < LAST) {
      vals[0] = ST.h
      equation(f, 'w=2h\\,\\tan\\frac{\\theta}{2}\\qquad h=\\num{0}{000.000}\\,mm', [1, 0.82, 0.55], 0.9, vals)
      readout(f, width(ST.h))
    } else {
      copper(t)
      f.ch.push({ w: 0.9, path: cu }, { w: 0.5, path: lines })
      const I = I0 * smooth(5.95, 6.4, t)
      vals[0] = Math.round(TURNS), vals[1] = I, vals[2] = AREA * 1e-6, vals[3] = TURNS * I * AREA * 1e-6
      equation(f, 'm=NIA=\\num{0}{000}\\cdot\\num{1}{0.00}\\,A\\cdot\\num{2}{0.0000}\\,m^2=\\num{3}{0.000}\\,A\\,m^2', [1, 0.7, 0.45], 0.9, vals)
      readout(f, width(ST.h))
    }
    // the boards' light, once the receiver is more than a dot
    if (t >= T_FIELD) {
      const k = Math.max(ST.k, 0), p = field.p
      for (let j = 0; j < 3; j++) {
        const b = k + j, o = 16 + 4 * j
        p[28 + j] = b <= LAST ? b : -1
        if (b > LAST) continue
        // board b's own mm at the frame's point (x, y): the frame is board k's hole's, and each next board hangs
        // centred under the last one's hole, scaled by its s, so its hole's frame is the last one's / s + its centre
        let S = 1, Z = 0, cx = 0, cy = 0
        for (let i = k; i < b; i++) (Z -= S * dz[i]), (S *= s[i]), (cx = cx / s[i] + B[i + 1].ox), (cy = cy / s[i] + B[i + 1].oy)
        p[o] = (LIST[b].hole?.[0] ?? LIST[b].w / 2) + cx, p[o + 1] = (LIST[b].hole?.[1] ?? LIST[b].h / 2) - cy, p[o + 2] = S, p[o + 3] = Z
      }
      p[32] = 0.38, p[33] = 0.52, p[34] = 0.76, p[35] = 1
      p[36] = 1.6, p[37] = 5, p[38] = 1.2
      field.k = (ST.k < 0 ? smooth(6000, 2000, ST.A) : 1) * (ST.k < LAST ? 1 : mix(0.75, 0.3, smooth(5.85, 6.5, t)))
      f.field = field
    }

    return (tt, o) => {
      splice(tt, o), splice(tt - T_BOARD, o)
      for (const c of CROSS) splice(tt - c, o)
      sing(tt + AT, o, mix(0.4, 0.55, smooth(0, DUR, tt)), GOLD) // from the stutter's level up to the ophanim's
    }
  },
}
const GOLD = { gold: 1 }

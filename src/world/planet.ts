// River's planet: the world the intro lands on, and the portfolio. A small world in units of its radius: its air,
// storm and aurora a field (planet.wgsl), River's hardware standing on it as monuments (mesh.ts), lit by its sun and,
// where it has lamps, by its own light. The planet holds still and its sun goes round it, so the camera lives in the
// planet's own frame; everything is sent relative to the eye, which keeps its place in doubles.
//
// Drag turns the view, the wheel is altitude, a click flies to the place under it, Escape climbs back out.
import { PLANET } from '../gpu/fields'
import type { Field } from '../gpu/raster'
import { model, type Solids } from '../gpu/mesh'
import { aim } from '../acts/reality'
import { clamp, view, type Scene, type Frame } from '../acts/scene'
import { PLACES } from './places'
import { ctx, dot, frame, len, look, seen, site, stand, turn, unit, type V } from './ctx'
import { covered, hovered, mount, page, route, within } from './pages'
import { sound } from './sound'

const p = ctx.p
const cam = new Float32Array(16)
const solids: Solids = {
  cam,
  near: 1e-5,
  items: ctx.items,
  sun: [0, 0, 1, 22],
  sunc: [1, 0.96, 0.9, 0.11],
  sky: [0.05, 0.09, 0.17, 0.09, 0.11, 0.14, 0.02, 0.02, 0.02],
  up: [0, 1, 0],
  shadow: [0, 0, 0, 0.1],
}
const F: Field = { shader: PLANET, k: 1, p, solids, res: 2 }
export const EXPOSE = 0.11
// ?d=&pitch=&yaw=&at=x,y,z|peep: a fixed camera, for looking hard at the planet (`at` also stops the sun)
const dbg = new URLSearchParams(location.search)
const DEBUG = ['d', 'pitch', 'yaw', 'at'].some((k) => dbg.has(k))

// ---- models: River's hardware, as baked (scripts/bake-models.mjs) --------------------------------------------
const models = ctx.models
const LAMPS: Record<string, string> = { heart: 'mat_2' } // which of a model's materials are its LEDs (bvh.worker.ts)
export function attach(d: GPUDevice) {
  mount((k) => go(k, lastBuild), () => active) // the words: the index, a deep link's place, the history
  const base = `${import.meta.env.BASE_URL}media/models/`
  fetch(`${base}list.json`)
    .then((r) => (r.ok ? r.json() : []))
    .then((list: { id: string; file: string }[]) => {
      for (const m of list) model(d, base + m.file + (LAMPS[m.id] ? `#lamp=${LAMPS[m.id]}` : '')).then((g) => (models[m.id] = g))
    })
    .catch(() => {})
}

const slerp = (a: V, b: V, s: number, o: V) => {
  const w = Math.acos(clamp(dot(a, b), -1, 1))
  if (w < 1e-6) return (o[0] = a[0]), (o[1] = a[1]), (o[2] = a[2]), o
  const ka = Math.sin((1 - s) * w) / Math.sin(w), kb = Math.sin(s * w) / Math.sin(w)
  for (let i = 0; i < 3; i++) o[i] = ka * a[i] + kb * b[i]
  return o
}

// ---- the camera: a pose, and flights between poses -------------------------------------------------------------
export type Pose = { eye: V; at: V; up: V }
const pose = (): Pose => ({ eye: [0, 0, 3], at: [0, 0, 0], up: [0, 1, 0] })
const now = pose(), from = pose(), to = pose()
let focus = -1 // the place we are at, or home
let flight = -1, fstart = 0, flen = 1 // flying from `from` toward `focus` since fstart, for flen seconds
export const HOME = { d: 5.2, pitch: 0.38, yaw: 0.6 } // where the arrival leaves the eye, and Escape takes it
const rest = { ...HOME } // where the eye is about what it looks at
const want = { ...HOME } // and where the pointer has asked it to be
const n0: V = [0, 0, 0], e0: V = [0, 0, 0], N0: V = [0, 0, 0]

// Where the eye rests about place k (or the planet's centre, k < 0).
function restAt(k: number, o: Pose) {
  const { d, pitch, yaw } = rest, c = Math.cos(pitch), s = Math.sin(pitch)
  if (k < 0) {
    o.at[0] = o.at[1] = o.at[2] = 0
    o.up[0] = 0, o.up[1] = 1, o.up[2] = 0
    o.eye[0] = d * c * Math.sin(yaw), o.eye[1] = d * s, o.eye[2] = d * c * Math.cos(yaw)
    return o
  }
  const P = PLACES[k]
  // a place that moves (a satellite, a rocket) is looked at where it is now
  const r = P.where ? len(P.where(n0, lastBuild)) : (site(P.lat, P.lon, n0), 1.01)
  unit(n0), frame(n0, e0, N0)
  for (let i = 0; i < 3; i++) {
    o.at[i] = n0[i] * r
    o.up[i] = n0[i]
    o.eye[i] = o.at[i] + d * (c * (Math.sin(yaw) * e0[i] + Math.cos(yaw) * N0[i]) + s * n0[i])
  }
  return o
}

// Minimum jerk: no snap at either end of a flight.
const ease = (s: number) => s * s * s * (10 - 15 * s + 6 * s * s)
const ua: V = [0, 0, 0], ub: V = [0, 0, 0]
// A flight goes round the planet, not through it, and climbs in proportion to the arc it covers.
function fly(a: Pose, b: Pose, s: number, o: Pose) {
  const k = ease(s)
  for (const key of ['eye', 'at'] as const) {
    const A = a[key], B = b[key], ra = len(A), rb = len(B)
    if (ra < 1e-6 || rb < 1e-6) {
      for (let i = 0; i < 3; i++) o[key][i] = A[i] + (B[i] - A[i]) * k
      continue
    }
    for (let i = 0; i < 3; i++) (ua[i] = A[i] / ra), (ub[i] = B[i] / rb)
    const arc = Math.acos(clamp(dot(ua, ub), -1, 1))
    const r = ra + (rb - ra) * k + (key === 'eye' ? 0.9 * arc * Math.sin(Math.PI * k) : 0)
    slerp(ua, ub, k, o[key])
    for (let i = 0; i < 3; i++) o[key][i] *= r
  }
  for (let i = 0; i < 3; i++) o.up[i] = a.up[i] + (b.up[i] - a.up[i]) * k
  unit(o.up)
}

export function go(k: number, t: number, quiet = false) {
  if (k === focus && flight < 0) return
  for (const key of ['eye', 'at', 'up'] as const) for (let i = 0; i < 3; i++) from[key][i] = now[key][i]
  focus = k
  const [d, pitch, yaw] = k < 0 ? [HOME.d, HOME.pitch, rest.yaw] : PLACES[k].view
  want.d = rest.d = d, want.pitch = rest.pitch = pitch, want.yaw = rest.yaw = yaw
  restAt(k, to)
  const arc = Math.acos(clamp(dot(unit([...from.eye]), unit([...to.eye])), -1, 1))
  flight = 0, fstart = t, flen = 1.4 + 1.1 * arc + 0.5 * Math.abs(Math.log(len(from.eye) / len(to.eye)))
  page(k, flen) // its page comes in as the camera arrives
  if (!quiet) route(k) // a visitor's flight is their history; the world showing itself is not
}

// Left alone, the world shows itself: half a minute untouched at home and it starts touring River's places, a dozen
// seconds at each, its pages opening as it arrives. Any sign of someone there (a pointer, a wheel, a key) and it
// stands down where it is, and they carry on from there.
const ATTRACT = ['valley', 'launch', 'lighthouse', 'bench', 'hearts', 'receiver', 'station', 'core'].map((id) => PLACES.findIndex((P) => P.id === id))
const AFTER = 25, DWELL = 12
let touring = false, showing = -1
for (const ev of ['pointermove', 'pointerdown', 'wheel', 'keydown'])
  addEventListener(ev, () => ((idle = 0), (touring = false)), { capture: true, passive: true })

// ---- the pointer ---------------------------------------------------------------------------------------------
let active = false, lastSeen = 0, lastBuild = 0, dragging = false, moved = 0, px = 0, py = 0, idle = 0, hover = -1
let clickAt: [number, number] | null = null
const canvas = document.querySelector('canvas')!
canvas.addEventListener('pointerdown', (e) => {
  if (!active) return
  dragging = true, moved = 0, px = e.clientX, py = e.clientY
  canvas.setPointerCapture(e.pointerId)
})
addEventListener('pointermove', (e) => {
  if (!active) return
  if (!dragging) return void (hover = pick(e.clientX, e.clientY))
  const dx = e.clientX - px, dy = e.clientY - py, k = 2.6 / innerHeight
  px = e.clientX, py = e.clientY
  moved += Math.abs(dx) + Math.abs(dy)
  want.yaw -= dx * k
  want.pitch = clamp(want.pitch + dy * k, focus < 0 ? -1.4 : 0.06, 1.45)
  idle = 0
})
addEventListener('pointerup', (e) => {
  if (!active || !dragging) return
  dragging = false
  if (moved < 6) clickAt = [e.clientX, e.clientY]
})
addEventListener('wheel', (e) => {
  if (!active) return
  want.d = clamp(want.d * Math.exp(e.deltaY * 0.0012), focus < 0 ? 1.25 : 0.03, focus < 0 ? 9 : 1.2)
  idle = 0
}, { passive: true })
addEventListener('keydown', (e) => {
  if (!active) return
  const n = PLACES.length + 1
  if (e.key === ' ' && within(e.target)) return void e.stopImmediatePropagation() // space scrolls the page, not pause
  if (e.key === 'Escape' && focus >= 0) go(-1, lastBuild)
  else if (e.key === 'ArrowRight') go(((focus + 2) % n) - 1, lastBuild)
  else if (e.key === 'ArrowLeft') go(((focus + n) % n) - 1, lastBuild)
  else if (/^[1-9]$/.test(e.key) && +e.key <= PLACES.length) go(+e.key - 1, lastBuild) // the index's numbers
  else return
  e.stopImmediatePropagation()
}, true)
// the world listens only while it is being drawn
const watch = () => {
  if (active && performance.now() - lastSeen > 300) active = false
  requestAnimationFrame(watch)
}
requestAnimationFrame(watch)

// ---- monuments: River's hardware, stood where its place is ---------------------------------------------------
const sites = PLACES.map((P) => site(P.lat, P.lon))

const q3: V = [0, 0, 0]
// the place nearest the pointer on screen, if near enough
function pick(cx: number, cy: number) {
  const x = ((2 * cx) / innerWidth - 1) * view.a, y = 1 - (2 * cy) / innerHeight
  let best = -1, bd = 0.08
  sites.forEach((s, k) => {
    q3[0] = s[0] * 1.012, q3[1] = s[1] * 1.012, q3[2] = s[2] * 1.012
    if (!look(q3)) return
    const d = Math.hypot(seen.x - x, seen.y - y)
    if (d < bd) (bd = d), (best = k)
  })
  return best
}

// ---- the frame -------------------------------------------------------------------------------------------------
// The sun at the world's clock's zero: at the hearts it is just up, in the east-southeast, and from home the planet is
// three parts lit, its morning terminator on the left.
export const L0 = unit([0.9585, -0.2702, 0.091])
// The planet field's slots (planet.wgsl): the eye's place, the sun and the time, the spin (none: the sun goes round),
// the storm, the exposure, and River's: the river's place and scale (the beam's own θ(s), 1:400), and where every place
// stands, each on land, each a town at night. The core is the storm's eye, open sea. `text`: how much is read as glyphs.
const RAD = Math.PI / 180, ON_LAND = PLACES.filter((P) => P.lat < 80), SITES = ON_LAND.flatMap((P) => [P.lat * RAD, P.lon * RAD])
export function air(p: Float32Array, E: ArrayLike<number>, L: ArrayLike<number>, t: number, exposure: number, text = 0) {
  p.set([-E[0], -E[1], -E[2], 1, L[0], L[1], L[2], t, 0, 1, 0, 0, 1, 0.07, 1, 1, exposure, 1, ON_LAND.length, 0, text, PLACES[0].lat * RAD, PLACES[0].lon * RAD, 1 / 400], 16)
  p.set(SITES, 40)
}
const L: V = [0, 0, 0], Y = [0, 1, 0]
// The sun at planet time pt: it goes round once in five minutes. The arrival runs on the same clock, ending at 0
// where the world's begins, so nothing in the sky jumps when the world takes over.
export const clock = (pt: number, o: V) => turn(L0, Y, -0.02 * pt, o)
const PEEP = unit([0.5, 0.55, 0.65])
let last = 0

function debugPose(t: number) {
  const yaw = +(dbg.get('yaw') ?? 0.6) + (dbg.has('at') ? 0 : 0.12 * t), pitch = +(dbg.get('pitch') ?? 0.42), D = +(dbg.get('d') ?? 2.6)
  const at = dbg.get('at') === 'peep' ? PEEP.map((x) => x * 1.004) : (dbg.get('at') ?? '0,0,0').split(',').map(Number)
  now.at = at
  now.eye = [at[0] + D * Math.cos(pitch) * Math.sin(yaw), at[1] + D * Math.sin(pitch), at[2] + D * Math.cos(pitch) * Math.cos(yaw)]
  now.up = [0, 1, 0]
}

// The sun's colour where it reaches unit n, through the air (planet.wgsl's sunward: Rayleigh and Mie over Chapman's
// column), so the hardware is lit gold at the terminator as the land round it is.
const BR = [5.8, 13.5, 33.1], BM = 21, HR = 0.008, HM = 0.0012, WHITE = [1, 0.96, 0.9]
function chapman(mu: number, H: number) {
  const x = 1.004 / H, c = Math.sqrt(0.5 * Math.PI * x), up = (c / ((c - 1) * Math.abs(mu) + 1)) * Math.exp(-0.004 / H)
  if (mu >= 0) return up
  const x0 = x * Math.sqrt(Math.max(1 - mu * mu, 0))
  return 2 * Math.sqrt(0.5 * Math.PI * x0) * Math.exp(Math.min(1 / H - x0, 40)) - up
}
function tint(n: ArrayLike<number>, L: ArrayLike<number>, o: number[]) {
  const mu = dot(n, L), r = chapman(mu, HR) * HR, m = 1.1 * BM * HM * chapman(mu, HM)
  for (let i = 0; i < 3; i++) o[i] = WHITE[i] * Math.exp(-(BR[i] * r + m))
}

// One frame of the planet, seen from `pose` at planet time t, with place `focus` the one looked at (its shadows and
// its sun) and the lens open by `lens` (0 a pinhole, 1 a macro lens's). The world draws with it, and so does the
// arrival, which flies its own camera through the same air, as wide as `fov` (radians) if it says.
const fw: V = [0, 0, 0], side = [0, 0], E = ctx.E
export function paint(f: Frame, pose: Pose, t: number, dt: number, focus: number, lens: number, marked = false, wide = 0) {
  const { eye, at } = pose, up_ = pose.up
  E[0] = eye[0], E[1] = eye[1], E[2] = eye[2]
  const alt = Math.max(len(E) - 1, 1e-3), fov = wide || clamp(0.62 - 0.04 * Math.log10(0.3 / alt), 0.5, 0.75)
  fw[0] = at[0] - E[0], fw[1] = at[1] - E[1], fw[2] = at[2] - E[2]
  aim(p, [0, 0, 0], fw, up_, fov)
  if (marked && (side[0] || side[1])) {
    // a page covers part of the screen: look past the subject, so it stands in the open part
    const h = len(fw) * Math.tan(fov / 2), dx = h * side[0] * view.a, dy = -h * side[1]
    for (let i = 0; i < 3; i++) fw[i] += dx * p[4 + i] + dy * p[8 + i]
    aim(p, [0, 0, 0], fw, up_, fov)
  }
  cam.set(p.subarray(0, 16))
  if (dbg.has('at')) L.splice(0, 3, ...L0)
  else clock(t, L)
  air(p, E, L, t, EXPOSE)
  // which place the pointer, or the index, is on: it is marked on the ground (planet.wgsl)
  const k = marked ? (hover >= 0 ? hover : hovered()) : -1
  if (k >= 0 && k !== focus && PLACES[k].lat < 80) mark[0] = k
  mark[1] += ((k >= 0 && k === mark[0] && k !== focus ? 1 : 0) - mark[1]) * (1 - Math.exp(-8 * dt))
  p[54] = mark[0], p[55] = mark[1]

  // River's hardware, and the sun on it
  ctx.t = t, ctx.dt = dt, ctx.f = f, ctx.focus = focus
  ctx.L[0] = L[0], ctx.L[1] = L[1], ctx.L[2] = L[2]
  ctx.items.length = 0
  f.rate = 2.4e6, f.field = F, f.look = { tau: 0.025 } // a place may take the field over (the core, from inside)
  PLACES.forEach((P, k) => {
    for (const m of P.monuments) stand(m.id, sites[k], m.size, m.at, m.turn, m.lift, m.flip)
    P.draw?.(k)
  })
  if (DEBUG) stand('peep', PEEP, 0.08, undefined, 0.4, 0.002)
  const near = focus >= 0 ? sites[focus] : DEBUG ? PEEP : sites[0]
  const sh = solids.shadow as number[], up = solids.up as number[], sun = solids.sun as number[]
  const mv = focus >= 0 ? PLACES[focus].where?.(q3, t) : undefined, hr = mv ? len(mv) / 1.01 : 1 // shadows follow a place that moves
  if (mv) unit(mv)
  const near_ = mv ?? near
  sh[0] = near_[0] * 1.01 * hr - E[0], sh[1] = near_[1] * 1.01 * hr - E[1], sh[2] = near_[2] * 1.01 * hr - E[2], sh[3] = 0.12
  up[0] = near_[0], up[1] = near_[1], up[2] = near_[2]
  sun[0] = L[0], sun[1] = L[1], sun[2] = L[2], sun[3] = 22 * clamp(dot(near_, L) * 6 + 0.5, 0, 1)
  tint(near_, L, solids.sunc as number[])
  // the lens: on the place, at the camera's distance, opening like a macro lens's as the camera comes close
  const fd = Math.hypot(at[0] - E[0], at[1] - E[1], at[2] - E[2])
  solids.focus = fd
  solids.aperture = lens * clamp(0.12 / fd, 0, 1) * 26
  F.res = lens > 0 ? 1.2 : 2 // under the lens the world behind is a blur: its sky and clouds need not be swept at full size
}
const mark = [-1, 0] // the place marked, and how much

export const planet: Scene = {
  dur: Infinity,
  build(t, f: Frame) {
    active = true, lastSeen = performance.now(), lastBuild = t
    const dt = clamp(t - last, 0, 0.1)
    last = t
    idle += dt
    if (dbg.has('go') && !(globalThis as { went?: boolean }).went && ((globalThis as { went?: boolean }).went = true)) go(PLACES.findIndex((P) => P.id === dbg.get('go')), t) // ?go=<id>: straight to a place
    if (clickAt) {
      const k = pick(clickAt[0], clickAt[1])
      clickAt = null
      if (k >= 0) go(k, t)
    }
    // the pointer's asks, followed the way an operator follows: quickly, never at once
    const fol = 1 - Math.exp(-dt * 6)
    if (idle > 4) want.yaw += dt * (focus < 0 ? 0.04 : 0.03) // drifting round whatever is looked at
    if (!DEBUG && !touring && focus < 0 && flight < 0 && idle > AFTER) (touring = true), (showing = -1)
    if (touring) {
      const n = Math.floor((idle - AFTER) / DWELL)
      if (n !== showing) (showing = n), go(ATTRACT[n % ATTRACT.length], t, true)
    }
    rest.d += (want.d - rest.d) * fol, rest.pitch += (want.pitch - rest.pitch) * fol, rest.yaw += (want.yaw - rest.yaw) * fol
    restAt(focus, to)
    if (flight >= 0 && (flight = (t - fstart) / flen) >= 1) flight = -1
    if (DEBUG) debugPose(t)
    else if (flight >= 0) fly(from, to, flight, now)
    else for (const key of ['eye', 'at', 'up'] as const) for (let i = 0; i < 3; i++) now[key][i] = to[key][i]

    const c = covered(), ease = 1 - Math.exp(-4 * dt)
    side[0] += (c[0] - side[0]) * ease, side[1] += (c[1] - side[1]) * ease
    paint(f, now, t, dt, focus, DEBUG ? +(dbg.get('ap') ?? 0) : focus >= 0 && flight < 0 ? 1 : 0, true)
    return sound()
  },
}

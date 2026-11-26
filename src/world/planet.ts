// River's planet: the world the intro lands on, and the portfolio. A small world in units of its radius: its air,
// storm and aurora a field (planet.wgsl), River's hardware standing on it as monuments (mesh.ts), the beam drawing
// over it what is a signal (orbits, the river). The planet holds still and its sun goes round it, so the camera lives
// in the planet's own frame; everything is sent relative to the eye, which keeps its place in doubles.
//
// Drag turns the view, the wheel is altitude, a click flies to the place under it, Escape climbs back out.
import { PLANET } from '../gpu/fields'
import type { Field } from '../gpu/raster'
import { model, type Solids } from '../gpu/mesh'
import { aim } from '../acts/reality'
import { clamp, view, TAU, type Scene, type Frame } from '../acts/scene'
import { Path } from '../beam/path'
import { PLACES, RIVER } from './places'
import { ctx, dot, frame, len, look, seen, site, stand, trace, turn, unit, type V } from './ctx'

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
export function attach(d: GPUDevice) {
  const base = `${import.meta.env.BASE_URL}media/models/`
  fetch(`${base}list.json`)
    .then((r) => (r.ok ? r.json() : []))
    .then((list: { id: string; file: string }[]) => {
      for (const m of list) model(d, base + m.file).then((g) => (models[m.id] = g))
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
export const HOME = { d: 5.2, pitch: 0.38, yaw: 0.6 } // where the reveal leaves the eye, and Escape takes it
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
  site(P.lat, P.lon, n0), frame(n0, e0, N0)
  for (let i = 0; i < 3; i++) {
    o.at[i] = n0[i] * 1.01
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

export function go(k: number, t: number) {
  if (k === focus && flight < 0) return
  for (const key of ['eye', 'at', 'up'] as const) for (let i = 0; i < 3; i++) from[key][i] = now[key][i]
  focus = k
  const [d, pitch, yaw] = k < 0 ? [HOME.d, HOME.pitch, rest.yaw] : PLACES[k].view
  want.d = rest.d = d, want.pitch = rest.pitch = pitch, want.yaw = rest.yaw = yaw
  restAt(k, to)
  const arc = Math.acos(clamp(dot(unit([...from.eye]), unit([...to.eye])), -1, 1))
  flight = 0, fstart = t, flen = 1.4 + 1.1 * arc + 0.5 * Math.abs(Math.log(len(from.eye) / len(to.eye)))
}

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
  if (e.key === 'Escape' && focus >= 0) go(-1, lastBuild)
  else if (e.key === 'ArrowRight') go(((focus + 2) % n) - 1, lastBuild)
  else if (e.key === 'ArrowLeft') go(((focus + n) % n) - 1, lastBuild)
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

// ---- the beam's share: the river, the orbits, the places --------------------------------------------------------
const river = new Path(), orbits = new Path(), marks = new Path()
const E = ctx.E, q3: V = [0, 0, 0]
// The river, where the valley is: the intro's own meander, laid on the ground.
const RW = (() => {
  const s = sites[0], o = new Float64Array((RIVER.length / 2) * 3)
  frame(s, e0, N0)
  for (let i = 0; i < RIVER.length / 2; i++) {
    const x = RIVER[2 * i], y = RIVER[2 * i + 1], g = [0, 1, 2].map((j) => s[j] + e0[j] * x + N0[j] * y)
    unit(g)
    for (let j = 0; j < 3; j++) o[3 * i + j] = g[j] * 1.0015
  }
  return o
})()
const RING = new Float64Array(97 * 3)
const ring = (r: number, raan: number, inc: number, u: number, o: V) => {
  const x = Math.cos(u), y = Math.sin(u)
  o[0] = r * (x * Math.cos(raan) - y * Math.cos(inc) * Math.sin(raan))
  o[1] = r * y * Math.sin(inc)
  o[2] = r * (x * Math.sin(raan) + y * Math.cos(inc) * Math.cos(raan))
  return o
}
// GPS: Walker 24/6/1 at 55° and 4.17 radii (26 560 km over Earth's 6371); SAMWISE: sun-synchronous, 97.6° at 1.086
function drawOrbits(t: number) {
  orbits.clear()
  const shell = (r: number, raan: number, inc: number, c: readonly number[]) => {
    for (let i = 0; i <= 96; i++) RING.set(ring(r, raan, inc, (i / 96) * TAU, q3), 3 * i)
    orbits.color(c[0], c[1], c[2], c[3])
    trace(orbits, RING, 97)
  }
  for (let pl = 0; pl < 6; pl++) {
    const raan = (pl * TAU) / 6, inc = (55 * Math.PI) / 180
    shell(4.17, raan, inc, [0.35, 0.55, 1, 0.3])
    for (let sv = 0; sv < 4; sv++) if (look(ring(4.17, raan, inc, (sv * TAU) / 4 + (pl * TAU) / 24 + 0.05 * t, q3))) orbits.color(0.75, 0.9, 1, 1).dot(seen.x, seen.y, 0.01)
  }
  shell(1.086, 0.4, (97.6 * Math.PI) / 180, [0.75, 0.6, 1, 0.45])
  if (look(ring(1.086, 0.4, (97.6 * Math.PI) / 180, 0.6 * t, q3))) orbits.color(0.9, 0.8, 1, 1).dot(seen.x, seen.y, 0.012)
}
function drawMarks() {
  marks.clear()
  PLACES.forEach((P, k) => {
    const s = sites[k]
    q3[0] = s[0] * 1.012, q3[1] = s[1] * 1.012, q3[2] = s[2] * 1.012
    if (!look(q3)) return
    const c = P.ink
    marks.color(c[0], c[1], c[2], k === focus ? 0.2 : k === hover ? 1 : 0.55).circle(seen.x, seen.y, k === hover ? 0.02 : 0.013, 24)
  })
}
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
export const L0 = unit([1, 0.3, 0.45])
const L: V = [0, 0, 0], Y = [0, 1, 0]
// The sun at planet time pt: it goes round once in five minutes. The reveal and the ident run on the same clock,
// ending at 0 where the world's begins, so nothing in the sky jumps when the world takes over.
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

// One frame of the planet, seen from `pose` at planet time t, with place `focus` the one looked at (its spectacle in
// full, its equation up) and the lens open by `lens` (0 a pinhole, 1 a macro lens's). The world draws with it, and so
// does the intro, which flies its own camera through the same places.
export function paint(f: Frame, pose: Pose, t: number, dt: number, focus: number, lens: number, marked = false) {
  const { eye, at } = pose, up_ = pose.up
  E[0] = eye[0], E[1] = eye[1], E[2] = eye[2]
  const alt = Math.max(len(E) - 1, 1e-3)
  aim(p, [0, 0, 0], [at[0] - E[0], at[1] - E[1], at[2] - E[2]], up_, clamp(0.62 - 0.04 * Math.log10(0.3 / alt), 0.5, 0.75))
  cam.set(p.subarray(0, 16))
  if (dbg.has('at')) L.splice(0, 3, ...L0)
  else clock(t, L)
  p.set([-E[0], -E[1], -E[2], 1, L[0], L[1], L[2], t, 0, 1, 0, 0, 1, 0.07, 1, 1, EXPOSE, 1, 0, 0], 16)

  // the monuments, the places' own drawing, and the sun on them
  ctx.t = t, ctx.dt = dt, ctx.f = f, ctx.focus = focus
  ctx.L[0] = L[0], ctx.L[1] = L[1], ctx.L[2] = L[2]
  ctx.items.length = 0
  PLACES.forEach((P, k) => {
    for (const m of P.monuments) stand(m.id, sites[k], m.size, m.at, m.turn, m.lift, m.flip)
    P.draw?.(k)
  })
  if (DEBUG) stand('peep', PEEP, 0.08, undefined, 0.4, 0.002)
  const near = focus >= 0 ? sites[focus] : DEBUG ? PEEP : sites[0]
  const sh = solids.shadow as number[], up = solids.up as number[], sun = solids.sun as number[]
  sh[0] = near[0] * 1.01 - E[0], sh[1] = near[1] * 1.01 - E[1], sh[2] = near[2] * 1.01 - E[2], sh[3] = 0.12
  up[0] = near[0], up[1] = near[1], up[2] = near[2]
  sun[0] = L[0], sun[1] = L[1], sun[2] = L[2], sun[3] = 22 * clamp(dot(near, L) * 4 + 0.6, 0, 1)
  // the lens: on the place, at the camera's distance, opening like a macro lens's as the camera comes close
  const fd = Math.hypot(at[0] - E[0], at[1] - E[1], at[2] - E[2])
  solids.focus = fd
  solids.aperture = lens * clamp(0.12 / fd, 0, 1) * 26

  river.clear().color(0.5, 0.8, 1, 0.9)
  trace(river, RW, RW.length / 3)
  drawOrbits(t)
  if (marked) drawMarks()
  else marks.clear()
  f.ch.push({ w: 0.2, path: river }, { w: 0.5, path: orbits }, { w: 0.1, path: marks })
  f.rate = 2.4e6
  f.field = F
  f.look = { tau: 0.025 }
}

export const planet: Scene = {
  dur: Infinity,
  build(t, f: Frame) {
    active = true, lastSeen = performance.now(), lastBuild = t
    const dt = clamp(t - last, 0, 0.1)
    last = t
    idle += dt
    if (clickAt) {
      const k = pick(clickAt[0], clickAt[1])
      clickAt = null
      if (k >= 0) go(k, t)
    }
    // the pointer's asks, followed the way an operator follows: quickly, never at once
    const fol = 1 - Math.exp(-dt * 6)
    if (focus < 0 && idle > 4) want.yaw += dt * 0.04
    rest.d += (want.d - rest.d) * fol, rest.pitch += (want.pitch - rest.pitch) * fol, rest.yaw += (want.yaw - rest.yaw) * fol
    restAt(focus, to)
    if (flight >= 0 && (flight = (t - fstart) / flen) >= 1) flight = -1
    if (DEBUG) debugPose(t)
    else if (flight >= 0) fly(from, to, flight, now)
    else for (const key of ['eye', 'at', 'up'] as const) for (let i = 0; i < 3; i++) now[key][i] = to[key][i]

    paint(f, now, t, dt, focus, DEBUG ? +(dbg.get('ap') ?? 0) : focus >= 0 && flight < 0 ? 1 : 0, true)
  },
}

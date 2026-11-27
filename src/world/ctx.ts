// What every place on the planet draws with (planet.ts fills it each frame, a place's own module uses it): the eye
// and its camera, the sun, where a point lands on the screen with the planet in the way, and River's hardware, stood
// or flown.
// Units are planet radii; world space is the planet's own frame, the eye somewhere in it.
import { project, seen } from '../acts/reality'
import type { Frame } from '../acts/scene'
import type { Model, Placed } from '../gpu/mesh'

export type V = number[]
export const dot = (a: ArrayLike<number>, b: ArrayLike<number>) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
export const len = (a: ArrayLike<number>) => Math.hypot(a[0], a[1], a[2])
export const unit = (a: V) => {
  const l = len(a) || 1
  return (a[0] /= l), (a[1] /= l), (a[2] /= l), a
}
export const cross = (a: ArrayLike<number>, b: ArrayLike<number>, o: V = [0, 0, 0]) => {
  const x = a[1] * b[2] - a[2] * b[1], y = a[2] * b[0] - a[0] * b[2], z = a[0] * b[1] - a[1] * b[0]
  return (o[0] = x), (o[1] = y), (o[2] = z), o
}
// v turned th about unit axis a
export const turn = (v: ArrayLike<number>, a: ArrayLike<number>, th: number, o: V = [0, 0, 0]) => {
  const c = Math.cos(th), s = Math.sin(th), k = cross(a, v), d = dot(a, v)
  for (let i = 0; i < 3; i++) o[i] = v[i] * c + k[i] * s + a[i] * d * (1 - c)
  return o
}
// planet-local unit vector of (lat, lon), degrees
export function site(lat: number, lon: number, o: V = [0, 0, 0]) {
  const a = (lat * Math.PI) / 180, b = (lon * Math.PI) / 180
  o[0] = Math.cos(a) * Math.sin(b), o[1] = Math.sin(a), o[2] = Math.cos(a) * Math.cos(b)
  return o
}
// east and north at unit n
export function frame(n: ArrayLike<number>, e: V, N: V) {
  let ex = n[2], ez = -n[0]
  const l = Math.hypot(ex, ez) || 1
  ;(ex /= l), (ez /= l)
  e[0] = ex, e[1] = 0, e[2] = ez
  N[0] = n[1] * ez, N[1] = n[2] * ex - n[0] * ez, N[2] = -n[1] * ex
}

export const ctx = {
  t: 0,
  dt: 0,
  f: undefined as unknown as Frame,
  p: new Float32Array(60), // the camera, as reality.aim writes it, its eye at the origin
  E: [0, 0, 3] as V, // the eye, in the planet's frame
  L: [0, 0, 1] as V, // toward the sun
  focus: -1, // the place the camera is at (PLACES index), or −1 above the planet
  models: {} as Record<string, Model>,
  items: [] as Placed[], // this frame's solids
}

// Can the eye see world point w past the planet?
export function clear(w: ArrayLike<number>) {
  const E = ctx.E, dx = w[0] - E[0], dy = w[1] - E[1], dz = w[2] - E[2], L = Math.hypot(dx, dy, dz)
  const b = (E[0] * dx + E[1] * dy + E[2] * dz) / L, c = dot(E, E) - 0.998, h = b * b - c
  if (h < 0) return true
  const t = -b - Math.sqrt(h)
  return t < 0 || t > L
}
// Where world point w lands on the screen (in `seen`), if the eye can see it.
export const look = (w: ArrayLike<number>) => clear(w) && project(ctx.p, w[0] - ctx.E[0], w[1] - ctx.E[1], w[2] - ctx.E[2])
export { seen }
// Model `id` (if it has loaded) at world point c, its own x, y, z axes laid along the unit vectors ax, ay, az,
// `size` radii across its widest, centred: one more solid this frame, its lamps (if it has any) lit `lit` of colour
// `lamp`. Returns whether it was there to draw.
const pool: Placed[] = [], LAMP = 60 // a lamp's light at full brightness, against the sun's 22
export function solid(id: string, c: ArrayLike<number>, ax: ArrayLike<number>, ay: ArrayLike<number>, az: ArrayLike<number>, size: number, k = 1, glow = 0, lamp?: ArrayLike<number>, lit = 0) {
  const m = ctx.models[id]
  if (!m) return false
  const i = ctx.items.length, it = pool[i] ?? (pool[i] = { model: m, m: new Array(12), lamp: [0, 0, 0] })
  const s = size / Math.max(m.hi[0] - m.lo[0], m.hi[1] - m.lo[1], m.hi[2] - m.lo[2])
  const mc = [(m.hi[0] + m.lo[0]) / 2, (m.hi[1] + m.lo[1]) / 2, (m.hi[2] + m.lo[2]) / 2], r = it.m as number[]
  for (let q = 0; q < 3; q++) {
    const R0 = ax[q] * s, R1 = ay[q] * s, R2 = az[q] * s
    r[q * 4] = R0, r[q * 4 + 1] = R1, r[q * 4 + 2] = R2
    r[q * 4 + 3] = c[q] - ctx.E[q] - (R0 * mc[0] + R1 * mc[1] + R2 * mc[2])
  }
  it.model = m, it.k = k, it.glow = glow
  for (let q = 0; q < 3; q++) (it.lamp as number[])[q] = lamp ? lamp[q] * lit * LAMP : 0
  ctx.items.push(it)
  return true
}

// Model `id` stood on the ground at unit n: offset (east, north) radii, turned `spin` about the vertical, its thinnest
// axis up (flip it for a board whose interesting side is its bottom, as PEEP's is), `size` radii across its widest, its
// underside `lift` above the ground.
const e0: V = [0, 0, 0], N0: V = [0, 0, 0], g: V = [0, 0, 0], col: V[] = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]
export function stand(id: string, n: ArrayLike<number>, size: number, off: readonly number[] = [0, 0], spin = 0, lift = 0, flip = false) {
  const m = ctx.models[id]
  if (!m) return false
  const ext = [m.hi[0] - m.lo[0], m.hi[1] - m.lo[1], m.hi[2] - m.lo[2]]
  const up = ext.indexOf(Math.min(...ext)), a1 = (up + 1) % 3, a2 = (up + 2) % 3
  frame(n, e0, N0)
  for (let j = 0; j < 3; j++) g[j] = n[j] + e0[j] * off[0] + N0[j] * off[1]
  unit(g), frame(g, e0, N0)
  const e1 = turn(e0, g, spin, col[a1]), e2 = cross(g, e1, col[a2]), sg = flip ? -1 : 1
  for (let j = 0; j < 3; j++) (col[up][j] = g[j] * sg), (e2[j] *= sg)
  void e1
  const s = size / Math.max(...ext), half = (ext[up] * s) / 2
  const c = [g[0] * (1 + lift + half), g[1] * (1 + lift + half), g[2] * (1 + lift + half)]
  return solid(id, c, col[0], col[1], col[2], Math.max(...ext) * s)
}

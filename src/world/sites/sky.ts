// What the places in the planet's sky share: a circular orbit, as planet.ts draws its rings, and the beam's pen in
// world space, lifted where the planet hides a point and where one leaves the screen's neighbourhood (a point by the
// eye's own plane would stretch its path across the tube).
import { view } from '../../acts/scene'
import { draw, tex } from '../../beam/math'
import { Path } from '../../beam/path'
import { ctx, look, seen, type V } from '../ctx'

export const DEG = Math.PI / 180
export const RE = 6.371e6, C = 299792458 // an Earth radius, m; light, m/s

// Where argument of latitude u is on the circular orbit of radius r, node raan and inclination inc.
export function orbit(r: number, raan: number, inc: number, u: number, o: V) {
  const x = Math.cos(u), y = Math.sin(u)
  o[0] = r * (x * Math.cos(raan) - y * Math.cos(inc) * Math.sin(raan))
  o[1] = r * y * Math.sin(inc)
  o[2] = r * (x * Math.sin(raan) + y * Math.cos(inc) * Math.cos(raan))
  return o
}

const q: V = [0, 0, 0]
let pen = false
export const up = () => (pen = false)
// The pen goes to a world point, drawing if it was down; false where the point can't be seen.
export function to(path: Path, x: number, y: number, z: number) {
  q[0] = x, q[1] = y, q[2] = z
  if (!look(q) || Math.abs(seen.x) > 4 || Math.abs(seen.y) > 3) return (pen = false)
  if (pen) path.lineTo(seen.x, seen.y)
  else path.moveTo(seen.x, seen.y)
  return (pen = true)
}
// The running numbers, a line under the live equation (the project's page takes the right of the screen, so one line
// cannot hold a law and all it is running on).
const nums = new Path()
export function numbers(src: string, c: readonly number[], vals: ArrayLike<number>) {
  nums.clear().color(c[0], c[1], c[2])
  draw(nums, tex(src), -view.a * 0.9, 0.7, 0.05, 0, 0.9, vals)
  ctx.f.ch.push({ w: 0.12, path: nums })
}
// c + a·i + b·j + n·k, for points given in a local frame
export const at = (path: Path, c: ArrayLike<number>, a: ArrayLike<number>, i: number, b: ArrayLike<number>, j: number, n: ArrayLike<number>, k: number) =>
  to(path, c[0] + a[0] * i + b[0] * j + n[0] * k, c[1] + a[1] * i + b[1] * j + n[1] * k, c[2] + a[2] * i + b[2] * j + n[2] * k)

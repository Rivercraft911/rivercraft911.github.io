// What every reality of the fall shares: the jump into it, and a camera the raster and the beam both see
// through.
import type { Stereo } from '../audio/audio'
import { Path } from '../beam/path'
import { draw, tex } from '../beam/math'
import { hash, lock, view, type Frame } from './scene'

// A reality jump, as R1 makes it: a frame of overexposure burns the last reality out of the phosphor, the
// lens is thrown wide and rings back, and the sound is spliced with a click. Fast cuts skip the flash:
// no more than three full-screen flashes a second. Returns the lens's kick, in radians of field of view.
export function jump(t: number, f: Frame, flash = true, kick = 0.45) {
  if (t >= 0 && t < 1 / 30) f.look = flash ? { exposure: 24, tau: 0.004 } : { tau: 0.004 }
  return kick - lock([[0, 0], [0, kick]], Math.max(0, t), 7, 0.4)
}

// The splice: 25 ms of a click in place of everything else. True while it plays.
export function splice(t: number, o: Stereo) {
  if (t < 0 || t >= 0.025) return false
  o.l = o.r = 0.5 * hash(t * 48000) * Math.exp(-t / 0.006)
  return true
}

// The camera, written where a field shader reads it: p[0] eye, 1/tan(fov/2); p[1] right; p[2] up;
// p[3] forward. The .w of the last three are the shader's own. fwd and up need not be orthonormal.
export function aim(p: Float32Array, eye: ArrayLike<number>, fwd: ArrayLike<number>, up: ArrayLike<number>, fov: number) {
  let n = Math.hypot(fwd[0], fwd[1], fwd[2])
  const fx = fwd[0] / n, fy = fwd[1] / n, fz = fwd[2] / n
  let rx = fy * up[2] - fz * up[1], ry = fz * up[0] - fx * up[2], rz = fx * up[1] - fy * up[0]
  n = Math.hypot(rx, ry, rz) || 1
  rx /= n, ry /= n, rz /= n
  p[0] = eye[0], p[1] = eye[1], p[2] = eye[2], p[3] = 1 / Math.tan(fov / 2)
  p[4] = rx, p[5] = ry, p[6] = rz
  p[8] = ry * fz - rz * fy, p[9] = rz * fx - rx * fz, p[10] = rx * fy - ry * fx
  p[12] = fx, p[13] = fy, p[14] = fz
}

// Where the camera in p sees (x, y, z): screen x, y into o, and its depth; false behind the eye.
export const seen = { x: 0, y: 0, d: 0 }
export function project(p: Float32Array, x: number, y: number, z: number) {
  const dx = x - p[0], dy = y - p[1], dz = z - p[2], d = dx * p[12] + dy * p[13] + dz * p[14]
  if (d < 0.02) return false
  seen.x = ((dx * p[4] + dy * p[5] + dz * p[6]) * p[3]) / d
  seen.y = ((dx * p[8] + dy * p[9] + dz * p[10]) * p[3]) / d
  seen.d = d
  return true
}

// The live equation, top left, in the reality's colour, its \num{k} slots filled from vals.
const eqp = new Path()
export function equation(f: Frame, src: string, c: readonly number[], i = 0.9, vals?: ArrayLike<number>) {
  eqp.clear().color(c[0], c[1], c[2])
  draw(eqp, tex(src), -view.a * 0.9, 0.86, 0.055, 0, i, vals)
  f.ch.push({ w: 0.15, path: eqp })
}

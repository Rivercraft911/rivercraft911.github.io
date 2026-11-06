// A scene is a pure function of time that tells the beam what to draw and the speakers what to play.
import type { Channel } from '../beam/beam'
import type { Voice } from '../audio/audio'
import type { Look } from '../gpu/phosphor'
import type { Path } from '../beam/path'
import { measure, text } from '../beam/font'

export type Frame = { ch: Channel[]; rate?: number; look?: Partial<Look> }
// build pushes beam channels into the frame and returns what the speakers should play.
export type Scene = { dur: number; fade?: number; build(t: number, f: Frame): Voice | void }

export const view = { a: 16 / 9 } // half-width of the screen in scope units; height spans [-1, 1]
export const input = { x: 0, y: 0 } // the pointer, each axis in [-1, 1]

export const TAU = Math.PI * 2
export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x))
export const mix = (a: number, b: number, k: number) => a + (b - a) * k
export const smooth = (a: number, b: number, x: number) => {
  const k = clamp((x - a) / (b - a))
  return k * k * (3 - 2 * k)
}

// Deterministic white noise in [-1, 1] and a smooth band-limited version of it.
export const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return (s - Math.floor(s)) * 2 - 1
}
export const noise = (x: number) => {
  const i = Math.floor(x), k = smooth(0, 1, x - i)
  return mix(hash(i), hash(i + 1), k)
}

// Motion that locks like a control loop instead of easing: each key [t, v] steps the setpoint of a
// second-order loop (natural frequency wn rad/s, damping zeta < 1), and the output is the sum of the
// closed-form step responses, so it overshoots, rings, and settles, and is still a pure function of t.
export function lock(keys: readonly (readonly [number, number])[], t: number, wn = 10, zeta = 0.7) {
  const wd = wn * Math.sqrt(Math.max(1e-6, 1 - zeta * zeta)), a = zeta * wn
  let x = keys[0][1]
  for (let k = 1; k < keys.length && t > keys[k][0]; k++) {
    const tau = t - keys[k][0]
    x += (keys[k][1] - keys[k - 1][1]) * (1 - Math.exp(-a * tau) * (Math.cos(wd * tau) + (a / wd) * Math.sin(wd * tau)))
  }
  return x
}

// A hairline leader from an anchor out to a label written by the beam. Notes on one path dodge each
// other greedily: a label that would land on an earlier one slides down or up until it is clear.
// A path that has been cleared since its last note starts a new frame of notes.
const placed = new WeakMap<Path, { len: number; boxes: number[] }>()
export function note(p: Path, ax: number, ay: number, label: string, side = 1, size = 0.035) {
  let n = placed.get(p)
  if (!n) placed.set(p, (n = { len: 0, boxes: [] }))
  const boxes = n.boxes
  if (p.len < n.len) boxes.length = 0
  const w = measure(label, size), h = size * 1.6, ex = ax + side * 0.08, x0 = side > 0 ? ex + 0.02 : ex - 0.02 - w
  let ly = ay + 0.08
  for (let tries = 0, y0 = ly; tries < 9; tries++) {
    ly = y0 + h * (tries & 1 ? -1 : 1) * ((tries + 1) >> 1)
    let free = true
    for (let i = 0; i < boxes.length && free; i += 4)
      free = x0 > boxes[i + 2] || x0 + w < boxes[i] || ly - h / 2 > boxes[i + 3] || ly + h / 2 < boxes[i + 1]
    if (free) break
  }
  boxes.push(x0, ly - h / 2, x0 + w, ly + h / 2)
  p.dot(ax, ay, 0.01).lineTo(ex, ly).lineTo(ex + side * 0.015, ly)
  text(p, label, x0, ly - size * 0.5, size)
  n.len = p.len
}

// A pinhole camera in scene units. aim() once a frame; project() is pure and fills o with screen
// x, y (height spans [-1, 1]) and a depth cue z: 1 at the look-at distance, dimmer farther away.
export class Cam {
  fov = 0.9 // vertical, radians
  private e = [0, 0, 4]
  private r = [1, 0, 0]
  private u = [0, 1, 0]
  private f = [0, 0, -1]
  private d = 4 // distance to the target
  private s = 1 / Math.tan(0.45)

  aim(px: number, py: number, pz: number, tx = 0, ty = 0, tz = 0, fov = this.fov) {
    const { e, r, u, f } = this
    e[0] = px, e[1] = py, e[2] = pz
    f[0] = tx - px, f[1] = ty - py, f[2] = tz - pz
    this.d = Math.hypot(f[0], f[1], f[2]) || 1
    f[0] /= this.d, f[1] /= this.d, f[2] /= this.d
    // right = forward × world up, up = right × forward
    r[0] = -f[2], r[1] = 0, r[2] = f[0]
    const n = Math.hypot(r[0], r[2]) || 1
    r[0] /= n, r[2] /= n
    u[0] = r[1] * f[2] - r[2] * f[1], u[1] = r[2] * f[0] - r[0] * f[2], u[2] = r[0] * f[1] - r[1] * f[0]
    this.fov = fov
    this.s = 1 / Math.tan(fov / 2)
    return this
  }

  // Returns false (and z = 0) for points behind the camera.
  project(x: number, y: number, z: number, o: { x: number; y: number; z: number }) {
    const { e, r, u, f } = this
    const dx = x - e[0], dy = y - e[1], dz = z - e[2]
    const depth = dx * f[0] + dy * f[1] + dz * f[2]
    if (depth <= 1e-3) return (o.x = o.y = o.z = 0), false
    const k = this.s / depth
    o.x = (dx * r[0] + dy * r[1] + dz * r[2]) * k
    o.y = (dx * u[0] + dy * u[1] + dz * u[2]) * k
    o.z = Math.min(1.5, this.d / depth)
    return true
  }
}
export const cam = new Cam()

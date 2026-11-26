// River's planet: the world the intro lands on, and the portfolio. A small world in units of its radius, its air
// and storm and aurora a field (planet.wgsl), River's hardware standing on it as monuments (mesh.ts), lit by its sun.
// Everything is sent relative to the eye, which keeps its own place in doubles.
import { PLANET } from '../gpu/fields'
import type { Field } from '../gpu/raster'
import { model, type Model, type Placed, type Solids } from '../gpu/mesh'
import { aim } from '../acts/reality'
import { type Scene } from '../acts/scene'

const p = new Float32Array(60)
const dbg = new URLSearchParams(location.search) // TODO: the world's own camera
const cam = new Float32Array(16)
const L = norm([1, 0.35, 0.55])
const EXPOSE = 0.11
const solids: Solids = { cam, near: 1e-5, items: [], sun: [L[0], L[1], L[2], 22], sunc: [1, 0.96, 0.9, EXPOSE], sky: [0.05, 0.09, 0.17, 0.09, 0.11, 0.14, 0.02, 0.02, 0.02], up: [0, 1, 0], shadow: [0, 0, 0, 1] }
const F: Field = { shader: PLANET, k: 1, p, solids }

let device: GPUDevice | undefined
const models: Record<string, Model> = {}
export function attach(d: GPUDevice) {
  device = d
  model(d, `${import.meta.env.BASE_URL}media/_test/peep.glb`).then((m) => (models.peep = m))
}

function norm(v: number[]) {
  const n = Math.hypot(v[0], v[1], v[2])
  return [v[0] / n, v[1] / n, v[2] / n]
}
const cross = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const turn = (v: number[], a: number[], th: number) => {
  const c = Math.cos(th), s = Math.sin(th), k = cross(a, v), d = a[0] * v[0] + a[1] * v[1] + a[2] * v[2]
  return [0, 1, 2].map((i) => v[i] * c + k[i] * s + a[i] * d * (1 - c))
}

// A model stood on the ground at n (unit, world), its thinnest axis up, `size` radii across its widest, its centre
// `lift` above the ground; rows of model → world, less the eye.
function stand(m: Model, n: number[], size: number, lift: number, eye: number[], spin = 0): Placed {
  const ext = [0, 1, 2].map((i) => m.hi[i] - m.lo[i]), c = [0, 1, 2].map((i) => (m.hi[i] + m.lo[i]) / 2)
  const up = ext.indexOf(Math.min(...ext)), a1 = (up + 1) % 3, a2 = (up + 2) % 3
  const s = size / Math.max(...ext)
  const ref = Math.abs(n[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0]
  let e1 = norm(cross(ref, n))
  e1 = turn(e1, n, spin)
  const e2 = cross(n, e1)
  const col: number[][] = []
  col[up] = n, col[a1] = e1, col[a2] = e2
  const pos = n.map((x, i) => x * (1 + lift) - eye[i])
  const rows: number[] = []
  for (let r = 0; r < 3; r++) {
    const R = [col[0][r] * s, col[1][r] * s, col[2][r] * s]
    rows.push(R[0], R[1], R[2], pos[r] - (R[0] * c[0] + R[1] * c[1] + R[2] * c[2]))
  }
  return { model: m, m: rows }
}

export const planet: Scene = {
  dur: Infinity,
  build(t, f) {
    void device
    const yaw = +(dbg.get('yaw') ?? 0.6) + 0.12 * t, pitch = +(dbg.get('pitch') ?? 0.42), D = +(dbg.get('d') ?? 2.6)
    const site = norm([0.5, 0.55, 0.65])
    const look = dbg.get('at') === 'peep' ? site.map((x) => x * 1.004) : (dbg.get('at') ?? '0,0,0').split(',').map(Number)
    const eye = [look[0] + D * Math.cos(pitch) * Math.sin(yaw), look[1] + D * Math.sin(pitch), look[2] + D * Math.cos(pitch) * Math.cos(yaw)]
    aim(p, [0, 0, 0], [look[0] - eye[0], look[1] - eye[1], look[2] - eye[2]], [0, 1, 0], 0.62)
    cam.set(p.subarray(0, 16))
    const spin = dbg.has('at') ? 0 : 0.03 * t, axis = [0, 1, 0]
    p.set([-eye[0], -eye[1], -eye[2], 1, L[0], L[1], L[2], t, axis[0], axis[1], axis[2], spin, 1, 0.07, 1, 1, EXPOSE, 1, 0, 0], 16)
    solids.items.length = 0
    if (models.peep) {
      const n = turn(site, axis, spin)
      const it = stand(models.peep, n, 0.08, 0.004, eye, 0.4)
      solids.items.push(it)
      const s = solids.shadow as number[]
      s[0] = n[0] * 1.004 - eye[0], s[1] = n[1] * 1.004 - eye[1], s[2] = n[2] * 1.004 - eye[2], s[3] = 0.06
      const u = solids.up as number[]
      u[0] = n[0], u[1] = n[1], u[2] = n[2]
    }
    f.field = F
    f.look = { tau: 0.03 }
  },
}

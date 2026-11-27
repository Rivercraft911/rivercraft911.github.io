// What River has not drawn in CAD, made here out of boxes, cylinders and strokes, in millimetres: the strobe glasses'
// LCD valves, their stand and the ball they watch; the desk PEEP plugs into (a monitor, a keyboard and its USB-A port,
// a TV remote) and the words it types. Each is written as a GLB in memory, so mesh.ts and the tracer take it exactly as
// they take River's own (a blob: URL through the same worker).
import { faces } from '../beam/font'

export type Mat = { col: number[]; metal: number; rough: number } // linear albedo (and alpha), as glTF's
type Part = { mat: Mat; P: number[]; N: number[]; I: number[] }
const parts = new Map<string, Part[]>()
let into: Part[] = []
const part = (mat: Mat) => {
  let p = into.find((q) => q.mat === mat)
  if (!p) into.push((p = { mat, P: [], N: [], I: [] }))
  return p
}
type V3 = [number, number, number]
// a quad, corners a, b, c, d in turn, facing n
function quad(m: Mat, a: V3, b: V3, c: V3, d: V3, n: V3) {
  const p = part(m), o = p.P.length / 3
  p.P.push(...a, ...b, ...c, ...d), p.N.push(...n, ...n, ...n, ...n), p.I.push(o, o + 1, o + 2, o, o + 2, o + 3)
}
// a box from lo to hi
export function box(m: Mat, lo: V3, hi: V3) {
  const [x0, y0, z0] = lo, [x1, y1, z1] = hi
  quad(m, [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], [1, 0, 0])
  quad(m, [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0], [-1, 0, 0])
  quad(m, [x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [0, 1, 0])
  quad(m, [x0, y0, z1], [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [0, -1, 0])
  quad(m, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1])
  quad(m, [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1])
}
// a prism of polygon q (x, y; convex, in turn) from z0 to z1
export function prism(m: Mat, q: [number, number][], z0: number, z1: number) {
  const p = part(m), o = p.P.length / 3, n = q.length
  for (const z of [z0, z1]) for (const [x, y] of q) p.P.push(x, y, z), p.N.push(0, 0, z === z0 ? -1 : 1)
  for (let i = 1; i + 1 < n; i++) p.I.push(o, o + i, o + i + 1, o + n, o + n + i, o + n + i + 1)
  for (let i = 0; i < n; i++) {
    const [ax, ay] = q[i], [bx, by] = q[(i + 1) % n], l = Math.hypot(by - ay, ax - bx)
    quad(m, [ax, ay, z0], [bx, by, z0], [bx, by, z1], [ax, ay, z1], [(by - ay) / l, (ax - bx) / l, 0])
  }
}
// a frustum round axis a (unit, one of ±x, ±y, ±z) from c: radius r0 at c, r1 at c + len a; capped at the far end,
// and at the near too if `base`; n sides
export function tube(m: Mat, c: V3, a: V3, r0: number, r1: number, len: number, n = 32, base = false) {
  const u: V3 = a[0] ? [0, 1, 0] : [1, 0, 0], v: V3 = [a[1] * u[2] - a[2] * u[1], a[2] * u[0] - a[0] * u[2], a[0] * u[1] - a[1] * u[0]]
  const at = (r: number, s: number, th: number): V3 => [0, 1, 2].map((i) => c[i] + a[i] * s + r * (Math.cos(th) * u[i] + Math.sin(th) * v[i])) as V3
  const k = (r0 - r1) / len, p = part(m)
  for (let j = 0; j < n; j++) {
    const t0 = (j / n) * 2 * Math.PI, t1 = ((j + 1) / n) * 2 * Math.PI, o = p.P.length / 3
    for (const th of [t0, t1]) {
      const nn = [0, 1, 2].map((i) => Math.cos(th) * u[i] + Math.sin(th) * v[i] + k * a[i]), l = Math.hypot(...nn)
      p.P.push(...at(r0, 0, th), ...at(r1, len, th)), p.N.push(...nn.map((x) => x / l), ...nn.map((x) => x / l))
    }
    p.I.push(o, o + 2, o + 3, o, o + 3, o + 1)
    // the caps, as fans
    const e = at(0, len, 0), q = p.P.length / 3
    p.P.push(...e, ...at(r1, len, t0), ...at(r1, len, t1)), p.N.push(...a, ...a, ...a), p.I.push(q, q + 1, q + 2)
    if (base) {
      const b = at(0, 0, 0), w = p.P.length / 3, na = a.map((x) => -x)
      p.P.push(...b, ...at(r0, 0, t1), ...at(r0, 0, t0)), p.N.push(...na, ...na, ...na), p.I.push(w, w + 1, w + 2)
    }
  }
}
// a dome over c along axis a, radius r: a fisheye's front element
export function dome(m: Mat, c: V3, a: V3, r: number, n = 24) {
  for (let j = 0; j < n / 2; j++) {
    const s0 = (j / (n / 2)) * (Math.PI / 2), s1 = ((j + 1) / (n / 2)) * (Math.PI / 2)
    tube(m, [0, 1, 2].map((i) => c[i] + a[i] * r * Math.sin(s0)) as V3, a, r * Math.cos(s0), r * Math.cos(s1), r * (Math.sin(s1) - Math.sin(s0)), n)
  }
}

// a ball round c, radius r
export function ball(m: Mat, c: V3, r: number, n = 24) {
  dome(m, c, [0, 1, 0], r, n), dome(m, c, [0, -1, 0], r, n)
}
// a w × h rectangle about the origin with corners of radius r, as a convex outline for prism()
export function rounded(w: number, h: number, r: number, n = 6) {
  const q: [number, number][] = []
  for (let k = 0; k < 4; k++) {
    const cx = (k === 0 || k === 3 ? 1 : -1) * (w / 2 - r), cy = (k < 2 ? 1 : -1) * (h / 2 - r)
    for (let i = 0; i <= n; i++) {
      const a = ((k + i / n) * Math.PI) / 2
      q.push([cx + r * Math.cos(a), cy + r * Math.sin(a)])
    }
  }
  return q
}
// a stroke from a to b on the plane z, w wide, its ends squared off w/2 past them (so a polyline's joints close)
function stroke(m: Mat, ax: number, ay: number, bx: number, by: number, z: number, w: number) {
  let dx = bx - ax, dy = by - ay
  const l = Math.hypot(dx, dy), h = w / 2
  l < 1e-9 ? ((dx = h), (dy = 0)) : ((dx *= h / l), (dy *= h / l))
  quad(m, [ax - dx + dy, ay - dy - dx, z], [bx + dx + dy, by + dy - dx, z], [bx + dx - dy, by + dy + dx, z], [ax - dx - dy, ay - dy + dx, z], [0, 0, 1])
}
// Text in a single-stroke face (beam/font.ts: cap height 1, baseline 0, y up) on the plane z, facing +z: its baseline
// from (x, y) along +x, `size` its cap height, its strokes w wide, character i in ink(i). Returns the pen's x after each.
export function text(ink: (i: number) => Mat, s: string, x: number, y: number, z: number, size: number, w: number, f = faces.hershey) {
  const ends: number[] = []
  for (let i = 0; i < s.length; i++) {
    const g = f.g[s[i]]
    for (const st of g?.[1] ?? []) {
      if (st.length === 2) stroke(ink(i), x + st[0] * size, y + st[1] * size, x + st[0] * size, y + st[1] * size, z, w)
      for (let j = 0; j + 3 < st.length; j += 2) stroke(ink(i), x + st[j] * size, y + st[j + 1] * size, x + st[j + 2] * size, y + st[j + 3] * size, z, w)
    }
    ends.push((x += (g?.[0] ?? 0.6) * size))
  }
  return ends
}

// What is being made goes into `parts` under `id`.
export function make(id: string, build: () => void) {
  into = []
  build()
  parts.set(id, into)
}

// Every model made, as [id, blob: URL of its GLB].
export function made(): [string, string][] {
  return [...parts].map(([id, ps]) => {
    const bin: number[] = [], views: object[] = [], accs: object[] = []
    const add = (data: number[], idx: boolean) => {
      const at = bin.length * 4
      bin.push(...data)
      views.push({ buffer: 0, byteOffset: at, byteLength: data.length * 4 })
      accs.push(idx ? { bufferView: views.length - 1, componentType: 5125, count: data.length, type: 'SCALAR' } : { bufferView: views.length - 1, componentType: 5126, count: data.length / 3, type: 'VEC3' })
      return accs.length - 1
    }
    const prims = ps.map((p, i) => ({ attributes: { POSITION: add(p.P, false), NORMAL: add(p.N, false) }, indices: add(p.I, true), material: i }))
    const f = new Float32Array(bin.length), u = new Uint32Array(f.buffer)
    let o = 0
    for (const p of ps) for (const arr of [p.P, p.N, p.I]) for (const x of arr) arr === p.I ? (u[o++] = x) : (f[o++] = x)
    const json = JSON.stringify({
      asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }], meshes: [{ primitives: prims }],
      materials: ps.map((p) => ({ pbrMetallicRoughness: { baseColorFactor: p.mat.col, metallicFactor: p.mat.metal, roughnessFactor: p.mat.rough } })),
      accessors: accs, bufferViews: views, buffers: [{ byteLength: f.byteLength }],
    })
    const js = new TextEncoder().encode(json + ' '.repeat((4 - (json.length % 4)) % 4)), size = 12 + 8 + js.length + 8 + f.byteLength
    const head = new DataView(new ArrayBuffer(20))
    head.setUint32(0, 0x46546c67, true), head.setUint32(4, 2, true), head.setUint32(8, size, true), head.setUint32(12, js.length, true), head.setUint32(16, 0x4e4f534a, true)
    const mid = new DataView(new ArrayBuffer(8))
    mid.setUint32(0, f.byteLength, true), mid.setUint32(4, 0x004e4942, true)
    return [id, URL.createObjectURL(new Blob([head, js, mid, f], { type: 'model/gltf-binary' }))]
  })
}

// ---- cables and balls (the receiver's and the valley's bench) --------------------------------------------------
// A cable of radius r along the points `pts` (mm), n sides round, its ends capped; each ring square to the way the
// cable goes there, turned along it as little as it can be (parallel transport), so the cable never twists.
export function pipe(m: Mat, pts: V3[], r: number, n = 12) {
  const p = part(m), o = p.P.length / 3, T: V3[] = pts.map((_, i) => {
    const a = pts[Math.max(i - 1, 0)], b = pts[Math.min(i + 1, pts.length - 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])
    return [(b[0] - a[0]) / l, (b[1] - a[1]) / l, (b[2] - a[2]) / l]
  })
  const X = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
  let u = X(T[0], Math.abs(T[0][1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])
  pts.forEach((q, i) => {
    const t = T[i], d = u[0] * t[0] + u[1] * t[1] + u[2] * t[2], l0 = Math.hypot(u[0] - d * t[0], u[1] - d * t[1], u[2] - d * t[2])
    u = [(u[0] - d * t[0]) / l0, (u[1] - d * t[1]) / l0, (u[2] - d * t[2]) / l0]
    const v = X(t, u)
    for (let j = 0; j < n; j++) {
      const th = (j / n) * 2 * Math.PI, c = Math.cos(th), s = Math.sin(th), nn = [0, 1, 2].map((k) => c * u[k] + s * v[k])
      p.P.push(...nn.map((x, k) => q[k] + r * x)), p.N.push(...nn)
      if (i) p.I.push(o + (i - 1) * n + j, o + (i - 1) * n + ((j + 1) % n), o + i * n + ((j + 1) % n), o + (i - 1) * n + j, o + i * n + ((j + 1) % n), o + i * n + j)
    }
  })
  for (const [i, s] of [[0, -1], [pts.length - 1, 1]]) {
    const c = p.P.length / 3, t = T[i].map((x) => x * s)
    p.P.push(...pts[i]), p.N.push(...t)
    for (let j = 0; j < n; j++) {
      const a = o + i * n + j, b = o + i * n + ((j + 1) % n), w = p.P.length / 3
      p.P.push(...p.P.slice(a * 3, a * 3 + 3), ...p.P.slice(b * 3, b * 3 + 3)), p.N.push(...t, ...t)
      p.I.push(...(s > 0 ? [c, w, w + 1] : [c, w + 1, w]))
    }
  }
}
// a prism lying flat: polygon q in (x, z), from y0 up to y1
export function slab(m: Mat, q: [number, number][], y0: number, y1: number) {
  const p = part(m), o = p.P.length
  prism(m, q, y0, y1)
  for (let i = o; i < p.P.length; i += 3) [p.P[i + 1], p.P[i + 2], p.N[i + 1], p.N[i + 2]] = [p.P[i + 2], p.P[i + 1], p.N[i + 2], p.N[i + 1]]
}

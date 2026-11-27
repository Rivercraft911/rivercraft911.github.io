// A model, read and made ready to be traced, off the main thread so no frame waits on it: the GLB's triangles, every
// primitive's material baked into its vertices (the opaque first, the translucent solder mask after: two draws for
// mesh.ts), and over the same triangles a bounding volume hierarchy for trace.wgsl's rays.
//
// The hierarchy is a binary tree built top down by the surface area heuristic: a ray that enters a box meets a child
// in proportion to the child's area, so the split that costs least is the one minimising Σ area × triangles. The
// candidates are 12 bins along each axis of the centroids' box. A node holds both its children's boxes, so a visit is
// one read: per child, lo, ref, hi, n; n > 0 a leaf of n triangles from ref, else ref is the child node.

const STRIDE = 32 // position, normal (f32 × 3 each), colour and (metal, rough, lamp) as unorm8 × 4
const BINS = 12, LEAF = 4

type Prim = { M: number[]; P: Float32Array; N?: Float32Array; I: Uint32Array; col: number[]; metal: number; rough: number; lamp: boolean }

// `lamps`: the materials, by name, that are a light (an LED's lens): the scene says how bright each frame.
const SIZE: Record<number, number> = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }
const NORM: Record<number, number> = { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 } // a normalized integer's 1
function read(buf: ArrayBuffer, lamps: string[]) {
  const jl = new DataView(buf).getUint32(12, true)
  const j = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jl)))
  const packed = j.extensionsUsed?.includes('RIVER_delta'), bin = packed ? 0 : 28 + jl
  const v = packed ? new DataView(unpack(j.bufferViews, new Uint8Array(buf, 28 + jl)).buffer) : new DataView(buf)
  const acc = (i: number, ints = false) => {
    const a = j.accessors[i], bv = j.bufferViews[a.bufferView], n = ({ SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 } as Record<string, number>)[a.type]
    const t = a.componentType, size = SIZE[t], stride = bv.byteStride ?? n * size, k1 = a.normalized ? 1 / NORM[t] : 1
    const o = bin + (bv.byteOffset ?? 0) + (a.byteOffset ?? 0), out = ints ? new Uint32Array(a.count * n) : new Float32Array(a.count * n)
    const get = t === 5126 ? v.getFloat32 : t === 5125 ? v.getUint32 : t === 5123 ? v.getUint16 : t === 5122 ? v.getInt16 : t === 5121 ? v.getUint8 : v.getInt8
    for (let k = 0; k < a.count; k++) for (let c = 0; c < n; c++) out[k * n + c] = get.call(v, o + k * stride + c * size, true) * k1
    return out
  }
  const prims: Prim[] = []
  const walk = (ni: number, parent: number[]) => {
    const n = j.nodes[ni], M = mul(parent, local(n))
    for (const p of n.mesh != null ? j.meshes[n.mesh].primitives : []) {
      if ((p.mode ?? 4) !== 4) continue
      const P = acc(p.attributes.POSITION) as Float32Array, pb = j.materials?.[p.material]?.pbrMetallicRoughness
      const I = p.indices != null ? (acc(p.indices, true) as Uint32Array) : Uint32Array.from({ length: P.length / 3 }, (_, i) => i)
      // glTF's defaults: a factor left off is 1, and the bake (bake-models.py) leaves metal off exactly its metals:
      // gold, tin, pins. A material with no factors at all is a plastic.
      prims.push({ M, P, N: p.attributes.NORMAL != null ? (acc(p.attributes.NORMAL) as Float32Array) : undefined, I, col: pb?.baseColorFactor ?? [0.8, 0.8, 0.8, 1], metal: pb ? (pb.metallicFactor ?? 1) : 0, rough: pb ? (pb.roughnessFactor ?? 1) : 0.5, lamp: lamps.includes(j.materials?.[p.material]?.name) })
    }
    for (const c of n.children ?? []) walk(c, M)
  }
  for (const r of j.scenes?.[j.scene ?? 0]?.nodes ?? j.nodes.map((_: unknown, i: number) => i)) walk(r, I4)

  const clear = (p: Prim) => p.col[3] < 0.99
  const count = (want: boolean) => prims.reduce((a, p) => a + (clear(p) === want ? p.I.length - (p.I.length % 3) : 0), 0)
  const ns = count(false), nc = count(true)
  const out = new ArrayBuffer(Math.max((ns + nc) * STRIDE, 4)), f = new Float32Array(out), b = new Uint8Array(out)
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]
  let at = 0
  for (const want of [false, true])
    for (const p of prims) {
      if (clear(p) !== want) continue
      const { M, P, N, I } = p, gamma = p.col.slice(0, 3).map((x) => Math.round(255 * Math.sqrt(Math.min(1, Math.max(0, x)))))
      for (let t = 0; t + 2 < I.length; t += 3) {
        let fx = 0, fy = 0, fz = 0 // a face's own normal, where the mesh gives none
        if (!N) {
          const a = I[t] * 3, e = I[t + 1] * 3, c = I[t + 2] * 3
          const ux = P[e] - P[a], uy = P[e + 1] - P[a + 1], uz = P[e + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2]
          ;(fx = uy * vz - uz * vy), (fy = uz * vx - ux * vz), (fz = ux * vy - uy * vx)
        }
        for (let q = 0; q < 3; q++, at++) {
          const k = I[t + q] * 3, x = P[k], y = P[k + 1], z = P[k + 2], o = at * 8
          for (let r = 0; r < 3; r++) {
            const w = (f[o + r] = M[r] * x + M[4 + r] * y + M[8 + r] * z + M[12 + r])
            lo[r] = Math.min(lo[r], w), (hi[r] = Math.max(hi[r], w))
          }
          const nx = N ? N[k] : fx, ny = N ? N[k + 1] : fy, nz = N ? N[k + 2] : fz
          const mx = M[0] * nx + M[4] * ny + M[8] * nz, my = M[1] * nx + M[5] * ny + M[9] * nz, mz = M[2] * nx + M[6] * ny + M[10] * nz
          const l = Math.hypot(mx, my, mz) || 1
          f[o + 3] = mx / l, f[o + 4] = my / l, f[o + 5] = mz / l
          const u = at * STRIDE + 24
          b[u] = gamma[0], b[u + 1] = gamma[1], b[u + 2] = gamma[2], b[u + 3] = Math.round(255 * p.col[3])
          b[u + 4] = Math.round(255 * p.metal), b[u + 5] = Math.round(255 * p.rough), b[u + 6] = p.lamp ? 255 : 0
        }
      }
    }
  return { vb: out, solid: ns, clear: nc, lo, hi }
}

// A model packed for the wire (scripts/pack-models.mjs: RIVER_delta), its buffer views as they were: an attribute's
// byte planes of each component's difference from the vertex before, added back up; an index from how far it fell short
// of the next vertex not yet used. The views are moved to where they now lie.
type View = { byteOffset?: number; byteLength: number; extensions?: { RIVER_delta?: { count: number; size: number; byteStride?: number; indices?: boolean } } }
function unpack(views: View[], src: Uint8Array) {
  const sizes = views.map((bv) => {
    const x = bv.extensions?.RIVER_delta
    return x ? x.count * (x.indices ? x.size : x.byteStride!) : bv.byteLength
  })
  const out = new Uint8Array(sizes.reduce((a, s) => a + ((s + 3) & ~3), 0))
  let at = 0
  views.forEach((bv, i) => {
    const x = bv.extensions?.RIVER_delta, s = src.subarray(bv.byteOffset ?? 0, (bv.byteOffset ?? 0) + bv.byteLength), o = out.subarray(at, at + sizes[i])
    if (!x) o.set(s)
    else if (x.indices)
      for (let t = 0, r = 0, next = 0; t < x.count; t++) {
        let z = 0
        for (let sh = 0, b = 128; b & 128; sh += 7) (b = s[r++]), (z |= (b & 127) << sh)
        const q = next - z
        if (!z) next++
        for (let y = 0; y < x.size; y++) o[t * x.size + y] = q >> (8 * y)
      }
    else
      for (let k = 0, n = x.count, w = x.byteStride!; k < w / x.size; k++)
        for (let r = 0, prev = 0; r < n; r++) {
          let d = 0
          for (let y = 0; y < x.size; y++) d |= s[(k * x.size + y) * n + r] << (8 * y)
          prev = (prev + d) | 0
          for (let y = 0; y < x.size; y++) o[r * w + k * x.size + y] = prev >> (8 * y)
        }
    ;(bv.byteOffset = at), (bv.byteLength = sizes[i]), (at += (sizes[i] + 3) & ~3)
  })
  return out
}

// glTF's node transforms: a column-major matrix, or translation · rotation · scale.
const I4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
function local(n: { matrix?: number[]; translation?: number[]; rotation?: number[]; scale?: number[] }) {
  if (n.matrix) return n.matrix
  const [x, y, z, w] = n.rotation ?? [0, 0, 0, 1], [sx, sy, sz] = n.scale ?? [1, 1, 1], [tx, ty, tz] = n.translation ?? [0, 0, 0]
  return [
    (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    tx, ty, tz, 1,
  ]
}
function mul(a: number[], b: number[]) {
  const o = new Array(16).fill(0)
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k]
  return o
}

// A unit vector in 32 bits: the octahedron's map, 16 bits a side.
function oct(x: number, y: number, z: number) {
  const s = Math.abs(x) + Math.abs(y) + Math.abs(z) || 1
  let u = x / s, v = y / s
  if (z < 0) {
    const a = (1 - Math.abs(v)) * (u < 0 ? -1 : 1)
    ;(v = (1 - Math.abs(u)) * (v < 0 ? -1 : 1)), (u = a)
  }
  return ((Math.round((u * 0.5 + 0.5) * 65535) << 16) | Math.round((v * 0.5 + 0.5) * 65535)) >>> 0
}

// The hierarchy over the vertex buffer's n triangles: its nodes (64 bytes each), the triangles in the leaves' order
// (48 bytes: a corner, two edges, the corners' normals), and their materials (colour, then metal, rough, translucent, lamp).
function build(vb: ArrayBuffer, n: number, solid: number) {
  const f = new Float32Array(vb), bytes = new Uint8Array(vb)
  const box = new Float32Array(n * 6), mid = new Float32Array(n * 3), idx = new Uint32Array(n)
  for (let i = 0; i < n; i++) {
    idx[i] = i
    for (let a = 0; a < 3; a++) {
      const p = f[i * 24 + a], q = f[i * 24 + 8 + a], r = f[i * 24 + 16 + a], l = Math.min(p, q, r), h = Math.max(p, q, r)
      box[i * 6 + a] = l, box[i * 6 + 3 + a] = h, mid[i * 3 + a] = (l + h) / 2
    }
  }
  const nodes = new ArrayBuffer(Math.max(1, n) * 64), nf = new Float32Array(nodes), nu = new Uint32Array(nodes)
  let used = 1
  const cnt = new Uint32Array(BINS), bb = new Float32Array(BINS * 6), right = new Float32Array(BINS), b = new Float32Array(12), cb = new Float32Array(6)
  const area = (x: Float32Array, o: number) => {
    const dx = x[o + 3] - x[o], dy = x[o + 4] - x[o + 1], dz = x[o + 5] - x[o + 2]
    return dx * dy + dy * dz + dz * dx
  }
  // the box of triangles [s, e), into b at o; and of their centroids, into cb
  const bound = (s: number, e: number, o: number) => {
    for (let a = 0; a < 3; a++) (b[o + a] = cb[a] = Infinity), (b[o + 3 + a] = cb[3 + a] = -Infinity)
    for (let i = s; i < e; i++) {
      const t = idx[i]
      for (let a = 0; a < 3; a++) {
        if (box[t * 6 + a] < b[o + a]) b[o + a] = box[t * 6 + a]
        if (box[t * 6 + 3 + a] > b[o + 3 + a]) b[o + 3 + a] = box[t * 6 + 3 + a]
        const m = mid[t * 3 + a]
        if (m < cb[a]) cb[a] = m
        if (m > cb[3 + a]) cb[3 + a] = m
      }
    }
  }
  // where to cut [s, e): the index its right half starts at, or −1 for a leaf; its box is left in b
  const split = (s: number, e: number) => {
    const N = e - s
    bound(s, e, 0)
    if (N <= LEAF) return -1
    let best = Infinity, axis = -1, cut = 0
    for (let a = 0; a < 3; a++) {
      const lo = cb[a], w = cb[3 + a] - lo
      if (!(w > 0)) continue
      cnt.fill(0)
      for (let k = 0; k < BINS; k++) for (let c = 0; c < 3; c++) (bb[k * 6 + c] = Infinity), (bb[k * 6 + 3 + c] = -Infinity)
      for (let i = s; i < e; i++) {
        const t = idx[i], k = Math.min(BINS - 1, Math.floor(((mid[t * 3 + a] - lo) / w) * BINS))
        cnt[k]++
        for (let c = 0; c < 3; c++) {
          if (box[t * 6 + c] < bb[k * 6 + c]) bb[k * 6 + c] = box[t * 6 + c]
          if (box[t * 6 + 3 + c] > bb[k * 6 + 3 + c]) bb[k * 6 + 3 + c] = box[t * 6 + 3 + c]
        }
      }
      // sweep from the right, then from the left
      for (let c = 0; c < 3; c++) (b[6 + c] = Infinity), (b[9 + c] = -Infinity)
      for (let k = BINS - 1, m = 0; k > 0; k--) {
        m += cnt[k]
        for (let c = 0; c < 3; c++) (b[6 + c] = Math.min(b[6 + c], bb[k * 6 + c])), (b[9 + c] = Math.max(b[9 + c], bb[k * 6 + 3 + c]))
        right[k] = m ? area(b, 6) * m : 0
      }
      for (let c = 0; c < 3; c++) (b[6 + c] = Infinity), (b[9 + c] = -Infinity)
      for (let k = 0, m = 0; k < BINS - 1; k++) {
        m += cnt[k]
        for (let c = 0; c < 3; c++) (b[6 + c] = Math.min(b[6 + c], bb[k * 6 + c])), (b[9 + c] = Math.max(b[9 + c], bb[k * 6 + 3 + c]))
        const cost = (m ? area(b, 6) * m : 0) + right[k + 1]
        if (m && m < N && cost < best) (best = cost), (axis = a), (cut = lo + (w * (k + 1)) / BINS)
      }
    }
    if (axis < 0) return N > 2 * LEAF ? (s + e) >> 1 : -1 // every centroid in one place
    if (N <= 2 * LEAF && best >= area(b, 0) * N) return -1 // cutting costs more than testing them all
    let i = s, j = e - 1
    while (i <= j) {
      if (mid[idx[i] * 3 + axis] < cut) i++
      else {
        const t = idx[i]
        ;(idx[i] = idx[j]), (idx[j--] = t)
      }
    }
    return i > s && i < e ? i : (s + e) >> 1
  }
  // child c of node at: the triangles [s, e)
  const todo: number[] = [0, 0, n, 0] // node, start, end, where it is cut
  const child = (at: number, c: number, s: number, e: number) => {
    const o = at * 16 + c * 8, m = split(s, e)
    nf[o] = b[0], nf[o + 1] = b[1], nf[o + 2] = b[2], nf[o + 4] = b[3], nf[o + 5] = b[4], nf[o + 6] = b[5]
    if (m < 0) (nu[o + 3] = s), (nu[o + 7] = e - s)
    else (nu[o + 3] = used), (nu[o + 7] = 0), todo.push(used++, s, e, m)
  }
  // the root: its split, or one leaf beside a box no ray enters
  const m0 = split(0, n)
  if (m0 < 0) {
    child(0, 0, 0, n)
    nf.fill(1e30, 8, 11), nf.fill(1e30, 12, 15) // a point no ray reaches
    todo.length = 0
  } else todo[3] = m0
  while (todo.length) {
    const m = todo.pop()!, e = todo.pop()!, s = todo.pop()!, at = todo.pop()!
    child(at, 0, s, m), child(at, 1, m, e)
  }

  const tris = new ArrayBuffer(Math.max(1, n) * 48), tf = new Float32Array(tris), tu = new Uint32Array(tris)
  const mats = new Uint32Array(Math.max(1, n) * 2)
  for (let i = 0; i < n; i++) {
    const t = idx[i], v = t * 24, o = i * 12
    for (let a = 0; a < 3; a++) (tf[o + a] = f[v + a]), (tf[o + 4 + a] = f[v + 8 + a] - f[v + a]), (tf[o + 8 + a] = f[v + 16 + a] - f[v + a])
    for (let q = 0; q < 3; q++) tu[o + q * 4 + 3] = oct(f[v + q * 8 + 3], f[v + q * 8 + 4], f[v + q * 8 + 5])
    const c = t * 96 + 24
    mats[i * 2] = (bytes[c] | (bytes[c + 1] << 8) | (bytes[c + 2] << 16) | (bytes[c + 3] << 24)) >>> 0
    mats[i * 2 + 1] = (bytes[c + 4] | (bytes[c + 5] << 8) | (t >= solid ? 1 << 16 : 0) | (bytes[c + 6] << 24)) >>> 0
  }
  return { nodes: nodes.slice(0, used * 64), tris, mats: mats.buffer }
}

onmessage = async (e: MessageEvent<{ id: number; url: string }>) => {
  const { id, url } = e.data
  try {
    const lamps = new URL(url).hash.match(/lamp=([^&]*)/)?.[1].split(',') ?? [] // model.glb#lamp=<material>,…
    const m = read(await (await fetch(url)).arrayBuffer(), lamps), n = (m.solid + m.clear) / 3
    const h = build(m.vb, n, m.solid / 3)
    postMessage({ id, ...m, ...h }, { transfer: [m.vb, h.nodes, h.tris, h.mats] })
  } catch (err) {
    postMessage({ id, error: String(err) })
  }
}

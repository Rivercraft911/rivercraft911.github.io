// Packs River's hardware for the wire: every GLB in public/media/models/ that is not packed yet, in place, and its size
// in list.json. `npm run pack` (and `npm run models`, after baking). What is packed is left alone, so it can run any time.
//
// A packed GLB is still a GLB, its scene, materials and names as they were. Positions are 16-bit integers on a grid
// over the mesh's box (KHR_mesh_quantization: the grid's step and corner are the mesh node's own scale and translation),
// normals 8-bit, the vertices in the order the triangles first use them. Then each buffer view is laid out for deflate,
// which GitHub Pages runs over every .glb it serves (RIVER_delta): an attribute as the differences of each component
// from the vertex before, each byte of those in a plane of its own; indices as how far each falls short of the next new
// vertex, in 7-bit groups (a new vertex is a 0, its neighbours 1, 2, …). bvh.worker.ts reads it back.
import { readFileSync, writeFileSync } from 'node:fs'

const DIR = new URL('../public/media/models/', import.meta.url), EXT = 'RIVER_delta'
const FLOAT = 5126, BYTE = 5120, SHORT = 5122, USHORT = 5123, UINT = 5125

function pack(glb) {
  const jl = glb.readUInt32LE(12), j = JSON.parse(glb.subarray(20, 20 + jl).toString()), bin = glb.subarray(28 + jl)
  if (j.extensionsUsed?.includes(EXT)) return
  if (j.images?.length || j.skins?.length || j.animations?.length || j.meshes.some((m) => m.primitives.some((p) => p.targets))) throw new Error('has more than meshes')
  const N = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }
  const read = (i) => {
    const a = j.accessors[i], bv = j.bufferViews[a.bufferView], n = N[a.type], o = (bv.byteOffset ?? 0) + (a.byteOffset ?? 0)
    const size = { [FLOAT]: 4, [UINT]: 4, [USHORT]: 2, 5121: 1 }[a.componentType], stride = bv.byteStride ?? n * size, out = new Float64Array(a.count * n)
    for (let k = 0; k < a.count; k++)
      for (let c = 0; c < n; c++) {
        const at = o + k * stride + c * size
        out[k * n + c] = a.componentType === FLOAT ? bin.readFloatLE(at) : size === 4 ? bin.readUInt32LE(at) : size === 2 ? bin.readUInt16LE(at) : bin[at]
      }
    return out
  }
  const views = [], accessors = [], chunks = []
  let length = 0
  const view = (data, extra) => {
    views.push({ buffer: 0, byteOffset: length, byteLength: data.length, ...extra })
    chunks.push(data, Buffer.alloc((4 - (data.length % 4)) % 4))
    length += data.length + ((4 - (data.length % 4)) % 4)
    return views.length - 1
  }
  // n elements of c components, each `size` bytes (the decoded element padded to `stride`): deltas, in byte planes
  const planes = (v, n, c, size, stride) => {
    const out = Buffer.alloc(n * stride)
    for (let k = 0; k < stride / size; k++)
      for (let r = 0, prev = 0; r < n; r++) {
        const x = k < c ? v[r * c + k] : 0, d = x - prev
        prev = x
        for (let y = 0; y < size; y++) out[(k * size + y) * n + r] = (d >> (8 * y)) & 255
      }
    return view(out, { byteStride: stride, extensions: { [EXT]: { count: n, size, byteStride: stride } } })
  }
  const meshNodes = new Map()
  j.nodes.forEach((node, i) => node.mesh != null && meshNodes.set(node.mesh, [...(meshNodes.get(node.mesh) ?? []), i]))
  j.meshes.forEach((mesh, mi) => {
    const prims = mesh.primitives.map((p) => {
      if ((p.mode ?? 4) !== 4 || Object.keys(p.attributes).some((a) => a !== 'POSITION' && a !== 'NORMAL')) throw new Error('only triangles with positions and normals')
      const P = read(p.attributes.POSITION), n = P.length / 3
      return { p, P, N: p.attributes.NORMAL != null ? read(p.attributes.NORMAL) : undefined, I: p.indices != null ? read(p.indices) : Float64Array.from({ length: n }, (_, i) => i) }
    })
    // the grid: the same step on every axis, so normals turn with the mesh as they did
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity]
    for (const { P } of prims) for (let i = 0; i < P.length; i++) (lo[i % 3] = Math.min(lo[i % 3], P[i])), (hi[i % 3] = Math.max(hi[i % 3], P[i]))
    const step = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2], 1e-9) / 65535, corner = lo.map((l) => l + 32768 * step)
    for (const { p, P, N, I } of prims) {
      const n = P.length / 3, at = new Int32Array(n).fill(-1), order = []
      for (const v of I) if (at[v] < 0) (at[v] = order.length), order.push(v)
      for (let v = 0; v < n; v++) if (at[v] < 0) (at[v] = order.length), order.push(v)
      const q = new Int32Array(n * 3), nq = new Int32Array(n * 3), qlo = [32767, 32767, 32767], qhi = [-32768, -32768, -32768]
      order.forEach((v, r) => {
        for (let c = 0; c < 3; c++) {
          const x = (q[r * 3 + c] = Math.max(-32768, Math.min(32767, Math.round((P[v * 3 + c] - corner[c]) / step))))
          ;(qlo[c] = Math.min(qlo[c], x)), (qhi[c] = Math.max(qhi[c], x))
          if (N) nq[r * 3 + c] = Math.round(Math.max(-1, Math.min(1, N[v * 3 + c] / (Math.hypot(N[v * 3], N[v * 3 + 1], N[v * 3 + 2]) || 1))) * 127)
        }
      })
      const attributes = { POSITION: accessors.push({ bufferView: planes(q, n, 3, 2, 8), componentType: SHORT, count: n, type: 'VEC3', min: qlo, max: qhi }) - 1 }
      if (N) attributes.NORMAL = accessors.push({ bufferView: planes(nq, n, 3, 1, 4), componentType: BYTE, normalized: true, count: n, type: 'VEC3' }) - 1
      // the indices: how far each falls short of the next vertex not yet used
      const codes = []
      let next = 0
      for (const v of I) {
        let z = next - at[v]
        if (z === 0) next++
        do codes.push((z & 127) | (z > 127 ? 128 : 0)), (z >>>= 7)
        while (z)
      }
      const wide = n > 65535
      const indices = accessors.push({ bufferView: view(Buffer.from(codes), { extensions: { [EXT]: { count: I.length, size: wide ? 4 : 2, indices: true } } }), componentType: wide ? UINT : USHORT, count: I.length, type: 'SCALAR' }) - 1
      p.attributes = attributes, p.indices = indices
    }
    // the grid's step and corner, as a node of its own under each that held the mesh
    for (const ni of meshNodes.get(mi) ?? []) {
      const node = j.nodes[ni]
      delete node.mesh
      ;(node.children ??= []).push(j.nodes.push({ mesh: mi, translation: corner, scale: [step, step, step] }) - 1)
    }
  })
  j.accessors = accessors, j.bufferViews = views, j.buffers = [{ byteLength: length }]
  j.extensionsUsed = [...new Set([...(j.extensionsUsed ?? []), 'KHR_mesh_quantization', EXT])]
  j.extensionsRequired = [...new Set([...(j.extensionsRequired ?? []), 'KHR_mesh_quantization', EXT])]
  let json = Buffer.from(JSON.stringify(j))
  json = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)])
  const head = Buffer.alloc(20)
  head.write('glTF', 0), head.writeUInt32LE(2, 4), head.writeUInt32LE(28 + json.length + length, 8), head.writeUInt32LE(json.length, 12), head.write('JSON', 16)
  const binHead = Buffer.alloc(8)
  binHead.writeUInt32LE(length, 0), binHead.write('BIN\0', 4)
  return Buffer.concat([head, json, binHead, ...chunks])
}

const list = JSON.parse(readFileSync(new URL('list.json', DIR), 'utf8'))
let before = 0, after = 0
for (const m of list) {
  const f = new URL(m.file, DIR), glb = readFileSync(f)
  let out
  try {
    out = pack(glb)
  } catch (e) {
    console.log(m.id, `left as it is: ${e.message}`)
  }
  if (!out) continue
  writeFileSync(f, out)
  m.bytes = out.length
  before += glb.length, after += out.length
  console.log(m.id, `${(glb.length / 1e6).toFixed(2)} → ${(out.length / 1e6).toFixed(2)} MB`)
}
writeFileSync(new URL('list.json', DIR), JSON.stringify(list, null, 1))
console.log(after ? `packed ${(before / 1e6).toFixed(1)} → ${(after / 1e6).toFixed(1)} MB` : 'all packed already')

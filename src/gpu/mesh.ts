// Solid things, lit: River's hardware as its CAD says it is (KiCad's and Blender's GLB), drawn through the camera the
// raster's fields see through, depth-tested against them, and handed to the raster as light, so it persists, halates
// and tone-maps with everything else. The sun casts real shadows; solder mask is a translucent layer over the copper,
// as it is on a board.
import meshWGSL from './mesh.wgsl?raw'

export type Model = { vb: GPUBuffer; solid: number; clear: number; lo: number[]; hi: number[] }

// One model in the scene: m is three rows of its transform, model → world, the world being the eye's: the eye at the
// origin, so the scene keeps its own positions in doubles and subtracts the eye before it hands them over.
export type Placed = { model: Model; m: ArrayLike<number>; k?: number; glow?: number }

export type Solids = {
  cam: Float32Array // reality.aim's p: 1/tan(fov/2) in p[3], right, up, forward; the eye's place is ignored (it is the origin)
  near: number // nearer than this is not drawn
  items: Placed[]
  sun: ArrayLike<number> // toward the sun (unit), irradiance
  sunc: ArrayLike<number> // its colour, exposure
  sky: ArrayLike<number> // overhead, at the horizon, the ground's bounce: three rgb
  up: ArrayLike<number> // which way is up, here
  fog?: ArrayLike<number> // the air's colour and thickness per unit length
  shadow?: ArrayLike<number> // the sphere (centre, radius) of what casts shadows; none, no shadows
}

const STRIDE = 32 // position, normal (f32 × 3 each), colour and (metal, rough) as unorm8 × 4
const SHADOW = 2048
const MAX = 256 // models placed in a frame
const HALTON = Array.from({ length: 16 }, (_, i) => [halton(i + 1, 2) - 0.5, halton(i + 1, 3) - 0.5])
function halton(i: number, b: number) {
  let f = 1, r = 0
  for (; i > 0; i = Math.floor(i / b)) (f /= b), (r += f * (i % b))
  return r
}

export class Mesh {
  private solid!: GPURenderPipeline
  private clear!: GPURenderPipeline
  private prime!: GPURenderPipeline
  private shade!: GPURenderPipeline
  private ready = false
  private u: GPUBuffer
  private uf = new Float32Array(15 * 4)
  private inst: GPUBuffer
  private ii = new Float32Array(MAX * 16)
  private shadow: GPUTexture
  private cmp: GPUSampler
  private g0!: GPUBindGroup
  private g1?: GPUBindGroup
  private l1!: GPUBindGroupLayout
  private color?: GPUTexture // the resolved light, read by the raster's composite
  private msaa?: GPUTexture
  private depth?: GPUTexture
  private dist?: GPUTextureView
  // Four samples where the pixels can afford them; past ~3 Mpx the screen's own density, and the jitter the
  // phosphor's persistence averages, are antialiasing enough.
  private samples = innerWidth * innerHeight * Math.min(2, devicePixelRatio) ** 2 > 3e6 ? 1 : 4
  private n = 0
  private dirty = true
  view?: GPUTextureView

  constructor(readonly device: GPUDevice) {
    const d = device
    this.u = d.createBuffer({ size: this.uf.byteLength, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })
    this.inst = d.createBuffer({ size: this.ii.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST })
    this.shadow = d.createTexture({ size: [SHADOW, SHADOW], format: 'depth32float', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING })
    this.cmp = d.createSampler({ compare: 'less', magFilter: 'linear', minFilter: 'linear' })
  }

  async compile() {
    const d = this.device, module = d.createShaderModule({ code: meshWGSL }), S = GPUShaderStage
    const l0 = d.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: S.VERTEX | S.FRAGMENT, buffer: {} },
        { binding: 1, visibility: S.VERTEX, buffer: { type: 'read-only-storage' } },
      ],
    })
    this.l1 = d.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: S.FRAGMENT, texture: { sampleType: 'depth' } },
        { binding: 1, visibility: S.FRAGMENT, sampler: { type: 'comparison' } },
        { binding: 2, visibility: S.FRAGMENT, texture: { sampleType: 'unfilterable-float' } },
      ],
    })
    this.g0 = d.createBindGroup({ layout: l0, entries: [{ binding: 0, resource: { buffer: this.u } }, { binding: 1, resource: { buffer: this.inst } }] })
    const buffers: GPUVertexBufferLayout[] = [
      {
        arrayStride: STRIDE,
        attributes: [
          { shaderLocation: 0, offset: 0, format: 'float32x3' },
          { shaderLocation: 1, offset: 12, format: 'float32x3' },
          { shaderLocation: 2, offset: 24, format: 'unorm8x4' },
          { shaderLocation: 3, offset: 28, format: 'unorm8x4' },
        ],
      },
    ]
    const layout = d.createPipelineLayout({ bindGroupLayouts: [l0, this.l1] })
    const depth = (write: boolean, compare: GPUCompareFunction): GPUDepthStencilState => ({ format: 'depth32float', depthWriteEnabled: write, depthCompare: compare })
    const color = (entryPoint: string, blend?: GPUBlendState, writeMask = GPUColorWrite.ALL) => ({ module, entryPoint, targets: [{ format: 'rgba16float' as const, blend, writeMask }] })
    const over: GPUBlendState = { color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' } }
    const multisample = { count: this.samples }
    ;[this.solid, this.clear, this.prime, this.shade] = await Promise.all([
      d.createRenderPipelineAsync({ layout, vertex: { module, entryPoint: 'vs', buffers }, fragment: color('solidFS'), depthStencil: depth(true, 'greater'), multisample }),
      d.createRenderPipelineAsync({ layout, vertex: { module, entryPoint: 'vs', buffers }, fragment: color('clearFS', over), depthStencil: depth(false, 'greater'), multisample }),
      d.createRenderPipelineAsync({ layout, vertex: { module, entryPoint: 'fullVS' }, fragment: color('primeFS', undefined, 0), depthStencil: depth(true, 'always'), multisample }),
      d.createRenderPipelineAsync({
        layout: d.createPipelineLayout({ bindGroupLayouts: [l0] }),
        vertex: { module, entryPoint: 'shadowVS', buffers },
        depthStencil: { ...depth(true, 'less'), depthBias: 2, depthBiasSlopeScale: 2 },
      }),
    ])
    this.ready = true
  }

  // This frame's solids into `view`, against the field's depth in `dist` (its ray lengths, at its own size).
  render(enc: GPUCommandEncoder, s: Solids | undefined, w: number, h: number, dist: GPUTextureView) {
    if (!this.ready) return
    const d = this.device
    if (this.color?.width !== w || this.color.height !== h) {
      this.color?.destroy(), this.msaa?.destroy(), this.depth?.destroy()
      const use = GPUTextureUsage.RENDER_ATTACHMENT
      this.color = d.createTexture({ size: [w, h], format: 'rgba16float', usage: use | GPUTextureUsage.TEXTURE_BINDING })
      this.msaa = this.samples > 1 ? d.createTexture({ size: [w, h], format: 'rgba16float', sampleCount: this.samples, usage: use }) : undefined
      this.depth = d.createTexture({ size: [w, h], format: 'depth32float', sampleCount: this.samples, usage: use })
      this.view = this.color.createView()
      this.dirty = true
    }
    if (this.dist !== dist) {
      this.dist = dist
      this.g1 = d.createBindGroup({ layout: this.l1, entries: [{ binding: 0, resource: this.shadow.createView() }, { binding: 1, resource: this.cmp }, { binding: 2, resource: dist }] })
    }
    const out: GPURenderPassColorAttachment = { view: this.msaa ? this.msaa.createView() : this.view!, resolveTarget: this.msaa ? this.view : undefined, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 0] }
    const items = s?.items ?? []
    if (!items.length) {
      if (this.dirty) enc.beginRenderPass({ colorAttachments: [out] }).end(), (this.dirty = false)
      return
    }
    this.dirty = true
    this.write(s!, w, h)
    const n = Math.min(MAX, items.length)
    for (let i = 0; i < n; i++) {
      const m = items[i].m, o = i * 16
      for (let j = 0; j < 12; j++) this.ii[o + j] = m[j]
      this.ii[o + 12] = items[i].k ?? 1
      this.ii[o + 13] = items[i].glow ?? 0
    }
    d.queue.writeBuffer(this.inst, 0, this.ii, 0, n * 16)
    const each = (p: GPURenderPassEncoder, clear: boolean) => {
      for (let i = 0; i < n; i++) {
        const m = items[i].model, c = clear ? m.clear : m.solid
        if (c) p.setVertexBuffer(0, m.vb), p.draw(c, 1, clear ? m.solid : 0, i)
      }
    }
    if (s!.shadow) {
      const p = enc.beginRenderPass({ colorAttachments: [], depthStencilAttachment: { view: this.shadow.createView(), depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' } })
      p.setPipeline(this.shade), p.setBindGroup(0, this.g0), each(p, false), p.end()
    }
    const p = enc.beginRenderPass({ colorAttachments: [out], depthStencilAttachment: { view: this.depth!.createView(), depthClearValue: 0, depthLoadOp: 'clear', depthStoreOp: 'discard' } })
    p.setBindGroup(0, this.g0), p.setBindGroup(1, this.g1!)
    p.setPipeline(this.prime), p.draw(3)
    p.setPipeline(this.solid), each(p, false)
    p.setPipeline(this.clear), each(p, true)
    p.end()
  }

  private write(s: Solids, w: number, h: number) {
    const u = this.uf, c = s.cam, j = HALTON[this.n++ % 16], sk = s.sky, f = s.fog ?? [0, 0, 0, 0]
    u.set([c[4], c[5], c[6], c[3], c[8], c[9], c[10], w / h, c[12], c[13], c[14], s.near, (2 * j[0]) / w, (2 * j[1]) / h, w, h])
    u.set([s.sun[0], s.sun[1], s.sun[2], s.sun[3], s.sunc[0], s.sunc[1], s.sunc[2], s.sunc[3]], 16)
    u.set([sk[0], sk[1], sk[2], 0, sk[3], sk[4], sk[5], 0, sk[6], sk[7], sk[8], 0, s.up[0], s.up[1], s.up[2], 0, f[0], f[1], f[2], f[3]], 24)
    u.fill(0, 44)
    if (s.shadow) {
      // The sun's view of the sphere that casts: an orthographic box round it, looking down the sunlight.
      const [cx, cy, cz, r] = [s.shadow[0], s.shadow[1], s.shadow[2], s.shadow[3]], L = s.sun
      const a = Math.abs(L[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0]
      let xx = a[1] * L[2] - a[2] * L[1], xy = a[2] * L[0] - a[0] * L[2], xz = a[0] * L[1] - a[1] * L[0]
      const k = Math.hypot(xx, xy, xz)
      ;(xx /= k), (xy /= k), (xz /= k)
      const yx = L[1] * xz - L[2] * xy, yy = L[2] * xx - L[0] * xz, yz = L[0] * xy - L[1] * xx
      const row = (x: number, y: number, z: number, q: number, o: number) => [x * q, y * q, z * q, o - (x * cx + y * cy + z * cz) * q]
      u.set([...row(xx, xy, xz, 1 / r, 0), ...row(yx, yy, yz, 1 / r, 0), ...row(-L[0], -L[1], -L[2], 0.5 / r, 0.5), 1, (2 * r) / SHADOW, 0, 0], 44)
    }
    this.device.queue.writeBuffer(this.u, 0, u)
  }
}

// A GLB, read once and kept: every triangle of every primitive in one buffer, its material baked into its
// vertices, the opaque first and the translucent (solder mask) after, so a model is two draws.
const cache = new Map<string, Promise<Model>>()
export function model(device: GPUDevice, url: string) {
  let m = cache.get(url)
  if (!m) cache.set(url, (m = fetch(url).then((r) => r.arrayBuffer()).then((b) => read(device, b))))
  return m
}

type Prim = { M: number[]; P: Float32Array; N?: Float32Array; I: Uint32Array; col: number[]; metal: number; rough: number }

function read(device: GPUDevice, buf: ArrayBuffer): Model {
  const v = new DataView(buf), jl = v.getUint32(12, true)
  const j = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jl)))
  const bin = 28 + jl
  const acc = (i: number) => {
    const a = j.accessors[i], bv = j.bufferViews[a.bufferView], n = ({ SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 } as Record<string, number>)[a.type]
    const size = a.componentType === 5123 ? 2 : a.componentType === 5121 ? 1 : 4, stride = bv.byteStride ?? n * size
    const o = bin + (bv.byteOffset ?? 0) + (a.byteOffset ?? 0), out = a.componentType === 5126 ? new Float32Array(a.count * n) : new Uint32Array(a.count * n)
    for (let k = 0; k < a.count; k++)
      for (let c = 0; c < n; c++) {
        const at = o + k * stride + c * size
        out[k * n + c] = a.componentType === 5126 ? v.getFloat32(at, true) : size === 4 ? v.getUint32(at, true) : size === 2 ? v.getUint16(at, true) : v.getUint8(at)
      }
    return out
  }
  const prims: Prim[] = []
  const walk = (ni: number, parent: number[]) => {
    const n = j.nodes[ni], M = mul(parent, local(n))
    for (const p of n.mesh != null ? j.meshes[n.mesh].primitives : []) {
      if ((p.mode ?? 4) !== 4) continue
      const P = acc(p.attributes.POSITION) as Float32Array, pb = j.materials?.[p.material]?.pbrMetallicRoughness ?? {}
      const I = p.indices != null ? (acc(p.indices) as Uint32Array) : Uint32Array.from({ length: P.length / 3 }, (_, i) => i)
      // glTF's default is metal; KiCad leaves the factors off its plastics, which are not
      prims.push({ M, P, N: p.attributes.NORMAL != null ? (acc(p.attributes.NORMAL) as Float32Array) : undefined, I, col: pb.baseColorFactor ?? [0.8, 0.8, 0.8, 1], metal: pb.metallicFactor ?? 0, rough: pb.roughnessFactor ?? 0.5 })
    }
    for (const c of n.children ?? []) walk(c, M)
  }
  for (const r of j.scenes?.[j.scene ?? 0]?.nodes ?? j.nodes.map((_: unknown, i: number) => i)) walk(r, I4)

  const clear = (p: Prim) => p.col[3] < 0.99
  const count = (want: boolean) => prims.reduce((a, p) => a + (clear(p) === want ? p.I.length - (p.I.length % 3) : 0), 0)
  const ns = count(false), nc = count(true)
  const out = new ArrayBuffer((ns + nc) * STRIDE), f = new Float32Array(out), b = new Uint8Array(out)
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
          b[u + 4] = Math.round(255 * p.metal), b[u + 5] = Math.round(255 * p.rough)
        }
      }
    }
  const vb = device.createBuffer({ size: Math.max(out.byteLength, 4), usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST })
  device.queue.writeBuffer(vb, 0, out)
  return { vb, solid: ns, clear: nc, lo, hi }
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

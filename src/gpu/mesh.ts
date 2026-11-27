// Solid things, lit: River's hardware as its CAD says it is (KiCad's and Blender's GLB), drawn through the camera the
// raster's fields see through, depth-tested against them, and handed to the raster as light, so it persists, halates
// and tone-maps with everything else. The sun casts real shadows; solder mask is a translucent layer over the copper,
// as it is on a board. What stands near the eye is path traced as well (trace.ts): the rasteriser draws its edges and
// its sunlit sheen, the tracer says how much of the sun each point sees and what light reaches it from everywhere else.
import meshWGSL from './mesh.wgsl?raw'
import { Trace, keep, type Traced } from './trace'

export type Model = { vb: GPUBuffer; solid: number; clear: number; lo: number[]; hi: number[]; traced?: Traced; born: number } // born: when it arrived, ms

// One model in the scene: m is three rows of its transform, model → world, the world being the eye's: the eye at the
// origin, so the scene keeps its own positions in doubles and subtracts the eye before it hands them over.
// k: how bright its light is; glow: its own light, as a share of its colour; lamp: the light of its lamps (bvh.worker.ts), rgb;
// sun: the sunlight where it stands (rgb irradiance, its colour through the air), if not the scene's; fade: how much of it
// is there (a model fades in as it arrives).
export type Placed = { model: Model; m: ArrayLike<number>; k?: number; glow?: number; lamp?: ArrayLike<number>; sun?: ArrayLike<number>; fade?: number }

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
  ground?: ArrayLike<number> // the sphere (centre, radius) it all stands on, for the traced light; none, no ground
  focus?: number // the lens: the distance it is focused at, world units
  aperture?: number // and its blur at infinity, px; 0 or none, a pinhole (raster.wgsl does the blur)
}

const STRIDE = 32 // position, normal (f32 × 3 each), colour and (metal, rough, lamp) as unorm8 × 4
const INST = 24 // floats an instance: three rows of its transform, (k, glow, traced, fade), its lamps' light, its sun (w: its own)
const SHADOW = 2048
const MAX = 256 // models placed in a frame

export class Mesh {
  private solid!: GPURenderPipeline
  private clear!: GPURenderPipeline
  private prime!: GPURenderPipeline
  private shade!: GPURenderPipeline
  private ready = false
  private u: GPUBuffer
  private uf = new Float32Array(16 * 4)
  private inst: GPUBuffer
  private ii = new Float32Array(MAX * INST)
  private shadow: GPUTexture
  private cmp: GPUSampler
  private g0!: GPUBindGroup
  private g1: (GPUBindGroup | undefined)[] = [] // one for each of the tracer's two histories, and one for none
  private gen = -1
  private blank: GPUTextureView[]
  private seen = new Uint8Array(MAX) // which items the camera can see, and which can cast into the sun's map
  private casts = new Uint8Array(MAX)
  readonly trace: Trace
  private l1!: GPUBindGroupLayout
  private color?: GPUTexture // the resolved light, read by the raster's composite
  private msaa?: GPUTexture
  private depth?: GPUTexture
  private dist?: GPUTexture // how far each pixel's solid is, resolved, for the depth of field
  private distMS?: GPUTexture
  distView?: GPUTextureView
  private field?: GPUTextureView
  // Four samples a pixel, up to a Retina laptop's whole screen (an M4 Pro draws them in its tiles at no cost worth
  // measuring); past that the screen's own density will do. Never a jitter for the phosphor to average: its
  // persistence in the world is two frames, so a jittered edge flickers, and an edge of a lamp or a glint, which
  // burns past white, sparkles.
  private samples = innerWidth * innerHeight * Math.min(2, devicePixelRatio) ** 2 > 8e6 ? 1 : 4
  private dirty = true
  view?: GPUTextureView
  ground?: GPUTextureView // the traced ground's light against its light in the open, for the raster's composite; none, untraced

  constructor(readonly device: GPUDevice) {
    const d = device
    this.u = d.createBuffer({ size: this.uf.byteLength, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })
    this.inst = d.createBuffer({ size: this.ii.byteLength, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST })
    this.shadow = d.createTexture({ size: [SHADOW, SHADOW], format: 'depth32float', usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING })
    this.cmp = d.createSampler({ compare: 'less', magFilter: 'linear', minFilter: 'linear' })
    this.blank = (['rgba16float', 'rgba32float'] as const).map((format) => d.createTexture({ size: [1, 1], format, usage: GPUTextureUsage.TEXTURE_BINDING }).createView())
    this.trace = new Trace(d)
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
        { binding: 3, visibility: S.FRAGMENT, texture: { sampleType: 'unfilterable-float' } },
        { binding: 4, visibility: S.FRAGMENT, texture: { sampleType: 'unfilterable-float' } },
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
    const color = (entryPoint: string, blend?: GPUBlendState, writeMask = GPUColorWrite.ALL, dist = writeMask) => ({
      module,
      entryPoint,
      targets: [{ format: 'rgba16float' as const, blend, writeMask }, { format: 'r16float' as const, writeMask: dist }],
    })
    const over: GPUBlendState = { color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha' } }
    const multisample = { count: this.samples }
    this.trace.compile() // not awaited: until it is ready the rasteriser's own light stands
    ;[this.solid, this.clear, this.prime, this.shade] = await Promise.all([
      d.createRenderPipelineAsync({ layout, vertex: { module, entryPoint: 'vs', buffers }, fragment: color('solidFS'), depthStencil: depth(true, 'greater'), multisample }),
      d.createRenderPipelineAsync({ layout, vertex: { module, entryPoint: 'vs', buffers }, fragment: color('clearFS', over, GPUColorWrite.ALL, 0), depthStencil: depth(false, 'greater'), multisample }),
      d.createRenderPipelineAsync({ layout, vertex: { module, entryPoint: 'fullVS' }, fragment: color('primeFS', undefined, 0), depthStencil: depth(true, 'always'), multisample }),
      d.createRenderPipelineAsync({
        layout: d.createPipelineLayout({ bindGroupLayouts: [l0] }),
        vertex: { module, entryPoint: 'shadowVS', buffers },
        depthStencil: { ...depth(true, 'less'), depthBias: 2, depthBiasSlopeScale: 2 },
      }),
    ])
    this.ready = true
  }

  // This frame's solids into `view`, against the field's depth in `dist` (its ray lengths, at its own size). `light`
  // is what the field drew, if the solids' light may be traced, with it as the colour of the `ground` (a sphere: its
  // centre and radius), where the scene names none.
  render(enc: GPUCommandEncoder, s: Solids | undefined, w: number, h: number, dist: GPUTextureView, light?: GPUTextureView, ground?: ArrayLike<number>) {
    if (!this.ready) return
    const d = this.device
    if (this.color?.width !== w || this.color.height !== h) {
      this.color?.destroy(), this.msaa?.destroy(), this.depth?.destroy(), this.dist?.destroy(), this.distMS?.destroy()
      const use = GPUTextureUsage.RENDER_ATTACHMENT
      this.color = d.createTexture({ size: [w, h], format: 'rgba16float', usage: use | GPUTextureUsage.TEXTURE_BINDING })
      this.msaa = this.samples > 1 ? d.createTexture({ size: [w, h], format: 'rgba16float', sampleCount: this.samples, usage: use }) : undefined
      this.depth = d.createTexture({ size: [w, h], format: 'depth32float', sampleCount: this.samples, usage: use })
      this.dist = d.createTexture({ size: [w, h], format: 'r16float', usage: use | GPUTextureUsage.TEXTURE_BINDING })
      this.distMS = this.samples > 1 ? d.createTexture({ size: [w, h], format: 'r16float', sampleCount: this.samples, usage: use }) : undefined
      this.view = this.color.createView()
      this.distView = this.dist.createView()
      this.dirty = true
    }
    const items = s?.items ?? [], T = this.trace
    const traced = !!light && items.length > 0 ? T.render(enc, s!, w, h, light, s!.ground ?? ground) : T.stop()
    this.ground = traced ? T.shade : undefined
    if (this.field !== dist || this.gen !== T.gen) (this.field = dist), (this.gen = T.gen), (this.g1.length = 0)
    const gi = traced ? T.flip : 2
    const g1 = (this.g1[gi] ??= d.createBindGroup({
      layout: this.l1,
      entries: [this.shadow.createView(), this.cmp, dist, traced ? T.lit! : this.blank[0], traced ? T.geo! : this.blank[1]].map((resource, binding) => ({ binding, resource })),
    }))
    // (the samples are only resolved, never kept: in the tiles they stay)
    const out: GPURenderPassColorAttachment = { view: this.msaa ? this.msaa.createView() : this.view!, resolveTarget: this.msaa ? this.view : undefined, loadOp: 'clear', storeOp: this.msaa ? 'discard' : 'store', clearValue: [0, 0, 0, 0] }
    const far: GPURenderPassColorAttachment = { view: this.distMS ? this.distMS.createView() : this.distView!, resolveTarget: this.distMS ? this.distView : undefined, loadOp: 'clear', storeOp: this.distMS ? 'discard' : 'store', clearValue: [0, 0, 0, 0] }
    if (!items.length) {
      if (this.dirty) enc.beginRenderPass({ colorAttachments: [out, far] }).end(), (this.dirty = false)
      return
    }
    this.dirty = true
    this.write(s!, w, h, traced)
    const n = Math.min(MAX, items.length), c = s!.cam, sh = s!.shadow, L = s!.sun, tx = w / h / c[3], ty = 1 / c[3]
    for (let i = 0; i < n; i++) {
      const M = items[i].model, m = items[i].m, o = i * INST, lamp = items[i].lamp, sun = items[i].sun
      for (let j = 0; j < 12; j++) this.ii[o + j] = m[j]
      this.ii[o + 12] = items[i].k ?? 1
      this.ii[o + 13] = items[i].glow ?? 0
      this.ii[o + 14] = traced ? T.fades[i] : 0
      this.ii[o + 15] = items[i].fade ?? 1
      for (let j = 0; j < 3; j++) (this.ii[o + 16 + j] = lamp ? lamp[j] : 0), (this.ii[o + 20 + j] = sun ? sun[j] : 0)
      this.ii[o + 23] = +!!sun
      // Only what the camera can see is drawn, and only what stands in the sun's map is drawn into it: the sphere
      // round the model against the view's four sides, and against the column of sunlight through what casts.
      const cx = (M.lo[0] + M.hi[0]) / 2, cy = (M.lo[1] + M.hi[1]) / 2, cz = (M.lo[2] + M.hi[2]) / 2
      const x = m[0] * cx + m[1] * cy + m[2] * cz + m[3], y = m[4] * cx + m[5] * cy + m[6] * cz + m[7], z = m[8] * cx + m[9] * cy + m[10] * cz + m[11]
      const r = 0.5 * Math.hypot(M.hi[0] - M.lo[0], M.hi[1] - M.lo[1], M.hi[2] - M.lo[2]) * Math.hypot(m[0], m[4], m[8])
      const u = x * c[4] + y * c[5] + z * c[6], v = x * c[8] + y * c[9] + z * c[10], f = x * c[12] + y * c[13] + z * c[14]
      this.seen[i] = +(f > -r && Math.abs(u) - f * tx < r * Math.hypot(1, tx) && Math.abs(v) - f * ty < r * Math.hypot(1, ty))
      if (sh) {
        const dx = x - sh[0], dy = y - sh[1], dz = z - sh[2], along = dx * L[0] + dy * L[1] + dz * L[2], R = sh[3] + r
        this.casts[i] = +(Math.abs(along) < R && dx * dx + dy * dy + dz * dz - along * along < R * R && (items[i].fade ?? 1) > 0.5) // (its shadow comes as it is half there)
      }
    }
    d.queue.writeBuffer(this.inst, 0, this.ii, 0, n * INST)
    const each = (p: GPURenderPassEncoder, clear: boolean, which: Uint8Array) => {
      for (let i = 0; i < n; i++) {
        const m = items[i].model, c = clear ? m.clear : m.solid
        if (c && which[i]) p.setVertexBuffer(0, m.vb), p.draw(c, 1, clear ? m.solid : 0, i)
      }
    }
    if (sh) {
      const p = enc.beginRenderPass({ colorAttachments: [], depthStencilAttachment: { view: this.shadow.createView(), depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' } })
      p.setPipeline(this.shade), p.setBindGroup(0, this.g0), each(p, false, this.casts), p.end()
    }
    const p = enc.beginRenderPass({ colorAttachments: [out, far], depthStencilAttachment: { view: this.depth!.createView(), depthClearValue: 0, depthLoadOp: 'clear', depthStoreOp: 'discard' } })
    p.setBindGroup(0, this.g0), p.setBindGroup(1, g1)
    p.setPipeline(this.prime), p.draw(3)
    p.setPipeline(this.solid), each(p, false, this.seen)
    p.setPipeline(this.clear), each(p, true, this.seen)
    p.end()
  }

  private write(s: Solids, w: number, h: number, traced: boolean) {
    const u = this.uf, c = s.cam, sk = s.sky, f = s.fog ?? [0, 0, 0, 0]
    u.set([c[4], c[5], c[6], c[3], c[8], c[9], c[10], w / h, c[12], c[13], c[14], s.near, 0, 0, w, h])
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
    const T = this.trace
    u[60] = T.w, u[61] = T.h, u[62] = +traced
    this.device.queue.writeBuffer(this.u, 0, u)
  }
}

// A GLB, read once and kept: every triangle of every primitive in one buffer, its material baked into its
// vertices, the opaque first and the translucent (solder mask) after, so a model is two draws. It is read on another
// thread (bvh.worker.ts), which also builds the hierarchy the tracer's rays go through, so no frame waits on either.
const cache = new Map<string, Promise<Model>>()
type Read = { id: number; error?: string; vb: ArrayBuffer; solid: number; clear: number; lo: number[]; hi: number[]; nodes: ArrayBuffer; tris: ArrayBuffer; mats: ArrayBuffer }
const waiting = new Map<number, [(r: Read) => void, (e: Error) => void]>()
let worker: Worker | undefined
export function model(device: GPUDevice, url: string) {
  let m = cache.get(url)
  if (m) return m
  if (!worker) {
    worker = new Worker(new URL('./bvh.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<Read>) => {
      const w = waiting.get(e.data.id)!
      waiting.delete(e.data.id)
      e.data.error ? w[1](new Error(e.data.error)) : w[0](e.data)
    }
  }
  const id = cache.size
  cache.set(url, (m = new Promise<Read>((ok, no) => (waiting.set(id, [ok, no]), worker!.postMessage({ id, url: new URL(url, location.href).href }))).then((r) => {
    const vb = device.createBuffer({ size: r.vb.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST })
    device.queue.writeBuffer(vb, 0, r.vb)
    return { vb, solid: r.solid, clear: r.clear, lo: r.lo, hi: r.hi, traced: keep(device, r.nodes, r.tris, r.mats), born: performance.now() }
  })))
  return m
}

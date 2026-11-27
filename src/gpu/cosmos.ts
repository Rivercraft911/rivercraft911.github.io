// The cosmos behind River's planet: deep space too rich to march every frame, so it is baked once, a few tiles a frame,
// while the opening plays (universe.wgsl), and only read after (fields/cosmos.wgsl: any field may call cosmos(rd)).
// The whole sky is a cube; each marvel in it, a fractal the size of a nebula or a galaxy, is its own patch of sky at
// three times the cube's sharpness, laid over it with its own transmittance. Everything is baked coarse first, so a deep
// link that lands straight on the planet has a sky at once, and sharp a few seconds later.
//
// 8 bits a channel, sRGB, so the hardware filters it in linear light, its steps below the display's own wherever the
// cosmos is dim. The cube is 6 × 1024² with three mips, 34 MB; each marvel 1536² with three, 12.5 MB.
import universe from './universe.wgsl?raw'

const FORMAT: GPUTextureFormat = 'rgba8unorm-srgb'
const N = 1024, M = 1536, LEVELS = 4, PREVIEW = 2
const TILE = 64
const BUDGET = 2400 // µs of GPU time a frame (an M4 Pro's), by the costs below
const LAG = 8 // ms: the GPU busier than this with the frames before, and the bake waits
const SKY = 0.075 // µs a sample of the sky
// The marvels, in the stars' frame (planet.wgsl's beyond: y the planet's pole, x where its sun stands): where each stands
// (longitude, latitude), how wide it is, and its turn about its own middle, in degrees; drawn in this order, so the
// nearest last. `cost`: µs a sample, as measured, so each frame's share of the bake costs about the same.
export const MARVELS = [
  { at: [205, -24], width: 34, turn: 20, cost: 0.086 }, // Indra's pearls, a nebula of soap-film bubbles
  { at: [95, -30], width: 24, turn: -35, cost: 0.038 }, // a galaxy with a Mandelbulb at its heart
  { at: [300, -12], width: 28, turn: 0, cost: 0.038 }, // a Kleinian cathedral, its tracery dust against glowing gas
]

// One texture's layer at one level: where it is drawn, its samples a texel, what it is (0 the sky, 1 a marvel), what a
// sample costs, and how many of its tiles are done.
type Job = { tex: GPUTexture; view: GPUTextureView; layer: number; level: number; ss: number; kind: number; cost: number; done: number }

export class Cosmos {
  readonly layout: GPUBindGroupLayout
  group!: GPUBindGroup
  private sky: GPUTexture
  private marvels: GPUTexture
  private smp: GPUSampler
  private where: GPUBuffer
  private u: GPUBuffer
  private uf = new Float32Array(4)
  private bakePipe?: GPURenderPipeline
  private downPipe?: GPURenderPipeline
  private bakeGroup?: GPUBindGroup
  private jobs: Job[] = []
  private base = [LEVELS, LEVELS] // the finest level each may be read at; LEVELS: none yet
  private lag = 0
  private probing = false

  constructor(readonly device: GPUDevice) {
    const d = device, usage = GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT
    this.sky = d.createTexture({ size: [N, N, 6], format: FORMAT, mipLevelCount: LEVELS, usage })
    this.marvels = d.createTexture({ size: [M, M, MARVELS.length], format: FORMAT, mipLevelCount: LEVELS, usage })
    this.smp = d.createSampler({ magFilter: 'linear', minFilter: 'linear', mipmapFilter: 'linear' })
    this.where = d.createBuffer({ size: 8 * 48, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })
    this.u = d.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })
    // each marvel's right (and the tangent of half its width), up and middle on the sky
    const w = new Float32Array(MARVELS.length * 12), R = Math.PI / 180
    MARVELS.forEach(({ at: [lon, lat], width, turn }, k) => {
      const c = [Math.cos(lat * R) * Math.cos(lon * R), Math.sin(lat * R), Math.cos(lat * R) * Math.sin(lon * R)]
      const e = [-Math.sin(lon * R), 0, Math.cos(lon * R)] // east
      const n = [e[1] * c[2] - e[2] * c[1], e[2] * c[0] - e[0] * c[2], e[0] * c[1] - e[1] * c[0]] // north
      const ct = Math.cos(turn * R), st = Math.sin(turn * R)
      w.set([...e.map((x, i) => ct * x + st * n[i]), Math.tan((width / 2) * R), ...n.map((x, i) => ct * x - st * e[i]), 0, ...c, 0], 12 * k)
    })
    d.queue.writeBuffer(this.where, 0, w)
    const F = GPUShaderStage.FRAGMENT
    this.layout = d.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: F, texture: { viewDimension: 'cube' } },
        { binding: 1, visibility: F, texture: { viewDimension: '2d-array' } },
        { binding: 2, visibility: F, sampler: {} },
        { binding: 3, visibility: F, buffer: {} },
      ],
    })
    this.bind()
    // coarse first, all of it; then sharp, the sky before the marvels
    const job = (tex: GPUTexture, layer: number, level: number, ss: number, kind: number, cost: number) =>
      this.jobs.push({ tex, view: this.level(tex, layer, level), layer, level, ss, kind, cost: cost * ss, done: 0 })
    for (let f = 0; f < 6; f++) job(this.sky, f, PREVIEW, 1, 0, SKY)
    MARVELS.forEach((m, k) => job(this.marvels, k, PREVIEW, 1, 1, m.cost))
    for (let f = 0; f < 6; f++) job(this.sky, f, 0, 1, 0, SKY)
    MARVELS.forEach((m, k) => job(this.marvels, k, 0, 2, 1, m.cost))
  }

  // What fields read: each texture from the finest level baked whole.
  private bind() {
    const view = (t: GPUTexture, b: number, dimension: GPUTextureViewDimension) =>
      t.createView({ dimension, baseMipLevel: Math.min(b, LEVELS - 1), mipLevelCount: b === 0 ? LEVELS : 1 })
    this.group = this.device.createBindGroup({
      layout: this.layout,
      entries: [
        { binding: 0, resource: view(this.sky, this.base[0], 'cube') },
        { binding: 1, resource: view(this.marvels, this.base[1], '2d-array') },
        { binding: 2, resource: this.smp },
        { binding: 3, resource: { buffer: this.where } },
      ],
    })
  }

  async compile() {
    const d = this.device, module = d.createShaderModule({ code: universe })
    const pipe = (fs: string) => d.createRenderPipelineAsync({ layout: 'auto', vertex: { module, entryPoint: 'vs' }, fragment: { module, entryPoint: fs, targets: [{ format: FORMAT }] } })
    ;[this.bakePipe, this.downPipe] = await Promise.all([pipe('bakeFS'), pipe('downFS')])
    this.bakeGroup = d.createBindGroup({ layout: this.bakePipe.getBindGroupLayout(0), entries: [{ binding: 0, resource: { buffer: this.u } }, { binding: 1, resource: { buffer: this.where } }] })
  }

  // A few tiles of one job a frame, within the budget, and only in the GPU's spare time: how long it takes to finish what
  // it was given before this frame says how busy it is. When a level of a texture is whole, it is read from then on; when
  // the sharp level is, the coarser ones are filtered down from it first.
  bake(enc: GPUCommandEncoder) {
    const J = this.jobs[0]
    if (!J || !this.bakePipe) return
    if (!this.probing) {
      const t = performance.now()
      this.probing = true
      this.device.queue.onSubmittedWorkDone().then(() => ((this.lag = performance.now() - t), (this.probing = false)))
    }
    if (this.lag > LAG) return
    const s = J.tex.width >> J.level, per = Math.ceil(s / TILE)
    this.uf[0] = s, this.uf[1] = J.layer, this.uf[2] = J.kind, this.uf[3] = J.ss
    this.device.queue.writeBuffer(this.u, 0, this.uf)
    const r = enc.beginRenderPass({ colorAttachments: [{ view: J.view, loadOp: 'load', storeOp: 'store' }] })
    r.setPipeline(this.bakePipe), r.setBindGroup(0, this.bakeGroup!)
    for (let spent = 0; J.done < per * per && (spent === 0 || spent + TILE * TILE * J.cost <= BUDGET); J.done++) {
      const x = (J.done % per) * TILE, y = Math.floor(J.done / per) * TILE, w = Math.min(TILE, s - x), h = Math.min(TILE, s - y)
      r.setScissorRect(x, y, w, h), r.draw(3)
      spent += w * h * J.cost
    }
    r.end()
    if (J.done < per * per) return
    this.jobs.shift()
    if (this.jobs.some((j) => j.tex === J.tex && j.level === J.level)) return // the rest of this level is still to come
    if (J.level === 0) this.filter(enc, J.tex)
    this.base[+(J.tex === this.marvels)] = J.level
    this.bind()
  }

  private level(t: GPUTexture, layer: number, level: number) {
    return t.createView({ dimension: '2d', baseArrayLayer: layer, arrayLayerCount: 1, baseMipLevel: level, mipLevelCount: 1 })
  }

  // Each coarser level, the one finer filtered down by two: one bilinear tap at the corner its four texels share.
  private filter(enc: GPUCommandEncoder, t: GPUTexture) {
    for (let layer = 0; layer < t.depthOrArrayLayers; layer++)
      for (let l = 1; l < LEVELS; l++) {
        const g = this.device.createBindGroup({ layout: this.downPipe!.getBindGroupLayout(0), entries: [{ binding: 2, resource: this.smp }, { binding: 3, resource: this.level(t, layer, l - 1) }] })
        const r = enc.beginRenderPass({ colorAttachments: [{ view: this.level(t, layer, l), loadOp: 'clear', storeOp: 'store' }] })
        r.setPipeline(this.downPipe!), r.setBindGroup(0, g), r.draw(3), r.end()
      }
  }
}

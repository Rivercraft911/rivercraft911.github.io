// The CRT: the beam deposits energy into a float phosphor that decays, scatters in the faceplate and glows.
import beamWGSL from './beam.wgsl?raw'
import postWGSL from './post.wgsl?raw'
import { FLOATS, type Beam } from '../beam/beam'

export type Look = {
  sigma: number // spot radius as a fraction of screen height
  power: number
  exposure: number
  halo: number // fraction of the light the faceplate scatters into glare
  tau: number // persistence time constant, seconds
}

export const LOOK: Look = { sigma: 0.0009, power: 1.4, exposure: 1.6, halo: 0.05, tau: 0.05 }

const FLOAT: GPUTextureFormat = 'rgba16float'
const PIXEL = 0.5 // σ of the pixel grid's own reconstruction, px
const PEAK = 4 // HDR: how far past SDR white the hottest core may burn
const LEVELS = 5
// Glare from the faceplate falls off as r^-2.5: each octave of radius holds 2^-0.5 of the light of the
// one inside it. The pyramid's levels are octaves, so these are their weights.
const GLARE = Array.from({ length: LEVELS }, (_, i) => 2 ** (-0.5 * i))
const ADD: GPUBlendState = {
  color: { srcFactor: 'one', dstFactor: 'one' },
  alpha: { srcFactor: 'one', dstFactor: 'one' },
}
const SCALE: GPUBlendState = {
  color: { srcFactor: 'one', dstFactor: 'constant' },
  alpha: { srcFactor: 'one', dstFactor: 'constant' },
}

export class Phosphor {
  private u: GPUBuffer
  private uf = new Float32Array(12)
  private k = [0, 0, 0, 0]
  private samples: GPUBuffer
  private post: GPUShaderModule
  private seg: GPURenderPipeline
  private decay: GPURenderPipeline
  private down: GPURenderPipeline
  private up: GPURenderPipeline
  private show!: GPURenderPipeline
  private smp: GPUSampler
  private segGroup: GPUBindGroup
  private acc!: GPUTexture
  private chain: GPUTexture[] = []
  private views: GPUTextureView[] = [] // acc, then the chain
  private groups: { down: GPUBindGroup[]; up: GPUBindGroup[]; show: GPUBindGroup[] } = { down: [], up: [], show: [] }
  private lo = 0 // pyramid levels skipped at the fine end
  private glare = 0 // the levels' total weight
  private hdr = false
  private stale = true
  private fresh = true
  private n = 0

  static async create(canvas: HTMLCanvasElement, maxSamples: number) {
    const adapter = await navigator.gpu?.requestAdapter({ powerPreference: 'high-performance' })
    if (!adapter) throw new Error('WebGPU unavailable')
    return new Phosphor(await adapter.requestDevice(), canvas.getContext('webgpu')!, maxSamples)
  }

  private constructor(readonly device: GPUDevice, private ctx: GPUCanvasContext, maxSamples: number) {
    const d = device
    const beam = d.createShaderModule({ code: beamWGSL })
    this.post = d.createShaderModule({ code: postWGSL })
    this.u = d.createBuffer({ size: this.uf.byteLength, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })
    this.samples = d.createBuffer({ size: maxSamples * FLOATS * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST })
    this.seg = this.pipe(beam, 'segVS', 'segFS', FLOAT, ADD)
    this.decay = this.pipe(beam, 'fullVS', 'decayFS', FLOAT, {
      color: { srcFactor: 'zero', dstFactor: 'constant' },
      alpha: { srcFactor: 'zero', dstFactor: 'constant' },
    })
    this.down = this.pipe(this.post, 'quadVS', 'downFS', FLOAT)
    this.up = this.pipe(this.post, 'quadVS', 'upFS', FLOAT, SCALE)
    this.smp = d.createSampler({ magFilter: 'linear', minFilter: 'linear' })
    this.segGroup = d.createBindGroup({
      layout: this.seg.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: this.u } }, { binding: 1, resource: { buffer: this.samples } }],
    })
    // An HDR display gets float output past SDR white; moving the window to another display re-asks.
    const hdr = matchMedia('(dynamic-range: high)')
    hdr.addEventListener('change', () => this.configure(hdr.matches))
    this.configure(hdr.matches)
  }

  private pipe(module: GPUShaderModule, vs: string, fs: string, format: GPUTextureFormat, blend?: GPUBlendState) {
    return this.device.createRenderPipeline({
      layout: 'auto',
      vertex: { module, entryPoint: vs },
      fragment: { module, entryPoint: fs, targets: [{ format, blend }] },
    })
  }

  private configure(hdr: boolean) {
    const format = hdr ? FLOAT : navigator.gpu.getPreferredCanvasFormat()
    const toneMapping: GPUCanvasToneMapping = { mode: hdr ? 'extended' : 'standard' }
    this.ctx.configure({ device: this.device, format, colorSpace: 'display-p3', toneMapping, alphaMode: 'opaque' })
    this.show = this.pipe(this.post, 'quadVS', 'displayFS', format)
    this.hdr = hdr
    this.stale = true
  }

  // lo > 0 starts the glare pyramid that many octaves coarser: cheaper, and nearly invisible.
  resize(w: number, h: number, lo = 0) {
    if (!this.stale && this.acc.width === w && this.acc.height === h && this.lo === lo) return
    const d = this.device
    const tex = (w: number, h: number) =>
      d.createTexture({ size: [Math.max(1, w), Math.max(1, h)], format: FLOAT, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING })
    if (this.acc?.width !== w || this.acc.height !== h) {
      this.acc?.destroy()
      this.acc = tex(w, h)
      this.fresh = true
    }
    this.chain.forEach((t) => t.destroy())
    this.chain = Array.from({ length: LEVELS - lo }, (_, i) => tex(w >> (i + 1 + lo), h >> (i + 1 + lo)))
    this.views = [this.acc, ...this.chain].map((t) => t.createView())
    const group = (p: GPURenderPipeline, i: number, entries: GPUBindingResource[]) =>
      d.createBindGroup({ layout: p.getBindGroupLayout(i), entries: entries.map((resource, binding) => ({ binding, resource })) })
    const v = this.views
    this.groups = {
      down: this.chain.map((_, i) => group(this.down, 0, [v[i], this.smp])),
      up: this.chain.slice(1).map((_, i) => group(this.up, 0, [v[i + 2], this.smp])),
      show: [group(this.show, 0, [v[0], this.smp]), group(this.show, 1, [{ buffer: this.u }, v[1]])],
    }
    this.lo = lo
    this.glare = GLARE.slice(lo).reduce((a, b) => a + b)
    this.stale = false
  }

  draw(beam: Beam, aspect: number, dt: number, look: Look) {
    const d = this.device, { width: w, height: h } = this.acc, uf = this.uf, k = this.k
    const s = Math.hypot(look.sigma * h, PIXEL) // the spot as the pixel grid can show it
    const decay = Math.exp(-dt / look.tau)
    uf[0] = w, uf[1] = h, uf[2] = aspect, uf[3] = s
    // The beam hands over energy per second. A frame's worth, decaying as it lands, is P·τ(1 − k), so a
    // steady trace holds P·τ at any refresh rate; dividing τ back out lets τ set trail length, not
    // brightness. h·σ keeps a line's peak the same at any resolution.
    uf[4] = (look.power * h * s * LOOK.tau * (1 - decay)) / (look.sigma * 1e6 * dt)
    uf[5] = look.exposure
    uf[6] = this.hdr ? PEAK : 1
    uf[7] = (look.halo * GLARE[LEVELS - 1]) / this.glare
    uf[8] = this.hdr ? 0 : 1 / 255
    uf[9] = this.n = (this.n + 1) % 64
    d.queue.writeBuffer(this.u, 0, uf)
    d.queue.writeBuffer(this.samples, 0, beam.data, 0, beam.n * FLOATS)

    const enc = d.createCommandEncoder()
    const pass = (view: GPUTextureView, load: GPULoadOp = 'clear') =>
      enc.beginRenderPass({ colorAttachments: [{ view, loadOp: load, storeOp: 'store', clearValue: [0, 0, 0, 1] }] })

    const p = pass(this.views[0], this.fresh ? 'clear' : 'load')
    k.fill(decay)
    p.setBlendConstant(k)
    p.setPipeline(this.decay)
    p.draw(3)
    if (beam.n > 1) {
      p.setPipeline(this.seg)
      p.setBindGroup(0, this.segGroup)
      p.draw(6, beam.n - 1)
    }
    p.end()
    this.fresh = false

    // Down the pyramid, then back up, each level added in at its octave's share of the glare.
    const n = this.chain.length
    for (let i = 0; i < n; i++) this.quad(pass(this.views[i + 1]), this.down, [this.groups.down[i]])
    for (let i = n - 2; i >= 0; i--) {
      const up = pass(this.views[i + 1], 'load')
      up.setBlendConstant(k.fill(GLARE[i + this.lo] / GLARE[LEVELS - 1]))
      this.quad(up, this.up, [this.groups.up[i]])
    }
    this.quad(pass(this.ctx.getCurrentTexture().createView()), this.show, this.groups.show)
    d.queue.submit([enc.finish()])
  }

  private quad(p: GPURenderPassEncoder, pipe: GPURenderPipeline, groups: GPUBindGroup[]) {
    p.setPipeline(pipe)
    groups.forEach((g, i) => p.setBindGroup(i, g))
    p.draw(3)
    p.end()
  }
}

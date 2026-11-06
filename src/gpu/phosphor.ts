// The CRT: the beam deposits energy into a float phosphor that decays, blooms and glows.
import beamWGSL from './beam.wgsl?raw'
import postWGSL from './post.wgsl?raw'
import { FLOATS, type Beam } from '../beam/beam'

export type Look = {
  sigma: number // spot radius as a fraction of screen height
  power: number
  exposure: number
  bloom: number
  tau: number // persistence time constant, seconds
}

export const LOOK: Look = { sigma: 0.0011, power: 1.4, exposure: 1.6, bloom: 0.7, tau: 0.05 }

const HDR: GPUTextureFormat = 'rgba16float'
const LEVELS = 5
const ADD: GPUBlendState = {
  color: { srcFactor: 'one', dstFactor: 'one' },
  alpha: { srcFactor: 'one', dstFactor: 'one' },
}

export class Phosphor {
  private u: GPUBuffer
  private uf = new Float32Array(8)
  private samples: GPUBuffer
  private seg: GPURenderPipeline
  private decay: GPURenderPipeline
  private down: GPURenderPipeline
  private up: GPURenderPipeline
  private show: GPURenderPipeline
  private smp: GPUSampler
  private segGroup: GPUBindGroup
  private acc!: GPUTexture
  private chain: GPUTexture[] = []
  private groups: { down: GPUBindGroup[]; up: GPUBindGroup[]; show: GPUBindGroup[] } = { down: [], up: [], show: [] }
  private fresh = true

  static async create(canvas: HTMLCanvasElement, maxSamples: number) {
    const adapter = await navigator.gpu?.requestAdapter({ powerPreference: 'high-performance' })
    if (!adapter) throw new Error('WebGPU unavailable')
    const device = await adapter.requestDevice()
    const ctx = canvas.getContext('webgpu')!
    const format = navigator.gpu.getPreferredCanvasFormat()
    ctx.configure({ device, format, alphaMode: 'opaque' })
    return new Phosphor(device, ctx, format, maxSamples)
  }

  private constructor(readonly device: GPUDevice, private ctx: GPUCanvasContext, format: GPUTextureFormat, maxSamples: number) {
    const d = device
    const beam = d.createShaderModule({ code: beamWGSL })
    const post = d.createShaderModule({ code: postWGSL })
    const pipe = (module: GPUShaderModule, vs: string, fs: string, format: GPUTextureFormat, blend?: GPUBlendState) =>
      d.createRenderPipeline({
        layout: 'auto',
        vertex: { module, entryPoint: vs },
        fragment: { module, entryPoint: fs, targets: [{ format, blend }] },
      })

    this.u = d.createBuffer({ size: this.uf.byteLength, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })
    this.samples = d.createBuffer({ size: maxSamples * FLOATS * 4, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST })
    this.seg = pipe(beam, 'segVS', 'segFS', HDR, ADD)
    this.decay = pipe(beam, 'fullVS', 'decayFS', HDR, {
      color: { srcFactor: 'zero', dstFactor: 'constant' },
      alpha: { srcFactor: 'zero', dstFactor: 'constant' },
    })
    this.down = pipe(post, 'quadVS', 'downFS', HDR)
    this.up = pipe(post, 'quadVS', 'upFS', HDR, ADD)
    this.show = pipe(post, 'quadVS', 'displayFS', format)
    this.smp = d.createSampler({ magFilter: 'linear', minFilter: 'linear' })
    this.segGroup = d.createBindGroup({
      layout: this.seg.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: this.u } }, { binding: 1, resource: { buffer: this.samples } }],
    })
  }

  resize(w: number, h: number) {
    if (this.acc?.width === w && this.acc.height === h) return
    const d = this.device
    const tex = (w: number, h: number) =>
      d.createTexture({ size: [Math.max(1, w), Math.max(1, h)], format: HDR, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING })
    this.acc?.destroy()
    this.chain.forEach((t) => t.destroy())
    this.acc = tex(w, h)
    this.chain = Array.from({ length: LEVELS }, (_, i) => tex(w >> (i + 1), h >> (i + 1)))
    const group = (p: GPURenderPipeline, i: number, entries: GPUBindingResource[]) =>
      d.createBindGroup({ layout: p.getBindGroupLayout(i), entries: entries.map((resource, binding) => ({ binding, resource })) })
    const view = (t: GPUTexture) => t.createView()
    this.groups = {
      down: this.chain.map((_, i) => group(this.down, 0, [view(i ? this.chain[i - 1] : this.acc), this.smp])),
      up: this.chain.slice(1).map((t) => group(this.up, 0, [view(t), this.smp])),
      show: [group(this.show, 0, [view(this.acc), this.smp]), group(this.show, 1, [{ buffer: this.u }, view(this.chain[0])])],
    }
    this.fresh = true
  }

  draw(beam: Beam, aspect: number, dt: number, time: number, look: Look) {
    const d = this.device, { width: w, height: h } = this.acc
    const uf = this.uf
    uf[0] = w, uf[1] = h, uf[2] = aspect, uf[3] = look.sigma * h
    // Energy scales with resolution² and inversely with persistence: τ sets trail length, not brightness.
    uf[4] = ((look.power * (h / 1000) ** 2) * LOOK.tau) / look.tau, uf[5] = look.exposure, uf[6] = look.bloom, uf[7] = time
    d.queue.writeBuffer(this.u, 0, uf)
    d.queue.writeBuffer(this.samples, 0, beam.data, 0, beam.n * FLOATS)

    const enc = d.createCommandEncoder()
    const pass = (view: GPUTextureView, load: GPULoadOp = 'clear') =>
      enc.beginRenderPass({ colorAttachments: [{ view, loadOp: load, storeOp: 'store', clearValue: [0, 0, 0, 1] }] })

    const p = pass(this.acc.createView(), this.fresh ? 'clear' : 'load')
    const k = Math.exp(-dt / look.tau)
    p.setBlendConstant([k, k, k, k])
    p.setPipeline(this.decay)
    p.draw(3)
    if (beam.n > 1) {
      p.setPipeline(this.seg)
      p.setBindGroup(0, this.segGroup)
      p.draw(6, beam.n - 1)
    }
    p.end()
    this.fresh = false

    this.chain.forEach((t, i) => this.quad(pass(t.createView()), this.down, [this.groups.down[i]]))
    for (let i = LEVELS - 2; i >= 0; i--) this.quad(pass(this.chain[i].createView(), 'load'), this.up, [this.groups.up[i]])
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

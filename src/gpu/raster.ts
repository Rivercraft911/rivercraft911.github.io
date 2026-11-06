// The raster. Past the fall the CRT also sweeps a raster: a field shader paints a whole frame of light,
// which lands in the phosphor the way the beam's light does, so it persists, halates and tone-maps with
// everything else, and the beam goes on drawing over it. A frame may instead be read out as text: every
// cell of the screen is matched by shape to the nearest glyph of a character generator the beam drew.
import prelude from './field.wgsl?raw'
import rasterWGSL from './raster.wgsl?raw'
import { FIELDS } from './fields'

export type Field = {
  shader: number // index into FIELDS
  k: number // brightness
  p: Float32Array // the shader's parameters, up to 60 floats
  cell?: number // read out as text, in cells this many CSS px tall (3:5)
  ink?: readonly number[] // the glyphs' colour, linear
  lift?: number // how much light makes a cell full
  rows?: { data: Uint8Array; at: number; n: number } // new rows for the shader's data texture, ring row `at`
  read?: Uint8Array // filled, a frame or two late, with the centre row of text
}

const FLOAT: GPUTextureFormat = 'rgba16float'
export const TILE = [24, 40] // a glyph's tile in the atlas, px
const ATLAS_COLS = 8

export class Raster {
  scale = 0.5 // the light's resolution against the phosphor's
  chars = '' // the character generator's glyphs, in atlas order
  atlas!: GPUTexture
  private fields: { pipe: GPURenderPipeline; u: GPUBuffer; data: GPUTexture; group: GPUBindGroup }[] = []
  private light!: GPURenderPipeline
  private cell!: GPURenderPipeline
  private text!: GPURenderPipeline
  private u: GPUBuffer
  private uf = new Float32Array(20)
  private glyph: GPUBuffer
  private smp: GPUSampler
  private tex?: GPUTexture // the field's frame
  private cells?: GPUTexture
  private groups: GPUBindGroup[] = []
  private on = false
  private mode = 0 // 0 light, 1 text
  private back: GPUBuffer // the centre row, read back
  private reading?: Uint8Array
  private cols = 0
  private head = new Float32Array(4)

  constructor(readonly device: GPUDevice) {
    const d = device
    this.u = d.createBuffer({ size: this.uf.byteLength, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })
    this.glyph = d.createBuffer({ size: 256 * 16, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })
    this.smp = d.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'repeat', addressModeV: 'repeat' })
    this.back = d.createBuffer({ size: 4096, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST })
  }

  // Every pipeline is compiled before the first frame, so no reality hitches when it arrives.
  async compile(acc: GPUTextureFormat) {
    const d = this.device, ADD: GPUBlendState = { color: { srcFactor: 'one', dstFactor: 'one' }, alpha: { srcFactor: 'one', dstFactor: 'one' } }
    const layout = d.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: {} },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: {} },
      ],
    })
    const pipe = (module: GPUShaderModule, fs: string, format: GPUTextureFormat, blend?: GPUBlendState, lay: GPUPipelineLayout | 'auto' = 'auto') =>
      d.createRenderPipelineAsync({ layout: lay, vertex: { module, entryPoint: 'vs' }, fragment: { module, entryPoint: fs, targets: [{ format, blend }] } })
    const r = d.createShaderModule({ code: rasterWGSL }), fl = d.createPipelineLayout({ bindGroupLayouts: [layout] })
    ;[this.light, this.cell, this.text] = await Promise.all([pipe(r, 'lightFS', acc, ADD), pipe(r, 'cellFS', 'rg32float'), pipe(r, 'textFS', acc, ADD)])
    this.fields = await Promise.all(
      FIELDS.map(async (f) => {
        const [w, h] = f.data ?? [1, 1]
        const data = d.createTexture({ size: [w, h], format: 'r8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST })
        const u = d.createBuffer({ size: 256, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })
        const group = d.createBindGroup({ layout, entries: [{ binding: 0, resource: { buffer: u } }, { binding: 1, resource: this.smp }, { binding: 2, resource: data.createView() }] })
        return { pipe: await pipe(d.createShaderModule({ code: prelude + f.code }), 'fs', FLOAT, undefined, fl), u, data, group }
      }),
    )
  }

  // The character generator: tiles the beam drew into `atlas`, and each one's ink over a 3 × 5 grid,
  // normalized so the inkiest block of any glyph is 1.
  setGlyphs(chars: string, ink: Float32Array) {
    let hi = 0
    for (const v of ink) hi = Math.max(hi, v)
    const g = new Float32Array(256 * 4)
    for (let i = 0; i < chars.length; i++) for (let k = 0; k < 15; k++) g[i * 16 + k] = ink[i * 15 + k] / hi
    this.device.queue.writeBuffer(this.glyph, 0, g)
    this.chars = chars
  }

  makeAtlas(n: number) {
    const rows = Math.ceil(n / ATLAS_COLS)
    this.atlas = this.device.createTexture({
      size: [ATLAS_COLS * TILE[0], rows * TILE[1]],
      format: FLOAT,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC,
    })
    return { cols: ATLAS_COLS, rows }
  }

  // Renders the field (and its text) for this frame, ahead of the phosphor's pass.
  render(enc: GPUCommandEncoder, f: Field | undefined, w: number, h: number, aspect: number, dpr: number, gain: number) {
    this.on = !!f
    if (!f) return
    const d = this.device, F = this.fields[f.shader], uf = this.uf
    const text = !!f.cell && this.chars.length > 0
    const ch = Math.round((f.cell ?? 20) * dpr), cw = Math.round(ch * 0.6)
    const cols = Math.floor(w / cw), rows = Math.floor(h / ch)
    const fw = text ? cols * 6 : Math.max(1, Math.round(w * this.scale)), fh = text ? rows * 10 : Math.max(1, Math.round(h * this.scale))
    if (this.tex?.width !== fw || this.tex.height !== fh || this.mode !== +text || (text && this.cells?.width !== cols)) {
      this.tex?.destroy(), this.cells?.destroy()
      const tex = (w: number, h: number, format: GPUTextureFormat) =>
        d.createTexture({ size: [w, h], format, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC })
      this.tex = tex(fw, fh, FLOAT)
      this.cells = tex(Math.max(1, cols), Math.max(1, rows), 'rg32float')
      const group = (p: GPURenderPipeline, e: [number, GPUBindingResource][]) =>
        d.createBindGroup({ layout: p.getBindGroupLayout(0), entries: e.map(([binding, resource]) => ({ binding, resource })) })
      const u = { buffer: this.u }, s = this.smp, v = this.tex.createView()
      this.groups = [group(this.light, [[0, u], [1, s], [2, v]])]
      if (text)
        this.groups.push(
          group(this.cell, [[0, u], [1, s], [2, v], [5, { buffer: this.glyph }]]),
          group(this.text, [[0, u], [1, s], [3, this.cells.createView()], [4, this.atlas.createView()]]),
        )
      this.mode = +text
    }

    const head = this.head
    head[0] = fw, head[1] = fh, head[2] = aspect, head[3] = 2 / fh
    d.queue.writeBuffer(F.u, 0, head)
    d.queue.writeBuffer(F.u, 16, f.p)
    if (f.rows) {
      const { data, at, n } = f.rows, W = F.data.width, H = F.data.height, a = at % H, m = Math.min(n, H - a)
      d.queue.writeTexture({ texture: F.data, origin: [0, a] }, data, { bytesPerRow: W }, [W, m])
      if (n > m) d.queue.writeTexture({ texture: F.data }, data, { offset: m * W, bytesPerRow: W }, [W, n - m])
    }
    uf[0] = w, uf[1] = h, uf[2] = cw, uf[3] = ch, uf[4] = cols, uf[5] = rows
    uf[6] = Math.floor((w - cols * cw) / 2), uf[7] = Math.floor((h - rows * ch) / 2)
    const ink = f.ink ?? [0.35, 1, 0.55]
    uf[8] = ink[0], uf[9] = ink[1], uf[10] = ink[2], uf[11] = gain * f.k
    uf[12] = TILE[0], uf[13] = TILE[1], uf[14] = ATLAS_COLS, uf[15] = this.chars.length
    uf[16] = f.lift ?? 2, uf[17] = 0.35
    d.queue.writeBuffer(this.u, 0, uf)

    const pass = (view: GPUTextureView, p: GPURenderPipeline, g: GPUBindGroup) => {
      const r = enc.beginRenderPass({ colorAttachments: [{ view, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 0] }] })
      r.setPipeline(p), r.setBindGroup(0, g), r.draw(3), r.end()
    }
    pass(this.tex!.createView(), F.pipe, F.group)
    if (!text) return
    pass(this.cells!.createView(), this.cell, this.groups[1])
    if (f.read && !this.reading) {
      enc.copyTextureToBuffer({ texture: this.cells!, origin: [0, rows >> 1] }, { buffer: this.back, bytesPerRow: 4096 }, [Math.min(cols, 512), 1])
      this.reading = f.read
      this.cols = Math.min(cols, 512)
    }
  }

  // Inside the phosphor's pass: the frame's light lands on the screen.
  composite(p: GPURenderPassEncoder) {
    if (!this.on) return
    p.setPipeline(this.mode ? this.text : this.light)
    p.setBindGroup(0, this.groups[this.mode ? 2 : 0])
    p.draw(3)
  }

  // After the frame is submitted: collect the centre row of text once the GPU has written it.
  collect() {
    const out = this.reading
    if (!out || this.back.mapState !== 'unmapped') return
    const n = this.cols
    this.back.mapAsync(GPUMapMode.READ).then(() => {
      const g = new Float32Array(this.back.getMappedRange(0, n * 8))
      out.fill(0)
      for (let i = 0; i < n && i < out.length; i++) out[i] = this.chars.charCodeAt(g[2 * i]) || 32
      this.back.unmap()
      this.reading = undefined
    })
  }
}

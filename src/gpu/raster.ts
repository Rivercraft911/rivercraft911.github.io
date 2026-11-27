// The raster. Past the fall the CRT also sweeps a raster: a field shader paints a whole frame of light,
// which lands in the phosphor the way the beam's light does, so it persists, halates and tone-maps with
// everything else, and the beam goes on drawing over it. A frame may instead be read out as text: every
// cell of the screen is matched by shape to the nearest glyph of a character generator the beam drew.
// Solid things (mesh.ts) stand in it, depth-tested against it, seen through the same lens.
import prelude from './field.wgsl?raw'
import rasterWGSL from './raster.wgsl?raw'
import { FIELDS, PLANET } from './fields'
import { Mesh, type Solids } from './mesh'
import { Cosmos } from './cosmos'

export type Field = {
  shader: number // index into FIELDS
  k: number // brightness
  p: Float32Array // the shader's parameters, up to 60 floats
  res?: number // the light's resolution against the raster's usual
  cell?: number // read out as text, in cells this many CSS px tall (3:5); where the field says it is not text, light
  fine?: number // read out as text, the field's pixels across each of a cell's 6 × 10
  ink?: readonly number[] // the glyphs' colour, linear
  tint?: number // read out as text, how far each glyph takes the colour of the light it reads (0: all ink)
  lift?: number // how much light makes a cell full
  rows?: { data: Uint8Array; at: number; n: number } // new rows for the shader's data texture, ring row `at`
  read?: Uint8Array // filled, a frame or two late, with the centre row of text
  solids?: Solids // solid things, lit, in front of and behind the field's own (mesh.ts)
}

// Pictures on their way into a field's data texture (an rgba8 one with mips), each an image decoded off the main
// thread and copied in on the GPU, a few a frame, so the scene they are for never waits and no frame stalls on them.
export const pictures: { shader: number; img: ImageBitmap; x: number; y: number; mip: number }[] = []

const FLOAT: GPUTextureFormat = 'rgba16float'
export const TILE = [24, 40] // a glyph's tile in the atlas, px
export const GRID = [6, 10] // a cell's shape: its light over this grid, and a glyph's ink over the same
const ATLAS_COLS = 8

export class Raster {
  scale = 0.5 // the light's resolution against the phosphor's
  chars = '' // the character generator's glyphs, in atlas order
  atlas!: GPUTexture
  private fields: { pipe: GPURenderPipeline; u: GPUBuffer; group: GPUBindGroup }[] = []
  private data: GPUTexture[] // each field's data texture, there from the start so rows land while the pipelines compile
  private ready = false
  private light!: GPURenderPipeline
  private halfPipe!: GPURenderPipeline
  private half?: GPUTexture // the scene at half size, for the lens
  private halfGroup?: GPUBindGroup
  private cell!: GPURenderPipeline
  private text!: GPURenderPipeline
  private u: GPUBuffer
  private uf = new Float32Array(24)
  private glyph: GPUBuffer
  private smp: GPUSampler
  private tex?: GPUTexture // the field's frame
  private dist?: GPUTexture // and how far along each pixel's ray its light came from (field.wgsl)
  private blank: GPUTexture
  private blankDist: GPUTexture
  private turn = 0
  private solidView?: GPUTextureView | null = null // the mesh pass's light the light group was made with (null: none yet)
  private shadeView?: GPUTextureView // and the traced ground's
  private none!: GPUTextureView
  private ball = new Float32Array(4)
  readonly mesh: Mesh
  readonly cosmos: Cosmos // the sky beyond, for any field that reads it: group 1 (fields/cosmos.wgsl)
  private cells?: GPUTexture
  private groups: GPUBindGroup[] = []
  private views: GPUTextureView[] = [] // the field's frame, the cells, the field's distances
  private on = false
  private mode = 0 // 0 light, 1 text
  private back: GPUBuffer // the centre row, read back
  private reading?: Uint8Array
  private cols = 0
  private head = new Float32Array(4)

  constructor(readonly device: GPUDevice) {
    const d = device
    this.u = d.createBuffer({ size: this.uf.byteLength, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })
    this.glyph = d.createBuffer({ size: 64 * 60 * 4, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })
    this.smp = d.createSampler({ magFilter: 'linear', minFilter: 'linear', mipmapFilter: 'linear', addressModeU: 'repeat', addressModeV: 'repeat' })
    this.back = d.createBuffer({ size: 8192, usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST })
    this.blank = d.createTexture({ size: [1, 1], format: FLOAT, usage: GPUTextureUsage.TEXTURE_BINDING })
    this.blankDist = d.createTexture({ size: [1, 1], format: 'r16float', usage: GPUTextureUsage.TEXTURE_BINDING })
    this.none = this.blank.createView()
    this.mesh = new Mesh(d)
    this.cosmos = new Cosmos(d)
    this.data = FIELDS.map(({ data: [w, h, b = 1, mips = 1] = [1, 1] }) =>
      d.createTexture({
        size: [w, h],
        mipLevelCount: mips,
        format: b > 2 ? 'rgba8unorm' : b > 1 ? 'rg8unorm' : 'r8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | (mips > 1 ? GPUTextureUsage.RENDER_ATTACHMENT : 0), // a picture's copy-in needs it
      }),
    )
  }

  // Every pipeline compiles while the first act plays, which needs none of them, so no reality hitches
  // when it arrives and the first frame waits for none. Until then a field is not swept, but its rows land.
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
      d.createRenderPipelineAsync({
        layout: lay,
        vertex: { module, entryPoint: 'vs' },
        fragment: { module, entryPoint: fs, targets: lay === 'auto' ? [{ format, blend }] : [{ format, blend }, { format: 'r32float' }] }, // a field's light, and its distance
      })
    const solids = this.mesh.compile(), sky = this.cosmos.compile()
    const r = d.createShaderModule({ code: rasterWGSL }), fl = d.createPipelineLayout({ bindGroupLayouts: [layout, this.cosmos.layout] })
    ;[this.light, this.cell, this.text, this.halfPipe] = await Promise.all([pipe(r, 'lightFS', acc, ADD), pipe(r, 'cellFS', 'rgba32float'), pipe(r, 'textFS', acc, ADD), pipe(r, 'halfFS', FLOAT)])
    this.fields = await Promise.all(
      FIELDS.map(async (f, i) => {
        const u = d.createBuffer({ size: 256, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })
        const group = d.createBindGroup({ layout, entries: [{ binding: 0, resource: { buffer: u } }, { binding: 1, resource: this.smp }, { binding: 2, resource: this.data[i].createView() }] })
        return { pipe: await pipe(d.createShaderModule({ code: prelude + f.code }), 'fs', FLOAT, undefined, fl), u, group }
      }),
    )
    await Promise.all([solids, sky])
    this.ready = true
  }

  // The character generator: tiles the beam drew into `atlas`, and each one's ink over the GRID, as the
  // fraction of each block its strokes cover.
  setGlyphs(chars: string, ink: Float32Array) {
    this.device.queue.writeBuffer(this.glyph, 0, ink.subarray(0, 64 * 60))
    this.chars = chars
  }

  makeAtlas(n: number) {
    this.atlas = this.device.createTexture({
      size: [ATLAS_COLS * TILE[0], Math.ceil(n / ATLAS_COLS) * TILE[1]],
      format: FLOAT,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC,
    })
    return ATLAS_COLS
  }

  // Renders the field (and its text) for this frame, ahead of the phosphor's pass.
  render(enc: GPUCommandEncoder, f: Field | undefined, w: number, h: number, aspect: number, dpr: number, gain: number) {
    this.on = false
    this.cosmos.bake(enc) // a few tiles of the sky a frame, until it is whole
    for (let px = 0; pictures.length && px < 1 << 20; ) { // about a megapixel a frame
      const { shader, img, x, y, mip } = pictures.shift()!
      this.device.queue.copyExternalImageToTexture({ source: img }, { texture: this.data[shader], origin: [x, y], mipLevel: mip, premultipliedAlpha: true }, [img.width, img.height])
      px += img.width * img.height
      img.close()
    }
    if (!f) return
    const d = this.device, uf = this.uf
    if (f.rows) {
      const { data, at, n } = f.rows, D = this.data[f.shader], W = D.width, H = D.height, a = at % H, m = Math.min(n, H - a)
      const B = W * (FIELDS[f.shader].data?.[2] ?? 1)
      d.queue.writeTexture({ texture: D, origin: [0, a] }, data, { bytesPerRow: B }, [W, m])
      if (n > m) d.queue.writeTexture({ texture: D }, data, { offset: m * B, bytesPerRow: B }, [W, n - m])
    }
    if (!this.ready) return // still compiling: its data kept, nothing swept
    const text = !!f.cell && this.chars.length > 0
    const ch = Math.round((f.cell ?? 20) * dpr), cw = Math.round(ch * 0.6)
    const cols = Math.floor(w / cw), rows = Math.floor(h / ch), sc = Math.min(1, this.scale * (f.res ?? 1))
    const fine = text ? (f.fine ?? 1) : 1
    const fw = text ? cols * GRID[0] * fine : Math.max(1, Math.round(w * sc)), fh = text ? rows * GRID[1] * fine : Math.max(1, Math.round(h * sc))
    if (this.tex?.width !== fw || this.tex.height !== fh || this.mode !== +text || (text && this.cells?.width !== cols)) {
      this.tex?.destroy(), this.cells?.destroy(), this.dist?.destroy()
      const tex = (w: number, h: number, format: GPUTextureFormat) =>
        d.createTexture({ size: [w, h], format, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC })
      this.tex = tex(fw, fh, FLOAT)
      this.dist = tex(fw, fh, 'r32float')
      this.solidView = null
      this.cells = tex(Math.max(1, cols), Math.max(1, rows), 'rgba32float')
      const group = (p: GPURenderPipeline, e: [number, GPUBindingResource][]) =>
        d.createBindGroup({ layout: p.getBindGroupLayout(0), entries: e.map(([binding, resource]) => ({ binding, resource })) })
      const u = { buffer: this.u }, s = this.smp, v = (this.views[0] = this.tex.createView())
      this.views[1] = this.cells.createView()
      this.views[2] = this.dist.createView()
      // [0] the light (made below, with the solids' light), [1] the cells, [2] the text
      this.groups = text ? [this.groups[0], this.groups[1], group(this.text, [[0, u], [1, s], [2, v], [3, this.views[1]], [4, this.atlas.createView()]])] : [] // [1] the cells, made below with the solids' light
      this.mode = +text
    }

    const pass = (view: GPUTextureView, p: GPURenderPipeline, g: GPUBindGroup) => {
      const r = enc.beginRenderPass({ colorAttachments: [{ view, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 0] }] })
      r.setPipeline(p), r.setBindGroup(0, g), r.draw(3), r.end()
    }
    // A field's uniforms are written once a frame, so no field is swept twice in one.
    const sweep = (G: Field, view: GPUTextureView, dist: GPUTextureView, w: number, h: number, aspect: number) => {
      const S = this.fields[G.shader]
      this.head.set([w, h, aspect, 2 / h])
      d.queue.writeBuffer(S.u, 0, this.head)
      d.queue.writeBuffer(S.u, 16, G.p)
      const at = (view: GPUTextureView): GPURenderPassColorAttachment => ({ view, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 0] })
      const r = enc.beginRenderPass({ colorAttachments: [at(view), at(dist)] })
      r.setPipeline(S.pipe), r.setBindGroup(0, S.group), r.setBindGroup(1, this.cosmos.group), r.draw(3), r.end()
    }
    if (!f.k) return // dark: its data kept, nothing swept
    this.on = true
    uf[0] = w, uf[1] = h, uf[2] = cw, uf[3] = ch, uf[4] = cols, uf[5] = rows
    uf[6] = Math.floor((w - cols * cw) / 2), uf[7] = Math.floor((h - rows * ch) / 2)
    const ink = f.ink ?? [0.35, 1, 0.55]
    uf[8] = ink[0], uf[9] = ink[1], uf[10] = ink[2], uf[11] = gain * f.k
    uf[12] = TILE[0], uf[13] = TILE[1], uf[14] = ATLAS_COLS, uf[15] = this.chars.length
    uf[16] = f.lift ?? 2, uf[17] = 0.2, uf[18] = fine
    uf[19] = f.solids?.focus ?? 1, uf[20] = text ? 0 : (f.solids?.aperture ?? 0), uf[21] = (this.turn = (this.turn + 2.3999632 * 0.618) % 6.2831853), uf[22] = f.tint ?? 0
    d.queue.writeBuffer(this.u, 0, uf)

    sweep(f, this.views[0], this.views[2], fw, fh, aspect)
    // the planet's field says where its ground is (planet.wgsl's p[4]), for the solids' traced light
    if (f.shader === PLANET) for (let i = 0; i < 4; i++) this.ball[i] = f.p[16 + i]
    // read out as text, a solid thing is glyphs too, and its light is not traced
    this.mesh.render(enc, f.solids, w, h, this.views[2], text ? undefined : this.views[0], f.shader === PLANET ? this.ball : undefined)
    if (!text) {
      if (this.half?.width !== Math.max(1, w >> 1) || this.half.height !== Math.max(1, h >> 1)) {
        this.half?.destroy()
        this.half = d.createTexture({ size: [Math.max(1, w >> 1), Math.max(1, h >> 1)], format: FLOAT, usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING })
        this.solidView = null
      }
      const shade = this.mesh.ground ?? this.none
      if (this.mesh.view !== this.solidView || shade !== this.shadeView) {
        const sv = (this.solidView = this.mesh.view) ?? this.none
        this.shadeView = shade
        const scene: GPUBindGroupEntry[] = [
          { binding: 0, resource: { buffer: this.u } },
          { binding: 1, resource: this.smp },
          { binding: 2, resource: this.views[0] },
          { binding: 6, resource: sv },
          { binding: 7, resource: this.mesh.distView ?? this.blankDist.createView() },
          { binding: 8, resource: this.views[2] },
          { binding: 10, resource: shade },
        ]
        this.halfGroup = d.createBindGroup({ layout: this.halfPipe.getBindGroupLayout(0), entries: scene })
        this.groups[0] = d.createBindGroup({ layout: this.light.getBindGroupLayout(0), entries: [...scene, { binding: 9, resource: this.half.createView() }] })
      }
      if (uf[20] > 0) pass(this.half.createView(), this.halfPipe, this.halfGroup!) // the lens is open: its taps' scene
    }
    if (!text) return
    if (this.mesh.view !== this.solidView) {
      const sv = (this.solidView = this.mesh.view) ?? this.blank.createView()
      const e: GPUBindGroupEntry[] = [{ binding: 0, resource: { buffer: this.u } }, { binding: 2, resource: this.views[0] }, { binding: 5, resource: { buffer: this.glyph } }, { binding: 6, resource: sv }]
      this.groups[1] = d.createBindGroup({ layout: this.cell.getBindGroupLayout(0), entries: e })
    }
    pass(this.views[1], this.cell, this.groups[1])
    if (f.read && !this.reading) {
      enc.copyTextureToBuffer({ texture: this.cells!, origin: [0, rows >> 1] }, { buffer: this.back, bytesPerRow: 8192 }, [Math.min(cols, 512), 1])
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
      const g = new Float32Array(this.back.getMappedRange(0, n * 16))
      out.fill(0)
      for (let i = 0; i < n && i < out.length; i++) out[i] = this.chars.charCodeAt(g[4 * i]) || 32
      this.back.unmap()
      this.reading = undefined
    })
  }
}

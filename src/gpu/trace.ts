// Path-traced light for River's hardware (trace.wgsl): every model's hierarchy in three buffers, the few models near
// enough to matter as instances over them, and each frame one more sample a texel of the light the rasteriser cannot
// know, kept as a running mean and smoothed. mesh.ts draws with it; raster.ts lays the ground's share under the field.
import code from './trace.wgsl?raw'
import type { Solids } from './mesh'

// Every model's nodes (64 bytes each), triangles (48) and materials (8), end to end in three buffers (bvh.worker.ts
// makes them): a model is where its own begin. One too many for a shader to be given is drawn untraced.
export type Traced = { node: number; tri: number }
const store = { v: 0, bufs: [] as GPUBuffer[], used: [0, 0, 0] }
export function keep(d: GPUDevice, nodes: ArrayBuffer, tris: ArrayBuffer, mats: ArrayBuffer): Traced | undefined {
  const all = [nodes, tris, mats], at = { node: store.used[0] / 64, tri: store.used[1] / 48 }
  if (all.some((data, i) => store.used[i] + data.byteLength > d.limits.maxStorageBufferBindingSize)) return
  all.forEach((data, i) => {
    const old = store.bufs[i], used = store.used[i], need = used + data.byteLength
    let b = old
    if (!old || need > old.size) {
      // outgrown: twice the room, what was there copied across on the GPU
      b = store.bufs[i] = d.createBuffer({ size: Math.max(need, 2 * (old?.size ?? 1 << 22)), usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC })
      if (old && used) {
        const enc = d.createCommandEncoder()
        enc.copyBufferToBuffer(old, 0, b, 0, used)
        d.queue.submit([enc.finish()])
        d.queue.onSubmittedWorkDone().then(() => old.destroy())
      }
      store.v++
    }
    d.queue.writeBuffer(b, used, data)
    store.used[i] = need
  })
  return at
}

const MAX = 16 // instances traced
const INST = 48 // floats an instance
const DEPTH = 24 // samples a texel's mean remembers (trace.wgsl), one every fourth frame
const ANGLE = 0.03 // an instance counts once its radius is this many radians across, from the eye,
const REACH = 2 // and if it is no more than this many times as far as the nearest that does
const MOVE = 0.15 // a thing rests while no part of it crosses more than this of the screen's half-height a second: half a texel a frame
const TURN = [0, 3, 1, 2] // which texel of each four takes its sample, frame by frame
const SUN = 0.02 // the sun's disc, its radius in radians: four of ours across, as through a little haze, so shadows soften

export class Trace {
  lit?: GPUTextureView // the light: what arrives (rgb), how much of the sun's disc is seen (a)
  geo?: GPUTextureView // what each texel is the light of (trace.wgsl)
  shade?: GPUTextureView // the ground's light against its light in the open
  w = 1
  h = 1
  fade = 0 // how much of the ground's share the composite takes
  fades = new Float32Array(256) // and of each item's light the mesh pass: it comes in over a third of a second, and goes in an eighth
  gen = 0 // changes with the textures
  flip = 0 // which of its two histories is this frame's
  private ready = false
  private pipes: GPUComputePipeline[] = []
  private lt!: GPUBindGroupLayout
  private ld!: GPUBindGroupLayout
  private u: GPUBuffer
  private uf = new Float32Array(64)
  private last = new Float32Array(64)
  private inst: GPUBuffer
  private ib = new Float32Array(MAX * INST)
  private lastI = new Float32Array(MAX * INST)
  private dn: GPUBuffer[]
  private dnf = new Float32Array(4)
  private g0!: GPUBindGroup
  private tex: GPUTexture[] = [] // acc × 2, geo × 2, two to smooth through, lit, shade
  private views: GPUTextureView[] = []
  private groups: GPUBindGroup[][] = []
  private made = { v: -1, field: undefined as GPUTextureView | undefined }
  private n = 0 // frames
  private ran = false // there is a history
  private still = 0 // frames nothing has changed
  private age = 0 // frames since the history began
  private turn = 0 // and frames traced
  private calm = new Uint8Array(256) // frames each item has rested
  private cam0 = new Float32Array(16) // last frame's camera
  private at = [0, 0]
  private then = 0 // when it was last asked, ms
  private was = new Float32Array(256 * 12) // each item's place a frame ago, and what it was
  private wasModel: unknown[] = []
  private held = new Float32Array(256 * 12) // and when last a frame was traced
  private heldModel: unknown[] = []
  private pick = new Int32Array(MAX) // the items traced, and how large each is from the eye
  private size = new Float32Array(MAX)

  constructor(readonly device: GPUDevice) {
    const d = device, mk = (size: number, usage: number) => d.createBuffer({ size, usage: usage | GPUBufferUsage.COPY_DST })
    this.u = mk(256, GPUBufferUsage.UNIFORM)
    this.inst = mk(this.ib.byteLength, GPUBufferUsage.STORAGE)
    this.dn = [1, 2, 4, 8, 0].map((step) => {
      const b = mk(16, GPUBufferUsage.UNIFORM)
      d.queue.writeBuffer(b, 0, new Float32Array([step, 0, 0, 0]))
      return b
    })
  }

  async compile() {
    const d = this.device, module = d.createShaderModule({ code }), C = GPUShaderStage.COMPUTE
    const l0 = d.createBindGroupLayout({ entries: [{ binding: 0, visibility: C, buffer: {} }] })
    const ro = (binding: number): GPUBindGroupLayoutEntry => ({ binding, visibility: C, buffer: { type: 'read-only-storage' } })
    const tx = (binding: number, sampleType: GPUTextureSampleType = 'float'): GPUBindGroupLayoutEntry => ({ binding, visibility: C, texture: { sampleType } })
    const out = (binding: number, format: GPUTextureFormat): GPUBindGroupLayoutEntry => ({ binding, visibility: C, storageTexture: { format } })
    this.lt = d.createBindGroupLayout({ entries: [ro(0), ro(1), ro(2), ro(3), tx(4), tx(5), tx(6, 'unfilterable-float'), out(7, 'rgba16float'), out(8, 'rgba32float')] })
    this.ld = d.createBindGroupLayout({ entries: [{ binding: 0, visibility: C, buffer: {} }, tx(1), tx(2, 'unfilterable-float'), out(3, 'rgba16float')] })
    this.g0 = d.createBindGroup({ layout: l0, entries: [{ binding: 0, resource: { buffer: this.u } }] })
    const pipe = (entryPoint: string, l: GPUBindGroupLayout) => d.createComputePipelineAsync({ layout: d.createPipelineLayout({ bindGroupLayouts: [l0, l] }), compute: { module, entryPoint } })
    this.pipes = await Promise.all([pipe('trace', this.lt), pipe('smoothen', this.ld), pipe('shade', this.ld)])
    this.ready = true
  }

  // One more sample of this frame's light, if anything stands near enough to be worth it; whether there is light to use.
  // `field` is what the field drew this frame (the ground's colour), g the ground's sphere; (w, h) the mesh pass's size.
  render(enc: GPUCommandEncoder, s: Solids, w: number, h: number, field: GPUTextureView, g?: ArrayLike<number>) {
    const n = this.ready && store.bufs.length === 3 ? this.choose(s) : 0
    if (!n) return (this.fade = 0), (this.ran = false)
    const d = this.device, div = Math.max(2, Math.min(4, Math.round(w / 720))), W = Math.ceil(w / div), H = Math.ceil(h / div)
    if (this.tex[0]?.width !== W || this.tex[0].height !== H) this.size_(W, H)
    if (this.made.v !== store.v || this.made.field !== field) this.group(field)

    const u = this.uf, c = s.cam, sk = s.sky
    for (let i = 0; i < 3; i++) {
      u[i] = c[4 + i], u[4 + i] = c[8 + i], u[8 + i] = c[12 + i]
      u[24 + i] = s.sun[i], u[28 + i] = s.sunc[i], u[32 + i] = sk[i], u[36 + i] = sk[3 + i], u[40 + i] = sk[6 + i], u[44 + i] = s.up[i]
    }
    u[3] = c[3], u[7] = w / h, u[11] = this.n = (this.n + 1) % 65536
    u[27] = s.sun[3], u[31] = s.sunc[3], u[35] = SUN
    for (let i = 0; i < 4; i++) u[48 + i] = g ? g[i] : 0
    if (!this.ran) u.copyWithin(12, 0, 12), u.copyWithin(52, 48, 52), (this.still = this.age = 0)
    u[23] = this.ran ? 0 : 1
    u[56] = W, u[57] = H, u[58] = n, u[59] = TURN[this.turn & 3]

    // Nothing moved since the last frame, and every texel's mean is as long as it gets: the light is done.
    let same = this.ran
    for (let i = 0; same && i < 64; i++) same = i === 11 || (i >= 12 && i < 24) || i === 59 || u[i] === this.last[i]
    for (let i = 0; same && i < n * INST; i++) same = this.ib[i] === this.lastI[i]
    this.last.set(u), this.lastI.set(this.ib)
    this.still = same ? this.still + 1 : 0
    // and once every texel has its history, a sample every other frame keeps it: the sun is slow
    const done = this.still > 4 * DEPTH + 8 || (++this.age > 4 * DEPTH && (this.n & 1) === 1)
    if (done && this.fade === this.dnf[1]) return (this.ran = true)
    this.dnf[1] = this.fade
    d.queue.writeBuffer(this.dn[4], 0, this.dnf)
    const p = enc.beginComputePass(), X = Math.ceil(W / 8), Y = Math.ceil(H / 8)
    p.setBindGroup(0, this.g0)
    if (!done) {
      this.turn++, (this.flip ^= 1)
      d.queue.writeBuffer(this.u, 0, u)
      d.queue.writeBuffer(this.inst, 0, this.ib, 0, n * INST)
      // this camera, this ground and these places are the next traced frame's "then"
      u.copyWithin(12, 0, 12), u.copyWithin(52, 48, 52)
      for (let i = 0; i < s.items.length && i < 256; i++) {
        const m = s.items[i].m
        for (let j = 0; j < 12; j++) this.held[i * 12 + j] = m[j]
        this.heldModel[i] = s.items[i].model
      }
      const G = this.groups[this.flip]
      p.setPipeline(this.pipes[0]), p.setBindGroup(1, G[0]), p.dispatchWorkgroups(X, Y)
      p.setPipeline(this.pipes[1])
      for (let i = 1; i < 5; i++) p.setBindGroup(1, G[i]), p.dispatchWorkgroups(X, Y)
      this.geo = this.views[2 + this.flip]
    }
    p.setPipeline(this.pipes[2]), p.setBindGroup(1, this.groups[this.flip][5]), p.dispatchWorkgroups(X, Y)
    p.end()
    return (this.ran = true)
  }

  // The instances worth tracing, each with its inverse, where it was a frame ago, and its box: the things that are
  // large from the eye, near, and at rest: no part of one has crossed more than a little of the screen a second for a
  // few frames (the world's slow drift round a place is rest; a flight is not, nor a satellite going by). Once a thing
  // moves, its traced light fades and the rasteriser's own stands. Returns how many.
  private choose(s: Solids) {
    const items = s.items, pick = this.pick, size = this.size, was = this.was, calm = this.calm, fades = this.fades
    const now = performance.now(), dt = Math.min(0.1, Math.max(0.004, (now - this.then) / 1000))
    let n = 0, near = Infinity
    if (now - this.then > 250) this.stop() // it has not been asked for a while: nothing it holds is this view's
    this.then = now, this.fade = 0
    for (let pass = 0; pass < 2; pass++)
      for (let i = 0; i < items.length && i < 256; i++) {
        const it = items[i], M = it.model, m = it.m
        const cx = (M.lo[0] + M.hi[0]) / 2, cy = (M.lo[1] + M.hi[1]) / 2, cz = (M.lo[2] + M.hi[2]) / 2
        const x = m[0] * cx + m[1] * cy + m[2] * cz + m[3], y = m[4] * cx + m[5] * cy + m[6] * cz + m[7], z = m[8] * cx + m[9] * cy + m[10] * cz + m[11]
        const r = 0.5 * Math.hypot(M.hi[0] - M.lo[0], M.hi[1] - M.lo[1], M.hi[2] - M.lo[2]) * Math.hypot(m[0], m[4], m[8])
        const far = Math.max(Math.hypot(x, y, z), r), a = r / far, big = !!M.traced && a >= ANGLE
        if (!pass) {
          if (big) near = Math.min(near, far)
          continue
        }
        let move = Infinity
        if (big && far <= REACH * near + r && this.wasModel[i] === M) {
          // how far its box's two far corners and its middle moved on the screen since the last frame
          move = 0
          for (let v = 0; v < 3; v++) {
            const px = v === 1 ? M.hi[0] : v ? cx : M.lo[0], py = v === 1 ? M.hi[1] : v ? cy : M.lo[1], pz = v === 1 ? M.hi[2] : v ? cz : M.lo[2]
            this.see(m, 0, px, py, pz, s.cam)
            const sx = this.at[0], sy = this.at[1]
            this.see(was, i * 12, px, py, pz, this.cam0)
            move = Math.max(move, Math.hypot(this.at[0] - sx, this.at[1] - sy) / dt)
          }
        }
        calm[i] = move < MOVE ? Math.min(calm[i] + 1, 255) : 0
        fades[i] = Math.min(1, Math.max(0, fades[i] + (calm[i] > 3 ? 0.05 : -0.125)))
        if (calm[i] <= 3 && fades[i] <= 0) continue
        this.fade = Math.max(this.fade, fades[i])
        // kept in order of size, the smallest dropped when there are too many
        let k = Math.min(n, MAX - 1)
        if (n === MAX && a <= size[k]) continue
        for (; k > 0 && size[k - 1] < a; k--) (size[k] = size[k - 1]), (pick[k] = pick[k - 1])
        size[k] = a, pick[k] = i
        if (n < MAX) n++
      }
    const b = this.ib, roi = this.uf
    let rx = 0, ry = 0, rz = 0, rr = 0
    for (let q = 0; q < n; q++) {
      const i = pick[q], it = items[i], M = it.model, m = it.m, o = q * INST, T = M.traced!
      const known = this.heldModel[i] === M
      for (let j = 0; j < 12; j++) (b[o + j] = m[j]), (b[o + 24 + j] = known ? this.held[i * 12 + j] : m[j])
      // the inverse of a rotation, a scale and a shift
      const a = m[0], bb = m[1], c = m[2], d = m[4], e = m[5], f = m[6], g = m[8], h = m[9], k = m[10]
      const A = e * k - f * h, B = c * h - bb * k, C = bb * f - c * e, D = f * g - d * k, E = a * k - c * g, F = c * d - a * f, G = d * h - e * g, H = bb * g - a * h, K = a * e - bb * d
      const det = 1 / (a * A + bb * D + c * G)
      b[o + 12] = A * det, b[o + 13] = B * det, b[o + 14] = C * det, b[o + 15] = -(A * m[3] + B * m[7] + C * m[11]) * det
      b[o + 16] = D * det, b[o + 17] = E * det, b[o + 18] = F * det, b[o + 19] = -(D * m[3] + E * m[7] + F * m[11]) * det
      b[o + 20] = G * det, b[o + 21] = H * det, b[o + 22] = K * det, b[o + 23] = -(G * m[3] + H * m[7] + K * m[11]) * det
      for (let j = 0; j < 3; j++) {
        // its box: the model's, turned
        const lo = M.lo, hi = M.hi, r = j * 4
        let mn = m[r + 3], mx = m[r + 3]
        for (let ax = 0; ax < 3; ax++) {
          const p = m[r + ax] * lo[ax], q2 = m[r + ax] * hi[ax]
          mn += Math.min(p, q2), mx += Math.max(p, q2)
        }
        b[o + 36 + j] = mn, b[o + 40 + j] = mx
      }
      b[o + 39] = T.node, b[o + 43] = T.tri, b[o + 44] = it.k ?? 1, b[o + 45] = it.glow ?? 0, b[o + 46] = i + 1
      rx += (b[o + 36] + b[o + 40]) / 2 / n, ry += (b[o + 37] + b[o + 41]) / 2 / n, rz += (b[o + 38] + b[o + 42]) / 2 / n
    }
    for (let q = 0; q < n; q++) {
      const o = q * INST
      rr = Math.max(rr, Math.hypot(b[o + 40] - rx, b[o + 41] - ry, b[o + 42] - rz), Math.hypot(b[o + 36] - rx, b[o + 37] - ry, b[o + 38] - rz))
    }
    roi[60] = rx, roi[61] = ry, roi[62] = rz, roi[63] = 4 * rr
    for (let i = 0; i < 256; i++) {
      if (i >= items.length) {
        calm[i] = fades[i] = 0, this.wasModel[i] = undefined
        continue
      }
      const m = items[i].m
      for (let j = 0; j < 12; j++) was[i * 12 + j] = m[j]
      this.wasModel[i] = items[i].model
    }
    this.cam0.set(s.cam)
    return n
  }

  // Not this frame: what was gathered is no use to the next.
  stop() {
    this.calm.fill(0), this.fades.fill(0)
    return (this.fade = 0), (this.ran = false)
  }

  // Where camera c sees model point (x, y, z) placed by the 12 floats of m from o: into `at`, the screen's half-height 1.
  private see(m: ArrayLike<number>, o: number, x: number, y: number, z: number, c: ArrayLike<number>) {
    const X = m[o] * x + m[o + 1] * y + m[o + 2] * z + m[o + 3], Y = m[o + 4] * x + m[o + 5] * y + m[o + 6] * z + m[o + 7], Z = m[o + 8] * x + m[o + 9] * y + m[o + 10] * z + m[o + 11]
    const d = Math.max(X * c[12] + Y * c[13] + Z * c[14], 0.05 * Math.hypot(X, Y, Z)) // beside or behind the eye, as if at the screen's far edge
    this.at[0] = ((X * c[4] + Y * c[5] + Z * c[6]) * c[3]) / d, this.at[1] = ((X * c[8] + Y * c[9] + Z * c[10]) * c[3]) / d
  }

  private size_(W: number, H: number) {
    const d = this.device
    for (const t of this.tex) t.destroy()
    const use = GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING
    this.tex = ['rgba16float', 'rgba16float', 'rgba32float', 'rgba32float', 'rgba16float', 'rgba16float', 'rgba16float', 'rgba16float'].map((format) => d.createTexture({ size: [W, H], format: format as GPUTextureFormat, usage: use }))
    this.views = this.tex.map((t) => t.createView())
    this.lit = this.views[6], this.shade = this.views[7], this.w = W, this.h = H
    this.made.v = -1, this.ran = false, this.gen++
  }

  // Per flip: the trace into acc and geo [flip] from the other pair; four smoothing passes; the ground's share.
  private group(field: GPUTextureView) {
    const d = this.device, v = this.views
    this.made.v = store.v, this.made.field = field
    const bind = (layout: GPUBindGroupLayout, r: GPUBindingResource[]) => d.createBindGroup({ layout, entries: r.map((resource, binding) => ({ binding, resource })) })
    this.groups = [0, 1].map((f) => [
      bind(this.lt, [...store.bufs.map((buffer) => ({ buffer })), { buffer: this.inst }, field, v[1 - f], v[3 - f], v[f], v[2 + f]]),
      bind(this.ld, [{ buffer: this.dn[0] }, v[f], v[2 + f], v[4]]),
      bind(this.ld, [{ buffer: this.dn[1] }, v[4], v[2 + f], v[5]]),
      bind(this.ld, [{ buffer: this.dn[2] }, v[5], v[2 + f], v[4]]),
      bind(this.ld, [{ buffer: this.dn[3] }, v[4], v[2 + f], v[6]]),
      bind(this.ld, [{ buffer: this.dn[4] }, v[6], v[2 + f], v[7]]),
    ])
  }
}

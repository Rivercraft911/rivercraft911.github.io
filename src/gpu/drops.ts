// The droplets' engine: a great many drops (10⁵ to 10⁶, by quality tier), each placed by a compute pass as
// a pure function of its number and the time (drops.wgsl), and splatted additively into the phosphor's
// accumulation pass in the beam's own units, so they persist, halate and tone-map with everything else.
import code from './drops.wgsl?raw'
import { ROWS } from './fields'

export const LANES = 256 // the spectrum's lanes round half the rim, as the droplets carry it

export type Drops = {
  k: number // brightness; 0: its rows land, nothing is drawn
  n?: number // the share of this tier's droplets in play, (0, 1]
  p: Float32Array // the camera and the flow's parameters, 112 floats (drops.wgsl)
  rows?: { data: Uint8Array; at: number; n: number } // new rows of the spectrum they carry, LANES bytes each, into ring row `at`
}

const COUNT = [1 << 20, 1 << 19, 1 << 18, 1 << 17] // by tier
const HEAD = 8, SPLAT = 32 // the uniforms' head, floats; a splat, bytes

type State = {
  u: GPUBuffer
  data: GPUTexture
  advect?: GPUComputePipeline
  draw?: GPURenderPipeline
  groups: GPUBindGroup[] // the compute's, the draw's uniforms, the draw's splats
}
const uf = new Float32Array(HEAD + 112 + 16) // the head, the parameters, last frame's camera
let S: State | undefined, last = NaN // the flow's clock a frame ago

function init(d: GPUDevice, format: GPUTextureFormat) {
  const u = d.createBuffer({ size: uf.byteLength, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST })
  const data = d.createTexture({ size: [LANES, ROWS], format: 'r8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST })
  const s: State = (S = { u, data, groups: [] })
  const module = d.createShaderModule({ code })
  const ADD: GPUBlendComponent = { srcFactor: 'one', dstFactor: 'one' }
  // compiled while the valley plays, long before the falls need them
  Promise.all([
    d.createComputePipelineAsync({ layout: 'auto', compute: { module, entryPoint: 'advect' } }),
    d.createRenderPipelineAsync({
      layout: 'auto',
      vertex: { module, entryPoint: 'vs' },
      primitive: { topology: 'triangle-strip' },
      fragment: { module, entryPoint: 'fs', targets: [{ format, blend: { color: ADD, alpha: ADD } }] },
    }),
  ]).then(([advect, draw]) => {
    const splats = d.createBuffer({ size: COUNT[0] * SPLAT, usage: GPUBufferUsage.STORAGE })
    const smp = d.createSampler({ magFilter: 'linear', minFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'repeat' })
    const group = (layout: GPUBindGroupLayout, e: GPUBindingResource[], at = 0) =>
      d.createBindGroup({ layout, entries: e.map((resource, i) => ({ binding: at + i, resource })) })
    s.groups = [
      group(advect.getBindGroupLayout(0), [{ buffer: u }, smp, data.createView(), { buffer: splats }]),
      group(draw.getBindGroupLayout(0), [{ buffer: u }]),
      group(draw.getBindGroupLayout(1), [{ buffer: splats }]),
    ]
    s.advect = advect, s.draw = draw
  })
  return s
}

// Inside the phosphor's pass, after the raster and under the beam: this frame's droplets land. The compute
// that places them goes ahead in an encoder of its own, submitted before the phosphor's.
export function splat(d: GPUDevice, pass: GPURenderPassEncoder, f: Drops | undefined, w: number, h: number, aspect: number, gain: number, tier = 0, format: GPUTextureFormat = 'rgba16float') {
  const s = S ?? init(d, format)
  if (!f) return
  if (f.rows) {
    const { data, at, n } = f.rows, a = at % ROWS, m = Math.min(n, ROWS - a)
    d.queue.writeTexture({ texture: s.data, origin: [0, a] }, data, { bytesPerRow: LANES }, [LANES, m])
    if (n > m) d.queue.writeTexture({ texture: s.data }, data, { offset: m * LANES, bytesPerRow: LANES }, [LANES, n - m])
  }
  if (!s.advect || !s.draw || !(f.k > 0)) return
  const n = Math.max(1, Math.round(COUNT[Math.min(tier, COUNT.length - 1)] * (f.n ?? 1)))
  const T = f.p[20], jump = !(Math.abs(T - last) < 0.2) // a cut: no stroke from where it was
  uf.copyWithin(HEAD + 112, HEAD, HEAD + 16)
  uf[0] = w, uf[1] = h, uf[2] = aspect, uf[3] = gain, uf[4] = n, uf[5] = jump ? 0 : T - last
  uf.set(f.p.subarray(0, 112), HEAD)
  if (jump) uf.copyWithin(HEAD + 112, HEAD, HEAD + 16)
  last = T
  uf[HEAD + 23] = f.k
  d.queue.writeBuffer(s.u, 0, uf)
  const enc = d.createCommandEncoder(), c = enc.beginComputePass()
  c.setPipeline(s.advect)
  c.setBindGroup(0, s.groups[0])
  c.dispatchWorkgroups(Math.ceil(n / 256))
  c.end()
  d.queue.submit([enc.finish()])
  pass.setPipeline(s.draw)
  pass.setBindGroup(0, s.groups[1])
  pass.setBindGroup(1, s.groups[2])
  pass.draw(4, n)
}

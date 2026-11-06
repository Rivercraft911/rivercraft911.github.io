// The beam: one x/y/z signal per frame, time-shared between channels like a scope in chop mode.
// A segment between samples i and i+1 is drawn with the intensity and color of sample i+1.
import { STRIDE, type Path } from './path'

export type Sample = { x: number; y: number; z: number; r: number; g: number; b: number }
// t is the scene time of the sample, u its position in the channel's slice of the frame.
export type Fn = (t: number, s: Sample, u: number) => void
// w is the channel's share of beam time; off shifts global time into the owning scene's time.
export type Channel = { w: number; gain?: number; off?: number } & ({ fn: Fn } | { path: Path })

export const FLOATS = 8 // x, y, z, _, r, g, b, _
export const GREEN = [0.35, 1, 0.55] as const
const REF = 0.001 // path brightness reference: one sample per REF of arc at gain 1, per 1/60 s
const RATE_REF = 1.2e6 // fn brightness reference: z = 1 at this many samples per second

// Brightness is energy per second. A faster beam draws more, a faster display refreshes more often;
// neither makes the trace brighter.
export class Beam {
  rate = 1_200_000
  n = 0
  readonly data: Float32Array
  private s: Sample = { x: 0, y: 0, z: 1, r: 0, g: 0, b: 0 }

  constructor(readonly max = 1 << 18) {
    this.data = new Float32Array(max * FLOATS)
  }

  frame(ch: Channel[], t0: number, dt: number) {
    const N = Math.min(this.max, Math.round(this.rate * dt))
    const W = Math.max(1, ch.reduce((w, c) => w + c.w, 0))
    this.n = 0
    for (const c of ch) {
      const n = Math.round((N * c.w) / W)
      if (n < 2) continue
      const a = this.n
      if ('fn' in c) this.fn(c.fn, n, t0 + (c.off ?? 0), dt, ((c.gain ?? 1) * RATE_REF * dt) / N)
      else this.trace(c.path, n, (c.gain ?? 1) * dt * 60)
      if (this.n > a) this.data[a * FLOATS + 2] = 0 // blank the hop in from the last channel
    }
  }

  private put(x: number, y: number, z: number, r: number, g: number, b: number) {
    if (this.n >= this.max) return
    const d = this.data, o = this.n++ * FLOATS
    d[o] = x, d[o + 1] = y, d[o + 2] = z, d[o + 4] = r, d[o + 5] = g, d[o + 6] = b
  }

  private fn(f: Fn, n: number, t0: number, dt: number, gain: number) {
    const s = this.s
    for (let k = 0; k < n; k++) {
      const u = (k + 0.5) / n
      s.z = 1, s.r = GREEN[0], s.g = GREEN[1], s.b = GREEN[2]
      f(t0 + u * dt, s, u)
      this.put(s.x, s.y, s.z * gain, s.r, s.g, s.b)
    }
  }

  // Traces the whole path once, a sample every len/n of arc, always landing on its vertices.
  private trace(p: Path, n: number, gain: number) {
    const v = p.v
    if (!v.length || p.len <= 0) return
    const step = p.len / n, zk = (gain * step) / REF
    let px = v[0], py = v[1]
    for (let i = 0; i < v.length; i += STRIDE) {
      const x = v[i], y = v[i + 1], z = v[i + 2] * zk, r = v[i + 3], g = v[i + 4], b = v[i + 5]
      if (!v[i + 7]) this.put(x, y, 0, r, g, b)
      else {
        const m = Math.ceil(Math.hypot(x - px, y - py) / step)
        for (let j = 1; j <= m; j++) this.put(px + ((x - px) * j) / m, py + ((y - py) * j) / m, z, r, g, b)
      }
      for (let j = Math.round(v[i + 6] / step); j > 0; j--) this.put(x, y, z, r, g, b)
      px = x, py = y
    }
  }
}

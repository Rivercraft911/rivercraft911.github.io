// Plucks: a few FM voices (Chowning, 1973), each a cosine bending its own phase, y = cos(θ + I cos θ), so its
// spectrum is the harmonics of one pitch, as many as the index I reaches. I falls fast and the level slowly: each
// note starts bright and woody and rings out pure, as a struck string does. A note may fall as it rings, at
// the choir's rate. They go out through a ping-pong echo whose repeats darken and cross the head. Notes are tuned
// at the speakers' own sample rate (heard.sr); sr only sizes the echo.
import { heard } from '../audio/audio'
const TABLE = 4096
const COS = Float64Array.from({ length: TABLE + 1 }, (_, i) => Math.cos((2 * Math.PI * i) / TABLE))
const cos = (p: number) => {
  const u = (p - Math.floor(p)) * TABLE, k = u | 0
  return COS[k] + (COS[k + 1] - COS[k]) * (u - k)
}

const N = 8
export class Plucks {
  private ph = new Float64Array(N)
  private inc = new Float64Array(N)
  private fall = new Float64Array(N) // per-sample factor on inc
  private amp = new Float64Array(N)
  private ka = new Float64Array(N)
  private idx = new Float64Array(N)
  private ki = new Float64Array(N)
  private att = new Float64Array(N)
  private gl = new Float64Array(N)
  private gr = new Float64Array(N)
  private next = 0
  private dl: Float32Array
  private dr: Float32Array
  private w = 0
  private lpl = 0
  private lpr = 0
  echo = 0.4 // feedback
  wet = 0.6
  constructor(sr = 48000, gap = 0.27) {
    this.dl = new Float32Array(Math.ceil(gap * sr) + 1)
    this.dr = new Float32Array(this.dl.length)
  }

  // Strikes a note: f Hz, level a, pan ∈ [−1, 1], ringing for ring seconds (to −60 dB), bright the index it
  // starts at, falling at fall octaves a second.
  strike(f: number, a: number, pan = 0, ring = 1.2, bright = 2.5, fall = 0) {
    if (!(f > 20 && f < 0.2 * heard.sr && a > 0)) return
    const i = (this.next = (this.next + 1) % N), sr = heard.sr, p = (Math.PI / 4) * (1 + pan)
    this.inc[i] = f / sr
    this.fall[i] = 2 ** (-fall / sr)
    this.amp[i] = a
    this.ka[i] = Math.exp(-6.9 / (ring * sr))
    this.idx[i] = bright / (2 * Math.PI)
    this.ki[i] = Math.exp(-6.9 / (0.12 * ring * sr))
    this.att[i] = 0
    this.gl[i] = Math.cos(p)
    this.gr[i] = Math.sin(p)
  }

  // The same, summed to one channel, for a voice that is placed in space.
  private o = { l: 0, r: 0 }
  mono() {
    const o = this.o
    o.l = o.r = 0
    this.sample(o)
    return o.l + o.r
  }

  sample(o: { l: number; r: number }) {
    let l = 0, r = 0
    for (let i = 0; i < N; i++) {
      const a = this.amp[i]
      if (a < 1e-5) continue
      const p = (this.ph[i] += this.inc[i] *= this.fall[i])
      const at = (this.att[i] = Math.min(1, this.att[i] + 1 / 96)) // 2 ms in, so it never clicks
      const y = at * a * cos(p + (this.idx[i] *= this.ki[i]) * cos(p))
      this.amp[i] = a * this.ka[i]
      if (p > 1e6) this.ph[i] = p - Math.floor(p)
      l += this.gl[i] * y
      r += this.gr[i] * y
    }
    // the echo: left feeds right and right left, each repeat through a one-pole lowpass near 2.5 kHz
    const { dl, dr } = this, n = dl.length, w = this.w, el = dl[w], er = dr[w]
    this.lpl += 0.28 * (er - this.lpl)
    this.lpr += 0.28 * (el - this.lpr)
    dl[w] = 0.5 * (l + r) + this.echo * this.lpl
    dr[w] = this.echo * this.lpr
    this.w = (w + 1) % n
    o.l += l + this.wet * el
    o.r += r + this.wet * er
  }
}

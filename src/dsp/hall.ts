// A hall: eight delay lines in a loop through a Hadamard matrix, a feedback delay network (Jot, 1991).
// Each pass a line loses what it must to fall 60 dB in rt seconds, and its highs more, through a one-pole
// lowpass at tone Hz, so the tail darkens as it fades. The lengths drift a few samples, slowly, so no mode
// rings metallic under a gliding sine. Before the loop, four allpasses a side smear each sound into a dense
// wash (Schroeder, 1962), so a pluck blooms instead of fluttering. Left and right are two orthogonal mixes of
// the lines: the tail is wide but stands still.
// Shimmer: the tail, an octave up, fed back in. A pitch shifter is a delay whose length shrinks a sample every
// sample, read by two heads half a window apart, each faded in and out as it wraps (sin² windows sum to one).
// Every pass round the loop climbs another octave, quieter and darker, so the hall rises as the choir falls.

const LENS = [1433, 1801, 1973, 2111, 2539, 2861, 3209, 3797] // samples at 48 kHz, mutually prime
const N = LENS.length, BLOCK = 64, DEPTH = 6 // samples of drift
const DRIFT = [0.07, 0.11, 0.13, 0.17, 0.19, 0.23, 0.29, 0.31] // Hz
const DIFF = [[142, 379, 107, 277], [151, 353, 113, 263]] // the allpasses, left then right
const G = 0.62 // their gain
const WIN = 3072 // the shifter's window, samples

export class Hall {
  l = 0
  r = 0
  private len: number[]
  private buf: Float32Array
  private mask: number
  private w = 0
  private x = new Float64Array(N)
  private lp = new Float64Array(N) // the damping in each line
  private g = new Float64Array(N)
  private at = new Float64Array(N) // each line's read offset this block, drift included
  private rt = 0
  private left = 0
  private t = 0
  private hz = 0
  private damp = 0
  private ap: Float32Array[]
  private apw = new Int32Array(8)
  private sh = [new Float32Array(WIN), new Float32Array(WIN)]
  private shw = 0
  private sl = 0 // the shimmer's own lowpasses and highpass, left and right
  private sr2 = 0
  private dl = 0
  private dr = 0
  private hl = 0
  private hr = 0

  constructor(private sr: number) {
    this.len = LENS.map((n) => Math.round((n * sr) / 48000))
    const size = 2 ** Math.ceil(Math.log2(Math.max(...this.len) + 2 * DEPTH + 2))
    this.buf = new Float32Array(size * N)
    this.mask = size - 1
    this.ap = DIFF.flat().map((n) => new Float32Array(Math.round((n * sr) / 48000)))
  }

  clear() {
    this.buf.fill(0), this.lp.fill(0)
    for (const a of this.ap) a.fill(0)
    for (const s of this.sh) s.fill(0)
    this.sl = this.sr2 = this.dl = this.dr = this.hl = this.hr = 0
  }

  private diffuse(x: number, side: number) {
    for (let k = 4 * side; k < 4 * side + 4; k++) {
      const a = this.ap[k], i = this.apw[k], d = a[i], v = x + G * d
      a[i] = v
      this.apw[k] = i + 1 < a.length ? i + 1 : 0
      x = d - G * v
    }
    return x
  }

  // One sample in (left, right), one out in this.l and this.r. shimmer: how much of the octave-up tail goes back in.
  run(inL: number, inR: number, rt: number, tone = 7000, shimmer = 0) {
    const { x, lp, g, at, len, buf, mask } = this, size = mask + 1
    if (this.left-- <= 0) {
      this.left = BLOCK - 1
      this.t += BLOCK / this.sr
      if (rt !== this.rt) for (let i = 0; i < N; i++) g[i] = 10 ** ((-3 * len[i]) / (this.sr * (this.rt = rt)))
      if (tone !== this.hz) this.damp = 1 - Math.exp((-2 * Math.PI * (this.hz = tone)) / this.sr)
      for (let i = 0; i < N; i++) at[i] = len[i] + DEPTH * (1 + Math.sin(2 * Math.PI * DRIFT[i] * this.t + i))
    }
    let a = this.diffuse(inL, 0), b = this.diffuse(inR, 1)
    if (shimmer > 0) {
      // the two heads of each side's shifter, an octave up, darkened (two poles near 3 kHz) and thinned (none below 300 Hz)
      const sh = this.sh, w = this.shw, d = WIN - 1 - (w % WIN) // falls a sample a sample, from a window to nothing
      const d2 = (d + WIN / 2) % WIN, e = Math.sin((Math.PI * d) / WIN), e2 = Math.sin((Math.PI * d2) / WIN)
      const i1 = (w - d + WIN) % WIN, i2 = (w - d2 + WIN) % WIN
      let ul = e * e * sh[0][i1] + e2 * e2 * sh[0][i2], ur = e * e * sh[1][i1] + e2 * e2 * sh[1][i2]
      ;(this.sl += 0.33 * (ul - this.sl)), (this.sr2 += 0.33 * (ur - this.sr2))
      ;(this.dl += 0.33 * (this.sl - this.dl)), (this.dr += 0.33 * (this.sr2 - this.dr))
      ;(this.hl += 0.04 * (this.dl - this.hl)), (this.hr += 0.04 * (this.dr - this.hr))
      ul = this.dl - this.hl
      ur = this.dr - this.hr
      sh[0][w % WIN] = this.l
      sh[1][w % WIN] = this.r
      this.shw = w + 1
      a += shimmer * ur // crossed, so it wanders
      b += shimmer * ul
    }
    for (let i = 0; i < N; i++) {
      const p = this.w - at[i], k = Math.floor(p), f = p - k
      const u = buf[i * size + (k & mask)], v = buf[i * size + ((k + 1) & mask)]
      x[i] = (lp[i] += (u + (v - u) * f - lp[i]) * this.damp) * g[i]
    }
    this.l = (x[0] - x[1] + x[2] - x[3] + x[4] - x[5] + x[6] - x[7]) * 0.35
    this.r = (x[0] + x[1] - x[2] - x[3] + x[4] + x[5] - x[6] - x[7]) * 0.35
    if (!(Math.abs(this.l + this.r) < 1e6)) return void (this.clear(), (this.l = this.r = 0)) // gone non-finite: an empty hall
    // the Hadamard mix, in place (a fast Walsh–Hadamard transform), scaled to stay lossless
    for (let h = 1; h < N; h *= 2)
      for (let i = 0; i < N; i += 2 * h)
        for (let j = i; j < i + h; j++) {
          const u = x[j], v = x[j + h]
          x[j] = u + v
          x[j + h] = u - v
        }
    const w = this.w & mask
    for (let i = 0; i < N; i++) buf[i * size + w] = x[i] / Math.SQRT2 / 2 + (i & 1 ? b : a)
    this.w++
  }
}

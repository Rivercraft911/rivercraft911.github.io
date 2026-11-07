// A hall: eight delay lines in a loop through a Hadamard matrix, a feedback delay network (Jot, 1991).
// Each pass a line loses what it must to fall 60 dB in rt seconds, and its highs more, through a one-pole
// lowpass at tone Hz, so the tail darkens as it fades: a dark hall, or a bright one. The lengths drift a
// few samples, slowly, so no mode rings metallic under a gliding sine. Left and right are two orthogonal
// mixes of the lines: the tail is wide but stands still.

const LENS = [1433, 1801, 1973, 2111, 2539, 2861, 3209, 3797] // samples at 48 kHz, mutually prime
const N = LENS.length, BLOCK = 64, DEPTH = 6 // samples of drift
const DRIFT = [0.07, 0.11, 0.13, 0.17, 0.19, 0.23, 0.29, 0.31] // Hz

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

  constructor(private sr: number) {
    this.len = LENS.map((n) => Math.round((n * sr) / 48000))
    const size = 2 ** Math.ceil(Math.log2(Math.max(...this.len) + 2 * DEPTH + 2))
    this.buf = new Float32Array(size * N)
    this.mask = size - 1
  }

  clear() {
    this.buf.fill(0), this.lp.fill(0)
  }

  // One sample in (left, right), one out in this.l and this.r.
  run(inL: number, inR: number, rt: number, tone = 7000) {
    const { x, lp, g, at, len, buf, mask } = this, size = mask + 1
    if (this.left-- <= 0) {
      this.left = BLOCK - 1
      this.t += BLOCK / this.sr
      if (rt !== this.rt) for (let i = 0; i < N; i++) g[i] = 10 ** ((-3 * len[i]) / (this.sr * (this.rt = rt)))
      if (tone !== this.hz) this.damp = 1 - Math.exp((-2 * Math.PI * (this.hz = tone)) / this.sr)
      for (let i = 0; i < N; i++) at[i] = len[i] + DEPTH * (1 + Math.sin(2 * Math.PI * DRIFT[i] * this.t + i))
    }
    for (let i = 0; i < N; i++) {
      const p = this.w - at[i], k = Math.floor(p), f = p - k
      const a = buf[i * size + (k & mask)], b = buf[i * size + ((k + 1) & mask)]
      x[i] = (lp[i] += (a + (b - a) * f - lp[i]) * this.damp) * g[i]
    }
    this.l = (x[0] - x[1] + x[2] - x[3] + x[4] - x[5] + x[6] - x[7]) * 0.35
    this.r = (x[0] + x[1] - x[2] - x[3] + x[4] + x[5] - x[6] - x[7]) * 0.35
    // the Hadamard mix, in place (a fast Walsh–Hadamard transform), scaled to stay lossless
    for (let h = 1; h < N; h *= 2)
      for (let i = 0; i < N; i += 2 * h)
        for (let j = i; j < i + h; j++) {
          const u = x[j], v = x[j + h]
          x[j] = u + v
          x[j + h] = u - v
        }
    const w = this.w & mask
    for (let i = 0; i < N; i++) buf[i * size + w] = x[i] / Math.SQRT2 / 2 + (i & 1 ? inR : inL)
    this.w++
  }
}

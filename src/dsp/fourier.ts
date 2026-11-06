// A closed path as one periodic signal x(t) + i·y(t), with its brightness z(t) alongside, and the
// band-limited reconstruction keeping harmonics |n| ≤ N. The picture sharpens exactly as the signal's
// bandwidth opens; blanking is just another series, so the jumps between letters fade out as N grows.
import { STRIDE, type Path } from '../beam/path'
import { fft } from './fft'

export class Series {
  readonly x: Float64Array
  readonly y: Float64Array
  readonly z: Float64Array
  private cr: Float64Array // spectrum of x + iy
  private ci: Float64Array
  private zr: Float64Array // spectrum of z
  private zi: Float64Array
  private wr: Float64Array
  private wi: Float64Array

  constructor(readonly m = 4096) {
    const f = () => new Float64Array(m)
    this.x = f(), this.y = f(), this.z = f()
    this.cr = f(), this.ci = f(), this.zr = f(), this.zi = f(), this.wr = f(), this.wi = f()
  }

  // Samples the path at constant beam speed, blanked jumps `jump`× faster, closing back to the start.
  load(p: Path, jump = 4) {
    const v = p.v, n = v.length / STRIDE, m = this.m
    if (n < 2) return this
    let total = 0
    for (let i = 0; i < n; i++) total += cost(v, i, (i + n - 1) % n, jump)
    for (let s = 0, i = 0, acc = 0; s < m; s++) {
      const want = (s / m) * total
      let c = cost(v, i, (i + n - 1) % n, jump)
      while (acc + c < want && i < n - 1) (acc += c), i++, (c = cost(v, i, i - 1, jump))
      const a = ((i + n - 1) % n) * STRIDE, b = i * STRIDE, k = c > 0 ? (want - acc) / c : 1
      this.cr[s] = v[a] + (v[b] - v[a]) * k
      this.ci[s] = v[a + 1] + (v[b + 1] - v[a + 1]) * k
      this.zr[s] = v[b + 7] ? v[b + 2] : 0
      this.zi[s] = 0
    }
    fft(this.cr, this.ci)
    fft(this.zr, this.zi)
    return this
  }

  // |c_n|, the size of harmonic n.
  mag(n: number) {
    const k = (n + this.m) % this.m
    return Math.hypot(this.cr[k], this.ci[k]) / this.m
  }

  // Keeps |n| ≤ N (a fractional N weighs in the next pair) and inverts into x, y, z.
  band(N: number) {
    const m = this.m, f = Math.floor(N), fr = N - f
    const inv = (re: Float64Array, im: Float64Array, a: Float64Array, b?: Float64Array) => {
      const wr = this.wr, wi = this.wi
      for (let k = 0; k < m; k++) {
        const n = Math.abs(k < m / 2 ? k : k - m), w = n <= f ? 1 : n === f + 1 ? fr : 0
        wr[k] = re[k] * w, wi[k] = -im[k] * w // conj, so a forward FFT inverts
      }
      fft(wr, wi)
      for (let k = 0; k < m; k++) (a[k] = wr[k] / m), b && (b[k] = -wi[k] / m)
    }
    inv(this.cr, this.ci, this.x, this.y)
    inv(this.zr, this.zi, this.z)
    return this
  }

  // The reconstructed signal at phase u ∈ [0, 1).
  at(u: number, o: { x: number; y: number; z: number }) {
    const m = this.m, f = (((u % 1) + 1) % 1) * m, i = Math.floor(f), j = (i + 1) % m, k = f - i
    o.x = this.x[i] + (this.x[j] - this.x[i]) * k
    o.y = this.y[i] + (this.y[j] - this.y[i]) * k
    o.z = this.z[i] + (this.z[j] - this.z[i]) * k
  }
}

// Beam time from vertex j to vertex i: arc length, or a fraction of it while blanked.
function cost(v: Float32Array | number[], i: number, j: number, jump: number) {
  const a = i * STRIDE, b = j * STRIDE, d = Math.hypot(v[a] - v[b], v[a + 1] - v[b + 1])
  return v[a + 7] ? d : d / jump
}

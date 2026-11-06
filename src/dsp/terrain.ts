// Land as a signal. Real terrain has a power-law spectrum, P(k) ∝ |k|^−β with β near 2, so here it is
// built the honest way: random phases under that spectrum, inverted by a 2D FFT. Periodic, so it tiles.
import { fft } from './fft'

export class Field {
  readonly v: Float64Array
  constructor(readonly n = 128, readonly beta = 2.1, seed = 7) {
    const re = new Float64Array(n * n), im = new Float64Array(n * n)
    let s = seed
    const rand = () => ((s = (s * 16807) % 2147483647) / 2147483647)
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++) {
        const kx = i < n / 2 ? i : i - n, kz = j < n / 2 ? j : j - n, k2 = kx * kx + kz * kz
        const a = k2 ? k2 ** (-beta / 4) : 0, ph = 2 * Math.PI * rand()
        re[i * n + j] = a * Math.cos(ph), im[i * n + j] = a * Math.sin(ph)
      }
    // inverse 2D FFT by rows then columns (conjugate in, conjugate out)
    const r = new Float64Array(n), c = new Float64Array(n)
    for (let i = 0; i < n * n; i++) im[i] = -im[i]
    for (let pass = 0; pass < 2; pass++)
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          const o = pass ? j * n + i : i * n + j
          r[j] = re[o], c[j] = im[o]
        }
        fft(r, c)
        for (let j = 0; j < n; j++) {
          const o = pass ? j * n + i : i * n + j
          re[o] = r[j], im[o] = c[j]
        }
      }
    let lo = Infinity, hi = -Infinity
    for (let i = 0; i < n * n; i++) (lo = Math.min(lo, re[i])), (hi = Math.max(hi, re[i]))
    this.v = re.map((x) => (2 * (x - lo)) / (hi - lo) - 1)
  }

  // Bilinear sample at (u, w) in grid cells, wrapping.
  at(u: number, w: number) {
    const n = this.n, i = Math.floor(u), j = Math.floor(w), fu = u - i, fw = w - j
    const a = ((i % n) + n) % n, b = (a + 1) % n, c = ((j % n) + n) % n, d = (c + 1) % n, v = this.v
    return (v[a * n + c] * (1 - fw) + v[a * n + d] * fw) * (1 - fu) + (v[b * n + c] * (1 - fw) + v[b * n + d] * fw) * fu
  }
}

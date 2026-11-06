// In-place iterative radix-2 FFT. n must be a power of two.
export function fft(re: Float64Array, im: Float64Array) {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) [re[i], re[j], im[i], im[j]] = [re[j], re[i], im[j], im[i]]
  }
  for (let len = 2; len <= n; len <<= 1) {
    const h = len >> 1, wr = Math.cos((-2 * Math.PI) / len), wi = Math.sin((-2 * Math.PI) / len)
    for (let i = 0; i < n; i += len) {
      for (let j = 0, cr = 1, ci = 0; j < h; j++) {
        const a = i + j, b = a + h
        const xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr
        re[b] = re[a] - xr, im[b] = im[a] - xi
        re[a] += xr, im[a] += xi
        const c = cr * wr - ci * wi
        ci = cr * wi + ci * wr, cr = c
      }
    }
  }
}

export const hann = (i: number, n: number) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n)

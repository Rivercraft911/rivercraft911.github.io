// An SDR waterfall of the soundtrack: the short-time spectrum of what the speakers are playing, on a
// log-frequency axis from A0 up nine octaves, printed as rows of bytes for the GPU. A row is printed at
// any moment asked for, between two STFT frames a hop apart (Hann, 2048 points).
import { heard } from '../audio/audio'
import { fft, hann } from './fft'

export const OCTAVES = 9, PER = 128, BINS = OCTAVES * PER // the axis: 128 bins an octave
export const F0 = 27.5 // A0: octave boundaries fall on A
const N = 2048, HOP = 1 / 240
const FLOOR = -72, RANGE = 56 // dBFS shown, black to white
const win = Float64Array.from({ length: N }, (_, i) => hann(i, N))
const re = new Float64Array(N), im = new Float64Array(N), pow = new Float64Array(N / 2 + 1)

export class Waterfall {
  readonly last = new Float32Array(BINS) // the newest row, 0..1
  private lo = new Float64Array(BINS) // each log bin's span in FFT bins
  private hi = new Float64Array(BINS)
  private sr = 0
  private j = [NaN, NaN] // which STFT frame each slot holds
  private f = [new Float32Array(BINS), new Float32Array(BINS)]

  // The log-frequency spectrum around timeline time t, 0..1 per bin: silence where nothing was heard.
  private frame(j: number) {
    const s = j & 1, out = this.f[s]
    if (this.j[s] === j) return out
    this.j[s] = j
    const sr = heard.sr, b = heard.buf, mask = b.length - 1
    if (sr !== this.sr) {
      this.sr = sr
      for (let m = 0; m < BINS; m++) (this.lo[m] = (F0 * 2 ** (m / PER) * N) / sr), (this.hi[m] = (F0 * 2 ** ((m + 1) / PER) * N) / sr)
    }
    const c = Math.round(heard.n - (heard.end - j * HOP) * sr) - N / 2 // first sample of the window
    if (c < heard.n - b.length || c + N > heard.n) return out.fill(0)
    for (let i = 0; i < N; i++) (re[i] = b[(c + i) & mask] * win[i]), (im[i] = 0)
    fft(re, im)
    const norm = 16 / (N * N) // a full-scale sine reads 0 dB
    for (let k = 0; k <= N / 2; k++) pow[k] = (re[k] * re[k] + im[k] * im[k]) * norm
    for (let m = 0; m < BINS; m++) {
      const a = this.lo[m], z = this.hi[m]
      let p: number
      if (z - a < 1) {
        // narrower than an FFT bin: read the spectrum between bins
        const x = Math.min((a + z) / 2, N / 2 - 1), k = Math.floor(x)
        p = pow[k] + (pow[k + 1] - pow[k]) * (x - k)
      } else {
        p = 0 // wider: its loudest bin, so a narrow partial is never lost between pixels
        for (let k = Math.ceil(a); k <= Math.min(z, N / 2); k++) p = Math.max(p, pow[k])
      }
      out[m] = Math.min(1, Math.max(0, (10 * Math.log10(p + 1e-20) - FLOOR) / RANGE))
    }
    return out
  }

  // Prints the spectrum at timeline time t as one row of bytes into out at offset o.
  row(t: number, out: Uint8Array, o: number) {
    const x = t / HOP, j = Math.floor(x), k = x - j, a = this.frame(j), b = this.frame(j + 1), l = this.last
    for (let m = 0; m < BINS; m++) (l[m] = a[m] + (b[m] - a[m]) * k), (out[o + m] = l[m] * 255 + 0.5)
  }
}

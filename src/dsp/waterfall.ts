// An SDR waterfall of the soundtrack: the short-time spectrum of what the speakers are playing, on a
// log-frequency axis from A0 up nine octaves, printed as rows of bytes for the GPU. It is reassigned
// (Kodera, Gendrin & de Villedary 1976; Auger & Flandrin 1995): each FFT bin's energy is moved to the
// bin's own instantaneous frequency, ω − Im(X_h′ / X_h), so a partial is a line, not a window's lobe.
// A row is printed at any moment asked for, between two STFT frames a hop apart (Hann, 2048 points).
import { heard } from '../audio/audio'
import { fft, hann } from './fft'

export const OCTAVES = 9, PER = 128, BINS = OCTAVES * PER // the axis: 128 bins an octave
export const F0 = 27.5 // A0: octave boundaries fall on A
const N = 2048, HOP = 1 / 240
const FLOOR = -72, RANGE = 56 // dBFS shown, black to white
const win = Float64Array.from({ length: N }, (_, i) => hann(i, N))
const dwin = Float64Array.from({ length: N }, (_, i) => (Math.PI / N) * Math.sin((2 * Math.PI * i) / N)) // h′, per sample
const re = new Float64Array(N), im = new Float64Array(N), dre = new Float64Array(N), dim = new Float64Array(N)
const acc = new Float64Array(BINS)
const SPREAD = Float64Array.from({ length: 41 }, (_, i) => Math.exp(-0.5 * ((i / 8 - 2.5) / 0.8) ** 2) / (0.8 * Math.sqrt(2 * Math.PI)))

export class Waterfall {
  readonly last = new Float32Array(BINS) // the newest row, 0..1
  private j = [NaN, NaN] // which STFT frame each slot holds
  private f = [new Float32Array(BINS), new Float32Array(BINS)]

  // The log-frequency spectrum around timeline time t, 0..1 per bin: silence where nothing was heard.
  private frame(j: number) {
    const s = j & 1, out = this.f[s]
    if (this.j[s] === j) return out
    this.j[s] = j
    const sr = heard.sr, b = heard.buf, mask = b.length - 1
    const c = Math.round(heard.n - (heard.end - j * HOP) * sr) - N / 2 // first sample of the window
    if (c < heard.n - b.length || c + N > heard.n) return out.fill(0)
    for (let i = 0; i < N; i++) {
      const x = b[(c + i) & mask]
      ;(re[i] = x * win[i]), (dre[i] = x * dwin[i]), (im[i] = dim[i] = 0)
    }
    fft(re, im)
    fft(dre, dim)
    acc.fill(0)
    const norm = 16 / (N * N), k0 = PER * Math.log2(sr / (2 * Math.PI * F0)) // a full-scale sine reads 0 dB
    for (let k = 1; k < N / 2; k++) {
      const p = re[k] * re[k] + im[k] * im[k]
      if (p < 1e-14) continue
      const w = (2 * Math.PI * k) / N - (dim[k] * re[k] - dre[k] * im[k]) / p // reassigned, rad per sample
      if (w <= 0) continue
      // spread over the nearest bins as a Gaussian of σ = 0.8 bin: the estimate's own jitter
      const m = k0 + PER * Math.log2(w) - 0.5, i = Math.round(m)
      for (let j = Math.max(0, i - 2); j <= Math.min(BINS - 1, i + 2); j++) acc[j] += p * norm * SPREAD[Math.round((j - m + 2.5) * 8)]
    }
    for (let m = 0; m < BINS; m++) out[m] = Math.min(1, Math.max(0, (10 * Math.log10(acc[m] + 1e-20) - FLOOR) / RANGE))
    return out
  }

  // Prints the spectrum at timeline time t as one row of bytes into out at offset o.
  row(t: number, out: Uint8Array, o: number) {
    const x = t / HOP, j = Math.floor(x), k = x - j, a = this.frame(j), b = this.frame(j + 1), l = this.last
    for (let m = 0; m < BINS; m++) (l[m] = a[m] + (b[m] - a[m]) * k), (out[o + m] = l[m] * 255 + 0.5)
  }
}

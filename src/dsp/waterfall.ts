// An SDR waterfall of the soundtrack: the short-time spectrum of what the speakers are playing, on a
// log-frequency axis from A0 up nine octaves, printed as rows of 16-bit levels for the GPU. It is reassigned
// (Kodera, Gendrin & de Villedary 1976; Auger & Flandrin 1995): each FFT bin's energy is moved to the
// bin's own instantaneous frequency, ω − Im(X_h′ / X_h), so a partial is a line, not a window's lobe.
// A row is printed at any moment asked for, between two STFT frames a hop apart (Hann, 4096 points).
import { heard } from '../audio/audio'
import { fft, hann } from './fft'

export const OCTAVES = 9, PER = 256, BINS = OCTAVES * PER // the axis: 256 bins an octave, 4.7 cents each
export const F0 = 27.5 // A0: octave boundaries fall on A
export const FLOOR = -72, RANGE = 56 // dBFS shown, black to white
const N = 4096, HOP = 1 / 480 // 11.7 Hz bins part a chord's close tones above the bass; a hop of 2 ms
const win = Float64Array.from({ length: N }, (_, i) => hann(i, N))
const dwin = Float64Array.from({ length: N }, (_, i) => (Math.PI / N) * Math.sin((2 * Math.PI * i) / N)) // h′, per sample
const re = new Float64Array(N), im = new Float64Array(N)
const acc = new Float64Array(BINS)
// Each bin's energy lands as a Gaussian as wide as the estimate is sure: a fraction of the FFT's own bin
// spacing, which on a log axis is wide in the low octaves and narrow in the high, but never under a bin.
// A line is then a parabola in dB, which the shader's cubic reconstructs exactly.
const G = Float64Array.from({ length: 16 * 6 + 1 }, (_, i) => Math.exp(-0.5 * (i / 16 - 3) ** 2) / Math.sqrt(2 * Math.PI))

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
    // Both windows in one transform: x·h real and x·h′ imaginary, parted again by symmetry.
    for (let i = 0; i < N; i++) {
      const x = b[(c + i) & mask]
      ;(re[i] = x * win[i]), (im[i] = x * dwin[i])
    }
    fft(re, im)
    acc.fill(0)
    const norm = 16 / (N * N), k0 = PER * Math.log2(sr / (2 * Math.PI * F0)) // a full-scale sine reads 0 dB
    for (let k = 1; k < N / 2; k++) {
      const ar = re[k], ai = im[k], br = re[N - k], bi = im[N - k]
      const hr = (ar + br) / 2, hi = (ai - bi) / 2, dr = (ai + bi) / 2, di = (br - ar) / 2 // X_h, X_h′
      const p = hr * hr + hi * hi
      if (p < 1e-14) continue
      const w = (2 * Math.PI * k) / N - (di * hr - dr * hi) / p // reassigned, rad per sample
      if (w <= 0) continue
      const m = k0 + PER * Math.log2(w) - 0.5, sig = Math.max(1, (0.25 * PER * 2 * Math.PI) / (N * w * Math.LN2)), e = (p * norm) / sig
      for (let j = Math.max(0, Math.ceil(m - 3 * sig)); j <= Math.min(BINS - 1, m + 3 * sig); j++) acc[j] += e * G[Math.round(((j - m) / sig + 3) * 16)]
    }
    for (let m = 0; m < BINS; m++) out[m] = Math.min(1, Math.max(0, (10 * Math.log10(acc[m] + 1e-20) - FLOOR) / RANGE))
    return out
  }

  // Prints the spectrum at timeline time t as one row into out at offset o: two bytes a bin, high then low.
  // Returns the row's loudest level.
  // A moment the speakers have not played a half window past yet reads as the newest frame there is.
  row(t: number, out: Uint8Array, o: number) {
    const x = Math.min(t, heard.end - N / 2 / heard.sr - HOP) / HOP, j = Math.floor(x), k = x - j, a = this.frame(j), b = this.frame(j + 1), l = this.last
    let hi = 0
    for (let m = 0; m < BINS; m++) {
      const q = Math.round((l[m] = a[m] + (b[m] - a[m]) * k) * 65535)
      ;(out[o + 2 * m] = q >> 8), (out[o + 2 * m + 1] = q & 255), (hi = Math.max(hi, l[m]))
    }
    return hi
  }
}

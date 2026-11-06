// The spectrum of that carrier, then the waterfall: the beam turns raster and paints a spectrogram of
// what the speakers play. Hidden in the tones is a picture, and when it is whole, the waterfall stops.
import { Path } from '../beam/path'
import { text } from '../beam/font'
import { fft, hann } from '../dsp/fft'
import { EDGES, project } from '../dsp/tesseract'
import { header } from './header'
import { RS, sig, signal } from './iq'
import { TAU, clamp, hash, mix, smooth, view, type Scene } from './scene'

const SR = 48_000
const N = 1024
const BIN0 = 8 // first displayed FFT bin: 375 Hz
const COLS = 128 // displayed bins, up to 6.3 kHz
const ROWS = 72 // visible raster lines
const PH = 64 // picture height in rows
const RATE = 24 // rows per second
const T_FALL = 3.4 // the raster takes over
const T_PIC = 4.6 // the picture starts arriving, bottom row first
const R_PIC = Math.round((T_PIC - T_FALL) * RATE)
const T_STOP = T_PIC + PH / RATE + 0.1
const IQ = 13 // the carrier in its locked 16APSK stretch
export const PICTURE = { xw: 0.6, yz: 0.4, zw: 0 }

const rowsAt = (t: number) => (Math.min(t, T_STOP) - T_FALL) * RATE
const freq = (c: number) => (BIN0 + c) * (SR / N)
const lit: Uint16Array[] = [] // tones present in each row, by column

// The picture, rasterized onto the waterfall's own cell grid (bottom row emitted first).
function paint(cw: number, lh: number) {
  const pic = new Uint8Array(COLS * PH), v = new Float64Array(48)
  project(PICTURE.xw, PICTURE.yz, PICTURE.zw, 1, v)
  const s = (0.9 * PH * lh) / 2 / Math.max(...EDGES.flatMap(([a]) => Math.abs(v[3 * a + 1])))
  for (const [a, b] of EDGES)
    for (let k = 0; k <= 64; k++) {
      const x = mix(v[3 * a], v[3 * b], k / 64) * s, y = mix(v[3 * a + 1], v[3 * b + 1], k / 64) * s
      const c = Math.round(COLS / 2 + x / cw), r = Math.round(PH / 2 - y / lh)
      if (c >= 0 && c < COLS && r >= 0 && r < PH) pic[r * COLS + c] = 1
    }
  for (let r = 0; r < R_PIC + PH + 2; r++) {
    const row: number[] = [100, Math.round(26 + 7 * Math.sin(r * 0.11))] // a beacon and a drifting carrier
    const pr = PH - 1 - (r - R_PIC)
    if (pr >= 0 && pr < PH) for (let c = 0; c < COLS; c++) if (pic[pr * COLS + c]) row.push(c)
    lit[r] = Uint16Array.from(row)
  }
}

const tones = (r: number, t: number) => {
  const row = lit[clamp(r, 0, lit.length - 1)]
  let s = 0
  for (let i = 0; i < row.length; i++) s += (i < 2 ? 0.05 : 0.06) * Math.sin(TAU * freq(row[i]) * t + 3 * hash(row[i]))
  return s
}

// What the speakers play: each row's tones, crossfading into the next row, over a faint noise floor.
function synth(t: number) {
  const x = Math.max(0, rowsAt(t)), r = Math.floor(x), w = smooth(0.85, 1, x - r)
  return (1 - w) * tones(r, t) + w * tones(r + 1, t) + 0.012 * hash(t * SR)
}

// Row magnitudes from a Hann-windowed FFT of exactly that signal, mapped to [0, 1].
const mags = new Map<number, Float32Array>()
const re = new Float64Array(N), im = new Float64Array(N)
function row(r: number) {
  let m = mags.get(r)
  if (m) return m
  const mid = T_FALL + (r + 0.5) / RATE
  for (let n = 0; n < N; n++) {
    const t = mid + (n - N / 2) / SR
    re[n] = (tones(r, t) + 0.012 * hash(t * SR)) * hann(n, N)
    im[n] = 0
  }
  fft(re, im)
  m = new Float32Array(COLS)
  for (let c = 0; c < COLS; c++) m[c] = clamp((20 * Math.log10(Math.hypot(re[BIN0 + c], im[BIN0 + c]) / (N / 4) + 1e-9) + 66) / 50)
  if (mags.size > 256) mags.delete(mags.keys().next().value!)
  mags.set(r, m)
  return m
}

// An SDR palette: deep blue floor, cyan, gold, white-hot.
const STOPS = [[0.02, 0.06, 0.3], [0.05, 0.35, 1], [0.1, 0.95, 0.9], [1, 0.85, 0.2], [1, 1, 1]]
function palette(v: number, o: { r: number; g: number; b: number }) {
  const x = clamp(v) * (STOPS.length - 1), i = Math.min(STOPS.length - 2, Math.floor(x)), k = x - i
  o.r = mix(STOPS[i][0], STOPS[i + 1][0], k), o.g = mix(STOPS[i][1], STOPS[i + 1][1], k), o.b = mix(STOPS[i][2], STOPS[i + 1][2], k)
}

const psd = new Float64Array(512), ri = new Float64Array(512), ii = new Float64Array(512)
const spec = new Path()
const label = new Path()

function spectrum(t: number, A: number) {
  const n = psd.length
  for (let k = 0; k < n; k++) {
    signal(IQ + t + (k - n) / (4 * RS))
    ri[k] = sig.i * hann(k, n)
    ii[k] = sig.q * hann(k, n)
  }
  fft(ri, ii)
  spec.clear()
  for (let k = 0; k < n; k++) {
    const b = (k + n / 2) % n // fftshift: negative frequencies on the left
    psd[b] = mix(psd[b] || 1e-6, (ri[k] ** 2 + ii[k] ** 2) / n, 0.25)
  }
  for (let b = 0; b < n; b++) {
    const y = -0.45 + 0.95 * clamp((10 * Math.log10(psd[b] + 1e-12) + 45) / 50)
    b ? spec.lineTo(mix(-A, A, b / (n - 1)), y) : spec.moveTo(-A, y)
  }
  return spec
}

export const waterfall: Scene = {
  dur: 12,
  build(t, f) {
    const A = view.a * 0.92, top = 0.72, lh = 1.36 / ROWS, cw = (2 * A) / COLS
    if (!lit.length) paint(cw, lh)
    const raster = smooth(T_FALL, T_FALL + 0.6, t), rows = rowsAt(t), r0 = Math.floor(rows)

    if (raster < 1) f.ch.push({ w: 0.6 * (1 - raster), path: spectrum(t, A) })
    if (raster > 0)
      f.ch.push({
        w: raster,
        fn: (_, s, u) => {
          const x = u * ROWS, j = Math.floor(x), c = x - j, r = r0 - j
          s.x = mix(-A, A, c)
          s.y = top - (j + rows - r0) * lh
          if (r < 0 || c < 0.006 || c > 0.994) return void (s.z = 0)
          const v = row(r)[Math.min(COLS - 1, Math.floor(c * COLS))]
          palette(v, s)
          s.z = 0.18 + 1.4 * v
        },
      })

    label.clear()
    header(label)
    if (raster < 1) {
      label.intensity(1 - raster)
      text(label, '|S(f)|  dB', -A, 0.62, 0.05)
      text(label, `R_s(1 + α) = ${(RS * 1.2).toFixed(0)} Hz`, -A, -0.76, 0.05)
      text(label, '16APSK  5/6   ·   roll-off 0.20', -A, -0.89, 0.05)
    } else {
      text(label, `${freq(0).toFixed(0)} Hz`, -A, -0.76, 0.045)
      text(label, `${(freq(COLS - 1) / 1000).toFixed(2)} kHz`, A, -0.76, 0.045, 1)
      text(label, `N = ${N}   Δf = ${(SR / N).toFixed(1)} Hz   Hann`, -A, -0.89, 0.05)
      text(label, t > T_STOP ? 'HOLD' : `${RATE} rows/s`, A, -0.89, 0.05, 1)
    }
    f.ch.push({ w: 0.3, gain: 0.7, path: label })
    f.rate = mix(1.2e6, 2.4e6, raster)
    f.look = { tau: 0.05 }
    return (tt, o) => {
      const k = smooth(T_FALL - 0.3, T_FALL + 0.3, tt)
      signal(IQ + tt)
      const w = synth(tt) * k * (1 - 0.6 * smooth(T_STOP + 2, T_STOP + 5, tt))
      o.l = (1 - k) * 0.6 * sig.i + w
      o.r = (1 - k) * 0.6 * sig.q + w
    }
  },
}

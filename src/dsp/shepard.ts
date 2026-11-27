// The fall's choir: a Shepard–Risset glissando (Risset, 1968) played as a pad. Octave layers slide down forever
// under a fixed bell over log-frequency, fading in at the top as they fade out at the bottom, so the fall never
// lands. Each layer sings a root and its fifth, so the whole is one open chord falling, and each of those is a
// pair of singers a fraction of a hertz apart, so it beats slowly and stands wide.
// Its timbre is a spectrum, not a waveform: each singer is cos θ through a Chebyshev polynomial, Σ wₙ Tₙ(cos θ) =
// Σ wₙ cos nθ, so harmonics 1 to 5 cost one table read and five multiply-adds. The weights are set where each
// harmonic actually sounds, through one resonant lowpass over absolute frequency, so the colour stands still while
// the pitches fall through it (that stillness is the illusion), opening it is a filter sweep, its resonance lights
// each partial as it passes, and nothing folds back past Nyquist. A root's harmonics 1–4 are A, A, E, A and its
// fifth's E, E, B, E: an open sus2 that never resolves. The fifth harmonics, C♯ and G♯, are the major ninth it
// blooms into when it lands, in just intonation.
// Under it, a sub: the same layers between 27 and 110 Hz, pure and in the middle. Around it, breath: noise in a
// quarter-octave band two octaves over each layer, left and right from different noise, wind past the ear.

const L = 9 // octaves, A−1 (13.75 Hz) to A8: the bell puts the middle near 300 Hz
export const F0 = 13.75
const H = 5 // harmonics
const FIFTH = Math.log2(3 / 2)
const QUIET = 3e-4 // a singer this far down is lost in the mass and the hall: skip them
const BLOCK = 64 // samples per control step
const Q = 6 // the breath's bands: a sixth of their centre wide
const TABLE = 4096
const COS = Float64Array.from({ length: TABLE + 1 }, (_, i) => Math.cos((2 * Math.PI * i) / TABLE))
const rcos = (x: number) => (x <= 0 || x >= 1 ? 0 : 0.5 - 0.5 * Math.cos(2 * Math.PI * x)) // a bell over [0, 1]

// What it sings into: left and right, and the middle (the sub).
export type Part = { l: number; r: number; m: number }

export class Shepard {
  // How it sings, read once a block. s: descent in octaves (an integer puts every root on an A). fifth: the fifth's
  // level. bright: the lowpass's corner, Hz, and res its peak there. tone: harmonics 2–4 against the fundamental.
  // bloom: the fifth harmonics. beat: Hz between a pair. width: how far apart a pair stands. turn: radians the
  // layers have gone round the head (the whirlpool). sub, breath, air: levels, and the breath's centre in Hz.
  s = 0
  fifth = 1
  bright = 1500
  tone = 0.6
  bloom = 0
  beat = 0.12
  width = 0.7
  turn = 0
  res = 0
  sub = 0
  breath = 0
  air = 800
  private ph = new Float64Array(4 * L) // per singer (layer, tone, pair): phase in cycles
  private inc = new Float64Array(4 * L) // cycles a sample
  private gl = new Float64Array(4 * L)
  private gr = new Float64Array(4 * L)
  private poly = new Float64Array(6 * 2 * L) // per tone of each layer: its polynomial in cos θ, gain folded in
  private on = new Int32Array(4 * L)
  private live = 0
  private sph = new Float64Array(L) // the sub, per layer
  private sinc = new Float64Array(L)
  private sg = new Float64Array(L)
  private subs = new Int32Array(L) // the layers in the sub's band this block
  private ns = 0
  private sv = new Float64Array(4 * L) // per breath band: a1, a2, a3, gain (Simper's state-variable filter)
  private ic = new Float64Array(4 * L)
  private bands = new Int32Array(L)
  private nb = 0
  private left = 0
  private seed = 0x9e3779b9 | 0
  private w = new Float64Array(H + 1)

  // pairs: singers to a tone, two to beat slowly against each other, or one alone
  constructor(private sr = 48000, private pairs = 2) {
    for (let i = 0; i < this.ph.length; i++) this.ph[i] = this.rand()
    for (let i = 0; i < L; i++) this.sph[i] = this.rand()
  }

  // Uniform in [0, 1): Marsaglia's xorshift.
  private rand() {
    let x = this.seed
    ;(x ^= x << 13), (x ^= x >>> 17), (x ^= x << 5)
    return ((this.seed = x) >>> 0) / 4294967296
  }

  // Sets every singer and band for the next block.
  private control() {
    const { sr, w } = this, nyq = 0.45 * sr, b4 = this.bright ** 4
    this.live = this.nb = this.ns = 0
    for (let j = 0; j < L; j++) {
      const x = (((j - this.s) % L) + L) % L // this layer's place in the span, sliding down
      for (let k = 0; k < 2; k++) {
        const xk = k ? x + FIFTH : x, bell = rcos(xk / L), g = bell * bell * (k ? this.fifth : 1)
        if (g < QUIET) continue
        const f = F0 * 2 ** xk
        // where each harmonic sounds: through the lowpass (fourth order, so the corner is soft), and gone near Nyquist
        for (let n = 1; n <= H; n++) {
          const fn = n * f, a = n === 1 ? 1 : n === 5 ? (0.5 * this.bloom) / n : this.tone / n
          const peak = this.res > 0 ? this.res * Math.exp(-8 * Math.log2(fn / this.bright) ** 2) : 0
          w[n] = fn > nyq ? 0 : g * a * (1 / Math.sqrt(1 + (fn * fn * fn * fn) / b4) + peak)
        }
        const p = this.poly, q = 6 * (2 * j + k)
        p[q] = w[4] - w[2]
        p[q + 1] = w[1] - 3 * w[3] + 5 * w[5]
        p[q + 2] = 2 * w[2] - 8 * w[4]
        p[q + 3] = 4 * w[3] - 20 * w[5]
        p[q + 4] = 8 * w[4]
        p[q + 5] = 16 * w[5]
        // the pair: a beat apart, each on its own side, the pairs turning round the head together
        const pan = this.width * Math.sin(this.turn + j * 2.4 + k * 1.3)
        for (let m = 2 - this.pairs; m < 2; m++) {
          const i = 2 * (2 * j + k) + m, a = (Math.PI / 4) * (1 + (m ? pan : -pan))
          this.inc[i] = (f + (m ? 0.5 : -0.5) * this.beat) / sr
          this.gl[i] = Math.cos(a)
          this.gr[i] = Math.sin(a)
          this.on[this.live++] = i
        }
      }
      // the sub: this layer again, pure, if it is between 27.5 and 110 Hz
      const f = F0 * 2 ** x, u = Math.log2(f / 27.5) / 2
      if (this.sub > 0 && u > 0 && u < 1) (this.sinc[j] = f / sr), (this.sg[j] = this.sub * rcos(u)), (this.subs[this.ns++] = j)
      // the breath, two octaves up: its gain makes white noise of variance 1/3 come out of the band at unit RMS
      const fb = 4 * f, bw = this.breath * rcos(x / L) * Math.exp(-(Math.log2(fb / this.air) ** 2))
      if (bw < 3e-3 || fb > 0.4 * sr) continue
      const tg = Math.tan((Math.PI * fb) / sr), a1 = 1 / (1 + tg * (tg + 1 / Q)), sv = this.sv, i = 4 * j
      sv[i] = a1
      sv[i + 1] = tg * a1
      sv[i + 2] = tg * tg * a1
      sv[i + 3] = bw * Math.sqrt((3 * sr) / (Math.PI * fb * Q))
      this.bands[this.nb++] = j
    }
  }

  // Adds one sample into o.
  sample(o: Part) {
    if (this.left-- <= 0) this.control(), (this.left = BLOCK - 1)
    const { ph, inc, gl, gr, poly, on } = this
    let l = 0, r = 0
    for (let q = 0; q < this.live; q++) {
      const i = on[q], p = ph[i] + inc[i], u = (ph[i] = p - Math.floor(p)) * TABLE, k = u | 0
      const v = COS[k] + (COS[k + 1] - COS[k]) * (u - k), c = 6 * (i >> 1)
      const y = ((((poly[c + 5] * v + poly[c + 4]) * v + poly[c + 3]) * v + poly[c + 2]) * v + poly[c + 1]) * v + poly[c]
      l += gl[i] * y
      r += gr[i] * y
    }
    let m = 0
    for (let n = 0; n < this.ns; n++) {
      const j = this.subs[n], p = this.sph[j] + this.sinc[j], u = (this.sph[j] = p - Math.floor(p)) * TABLE, k = u | 0
      m += this.sg[j] * (COS[k] + (COS[k + 1] - COS[k]) * (u - k))
    }
    if (this.nb) {
      const { sv, ic } = this
      const nl = 2 * this.rand() - 1, nr = 2 * this.rand() - 1
      for (let n = 0; n < this.nb; n++) {
        const s = 4 * this.bands[n], a1 = sv[s], a2 = sv[s + 1], a3 = sv[s + 2]
        let v3 = nl - ic[s + 1], v1 = a1 * ic[s] + a2 * v3
        ic[s + 1] = 2 * (ic[s + 1] + a2 * ic[s] + a3 * v3) - ic[s + 1]
        ic[s] = 2 * v1 - ic[s]
        l += sv[s + 3] * v1
        v3 = nr - ic[s + 3]
        v1 = a1 * ic[s + 2] + a2 * v3
        ic[s + 3] = 2 * (ic[s + 3] + a2 * ic[s + 2] + a3 * v3) - ic[s + 3]
        ic[s + 2] = 2 * v1 - ic[s + 2]
        r += sv[s + 3] * v1
      }
    }
    o.l += l
    o.r += r
    o.m += m
  }
}

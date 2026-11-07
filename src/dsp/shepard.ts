// The fall's choir: a Shepard–Risset glissando (Risset's "Fall", 1968). Pure tones a period apart slide
// down forever under a fixed bell over log-frequency, fading in at the top as they fade out at the bottom,
// so the fall never lands. Pure octaves, so they fuse into one tone; seven of them, 40 Hz to about 5 kHz,
// nothing shrill; and slow (choir.ts), or the partials come apart and are heard as sirens. Each tone is a
// section of singers in a fixed place on a wide stage: two beating a fraction of a hertz apart from random
// phases, two more joining a few cents off as the chorus swells, and as the fall deepens each sings a
// little of its own third harmonic, a twelfth up, as an organ's quint stop does.
// Under them, a root: the same fall a twelfth below, so every angel is its third harmonic, one steady
// singer to a tone in the middle, under its own bell around 80 Hz. It sings its own second and third
// harmonics, so a speaker too small for the fundamental still implies it (the missing fundamental).
// Around them, breath: white noise through a band at each tone two octaves up, a quarter octave wide,
// left and right from different noise, so it surrounds without standing anywhere. Its own bell moves
// with `air`: low, it is a cloud in the choir; high, it is the shimmer of the climax, airy and never a
// partial. Quietly, a dread choir sings a septimal tritone, a minor second and a low tritone that crawl
// apart from unison into a quarter-tone cluster. A period of φ instead of 2 never lines up.

const F0 = 40
const DREAD = [7 / 5, 16 / 15, 45 / 64] // septimal tritone, minor second, a low tritone
const TONES = 2 + DREAD.length // the angel, the root, then the dread
const SINGERS = 4 // per section: the beating pair, then two who join with the chorus
const CENTS = [0, 0, -9, 7], SPREAD = [-0.6, 0.6, -0.9, 0.9] // the beating pair stands left and right
const ROOT = 20 // Hz, the bottom of the root's four octaves
const H2 = 0.45, H3 = 0.3 // the root's harmonics
const Q = 6 // the breath's bands: a sixth of their centre wide, about a quarter octave
const TOP = 18_000 // nothing sings above this, so nothing folds back past Nyquist
const QUIET = 1e-3 // a singer this far down (−60 dB) is lost in the mass and the hall: skip them
const BLOCK = 64 // samples per control step
const TABLE = 4096
const SIN = Float64Array.from({ length: TABLE + 1 }, (_, i) => Math.sin((2 * Math.PI * i) / TABLE))

const sin = (p: number) => {
  const f = p * TABLE, i = f | 0 // p ∈ [0, 1)
  return SIN[i] + (SIN[i + 1] - SIN[i]) * (f - i)
}
const rcos = (x: number) => (x <= 0 || x >= 1 ? 0 : 0.5 - 0.5 * Math.cos(2 * Math.PI * x)) // a bell over [0, 1]

// What the choir sings into: the angels' stereo pair with the breath, the root, and the dread beneath.
export type Part = { l: number; r: number; b: number; d: number }

export class Shepard {
  readonly layers: number
  // How it sings, read once a block: descent in periods, dread ∈ [0, 1], chorus ∈ [0, 1] how far the
  // other two singers of each section have joined, colour the angels' twelfth, root and breath their
  // levels, air the breath's centre in Hz.
  s = 0
  dread = 0
  chorus = 0
  colour = 0
  root = 0
  breath = 0
  air = 600
  private ph: Float64Array // phase in cycles, per singer, kept in [0, 1)
  private hz: Float64Array
  private al: Float64Array // per singer, gain into the left and the right (a mono singer's is all in al)
  private ar: Float64Array
  private gl: Float64Array // per singer, where they stand: constant-power gains
  private gr: Float64Array
  private on: Int32Array // the singers audible this block: angels from the start, then the root; dread from the end
  private live = 0
  private roots = 0 // where the root singers begin in on
  private dead = 0 // where the dread singers begin in on
  private crawl: Float64Array // each dread tone's detune in cents: where it is, where it is going
  private f: Float64Array // per layer, its angel's pitch this block
  private sv: Float64Array // per layer, the breath's band: a1, a2, a3, gain (Simper's state-variable filter)
  private ic: Float64Array // per layer, its two integrators, left then right
  private bands: Int32Array // the layers breathing this block
  private nb = 0
  private out = { l: 0, r: 0, b: 0, d: 0 } // the last sample, unscaled, for a second call at the same t
  private last = 0
  private left = 0 // samples until the next control step
  private sr = 48000 // from the clock: the breath's bands are tuned to it
  private seed = 0x9e3779b9 | 0

  constructor(readonly period = 2) {
    this.layers = Math.ceil(Math.log(128) / Math.log(period)) // seven octaves, 40 Hz to about 5 kHz
    const k = this.layers * TONES * SINGERS
    this.ph = new Float64Array(k)
    this.hz = new Float64Array(k)
    this.al = new Float64Array(k)
    this.ar = new Float64Array(k)
    this.gl = new Float64Array(k)
    this.gr = new Float64Array(k)
    this.on = new Int32Array(k)
    this.crawl = new Float64Array(2 * this.layers * TONES)
    this.f = new Float64Array(this.layers)
    this.sv = new Float64Array(4 * this.layers)
    this.ic = new Float64Array(4 * this.layers)
    this.bands = new Int32Array(this.layers)
    for (let i = 0; i < k; i++) {
      const a = (((Math.floor(i / SINGERS) % TONES ? 0 : SPREAD[i % SINGERS]) + 1) * Math.PI) / 4
      this.gl[i] = Math.SQRT2 * Math.cos(a)
      this.gr[i] = Math.SQRT2 * Math.sin(a)
    }
    this.reset(0)
  }

  reset(t: number) {
    for (let i = 0; i < this.ph.length; i++) this.ph[i] = this.rand()
    this.crawl.fill(0), this.ic.fill(0), (this.last = t), (this.left = 0)
    this.out.l = this.out.r = this.out.b = this.out.d = 0
  }

  // Uniform in [0, 1): Marsaglia's xorshift.
  private rand() {
    let x = this.seed
    x ^= x << 13, x ^= x >>> 17, x ^= x << 5
    return ((this.seed = x) >>> 0) / 4294967296
  }

  // Sets every singer and band for the next block: where each layer sits, its bell and its beating.
  private control() {
    const { layers: L, dread, sr } = this
    const angel = 1 - 0.3 * dread, beat = 0.05 + 0.25 * dread // Hz between the pair
    this.live = this.nb = 0
    this.dead = this.on.length
    for (let j = 0; j < L; j++) {
      const x = (((j - this.s) % L) + L) % L // this layer's place in the span, sliding down
      const bell = rcos(x / L), f = (this.f[j] = F0 * this.period ** x)
      this.voice(j, 0, f, angel * bell * bell, SINGERS, beat)
      for (let c = 2; c < TONES; c++) {
        // a slow random walk away from unison, reaching ±50 cents at full dread
        const t = j * TONES + c
        if (this.rand() < 0.004) this.crawl[2 * t + 1] = (this.rand() * 2 - 1) * 50 * dread
        this.crawl[2 * t] += (this.crawl[2 * t + 1] - this.crawl[2 * t]) * 0.02
        this.voice(j, c, f * DREAD[c - 2] * 2 ** (this.crawl[2 * t] / 1200), 0.2 * dread * bell * bell, 2, beat)
      }
      // the breath, two octaves up: tuned once a block, its gain making white noise of variance 1/3
      // come out of the band at unit RMS, whatever its width
      const fb = 4 * f, w = this.breath * bell * Math.exp(-(Math.log2(fb / this.air) ** 2))
      if (w < 10 * QUIET || fb > 0.4 * sr) continue // a band 40 dB down is lost in the choir
      const g = Math.tan((Math.PI * fb) / sr), a1 = 1 / (1 + g * (g + 1 / Q)), sv = this.sv, i = 4 * j
      sv[i] = a1
      sv[i + 1] = g * a1
      sv[i + 2] = g * g * a1
      sv[i + 3] = w * Math.sqrt((3 * sr) / (Math.PI * fb * Q))
      this.bands[this.nb++] = j
    }
    this.roots = this.live // the root's singers follow the angels' in on
    for (let j = 0; j < L; j++) {
      const f = this.f[j] / 3
      if (f > ROOT && f < 16 * ROOT) this.voice(j, 1, f, this.root * rcos(Math.log2(f / ROOT) / 4), 1, beat)
    }
  }

  // One section: its singers' pitches and gains, and where they go in on.
  private voice(j: number, c: number, fc: number, g: number, n: number, beat: number) {
    if (g < QUIET || fc > TOP) return
    const t = j * TONES + c
    for (let k = 0; k < n; k++) {
      const i = t * SINGERS + k, a = k < 2 ? g : g * this.chorus
      if (a < QUIET) continue
      this.hz[i] = k < 2 ? fc + (k ? -beat : beat) / 2 : fc * 2 ** ((CENTS[k] * this.chorus) / 1200)
      if (c === 0) (this.al[i] = a * this.gl[i]), (this.ar[i] = a * this.gr[i]), (this.on[this.live++] = i)
      else if (c === 1) (this.al[i] = a), (this.on[this.live++] = i)
      else (this.al[i] = a), (this.on[--this.dead] = i)
    }
  }

  // Adds one sample at time t, times gain, into o. Called twice at the same t, it sings the same sample.
  sample(t: number, o: Part, gain = 1) {
    const dt = t - this.last
    if (dt < 0 || dt > 0.1) this.reset(t)
    else if (dt > 0) this.render(dt)
    this.last = t
    const k = 0.12 * gain, s = this.out
    o.l += k * s.l
    o.r += k * s.r
    o.b += k * s.b
    o.d += k * s.d
  }

  private render(dt: number) {
    if (this.left-- <= 0) (this.sr = 1 / dt), this.control(), (this.left = BLOCK - 1)
    const { ph, hz, al, ar, on, colour: c3 } = this
    let l = 0, r = 0, b = 0, d = 0, q = 0
    for (; q < this.roots; q++) {
      const i = on[q], p = ph[i] + hz[i] * dt, v = sin((ph[i] = p - Math.floor(p))), y = v * (1 + c3 * (3 - 4 * v * v))
      l += al[i] * y
      r += ar[i] * y
    }
    for (; q < this.live; q++) {
      const i = on[q], p = ph[i] + hz[i] * dt, v = sin((ph[i] = p - Math.floor(p))), w = v * v
      b += al[i] * (v * (1 + H3 * (3 - 4 * w)) + H2 * (1 - 2 * w)) // sin θ + H3 sin 3θ + H2 cos 2θ
    }
    for (q = this.dead; q < on.length; q++) {
      const i = on[q], p = ph[i] + hz[i] * dt
      d += al[i] * sin((ph[i] = p - Math.floor(p)))
    }
    if (this.nb) {
      const { sv, ic } = this
      const nl = 2 * this.rand() - 1, nr = 2 * this.rand() - 1
      for (let n = 0; n < this.nb; n++) {
        const j = this.bands[n], s = 4 * j, a1 = sv[s], a2 = sv[s + 1], a3 = sv[s + 2]
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
    const s = this.out
    s.l = l, s.r = r, s.b = b, s.d = d
  }
}

// The fall's choir: a Shepard–Risset glissando (Risset's "Fall", 1968). Pure tones a period apart slide
// down forever under a fixed bell over log-frequency, fading in at the top as they fade out at the bottom,
// so the fall never lands. Pure octaves, so they fuse into one tone; seven of them, 40 Hz to about 5 kHz,
// nothing shrill; and slow (choir.ts), or the partials come apart and are heard as sirens. Each tone is a section of singers in a fixed place on a wide stage: two
// beating a fraction of a hertz apart from random phases, two more joining a few cents off as the chorus
// swells. Under them, quietly, a dread choir sings a septimal tritone, a minor second and a low tritone
// that crawl apart from unison into a quarter-tone cluster. A period of φ instead of 2 never lines up.

const F0 = 40
const ANGEL = [1] // each layer is its octave alone: pure octaves fuse into one endless tone
const STAGE = [0] // where each section stands, −1 left to 1 right
const DREAD = [7 / 5, 16 / 15, 45 / 64] // septimal tritone, minor second, a low tritone
const TONES = ANGEL.length + DREAD.length
const SINGERS = 4 // per section: the beating pair, then two who join with the chorus
const CENTS = [0, 0, -9, 7], SPREAD = [-0.6, 0.6, -0.9, 0.9] // the beating pair stands left and right
const TOP = 18_000 // nothing sings above this, so nothing folds back past Nyquist
const QUIET = 1e-3 // a singer this far down (−60 dB) is lost in the mass and the hall: skip them
const BLOCK = 64 // samples per control step
const TABLE = 4096
const SIN = Float64Array.from({ length: TABLE + 1 }, (_, i) => Math.sin((2 * Math.PI * i) / TABLE))

const sin = (p: number) => {
  const f = p * TABLE, i = f | 0 // p ∈ [0, 1)
  return SIN[i] + (SIN[i + 1] - SIN[i]) * (f - i)
}
const clamp01 = (x: number) => Math.min(1, Math.max(0, x))

// What the choir sings into: the angels' stereo pair and the dread beneath them.
export type Part = { l: number; r: number; d: number }

export class Shepard {
  readonly layers: number
  // How it sings, read once a block: descent in periods, dread ∈ [0, 1], prime ∈ [0, 1] glides the ninth
  // up to 11/8, n how many chord tones sing (2 to 8, fractional while one enters), chorus ∈ [0, 1] how far
  // the other two singers of each section have joined.
  s = 0
  dread = 0
  prime = 0
  n = 2
  chorus = 0
  private ph: Float64Array // phase in cycles, per singer, kept in [0, 1)
  private hz: Float64Array
  private al: Float64Array // per singer, gain into the left and the right (a dread singer's is all in al)
  private ar: Float64Array
  private gl: Float64Array // per singer, where they stand: constant-power gains
  private gr: Float64Array
  private on: Int32Array // the singers audible this block: angels from the start, dread from the end
  private live = 0
  private dead = 0 // where the dread singers begin in on
  private crawl: Float64Array // each dread tone's detune in cents: where it is, where it is going
  private last = 0
  private left = 0 // samples until the next control step
  private seed = 1

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
    for (let i = 0; i < k; i++) {
      const c = Math.floor(i / SINGERS) % TONES, p = c < ANGEL.length ? STAGE[c] + SPREAD[i % SINGERS] : 0
      const a = ((Math.max(-1, Math.min(1, p)) + 1) * Math.PI) / 4
      this.gl[i] = Math.SQRT2 * Math.cos(a)
      this.gr[i] = Math.SQRT2 * Math.sin(a)
    }
    this.reset(0)
  }

  reset(t: number) {
    for (let i = 0; i < this.ph.length; i++) this.ph[i] = this.rand()
    this.crawl.fill(0), (this.last = t), (this.left = 0)
  }

  private rand() {
    this.seed = (this.seed * 16807) % 2147483647
    return this.seed / 2147483647
  }

  // Sets every singer for the next block: where each layer sits, its bell and its beating.
  private control() {
    const { layers: L, dread, prime, n, chorus } = this
    const angel = 1 - 0.3 * dread, beat = 0.05 + 0.25 * dread // Hz between the pair
    this.live = 0
    this.dead = this.on.length
    for (let j = 0; j < L; j++) {
      const x = (((j - this.s) % L) + L) % L // this layer's place in the span, sliding down
      const bell = 0.5 - 0.5 * Math.cos((2 * Math.PI * x) / L)
      const f = F0 * this.period ** x
      for (let c = 0; c < TONES; c++) {
        const t = j * TONES + c, isAngel = c < ANGEL.length
        let fc = f, g
        if (isAngel) (fc *= ANGEL[c] * (c === 4 ? (11 / 9) ** prime : 1)), (g = angel * clamp01(n - c) * (c ? 0.4 : 1))
        else {
          // a slow random walk away from unison, reaching ±50 cents at full dread
          if (this.rand() < 0.004) this.crawl[2 * t + 1] = (this.rand() * 2 - 1) * 50 * dread
          this.crawl[2 * t] += (this.crawl[2 * t + 1] - this.crawl[2 * t]) * 0.02
          fc *= DREAD[c - ANGEL.length] * 2 ** (this.crawl[2 * t] / 1200)
          g = 0.2 * dread
        }
        g *= bell * bell
        if (g < QUIET || fc > TOP) continue
        for (let k = 0; k < (isAngel ? SINGERS : 2); k++) {
          const i = t * SINGERS + k, a = k < 2 ? g : g * chorus
          if (a < QUIET) continue
          this.hz[i] = k < 2 ? fc + (k ? -beat : beat) / 2 : fc * 2 ** ((CENTS[k] * chorus) / 1200)
          if (isAngel) (this.al[i] = a * this.gl[i]), (this.ar[i] = a * this.gr[i]), (this.on[this.live++] = i)
          else (this.al[i] = a), (this.on[--this.dead] = i)
        }
      }
    }
  }

  // Adds one sample at time t, times gain, into o.
  sample(t: number, o: Part, gain = 1) {
    const dt = t - this.last
    if (dt < 0 || dt > 0.1) this.reset(t)
    this.last = t
    if (this.left-- <= 0) this.control(), (this.left = BLOCK - 1)
    const { ph, hz, al, ar, on } = this
    let l = 0, r = 0, d = 0
    for (let q = 0; q < this.live; q++) {
      const i = on[q], p = ph[i] + hz[i] * dt, v = sin((ph[i] = p - Math.floor(p)))
      l += al[i] * v
      r += ar[i] * v
    }
    for (let q = this.dead; q < on.length; q++) {
      const i = on[q], p = ph[i] + hz[i] * dt
      d += al[i] * sin((ph[i] = p - Math.floor(p)))
    }
    o.l += 0.12 * gain * l
    o.r += 0.12 * gain * r
    o.d += 0.12 * gain * d
  }
}

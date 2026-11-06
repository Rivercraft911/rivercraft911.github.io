// The fall's choir: a Shepard–Risset glissando (Risset's "Fall", 1968). Layers a period apart slide down
// forever under a fixed bell over log-frequency, fading in at the top as they fade out at the bottom, so
// the fall never lands. Each layer sings a 7-limit just chord through a vowel: the partials slide down
// through fixed formants, the way a falling voice does, and each pair beats at a fixed rate in Hz so every
// layer breathes together. Deeper in, a second choir crawls apart from unison into a quarter-tone cluster
// (Ligeti, Penderecki) and the vowel darkens from "ah" to "oo". Several of these orbit the listener;
// one may rise (a negative rate) while the others fall. A period of φ instead of 2 never lines up (Tenney).

const F0 = 27.5
const ANGEL = [1, 9 / 8, 5 / 4, 3 / 2, 7 / 4] // root, ninth, third, fifth, harmonic seventh
const DREAD = [7 / 5, 16 / 15, 45 / 64] // septimal tritone, minor second, a low tritone
const TONES = ANGEL.length + DREAD.length
const AH = [700, 1220, 2600], OO = [300, 870, 2240], GAINS = [1, 0.5, 0.25]
const BLOCK = 64 // samples per control step
const TABLE = 4096
const SIN = Float64Array.from({ length: TABLE + 1 }, (_, i) => Math.sin((2 * Math.PI * i) / TABLE))

const sin = (p: number) => {
  const f = (p - Math.floor(p)) * TABLE, i = f | 0
  return SIN[i] + (SIN[i + 1] - SIN[i]) * (f - i)
}

// How loudly a vowel passes frequency f: three formant bumps over log-frequency, and a floor.
function vowel(f: number, dark: number) {
  let g = 0.06
  for (let i = 0; i < 3; i++) {
    const c = AH[i] + (OO[i] - AH[i]) * dark, d = Math.log2(f / c) / 0.3
    g += GAINS[i] * Math.exp(-0.5 * d * d)
  }
  return g
}

export class Shepard {
  readonly layers: number
  private ph: Float64Array // phase in cycles, two beating copies per tone
  private inc: Float64Array // per-sample phase increments, set each block
  private amp: Float64Array // per-tone amplitude, set each block
  private crawl: Float64Array // each dread tone's detune in cents: where it is, where it is going
  private s = 0 // descent in periods
  private last = 0
  private n = 0 // samples until the next control step
  private seed = 1

  constructor(readonly sr = 48_000, readonly period = 2) {
    this.layers = Math.ceil(Math.log(600) / Math.log(period)) // F0 up to about 16.5 kHz
    const k = this.layers * TONES
    this.ph = new Float64Array(2 * k)
    this.inc = new Float64Array(2 * k)
    this.amp = new Float64Array(k)
    this.crawl = new Float64Array(2 * k)
  }

  reset(t: number) {
    this.ph.fill(0), this.crawl.fill(0), (this.s = 0), (this.last = t), (this.n = 0)
  }

  private rand() {
    this.seed = (this.seed * 16807) % 2147483647
    return this.seed / 2147483647
  }

  // Sets every oscillator for the next block: where each layer sits, its bell, vowel and beating.
  private control(dread: number) {
    const L = this.layers, angel = 1 - 0.55 * dread, dark = dread
    const beat = 0.12 + 0.6 * dread // Hz between the paired copies
    for (let j = 0; j < L; j++) {
      const x = (((j - this.s) % L) + L) % L // this layer's place in the span, sliding down
      const bell = 0.5 - 0.5 * Math.cos((2 * Math.PI * x) / L)
      const f = F0 * this.period ** x
      for (let c = 0; c < TONES; c++) {
        const i = j * TONES + c, isAngel = c < ANGEL.length
        let fc = f * (isAngel ? ANGEL[c] : DREAD[c - ANGEL.length])
        let g = isAngel ? angel / (1 + c * 0.5) : dread * 0.7
        if (!isAngel) {
          // a slow random walk away from unison, reaching ±50 cents at full dread
          if (this.rand() < 0.004) this.crawl[2 * i + 1] = (this.rand() * 2 - 1) * 50 * dread
          this.crawl[2 * i] += (this.crawl[2 * i + 1] - this.crawl[2 * i]) * 0.02
          fc *= 2 ** (this.crawl[2 * i] / 1200)
        }
        g *= bell * bell * vowel(fc, dark)
        this.amp[i] = g < 1e-4 ? 0 : g
        this.inc[2 * i] = (fc + beat / 2) / this.sr
        this.inc[2 * i + 1] = (fc - beat / 2) / this.sr
      }
    }
  }

  // One sample at time t: rate is periods per second of fall, dread ∈ [0, 1] how much horror sings.
  sample(t: number, rate: number, dread: number) {
    const dt = t - this.last
    if (dt < 0 || dt > 0.1) this.reset(t)
    this.last = t
    this.s += rate * dt
    if (this.n-- <= 0) this.control(dread), (this.n = BLOCK - 1)
    const { ph, inc, amp } = this
    let out = 0
    for (let i = 0; i < amp.length; i++) {
      const a = 2 * i
      ph[a] += inc[a]
      ph[a + 1] += inc[a + 1]
      if (amp[i]) out += amp[i] * (sin(ph[a]) + sin(ph[a + 1]))
    }
    return 0.05 * out
  }
}

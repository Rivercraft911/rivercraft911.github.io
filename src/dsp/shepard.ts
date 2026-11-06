// The fall's choir: a Shepard–Risset glissando. Layers an octave apart slide down forever under a fixed
// bell over log-frequency, fading in at the top as they fade out at the bottom, so the fall never lands.
// Each layer sings a just-intoned chord (the angels); deeper in, a second choir a tritone and a semitone
// away rises underneath, beating against the first (the horror). Several of these orbit the listener at
// different rates; one may even rise (a negative rate) while the others fall.

const LAYERS = 9 // octaves spanned: F0 · 2^0 … F0 · 2^9
const F0 = 27.5
const ANGEL = [1, 9 / 8, 5 / 4, 3 / 2, 15 / 8] // root, ninth, third, fifth, major seventh
const DREAD = [Math.SQRT2, 16 / 15, 45 / 32 / 2] // tritone, minor second, a low tritone
const CENTS = 1.0017 // ±3 cents between the paired copies: the shimmer
const TABLE = 4096
const SIN = Float64Array.from({ length: TABLE + 1 }, (_, i) => Math.sin((2 * Math.PI * i) / TABLE))
const TONES = ANGEL.length + DREAD.length

const sin = (p: number) => {
  const f = (p - Math.floor(p)) * TABLE, i = f | 0
  return SIN[i] + (SIN[i + 1] - SIN[i]) * (f - i)
}

export class Shepard {
  private ph = new Float64Array(LAYERS * TONES * 2) // phase in cycles per oscillator
  private s = 0 // descent in octaves
  private last = 0
  constructor(readonly sr = 48_000) {}

  reset(t: number) {
    this.ph.fill(0), (this.s = 0), (this.last = t)
  }

  // One sample at time t: rate is octaves per second of fall, dread ∈ [0, 1] how much horror sings.
  sample(t: number, rate: number, dread: number) {
    const dt = t - this.last
    if (dt < 0 || dt > 0.1) this.reset(t)
    this.last = t
    this.s += rate * dt
    const ph = this.ph, angel = 1 - 0.55 * dread
    let out = 0
    for (let j = 0; j < LAYERS; j++) {
      const x = (((j - this.s) % LAYERS) + LAYERS) % LAYERS // this layer's octave, sliding down
      const bell = 0.5 - 0.5 * Math.cos((2 * Math.PI * x) / LAYERS)
      if (bell < 1e-4) continue
      const f = F0 * 2 ** x, high = Math.min(1, x / 6) // air: high layers glitter
      const glitter = 1 + 0.35 * high * Math.sin(2 * Math.PI * (5.3 + j) * t + j)
      let v = 0
      for (let c = 0; c < TONES; c++) {
        const isAngel = c < ANGEL.length, ratio = isAngel ? ANGEL[c] : DREAD[c - ANGEL.length]
        const g = isAngel ? angel / (1 + c * 0.6) : dread * 0.6 * (1 + 0.5 * Math.sin(2 * Math.PI * 0.21 * t * (c + 1)))
        if (g <= 0) continue
        const o = 2 * (j * TONES + c), fc = (f * ratio) / this.sr
        ph[o] += fc * CENTS
        ph[o + 1] += fc / CENTS
        v += g * (sin(ph[o]) + sin(ph[o + 1]))
      }
      out += 0.05 * bell * bell * glitter * v
    }
    return out
  }
}

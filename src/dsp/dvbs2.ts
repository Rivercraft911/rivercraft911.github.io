// DVB-S2 flavored modulation: ring constellations, raised-cosine pulses and scrambled payload bits.

export type Constellation = { name: string; rate: string; radii: number[]; pts: Float64Array; bits: number }

// Rings of [count, radius, first angle]; the outer ring has unit radius.
function rings(name: string, rate: string, spec: [number, number, number][]): Constellation {
  const pts: number[] = []
  for (const [n, r, a0] of spec) for (let k = 0; k < n; k++) pts.push(r * Math.cos(a0 + (2 * Math.PI * k) / n), r * Math.sin(a0 + (2 * Math.PI * k) / n))
  return { name, rate, radii: spec.map((s) => s[1]), pts: new Float64Array(pts), bits: Math.log2(pts.length / 2) }
}

const P = Math.PI
export const QPSK = rings('QPSK', '1/2', [[4, 1, P / 4]])
export const PSK8 = rings('8PSK', '3/5', [[8, 1, 0]])
export const APSK16 = rings('16APSK', '5/6', [[4, 1 / 2.7, P / 4], [12, 1, P / 12]]) // γ = 2.70
export const APSK32 = rings('32APSK', '9/10', [[4, 1 / 4.3, P / 4], [12, 2.53 / 4.3, P / 12], [16, 1, 0]]) // γ1 = 2.53, γ2 = 4.30

// Raised cosine (RRC at the transmitter, matched RRC at the receiver), tabulated over ±SPAN symbols.
export const ALPHA = 0.2
export const SPAN = 5
const RES = 256
const RC = new Float64Array(2 * SPAN * RES + 2).map((_, i) => {
  const x = i / RES - SPAN, d = 1 - (2 * ALPHA * x) ** 2
  if (Math.abs(x) < 1e-9) return 1
  const sinc = Math.sin(P * x) / (P * x)
  return Math.abs(d) < 1e-9 ? (P / 4) * Math.sin(P / (2 * ALPHA)) / (P / (2 * ALPHA)) : (sinc * Math.cos(P * ALPHA * x)) / d
})
export function rc(x: number) {
  const f = (x + SPAN) * RES, i = Math.floor(f)
  return i < 0 || i >= RC.length - 1 ? 0 : RC[i] + (RC[i + 1] - RC[i]) * (f - i)
}

// The payload: this text, scrambled by the BB scrambler PRBS 1 + x^14 + x^15.
const MSG = 'RIVER DOWDY · KJ5SCH · signals, silicon, light, orbit · '
const BITS = (() => {
  const bytes = new TextEncoder().encode(MSG), out = new Uint8Array(bytes.length * 8 * 15)
  for (let i = 0, reg = 0b100101010000000; i < out.length; i++) {
    const fb = ((reg >> 13) ^ (reg >> 14)) & 1
    reg = ((reg << 1) | fb) & 0x7fff
    out[i] = ((bytes[(i >> 3) % bytes.length] >> (7 - (i & 7))) & 1) ^ fb
  }
  return out
})()

export function symbol(k: number, bits: number) {
  let s = 0
  for (let j = 0, i = (((k * bits) % BITS.length) + BITS.length) % BITS.length; j < bits; j++) s = (s << 1) | BITS[(i + j) % BITS.length]
  return s
}

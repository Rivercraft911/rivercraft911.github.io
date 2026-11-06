// DVB-S2 flavored modulation: ring constellations, raised-cosine pulses and scrambled payload bits.

export type Constellation = { name: string; rate: string; modcod: number; radii: number[]; pts: Float64Array; bits: number }

// Rings of [count, radius, first angle]; the outer ring has unit radius.
function rings(name: string, rate: string, modcod: number, spec: [number, number, number][]): Constellation {
  const pts: number[] = []
  for (const [n, r, a0] of spec) for (let k = 0; k < n; k++) pts.push(r * Math.cos(a0 + (2 * Math.PI * k) / n), r * Math.sin(a0 + (2 * Math.PI * k) / n))
  return { name, rate, modcod, radii: spec.map((s) => s[1]), pts: new Float64Array(pts), bits: Math.log2(pts.length / 2) }
}

const P = Math.PI
export const QPSK = rings('QPSK', '1/2', 4, [[4, 1, P / 4]])
export const PSK8 = rings('8PSK', '3/5', 12, [[8, 1, 0]])
export const APSK16 = rings('16APSK', '5/6', 21, [[4, 1 / 2.7, P / 4], [12, 1, P / 12]]) // γ = 2.70
export const APSK32 = rings('32APSK', '9/10', 28, [[4, 1 / 4.3, P / 4], [12, 2.53 / 4.3, P / 12], [16, 1, 0]]) // γ1 = 2.53, γ2 = 4.30

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

// Physical layer framing (EN 302 307-1 §5.5), short FECFRAMEs with pilots. Every PLFRAME opens with a
// 90-symbol π/2-BPSK header: the start-of-frame word and the PLS code naming the frame's modcod, which
// may change frame to frame (ACM). Pilot blocks of 36 symbols follow every 16 slots of data.
const SOF = 0x18d2e82
const PLS_SCRAMBLE = 0x719d83c953422dfan
const G = [0x55555555, 0x33333333, 0x0f0f0f0f, 0x00ff00ff, 0x0000ffff, 0xffffffff] // RM(1,5) rows
const S2 = Math.SQRT1_2

// The 90 header bits for a modcod: SOF, then the 7-bit PLS (modcod, short, pilots) as a (64,7) code.
const headers = new Map<number, Uint8Array>()
function header(modcod: number) {
  let h = headers.get(modcod)
  if (h) return h
  const pls = (modcod << 2) | 0b11, b = (i: number) => (pls >> (6 - i)) & 1
  h = new Uint8Array(90)
  for (let i = 0; i < 26; i++) h[i] = (SOF >> (25 - i)) & 1
  for (let i = 0; i < 32; i++) {
    let y = 0
    for (let r = 0; r < 6; r++) y ^= b(r) & (G[r] >>> (31 - i))
    y &= 1
    for (let j = 0; j < 2; j++) {
      const n = 2 * i + j
      h[26 + n] = y ^ (j & b(6)) ^ Number((PLS_SCRAMBLE >> BigInt(63 - n)) & 1n)
    }
  }
  headers.set(modcod, h)
  return h
}

export const Kind = { Header: 0, Pilot: 1, Data: 2 } as const
export type Kind = (typeof Kind)[keyof typeof Kind]
export const PLH = 90, PILOT = 36, SLOTS = 16 * 90

// A transmitted stream: frames laid end to end, each one's modcod picked by `pick` at its start time.
export class Frames {
  private starts = [0]
  private cons: Constellation[] = []
  constructor(readonly rs: number, readonly pick: (t: number) => Constellation) {}

  static len(c: Constellation) {
    const data = 16200 / c.bits, slots = data / 90
    return PLH + data + PILOT * Math.floor((slots - 1) / 16)
  }

  // The frame holding symbol k (k ≥ 0), extending the plan as needed.
  frame(k: number) {
    const s = this.starts
    while (s[s.length - 1] <= k) {
      const c = this.pick(s[s.length - 1] / this.rs)
      this.cons.push(c)
      s.push(s[s.length - 1] + Frames.len(c))
    }
    let lo = 0, hi = s.length - 2
    while (lo < hi) {
      const m = (lo + hi + 1) >> 1
      s[m] <= k ? (lo = m) : (hi = m - 1)
    }
    return lo
  }

  start(f: number) { return this.starts[f] }
  con(f: number) { return this.cons[f] }

  // Symbol k into o; returns what kind of symbol it is.
  sym(k: number, o: { i: number; q: number }): Kind {
    if (k < 0) return (o.i = o.q = 0), Kind.Data
    const f = this.frame(k), p = k - this.starts[f], c = this.cons[f]
    if (p < PLH) {
      const a = 1 - 2 * header(c.modcod)[p]
      o.i = a * (p & 1 ? -S2 : S2), o.q = a * S2 // π/2-BPSK: odd symbols at 45°, even at 135°
      return Kind.Header
    }
    const d = p - PLH, m = d % (SLOTS + PILOT)
    if (m >= SLOTS) return (o.i = o.q = S2), Kind.Pilot
    const j = 2 * symbol(k, c.bits)
    o.i = c.pts[j], o.q = c.pts[j + 1]
    return Kind.Data
  }
}

// The modem in the pool. A carrier arrives a few hundred hertz off, so it spins; the carrier loop pulls it
// in until it stands still, and then it talks: a real DVB-S2 stream, π/2-BPSK frame headers naming each
// frame's modcod, pilot blocks, and data. Then the weather comes through. Rain at R mm/h costs the link
// γ = kR^α dB a kilometre (ITU-R P.838-3) over the wet part of its path, and the modem answers as DVB-S2
// was built to (ACM): each new frame takes the densest constellation the link still holds, at the
// standard's own Es/N0 thresholds, 16APSK down to QPSK and back, and one step past where it began: this
// front leaves a clearer sky behind it than it found. Times are the valley's. The pointer detunes the
// carrier; a real second-order loop chases it, and moved too fast it slips cycles and the stones spin.
import { APSK16, APSK32, PSK8, QPSK, SPAN, Frames, rc, type Constellation } from '../dsp/dvbs2'
import { TAU, clamp, hash, input, lock, mix, smooth } from './scene'

export const RS = 24_000 // symbols per second: a frame is a fraction of a second, so the modcod keeps up with the rain
export const ON = 4.6 // the carrier arrives
const DF = 330 // Hz off, at first: the beat the speakers hear fall to nothing as it locks
const K = 0.02386, ALPHA = 1.1825, WET = 5 // P.838-3 at 12 GHz, horizontal; km of the path in the rain

export const rain = (t: number) => 45 * smooth(6, 7, t) * (1 - smooth(7.2, 8.4, t)) // mm/h
const clear = (t: number) => mix(13.6, 18.4, smooth(6.4, 8.7, t))
export const esn0 = (t: number) => clear(t) - K * rain(t) ** ALPHA * WET
// DVB-S2 quasi-error-free thresholds (EN 302 307-1, AWGN) for the modcods we fly, plus a margin.
const LADDER: [number, Constellation][] = [[1.0, QPSK], [5.5, PSK8], [11.61, APSK16], [16.05, APSK32]]
const pick = (t: number) => {
  let c = QPSK
  for (const [th, con] of LADDER) if (esn0(t) >= th + 0.8) c = con
  return c
}
const tx = new Frames(RS, pick)

// When the modcod changes, as the frames carry it: [time, constellation], from the carrier's arrival on.
export const STEPS: [number, Constellation][] = []
for (let k = Math.floor(ON * RS); k < 12 * RS; ) {
  const f = tx.frame(k), c = tx.con(f)
  if (STEPS.at(-1)?.[1] !== c) STEPS.push([Math.max(ON, tx.start(f) / RS), c])
  k = tx.start(f) + Frames.len(c)
}
export const order = (t: number) => {
  let c = STEPS[0][1]
  for (const s of STEPS) if (t >= s[0]) c = s[1]
  return c.pts.length / 2
}

// The stones: one for every point of the densest constellation. At each step every new point takes the
// nearest stone, a standing one if any is left, else one that sank there; the rest go to their nearest
// point and sink. So stepping down they run together in twos and threes, and stepping up they part again.
export const STONES = 32
type Keys = [number, number][]
const KI: Keys[] = [], KQ: Keys[] = [], KA: Keys[] = []
{
  const pi = new Float64Array(STONES), pq = new Float64Array(STONES), up = new Uint8Array(STONES)
  for (let s = 0; s < STONES; s++) KI.push([]), KQ.push([]), KA.push([])
  STEPS.forEach(([t, c], j) => {
    const n = c.pts.length / 2, took = new Uint8Array(STONES)
    const near = (i: number, q: number, ok: (s: number) => boolean) => {
      let best = -1, d = Infinity
      for (let s = 0; s < STONES; s++) if (ok(s) && (pi[s] - i) ** 2 + (pq[s] - q) ** 2 < d) (d = (pi[s] - i) ** 2 + (pq[s] - q) ** 2), (best = s)
      return best
    }
    const to = new Int16Array(STONES).fill(-1)
    for (let p = 0; p < n; p++) {
      const i = c.pts[2 * p], q = c.pts[2 * p + 1]
      let s = j ? near(i, q, (s) => !took[s] && !!up[s]) : p
      if (s < 0) s = near(i, q, (s) => !took[s])
      took[s] = 1, to[s] = p
    }
    for (let s = 0; s < STONES; s++) {
      let p = to[s]
      if (p < 0) {
        let d = Infinity
        for (let m = 0; m < n; m++) {
          const e = j ? (pi[s] - c.pts[2 * m]) ** 2 + (pq[s] - c.pts[2 * m + 1]) ** 2 : Math.abs(m - (s % n))
          if (e < d) (d = e), (p = m)
        }
      }
      pi[s] = c.pts[2 * p], pq[s] = c.pts[2 * p + 1], up[s] = took[s]
      KI[s].push([t, pi[s]]), KQ[s].push([t, pq[s]]), KA[s].push([t, up[s]])
    }
  })
}
// Stone s at t: where it stands on the I/Q plane, and how far out of the water (0 sunk, 1 standing).
export function stone(s: number, t: number, o: { i: number; q: number; a: number }) {
  o.i = lock(KI[s], t, 11, 0.55), o.q = lock(KQ[s], t, 11, 0.55)
  o.a = clamp(lock(KA[s], t, 11, 0.9)) * smooth(ON, ON + 0.6, t)
}

// Carrier offset: the pull-in, ringing as a loop does, and its integral (the phase it leaves), tabulated once.
const pull = (t: number) => DF * (1 - lock([[0, 0], [ON + 0.15, 1]], t, 9, 0.45))
const DT = 1 / 4000, PHASE = new Float64Array(8 * 4000)
for (let i = 1; i < PHASE.length; i++) PHASE[i] = PHASE[i - 1] + TAU * pull(ON + i * DT) * DT
const drift = (t: number) => {
  const f = clamp((t - ON) / DT, 0, PHASE.length - 1), i = Math.floor(f)
  return PHASE[i] + (PHASE[Math.min(i + 1, PHASE.length - 1)] - PHASE[i]) * (f - i)
}

// The pointer's detune, chased by a type-II loop (ζ = 0.7, 1.2 Hz natural frequency). Stateful: the
// only memory here, advanced once a frame.
const WN = TAU * 1.2, KP = 2 * 0.7 * WN, KI2 = WN * WN
const pll = { t: -1, in: 0, est: 0, w: 0, err: 0 }
const wrap = (a: number) => a - TAU * Math.round(a / TAU)
export function chase(t: number) {
  if (t < pll.t || t - pll.t > 0.5) Object.assign(pll, { t, in: 0, est: 0, w: 0, err: 0 })
  const user = 40 * input.x * smooth(ON + 1.2, ON + 1.7, t)
  for (let h; pll.t < t; pll.t += h) {
    h = Math.min(1 / 480, t - pll.t)
    pll.in += TAU * user * h
    const e = wrap(pll.in - pll.est)
    pll.w += KI2 * e * h
    pll.est += (pll.w + KP * e) * h
  }
  return (pll.err = wrap(pll.in - pll.est))
}

// Transmitted symbols by index, cached: I, Q and kind. The speakers run a little ahead of the picture, so
// the cache is wide enough to hold both.
const N = 8192, CK = new Float64Array(N).fill(NaN), CI = new Float64Array(N), CQ = new Float64Array(N), CT = new Uint8Array(N)
const s = { i: 0, q: 0 }
function sym(k: number) {
  const j = k & (N - 1)
  if (CK[j] !== k) (CK[j] = k), (CT[j] = tx.sym(k, s)), (CI[j] = s.i), (CQ[j] = s.q)
  return j
}

// A deterministic Gaussian for symbol k (Box–Muller on two hashes).
const gauss = (k: number, salt: number) =>
  Math.sqrt(-2 * Math.log(0.5 + 0.4999 * hash(k * 1.618 + salt))) * Math.cos(Math.PI * hash(k * 0.707 + salt * 3.1))
export const sigma = (t: number) => Math.sqrt(0.5 / 10 ** (esn0(t) / 10))
const talk = (t: number) => smooth(ON + 0.7, ON + 1.2, t) // modulation on

// Received baseband at t: Σ a_k g(t − kT) faded in from a bare carrier, rotated by what the loops have
// not yet removed, plus noise.
export const sig = { i: 0, q: 0 }
export function signal(t: number, slip = pll.err) {
  const x = t * RS, k0 = Math.floor(x), m = talk(t)
  let I = 0, Q = 0
  if (m > 0)
    for (let k = k0 - SPAN + 1; k <= k0 + SPAN; k++) {
      const j = sym(k), g = rc(x - k)
      I += CI[j] * g, Q += CQ[j] * g
    }
  const rho = mix(0.35, 1, lock([[0, 0], [ON, 1]], t, 5, 0.7))
  I = mix(rho * Math.SQRT1_2, I, m), Q = mix(rho * Math.SQRT1_2, Q, m)
  const ph = drift(t) + slip, c = Math.cos(ph), sn = Math.sin(ph), n = sigma(t)
  sig.i = I * c - Q * sn + n * gauss(x * 7, 1.3)
  sig.q = I * sn + Q * c + n * gauss(x * 7, 7.9)
}

// The decision for symbol k as the receiver saw it: the sent point plus its noise, under the residual
// rotation at the time. Returns the symbol's kind.
export function decision(k: number, slip: number, o: { i: number; q: number }) {
  const j = sym(k), tk = k / RS, ph = drift(tk) + slip, c = Math.cos(ph), sn = Math.sin(ph), nk = sigma(tk)
  const I = CI[j] + nk * gauss(k, 2.1), Q = CQ[j] + nk * gauss(k, 5.3)
  o.i = I * c - Q * sn, o.q = I * sn + Q * c
  return CT[j]
}
// How far the stones are turned from true: the carrier not yet pulled in, and the pointer's slip. And how
// fast they are still turning, in Hz.
export const turn = (t: number, slip = pll.err) => drift(t) + slip
export const offset = (t: number) => pull(t) + pll.w / TAU

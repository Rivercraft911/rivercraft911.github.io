// The receiver. The carrier the screen collapsed into arrives 50 Hz off, so it spins; the channel
// buries it in noise; the carrier loop pulls it in until it stands still, and then it starts to talk.
// What follows is a real DVB-S2 stream: π/2-BPSK frame headers naming each frame's modcod, pilot blocks,
// and data whose modcod climbs as the link improves (ACM, at the standard's own Es/N0 thresholds).
// The display is a vector analyser's: the pulse-shaped trajectory, faint, under a persistence of the
// last symbol decisions. The pointer detunes the carrier; a real second-order loop chases it, and if
// you move too fast it slips cycles and you watch (and hear) the constellation spin.
import { Path } from '../beam/path'
import { text } from '../beam/font'
import { APSK16, PSK8, QPSK, SPAN, Frames, Kind, PLH, rc, type Constellation } from '../dsp/dvbs2'
import { TAU, clamp, hash, input, lock, mix, note, smooth, view, type Scene } from './scene'
import { carrier } from './tune'

export const RS = 4800 // symbols per second
export const R = 0.64 // outer ring radius on screen
const DF = 50 // Hz: where the carrier starts, the tune's last harmonic
const PERSIST = 1500 // symbol decisions kept on screen

// Es/N0 over the scene: clean as it leaves the screen, buried by the channel, then the link comes up.
const ESN0: [number, number][] = [[0, 32], [0.7, -1], [2.6, 4.5], [4.6, 8.8], [6.6, 19]]
export const esn0 = (t: number) => lock(ESN0, t, 1.6, 0.9)
// DVB-S2 quasi-error-free thresholds (EN 302 307-1, AWGN) for the modcods we fly, plus a margin.
const LADDER: [number, Constellation][] = [[1.0, QPSK], [5.5, PSK8], [10.21, APSK16]]
const pick = (t: number) => {
  let c = QPSK
  for (const [th, con] of LADDER) if (esn0(t) >= th + 0.8) c = con
  return c
}
export const tx = new Frames(RS, pick)

// Carrier offset: the scheduled pull-in, and its integral (the phase it leaves), tabulated once.
const pull = (t: number) => DF * (1 - lock([[0, 0], [0.9, 1]], t, 2.4, 0.45))
const DT = 1 / 2000, PHASE = new Float64Array(30 * 2000)
for (let i = 1; i < PHASE.length; i++) PHASE[i] = PHASE[i - 1] + TAU * pull(i * DT) * DT
const drift = (t: number) => {
  const f = clamp(t / DT, 0, PHASE.length - 1), i = Math.floor(f)
  return PHASE[i] + (PHASE[Math.min(i + 1, PHASE.length - 1)] - PHASE[i]) * (f - i)
}

// The pointer's detune, chased by a type-II loop (ζ = 0.7, 1.2 Hz natural frequency). Stateful: the
// only memory in the scene, advanced once a frame.
const WN = TAU * 1.2, KP = 2 * 0.7 * WN, KI = WN * WN
const pll = { t: -1, in: 0, est: 0, w: 0, err: 0 }
const wrap = (a: number) => a - TAU * Math.round(a / TAU)
function chase(t: number) {
  if (t < pll.t || t - pll.t > 0.5) Object.assign(pll, { t, in: 0, est: 0, w: 0, err: 0 })
  const user = 40 * input.x * smooth(3, 3.5, t)
  for (let h; pll.t < t; pll.t += h) {
    h = Math.min(1 / 480, t - pll.t)
    pll.in += TAU * user * h
    const e = wrap(pll.in - pll.est)
    pll.w += KI * e * h
    pll.est += (pll.w + KP * e) * h
  }
  return (pll.err = wrap(pll.in - pll.est))
}

// Transmitted symbols by index, cached: I, Q and kind.
const CK = new Float64Array(512).fill(NaN), CI = new Float64Array(512), CQ = new Float64Array(512), CT = new Uint8Array(512)
const s = { i: 0, q: 0 }
function sym(k: number) {
  const j = k & 511
  if (CK[j] !== k) (CK[j] = k), (CT[j] = tx.sym(k, s)), (CI[j] = s.i), (CQ[j] = s.q)
  return j
}

// A deterministic Gaussian for symbol k (Box–Muller on two hashes).
const gauss = (k: number, salt: number) =>
  Math.sqrt(-2 * Math.log(0.5 + 0.4999 * hash(k * 1.618 + salt))) * Math.cos(Math.PI * hash(k * 0.707 + salt * 3.1))
const sigma = (t: number) => Math.sqrt(0.5 / 10 ** (esn0(t) / 10))
const talk = (t: number) => smooth(1.7, 2.6, t) // modulation on

// Received baseband at scene time t: Σ a_k g(t − kT) faded in from a bare carrier, rotated by what the
// loops have not yet removed, plus noise.
export const sig = { i: 0, q: 0 }
export function signal(t: number, slip = pll.err) {
  const x = t * RS, k0 = Math.floor(x), m = talk(t)
  let I = 0, Q = 0
  if (m > 0)
    for (let k = k0 - SPAN + 1; k <= k0 + SPAN; k++) {
      const j = sym(k), g = rc(x - k)
      I += CI[j] * g, Q += CQ[j] * g
    }
  const rho = mix(carrier.r / R, 1, lock([[0, 0], [0, 1]], t + 0.001, 5, 0.7))
  I = mix(rho * Math.SQRT1_2, I, m), Q = mix(rho * Math.SQRT1_2, Q, m)
  const ph = drift(t) + slip, c = Math.cos(ph), sn = Math.sin(ph), n = sigma(t)
  sig.i = I * c - Q * sn + n * gauss(x * 7, 1.3)
  sig.q = I * sn + Q * c + n * gauss(x * 7, 7.9)
}

const marks = new Path()
const labels = new Path()

function rings(p: Path, radii: number[], dashes = 56) {
  for (const r of radii)
    for (let i = 0; i < dashes; i++) {
      const a = (i / dashes) * TAU, b = ((i + 0.45) / dashes) * TAU
      p.moveTo(R * r * Math.cos(a), R * r * Math.sin(a)).lineTo(R * r * Math.cos(b), R * r * Math.sin(b))
    }
}

export const receive: Scene = {
  dur: 11,
  build(t, f) {
    const slip = chase(t), kNow = Math.floor(t * RS), fr = tx.frame(Math.max(0, kNow)), con = tx.con(fr)
    const m = talk(t), A = view.a

    // The trajectory, faint: what the wire carries between decisions.
    f.ch.push({
      w: 0.5,
      fn: (tt, o) => {
        signal(tt, slip)
        o.x = R * sig.i, o.y = R * sig.q
        o.z = mix(1, 0.14, m)
      },
    })

    // The persistence: the last decisions, each a dot, newest brightest. Headers and pilots are the
    // receiver's references and burn a little hotter.
    if (m > 0) {
      let last = -1
      f.ch.push({
        w: 0.9 * m,
        fn: (_, o, u) => {
          const a = Math.min(PERSIST - 1, Math.floor(u * PERSIST)), k = kNow - a
          if (k < 0 || k / RS < 1.7) return void (o.z = 0)
          const j = sym(k), tk = k / RS, ph = drift(tk) + slip, c = Math.cos(ph), sn = Math.sin(ph), nk = sigma(tk)
          const I = CI[j] + nk * gauss(k, 2.1), Q = CQ[j] + nk * gauss(k, 5.3)
          o.x = R * (I * c - Q * sn), o.y = R * (I * sn + Q * c)
          o.z = a === last ? (CT[j] === Kind.Data ? 1 : 1.8) * (1 - (0.75 * a) / PERSIST) * smooth(1.7, 2.4, tk) : 0
          last = a
        },
      })
    }

    // Axes and rings, then everything said about the signal, said where it lives.
    marks.clear().intensity(0.25 * smooth(0.6, 1.6, t))
    marks.moveTo(-1.25 * R, 0).lineTo(1.25 * R, 0).moveTo(0, -1.25 * R).lineTo(0, 1.25 * R)
    text(marks, 'I', 1.29 * R, -0.015, 0.035)
    text(marks, 'Q', 0.02, 1.26 * R, 0.035)
    if (con.radii.length > 1) marks.intensity(0.3 * m), rings(marks, con.radii)
    f.ch.push({ w: 0.2, gain: 0.6, path: marks })

    labels.clear().intensity(0.85)
    const tr = Math.floor(t * 5) / 5 // readouts refresh at 5 Hz, like an instrument's
    const df = pull(tr) + pll.w / TAU
    if (m < 1 || Math.abs(df) > 0.3) {
      labels.intensity(0.85 * (1 - m * smooth(0.3, 0, Math.abs(df))))
      note(labels, R * 0.71, R * 0.71, `Δf  ${df.toFixed(1)} Hz`, 1, 0.04)
      labels.intensity(0.85)
    }
    const ebn = esn0(tr)
    note(labels, R * 0.93, -R * 0.93, `E_s/N_0  ${ebn.toFixed(1)} dB   σ ${sigma(tr).toFixed(2)}`, 1, 0.035)
    if (m > 0.5) {
      const p = kNow - tx.start(fr), fresh = smooth(PLH + 1200, PLH, p)
      labels.intensity(0.85 * Math.max(0.35, fresh))
      note(labels, -R * 0.71, R * 0.71, `PLS → ${con.name} ${con.rate} · pilots`, -1, 0.035)
      labels.intensity(0.85)
      if (con.radii.length > 1) note(labels, R * con.radii[0] * 0.71, R * con.radii[0] * 0.71, `γ = R_2 / R_1 = 2.70`, 1, 0.035)
    }
    if (Math.abs(slip) > 0.6 && t > 3) note(labels, 0, -R * 1.05, 'cycle slip', -1, 0.04)
    text(labels, `${RS} Bd   α = 0.20`, A * 0.92, -0.92, 0.035, 1)
    f.ch.push({ w: 0.35, gain: 0.7, path: labels })

    f.look = { tau: 0.1 }
    return (tt, o) => (signal(tt, slip), (o.l = 0.6 * sig.i), (o.r = 0.6 * sig.q))
  },
}

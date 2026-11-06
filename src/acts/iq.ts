// Carrier acquisition in X-Y: noise, a spinning carrier, the loop locks, and the modcod climbs to 32APSK.
// The beam traces the real pulse-shaped I/Q trajectory, z-strobed on the symbol clock like a vector scope.
import { Path } from '../beam/path'
import { text } from '../beam/font'
import { APSK16, APSK32, PSK8, QPSK, SPAN, rc, symbol, type Constellation } from '../dsp/dvbs2'
import { header } from './header'
import { TAU, mix, noise, smooth, view, type Scene } from './scene'

export const RS = 1200 // symbols per second: slow enough to hear the modem
const R = 0.64
const STAGES: [number, Constellation][] = [[0, QPSK], [8.5, PSK8], [11, APSK16], [15.5, APSK32]]
const MORPH = 0.8
const DF = 23 // Hz of carrier offset at acquisition
const PLL = 0.9 // seconds: how fast the loop pulls it in

const stage = (t: number) => {
  let s = 0
  while (s + 1 < STAGES.length && t >= STAGES[s + 1][0]) s++
  return s
}

// The symbol sent at index k, morphing between modcods as the stages change. Cached by k.
const CK = new Float64Array(256).fill(NaN), CI = new Float64Array(256), CQ = new Float64Array(256)
function point(k: number) {
  const j = k & 255
  if (CK[j] === k) return j
  const tk = k / RS, s = stage(tk), b = STAGES[s][1], a = STAGES[Math.max(0, s - 1)][1]
  const m = s ? smooth(0, MORPH, tk - STAGES[s][0]) : 1
  const ia = 2 * symbol(k, a.bits), ib = 2 * symbol(k, b.bits)
  CK[j] = k
  CI[j] = mix(a.pts[ia], b.pts[ib], m)
  CQ[j] = mix(a.pts[ia + 1], b.pts[ib + 1], m)
  return j
}

const sigma = (t: number) => mix(0.42, 0.03, smooth(1.5, 7, t))
const offset = (t: number) => (t < 2 ? DF : DF * Math.exp(-(t - 2) / PLL))
const phase = (t: number) => (t < 2 ? 0 : TAU * DF * PLL * (1 - Math.exp(-(t - 2) / PLL)))

// Received baseband at scene time t: Σ a_k g(t − kT), rotated by the residual carrier, plus noise.
export const sig = { i: 0, q: 0, strobe: 0 }
export function signal(t: number) {
  const x = t * RS, k0 = Math.floor(x)
  let I = 0, Q = 0
  for (let k = k0 - SPAN + 1; k <= k0 + SPAN; k++) {
    const j = point(k), g = rc(x - k)
    I += CI[j] * g, Q += CQ[j] * g
  }
  const amp = smooth(2, 3, t), ph = phase(t), c = Math.cos(ph), s = Math.sin(ph), n = sigma(t)
  const d = Math.abs(x - Math.round(x))
  sig.i = amp * (I * c - Q * s) + n * noise(5 * x + 17.3)
  sig.q = amp * (I * s + Q * c) + n * noise(5 * x + 911.7)
  sig.strobe = Math.exp(-((d / 0.035) ** 2))
}

const label = new Path()
const grid = new Path()

function rings(p: Path, radii: number[], dashes = 48) {
  for (const r of radii)
    for (let i = 0; i < dashes; i++) {
      const a = (i / dashes) * TAU, b = ((i + 0.5) / dashes) * TAU
      p.moveTo(R * r * Math.cos(a), R * r * Math.sin(a)).lineTo(R * r * Math.cos(b), R * r * Math.sin(b))
    }
}

export const iqScene: Scene = {
  dur: 18,
  fade: 0.8,
  build(t, f) {
    const A = view.a * 0.92, s = stage(t), con = STAGES[s][1], locked = t > 2 && offset(t) < 0.05
    const settle = s ? smooth(0, MORPH, t - STAGES[s][0]) : 1

    f.ch.push({
      w: 1,
      fn: (tt, o) => {
        signal(tt)
        o.x = R * sig.i
        o.y = R * sig.q
        o.z = 0.15 + 9 * sig.strobe
      },
    })

    grid.clear().intensity(0.3)
    grid.moveTo(-1.3 * R, 0).lineTo(1.3 * R, 0).moveTo(0, -1.3 * R).lineTo(0, 1.3 * R)
    text(grid, 'I', 1.34 * R, -0.02, 0.04)
    text(grid, 'Q', 0.03, 1.3 * R, 0.04)
    grid.intensity(0.3 * settle * smooth(5, 6, t))
    if (con.radii.length > 1) rings(grid, con.radii)
    f.ch.push({ w: 0.25, gain: 0.6, path: grid.reveal(smooth(0.2, 1.4, t)) })

    const esn0 = 10 * Math.log10(1 / (2 * sigma(t) ** 2))
    const shape =
      con === APSK16 ? 'γ = R_2 / R_1 = 2.70' : con === APSK32 ? 'γ_1 = 2.53    γ_2 = 4.30' : `${con.bits} bits / symbol`
    label.clear()
    header(label)
    text(label, t < 2 ? 'searching' : `${con.name}  ${con.rate}`, -A, -0.63, 0.06)
    text(label, shape, -A, -0.76, 0.05)
    text(label, 's(t) = Σ a_k g(t - kT)    α = 0.20', -A, -0.89, 0.05)
    text(label, `E_s/N_0  ${esn0.toFixed(1)} dB`, A, -0.63, 0.05, 1)
    text(label, `Δf  ${offset(t).toFixed(2)} Hz`, A, -0.76, 0.05, 1)
    text(label, `R_s  ${RS} Bd   ${locked ? 'LOCK' : t < 2 ? 'SEARCH' : 'PULL-IN'}`, A, -0.89, 0.05, 1)
    f.ch.push({ w: 0.35, gain: 0.7, path: label })
    f.look = { tau: 0.25 }
    return (tt, o) => (signal(tt), (o.l = 0.6 * sig.i), (o.r = 0.6 * sig.q))
  },
}

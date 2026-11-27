// Ephemeris-1 under the GPS constellation, the board stood where places.ts puts it. Every satellite in view is heard,
// and the one the board is searching for louder.
//
// The sky. The Walker 24/6/1 shell planet.ts draws, PRN 1 to 24 in slot order, seen from the board over a 5° mask:
// each satellite's range, and its Doppler −ṙ/c · L1 (the shell goes round 343× fast here; the rates are scaled back to
// real ones).
// The search. Only its pace is kept: one satellite in view at a time, its Doppler bins swept three a frame while the
// eye is near, then held; which one it is goes to the sound.
import { TAU } from '../../acts/scene'
import { L1 } from '../../dsp/gps'
import { ctx, site, type V } from '../ctx'
import { PLACES } from '../places'
import { C, DEG, RE, orbit } from './sky'

const RATE = 0.05, SHELL = 4.17, INC = 55 * DEG // the shell, as planet.ts draws it
const LAPSE = RATE / (TAU / 43082) // real seconds a scene second: a GPS orbit is half a sidereal day
const MASK = Math.sin(5 * DEG) // elevation mask
const ROWS = 41, SWEEP = 3, HOLD = 0.8 // Doppler ±5 kHz in 250 Hz bins; bins a frame; seconds a found peak is held

// ---- the sky, each frame ----------------------------------------------------------------------------------------
const n: V = [0, 0, 0], rx: V = [0, 0, 0], S: V = [0, 0, 0], v: V = [0, 0, 0]
const range = new Float64Array(24), doppler = new Float64Array(24), seenUp = new Uint8Array(24)
function sky(t: number) {
  for (let i = 0; i < 24; i++) {
    const raan = ((i >> 2) * TAU) / 6, u = ((i & 3) * TAU) / 4 + ((i >> 2) * TAU) / 24 + RATE * t
    orbit(SHELL, raan, INC, u, S), orbit(SHELL * RATE, raan, INC, u + Math.PI / 2, v)
    const dx = S[0] - rx[0], dy = S[1] - rx[1], dz = S[2] - rx[2], r = Math.hypot(dx, dy, dz)
    range[i] = r
    seenUp[i] = +((dx * n[0] + dy * n[1] + dz * n[2]) / r > MASK)
    doppler[i] = ((-(v[0] * dx + v[1] * dy + v[2] * dz) / r) * RE) / LAPSE / C * L1
  }
}

// ---- the search ---------------------------------------------------------------------------------------------------
let cur = -1, row = ROWS, hold = 0
function search(dt: number) {
  if (row >= ROWS) {
    if ((hold -= dt) > 0) return
    // the next satellite in view
    let k = cur
    do k = (k + 1) % 24
    while (!seenUp[k] && k !== cur)
    if (!seenUp[k]) return
    cur = k, row = 0, hold = HOLD
  }
  row = Math.min(ROWS, row + SWEEP)
}

let ready = false
export function draw(k: number) {
  if (!ready) {
    site(PLACES[k].lat, PLACES[k].lon, n)
    for (let i = 0; i < 3; i++) rx[i] = n[i] * 1.012
    ready = true
  }
  sky(ctx.t)
  if (Math.hypot(rx[0] - ctx.E[0], rx[1] - ctx.E[1], rx[2] - ctx.E[2]) < 0.9) search(ctx.dt)
}

// What it sounds like: every satellite in view as its carrier is once its code is wiped off, a pure tone, a chord of
// them. Each PRN has its own note of the pentatonic over 330 Hz (1320 Hz, the receiver's tone, two octaves down), and
// its Doppler bends it by up to a quarter tone, so each rises sharp and sets flat across its pass and the chord beats
// slowly against itself; each as loud as 1/ρ, coming in as it clears the mask. The one being searched for sings out,
// as its ray does.
// Each is a phasor turned a step a sample (x + iy times e^{iω}); its level and step are set every 64th sample.
const PENTA = [0, 2, 4, 7, 9], amp = new Float64Array(24), px = new Float64Array(24).fill(1), py = new Float64Array(24)
const NOTE = Float64Array.from({ length: 24 }, (_, i) => 330 * 2 ** ((PENTA[i % 5] + 12 * (Math.floor(i / 5) % 3)) / 12))
const rc = new Float64Array(24), rs = new Float64Array(24), live = new Int32Array(24)
let nl = 0, due = 0
export function voice(_t: number, dt: number) {
  if (--due < 0) {
    due = 63
    nl = 0
    for (let i = 0; i < 24; i++) {
      const a = (amp[i] += 0.0064 * ((seenUp[i] ? ((SHELL - 1) / range[i]) * (i === cur ? 1 : 0.35) : 0) - amp[i]))
      if (a < 1e-3) continue
      const w = TAU * dt * NOTE[i] * 2 ** (doppler[i] / 4500 / 24), n = 1 / Math.hypot(px[i], py[i])
      ;(rc[i] = Math.cos(w)), (rs[i] = Math.sin(w)), (px[i] *= n), (py[i] *= n), (live[nl++] = i)
    }
  }
  let out = 0
  for (let k = 0; k < nl; k++) {
    const i = live[k], x = px[i]
    px[i] = rc[i] * x - rs[i] * py[i]
    out += amp[i] * (py[i] = rs[i] * x + rc[i] * py[i])
  }
  return 0.2 * out
}

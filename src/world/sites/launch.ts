// Pigeon Vision flies: a rocket leaves the pad every three quarters of a minute, and its video comes down.
//
// The flight. A 6 in airframe off a 17 ft rail at 84°, thrust along its velocity, drag ½ρv²C_dA in an exponential
// atmosphere, integrated once: the motor's thrust is solved so the apogee is the target, 10 000 ft. A drogue at
// apogee, the main at 300 m. The climb plays in real time; the descent, two and a half minutes of it, in fourteen
// seconds. Heights are 1:6100 of a radius a metre (apogee half a radius up) and the rocket, like every landmark here,
// far larger than that. What flies is its camera section, River's own CAD, pointing the way it goes.
// The downlink. DVB-S2, QPSK at 8 Msym/s on 1.28 GHz, from the camera section to an antenna by the pad; its range rate
// along that line is the Doppler the sound hears.
import { TAU, clamp } from '../../acts/scene'
import { Plucks } from '../../dsp/pluck'
import { symbol } from '../../dsp/dvbs2'
import { ctx, cross, dot, frame, len, site, solid, unit, type V } from '../ctx'
import { PLACES } from '../places'
import { C, DEG } from './sky'

// ---- the flight, integrated once -----------------------------------------------------------------------------
const G = 9.80665, DIA = 0.1524, AREA = (Math.PI * DIA * DIA) / 4, CD = 0.5, RHO = 1.225, SCALE_H = 8500
const M0 = 23, FUEL = 4.2, BURN = 3.6, RAIL = 5.2, ELEV = 84 * DEG // kg, kg, s, m: assumed until River says
const APOGEE = 3048, DROGUE = 28, MAIN = 6, MAIN_AT = 300 // m; descent rates, m/s; where the main opens, m
const DT = 0.02, FX = new Float32Array(16384), FZ = new Float32Array(16384), VX = new Float32Array(16384), VZ = new Float32Array(16384)
let STEPS = 0, T_AP = 0
const push = (t: number, thrust: number) => thrust * clamp((BURN - t) / 0.25)
// Flies it with a motor of that thrust; returns the apogee. keep: write the flight down.
function fly(thrust: number, keep: boolean) {
  let x = 0, z = 0, vx = 0, vz = 0, top = 0, down = false
  const cx = Math.cos(ELEV), cz = Math.sin(ELEV)
  for (let i = 0; i < 16384; i++) {
    const t = i * DT
    if (keep) (FX[i] = x), (FZ[i] = z), (VX[i] = vx), (VZ[i] = vz), (STEPS = i + 1)
    for (let j = 0; j < 4; j++) {
      const ts = t + (j * DT) / 4, v = Math.hypot(vx, vz), m = M0 - FUEL * clamp(ts / BURN), F = push(ts, thrust)
      const onRail = Math.hypot(x, z) < RAIL && !down, ux = onRail || v < 1 ? cx : vx / v, uz = onRail || v < 1 ? cz : vz / v
      // drag: the airframe's on the way up, a canopy's on the way down, sized by the speed it settles at
      const k = down ? G / (z > MAIN_AT ? DROGUE : MAIN) ** 2 : (0.5 * RHO * Math.exp(-z / SCALE_H) * CD * AREA) / m
      const ax = (F / m) * ux - k * v * vx, az = (F / m) * uz - k * v * vz - G
      vx += (ax * DT) / 4, vz += (onRail && az < 0 ? 0 : az * DT) / 4
      x += (vx * DT) / 4, z += (vz * DT) / 4
      if (!down && vz < 0 && ts > 1) (down = true), (top = z), keep && (T_AP = ts)
    }
    if (down && z <= 0) break
  }
  return top
}
let THRUST = 2000
for (let lo = 500, hi = 8000, i = 0; i < 40; i++) fly((THRUST = (lo + hi) / 2), false) > APOGEE ? (hi = THRUST) : (lo = THRUST)
fly(THRUST, true)
const T_LAND = (STEPS - 1) * DT
const PAD = 5, FALL = 14, REST = 3, CYCLE = PAD + T_AP + FALL + REST // scene seconds: on the pad, the climb, the descent, on the ground
// flight time ts at scene time s into a cycle
const flightTime = (s: number) => (s < PAD ? 0 : s < PAD + T_AP ? s - PAD : Math.min(T_LAND, T_AP + ((s - PAD - T_AP) * (T_LAND - T_AP)) / FALL))
const state = { x: 0, z: 0, vx: 0, vz: 0 }
function fetch(ts: number) {
  const f = clamp(ts / DT, 0, STEPS - 1.001), i = Math.floor(f), g = f - i
  state.x = FX[i] + (FX[i + 1] - FX[i]) * g, state.z = FZ[i] + (FZ[i + 1] - FZ[i]) * g
  state.vx = VX[i] + (VX[i + 1] - VX[i]) * g, state.vz = VZ[i] + (VZ[i + 1] - VZ[i]) * g
}

// ---- the link ------------------------------------------------------------------------------------------------
const RS = 8e6, FREQ = 1.28e9, SYM = C / RS // sym/s, Hz; a symbol, m
const FLOW = 5 // symbols a second, slowed to be heard

// ---- the place -----------------------------------------------------------------------------------------------
const SC = 0.5 / APOGEE // radii a metre, for heights and ranges
const LEN = 0.05, LROCK = 3, RB = (LEN * DIA) / 2 / LROCK // the airframe: its length in radii and (assumed) metres; its radius
const SECTION = 0.3 // the camera section's place, from the nose, as a share of the airframe
const pn: V = [0, 0, 0], pe: V = [0, 0, 0], pN: V = [0, 0, 0], foot: V = [0, 0, 0], ant: V = [0, 0, 0]
const R: V = [0, 0, 0], a: V = [0, 0, 1], u: V = [0, 0, 0], w: V = [0, 0, 0], d: V = [0, 0, 0], q: V = [0, 0, 0], sec: V = [0, 0, 0]
let ready = false, clk = 0, was = -2, roll = 0

function init() {
  const P = PLACES.find((P) => P.id === 'launch')!, s = site(P.lat, P.lon), e: V = [0, 0, 0], N: V = [0, 0, 0], g: V = [0, 0, 0]
  frame(s, e, N)
  for (let i = 0; i < 3; i++) (pn[i] = s[i] - 0.05 * e[i] + 0.03 * N[i]), (g[i] = s[i] + 0.035 * e[i] - 0.045 * N[i])
  unit(pn), unit(g), frame(pn, pe, pN)
  for (let i = 0; i < 3; i++) (foot[i] = pn[i] * 1.003), (ant[i] = g[i] * 1.016)
  ready = true
}
// flight coordinates (downrange, up; metres) into the world
const world = (x: number, z: number, o: V) => {
  for (let i = 0; i < 3; i++) o[i] = foot[i] + (pe[i] * x + pn[i] * z) * SC
  return o
}
// Where the rocket is: what a camera that rides with it looks at.
export function where(o: V) {
  if (!ready) init(), world(0, 0, R)
  for (let i = 0; i < 3; i++) o[i] = R[i] + a[i] * LEN * 0.5
  return o
}

export function draw(k: number) {
  if (!ready) init()
  const here = ctx.focus === k
  if (here && was !== k) clk = PAD - 2.5 // it goes as we arrive, the flight here over
  was = ctx.focus, clk += ctx.dt
  const s = clk % CYCLE, ts = flightTime(s), flying = s > PAD && ts < T_LAND, burning = flying && ts < BURN, chute = ts > T_AP && flying
  fetch(ts), world(state.x, state.z, R)
  // the airframe points the way it flies; on the rail, along it; under a canopy it hangs, swinging; landed, it lies
  const v = Math.hypot(state.vx, state.vz)
  let tx = Math.cos(ELEV), tz = Math.sin(ELEV)
  if (chute) (tx = 0.12 * Math.sin(2.1 * clk)), (tz = 1)
  else if (flying && v > 1) (tx = state.vx / v), (tz = state.vz / v)
  else if (s > PAD) (tx = 1), (tz = 0.03)
  const fol = flying ? 1 - Math.exp(-ctx.dt * 5) : 1
  for (let i = 0; i < 3; i++) a[i] += (pe[i] * tx + pn[i] * tz - a[i]) * fol
  unit(a)
  if (flying && !chute) roll += 0.9 * ctx.dt // it rolls a little, as they do
  cross(a, pN, q) // pN and q: across the airframe, which stays in the plane it flies in
  for (let i = 0; i < 3; i++) u[i] = Math.cos(roll) * pN[i] + Math.sin(roll) * q[i]
  cross(a, u, w)

  // River's camera section in its place in the airframe, aglow while the motor burns
  for (let i = 0; i < 3; i++) sec[i] = R[i] + a[i] * LEN * (1 - SECTION)
  solid('pigeon-tube', sec, u, w, a, 2 * RB, 1, burning ? 0.3 : 0)

  // the way down to the antenna, for the downlink's Doppler
  for (let i = 0; i < 3; i++) d[i] = ant[i] - sec[i]
  const rho = Math.max(len(d) / SC, SYM)
  for (let i = 0; i < 3; i++) d[i] /= rho * SC
}

// What it sounds like, from beside the airframe. The motor, as loud as it pushes: a low A and the rumble under it.
// The air going by, a soft rush as loud as its dynamic pressure ½ρv²: all there is after burnout, dying away to
// nothing at apogee. And the downlink: its QPSK symbols at the pace the beam draws them, each of the four a note of A major
// over A4 (the receiver's BFO, 1760 Hz, two octaves down), all of them bent by a quarter of the Doppler −v_r f/c as
// a receiver beside the pad hears it: flat as it leaves, back in tune at apogee, a little sharp coming home under
// the canopy.
const BFO = 1760, QMAX = 56_700, EVERY = 64, CHORD = [0, 7, 12, 16] // Hz; the most ½ρv² gets, Pa; the flight is looked up every 64th sample
const downlink = new Plucks(48000, 0.33)
let burn = 0, roar = 0, wind = 0, fd = 0, due = 0, sent = NaN, ph = 0, low = 0, mid = 0, high = 0
export function voice(t: number, dt: number) {
  if (--due < 0) {
    const c = clk + t - ctx.t, s = ((c % CYCLE) + CYCLE) % CYCLE, ts = flightTime(s), up = s > PAD && ts < T_LAND, j = Math.floor(FLOW * c)
    fetch(ts)
    burn = up && ts < BURN ? push(ts, 1) : 0
    wind = up ? (0.5 * RHO * Math.exp(-state.z / SCALE_H) * (state.vx ** 2 + state.vz ** 2)) / QMAX : 0
    fd = up ? ((state.vx * dot(d, pe) + state.vz * dot(d, pn)) / C) * FREQ : 0
    if (j !== sent) (sent = j), downlink.strike(440 * (1 + fd / (4 * BFO)) * 2 ** (CHORD[symbol(j, 2)] / 12), 0.22, 0, 0.9, 1.6)
    due = EVERY - 1
  }
  roar += 2e-4 * (burn - roar)
  ph += 55 * dt, ph -= Math.floor(ph)
  const n = 2 * Math.random() - 1
  low += 0.004 * (n - low), mid += 0.06 * (n - mid), high += 0.25 * (n - high)
  return downlink.mono() + roar * (0.4 * Math.sin(TAU * ph) + 8 * low) + 0.6 * wind * (mid - low)
}

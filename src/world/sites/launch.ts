// Pigeon Vision flies: a rocket leaves the pad every three quarters of a minute, and its video comes down.
//
// The flight. A 6 in airframe off a 17 ft rail at 84°, thrust along its velocity, drag ½ρv²C_dA in an exponential
// atmosphere, integrated once: the motor's thrust is solved so the apogee is the target, 10 000 ft. A drogue at
// apogee, the main at 300 m. The climb plays in real time; the descent, two and a half minutes of it, in fourteen
// seconds. Heights are drawn at 1:6100 of a radius a metre (apogee half a radius up) and the rocket, like every
// landmark here, far larger than that; its camera section is River's own CAD, the rest of the airframe the beam's.
// The downlink. DVB-S2, QPSK at 8 Msym/s, 0.5 W at 1.28 GHz. A symbol is c/R_s = 37.5 m long in the air, so the beam
// draws the symbols in flight between the rocket and the antenna at their true length: the baseband as a curve, I
// one way across the path and Q the other, each symbol a raised-cosine pulse (dsp/dvbs2.ts), run slow enough to
// watch. Its light falls as the field does, 1/r. Where it lands it is sampled once a symbol, with the noise the
// range leaves it: P_r = P_t (λ/4πR)², isotropic antennas, against kT·R_s at 290 K.
// The cameras. Two 200° fisheyes look out opposite sides of the camera section at 30 frames a second. While the
// camera is here, each frame of each is drawn: the planet's graticule, limb, sun and the rocket's own path through
// an equidistant fisheye, r = fθ.
import { equation } from '../../acts/reality'
import { TAU, clamp, hash, view } from '../../acts/scene'
import { Path } from '../../beam/path'
import { QPSK, rc, symbol } from '../../dsp/dvbs2'
import { pigeon } from '../copper'
import { ctx, cross, dot, frame, len, site, solid, unit, type V } from '../ctx'
import { PLACES } from '../places'
import { C, DEG, at, numbers, to, up } from './sky'

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
const RS = 8e6, FREQ = 1.28e9, PT = 0.5, LAMBDA = C / FREQ, SYM = C / RS // sym/s, Hz, W; a wavelength and a symbol, m
const KT = 1.380649e-23 * 290, NEED = 3.1 // W/Hz; Es/N0 QPSK 2/3 needs, dB (EN 302 307-1, table 13)
const FLOW = 5, SPS = 6 // symbols a second the picture of them runs at; points a symbol

// ---- the place -----------------------------------------------------------------------------------------------
const SC = 0.5 / APOGEE // radii a metre, for heights and ranges
const LEN = 0.05, LROCK = 3, RB = (LEN * DIA) / 2 / LROCK // the airframe: its length in radii and (assumed) metres; its radius
const SECTION = 0.3 // the camera section's place, from the nose, as a share of the airframe
const pn: V = [0, 0, 0], pe: V = [0, 0, 0], pN: V = [0, 0, 0], gn: V = [0, 0, 0], foot: V = [0, 0, 0], ant: V = [0, 0, 0]
const R: V = [0, 0, 0], a: V = [0, 0, 1], u: V = [0, 0, 0], w: V = [0, 0, 0], d: V = [0, 0, 0], lu: V = [0, 0, 0], lv: V = [0, 0, 0], q: V = [0, 0, 0], sec: V = [0, 0, 0]
let ready = false, clk = 0, was = -2, roll = 0, cut = false, INK: readonly number[] = [1, 0.7, 0.35]
const body = new Path(), path = new Path(), link = new Path(), eyes = new Path()
const si = new Float64Array(128), sq = new Float64Array(128), vals = [0, 0, 0, 0, 0]
// the graticule, every 10°, as unit vectors; a line ends where its flag is set
const GRAT: number[] = [], ENDS: number[] = []
for (let lon = 0; lon < 360; lon += 10) for (let lat = -90; lat <= 90; lat += 3) GRAT.push(...site(lat, lon)), ENDS.push(+(lat === 90))
for (let lat = -80; lat <= 80; lat += 10) for (let lon = 0; lon <= 360; lon += 3) GRAT.push(...site(lat, lon)), ENDS.push(+(lon === 360))

function init() {
  const P = PLACES.find((P) => P.id === 'launch')!, s = site(P.lat, P.lon), e: V = [0, 0, 0], N: V = [0, 0, 0]
  frame(s, e, N), (INK = P.ink)
  for (let i = 0; i < 3; i++) (pn[i] = s[i] - 0.05 * e[i] + 0.03 * N[i]), (gn[i] = s[i] + 0.035 * e[i] - 0.045 * N[i])
  unit(pn), unit(gn), frame(pn, pe, pN)
  for (let i = 0; i < 3; i++) (foot[i] = pn[i] * 1.003), (ant[i] = gn[i] * 1.016)
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
// The intro's cut to it: from the pad's side, low, the rocket leaving past the lens.
export function shot(_k: number, tc: number, pose: { eye: V; at: V; up: V }) {
  if (!ready) init()
  if (tc < 0.05 && !cut) clk = PAD - 0.1 // the cut is the launch
  cut = true
  for (let i = 0; i < 3; i++) {
    pose.up[i] = pn[i]
    pose.at[i] = foot[i] + pn[i] * (0.03 + 0.012 * tc)
    pose.eye[i] = foot[i] + 0.085 * pN[i] + 0.06 * pe[i] + pn[i] * 0.012
  }
}

// One fisheye's frame: what looks out along f (up along the airframe) from c, drawn in a circle at (cx, cy).
const RIN = 0.19, FOV = 100 * DEG, ca: V = [0, 0, 0], cb: V = [0, 0, 0], cr: V = [0, 0, 0], g3: V = [0, 0, 0], XX = [1, 0, 0], YY = [0, 1, 0]
let pen = false
function lens(x: number, y: number, z: number, f: V, cx: number, cy: number, drawn = true) {
  const l = Math.hypot(x, y, z), th = Math.acos(clamp((x * f[0] + y * f[1] + z * f[2]) / l, -1, 1))
  if (th > FOV || !drawn) return (pen = false)
  const rx = x * cr[0] + y * cr[1] + z * cr[2], ry = x * a[0] + y * a[1] + z * a[2], k = ((th / FOV) * RIN) / (Math.hypot(rx, ry) || 1)
  if (pen) eyes.lineTo(cx + rx * k, cy + ry * k)
  else eyes.moveTo(cx + rx * k, cy + ry * k)
  return (pen = true)
}
function fisheye(c: V, f: V, cx: number, cy: number, ts: number) {
  cross(f, a, cr)
  eyes.color(INK[0], INK[1], INK[2], 0.5).circle(cx, cy, RIN, 64)
  const r = len(c)
  // the ground: what of the graticule is this side of the limb
  eyes.color(0.55, 0.8, 1, 0.5), (pen = false)
  for (let i = 0; i < ENDS.length; i++) {
    const x = GRAT[3 * i], y = GRAT[3 * i + 1], z = GRAT[3 * i + 2]
    lens(x - c[0], y - c[1], z - c[2], f, cx, cy, x * c[0] + y * c[1] + z * c[2] > 1)
    if (ENDS[i]) pen = false
  }
  // the limb: where a ray from here grazes the planet
  const cosb = 1 / r, sinb = Math.sqrt(Math.max(0, 1 - cosb * cosb))
  unit(cross(c, Math.abs(c[1]) < 0.9 * r ? YY : XX, ca)), unit(cross(c, ca, cb))
  eyes.color(1, 1, 1, 0.9), (pen = false)
  for (let i = 0; i <= 72; i++) {
    const al = (i * TAU) / 72, k = cosb / r
    lens(c[0] * k + sinb * (Math.cos(al) * ca[0] + Math.sin(al) * cb[0]) - c[0], c[1] * k + sinb * (Math.cos(al) * ca[1] + Math.sin(al) * cb[1]) - c[1], c[2] * k + sinb * (Math.cos(al) * ca[2] + Math.sin(al) * cb[2]) - c[2], f, cx, cy)
  }
  // the sun, if the planet is not in front of it
  const L = ctx.L, sl = dot(L, c) / r
  if (sl > -sinb && (pen = false, lens(L[0], L[1], L[2], f, cx, cy))) eyes.color(1, 0.95, 0.8, 1).circle(eyes.tip()[0], eyes.tip()[1], 0.008, 12)
  // the way it came
  eyes.color(INK[0], INK[1], INK[2], 0.9), (pen = false)
  for (let i = 0; i <= 40; i++) {
    const j = Math.floor(((ts / DT) * i) / 41)
    world(FX[j], FZ[j], g3), lens(g3[0] - c[0], g3[1] - c[1], g3[2] - c[2], f, cx, cy)
  }
}

const h01 = (x: number) => 0.5 + 0.5 * hash(x)
const rad = (h: number) => RB * (h > 0.82 ? Math.max(0, 1 - ((h - 0.82) / 0.18) ** 2) ** 0.6 : 1) // h up the airframe: tube, then ogive
let frameNo = -1
export function draw(k: number) {
  if (!ready) init()
  const here = ctx.focus === k
  pigeon(here) // the transport stream on the carrier's copper and the S3's
  if (here && was !== k && !cut) clk = PAD - 2.5 // it goes as we arrive, the flight here over
  was = ctx.focus, cut = false, clk += ctx.dt
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

  // River's camera section in its place, and the rest of the airframe around it
  for (let i = 0; i < 3; i++) sec[i] = R[i] + a[i] * LEN * (1 - SECTION)
  solid('pigeon-tube', sec, u, w, a, 2 * RB, 1, burning ? 0.3 : 0)
  body.clear().color(1, 0.96, 0.88, 0.9)
  for (let j = 0; j < 6; j++) {
    const c = Math.cos((j * TAU) / 6), sn = Math.sin((j * TAU) / 6)
    up()
    for (let i = 0; i <= 14; i++) {
      const h = i < 8 ? (i / 8) * 0.82 : 0.82 + ((i - 8) / 6) * 0.18, r = rad(h)
      at(body, R, a, h * LEN, u, r * c, w, r * sn)
    }
  }
  for (const h of [0, 1 - SECTION - RB / LEN, 1 - SECTION + RB / LEN, 0.82]) {
    up()
    for (let i = 0; i <= 16; i++) at(body, R, a, h * LEN, u, RB * Math.cos((i * TAU) / 16), w, RB * Math.sin((i * TAU) / 16))
  }
  for (let j = 0; j < 4; j++) {
    const c = Math.cos((j * TAU) / 4), sn = Math.sin((j * TAU) / 4)
    up(), at(body, R, a, 0.14 * LEN, u, RB * c, w, RB * sn), at(body, R, a, 0.06 * LEN, u, 3.6 * RB * c, w, 3.6 * RB * sn)
    at(body, R, a, 0, u, 3.6 * RB * c, w, 3.6 * RB * sn), at(body, R, a, 0, u, RB * c, w, RB * sn)
  }
  // the plume: as long as the motor pushes
  if (burning) {
    const F = push(ts, 1)
    for (let j = 0; j < 14; j++) {
      const n1 = h01(j * 7.1 + Math.floor(clk * 60) * 1.3), n2 = h01(j * 3.7 + Math.floor(clk * 60) * 0.7), l = LEN * F * (0.35 + 0.9 * n1), sp = 2.2 * RB * (n2 - 0.5), al = j * 2.4
      body.color(1, 0.55 + 0.4 * n1, 0.2 + 0.5 * n1 * n1, 1.6), up()
      at(body, R, a, 0, u, 0.5 * sp * Math.cos(al), w, 0.5 * sp * Math.sin(al)), at(body, R, a, -l, u, sp * 2.5 * Math.cos(al), w, sp * 2.5 * Math.sin(al))
    }
  }
  // the canopy: a drogue, then the main, on its lines
  if (chute) {
    const big = state.z < MAIN_AT ? 1 : 0.4, hc = LEN * (1.5 + 0.9 * big), rc0 = LEN * 0.5 * big
    body.color(INK[0], INK[1], INK[2], 0.8)
    for (let j = 0; j < 8; j++) {
      const c = Math.cos((j * TAU) / 8), sn = Math.sin((j * TAU) / 8)
      up(), at(body, R, a, LEN, u, 0, w, 0)
      for (let i = 0; i <= 6; i++) {
        const b = (i / 6) * (Math.PI / 2)
        at(body, R, a, hc + rc0 * 0.7 * Math.sin(b), u, rc0 * Math.cos(b) * c, w, rc0 * Math.cos(b) * sn)
      }
    }
  }

  // its path: all of it faintly, what it has flown brightly
  path.clear()
  for (let pass = 0; pass < 2; pass++) {
    const end = pass ? ts : T_LAND
    if (end <= 0) continue
    path.color(INK[0], INK[1], INK[2], pass ? 0.9 : 0.14), up()
    for (let i = 0; i <= 90; i++) {
      const j = Math.floor(((end / DT) * i) / 90)
      world(FX[j], FZ[j], q), to(path, q[0], q[1], q[2])
    }
  }

  // the downlink: range, its rate, and what they leave of the signal
  for (let i = 0; i < 3; i++) d[i] = ant[i] - sec[i]
  const rho = Math.max(len(d) / SC, SYM)
  for (let i = 0; i < 3; i++) d[i] /= rho * SC
  unit(cross(d, pn, lu)), cross(d, lu, lv)
  const vr = -(state.vx * dot(d, pe) + state.vz * dot(d, pn)) * (flying ? 1 : 0) // range rate, m/s: away is positive
  const pr = PT * (LAMBDA / (4 * Math.PI * rho)) ** 2, esn0 = pr / (KT * RS), sigma = Math.sqrt(0.5 / esn0)
  link.clear()
  const RAD = 0.008, ph = FLOW * clk, n = Math.min(900, Math.ceil((rho / SYM) * SPS)), k0 = Math.floor(ph - rho / SYM) - 6, span = Math.min(128, Math.ceil(rho / SYM) + 12)
  for (let j = 0; j < span; j++) (si[j] = QPSK.pts[2 * symbol(k0 + j, 2)]), (sq[j] = QPSK.pts[2 * symbol(k0 + j, 2) + 1])
  up()
  for (let i = 0; i <= n; i++) {
    const m = (i / n) * rho, kap = ph - m / SYM, kf = Math.floor(kap)
    let I = 0, Q = 0
    for (let j = kf - 4; j <= kf + 5; j++) {
      const g = rc(kap - j), o = j - k0
      if (o >= 0 && o < span) (I += si[o] * g), (Q += sq[o] * g)
    }
    const grow = RAD * Math.min(1, m / SYM)
    link.color(INK[0], INK[1], INK[2], Math.max(0.2, 150 / (m + 150)) * 1.1)
    at(link, sec, d, m * SC, lu, I * grow, lv, Q * grow)
  }
  // the antenna: its mast, the unit circle, and each symbol as it lands, with its noise
  link.color(INK[0], INK[1], INK[2], 0.5), up(), to(link, gn[0], gn[1], gn[2]), to(link, ant[0], ant[1], ant[2])
  up()
  for (let i = 0; i <= 32; i++) at(link, ant, d, 0, lu, RAD * Math.cos((i * TAU) / 32), lv, RAD * Math.sin((i * TAU) / 32))
  link.color(1, 1, 1, 1)
  for (let j = 0, kl = Math.floor(ph - rho / SYM); j < 40; j++) {
    const o = kl - j - k0
    if (o < 0 || o >= span) continue
    const g1 = Math.sqrt(-2 * Math.log(1 - 0.999 * h01(kl - j + 0.5))) * sigma, g2 = TAU * h01((kl - j) * 1.37 + 9)
    up()
    if (at(link, ant, d, 0, lu, RAD * (si[o] + g1 * Math.cos(g2)), lv, RAD * (sq[o] + g1 * Math.sin(g2)))) link.lineTo(link.tip()[0], link.tip()[1], 0.004 * (1 - j / 40))
  }
  ctx.f.ch.push({ w: 0.2, path: body }, { w: 0.1, path: path }, { w: 0.5, path: link })

  if (!here) return
  vals[0] = 10 * Math.log10(pr * 1e3), vals[1] = 10 * Math.log10(esn0) - NEED, vals[2] = (-vr / C) * FREQ, vals[3] = state.z, vals[4] = rho
  equation(ctx.f, 'P_r=P_t(\\frac{\\lambda}{4\\pi R})^2=\\num{0}{-00.0}\\,dBm\\qquad\\frac{E_s}{N_0}-3.1=\\num{1}{00.0}\\,dB', INK, 0.9, vals)
  numbers('f_D=-\\frac{v_r}{c}f=\\num{2}{-0000}\\,Hz\\qquad R=\\num{4}{0000}\\,m\\qquad h=\\num{3}{0000}\\,m', INK, vals)
  // the two cameras, a frame every thirtieth of a second
  if (Math.floor(clk * 30) !== frameNo) {
    frameNo = Math.floor(clk * 30)
    eyes.clear()
    fisheye(sec, u, -view.a + 0.27, 0.4, ts) // down the left edge, clear of the page and the index
    for (let i = 0; i < 3; i++) lu[i] = -u[i]
    fisheye(sec, lu, -view.a + 0.27, 0, ts)
  }
  ctx.f.ch.push({ w: 0.5, path: eyes })
}

// What it sounds like, from beside the airframe. The motor, as loud as it pushes: noise, heavy at the bottom. The
// air going by, as loud as its dynamic pressure ½ρv²: all there is after burnout, dying away to nothing at apogee.
// And the downlink, on a receiver whose oscillator puts the carrier at rest on 1760 Hz, so its Doppler −v_r f/c is
// heard hertz for hertz: 1.3 kHz down as it leaves, back to pitch at apogee, a little sharp coming home under the
// canopy. The symbols on it are its QPSK, at the pace the beam draws them.
const BFO = 1760, QMAX = 56_700, EVERY = 64 // Hz; the most ½ρv² gets, Pa; the flight is looked up every 64th sample
let burn = 0, wind = 0, fd = 0, bi = 0, bq = 0, di = 0, dq = 0, due = 0, cycles = 0, low = 0, mid = 0, high = 0
export function voice(t: number, dt: number) {
  if (--due < 0) {
    const c = clk + t - ctx.t, s = ((c % CYCLE) + CYCLE) % CYCLE, ts = flightTime(s), up = s > PAD && ts < T_LAND
    fetch(ts)
    burn = up && ts < BURN ? push(ts, 1) : 0
    wind = up ? (0.5 * RHO * Math.exp(-state.z / SCALE_H) * (state.vx ** 2 + state.vz ** 2)) / QMAX : 0
    fd = up ? ((state.vx * dot(d, pe) + state.vz * dot(d, pn)) / C) * FREQ : 0
    const x = FLOW * (c + EVERY * dt), k = Math.floor(x)
    let I = 0, Q = 0
    for (let j = k - 4; j <= k + 5; j++) (I += QPSK.pts[2 * symbol(j, 2)] * rc(x - j)), (Q += QPSK.pts[2 * symbol(j, 2) + 1] * rc(x - j))
    di = (I - bi) / EVERY, dq = (Q - bq) / EVERY, due = EVERY - 1
  }
  bi += di, bq += dq, cycles += dt * (BFO + fd), cycles -= Math.floor(cycles)
  const n = 2 * Math.random() - 1
  low += 0.02 * (n - low), mid += 0.06 * (n - mid), high += 0.25 * (n - high)
  return burn * (7 * low + 0.6 * high) + 2.5 * wind * (high - mid) + 0.16 * (bi * Math.cos(TAU * cycles) - bq * Math.sin(TAU * cycles))
}

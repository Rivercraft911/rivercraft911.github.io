// Pigeon Vision flies: a rocket leaves the pad every three quarters of a minute, and its video comes down.
//
// The flight. A 6 in airframe off a 17 ft rail at 84°, thrust along its velocity, drag ½ρv²C_dA in an exponential
// atmosphere, integrated once: the motor's thrust is solved so the apogee is the target, 10 000 ft. A drogue at
// apogee, the main at 300 m. The climb plays in real time; the descent, two and a half minutes of it, in fourteen
// seconds. Heights are 1:6100 of a radius a metre (apogee half a radius up) and the rocket, like every landmark here,
// far larger than that: a tenth of a radius long. Its camera section rides in the middle of the airframe, its two
// fisheyes looking out either side; the camera rides with it.
// The downlink. DVB-S2, QPSK at 8 Msym/s on 1.28 GHz, from the camera section to an antenna by the pad; its range rate
// along that line is the Doppler the sound hears.
//
// Visited, it stands on its rail and comes apart: the nose lifts, the camera section slides out toward the eye, its
// shell parts along the cameras' axis, and what was inside spreads: the two IMX900 cameras out either side, the round
// carrier in the middle with the CM5 on it, and Yapogee S3 on top. Then the eye closes on Yapogee, where the signal runs
// lit along its real traces: the video in over SPI, out of the S3's own radio at 2.42 GHz, through the RFFC5072A with
// its 3.70 GHz LO, out at 1.28 GHz through the filter and driver to the SMA. Then it goes back together and flies, the
// eye riding at one of its fisheyes and looking round as the ground falls away, down under its canopies to land.
// Leaving runs it all back.
import { TAU, clamp, glide, smooth } from '../../acts/scene'
import { Plucks } from '../../dsp/pluck'
import { symbol } from '../../dsp/dvbs2'
import { ctx, cross, dot, frame, len, part, site, solid, turn, unit, type V } from '../ctx'
import { box, dome, face, grid, make, tube } from '../make'
import { PLACES, type About, type Steer } from '../places'
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
let T_MAIN = T_AP // when the main opens, on the way down
while (T_MAIN < T_LAND && FZ[Math.round(T_MAIN / DT)] > MAIN_AT) T_MAIN += DT
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
const FLOW = 5 // symbols a second, slowed to be heard; four of them (two bits each) a byte of the transport stream

// What happens here, for the world's music (sound.ts): n counts the events so far, f is the latest one's pitch (Hz) or 0.
// The motor lights (its own low A) and burns out; apogee, where the downlink's Doppler passes through zero and it is
// in tune (A4); the main opens; it lands. And the link's own beat: each byte the S3 sends, pitched as its first symbol.
export const events = { n: 0, f: 0 }
const happen = (f: number) => ((events.n += 1), (events.f = f))

// ---- the rocket, in metres along its axis from its aft end (the airframe's sections assumed until River says) --------
const RAD = 0.0762, LOWER = 1.95, SECT = 0.1524, UPPER = 0.4476, NOSE = 0.61 // radius; below the camera section, it, above it, the nose
const LONG = LOWER + SECT + UPPER + NOSE, CAMS = LOWER + SECT / 2 // its length; the cameras' plane
const M = 0.1 / LONG, MM = M / 1000 // radii a metre, and a millimetre
// What River has not drawn, in millimetres along +y: the airframe, white with carbon fins (the camera section between
// is River's own CAD, its tube cut in two across the cameras' axis: pigeon-shell); the fisheyes' front glass; the 1515
// rail; the motor's flame; and beads of light for the signal.
const WHITE = { col: [0.8, 0.8, 0.79, 1], metal: 0, rough: 0.3 }, CARBON = { col: [0.025, 0.026, 0.03, 1], metal: 0, rough: 0.3 }
const lathe = (m: typeof WHITE, q: number[][], n = 48) => grid(m, q.length - 1, n, (i, j) => [q[i][0] * Math.cos((TAU * j) / n), q[i][1], q[i][0] * Math.sin((TAU * j) / n)])
const R_ = RAD * 1000, rho = (R_ * R_ + 610 * 610) / (2 * R_) // the tangent ogive's radius
make('pv-upper', () => {
  const body = UPPER * 1000, q = [[R_, 0], [R_, body]]
  for (let k = 1; k <= 24; k++) {
    const x = 610 * Math.cos((k / 24) * (Math.PI / 2)) // from the tip; finer toward it
    q.push([Math.sqrt(Math.max(rho * rho - (610 - x) ** 2, 0)) + R_ - rho, body + 610 - x])
  }
  lathe(WHITE, q), lathe(WHITE, [[0, 0], [R_, 0]])
})
make('pv-lower', () => {
  const top = LOWER * 1000
  lathe(WHITE, [[R_, 0], [R_, top]]), lathe(WHITE, [[0, top], [R_, top]]), lathe(CARBON, [[0, 0], [R_, 0]])
  tube({ col: [0.05, 0.05, 0.055, 1], metal: 0.3, rough: 0.55 }, [0, 0, 0], [0, -1, 0], 34, 26, 28, 32) // the motor's nozzle
  for (let k = 0; k < 4; k++) {
    const f = TAU * (k / 4 + 1 / 8), d = [Math.cos(f), 0, Math.sin(f)], t = [-Math.sin(f), 0, Math.cos(f)]
    const at = (r: number, y: number, s: number): [number, number, number] => [d[0] * r + t[0] * s, y, d[2] * r + t[2] * s]
    const fin = [[R_ - 2, 15], [R_ - 2, 315], [R_ + 150, 115], [R_ + 150, 15]]
    for (const s of [-3, 3]) face(CARBON, fin.map(([r, y]) => at(r, y, s)), [t[0] * Math.sign(s), 0, t[2] * Math.sign(s)])
    for (let e = 1; e < 4; e++) {
      const [a, b] = [fin[e], fin[(e + 1) % 4]], n = [b[1] - a[1], -(b[0] - a[0])], l = Math.hypot(n[0], n[1])
      face(CARBON, [at(a[0], a[1], -3), at(b[0], b[1], -3), at(b[0], b[1], 3), at(a[0], a[1], 3)], [(d[0] * n[0]) / l, n[1] / l, (d[2] * n[0]) / l])
    }
  }
})
make('pv-eye', () => dome({ col: [0.012, 0.015, 0.025, 1], metal: 0, rough: 0.04 }, [0, 0, 0], [1, 0, 0], 6.5))
make('pv-rail', () => {
  box({ col: [0.72, 0.73, 0.75, 1], metal: 1, rough: 0.35 }, [-19, 0, -19], [19, RAIL * 1000, 19])
  box({ col: [0.06, 0.06, 0.065, 1], metal: 0.6, rough: 0.5 }, [-260, -12, -260], [260, 0, 260])
})
make('pv-flame', () => {
  const m = { col: [1, 0.55, 0.2, 1], metal: 0, rough: 1 }
  tube(m, [0, 0, 0], [0, -1, 0], 30, 4, 700, 24), dome(m, [0, 0, 0], [0, 1, 0], 30, 16)
})
// the signal's beads, one for each thing it rides: the video over SPI, 2.42 GHz, the LO's reference, 1.28 GHz
const BEADS = [[0.35, 1, 0.55], [0.3, 0.6, 1], [0.75, 0.45, 1], [1, 0.62, 0.25]]
BEADS.forEach((col, k) => make(`pv-bead${k}`, () => lathe({ col: [...col, 1], metal: 0, rough: 0.4 }, Array.from({ length: 9 }, (_, i) => [Math.sin((i / 8) * Math.PI), -Math.cos((i / 8) * Math.PI)]), 12)))

// ---- where River's boards sit, in millimetres ------------------------------------------------------------------
// The carrier (KiCad: centred on its outline, 144.78 mm round, its cameras' connectors J7 and J8 at its two flats, ±z):
// the CM5 at MP1, its bottom 1.5 mm over the board on its two connectors, turned as the footprint turns Raspberry Pi's
// model (its x along −z); Yapogee S3 on its landing J13, turned half round, castellations on the pads.
const CM5_AT = [13.25, 3.5, -21.875], YAP_AT = [-1.115, 1.6, 34.05]
// The cameras on their cradles, as the camera section's reference assembly has them: the cradle's back 43 mm out, the
// front board 64 mm, the lens's face 85.92 mm; the box's middle 64.46 mm, the lens's face 21.46 mm beyond it. Half the
// tube, cut across their axis: its box's middle 38.1 mm toward its lens port, and halfway up.
const CAM_R = 64.46, LENS = 21.46, HALF = 0.0381
// The signal on Yapogee S3, along its own traces (KiCad, from its outline's centre: x right, z down the page; y up
// off the board): each run a polyline [x, y, z] and the bead it carries from where on (mm along it).
type Run = { p: number[][]; bead: number[]; at: number[]; L: number[] }
const kx = (x: number) => x - 125.3, kz = (y: number) => y - 75.17, on = 1.45 // over the copper
const run = (p: number[][], bead: number[], at = [0]): Run => {
  const L = [0]
  for (let i = 1; i < p.length; i++) L.push(L[i - 1] + Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1], p[i][2] - p[i - 1][2]))
  return { p, bead, at, L }
}
const xz = (pts: number[][], y = on) => pts.map(([x, z, h]) => [kx(x), h ?? y, kz(z)])
const cable: number[][] = [] // the 25 mm U.FL jumper from the S3 module's own connector over to J3, as it arcs
for (let k = 0; k <= 12; k++) {
  const s = k / 12, x = 131.6 + (141.4 - 131.6) * s, z = 63.6 + (74.15 - 63.6) * s
  cable.push([kx(x), 4.4 + 7 * Math.sin(Math.PI * s), kz(z)])
}
const RUNS = [
  // the transport stream in over SPI: D0 and SCLK at the castellations, to the S3
  run(xz([[133.36, 53.9], [133.36, 57], [129, 61], [125.25, 66, 4.2]]), [0]),
  // out of the S3's radio at 2.42 GHz, over the jumper to J3, the balun T1 into the mixer; out of it at 1.28 GHz
  // through the balun T2, the LFCN-1450+ low-pass, the SPF5043Z driver, to the SMA and off the board
  run([...cable, ...xz([[139.9, 74.15], [137.1, 73.65], [136.92, 74.72], [136.25, 75.8], [136.65, 76.85], [137.55, 77.5, 2.2], [137.9, 79.4],
    [138.8, 80.8], [140.3, 83.1, 2.3], [138, 82.6], [136.6, 82.6], [133.65, 83.43], [133.65, 84.4], [133.65, 86.35, 2.2], [134.15, 87.01], [133.38, 87.78],
    [131.52, 88.55], [126.7, 88.55, 2.3], [122.88, 88.7], [121.2, 88.8], [118.45, 88.25, 2.4], [117.62, 87.6], [114, 87.6], [109.87, 87.6], [108.6, 87.75],
    [104, 87.8, 3.1], [92, 87.85, 3.1]])], [1, 3], [0]),
  // the 40 MHz reference, TCXO through its buffer into the mixer's PLL, which makes the 3.70 GHz LO
  run(xz([[146.15, 79.2, 2], [145.64, 81.5], [145.64, 83, 2], [144.69, 85.53], [143.75, 85.72], [143.75, 85.13], [142.97, 84.35], [141.5, 83.6, 2]]), [2]),
]
// the jumper itself, 1.13 mm coax, a U.FL plug at each end, in Yapogee's own millimetres
make('pv-jumper', () => {
  const coax = { col: [0.035, 0.035, 0.04, 1], metal: 0, rough: 0.45 }, gold = { col: [0.85, 0.65, 0.3, 1], metal: 1, rough: 0.3 }
  grid(coax, cable.length - 1, 10, (i, j) => {
    const p = cable[i], n = cable[Math.min(i + 1, cable.length - 1)], b = cable[Math.max(i - 1, 0)]
    const t = unit([n[0] - b[0], n[1] - b[1], n[2] - b[2]]), s = unit(cross(t, [0, 1, 0])), r = cross(s, t), th = (TAU * j) / 10
    return [0, 1, 2].map((k) => p[k] + 0.56 * (Math.cos(th) * s[k] + Math.sin(th) * r[k])) as [number, number, number]
  })
  for (const p of [cable[0], cable[cable.length - 1]]) tube(gold, [p[0], p[1] - 2.4, p[2]], [0, 1, 0], 1, 1, 2.2, 16)
})
RUNS[1].at.push(RUNS[1].L[RUNS[1].p.findIndex((p) => p[0] === kx(140.3))]) // the mixer: from there on, its own beads
const GAP = 4.5 // mm between beads, about: each a byte, leaving at every fourth symbol the downlink plays (FLOW); not to scale along the copper, where a real byte is 80 m long

// ---- the place -----------------------------------------------------------------------------------------------
const pn: V = [0, 0, 0], pe: V = [0, 0, 0], pN: V = [0, 0, 0], foot: V = [0, 0, 0], ant: V = [0, 0, 0]
const R: V = [0, 0, 0], a: V = [0, 0, 1], u: V = [0, 0, 0], w: V = [0, 0, 0], d: V = [0, 0, 0], q: V = [0, 0, 0], sec: V = [0, 0, 0]
const nl: V = [0, 0, 0], el: V = [0, 0, 0], n0: V = [0, 0, 0], e0: V = [0, 0, 0], N0: V = [0, 0, 0], hv: V = [0, 0, 0], hs: V = [0, 0, 0], ev: V = [0, 0, 0], o: V = [0, 0, 0], c: V = [0, 0, 0]
const X: V = [0, 0, 0], Z: V = [0, 0, 0], X2: V = [0, 0, 0], Z2: V = [0, 0, 0], Y2: V = [0, 0, 0], CAR: V = [0, 0, 0], YAP: V = [0, 0, 0], YX: V = [0, 0, 0], YZ: V = [0, 0, 0]
const lean: V = [0, 0, 0], rb: V = [0, 0, 0], rx: V = [0, 0, 0], rz: V = [0, 0, 0] // the rail: along, its foot, across
let ready = false, clk = 0, roll = 0, ph = 0, K = 1, sym = 0, wasTs = 0, wasS = 0 // the link's clock runs always
let Y0 = 0 // the bearing the rocket is looked at from: its cameras' axis lies across it

function init() {
  K = PLACES.findIndex((P) => P.id === 'launch')
  const P = PLACES[K], s = site(P.lat, P.lon), e: V = [0, 0, 0], N: V = [0, 0, 0], g: V = [0, 0, 0]
  Y0 = P.view[2]
  frame(s, e, N)
  for (let i = 0; i < 3; i++) (pn[i] = s[i] - 0.05 * e[i] + 0.03 * N[i]), (g[i] = s[i] + 0.035 * e[i] - 0.045 * N[i])
  unit(pn), unit(g), frame(pn, pe, pN)
  for (let i = 0; i < 3; i++) (foot[i] = pn[i] * 1.0005), (ant[i] = g[i] * 1.016)
  // the rail stands behind the rocket from where it is looked at, leaning with it
  for (let i = 0; i < 3; i++) (lean[i] = pe[i] * Math.cos(ELEV) + pn[i] * Math.sin(ELEV)), (q[i] = Math.sin(Y0) * pe[i] + Math.cos(Y0) * pN[i])
  cross(lean, q, rz), unit(rz), cross(lean, rz, rx)
  for (let i = 0; i < 3; i++) rb[i] = foot[i] - q[i] * (RAD + 0.03) * M
  ready = true
}
// flight coordinates (downrange, up; metres) into the world, the ground curving under it (it comes down 790 m off)
const world = (x: number, z: number, o: V) => {
  const th = x * SC, r = len(foot) + z * SC
  for (let i = 0; i < 3; i++) o[i] = (pn[i] * Math.cos(th) + pe[i] * Math.sin(th)) * r
  return o
}
const SC = 0.5 / APOGEE // radii a metre, for heights and ranges
// Where its aft end is at flight clock c: landed, it lies on its fins.
function base(c: number, o: V) {
  const s = c % CYCLE, ts = flightTime(s)
  fetch(ts), world(state.x, state.z, o)
  if (s > PAD && ts >= T_LAND) {
    const r = len(o)
    for (let i = 0; i < 3; i++) o[i] += (o[i] / r) * 0.16 * M
  }
  return o
}
// Where the rocket is at planet time t: what a camera that rides with it looks at, its cameras' plane. The camera asks
// before draw() moves the rocket on, so the flight is carried forward from the last frame to t, and the two agree.
let tDraw = 0, going = false // when draw() last ran, and whether the flight's clock runs on from there
const W0: V = [0, 0, 0]
export function where(o: V, t?: number) {
  if (!ready) init()
  base(clk + (going && t !== undefined ? clamp(t - tDraw, 0, 0.1) : 0), W0)
  for (let i = 0; i < 3; i++) o[i] = W0[i] + a[i] * CAMS * M
  return o
}

// ---- the choreography, a pure function of ph (seconds at the place) ----------------------------------------------
// It comes apart (to 13 s), shows Yapogee's signal (to HOLD), goes back together twice as fast as it came apart, and
// then flies with the eye at a fisheye, looking round as it climbs, comes down under its canopies and lies landed.
const LIFT = 0.08, SLIDE = 0.9, SIDE = 0.6, AWAY = 1.4, OUT = 0.034, RISE = 0.034 // m; rad (the slide's, off the eye's line)
const APART = 13, HOLD = 36, WHOLE = HOLD + APART / 2, LAUNCH = WHOLE + 4.5, LAND = LAUNCH + T_AP + FALL, END = LAND + REST // s
const tp = (t: number) => (t <= HOLD ? t : Math.max(APART - 2 * (t - HOLD), 0)) // the parts' own clock
// The camera at ph: [ln distance (m), elevation, bearing from Y0, how far up the axis it looks (m), how much at Yapogee]
const KEYS = [
  [0, Math.log(0.25 / M), 0.12, 0, 0, 0], // as it arrives: places.ts's view
  [3, Math.log(7), 0.1, 0.04, -0.5, 0],
  [6.5, Math.log(0.85), 0.14, 0.1, 0, 0],
  [9.5, Math.log(0.66), 0.2, 0.12, 0, 0],
  [12.8, Math.log(0.5), 0.42, 0.1, 0.01, 0],
  [19, Math.log(0.47), 0.55, 0.6, 0.01, 0],
  [23.5, Math.log(0.25), 1.12, Math.PI / 2, 0, 1], // over Yapogee, square to it, as KiCad draws it
  [HOLD - 1, Math.log(0.23), 1.02, Math.PI / 2 + 0.15, 0, 1],
  [HOLD + 3.5, Math.log(1.1), 0.35, -0.6, 0, 0],
  [WHOLE, Math.log(0.6), 0.1, 0.3 - Math.PI / 2, 0, 0], // off camera A's lens, to go to it (or B's: KEYS_B)
  [LAUNCH, Math.log(0.6), 0.1, 0.3 - Math.PI / 2, 0, 0],
  [LAND + 1.5, Math.log(4), 0.45, 0.4, 0, 0], // landed, seen from above
  [END, Math.log(4.2), 0.5, 0.55, 0, 0],
]
// The ride: the eye just off a fisheye, looking out as it does and turning round as it climbs: how much of the camera
// the ride has, how far it has turned out, how far round, and how far down it looks.
const EYE = 0.105, SEE = 0.4 // m off the axis; radii to what the eye focuses on
const ride = (t: number) => smooth(WHOLE, WHOLE + 2, t) * (1 - smooth(LAND - 1, LAND + 1.5, t))
const turnOut = (t: number) => smooth(WHOLE + 0.4, WHOLE + 3.2, t) // to look out, the way the lens does, turning as it goes
const spin = (t: number) => 0.25 * Math.max(t - WHOLE - 3.5, 0) ** 2 / (Math.max(t - WHOLE - 3.5, 0) + 2) // rad: easing into a quarter radian a second
// below the horizon (which dips as it climbs, acos 1/(1 + h)), so the ground fills the view and the sky its top
const tilt = (t: number, h: number) => -Math.acos(1 / (1 + h)) - 0.1 + 0.08 * Math.sin(0.3 * Math.max(t - WHOLE - 3.5, 0))
// the eye goes to the lens on the sunny side: B's is A's mirrored across the line it is looked at along
const KEYS_B = KEYS.map((k) => (k[0] > HOLD && k[0] <= LAUNCH ? [k[0], k[1], k[2], -k[3], k[4], k[5]] : k))
let lens = 1 // camera A's (+1, along w) or B's (−1)
const cam = [0, 0, 0, 0, 0]
const lift = (t: number) => LIFT * (smooth(4.4, 6, t) - smooth(7.6, 9.2, t))
const slide = (t: number) => SLIDE * smooth(5.4, 8.4, t)
const apart = (t: number) => AWAY * smooth(8.6, 11, t) ** 2
const outward = (t: number) => OUT * smooth(9.6, 11.4, t)
const rise = (t: number) => smooth(10.6, 12.6, t)
const beads = (t: number) => smooth(22, 24, t) * (1 - smooth(HOLD - 1.5, HOLD, t))

// What is clicked floats a little toward the eye and turns to show both its faces; each part's share of that, eased.
const PARTS = ['carrier', 'cm5', 'yapogee', 'camera-a', 'camera-b'] as const
const SIZE = [0.145, 0.055, 0.055, 0.034, 0.034] // m across
const pick = PARTS.map(() => [0, 0, 0]) // two cascaded lags, and how long it has been picked (s)
const home = PARTS.map(() => [0, 0, 0]) // where each part's middle is, world
let picked = 0 // how much any part is
export const ABOUT: Record<string, About> = {
  carrier: { name: 'Pigeon carrier', does: 'Six layers, 144.78 mm round: the CM5, both cameras, power and sensors on one board, and Yapogee S3 on its landing. It clocks the video into the S3 over SPI.' },
  cm5: { name: 'Raspberry Pi CM5', does: 'Takes both IMX900 cameras at 30 frames/s and encodes them into one MPEG transport stream, about 9 Mb/s.' },
  yapogee: { name: 'Yapogee S3', does: 'The transmitter. An ESP32-S3 makes DVB-S2 out of its own Wi-Fi radio, QPSK 2/3 at 8 Msym/s at 2.42 GHz; an RFFC5072A mixes it with a 3.70 GHz LO down to 1.28 GHz, through a low-pass and a driver to the SMA.' },
  'camera-a': { name: 'IMX900 camera', does: 'A global-shutter IMX900 under a CIL212 fisheye, looking out one side. With its twin back to back, the ground stitches a whole sphere.' },
  'camera-b': { name: 'IMX900 camera', does: 'A global-shutter IMX900 under a CIL212 fisheye, looking out one side. With its twin back to back, the ground stitches a whole sphere.' },
}

// the direction from what is looked at toward the eye, at elevation p and bearing y about unit n
function toward(n: V, p: number, y: number, out: V) {
  frame(n, e0, N0)
  for (let i = 0; i < 3; i++) out[i] = Math.cos(p) * (Math.sin(y) * e0[i] + Math.cos(y) * N0[i]) + Math.sin(p) * n[i]
  return out
}

// The camera here: the keys, looking at the section as it slides out (or at Yapogee), or at what is picked; or riding.
const W_: V = [0, 0, 0], Wn: V = [0, 0, 0], E1: V = [0, 0, 0], E2: V = [0, 0, 0], L1: V = [0, 0, 0]
let lastYaw = 0
export function steer(_since: number, _picked: string, s: Steer) {
  if (!ready) return false
  glide(lens > 0 ? KEYS : KEYS_B, ph, cam)
  where(W_)
  const sl = slide(tp(ph)), y = cam[4], free = 1 - Math.min(picked, 1)
  let lnd = cam[0] * free
  for (let i = 0; i < 3; i++) s.at[i] = free * ((1 - y) * (a[i] * cam[3] + hs[i] * sl) * M + y * (home[2][i] - W_[i]))
  for (let k = 0; k < PARTS.length; k++) {
    const g = pick[k][1]
    if (g < 1e-4) continue
    lnd += g * Math.log(SIZE[k] * 2.6)
    for (let i = 0; i < 3; i++) s.at[i] += g * (float[k][i] - W_[i])
  }
  s.d = Math.exp(lnd) * M, s.pitch = cam[1], s.yaw = Y0 + cam[2]
  const r = ride(ph)
  if (r > 0) {
    // both as an eye, a look (bearing, elevation) and a focus; the eye goes to the lens, then turns to look out
    for (let i = 0; i < 3; i++) Wn[i] = W_[i]
    unit(Wn), toward(Wn, s.pitch, s.yaw, E1)
    for (let i = 0; i < 3; i++) E1[i] = W_[i] + s.at[i] + s.d * E1[i]
    let yk = s.yaw + Math.PI
    const pk = -s.pitch, yr = Y0 - (lens * Math.PI) / 2 + spin(ph), go = r * turnOut(ph)
    yk += TAU * Math.round((yr - yk) / TAU)
    toward(Wn, 0, yr, E2)
    for (let i = 0; i < 3; i++) E2[i] = W_[i] + E2[i] * EYE * M
    const yl = yk + (yr - yk) * go, pl = pk + (tilt(ph, len(W_) - 1) - pk) * go, f = Math.exp(Math.log(s.d) + (Math.log(SEE) - Math.log(s.d)) * go)
    toward(Wn, pl, yl, L1)
    for (let i = 0; i < 3; i++) s.at[i] = E1[i] + (E2[i] - E1[i]) * r + L1[i] * f - W_[i]
    s.d = f, s.pitch = -pl, s.yaw = yl + Math.PI
  }
  s.yaw += TAU * Math.round((lastYaw - s.yaw) / TAU) // never a whole turn at once
  lastYaw = s.yaw
  return true
}
const float = PARTS.map(() => [0, 0, 0]) // where each part floats to while picked, world

// Model `id` with its own origin at world point p, its axes along x, y, z, `unit` radii a model unit.
function put(id: string, p: V, x: V, y: V, z: V, unit_: number, k = 1, glow = 0, size = 1) {
  const m = ctx.models[id]
  if (!m) return
  const ext = Math.max(m.hi[0] - m.lo[0], m.hi[1] - m.lo[1], m.hi[2] - m.lo[2]), cx = (m.hi[0] + m.lo[0]) / 2, cy = (m.hi[1] + m.lo[1]) / 2, cz = (m.hi[2] + m.lo[2]) / 2
  for (let i = 0; i < 3; i++) c[i] = p[i] + (x[i] * cx + y[i] * cy + z[i] * cz) * unit_ * size
  solid(id, c, x, y, z, ext * unit_ * size, k, glow)
}
// rocket-frame metres (across, up the axis, along the cameras' axis) from its aft end into the world
const at = (x: number, y: number, z: number, out: V) => {
  for (let i = 0; i < 3; i++) out[i] = R[i] + (u[i] * x + a[i] * y + w[i] * z) * M
  return out
}

const P3: V = [0, 0, 0], B: V = [0, 0, 0], T: V = [0, 0, 0]
export function draw(k: number) {
  if (!ready) init()
  const here = ctx.focus === k, dt = ctx.dt
  // its clock runs while the camera rests here (and nothing of it is picked to look at); away, it runs back (or, whole
  // again, is done at once); here, the rocket is on its pad until it flies with the eye on it
  ph = here ? (ctx.since >= 0 && !(ctx.picked in ABOUT) ? Math.min(ph + dt, END) : ph) : ph >= WHOLE ? 0 : Math.max(ph - 4 * dt, 0)
  if (here) clk = ph > LAUNCH - PAD ? Math.min(ph - LAUNCH + PAD, CYCLE - 0.01) : 0
  else if (ph === 0) clk += dt // it flies only whole, and while no one is looking closely
  tDraw = ctx.t, going = here ? ctx.since >= 0 && ph > LAUNCH - PAD && clk < CYCLE - 0.01 : ph === 0
  const t = tp(ph)
  if (ph < HOLD) lens = dot(ctx.L, w) >= 0 ? 1 : -1
  const s = clk % CYCLE, ts = flightTime(s), flying = s > PAD && ts < T_LAND, burning = flying && ts < BURN, chute = ts > T_AP && flying
  if (s < PAD) roll = 0
  // what happened since the last frame (on the flight's own clock: a jump back to the pad is none of them)
  if (ts - wasTs > 0 && ts - wasTs < 1) {
    if (wasTs < BURN && ts >= BURN) happen(0)
    if (wasTs < T_AP && ts >= T_AP) happen(440)
    if (wasTs < T_MAIN && ts >= T_MAIN) happen(0)
    if (wasTs < T_LAND && ts >= T_LAND) happen(0)
  }
  if (wasS < PAD && s >= PAD && s - wasS < 1) happen(55)
  wasTs = ts, wasS = s
  const was8 = Math.floor((sym * FLOW) / 4)
  sym += dt
  if (Math.floor((sym * FLOW) / 4) !== was8) happen(440 * (1 + fd / (4 * BFO)) * 2 ** (CHORD[symbol(4 * Math.floor((sym * FLOW) / 4), 2)] / 12))
  base(clk, R)
  for (let i = 0; i < 3; i++) nl[i] = R[i]
  unit(nl)
  const h0 = dot(pe, nl)
  for (let i = 0; i < 3; i++) el[i] = pe[i] - nl[i] * h0
  unit(el)
  // the airframe points the way it flies; on the rail, along it; under a canopy it hangs, swinging; landed, it lies on
  // its fins, nose down to the ground
  const v = Math.hypot(state.vx, state.vz), landed = s > PAD && !flying
  let tx = Math.cos(ELEV), tz = Math.sin(ELEV)
  if (chute) (tx = 0.12 * Math.sin(2.1 * clk)), (tz = 1)
  else if (flying && v > 1) (tx = state.vx / v), (tz = state.vz / v)
  else if (landed) (tx = 1), (tz = -0.034)
  const fol = flying ? 1 - Math.exp(-dt * 5) : 1
  for (let i = 0; i < 3; i++) a[i] += (el[i] * tx + nl[i] * tz - a[i]) * fol
  unit(a)
  if (flying && !chute) roll += 0.9 * dt // it rolls a little, as they do
  // its cameras' axis lies across the way it is looked at from, rolled as it rolls
  where(n0), unit(n0), frame(n0, e0, N0)
  for (let i = 0; i < 3; i++) hv[i] = Math.sin(Y0) * e0[i] + Math.cos(Y0) * N0[i]
  cross(a, hv, q), unit(q), turn(q, a, roll, w), cross(a, w, u)
  const h = dot(hv, a)
  for (let i = 0; i < 3; i++) hv[i] -= a[i] * h
  unit(hv), turn(hv, a, SIDE, hs) // the section slides out toward the eye, and aside, so the rocket stands clear behind

  // the airframe: below the camera section, and the nose and its body above, lifting off to let the section out
  at(0, 0, 0, P3), put('pv-lower', P3, u, a, w, MM)
  at(0, LOWER + SECT + lift(t), 0, P3), put('pv-upper', P3, u, a, w, MM)
  if (burning) at(0, -0.03, 0, P3), put('pv-flame', P3, u, a, w, MM, 0, 6 * push(ts, 1))
  put('pv-rail', rb, rx, lean, rz, MM)

  // the camera section, slid out toward the eye; its two halves, parting along the cameras' axis
  const sl = slide(t), aw = apart(t)
  for (let i = 0; i < 3; i++) sec[i] = R[i] + (a[i] * LOWER + hs[i] * sl) * M
  const shell = (sg: number) => {
    for (let i = 0; i < 3; i++) (P3[i] = sec[i] + (w[i] * sg * (aw + HALF) + (a[i] * SECT) / 2) * M), (X2[i] = w[i] * sg), (Z2[i] = -u[i] * sg)
    put('pigeon-shell', P3, X2, a, Z2, M)
  }
  shell(1), shell(-1)

  // inside: the carrier below the cameras' cradles, rising into their plane as they draw out; the CM5 and Yapogee on it, lifting
  // off; what is picked floats toward the eye as the camera stands at this ph. Shut in its shell, only the cameras'
  // lenses show, so only they are drawn.
  glide(lens > 0 ? KEYS : KEYS_B, ph, cam), toward(n0, cam[1], Y0 + cam[2], ev)
  const ri = rise(t), ou = outward(t)
  picked = 0, open = aw > 0
  for (let i = 0; i < 3; i++) CAR[i] = sec[i] + a[i] * (SECT / 2 - RISE * (1 - ri)) * M
  board(0, CAR, u, a, w)
  // the CM5: its x along the carrier's −z, its z along +x
  for (let i = 0; i < 3; i++) (o[i] = CAR[i] + (u[i] * CM5_AT[0] + a[i] * CM5_AT[1] + w[i] * CM5_AT[2]) * MM + a[i] * 0.022 * ri * M), (X[i] = -w[i]), (Z[i] = u[i])
  board(1, o, X, a, Z)
  for (let i = 0; i < 3; i++) (YAP[i] = CAR[i] + (u[i] * YAP_AT[0] + a[i] * YAP_AT[1] + w[i] * YAP_AT[2]) * MM + a[i] * 0.05 * ri * M), (YX[i] = -u[i]), (YZ[i] = -w[i])
  board(2, YAP, YX, a, YZ)
  // the cameras, one each way along the axis, lenses out; each with its fisheye's glass
  for (let sg = 1; sg >= -1; sg -= 2) {
    for (let i = 0; i < 3; i++) (o[i] = sec[i] + (a[i] * SECT / 2 + w[i] * sg * (CAM_R / 1000 + ou)) * M), (X[i] = w[i] * sg), (Z[i] = -u[i] * sg)
    board(sg > 0 ? 3 : 4, o, X, a, Z)
  }

  // the signal, lit along its way across Yapogee
  if (here && ph > 21 && ph < HOLD && picked < 0.01) signal(YAP, YX, YZ, beads(ph))

  // the way down to the antenna, for the downlink's Doppler
  for (let i = 0; i < 3; i++) d[i] = ant[i] - (R[i] + a[i] * CAMS * M)
  const rho_ = Math.max(len(d) / SC, SYM)
  for (let i = 0; i < 3; i++) d[i] /= rho_ * SC
}

// A board (or camera) k of PARTS at its place p with axes x, y, z, unless it is picked: then it floats toward the eye
// and turns, a board end over end, a camera round.
const ID = ['pigeon-carrier', 'pigeon-cm5', 'yapogee-s3', 'pigeon-camera', 'pigeon-camera']
const EASE = 3 // 1/s
let open = false
function board(k: number, p: V, x: V, y: V, z: V) {
  const g = pick[k], dt = ctx.dt, f = 1 - Math.exp(-EASE * dt), id = PARTS[k], mine = ctx.picked === id && ctx.focus === K
  g[0] += ((mine ? 1 : 0) - g[0]) * f, g[1] += (g[0] - g[1]) * f, g[2] = mine ? g[2] + dt : g[1] < 1e-3 ? 0 : g[2]
  picked += g[1]
  // its middle where it rests (the model's box, which put() and solid() centre), and where it floats to
  const m = ctx.models[ID[k]]
  if (!m) return
  const cx = (m.hi[0] + m.lo[0]) / 2, cy = (m.hi[1] + m.lo[1]) / 2, cz = (m.hi[2] + m.lo[2]) / 2
  for (let i = 0; i < 3; i++) (home[k][i] = p[i] + (x[i] * cx + y[i] * cy + z[i] * cz) * M), (float[k][i] = home[k][i] + ev[i] * 0.12 * M)
  const th = Math.PI * 0.5 * (1 - Math.cos(0.45 * g[2])) * g[1], ax = k < 3 ? w : a
  turn(x, ax, th, X2), turn(y, ax, th, Y2), turn(z, ax, th, Z2)
  for (let i = 0; i < 3; i++) T[i] = home[k][i] + (float[k][i] - home[k][i]) * g[1]
  const ext = Math.max(m.hi[0] - m.lo[0], m.hi[1] - m.lo[1], m.hi[2] - m.lo[2])
  if (!open && k < 3) return
  solid(ID[k], T, X2, Y2, Z2, ext * M)
  if (k === 2) {
    // its jumper, from the S3 module's own connector to J3
    for (let i = 0; i < 3; i++) B[i] = T[i] - (X2[i] * cx + Y2[i] * cy + Z2[i] * cz) * M
    put('pv-jumper', B, X2, Y2, Z2, MM)
  }
  if (k === 3 || k === 4) {
    // the fisheye's front glass, on the lens's face
    for (let i = 0; i < 3; i++) B[i] = T[i] + X2[i] * (LENS - 1.2) * MM
    put('pv-eye', B, X2, Y2, Z2, MM)
  }
  if (rise(tp(ph)) > 0.5 && ctx.focus === K) part(id, T, (SIZE[k] / 2) * M)
}

// Beads along the runs on Yapogee (its origin y, its axes x and z), each a byte of the stream, four symbols: they keep
// their number through the mixer, which only moves them to the other carrier.
function signal(y: V, x: V, z: V, bright: number) {
  for (const r of RUNS) {
    const L = r.L[r.L.length - 1], nb = Math.round(L / GAP), gap = L / nb
    for (let b = 0; b < nb; b++) {
      const s = ((((sym * FLOW) / 4) % 1) + b) * gap
      let i = 1
      while (i < r.L.length - 1 && r.L[i] < s) i++
      const f = (s - r.L[i - 1]) / Math.max(r.L[i] - r.L[i - 1], 1e-9), p0 = r.p[i - 1], p1 = r.p[i]
      let kind = 0
      for (let j = 0; j < r.at.length; j++) if (s >= r.at[j]) kind = r.bead[j]
      // in at one end and out at the other; dimmed passing through the mixer
      const mix = r.at.length > 1 ? clamp(Math.abs(s - r.at[1]) / 1.5) : 1, ends = smooth(0, 3, s) * (1 - smooth(L - 5, L, s))
      const size = 0.75 * ends * bright
      for (let j = 0; j < 3; j++) {
        const px = p0[0] + (p1[0] - p0[0]) * f, py = p0[1] + (p1[1] - p0[1]) * f, pz = p0[2] + (p1[2] - p0[2]) * f
        P3[j] = y[j] + (x[j] * px + a[j] * py + z[j] * pz) * MM
      }
      put(`pv-bead${kind}`, P3, x, a, z, MM, 0.2, 60 * mix, size)
    }
  }
}

// What it sounds like, from beside the airframe. The motor, as loud as it pushes: a low A and the rumble under it.
// The air going by, a soft rush as loud as its dynamic pressure ½ρv²: all there is after burnout, dying away to
// nothing at apogee. And the downlink: its QPSK symbols at the pace the beam draws them, each of the four a note of A major
// over A4 (the receiver's BFO, 1760 Hz, two octaves down), all of them bent by a quarter of the Doppler −v_r f/c as
// a receiver beside the pad hears it: flat as it leaves, back in tune at apogee, a little sharp coming home under
// the canopy.
const BFO = 1760, QMAX = 56_700, EVERY = 64, CHORD = [0, 7, 12, 16] // Hz; the most ½ρv² gets, Pa; the flight is looked up every 64th sample
const downlink = new Plucks(48000, 0.33)
let burn = 0, roar = 0, wind = 0, fd = 0, due = 0, sent = NaN, phs = 0, low = 0, mid = 0, high = 0
export function voice(t: number, dt: number) {
  if (--due < 0) {
    const c = clk + t - ctx.t, s = ((c % CYCLE) + CYCLE) % CYCLE, ts = flightTime(s), up = s > PAD && ts < T_LAND, j = Math.floor(FLOW * (sym + t - ctx.t))
    fetch(ts)
    burn = up && ts < BURN ? push(ts, 1) : 0
    wind = up ? (0.5 * RHO * Math.exp(-state.z / SCALE_H) * (state.vx ** 2 + state.vz ** 2)) / QMAX : 0
    fd = up ? ((state.vx * dot(d, pe) + state.vz * dot(d, pn)) / C) * FREQ : 0
    if (j !== sent) (sent = j), downlink.strike(440 * (1 + fd / (4 * BFO)) * 2 ** (CHORD[symbol(j, 2)] / 12), 0.22, 0, 0.9, 1.6)
    due = EVERY - 1
  }
  roar += 2e-4 * (burn - roar)
  phs += 55 * dt, phs -= Math.floor(phs)
  const n = 2 * Math.random() - 1
  low += 0.004 * (n - low), mid += 0.06 * (n - mid), high += 0.25 * (n - high)
  return downlink.mono() + roar * (0.4 * Math.sin(TAU * phs) + 8 * low) + 0.6 * wind * (mid - low)
}

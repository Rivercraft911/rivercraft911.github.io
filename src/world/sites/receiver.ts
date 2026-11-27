// Ephemeris-1 under the GPS constellation: River's board on the ground, its SMA taking the cable of a passive L1 patch
// beside it (Rev 1 sends no antenna bias), and, while the place is looked at, the receiver finding the sky.
//
// The sky. A Walker 24/6/1 shell at 4.17 radii (26 560 km), 55°, PRN 1 to 24 in slot order, seen from the patch over
// a 5° mask: each satellite's range, and its Doppler −ṙ/c · L1 (the shell goes round 343× fast here; the rates are
// scaled back to real ones).
// The search. From cold, as the firmware does it on the ground: one satellite at a time, its Doppler bins swept up
// from −12 kHz in steps of 2046/4096 kHz (a 1 ms dwell's FFT, zero-padded to 4096: 499.5 Hz), every code phase at once
// in each; where the sweep reaches the satellite's own Doppler, the peak, and it locks. Each found satellite is joined to
// the patch by a thread of light, and holds until it sets; then the next, up to the receiver's eight channels. It
// searches only what is up, strongest first (the firmware, cold, tries PRNs 1 to 32 in turn), and its pace is not real
// (thirty bins a second here). Which one it is searching for goes to the sound.
import { TAU, clamp, hash, smooth } from '../../acts/scene'
import { CODES, L1 } from '../../dsp/gps'
import { ball, box, make, pipe, slab, tube } from '../make'
import { ctx, cross, dot, frame, part, site, solid, unit, type V } from '../ctx'
import { PLACES, type About } from '../places'
import { C, DEG, RE, orbit } from './sky'

const RATE = 0.05, SHELL = 4.17, INC = 55 * DEG // the shell
const LAPSE = RATE / (TAU / 43082) // real seconds a scene second: a GPS orbit is half a sidereal day
const MASK = Math.sin(5 * DEG) // elevation mask
const BIN = 2046 / 4.096, SPAN = 12000, BINS = 49, SWEEP = 40 // Hz a bin; the search's ±Hz, its bins; bins a second here
type V3 = [number, number, number]

// ---- the bench, in millimetres: x north, y up, z east, from the board's place on the ground --------------------------
// The board is ephemeris.glb as places.ts used to stand it (0.07 radii across, its x north, its SMA facing south); the
// patch is a common passive L1 part: a 25 × 25 × 4 mm ceramic square, its silver 21 mm square cut at two corners for
// right-hand circular polarisation and fed 2.5 mm off centre, on a 50 mm ground plate; RG174 to an SMA plug.
const SIZE = 0.07, MM = SIZE / 51, FOOT = 2.19 // radii across the board (its SMA too), radii a millimetre, its underside under its middle
const PATCH = [-40, 8.6, 62] // the patch's face, its phase centre
const steel = { col: [0.62, 0.63, 0.65, 1], metal: 1, rough: 0.5 }, gold = { col: [1, 0.78, 0.34, 1], metal: 1, rough: 0.25 }
const black = { col: [0.02, 0.02, 0.022, 1], metal: 0, rough: 0.5 }
make('l1-patch', () => {
  box(steel, [-25, 3, -25], [25, 4.5, 25])
  for (const [x, z] of [[-21, -21], [-21, 21], [21, -21], [21, 21]]) tube(black, [x, 0, z], [0, 1, 0], 2, 2, 3, 12, true)
  box({ col: [0.75, 0.66, 0.52, 1], metal: 0, rough: 0.6 }, [-12.5, 4.5, -12.5], [12.5, 8.5, 12.5])
  const c = 3 // the truncated corners
  slab({ col: [0.92, 0.92, 0.9, 1], metal: 1, rough: 0.3 }, [[-10.5 + c, -10.5], [10.5, -10.5], [10.5, 10.5 - c], [10.5 - c, 10.5], [-10.5, 10.5], [-10.5, -10.5 + c]], 8.5, 8.6)
  tube(steel, [2.5, 8.6, 0], [0, 1, 0], 0.65, 0.65, 0.15, 12)
})
// the cable, from the plug on the board's SMA (its axis 3.5 mm up, its mouth 28.5 mm south of the board's middle) round
// to under the plate
make('l1-cable', () => {
  tube({ ...gold, col: [0.85, 0.85, 0.82, 1] }, [-25.5, 3.5, 0], [-1, 0, 0], 4.62, 4.62, 7, 6, true) // the coupling nut, 8 mm across flats
  tube(gold, [-32.5, 3.5, 0], [-1, 0, 0], 3, 3, 8.5, 16, true)
  tube(black, [-41, 3.5, 0], [-1, 0, 0], 2.6, 1.8, 9, 16)
  pipe(black, [[-50, 3.5, 0], [-54, 2.6, 2], [-57, 1.6, 8], [-58, 1.4, 16], [-55, 1.4, 25], [-49, 1.4, 32], [-44, 1.4, 38], [-41, 1.4, 50], [-40, 1.4, 62]], 1.4, 10)
})
// a GPS satellite, an emblem of one (body, two wings, its nadir panel), in units of its own: it is far too small to see
make('gps-sv', () => {
  box({ col: [0.75, 0.6, 0.25, 1], metal: 1, rough: 0.35 }, [-1, -1, -1.2], [1, 1, 1.2])
  box({ col: [0.86, 0.86, 0.84, 1], metal: 0, rough: 0.5 }, [-0.9, 1, -1], [0.9, 1.25, 1])
  for (const s of [-1, 1]) box({ col: [0.05, 0.07, 0.16, 1], metal: 0.6, rough: 0.3 }, [-0.7, -0.05, s * 1.6], [0.7, 0.05, s * 6.5])
})
// a thread of light: one unit long along x, widening sixteenfold, stretched to length when placed (thread()). It is
// light, not a thing: the tracer is not given it.
const TAPER = 16
make('gps-thread', () => tube({ col: [0.6, 0.9, 1, 1], metal: 0, rough: 1 }, [0, 0, 0], [1, 0, 0], 1, TAPER, 1, 6, true))

// ---- what the receiver does, at its place --------------------------------------------------------------------------
// Its work in order, each as the firmware does it (docs/software/receiver.md), each a part a click explains. They are
// pictures, not things: the tracer is not given them. And while the place is shown, they put the same number of solids
// into the frame every frame, an empty one where nothing is (none()), so nothing after them changes its slot in
// ctx.items (the tracer follows things there by slot). Bench millimetres, as above.
//
// The search, in front of the patch and east of the board: a fine line for each Doppler bin (the 49 of them, front to
// back), and along each the code phase (one 1023-chip period's 2046 half-chip lags, as 128 points, each the largest of
// its 16), its height the power of four 1 ms correlations summed. Where nothing lines up it is what a correlator makes
// of noise, χ² with eight degrees of freedom (one draw of it, kept), and the sweep raises the lines seven at a time.
// Where the satellite's C/A code lines up, at its code phase (its range, mod a light-millisecond) and its Doppler, the
// peak: as tall as its C/N0 makes it (38 dB-Hz low in the sky to 48 overhead, assumed), as wide across the lags as the
// code's own correlation (gps.ts), and along Doppler the sinc² of a 1 ms dwell, a bin either side at 0.41.
const COLS = 128, LAGS = 2046 / COLS, SURF = [8, 0, 62], DX = 1.3, DZ = 64 / (COLS - 1), PEAK = 24, LW = 0.16 // where; mm a bin, a lag column; the peak's height at 45 dB-Hz; a line's radius
const glass = (r: number, g: number, b: number, a: number) => ({ col: [r, g, b, a], metal: 0, rough: 0.15 })
const ink = { col: [0.6, 0.9, 1, 1], metal: 0, rough: 0.6 }
let seed = 0x2545f491
const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) + 0.5) / 4294967296
const SNR0 = 10 ** 4.5 / 1000, FLOOR = 4 * (1 + SNR0) // a 1 ms dwell's SNR at 45 dB-Hz; the peak's power, summed over four
const H = Array.from({ length: BINS }, () =>
  Array.from({ length: COLS }, () => {
    let m = 0
    for (let l = 0; l < LAGS; l++) {
      let s = 0
      for (let k = 0; k < 4; k++) s += -2 * Math.log(rand()) // |n|², n complex Gaussian of unit variance a part
      m = Math.max(m, s / 2)
    }
    return (PEAK * m) / FLOOR
  }),
)
// made as seven bands of seven bins; a search starts the noise at any band, so each satellite's looks its own
const BANDS = 7
for (let b = 0; b < BANDS; b++)
  make(`acq-${b}`, () => {
    for (let i = 0; i < 7; i++) pipe(ink, Array.from({ length: COLS }, (_, c): V3 => [i * DX, H[7 * b + i][c], c * DZ]), LW, 4)
  })
// the peak, 20 mm tall: across, the code's correlation at the half-chip lags round its own (R(0) = 1, R(±½) = ½, then
// −1/1023), as power, at the columns' spacing it falls to the floor in one; along, sinc²(0.4995 k)
const R = (lag: number) => {
  const c = CODES[0]
  let s = 0
  for (let i = 0; i < 2046; i++) s += (2 * c[i >> 1] - 1) * (2 * c[(((i + lag) % 2046) + 2046) % 2046 >> 1] - 1)
  return s / 2046
}
const SINC2 = (x: number) => (x ? (Math.sin(Math.PI * x) / (Math.PI * x)) ** 2 : 1)
make('acq-peak', () => {
  for (const k of [-1, 0, 1])
    pipe({ ...ink, col: [0.8, 1, 1, 1] }, [-1, -1 / LAGS, 0, 1 / LAGS, 1].map((u): V3 => [k * DX, 20 * SINC2(0.4995 * k) * (u ? (Math.abs(u) < 1 ? R(1) ** 2 : 0) : R(0) ** 2), u * DZ]), LW * 1.2, 4)
})
// Tracking, east of the patch, standing to face the camera's own rest: the code's correlation R(τ) over ±1.5 chips
// (computed from the code, a triangle on its −1/1023 floor) as one fine line, and on it the early, prompt and late
// correlators, half a chip apart, each on a stem; beside it the prompt's I and Q.
const CHIP = 11, TALL = 22, TRK = [-18, 4, 128], IQ = 11 // mm a chip, R = 1's height, where (its middle at the foot), the I/Q circle's radius
// (of chips held for their whole width, R is straight between whole-chip lags, where it is the code's own)
const Rk = (k: number) => {
  const c = CODES[0]
  let s = 0
  for (let i = 0; i < 1023; i++) s += (2 * c[i] - 1) * (2 * c[(((i + k) % 1023) + 1023) % 1023] - 1)
  return s / 1023
}
const Rc = (tau: number) => {
  const k = Math.floor(tau), f = tau - k
  return (1 - f) * Rk(k) + f * Rk(k + 1)
}
const TENT = Array.from({ length: 61 }, (_, i) => -1.5 + i / 20).map((tau) => Math.max(0, Rc(tau)))
make('trk-tent', () => {
  pipe(ink, TENT.map((r, i): V3 => [(i / 20 - 1.5) * CHIP, r * TALL, 0]), 0.2, 6)
  pipe(glass(0.6, 0.9, 1, 0.45), [[-1.6 * CHIP, 0, 0], [1.6 * CHIP, 0, 0]], 0.12, 6)
})
make('trk-stem', () => pipe(glass(0.6, 0.9, 1, 0.5), [[0, 0, 0], [0, 1, 0]], 0.1, 6)) // a unit tall
make('trk-p', () => ball({ ...ink, col: [0.75, 0.97, 1, 1] }, [0, 0, 0], 1.05, 12))
const ringPts = (r: number, plane: 'xy' | 'xz'): V3[] => Array.from({ length: 65 }, (_, i) => {
  const a = (i / 64) * TAU
  return plane === 'xy' ? [r * Math.cos(a), r * Math.sin(a), 0] : [r * Math.cos(a), 0, r * Math.sin(a)]
})
make('trk-iq', () => {
  pipe(glass(0.6, 0.9, 1, 0.5), ringPts(IQ, 'xy'), 0.3, 6)
  box(ink, [-IQ - 3, -0.25, -0.25], [IQ + 3, 0.25, 0.25]) // I
  box(glass(0.6, 0.9, 1, 0.35), [-0.2, -IQ - 2, -0.2], [0.2, IQ + 2, 0.2]) // Q
})
make('trk-bead', () => ball({ col: [0.85, 0.9, 0.95, 1], metal: 0, rough: 0.4 }, [0, 0, 0], 0.8, 12))
make('trk-prompt', () => ball({ ...ink, col: [0.7, 0.95, 1, 1] }, [0, 0, 0], 1.5, 12))
// The fix, over the patch: where the receiver put the antenna, fix by fix, five a second, against GNSS-SDR's fixes on the
// same recording. These are the Pico's own 223 from the CTTC rooftop (docs/software/real-sky.md): half lie within
// 2.56 m (the ring), 95 % within 5.8. 4 mm a metre.
const FIX = [-40, 44, 62], M4 = 4, CHUNK = 32
const FIXES = [
  '-6,6 -37,-21 -46,-6 -11,11 -6,9 -11,5 -23,-14 -26,-13 -12,-13 -30,9 11,17 19,31 15,9 -23,7 -30,-25',
  '17,8 9,25 -16,16 -13,5 0,-13 -29,-15 -7,-11 4,30 -30,-6 22,12 7,-19 10,2 -10,30 -19,-13 -5,9 -18,-3',
  '-20,28 -4,27 -7,14 3,19 -2,26 -43,-13 -26,1 13,21 46,39 14,46 -5,24 -46,-23 -7,1 6,25 12,22 10,55',
  '-25,33 -15,40 -10,-14 9,-19 -24,18 19,14 19,32 -16,26 -14,2 -22,-2 18,18 27,33 7,-8 18,33 3,24 -2,7',
  '-14,-2 -7,15 -10,13 -29,24 30,10 13,24 -20,24 -50,-28 2,50 -6,26 -2,-25 29,19 -30,-14 -59,6 16,77',
  '6,0 -2,-39 -39,-11 -38,-7 -29,61 -62,-9 -82,-20 -36,60 2,30 -18,-61 -20,4 -24,-1 -19,-4 -20,-1',
  '-18,22 -25,-5 -10,-1 -38,-39 -32,-8 -21,38 1,19 -43,-54 -44,-35 -11,16 -16,-45 -8,-31 -34,-19',
  '-51,-12 -42,-8 -36,-5 -28,-7 -19,8 -31,-19 -18,-25 23,-10 1,-11 -12,-14 -23,24 4,-41 48,-23 0,17',
  '-20,-27 -15,-16 6,-7 0,15 -9,-13 -2,-10 23,-13 7,1 13,0 11,-14 -13,-28 -6,-5 -3,-20 7,8 23,-14 22,22',
  '-3,-27 -13,-43 -7,-32 27,11 27,33 4,-42 1,-27 10,9 9,-21 29,9 16,-18 25,18 27,21 29,0 23,-5 35,10',
  '12,-9 6,-25 27,2 43,21 -13,-15 24,-18 31,15 25,3 23,-3 31,21 -1,-20 -6,-25 -2,-18 17,1 24,0 17,-2',
  '6,28 8,-11 27,-4 25,5 -1,-11 20,40 6,3 -12,-64 34,3 -5,-21 -10,-27 2,-10 12,13 26,17 29,-11 12,-20',
  '1,-21 1,21 10,15 -40,10 12,5 12,-4 11,24 7,29 0,-16 -26,1 -11,14 27,27 -4,9 1,25 7,11 -14,-5 -15,4',
  '-18,9 -25,-5 -21,-30 -2,21 -13,-14 -25,-43 17,31 14,24 8,-12 4,-3 25,14 8,3 -13,-1 5,-9 1,-13 14,-19',
  '4,12 25,7 13,9 56,40 30,6 13,-14 36,14',
].join(' ').split(' ').map((p) => p.split(',').map((x) => +x / 10)) // the 223 fixes, metres east and north of GNSS-SDR's
make('fix-disc', () => {
  tube(glass(0.6, 0.9, 1, 0.08), [0, -0.15, 0], [0, 1, 0], 9 * M4, 9 * M4, 0.3, 64, true)
  pipe(glass(0.7, 0.95, 1, 0.8), ringPts(2.563 * M4, 'xz'), 0.4, 6)
})
for (let j = 0; j * CHUNK < FIXES.length; j++)
  make(`fix-${j}`, () => {
    for (const [e, nn] of FIXES.slice(j * CHUNK, (j + 1) * CHUNK)) tube({ ...ink, col: [0.75, 0.95, 1, 1] }, [nn * M4, 0, e * M4], [0, 1, 0], 0.55, 0.55, 0.25, 8, true)
  })
make('fix-now', () => ball({ ...ink, col: [0.8, 1, 1, 1] }, [0, 0, 0], 0.9, 12))
const CHUNKS = Math.ceil(FIXES.length / CHUNK)
make('rx-none', () => box(ink, [0, 0, 0], [1e-3, 1e-3, 1e-3])) // nothing, holding a slot
const GRAPHICS = ['rx-none', 'acq-peak', 'trk-tent', 'trk-stem', 'trk-p', 'trk-iq', 'trk-bead', 'trk-prompt', 'fix-disc', 'fix-now', ...Array.from({ length: BANDS }, (_, b) => `acq-${b}`), ...Array.from({ length: CHUNKS }, (_, j) => `fix-${j}`)]

// ---- the sky, each frame -------------------------------------------------------------------------------------------
const n: V = [0, 0, 0], E: V = [0, 0, 0], N: V = [0, 0, 0], rx: V = [0, 0, 0], v: V = [0, 0, 0], S: V = [0, 0, 0]
const SV = new Float64Array(72), range = new Float64Array(24), doppler = new Float64Array(24), seenUp = new Uint8Array(24), elev = new Float64Array(24)
function sky(t: number) {
  for (let i = 0; i < 24; i++) {
    const raan = ((i >> 2) * TAU) / 6, u = ((i & 3) * TAU) / 4 + ((i >> 2) * TAU) / 24 + RATE * t
    orbit(SHELL, raan, INC, u, S), orbit(SHELL * RATE, raan, INC, u + Math.PI / 2, v)
    const dx = S[0] - rx[0], dy = S[1] - rx[1], dz = S[2] - rx[2], r = Math.hypot(dx, dy, dz)
    SV[3 * i] = S[0], SV[3 * i + 1] = S[1], SV[3 * i + 2] = S[2]
    range[i] = r
    elev[i] = (dx * n[0] + dy * n[1] + dz * n[2]) / r
    seenUp[i] = +(elev[i] > MASK)
    doppler[i] = ((-(v[0] * dx + v[1] * dy + v[2] * dz) / r) * RE) / LAPSE / C * L1
  }
}

// ---- the search ---------------------------------------------------------------------------------------------------
// cur: the satellite being searched for (−1 none); bin: how far up the sweep is; lit[i]: how far satellite i's thread
// has reached (0 to 1), and grows toward found[i] (1 locked, else how far the search has come)
let cur = -1, bin = 0, rest = 0
// last: the satellite last locked, and when; fixT: when the fixes began (−1 not yet). The peak of the search under way:
// its row, column and height (mm), its code phase's error at the nearest lag (half-chips) and its Doppler's from its
// bin's centre (Hz), which tracking takes up.
let last = -1, lastT = 0, fixT = -1, prow = 0, pcol = 0, ph = 0, perr = 0, pres = 0, more = false // (more: another search will follow)
// Each lock, for the music (sound.ts): how many there have been, and the one just found's own note (its voice's, below).
export const events = { n: 0, f: 0 }
const found = new Float64Array(24), lit = new Float64Array(24)
function search(dt: number, t: number) {
  for (let i = 0; i < 24; i++) if (!seenUp[i]) found[i] = 0 // set: lost
  if (cur >= 0 && !seenUp[cur]) cur = -1
  if (cur < 0) {
    // the next satellite up that is not held, highest first (the strongest), while a channel is free
    let best = -1, held = 0
    for (let i = 0; i < 24; i++) {
      if (found[i] >= 1) held++
      else if (seenUp[i] && (best < 0 || elev[i] > elev[best])) best = i
    }
    if (held >= 4 && fixT < 0) fixT = t + 1 // four held: the first fix
    more = best >= 0 && held < 8
    if ((rest -= dt) > 0 || !more) return
    ;(cur = best), (bin = 0)
    // where its peak will be: its code phase, its range mod a light-millisecond, in chips; its Doppler's bin
    const lag = ((((range[cur] * RE) / (C / 1.023e6)) % 1023) + 1023) % 1023 * 2, at = (doppler[cur] + SPAN) / BIN
    ;(pcol = Math.floor(lag / LAGS)), (perr = lag - Math.round(lag)), (prow = Math.round(at)), (pres = (at - prow) * BIN)
    const snr = 10 ** ((38 + 10 * elev[cur]) / 10) / 1000 // C/N0 over a 1 ms dwell
    ph = (PEAK * (1 + snr * SINC2(0.4995 * (at - prow)) * (1 - Math.abs(perr) / 2) ** 2)) / (1 + SNR0)
  }
  // every bin is searched; the largest cell of all is the satellite, and it locks
  bin = Math.min(BINS, bin + SWEEP * dt)
  found[cur] = (0.4 * bin) / BINS
  if (bin >= BINS) (found[cur] = 1), (events.f = NOTE[cur] * 2 ** (doppler[cur] / 4500 / 24)), events.n++, (last = cur), (lastT = t), (cur = -1), (rest = 1.1)
}
function cold() {
  ;(cur = -1), (bin = 0), (rest = 0.25), (last = -1), (fixT = -1), (more = true)
  found.fill(0)
}

// ---- the parts: where they are and how they move -------------------------------------------------------------------
// A follower: x goes to its goal critically damped (no overshoot, no jump in its speed).
type F = { x: number; v: number }
const follow = (f: F, goal: number, w: number, dt: number) => ((f.v += (w * w * (goal - f.x) - 2 * w * f.v) * dt), (f.x += f.v * dt))
const apart: F = { x: 0, v: 0 }, held: F = { x: 0, v: 0 }, shown: F = { x: 0, v: 0 }
let spin = 0, was = false

const O: V = [0, 0, 0], w: V = [0, 0, 0], c: V = [0, 0, 0], ax: V = [0, 0, 0], ay: V = [0, 0, 0], az: V = [0, 0, 0]
// bench point (x north, y up, z east, mm) to the world: the place's own point is in the middle of it all
function world(x: number, y: number, z: number, o: V) {
  ;(x -= 7), (z -= 64)
  const d = (x * x + z * z) * MM * 0.5 // the ground falls away from the tangent plane
  for (let i = 0; i < 3; i++) o[i] = O[i] * (1 + (y - d) * MM) + (N[i] * x + E[i] * z) * MM
  return o
}
// model `id`, made in millimetres (or `u` of them a unit: River's CAD is in metres), its origin at bench point (x, y, z),
// its axes along a, b, cc
function put(id: string, x: number, y: number, z: number, a: V, b: V, cc: V, u = 1) {
  const m = ctx.models[id]
  if (!m) return false
  world(x, y, z, w)
  const mx = (m.lo[0] + m.hi[0]) / 2, my = (m.lo[1] + m.hi[1]) / 2, mz = (m.lo[2] + m.hi[2]) / 2, s = u * MM
  for (let i = 0; i < 3; i++) w[i] += (a[i] * mx + b[i] * my + cc[i] * mz) * s
  return solid(id, w, a, b, cc, Math.max(m.hi[0] - m.lo[0], m.hi[1] - m.lo[1], m.hi[2] - m.lo[2]) * s)
}
// v turned th about unit axis a, in place
function rot(v: V, a: V, th: number) {
  const cs = Math.cos(th), sn = Math.sin(th), d = dot(a, v) * (1 - cs)
  const x = a[1] * v[2] - a[2] * v[1], y = a[2] * v[0] - a[0] * v[2], z = a[0] * v[1] - a[1] * v[0]
  ;(v[0] = v[0] * cs + x * sn + a[0] * d), (v[1] = v[1] * cs + y * sn + a[1] * d), (v[2] = v[2] * cs + z * sn + a[2] * d)
}
// a thread of light from world point a to b, `px` pixels wide where it starts, `glow` bright
const tx: V = [0, 0, 0], ty: V = [0, 0, 0], tz: V = [0, 0, 0]
function thread(a: V, b: V, px: number, glow: number) {
  for (let i = 0; i < 3; i++) tx[i] = b[i] - a[i]
  const r = (0.5 * px * Math.hypot(a[0] - ctx.E[0], a[1] - ctx.E[1], a[2] - ctx.E[2])) / ctx.ppr
  cross(tx, O, ty), unit(ty), cross(ty, tx, tz), unit(tz)
  if (!solid('gps-thread', a, tx, ty, tz, 1, 0, glow)) return none()
  const M = ctx.items[ctx.items.length - 1].m as number[]
  for (let q = 0; q < 3; q++) (M[q * 4] = tx[q]), (M[q * 4 + 1] = ty[q] * r), (M[q * 4 + 2] = tz[q] * r), (M[q * 4 + 3] = a[q] - ctx.E[q])
}

// nothing, a radius behind the eye: a slot held (by a model of the tracer's, `id`, where one of its own may stand)
function none(id = 'rx-none') {
  if (!solid(id, ctx.E, O, O, O, 1)) return
  const M = ctx.items[ctx.items.length - 1].m as number[]
  for (let q = 0; q < 3; q++) (M[q * 4] = M[q * 4 + 1] = M[q * 4 + 2] = 0), (M[q * 4 + 3] = -ctx.p[12 + q])
}
// model `id`, made in bench millimetres, its origin at bench point (x, y, z), along a, b, cc, stretched sy along b
function lay(id: string, x: number, y: number, z: number, a: V, b: V, cc: V, sy: number, k: number, glow: number) {
  world(x, y, z, w)
  if (!solid(id, w, a, b, cc, 1, k, glow)) return none()
  const M = ctx.items[ctx.items.length - 1].m as number[]
  for (let q = 0; q < 3; q++) (M[q * 4] = a[q] * MM), (M[q * 4 + 1] = b[q] * MM * sy), (M[q * 4 + 2] = cc[q] * MM), (M[q * 4 + 3] = w[q] - ctx.E[q])
}

const pc: V = [0, 0, 0], sv: V = [0, 0, 0], sx: V = [0, 0, 0], sy: V = [0, 0, 0], sz: V = [0, 0, 0]
let ready = false, untraced = 0, yaw = 0 // (yaw: the camera's bearing at rest here)
const sunk: F = { x: 0, v: 0 }, trk: F = { x: 0, v: 0 }, fixd: F = { x: 0, v: 0 }, fv: V = [0, 0, 0], rv: V = [0, 0, 0]
const PRE = [1, 0, 0, 0, 1, 0, 1, 1] // a subframe's preamble
// navigation bit n of satellite i: each 300-bit subframe opens with the preamble; the rest is its data, here unknown
const bit = (i: number, n: number) => (n % 300 < 8 ? PRE[n % 300] * 2 - 1 : hash(n * 7.13 + i * 101.7) > 0 ? 1 : -1)
export function draw(k: number) {
  const th = ctx.models['gps-thread']
  if (th?.traced) th.traced = undefined
  if (untraced < GRAPHICS.length) for (const id of GRAPHICS) if (ctx.models[id]?.traced) (ctx.models[id].traced = undefined), untraced++
  if (!ready) {
    site(PLACES[k].lat, PLACES[k].lon, n), frame(n, E, N)
    for (let i = 0; i < 3; i++) (O[i] = n[i]), (rx[i] = n[i] * (1 + 8.6 * MM))
    ;(yaw = PLACES[k].view[2]), (ready = true)
  }
  const dt = ctx.dt, here = ctx.focus === k
  if (here !== was) (was = here), here && cold()
  sky(ctx.t)
  if (here) search(dt, ctx.t)
  // it comes apart a few seconds after the camera comes to rest; the board picked rises a little more and turns
  follow(apart, here && ctx.since > 3 ? 1 : 0, 2.2, dt)
  follow(held, here && ctx.picked === 'ephemeris' ? 1 : 0, 2.6, dt)
  follow(shown, here ? 1 : 0, 3, dt)
  spin = held.x > 0.01 ? spin + 0.3 * dt : 0

  // the board: off the plug, up and tipped toward the north (where the camera stands); picked, a little higher and
  // turning slowly over about its own length, so both faces come round
  const a = apart.x, p = held.x, tip = -0.25 * a * (1 - p), over = spin * p
  const bx = 14 * clamp(2 * a), by = FOOT + 12 * a + 18 * p
  for (let i = 0; i < 3; i++) (ax[i] = N[i]), (ay[i] = O[i]), (az[i] = E[i])
  rot(ax, E, tip), rot(ay, E, tip), rot(az, E, tip), rot(ay, ax, over), rot(az, ax, over)
  put('ephemeris', bx, by, 0, ax, ay, az, 1000)
  for (let i = 0; i < 3; i++) (ax[i] = N[i]), (ay[i] = O[i]), (az[i] = E[i])
  put('l1-cable', 0, 0, 0, ax, ay, az)
  put('l1-patch', PATCH[0], 0, PATCH[2], ax, ay, az)
  if (here) {
    world(bx, by + 3.5, 0, c), part('ephemeris', c, 26 * MM)
    world(PATCH[0], 4, PATCH[2], c), part('antenna', c, 25 * MM)
  }

  // the sky, and the threads to what is found
  const f = shown.x
  if (f < 0.01) return void lit.fill(0)
  world(PATCH[0], PATCH[1], PATCH[2], pc)
  // (nine slots: the eight channels and the one being searched for; each satellite there with its thread)
  let slot = 0
  for (let i = 0; i < 24; i++) {
    lit[i] += ((here ? found[i] : 0) - lit[i]) * (1 - Math.exp(-(found[i] >= 1 ? 5 : 2) * dt))
    if (lit[i] < 0.01 || slot >= 9) continue
    slot++
    for (let j = 0; j < 3; j++) sv[j] = SV[3 * i + j]
    // the satellite, its nadir panel down and its wings square to the sun
    for (let j = 0; j < 3; j++) sy[j] = -sv[j]
    unit(sy), cross(sy, ctx.L, sz), unit(sz), cross(sy, sz, sx)
    if (!solid('gps-sv', sv, sx, sy, sz, 0.014 * f, 1, 0.6 + 2 * clamp(lit[i]))) none('gps-sv')
    for (let j = 0; j < 3; j++) c[j] = pc[j] + (sv[j] - pc[j]) * lit[i]
    thread(pc, c, 1.8, f * (found[i] >= 1 ? 3 : 1.5))
  }
  for (; slot < 9; slot++) none('gps-sv'), none() // (the satellites' slots keep a model the tracer knows next to its own)
  graphics(ctx.t, dt, f, here)
}

// The search, tracking and the fix, drawn as they stand now (f: how much the place is shown).
function graphics(t: number, dt: number, f: number, here: boolean) {
  for (let i = 0; i < 3; i++) (ax[i] = N[i]), (ay[i] = O[i]), (az[i] = E[i])
  // the search: rows rise as the sweep passes them, and sink once it has locked, before the next begins
  follow(sunk, cur >= 0 || rest > 0.35 || !more ? 1 : 0, 9, dt)
  const sweep = cur >= 0 ? bin : last >= 0 ? BINS : 0, s = f * clamp(sunk.x), sat = cur >= 0 ? cur : last, off = sat < 0 ? 0 : (sat * 3) % BANDS
  for (let b = 0; b < BANDS; b++) {
    const h = s * smooth(0, 1, (sweep - 7 * b - 7) / 4)
    h > 0.01 ? lay(`acq-${(b + off) % BANDS}`, SURF[0] + 7 * b * DX, SURF[1], SURF[2], ax, ay, az, h, 0.2, 2.2 * f) : none()
  }
  const hp = sat >= 0 ? s * smooth(0, 1, (sweep - prow) / 2) * ph : 0
  hp > 0.05 ? lay('acq-peak', SURF[0] + prow * DX, SURF[1], SURF[2] + pcol * DZ, ax, ay, az, hp / 20, 0.2, 9 * f) : none()
  // tracking the satellite last locked: the code loop (DLL) takes up the half-lag the search left, the carrier loop the
  // Doppler left in the bin (shown slowed), both settling in a second; then the navigation bits, 25× slow
  follow(trk, here && last >= 0 ? 1 : 0, 4, dt)
  const g = f * clamp(trk.x)
  if (g <= 0.01) for (let i = 0; i < 9; i++) none()
  else {
    for (let i = 0; i < 3; i++) fv[i] = N[i] * Math.cos(yaw) + E[i] * Math.sin(yaw)
    cross(fv, O, rv), (rv[0] = -rv[0]), (rv[1] = -rv[1]), (rv[2] = -rv[2]) // the camera's right, at its rest
    const x = TRK[0], y = TRK[1], z = TRK[2], tl = Math.max(0, t - lastT), d0 = perr / 2, wd = 6
    const dly = d0 * (1 + wd * tl) * Math.exp(-wd * tl) // chips
    const phi = (Math.PI * hash(last * 3.7) + TAU * 0.7 * (pres / 250) * tl) * Math.exp(-tl / 0.6)
    const nb = Math.floor(tl * 2) + ((last * 37) % 300), u = tl * 2 - Math.floor(tl * 2)
    const sg = bit(last, nb - 1) + (bit(last, nb) - bit(last, nb - 1)) * smooth(0, 1, u / 0.25)
    lay('trk-tent', x, y, z, rv, O, fv, 1, 0.2, 3 * g)
    for (let j = -1; j <= 1; j++) {
      const tau = j * 0.5 - dly, r = Math.max(0, 1 - Math.abs(tau))
      for (let q = 0; q < 3; q++) c[q] = rv[q] * tau * CHIP
      lay('trk-stem', x + dot(c, N), y + dot(c, O), z + dot(c, E), ax, ay, az, Math.max(r * TALL, 0.01), 0.2, 2 * g)
      for (let q = 0; q < 3; q++) c[q] += O[q] * r * TALL
      lay(j ? 'trk-bead' : 'trk-p', x + dot(c, N), y + dot(c, O), z + dot(c, E), ax, ay, az, 1, 0.4, (j ? 3 : 8) * g)
    }
    // the prompt's I and Q, beside it
    const ix = x + dot(rv, N) * (1.5 * CHIP + IQ + 4), iz = z + dot(rv, E) * (1.5 * CHIP + IQ + 4), iy = y + IQ + 2
    lay('trk-iq', ix, iy, iz, rv, O, fv, 1, 0.4, 2 * g)
    const m = sg * Math.max(0, 1 - Math.abs(dly)) * IQ
    for (let q = 0; q < 3; q++) c[q] = rv[q] * m * Math.cos(phi) + O[q] * m * Math.sin(phi)
    lay('trk-prompt', ix + dot(c, N), iy + dot(c, O), iz + dot(c, E), ax, ay, az, 1, 0.4, 9 * g)
  }
  // the fix: the Pico's own, from the recording, five a second from the first
  follow(fixd, here && fixT >= 0 && t >= fixT ? 1 : 0, 3, dt)
  const q = f * clamp(fixd.x)
  if (q <= 0.01) for (let i = 0; i < CHUNKS + 2; i++) none()
  else {
    const n = Math.max(0, Math.floor((t - fixT) * 5)), [e, nn] = FIXES[n % FIXES.length]
    lay('fix-disc', FIX[0], FIX[1], FIX[2], ax, ay, az, 1, 0.3, 2 * q)
    for (let j = 0; j < CHUNKS; j++) j * CHUNK <= n ? lay(`fix-${j}`, FIX[0], FIX[1] + 0.2, FIX[2], ax, ay, az, 1, 0.3, 4 * q * smooth(0, 1, (n - j * CHUNK) / 6)) : none()
    lay('fix-now', FIX[0] + nn * M4, FIX[1] + 1, FIX[2] + e * M4, ax, ay, az, 1, 0.3, 12 * q)
  }
  if (here) {
    world(SURF[0] + 24 * DX, 6, SURF[2] + 32, c), part('search', c, 34 * MM)
    if (g > 0.5) world(TRK[0] + dot(rv, N) * 12.5, TRK[1] + 12, TRK[2] + dot(rv, E) * 12.5, c), part('tracking', c, 30 * MM)
    if (q > 0.5) world(FIX[0], FIX[1], FIX[2], c), part('fix', c, 36 * MM)
  }
}

// What its parts are, for the page.
export const about: Record<string, About> = {
  ephemeris: { name: 'Ephemeris 1', does: 'A MAX2769B takes GPS L1 in through the SMA and hands raw I/Q, on a four-bit bus at 16.368 MHz, to an RP2350 that acquires, tracks and fixes at 5 Hz. $32.96 of parts.', board: 'gnss' },
  antenna: { name: 'L1 patch', does: 'A passive L1 patch: a 25 mm ceramic square on its ground plate, cut at two corners for right-hand circular polarisation. Rev 1 sends no antenna bias, so it takes a passive one.' },
  search: { name: 'acquisition', does: 'Acquisition: every code phase of a satellite’s C/A code (1023 chips, as 2046 half-chip lags) against every Doppler bin from −12 to +12 kHz, 499.5 Hz apart (a 1 ms dwell, its FFT zero-padded to 4096), four 1 ms correlations summed. Noise everywhere but one cell: where the code lines up, the peak. The Pico finds a strong satellite across ±70 kHz in 5.7 s.' },
  tracking: { name: 'tracking', does: 'Early, prompt and late correlators, half a chip apart, slide along the code’s correlation until early and late are equal; the prompt’s I and Q settle onto the I axis as the carrier loop locks, then flip with each navigation bit, 50 a second (here 25× slow). Eight channels on the Pico at 150 MHz.' },
  fix: { name: 'fix', does: 'The Pico’s own 223 position fixes, five a second, from a real rooftop recording (CTTC, Spain, 2013), each drawn where it fell from GNSS-SDR’s fix at the same instant: half within 2.56 m (the ring), 95 % within 5.8. Cold, its first fix came 55 s in.' },
}

// What it sounds like: every satellite in view as its carrier is once its code is wiped off, a pure tone, a chord of
// them. Each PRN has its own note of the pentatonic over 330 Hz (1320 Hz, the receiver's tone, two octaves down), and
// its Doppler bends it by up to a quarter tone, so each rises sharp and sets flat across its pass and the chord beats
// slowly against itself; each as loud as 1/ρ, coming in as it clears the mask. The one being searched for sings out,
// as its thread reaches for it.
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

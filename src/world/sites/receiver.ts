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
import { box, disc, line, make, pipe, quad, slab, text, tube } from '../make'
import { ctx, cross, dot, frame, part, site, solid, unit, type V } from '../ctx'
import { PLACES, type About } from '../places'
import { C, DEG, RE, orbit } from './sky'

const RATE = 0.05, SHELL = 4.17, INC = 55 * DEG // the shell
const LAPSE = RATE / (TAU / 43082) // real seconds a scene second: a GPS orbit is half a sidereal day
const MASK = Math.sin(5 * DEG) // elevation mask
const BIN = 2046 / 4.096, SPAN = 12000, BINS = 49, SWEEP = 40 // Hz a bin; the search's ±Hz, its bins; bins a second here

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
// They are drawn on one instrument, a dark glass panel in a bronze bezel standing on the ground in front of the patch,
// tilted back to the camera's own rest: in warm white, the place's blue kept for what is live. Three panes, left to
// right: the search, tracking, the fix; the whole one part. Panel millimetres: u across, v up its face, w out of it.
const PW = 52, PH = 50, TILT = 0.21, PS = 0.72, PANEL = [-42, 4.5, 128] // its half-width and height (its own mm); its lean back; its size here; where its foot's middle is
const WARM = { col: [1, 0.9, 0.78, 1], metal: 0, rough: 0.7 }, LIVE = { col: [0.62, 0.9, 1, 1], metal: 0, rough: 0.6 }
const GLASS = { col: [0.014, 0.013, 0.012, 1], metal: 0, rough: 0.08 }, BRONZE = { col: [0.16, 0.13, 0.1, 1], metal: 0.85, rough: 0.38 }
//
// The search, left: a line for every other Doppler bin (of the 49, front, low, to back, high), across it the code phase
// (one 1023-chip period's 2046 half-chip lags, as 128 points, each the largest of its 16), its height the power of
// four 1 ms correlations summed, each line hiding those behind it. Where nothing lines up it is what a correlator makes
// of noise, χ² with eight degrees of freedom (one draw of it, kept), and the sweep brings the lines up seven at a time.
// Where the satellite's C/A code lines up, at its code phase (its range, mod a light-millisecond) and its Doppler, the
// peak: as tall as its C/N0 makes it (38 dB-Hz low in the sky to 48 overhead, assumed), as wide across the lags as the
// code's own correlation (gps.ts), and along Doppler the sinc² of a 1 ms dwell, a bin either side at 0.41.
const COLS = 128, LAGS = 2046 / COLS, A0 = -48, AW = 30, AV = 7, DV = 0.62, PEAK = 12 // the pane's left, width, first line's height, mm a bin; the peak at 45 dB-Hz
const du = AW / (COLS - 1), lz = (r: number) => 0.2 + 0.012 * (BINS - 1 - r) // a line's u spacing; its depth out of the glass, the front nearest
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
// one line r at height v0, its profile h, and under it a mask of the glass down to its own foot
function row(r: number, v0: number, h: (c: number) => number, c0 = 0, c1 = COLS - 1, m = WARM) {
  const z = lz(r), pts: [number, number][] = []
  for (let c = c0; c <= c1; c++) pts.push([A0 + c * du, v0 + h(c)])
  for (let i = 0; i + 1 < pts.length; i++) quad(GLASS, [pts[i][0], v0 - 0.3, z - 0.006], [pts[i + 1][0], v0 - 0.3, z - 0.006], [pts[i + 1][0], pts[i + 1][1], z - 0.006], [pts[i][0], pts[i][1], z - 0.006], [0, 0, 1])
  line(m, pts, z, 0.16)
}
// made as five bands of ten bins (five lines); a search starts the noise at any band, so each satellite's looks its own
const BANDS = 5
for (let b = 0; b < BANDS; b++) make(`acq-${b}`, () => { for (let i = 0; i < 10; i += 2) row(i, i * DV, (c) => H[10 * b + i][c]) })
// the peak's line, 1 tall (it stands on its own bin's line and those either side): across, the code's correlation at the
// half-chip lags round its own (R(0) = 1, R(±½) = ½, then −1/1023), as power; along, sinc²(0.4995 k)
const R = (lag: number) => {
  const c = CODES[0]
  let s = 0
  for (let i = 0; i < 2046; i++) s += (2 * c[i >> 1] - 1) * (2 * c[(((i + lag) % 2046) + 2046) % 2046 >> 1] - 1)
  return s / 2046
}
const SINC2 = (x: number) => (x ? (Math.sin(Math.PI * x) / (Math.PI * x)) ** 2 : 1)
make('acq-peak', () => {
  const pts: [number, number][] = [-1, -1 / LAGS, 0, 1 / LAGS, 1].map((u) => [u * du, u ? (Math.abs(u) < 1 ? R(1) ** 2 : 0) : R(0) ** 2])
  quad(GLASS, [-du, -0.3, -0.006], [du, -0.3, -0.006], [0, 1, -0.006], [0, 1, -0.006], [0, 0, 1])
  line(LIVE, pts, 0, 0.18)
})
//
// Tracking, middle: the code's correlation R(τ) over ±1.5 chips (computed from the code, a triangle on its −1/1023
// floor), and on it the early, prompt and late correlators, half a chip apart, each on a stem; under it the prompt's I
// and Q, the circle River liked.
const CHIP = 8.5, T0 = 25, TALL = 16, IQV = 13, IQ = 9 // mm a chip, the curve's foot and R = 1's height; the I/Q circle's middle and radius
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
make('rx-dot', () => disc(WARM, 0, 0, 0, 0.55, 16))
make('rx-live', () => disc(LIVE, 0, 0, 0, 0.8, 20))
make('rx-stem', () => line(WARM, [[0, 0], [0, 1]], 0, 0.1)) // a unit tall
//
// The fix, right: where the receiver put the antenna, fix by fix, five a second, against GNSS-SDR's fixes on the same
// recording, east across and north up, 2.2 mm a metre, ticked every metre: the Pico's own 223 from the CTTC rooftop
// (docs/software/real-sky.md). Half lie within 2.56 m (the ring), 95 % within 5.8 (the faint one).
const F0 = 34, FV = 25, M4 = 2.2, CHUNK = 32
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
for (let j = 0; j * CHUNK < FIXES.length; j++)
  make(`fix-${j}`, () => { for (const [e, nn] of FIXES.slice(j * CHUNK, (j + 1) * CHUNK)) disc(WARM, F0 + e * M4, FV + nn * M4, 0.25, 0.32, 10) })
const CHUNKS = Math.ceil(FIXES.length / CHUNK)
const circle = (x: number, y: number, r: number): [number, number][] => Array.from({ length: 73 }, (_, i) => [x + r * Math.cos((i / 72) * TAU), y + r * Math.sin((i / 72) * TAU)])
// the instrument: bezel, glass, foot, and what on it stands still (the panes' rules, the correlation's curve, the I/Q
// circle, the plot's axes, ticks and rings, and its one figure)
make('rx-panel', () => {
  box(BRONZE, [-PW - 2, -2, -5], [PW + 2, PH + 2, -0.6])
  box(GLASS, [-PW, 0, -0.6], [PW, PH, 0])
  for (const u of [-17, 17]) line(WARM, [[u, 4], [u, PH - 4]], 0.1, 0.06)
  line(WARM, Array.from({ length: 61 }, (_, i): [number, number] => [(i / 20 - 1.5) * CHIP, T0 + Math.max(0, Rc(i / 20 - 1.5)) * TALL]), 0.15, 0.16)
  line(WARM, [[-1.6 * CHIP, T0], [1.6 * CHIP, T0]], 0.15, 0.08)
  line(WARM, circle(0, IQV, IQ), 0.15, 0.12)
  line(WARM, [[-IQ - 2, IQV], [IQ + 2, IQV]], 0.15, 0.12) // I
  line(WARM, [[0, IQV - IQ - 2], [0, IQV + IQ + 2]], 0.15, 0.06) // Q
  line(WARM, [[F0 - 15.4, FV], [F0 + 15.4, FV]], 0.15, 0.06), line(WARM, [[F0, FV - 15.4], [F0, FV + 15.4]], 0.15, 0.06)
  for (let k = -7; k <= 7; k++) {
    if (!k) continue
    const t = k % 5 ? 0.45 : 0.9
    line(WARM, [[F0 + k * M4, FV - t], [F0 + k * M4, FV + t]], 0.15, 0.06), line(WARM, [[F0 - t, FV + k * M4], [F0 + t, FV + k * M4]], 0.15, 0.06)
  }
  line(LIVE, circle(F0, FV, 2.563 * M4), 0.16, 0.12)
  line(WARM, circle(F0, FV, 5.8 * M4), 0.15, 0.05)
  text(() => WARM, '2.56 m', F0 + 4.3, FV + 4.6, 0.16, 1.1, 0.09)
})
make('rx-foot', () => box(BRONZE, [-PW - 4, 0, -7], [PW + 4, 4, 7]))
make('rx-none', () => box(WARM, [0, 0, 0], [1e-3, 1e-3, 1e-3])) // nothing, holding a slot
const GRAPHICS = ['rx-none', 'rx-panel', 'rx-foot', 'acq-peak', 'rx-dot', 'rx-live', 'rx-stem', ...Array.from({ length: BANDS }, (_, b) => `acq-${b}`), ...Array.from({ length: CHUNKS }, (_, j) => `fix-${j}`)]

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
  ;(x += 15), (z -= 74)
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

// The instrument, as it stands now (f: how much the place is shown).
const PU: V = [0, 0, 0], PV: V = [0, 0, 0], PN: V = [0, 0, 0], at3: V = [0, 0, 0], b3 = [0, 0, 0]
// panel point (u, v, w) to the bench
function pp(u: number, v: number, w: number) {
  for (let q = 0; q < 3; q++) at3[q] = (PU[q] * u + PV[q] * v + PN[q] * w) * PS
  ;(b3[0] = PANEL[0] + dot(at3, N)), (b3[1] = PANEL[1] + dot(at3, O)), (b3[2] = PANEL[2] + dot(at3, E))
  return b3
}
const SU: V = [0, 0, 0], SV2: V = [0, 0, 0], SN: V = [0, 0, 0]
const onPanel = (id: string, u: number, v: number, w: number, sy: number, k: number, glow: number) => {
  const b = pp(u, v, w)
  for (let q = 0; q < 3; q++) (SU[q] = PU[q] * PS), (SV2[q] = PV[q] * PS), (SN[q] = PN[q] * PS)
  lay(id, b[0], b[1], b[2], SU, SV2, SN, sy, k, glow)
}
function graphics(t: number, dt: number, f: number, here: boolean) {
  // the panel faces the camera's rest, leaning back
  for (let i = 0; i < 3; i++) {
    const fw = N[i] * Math.cos(yaw) + E[i] * Math.sin(yaw)
    ;(fv[i] = fw), (PV[i] = O[i] * Math.cos(TILT) - fw * Math.sin(TILT)), (PN[i] = fw * Math.cos(TILT) + O[i] * Math.sin(TILT))
  }
  cross(fv, O, rv), (rv[0] = -rv[0]), (rv[1] = -rv[1]), (rv[2] = -rv[2]), (PU[0] = rv[0]), (PU[1] = rv[1]), (PU[2] = rv[2])
  onPanel('rx-panel', 0, 0, 0, 1, 1, 2.5 * f)
  for (let i = 0; i < 3; i++) (ax[i] = rv[i] * PS), (ay[i] = O[i] * PS), (az[i] = fv[i] * PS)
  lay('rx-foot', PANEL[0], 0, PANEL[2], ax, ay, az, 1, 1, 0)
  // the search: its lines come up as the sweep passes them, and fade once it has locked, before the next begins
  follow(sunk, cur >= 0 || rest > 0.35 || !more ? 1 : 0, 9, dt)
  const sweep = cur >= 0 ? bin : last >= 0 ? BINS : 0, s = f * clamp(sunk.x), sat = cur >= 0 ? cur : last, off = sat < 0 ? 0 : (sat * 3) % BANDS
  for (let b = 0; b < BANDS; b++) {
    const h = s * smooth(0, 1, (sweep - 10 * b - 9) / 5)
    h > 0.01 ? onPanel(`acq-${(b + off) % BANDS}`, 0, AV + 10 * b * DV, -0.12 * b, 1, 0.15, 2.4 * h) : none()
  }
  for (let k = -1; k <= 1; k++) {
    const r = prow + k, hp = sat >= 0 && r >= 0 && r < BINS ? s * smooth(0, 1, (sweep - r) / 2) * ph * SINC2(0.4995 * k) : 0
    hp > 0.05 ? onPanel('acq-peak', A0 + pcol * du, AV + r * DV, lz(r) + 0.004, hp, 0.15, 6 * s) : none()
  }
  // tracking the satellite last locked: the code loop (DLL) takes up the half-lag the search left, the carrier loop the
  // Doppler left in the bin (shown slowed), both settling in a second; then the navigation bits, 25× slow
  follow(trk, here && last >= 0 ? 1 : 0, 4, dt)
  const g = f * clamp(trk.x)
  if (g <= 0.01) for (let i = 0; i < 7; i++) none()
  else {
    const tl = Math.max(0, t - lastT), d0 = perr / 2, wd = 6
    const dly = d0 * (1 + wd * tl) * Math.exp(-wd * tl) // chips
    const phi = (Math.PI * hash(last * 3.7) + TAU * 0.7 * (pres / 250) * tl) * Math.exp(-tl / 0.6)
    const nb = Math.floor(tl * 2) + ((last * 37) % 300), u = tl * 2 - Math.floor(tl * 2)
    const sg = bit(last, nb - 1) + (bit(last, nb) - bit(last, nb - 1)) * smooth(0, 1, u / 0.25)
    for (let j = -1; j <= 1; j++) {
      const tau = j * 0.5 - dly, r = Math.max(0, 1 - Math.abs(tau))
      onPanel('rx-stem', tau * CHIP, T0, 0.2, Math.max(r * TALL, 0.01), 0.15, 1.6 * g)
      onPanel(j ? 'rx-dot' : 'rx-live', tau * CHIP, T0 + r * TALL, 0.3, 1, 0.15, (j ? 3 : 7) * g)
    }
    const m = sg * Math.max(0, 1 - Math.abs(dly)) * IQ
    onPanel('rx-live', m * Math.cos(phi), IQV + m * Math.sin(phi), 0.3, 1, 0.15, 7 * g)
  }
  // the fix: the Pico's own, from the recording, five a second from the first
  follow(fixd, here && fixT >= 0 && t >= fixT ? 1 : 0, 3, dt)
  const q = f * clamp(fixd.x)
  if (q <= 0.01) for (let i = 0; i < CHUNKS + 1; i++) none()
  else {
    const n = Math.max(0, Math.floor((t - fixT) * 5)), [e, nn] = FIXES[n % FIXES.length]
    for (let j = 0; j < CHUNKS; j++) j * CHUNK <= n ? onPanel(`fix-${j}`, 0, 0, 0, 1, 0.15, 2.4 * q * smooth(0, 1, (n - j * CHUNK) / 6)) : none()
    onPanel('rx-live', F0 + e * M4, FV + nn * M4, 0.35, 1, 0.15, 7 * q)
  }
  // each pane is a part
  if (here) {
    const b = pp(0, PH / 2, 0)
    world(b[0], b[1], b[2], c), part('display', c, (PW + 2) * PS * MM)
  }
}

// What its parts are, for the page.
export const about: Record<string, About> = {
  ephemeris: { name: 'Ephemeris 1', does: 'A MAX2769B takes GPS L1 in through the SMA and hands raw I/Q, on a four-bit bus at 16.368 MHz, to an RP2350 that acquires, tracks and fixes at 5 Hz. $32.96 of parts.', board: 'gnss' },
  antenna: { name: 'L1 patch', does: 'A passive L1 patch: a 25 mm ceramic square on its ground plate, cut at two corners for right-hand circular polarisation. Rev 1 sends no antenna bias, so it takes a passive one.' },
  display: { name: 'the receiver, live', does: 'Left, the search: a satellite’s C/A code tried at every code phase (1023 chips, as 2046 half-chip lags) and every Doppler bin from −12 to +12 kHz, 499.5 Hz apart, four 1 ms correlations summed; noise but for one peak, where the code lines up. Middle, tracking: early, prompt and late correlators half a chip apart, settling until early equals late; below, the prompt’s I and Q coming onto the I axis as the carrier loop locks, then flipping with each 50 bit/s navigation bit (25× slow). Right, the fix: the Pico’s own 223 fixes from a real rooftop recording (CTTC, 2013), five a second, against GNSS-SDR’s on the same data: half within 2.56 m, 95 % within 5.8.' },
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

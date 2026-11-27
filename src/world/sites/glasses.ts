// strobeGlasses: River's open strobe glasses, MK1, on a stand facing south, doing what they are for: a ball is lobbed at
// them, again and again, rising over the horizon (on a planet this small, half a metre off at their height), peaking
// level with the lenses, bouncing once in front of them and flying on past the right temple, out of sight behind.
//
// The glasses run their fastest and darkest, 20 frames a second at 80 % dark, so each valve is clear for 10 ms in every
// 50. Arriving, the camera goes behind the right lens: through it the ball is only where it was while the valve was last
// clear, a run of still pictures, and under it and past the rim, where the lens does not reach, it flies on smoothly.
// Here time runs ten times slow, so a valve opens twice a second on the screen (never more: a lens large on the screen
// must not flicker faster than 3 Hz) and a lob takes the half second or so it would. After a while River's board comes
// off the right temple (clickable any time); clicked, it comes out, lit, and turns to show both faces.
import { TAU, clamp, glide, smooth } from '../../acts/scene'
import { Plucks } from '../../dsp/pluck'
import { ball, box, make, tube, type Mat } from '../make'
import { ctx, frame, part, site, solid, turn, type V } from '../ctx'
import { PLACES, type About, type Steer } from '../places'

const SLOW = 10
const FS = 20, CLEAR = 0.2 // the strobe: frames a second, and the share of each a valve is clear
const GS = 0.13, GM = GS / 150.3 // the glasses, radii across, and radii to a millimetre of them
export const LIFT = 76 * GM // how high the stand holds them
// Where River's CAD puts the panes and the board (mechanical/strobe-glasses-mk1.step, valve_left, valve_right and the
// MK1 PCB, in the frame's own millimetres about its middle; x east, y up, z north once it stands here): each 36.2 mm pane
// in its slot, turned 20° about the vertical with the frame's wrap, its middle 30.2 mm out, 2.1 mm under the frame's
// middle and 24.3 mm forward of it; the board on edge on the right temple's outer face, its parts outward, its USB-C
// to the back.
const MID = LIFT / GM + 23.09, PANE = [30.2, -2.1, -24.3], WRAP = (20 * Math.PI) / 180, BOARD = [-75.6, MID - 3.1, 10.05]
const EYE = MID + PANE[1] // the lenses' middle, mm up
const valve = (t: number) => t * FS - Math.floor(t * FS) < CLEAR // is a valve clear at real time τ?

// ---- what is not in the CAD, in millimetres: each LCD valve, clear and dark, a little larger than the frame's window
// it sits behind; the glasses' stand; the ball, a tennis ball (67 mm) with its seam -------------------------------------
const W = 36.2, T = 1.83 // the pane: Adafruit 3627, square, its glass 1.83 mm
make('valve-clear', () => box({ col: [0.04, 0.045, 0.04, 0.55], metal: 0, rough: 0.05 }, [-W / 2, -W / 2, -T / 2], [W / 2, W / 2, T / 2]))
make('valve-dark', () => box({ col: [0.004, 0.005, 0.006, 0.985], metal: 0, rough: 0.05 }, [-W / 2, -W / 2, -T / 2], [W / 2, W / 2, T / 2]))
make('glasses-stand', () => {
  const dark: Mat = { col: [0.03, 0.03, 0.035, 1], metal: 0.8, rough: 0.4 }
  tube(dark, [0, 0, 0], [0, 1, 0], 4, 3, 81, 24, true)
  box(dark, [-7, 79, -5], [7, 81, 5])
  tube(dark, [0, 0, 0], [0, 1, 0], 16, 15, 2.5, 32, true)
})
const R = 33.5
make('tennis-ball', () => {
  ball({ col: [0.55, 0.78, 0.03, 1], metal: 0, rough: 0.95 }, [0, 0, 0], R, 32)
  // the seam: (a cos θ + b cos 3θ, a sin θ − b sin 3θ, 2√(ab) sin 2θ) lies on the unit sphere when a + b = 1
  const white: Mat = { col: [0.85, 0.85, 0.8, 1], metal: 0, rough: 0.9 }, a = 0.69, b = 0.31, n = 96, at = (t: number) => [a * Math.cos(t) + b * Math.cos(3 * t), a * Math.sin(t) - b * Math.sin(3 * t), 2 * Math.sqrt(a * b) * Math.sin(2 * t)].map((x) => x * (R + 0.3))
  for (let i = 0; i < n; i++) {
    const p = at((i / n) * TAU), q = at(((i + 1) / n) * TAU), d = q.map((x, j) => x - p[j]), l = Math.hypot(...d)
    tube(white, p as [number, number, number], d.map((x) => x / l) as [number, number, number], 1.4, 1.4, l, 6)
  }
})

// ---- the lob, in the place's own millimetres (x east, y up from the ground, z north), under the place's own g: it rises
// over the horizon, peaks at the lenses' height 450 mm out (seen through the right lens from behind it), drifting west so
// it passes the right temple, bounces at e = 0.75 (a tennis ball's) where the ground is (the planet curving away under
// it), and goes on north, out of sight. -------------------------------------------------------------------------------
const G0 = 9810, VZ = 1200, ZA = -486, YA = EYE + 10, XA = -35, VX = -81 / (450 / VZ), E_ = 0.75, RP = 1 / GM // mm/s², mm/s, its peak, mm/s, restitution, the planet's radius
const PERIOD = 0.8, T0 = 0.3, LIFE = 1.2, PHASE = 0.22 // s between lobs; it peaks T0 after it clears the horizon, and is out of every view
// LIFE after; and the lobs' phase, so one is coming down past the glasses as the arrival's fly-past goes by (planet time −10.3 s)
const floor = (t: number) => {
  const x = XA + VX * t, z = ZA + VZ * t
  return R - (x * x + z * z) / (2 * RP) // the ball's middle when it touches the ground then
}
// each arc: when it starts, its height and its upward speed then
const arcs: [t: number, y: number, vy: number][] = [[0, YA, 0]]
for (let k = 0; k < 3; k++) {
  // when it comes down to the ground again: the later root, by bisection
  const [t0, y0, vy] = arcs[k], h = (dt: number) => y0 + vy * dt - (G0 * dt * dt) / 2 - floor(t0 + dt)
  let lo = vy / G0, hi = lo + 2
  for (let i = 0; i < 50; i++) h((lo + hi) / 2) > 0 ? (lo = (lo + hi) / 2) : (hi = (lo + hi) / 2)
  arcs.push([t0 + lo, floor(t0 + lo), E_ * (G0 * lo - vy)])
}
// where a lob is, t seconds after its peak (before it, too): [x, y, z]
function lob(t: number, o: V) {
  let k = arcs.length - 1
  while (k > 0 && t < arcs[k][0]) k--
  const [t0, y0, vy] = arcs[k], dt = t - t0
  return (o[0] = XA + VX * t), (o[1] = y0 + vy * dt - (G0 * dt * dt) / 2), (o[2] = ZA + VZ * t), o
}

// ---- the parts, and coming apart --------------------------------------------------------------------------------------
export const about: Record<string, About> = {
  'strobe-frame': { name: 'MK1 frame', does: 'A printed frame (PETG or resin) with a swept brow cover held by two screws from above. Each LCD valve slides down into its rim; a narrow plate along the top edge catches the glass at its four corners.' },
  'strobe-board': { name: 'strobeGlasses MK1 board', does: '41.2 × 15.25 mm, two layers, on the right temple over a 40 mAh cell: an ATtiny402 at 5 MHz cuts each dark window into balanced pairs, +3.3 V then −3.3 V for 5 ms each, so the liquid crystal never sits on DC; USB-C charging; one button for the presets.', board: 'strobe.webp' },
}
about['strobe-valve-l'] = about['strobe-valve-r'] = { name: 'LCD light valve', does: 'Adafruit 3627: a liquid-crystal shutter, 1.83 mm glass, dark while driven and clear when its leads are shorted. Here it runs 20 frames a second, 80 % dark: clear 10 ms in every 50.' }
// the board on the right temple's outer face (mm, the glasses' own frame: x east, y up, z north), and where it goes apart
const APART = 16 // s at rest before the board comes off
let apart = 0, lift = 0, vlift = 0, spin = 0
// What the world's music hears from here (sound.ts): n, how many times the lenses have opened so far; f, 100 Hz, the
// valves' drive (±3.3 V pairs, 5 ms a half)
export const events = { n: 0, f: 100 }
let frames = NaN

const n: V = [0, 0, 0], e: V = [0, 0, 0], N: V = [0, 0, 0], c: V = [0, 0, 0], ax: V = [0, 0, 0], ay: V = [0, 0, 0], az: V = [0, 0, 0]
const xyz: V = [0, 0, 0]
// a point of the glasses' place, mm from the frame's foot (x east, y up, z north)
const at = (x: number, y: number, z: number, o: V) => {
  for (let i = 0; i < 3; i++) o[i] = n[i] * (1.0005 + y * GM) + (e[i] * x + N[i] * z) * GM
  return o
}
// the board's middle as it is now: on the temple, or out to the west and up (apart, or clicked)
const B: V = [0, 0, 0]
function board(o: V) {
  const a = smooth(0, 1, Math.max(apart, lift))
  return at(BOARD[0] - 40 * a, BOARD[1] + 16 * a, BOARD[2], o)
}

export function draw(k: number) {
  const P = PLACES[k], dt = ctx.dt
  site(P.lat, P.lon, n)
  frame(n, e, N)
  // coming apart, after a while at rest here (and together again away); clicked, the board comes out and turns
  const here = ctx.focus === k
  apart = clamp(apart + (here && ctx.since > APART ? dt : -dt) / 2.5)
  const want = here && ctx.picked === 'strobe-board' ? 1 : 0, w = 3.2
  vlift += (w * w * (want - lift) - 2 * w * vlift) * dt
  lift = clamp(lift + vlift * dt, 0, 1)
  if (want) spin += 0.4 * dt
  else spin += (TAU * Math.round(spin / TAU) - spin) * (1 - Math.exp(-2.5 * dt))
  // each frame of the strobe opens the lenses once (a jump in the clock is one more, not a burst)
  const tau = ctx.t / SLOW, now = Math.floor(tau * FS)
  if (now > frames) events.n++
  frames = now
  if (n[0] * ctx.E[0] + n[1] * ctx.E[1] + n[2] * ctx.E[2] < 0.5) return
  const clear = valve(tau)
  // the frame, and the stand under its bridge
  for (let j = 0; j < 3; j++) (ax[j] = -e[j]), (az[j] = N[j])
  solid('strobe-frame', at(0, LIFT / GM + 23.09, 0, c), ax, n, az, GS)
  if (here) part('strobe-frame', at(0, MID, 0, c), 75 * GM)
  solid('glasses-stand', at(0, 40.5, -30, c), ax, n, az, 81 * GM)
  // the panes, in their slots
  for (const s of [-1, 1]) {
    // across the pane, out from the middle, turned back by the wrap; its face; up
    const cw = Math.cos(WRAP), sw = Math.sin(WRAP)
    for (let j = 0; j < 3; j++) (ax[j] = s * cw * e[j] + sw * N[j]), (az[j] = sw * e[j] - s * cw * N[j])
    solid(clear ? 'valve-clear' : 'valve-dark', at(s * PANE[0], EYE, PANE[2], c), ax, n, az, W * GM)
    if (here) part(s < 0 ? 'strobe-valve-r' : 'strobe-valve-l', c, 18 * GM)
  }
  // the board: its long side along the temple, the USB-C end (its −x) to the back, its parts outward (west), on edge
  for (let j = 0; j < 3; j++) (ax[j] = -N[j]), (ay[j] = -e[j]), (az[j] = -n[j])
  turn(ax, n, spin, ax), turn(ay, n, spin, ay) // (clicked, it turns about the vertical, its faces to every side)
  if (ctx.models['strobe-board']) {
    const m = ctx.models['strobe-board'], ext = Math.max(m.hi[0] - m.lo[0], m.hi[1] - m.lo[1], m.hi[2] - m.lo[2]), s = 1000 * GM
    board(B)
    for (let i = 0; i < 3; i++) c[i] = B[i] + (s * (ax[i] * (m.lo[0] + m.hi[0]) + ay[i] * (m.lo[1] + m.hi[1]) + az[i] * (m.lo[2] + m.hi[2]))) / 2
    solid('strobe-board', c, ax, ay, az, s * ext, 1 + 0.8 * lift, 0.15 * lift) // (lit up a little, clicked)
    if (here) part('strobe-board', B, 21 * GM)
  }
  // the lobs in flight, spinning (topspin, 6 turns a second) as they go
  for (let i = 0; i < 3; i++) (ax[i] = -e[i]), (ay[i] = n[i]), (az[i] = N[i])
  for (let j = Math.floor((tau - PHASE) / PERIOD); tau - PHASE - j * PERIOD < LIFE; j--) {
    const q = tau - PHASE - j * PERIOD - T0
    lob(q, xyz)
    turn(ay, ax, -TAU * 6 * q, ay), turn(az, ax, -TAU * 6 * q, az)
    solid('tennis-ball', at(xyz[0], xyz[1], xyz[2], c), ax, ay, az, 2 * R * GM)
    for (let i = 0; i < 3; i++) (ay[i] = n[i]), (az[i] = N[i])
  }
}

// ---- the camera, while it rests here: from behind them to just behind the right lens, then back out as the board comes
// off. [s, ln d, pitch, yaw, the point looked at (mm from the place's own: east, up, north)]
export const RISE = 0.07
const BACK = [Math.log(0.36), 0.1, 0.05, 0, 0, 0]
const EYEV = [Math.log(620 * GM), 0.02, 0, -PANE[0], EYE - (0.01 + RISE) / GM, -436] // the eye 220 mm behind the right pane, looking 400 mm past it
const OUT = [Math.log(0.3), 0.32, -0.75, 0, 0, 0]
const KEYS = [[0, ...BACK], [2.5, ...BACK], [5, ...EYEV], [APART, ...EYEV], [APART + 3, ...OUT]]
const cam = [0, 0, 0, 0, 0, 0]
export function steer(s: number, _picked: string, o: Steer) {
  if (s > APART + 3.5) return false
  glide(KEYS, s, cam)
  o.d = Math.exp(cam[0]), o.pitch = cam[1], o.yaw = cam[2]
  for (let i = 0; i < 3; i++) o.at[i] = (e[i] * cam[3] + n[i] * cam[4] + N[i] * cam[5]) * GM
  return true
}

// ---- what it sounds like, on the picture's clock: the valves' own drive, a low hum while they are dark (100 Hz, their
// ±3.3 V pairs) and quiet while they are clear, so it pulses twice a second as the lenses do; and the bounce in front of
// them, a soft tock.
const tock = new Plucks(48000, 0.3)
let hum = 0, ph = 0, was = false
export function voice(t: number, dt: number) {
  const tau = t / SLOW - PHASE, down = tau - PERIOD * Math.floor(tau / PERIOD) - T0 >= arcs[1][0]
  hum = clamp(hum + (valve(tau) ? -40 : 40) * dt)
  ph += 100 * dt, ph -= Math.floor(ph)
  if (down && !was) tock.strike(150, 0.25, 0, 0.25, 3) // (the bounce in front of them)
  was = down
  return 0.12 * hum * (Math.sin(TAU * ph) + Math.sin(3 * TAU * ph) / 3 + Math.sin(5 * TAU * ph) / 5) + tock.mono() // (a square's first three)
}

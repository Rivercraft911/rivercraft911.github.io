// BLEPS, River's next: Stanford SSI's 1U CubeSat with four cameras, in orbit at 550 km (1.086 radii) on a plane of
// its own beside SAMWISE's, its ground track over the valley and the strobe glasses. The 1U is River's own, as the optical
// simulator builds it (cubesat-imaging-sim's makeSpacecraft), in the pieces that come apart (bleps-*.glb): the frame,
// the deck with its patch antenna, the rear face with the 433 MHz tape dipole, and the four sides, each with its wing.
// Inside it, River's work, from River's own CAD: the TT&C board (Yapling), the payload board with its Jetson Orin NX,
// the cameras on it (the main camera, a FRAMOS IMX676C behind a 16 mm f/1.9, looking down through the deck; the 360
// pair, IMX676Cs behind fisheyes back to back, one through the deck, one through the rear face), the star tracker
// (a FRAMOS IMX900M behind an Edmund 16 mm f/1.8) up through the rear face under its baffle, and the three reaction
// wheels, each a FAULHABER 2610 (FAULHABER's own model, whole) with Finertia, River's motor-control board, on its back.
//
// The pointing. It looks straight down, and as one of River's places comes within reach (60° off nadir) it turns to
// hold it in the main camera, and lets it go behind. The orbit runs 547× life from afar, as SAMWISE's does, and slows
// to 15× as we come to it. The main camera's footprint goes to the planet (planet.ts): 550 km × 7.07 mm / 25 mm, a
// 155.7 km square.
// Apart. A few seconds after the camera comes to rest (or on a click) the sides slide off with their wings, the rear
// face rises with its dipole and the deck drops, and River's work comes out of the frame into an exploded view across
// the camera's view, the three reaction wheels first and to the front, each piece where it can be clicked: clicked,
// the camera goes to it (planet.ts), and it lifts a little and turns, to show both faces.
import { clamp } from '../../acts/scene'
import { PLACES } from '../places'
import { ctx, cross, dot, frame, part, site, solid, unit, type V } from '../ctx'
import type { About, Steer } from '../places'
import { DEG, RE, orbit } from './sky'

const A = 1.086, INC = 97.6 * DEG, RAAN = 258 * DEG, RATE = 0.6 // as SAMWISE's orbit, on another plane
const N0 = Math.sqrt(3.986004418e14 / (A * RE) ** 3), HERE = 15 * N0 // rad a real second; and here, 15× life
const MM = 0.028 / 100 // radii a millimetre: a 1U is the size of a landmark here, as SAMWISE's 2U is
const REACH = Math.cos(0.13) // 60° off nadir from 550 km is 7.4° of the planet away
export const HALF = (550e3 * 7.07) / 25 / 2 / RE // the footprint's half-width, radii
// The orbit's normal: the camera rides in the orbit's own frame (planet.ts).
export const NORMAL = cross(orbit(1, RAAN, INC, 0, [0, 0, 0]), orbit(1, RAAN, INC, Math.PI / 2, [0, 0, 0]))

// ---- the orbit and the pointing ------------------------------------------------------------------------------------
let u = 1.3, rate = RATE, tu = NaN // its argument of latitude (at planet time tu, once drawn), and how fast that goes
const B: V = orbit(A, RAAN, INC, u, [0, 0, 0]), r: V = [0, 0, 0], look: V = [0, -1, 0], want: V = [0, 0, 0]
const X: V = [1, 0, 0], Y: V = [0, 1, 0], Z: V = [0, 0, 1], e: V = [0, 0, 0], N: V = [0, 0, 0]
let LAND: V[] = [] // River's places on the ground (when first drawn: places.ts imports this)
export const sight = [0, 0, 0, 0, 0] // where the main camera looks, on the ground (a unit vector), how surely, and its picture's up (rad east of north)

// Where the spacecraft is now: what a camera that rides with it looks at.
// (At planet time t: the camera asks before draw() has moved it on, so it is carried forward to when it is asked,
// or the two would stand a frame apart and it would shake as the frames' lengths do.)
export const where = (o: V, t = tu) => orbit(A, RAAN, INC, u + rate * (clamp(t - tu, 0, 0.1) || 0), o)

export function draw(k: number) {
  const dt = ctx.dt, here = ctx.focus === k
  rate *= Math.exp(clamp(Math.log((here ? HERE : RATE) / rate), -1, 1) * (1 - Math.exp(-2.5 * dt)))
  u += rate * dt, tu = ctx.t
  orbit(A, RAAN, INC, u, B)
  for (let i = 0; i < 3; i++) r[i] = B[i] / A
  // the nearest of River's places in reach, or straight down
  if (!LAND.length) LAND = PLACES.map((P) => (P.lat < 80 ? site(P.lat, P.lon) : [0, 0, 0]))
  let best = REACH, at = -1
  LAND.forEach((g, j) => dot(g, r) > best && ((best = dot(g, r)), (at = j)))
  for (let i = 0; i < 3; i++) want[i] = at < 0 ? -r[i] : LAND[at][i] - B[i]
  unit(want)
  // turned toward it no faster than a small wheel can: 0.05 of the way a real second
  const f = 1 - Math.exp(-0.05 * (rate / N0) * dt)
  for (let i = 0; i < 3; i++) look[i] += (want[i] - look[i]) * f
  unit(look)
  // its axes: −y along the look, +z toward the orbit's normal side, where the camera rides
  for (let i = 0; i < 3; i++) Y[i] = -look[i]
  const hy = dot(NORMAL, Y)
  for (let i = 0; i < 3; i++) Z[i] = NORMAL[i] - Y[i] * hy
  unit(Z), cross(Y, Z, X)
  // where the main camera's axis meets the ground
  const b = dot(B, look), h = b * b - dot(B, B) + 1
  if (h > 0) for (let i = 0; i < 3; i++) sight[i] = B[i] + look[i] * (-b - Math.sqrt(h))
  sight[3] = h > 0 ? clamp(1 - (rate - HERE) / (4 * HERE)) : 0
  if (h > 0) unit(sight), frame(sight, e, N), (sight[4] = Math.atan2(dot(Z, e), dot(Z, N)))

  pieces(k)
}

// ---- the pieces --------------------------------------------------------------------------------------------------
// Each: its model; where it sits in the bus (mm, the bus's frame: x across, y away from the deck, z its long axis) and
// which of the bus's axes its own x, y, z lie along (1 x, 2 y, 3 z, signed); where it goes apart, mm, along the camera's
// right, up and toward it as it rests here (the 1U's own pieces: along the bus's axes); and how far into coming apart
// it sets off. The 1U's pieces are baked in the bus's frame already. A card lies across the long axis, its parts
// toward +z; a camera's lens is its model's −y. A wheel is a FAULHABER 2610 (its shaft its model's +y) with Finertia
// on its back, 3.2 mm off the housing, its parts facing out: one on each of the bus's axes. The wheels come out first,
// to the front.
type Piece = { id: string; model: string; at: V; ax: number[]; out: V; from: number; body: boolean; k: number; pk: number; th: number }
const CARD = [1, 3, -2], UP = [1, 2, 3], SKY = [1, -2, -3], ALONG = [2, 1, -3] // (a lens down, or up; a shaft along x)
const piece = (id: string, model: string, at: V, ax: number[], out: V, from: number, body = false): Piece => ({ id, model, at, ax, out, from, body, k: 0, pk: 0, th: 0 })
const PIECES: Piece[] = [
  piece('bleps', 'bleps-frame', [0, 0, 0], UP, [0, 0, 0], 0, true),
  piece('deck', 'bleps-deck', [0, 0, 0], UP, [0, -55, 0], 0.05, true),
  piece('rear', 'bleps-rear', [0, 0, 0], UP, [0, 75, 0], 0, true),
  piece('side+x', 'bleps-side-px', [0, 0, 0], UP, [140, -110, 0], 0, true), // (the two the camera looks past go out and down)
  piece('side-x', 'bleps-side-nx', [0, 0, 0], UP, [-75, 0, 0], 0.03, true),
  piece('end+z', 'bleps-end-pz', [0, 0, 0], UP, [0, -110, 140], 0.06, true),
  piece('end-z', 'bleps-end-nz', [0, 0, 0], UP, [0, 0, -75], 0.09, true),
  piece('finertia', 'faulhaber-2610', [-28, 18, -26], ALONG, [-42, -8, 190], 0.2),
  piece('finertia-y', 'faulhaber-2610', [-26, -16, 26], UP, [0, 4, 205], 0.25),
  piece('finertia-z', 'faulhaber-2610', [26, 16, -26], CARD, [42, -8, 190], 0.3),
  piece('payload-carrier', 'payload-carrier', [0, 0, 8], CARD, [-135, 10, 10], 0.4),
  piece('yapling', 'yapling', [0, 0, -42], CARD, [135, 18, 10], 0.45),
  piece('cam-main', 'cam-main', [23, -40.5, -22], UP, [-115, -150, 30], 0.45),
  piece('cam-360', 'cam-360', [35, -43.6, 40], UP, [115, -150, 30], 0.5),
  piece('cam-360-up', 'cam-360', [-35, 43.6, 40], SKY, [-80, 110, 25], 0.5),
  piece('star-tracker', 'star-tracker', [28, 30, 30], SKY, [35, 105, 30], 0.5),
  piece('star-baffle', 'star-baffle', [28, 59, 30], SKY, [35, 165, 30], 0.55),
]
// (the camera's right, up and toward it, in the bus's frame, as it rests here: from VIEW's bearing)
{
  const yw = 0.75, R = [Math.cos(yw), 0, -Math.sin(yw)], T = [Math.sin(yw), 0, Math.cos(yw)]
  for (const P of PIECES) if (!P.body) P.out = [0, 1, 2].map((i) => P.out[0] * R[i] + P.out[1] * (i === 1 ? 1 : 0) + P.out[2] * T[i])
}
const FRONT = [0, 1, 2].map((i) => PIECES.filter((P) => P.model === 'faulhaber-2610').reduce((a, P) => a + P.out[i] / 3, 0)) // the wheels' middle, apart
const WHEEL = (axis: string) => ({ name: `Reaction wheel, ${axis}: Finertia on its motor`, board: 'finertia', does: `River’s FOC motor-control board on the back of a FAULHABER 2610, whose rotor is the wheel, turning the satellite about its ${axis} axis: an RP2350A on CAN commutates the motor through its bridge from the motor’s own Hall sensors. To slew the 0.00496 kg·m² axis at 1°/s the wheel takes up 86.6 µN·m·s, 1 047 rpm. Finertia is 26 × 26 mm, 6 layers.` })
export const about: Record<string, About> = {
  bleps: { name: 'BLEPS', does: 'Stanford SSI’s next satellite, a 1U CubeSat, 10 × 10 × 11.35 cm, as River’s optical simulator builds it: four wings of cells, the deck with its patch antenna, the 433 MHz tape dipole.' },
  finertia: WHEEL('x'),
  'finertia-y': WHEEL('y'),
  'finertia-z': WHEEL('z'),
  yapling: { name: 'Yapling, the TT&C board', board: 'yapling', does: 'The satellite’s whole radio, River’s main work on BLEPS: an ESP32-S3 makes the S-band DVB-S2 downlink (esp-dvbs2) through a GRF5526 PA, a 433 MHz LoRa module is the UHF link, and an RP2350B runs it, booting from MRAM. 80 × 80 mm, 4 layers.' },
  'payload-carrier': { name: 'Payload board', board: 'payload-carrier', does: 'River’s 80 × 80 mm carrier for a Jetson Orin NX, which runs the cameras: four I-PEX micro-coax links come in from them, and two more run down the backplane.' },
  'cam-main': { name: 'Main camera', does: 'Looks straight down at the Earth: a FRAMOS IMX676C, 3552 × 3552 colour at 2 µm, behind a Commonlands CIL160, 16 mm f/1.9, on an MC50A micro-coax adapter. About 13 g.' },
  'cam-360': { name: '360 camera, down', does: 'One of a pair back to back, an IMX676C behind a Commonlands CIL220 fisheye that sees a 215° cone; with its twin on the far face, the whole sphere round the satellite. About 12 g.' },
  'cam-360-up': { name: '360 camera, up', does: 'The other of the pair, looking away from the Earth through the rear face: an IMX676C behind a CIL220 fisheye, a 215° cone. About 12 g.' },
  'star-tracker': { name: 'Star tracker', does: 'River’s big one inside BLEPS: a FRAMOS IMX900M, 2064 × 1552 monochrome at 2.25 µm, behind an Edmund 16 mm f/1.8, seeing the stars to tell the satellite which way it points. About 21 g.' },
  'star-baffle': { name: 'Star tracker baffle', does: 'Aluminium, four vanes and an entrance stop, its lip 20 mm out from the lens: past a 48.4° angle from its axis no part of the Sun’s disc sees the lens. 11.5 g.' },
}

const ease = (s: number) => s * s * s * (10 - 15 * s + 6 * s * s)
const AXES = [X, Y, Z], ax: V = [0, 0, 0], ay: V = [0, 0, 0], az: V = [0, 0, 0], at: V = [0, 0, 0], col = [ax, ay, az]
const bx: V = [0, 0, 0], by: V = [0, 0, 0], bz: V = [0, 0, 0], bc: V = [0, 0, 0], o: V = [0, 0, 0]
const APART = 4, SPREAD = 3.2, PICK = 1.2, TURN = 0.35, LIFT = 18, BACK = 13.67 // s at rest, then s to come apart; s to lift out; rad/s; mm; Finertia's middle behind its motor's
export const VIEW: [number, number, number] = [0.2, 0.42, 0.75] // the camera's rest: distance, elevation, bearing
let go = 0, near = 9
// v turned th about the bus's y (through nothing: a direction)
function spin(v: V, th: number) {
  const c = Math.cos(th), s = Math.sin(th), d = dot(Y, v)
  cross(Y, v, o)
  for (let i = 0; i < 3; i++) v[i] = v[i] * c + o[i] * s + Y[i] * d * (1 - c)
}
function pieces(k: number) {
  const dt = ctx.dt, rest = ctx.focus === k && ctx.since >= 0
  near = Math.hypot(B[0] - ctx.E[0], B[1] - ctx.E[1], B[2] - ctx.E[2])
  if (near > 0.8) go = 0
  // apart: after a while at rest, or once anything is clicked; back together as we leave
  go = clamp(go + (dt / SPREAD) * (rest && (ctx.since > APART || ctx.picked) ? 1 : -1))
  if (near < 0.8) part('bleps', B, 60 * MM)
  for (const P of PIECES) {
    P.k = ease(clamp((go - P.from) / (1 - P.from)))
    // picked: lifted a little further out, where it is, and turned slowly about the bus's y to show both faces; let
    // go, it settles back and turns home the short way
    P.pk = P.body ? 0 : clamp(P.pk + (dt / PICK) * (ctx.picked === P.id ? 1 : -1))
    if (ctx.picked === P.id) P.th += TURN * dt
    else P.th -= (P.th - 2 * Math.PI * Math.round(P.th / (2 * Math.PI))) * (1 - Math.exp(-2 * dt))
    const m = ctx.models[P.model]
    if (!m || (near > 0.8 && !P.body) || (P.k === 0 && P.pk === 0 && (CARD === P.ax || P.model === 'faulhaber-2610'))) continue // (a card or a wheel is out of sight inside till it comes out)
    for (let i = 0; i < 3; i++) {
      const a = P.ax[i], c = AXES[Math.abs(a) - 1], g = Math.sign(a)
      for (let j = 0; j < 3; j++) col[i][j] = g * c[j]
    }
    const s = 1000 * Math.max(m.hi[0] - m.lo[0], m.hi[1] - m.lo[1], m.hi[2] - m.lo[2]) // mm across its widest
    const pk = ease(P.pk), lift = (LIFT * pk) / (Math.hypot(P.out[0], P.out[1], P.out[2]) || 1)
    for (let j = 0; j < 3; j++) {
      // (a piece of the 1U is baked where it sits in the bus: its box's middle)
      const o0 = P.body ? 500 * (m.hi[0] + m.lo[0]) : P.at[0], o1 = P.body ? 500 * (m.hi[1] + m.lo[1]) : P.at[1], o2 = P.body ? 500 * (m.hi[2] + m.lo[2]) : P.at[2]
      const f = P.k + lift
      at[j] = B[j] + MM * ((o0 + P.out[0] * f) * X[j] + (o1 + P.out[1] * f) * Y[j] + (o2 + P.out[2] * f) * Z[j])
    }
    if (P.th) spin(ax, P.th), spin(ay, P.th), spin(az, P.th)
    if (P.model !== 'faulhaber-2610') {
      solid(P.model, at, ax, ay, az, s * MM)
      if (!P.body && P.k > 0.3) part(P.id, at, 0.5 * s * MM)
      continue
    }
    // a wheel: the motor, and Finertia on its back, facing out
    solid(P.model, at, ax, ay, az, s * MM)
    for (let j = 0; j < 3; j++) (bx[j] = ax[j]), (by[j] = -ay[j]), (bz[j] = -az[j]), (bc[j] = at[j] - BACK * MM * ay[j])
    solid('finertia', bc, bx, by, bz, 26 * MM)
    for (let j = 0; j < 3; j++) bc[j] = at[j] - 5 * MM * ay[j]
    if (P.k > 0.3) part(P.id, bc, 16 * MM)
  }
}

// While it rests here: as it comes apart, round to the wheels in front, the rest of it about them in the frame. (A part clicked takes the camera to itself: planet.ts.)
export function steer(_since: number, _picked: string, o: Steer) {
  const g = ease(go)
  o.d = VIEW[0] * (1 + 0.05 * g)
  o.pitch = VIEW[1], o.yaw = VIEW[2]
  for (let i = 0; i < 3; i++) o.at[i] = 0.85 * g * MM * (FRONT[0] * X[i] + FRONT[1] * Y[i] + FRONT[2] * Z[i])
  return near < 0.8
}

// What it sounds like: its LoRa beacon at 433 MHz, heard a million times down, at 433 Hz. LoRa is chirps: each symbol
// a sweep up across the band (125 kHz, here 125 Hz), started part way up by its value and wrapping round. A packet
// every four seconds: eight bare up-chirps of preamble, two down for the sync, then the data, its values from the
// beacon's own count; spread factor 7, slowed so a chirp takes an eighth of a second.
const F = 433, BW = 125, SYM = 0.125, EVERY = 4, DATA = 16
let phase = 0
export function voice(t: number, dt: number) {
  const s = (((t % EVERY) + EVERY) % EVERY) / SYM, j = Math.floor(s), x = s - j, n = Math.floor(t / EVERY)
  if (j >= 10 + DATA) return 0
  const v = j < 8 ? 0 : j < 10 ? -1 : ((n * 2654435761 + j * 40503) >>> 7) % 128 / 128 // the symbol's start, or a down-chirp
  const f = v < 0 ? F + BW / 2 - BW * x : F - BW / 2 + BW * ((x + v) % 1)
  phase += f * dt, phase -= Math.floor(phase)
  return 0.12 * Math.sin(2 * Math.PI * phase) * Math.min(1, 20 * x, 20 * (1 - x))
}

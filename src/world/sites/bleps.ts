// BLEPS, River's next: Stanford SSI's 1U CubeSat with four cameras, in orbit at 550 km (1.086 radii) on a plane of
// its own beside SAMWISE's, its ground track over the valley and the strobe glasses. The 1U is River's own, as the optical
// simulator builds it (cubesat-imaging-sim's makeSpacecraft), in the pieces that come apart (bleps-*.glb): the frame,
// the deck with its patch antenna, the rear face with the 433 MHz tape dipole, and the four sides, each with its wing.
// Inside it, River's work, from River's own CAD: the TT&C board (Yapling), the payload board with its Jetson Orin NX,
// the cameras on it (the main camera, a FRAMOS IMX676C behind a 16 mm f/1.9, looking down through the deck; the 360
// pair, IMX676Cs behind fisheyes back to back, one through the deck, one through the rear face), the star tracker
// (a FRAMOS IMX900M behind an Edmund 16 mm f/1.8) up through the rear face under its baffle, and Finertia, the wheels'
// motor-control board.
//
// The pointing. It looks straight down, and as one of River's places comes within reach (60° off nadir) it turns to
// hold it in the main camera, and lets it go behind. The orbit runs 547× life from afar, as SAMWISE's does, and slows
// to 15× as we come to it. The main camera's footprint goes to the planet (planet.ts): 550 km × 7.07 mm / 25 mm, a
// 155.7 km square.
// Apart. A few seconds after the camera comes to rest (or on a click) the sides slide off with their wings, the rear
// face rises with its dipole and the deck drops, and River's work comes out of the frame into an exploded view across
// the camera's view, each piece where it can be clicked: clicked, it comes to the camera and turns, to show both faces.
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
// toward +z; a camera's lens is its model's −y.
type Piece = { id: string; model: string; at: V; ax: number[]; out: V; from: number; body: boolean; k: number; pk: number; th: number; q: number[] }
const CARD = [1, 3, -2], UP = [1, 2, 3], SKY = [1, -2, -3] // (a lens down, or up)
const piece = (id: string, model: string, at: V, ax: number[], out: V, from: number, body = false): Piece => ({ id, model, at, ax, out, from, body, k: 0, pk: 0, th: 0, q: [1, 0, 0, 0] })
const PIECES: Piece[] = [
  piece('bleps', 'bleps-frame', [0, 0, 0], UP, [0, 0, 0], 0, true),
  piece('deck', 'bleps-deck', [0, 0, 0], UP, [0, -55, 0], 0.05, true),
  piece('rear', 'bleps-rear', [0, 0, 0], UP, [0, 75, 0], 0, true),
  piece('side+x', 'bleps-side-px', [0, 0, 0], UP, [75, 0, 0], 0, true),
  piece('side-x', 'bleps-side-nx', [0, 0, 0], UP, [-75, 0, 0], 0.03, true),
  piece('end+z', 'bleps-end-pz', [0, 0, 0], UP, [0, 0, 75], 0.06, true),
  piece('end-z', 'bleps-end-nz', [0, 0, 0], UP, [0, 0, -75], 0.09, true),
  piece('payload-carrier', 'payload-carrier', [0, 0, 8], CARD, [-130, 5, 15], 0.35),
  piece('yapling', 'yapling', [0, 0, -42], CARD, [130, 15, 15], 0.4),
  piece('finertia', 'finertia', [-22, 22, -24], CARD, [105, -95, 25], 0.45),
  piece('cam-main', 'cam-main', [23, -40.5, -22], UP, [-55, -115, 35], 0.4),
  piece('cam-360', 'cam-360', [35, -43.6, 40], UP, [10, -125, 35], 0.45),
  piece('cam-360-up', 'cam-360', [-35, 43.6, 40], SKY, [-80, 110, 25], 0.5),
  piece('star-tracker', 'star-tracker', [28, 30, 30], SKY, [35, 105, 30], 0.45),
  piece('star-baffle', 'star-baffle', [28, 59, 30], SKY, [35, 165, 30], 0.5),
]
// (the camera's right, up and toward it, in the bus's frame, as it rests here: from VIEW's bearing)
{
  const yw = 0.75, R = [Math.cos(yw), 0, -Math.sin(yw)], T = [Math.sin(yw), 0, Math.cos(yw)]
  for (const P of PIECES) if (!P.body) P.out = [0, 1, 2].map((i) => P.out[0] * R[i] + P.out[1] * (i === 1 ? 1 : 0) + P.out[2] * T[i])
}
export const about: Record<string, About> = {
  bleps: { name: 'BLEPS', does: 'Stanford SSI’s next satellite, a 1U CubeSat, 10 × 10 × 11.35 cm, as River’s optical simulator builds it: four wings of cells, the deck with its patch antenna, the 433 MHz tape dipole.' },
  yapling: { name: 'Yapling, the TT&C board', board: 'yapling', does: 'The satellite’s whole radio, River’s main work on BLEPS: an ESP32-S3 makes the S-band DVB-S2 downlink (esp-dvbs2) through a GRF5526 PA, a 433 MHz LoRa module is the UHF link, and an RP2350B runs it, booting from MRAM. 80 × 80 mm, 4 layers.' },
  'payload-carrier': { name: 'Payload board', board: 'payload-carrier', does: 'River’s 80 × 80 mm carrier for a Jetson Orin NX, which runs the cameras: four I-PEX micro-coax links come in from them, and two more run down the backplane.' },
  finertia: { name: 'Finertia', board: 'finertia', does: 'The FOC motor-control board for the reaction wheels, on the motor’s 26 mm flange: an RP2350A on CAN commutates a Faulhaber 2610 through a DRV8311P bridge, its phase currents Kelvin-sensed. 26 × 26 mm, 6 layers.' },
  'cam-main': { name: 'Main camera', does: 'Looks straight down at the Earth: a FRAMOS IMX676C, 3552 × 3552 colour at 2 µm, behind a Commonlands CIL160, 16 mm f/1.9, on an MC50A micro-coax adapter. About 13 g.' },
  'cam-360': { name: '360 camera, down', does: 'One of a pair back to back, an IMX676C behind a Commonlands CIL220 fisheye that sees a 215° cone; with its twin on the far face, the whole sphere round the satellite. About 12 g.' },
  'cam-360-up': { name: '360 camera, up', does: 'The other of the pair, looking away from the Earth through the rear face: an IMX676C behind a CIL220 fisheye, a 215° cone. About 12 g.' },
  'star-tracker': { name: 'Star tracker', does: 'River’s big one inside BLEPS: a FRAMOS IMX900M, 2064 × 1552 monochrome at 2.25 µm, behind an Edmund 16 mm f/1.8, seeing the stars to tell the satellite which way it points. About 21 g.' },
  'star-baffle': { name: 'Star tracker baffle', does: 'Aluminium, four vanes and an entrance stop, its lip 20 mm out from the lens: past a 48.4° angle from its axis no part of the Sun’s disc sees the lens. 11.5 g.' },
}

const ease = (s: number) => s * s * s * (10 - 15 * s + 6 * s * s)
const AXES = [X, Y, Z], ax: V = [0, 0, 0], ay: V = [0, 0, 0], az: V = [0, 0, 0], at: V = [0, 0, 0], col = [ax, ay, az]
const eye: V = [0, 0, 0], e0: V = [0, 0, 0], N1: V = [0, 0, 0], rr: V = [0, 0, 0], up: V = [0, 0, 0], qd = [1, 0, 0, 0]
const APART = 4, SPREAD = 3.2, PICK = 1.6, TURN = 0.35, SHOW = 150 // s at rest, then s to come apart; s to the camera; rad/s; mm toward it
export const VIEW: [number, number, number] = [0.2, 0.42, 0.75] // the camera's rest: distance, elevation, bearing
let go = 0, held = '', shown = 0, near = 9
const byId = (id: string) => PIECES.find((P) => P.id === id)
function pieces(k: number) {
  const dt = ctx.dt, rest = ctx.focus === k && ctx.since >= 0
  near = Math.hypot(B[0] - ctx.E[0], B[1] - ctx.E[1], B[2] - ctx.E[2])
  // apart: after a while at rest, or once anything is clicked; back together as we leave
  go = clamp(go + (dt / SPREAD) * (rest && (ctx.since > APART || ctx.picked) ? 1 : -1))
  if (rest && go === 0) part('bleps', B, 0.04)
  // the camera's way from the bus as it rests here (planet.ts's restAt, in the orbit's frame), its right and up
  unit(where(rr))
  const h = dot(NORMAL, rr), cp = Math.cos(VIEW[1]), sp = Math.sin(VIEW[1])
  for (let i = 0; i < 3; i++) e0[i] = NORMAL[i] - rr[i] * h
  unit(e0), cross(rr, e0, N1)
  for (let i = 0; i < 3; i++) (eye[i] = cp * (Math.sin(VIEW[2]) * e0[i] + Math.cos(VIEW[2]) * N1[i]) + sp * rr[i]), (up[i] = ctx.p[8 + i])
  cross(up, eye, rr), unit(rr), cross(eye, rr, up)
  if (byId(ctx.picked)?.body === false) held = ctx.picked // (the bus itself, clicked, only comes apart)
  const H = byId(held)
  shown = H ? ease(H.pk) : 0
  for (const P of PIECES) {
    P.k = ease(clamp((go - P.from) / (1 - P.from))) * (P.id === held ? 1 : 1 - shown) // (the rest close up while one is shown)
    P.pk = P.body ? 0 : clamp(P.pk + (dt / PICK) * (ctx.picked === P.id ? 1 : -1))
    P.th = P.pk > 0 ? P.th + TURN * dt : -TURN * PICK
    const m = ctx.models[P.model]
    if (!m || (near > 0.8 && !P.body) || (P.k === 0 && P.pk === 0 && CARD === P.ax)) continue // (a card is out of sight inside till it comes out)
    // in the bus, or out of it, in the bus's frame
    for (let i = 0; i < 3; i++) {
      const a = P.ax[i], c = AXES[Math.abs(a) - 1], g = Math.sign(a)
      for (let j = 0; j < 3; j++) col[i][j] = g * c[j]
    }
    const s = 1000 * Math.max(m.hi[0] - m.lo[0], m.hi[1] - m.lo[1], m.hi[2] - m.lo[2]) // mm across its widest
    for (let j = 0; j < 3; j++) {
      // (a piece of the 1U is baked where it sits in the bus: its box's middle)
      const o0 = P.body ? 500 * (m.hi[0] + m.lo[0]) : P.at[0], o1 = P.body ? 500 * (m.hi[1] + m.lo[1]) : P.at[1], o2 = P.body ? 500 * (m.hi[2] + m.lo[2]) : P.at[2]
      at[j] = B[j] + MM * ((o0 + P.out[0] * P.k) * X[j] + (o1 + P.out[1] * P.k) * Y[j] + (o2 + P.out[2] * P.k) * Z[j])
    }
    const pk = ease(P.pk)
    if (pk > 0) {
      // shown: before the bus, toward the camera, turning about the camera's up to show both faces
      quat(ax, ay, az, P.q)
      const ct = Math.cos(P.th), st = Math.sin(P.th)
      for (let j = 0; j < 3; j++) (ay[j] = ct * eye[j] + st * rr[j]), (az[j] = -up[j]), (at[j] += (B[j] + MM * SHOW * eye[j] - at[j]) * pk)
      cross(ay, az, ax)
      blend(P.q, quat(ax, ay, az, qd), pk)
      rot(P.q, ax, ay, az)
    }
    solid(P.model, at, ax, ay, az, s * MM)
    if (rest && !P.body && P.k > 0.6 && P.id in about) part(P.id, at, 0.45 * s * MM)
  }
}

// a quaternion from a rotation's columns, its columns back, and a blend of two the short way
const mq = new Array(9)
function quat(a: V, b: V, c: V, o: number[]) {
  mq[0] = a[0], mq[1] = b[0], mq[2] = c[0], mq[3] = a[1], mq[4] = b[1], mq[5] = c[1], mq[6] = a[2], mq[7] = b[2], mq[8] = c[2]
  const m = mq, t = m[0] + m[4] + m[8]
  let s
  if (t > 0) (s = 2 * Math.sqrt(1 + t)), (o[0] = s / 4), (o[1] = (m[7] - m[5]) / s), (o[2] = (m[2] - m[6]) / s), (o[3] = (m[3] - m[1]) / s)
  else if (m[0] > m[4] && m[0] > m[8]) (s = 2 * Math.sqrt(1 + m[0] - m[4] - m[8])), (o[0] = (m[7] - m[5]) / s), (o[1] = s / 4), (o[2] = (m[1] + m[3]) / s), (o[3] = (m[2] + m[6]) / s)
  else if (m[4] > m[8]) (s = 2 * Math.sqrt(1 + m[4] - m[0] - m[8])), (o[0] = (m[2] - m[6]) / s), (o[1] = (m[1] + m[3]) / s), (o[2] = s / 4), (o[3] = (m[5] + m[7]) / s)
  else (s = 2 * Math.sqrt(1 + m[8] - m[0] - m[4])), (o[0] = (m[3] - m[1]) / s), (o[1] = (m[2] + m[6]) / s), (o[2] = (m[5] + m[7]) / s), (o[3] = s / 4)
  return o
}
function rot(q: number[], a: V, b: V, c: V) {
  const [s, x, y, z] = q
  a[0] = 1 - 2 * (y * y + z * z), a[1] = 2 * (x * y + s * z), a[2] = 2 * (x * z - s * y)
  b[0] = 2 * (x * y - s * z), b[1] = 1 - 2 * (x * x + z * z), b[2] = 2 * (y * z + s * x)
  c[0] = 2 * (x * z + s * y), c[1] = 2 * (y * z - s * x), c[2] = 1 - 2 * (x * x + y * y)
}
function blend(a: number[], b: number[], k: number) {
  const g = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3] < 0 ? -k : k
  for (let i = 0; i < 4; i++) a[i] = a[i] * (1 - k) + b[i] * g
  const n = Math.hypot(a[0], a[1], a[2], a[3])
  for (let i = 0; i < 4; i++) a[i] /= n
}

// While it rests here: back a little as it comes apart, so the whole exploded view is in the frame; in to a piece
// brought to the camera, the 1U closed up behind it.
export function steer(_since: number, _picked: string, o: Steer) {
  const H = byId(held), m = H && ctx.models[H.model], size = m ? 1000 * Math.max(m.hi[0] - m.lo[0], m.hi[1] - m.lo[1], m.hi[2] - m.lo[2]) : 0
  o.d = VIEW[0] * (1 + 0.45 * ease(go)) * (1 - shown) + 3.2 * size * MM * shown
  o.pitch = VIEW[1], o.yaw = VIEW[2]
  for (let i = 0; i < 3; i++) o.at[i] = MM * SHOW * eye[i] * shown
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

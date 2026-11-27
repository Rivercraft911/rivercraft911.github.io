// BLEPS, River's next: Stanford SSI's 1U CubeSat with four cameras, in orbit at 550 km (1.086 radii) on a plane of
// its own beside SAMWISE's, its ground track over the valley and the strobe glasses. The spacecraft is River's own, as
// the optical simulator builds it (cubesat-imaging-sim's makeSpacecraft, baked to bleps.glb): the rails, the white face
// boards and their cells, the four wings opened flat round the deck, the main camera and a 190° fisheye on the deck,
// the other fisheye back to back with it on the far face, and the 433 MHz tape dipole. Beside it, drawn out of it as an
// exploded view, two of the boards it is built from: Yapogee S3, the hacked ESP32-S3 that makes its DVB-S2 downlink
// (esp-dvbs2 again), and Finertia, its reaction wheel's controller, both as baked from KiCad.
//
// The pointing. It looks straight down, and as one of River's places comes within reach (60° off nadir) it turns to
// hold it in the main camera, and lets it go behind. The orbit runs 547× life from afar, as SAMWISE's does, and slows
// to 15× as we come to it. The main camera's footprint goes to the planet (planet.ts): 550 km × 7.07 mm / 25 mm, a
// 155.7 km square.
import { clamp } from '../../acts/scene'
import { PLACES } from '../places'
import { ctx, cross, dot, frame, site, solid, unit, type V } from '../ctx'
import { DEG, RE, orbit } from './sky'

const A = 1.086, INC = 97.6 * DEG, RAAN = 258 * DEG, RATE = 0.6 // as SAMWISE's orbit, on another plane
const N0 = Math.sqrt(3.986004418e14 / (A * RE) ** 3), HERE = 15 * N0 // rad a real second; and here, 15× life
const MM = 0.028 / 100 // radii a millimetre: a 1U is the size of a landmark here, as SAMWISE's 2U is
const REACH = Math.cos(0.13) // 60° off nadir from 550 km is 7.4° of the planet away
export const HALF = (550e3 * 7.07) / 25 / 2 / RE // the footprint's half-width, radii
// The orbit's normal: the camera rides in the orbit's own frame (planet.ts).
export const NORMAL = cross(orbit(1, RAAN, INC, 0, [0, 0, 0]), orbit(1, RAAN, INC, Math.PI / 2, [0, 0, 0]))
// bleps.glb, in its own millimetres: the deck (and the main camera's axis) toward −y, the bus's middle at the origin,
// its box (wings, tapes and all) 302 × 264 × 315.5 mm with its middle 70.4 mm up y
const BOX = 315.5, MID = 70.4

// ---- the orbit and the pointing ------------------------------------------------------------------------------------
let u = 1.3, rate = RATE // its argument of latitude, and how fast that goes
const B: V = orbit(A, RAAN, INC, u, [0, 0, 0]), r: V = [0, 0, 0], look: V = [0, -1, 0], want: V = [0, 0, 0]
const X: V = [1, 0, 0], Y: V = [0, 1, 0], Z: V = [0, 0, 1], c: V = [0, 0, 0], e: V = [0, 0, 0], N: V = [0, 0, 0]
let LAND: V[] = [] // River's places on the ground (when first drawn: places.ts imports this)
export const sight = [0, 0, 0, 0, 0] // where the main camera looks, on the ground (a unit vector), how surely, and its picture's up (rad east of north)

// Where the spacecraft is now: what a camera that rides with it looks at.
export const where = (o: V) => ((o[0] = B[0]), (o[1] = B[1]), (o[2] = B[2]), o)

export function draw(k: number) {
  const dt = ctx.dt, here = ctx.focus === k
  rate *= Math.exp(clamp(Math.log((here ? HERE : RATE) / rate), -1, 1) * (1 - Math.exp(-2.5 * dt)))
  u += rate * dt
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

  // the spacecraft (its box's middle is MID up from the bus's), and drawn out beside it, over its −x wing, facing the
  // camera's side, the radio and the wheel's controller
  for (let i = 0; i < 3; i++) c[i] = B[i] + MID * MM * Y[i]
  solid('bleps', c, X, Y, Z, BOX * MM)
  board('yapogee-s3', -112, 24, 61)
  board('finertia', -112, -22, 26)
}
// Board `id` (`w` mm across) beside the bus: x across it, y up it (mm), standing in the plane of its +z face, facing out.
const at: V = [0, 0, 0], nY: V = [0, 0, 0]
function board(id: string, x: number, y: number, w: number) {
  for (let i = 0; i < 3; i++) (at[i] = B[i] + MM * (X[i] * x + Y[i] * y + Z[i] * 50)), (nY[i] = -Y[i])
  solid(id, at, X, Z, nY, w * MM)
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

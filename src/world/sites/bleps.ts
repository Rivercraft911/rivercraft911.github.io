// BLEPS, River's next: Stanford SSI's 1U CubeSat with four cameras, in orbit at 550 km (1.086 radii) on a plane of
// its own beside SAMWISE's, its ground track over the valley and the strobe glasses. It is not built yet, so it is made
// here out of boxes and cylinders (make.ts): a 1U's rails, its cells, the main camera and a second looking down, the two
// 190° fisheyes back to back on its sides, its 433 MHz tape antennas out, and one side left open to show the wheel
// inside, River's Finertia (as baked from KiCad) on its motor in front of it.
//
// The pointing. It looks straight down, and as one of River's places comes within reach (60° off nadir) it turns to
// hold it in the main camera, and lets it go behind. Every turn of the body about the wheel's axis is paid for by the
// wheel turning the other way: with the 0.00496 kg·m² axis and the wheel's rotor (Finertia's own numbers: 1 047 rpm
// for 1°/s), I/Iᵣ = 6 282, so the wheel turns 6 282 times for every time the body turns, whatever the time-lapse.
// The orbit runs 547× life from afar, as SAMWISE's does, and slows to 15× as we come to it.
// The main camera's footprint goes to the planet (planet.ts): 550 km × 7.07 mm / 25 mm, a 155.7 km square.
import { clamp } from '../../acts/scene'
import { box, dome, make, tube } from '../make'
import { PLACES } from '../places'
import { ctx, cross, dot, frame, site, solid, unit, type V } from '../ctx'
import { DEG, RE, orbit } from './sky'

const A = 1.086, INC = 97.6 * DEG, RAAN = 258 * DEG, RATE = 0.6 // as SAMWISE's orbit, on another plane
const N0 = Math.sqrt(3.986004418e14 / (A * RE) ** 3), HERE = 15 * N0 // rad a real second; and here, 15× life
const MM = 0.028 / 100 // radii a millimetre: a 1U is the size of a landmark here, as SAMWISE's 2U is
const WHEEL = 0.00496 / 7.9e-7 // the body's axis over the wheel's rotor
const REACH = Math.cos(0.13) // 60° off nadir from 550 km is 7.4° of the planet away
export const HALF = (550e3 * 7.07) / 25 / 2 / RE // the footprint's half-width, radii
// The orbit's normal: the camera rides in the orbit's own frame (planet.ts).
export const NORMAL = cross(orbit(1, RAAN, INC, 0, [0, 0, 0]), orbit(1, RAAN, INC, Math.PI / 2, [0, 0, 0]))

// ---- the spacecraft, in millimetres: +y along its 113.5 mm, the cameras' end −y, its open face +z ----------------
const AL = { col: [0.6, 0.61, 0.64, 1], metal: 1, rough: 0.3 }
const DARK = { col: [0.035, 0.035, 0.04, 1], metal: 0, rough: 0.45 } // black anodising
const PLATE = { col: [0.5, 0.5, 0.52, 1], metal: 1, rough: 0.5 } // bead-blasted aluminium
const CELL = { col: [0.02, 0.035, 0.11, 1], metal: 0, rough: 0.08 } // triple-junction cells under cover glass
const GLASS = { col: [0.01, 0.012, 0.02, 1], metal: 0, rough: 0.03 }
const TAPE = { col: [0.75, 0.72, 0.66, 1], metal: 1, rough: 0.25 } // steel measuring tape
const BRASS = { col: [0.8, 0.6, 0.3, 1], metal: 1, rough: 0.22 }
const MARK = { col: [0.9, 0.9, 0.88, 1], metal: 0, rough: 0.5 }
make('bleps', () => {
  const H = 56.75
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(AL, [sx < 0 ? -50 : 41.5, -H, sz < 0 ? -50 : 41.5], [sx < 0 ? -41.5 : 50, H, sz < 0 ? -41.5 : 50])
  box(PLATE, [-48, -H, -48], [48, -H + 3, 48]) // the cameras' end
  box(PLATE, [-48, H - 3, -48], [48, H, 48]) // the antennas' end
  box(PLATE, [-48, -50, -48], [48, 50, -46]) // the back, and on it two cells
  for (const y of [-46, 4]) box(CELL, [-40, y, -49], [40, y + 42, -48])
  for (const sx of [-1, 1]) {
    box(PLATE, [sx < 0 ? -48 : 46, -50, -41.5], [sx < 0 ? -46 : 48, 50, 41.5])
    box(CELL, [sx < 0 ? -49 : 48, -46, -36], [sx < 0 ? -48 : 49, -6, 36])
    // a fisheye, its twin on the other side
    tube(DARK, [sx * 48, 22, 0], [sx, 0, 0], 17, 15, 7)
    dome(GLASS, [sx * 55, 22, 0], [sx, 0, 0], 12.5)
  }
  // the main camera, and a wider one beside it, looking down
  tube(DARK, [0, -H, 0], [0, -1, 0], 16, 14, 20)
  tube(GLASS, [0, -H - 20, 0], [0, -1, 0], 11, 10.5, 0.8)
  tube(DARK, [27, -H, -27], [0, -1, 0], 8, 7, 9)
  dome(GLASS, [27, -H - 9, -27], [0, -1, 0], 5.5)
  // the 433 MHz tapes, a quarter wave each, out from the far end
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const a: [number, number, number] = [dx ? dx * 48 : -3, H - 6, dz ? dz * 48 : -3], b: [number, number, number] = [dx ? dx * 218 : 3, H - 5.6, dz ? dz * 218 : 3]
    box(TAPE, [Math.min(a[0], b[0]), a[1], Math.min(a[2], b[2])], [Math.max(a[0], b[0]), b[1], Math.max(a[2], b[2])])
  }
  // inside, across the middle, the wheel's bay: its back plate, and the Faulhaber 2610 out of it toward the open face
  box(AL, [-41.5, -41.5, -3], [41.5, 41.5, 0])
  tube(DARK, [0, 0, 12], [0, 0, 1], 13, 13, 18, 32, true)
})
make('bleps-wheel', () => {
  tube(BRASS, [0, -3, 0], [0, 1, 0], 24, 24, 6, 48, true)
  tube(AL, [0, 3, 0], [0, 1, 0], 6, 5, 2, 24)
  box(MARK, [18.5, 3, -2.5], [23.5, 3.3, 2.5]) // so its turning is seen, round Finertia
})

// ---- the orbit and the pointing ------------------------------------------------------------------------------------
let u = 1.3, rate = RATE, turn = 0 // its argument of latitude, how fast that goes, and the wheel's angle
const B: V = orbit(A, RAAN, INC, u, [0, 0, 0]), r: V = [0, 0, 0], look: V = [0, -1, 0], want: V = [0, 0, 0], s: V = [0, 0, 0]
const X: V = [1, 0, 0], Y: V = [0, 1, 0], Z: V = [0, 0, 1], was: V = [0, 1, 0], c: V = [0, 0, 0], e: V = [0, 0, 0], N: V = [0, 0, 0]
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
  // its axes: −y along the look, its open face (+z) toward the orbit's normal side, where the camera rides
  for (let i = 0; i < 3; i++) (was[i] = Y[i]), (Y[i] = -look[i])
  const hy = dot(NORMAL, Y)
  for (let i = 0; i < 3; i++) Z[i] = NORMAL[i] - Y[i] * hy
  unit(Z), cross(Y, Z, X)
  // the wheel pays for every turn about its axis
  turn -= WHEEL * Math.asin(clamp(dot(cross(was, Y, s), Z), -1, 1))
  turn %= 2 * Math.PI
  // where the main camera's axis meets the ground
  const b = dot(B, look), h = b * b - dot(B, B) + 1
  if (h > 0) for (let i = 0; i < 3; i++) sight[i] = B[i] + look[i] * (-b - Math.sqrt(h))
  sight[3] = h > 0 ? clamp(1 - (rate - HERE) / (4 * HERE)) : 0
  if (h > 0) unit(sight), frame(sight, e, N), (sight[4] = Math.atan2(dot(Z, e), dot(Z, N)))

  // the body (its box's middle is 10 mm toward the cameras from its own); the wheel turning about +z, behind its
  // motor; and on the motor's flange, facing out of the open side, Finertia
  for (let i = 0; i < 3; i++) c[i] = B[i] - 10 * MM * Y[i]
  solid('bleps', c, X, Y, Z, 436 * MM)
  const cw = Math.cos(turn), sw = Math.sin(turn)
  for (let i = 0; i < 3; i++) (s[i] = cw * X[i] + sw * Y[i]), (c[i] = B[i] + 6.5 * MM * Z[i])
  solid('bleps-wheel', c, s, Z, cross(s, Z, want), 48 * MM)
  for (let i = 0; i < 3; i++) (c[i] = B[i] + 34.5 * MM * Z[i]), (want[i] = -Y[i])
  solid('finertia', c, X, Z, want, 26 * MM)
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
  return 0.12 * Math.sin(2 * Math.PI * phase) * Math.min(1, 20 * x, 20 * (1 - x) + 0.5)
}

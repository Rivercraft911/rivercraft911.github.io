// The places on River's planet: where each project stands, what stands there (River's hardware, from its own CAD,
// grown to the size of a landmark), and what the beam draws over it. Sites are planet-local (lat, lon) in degrees;
// sizes in radii. Every place names the projects (projects.ts slugs) whose page it opens.
import { W1, M1, W2, M2, PHI } from '../acts/valley'
import { TAU } from '../acts/scene'
import { draw as launch, where as rocket } from './sites/launch'
import { draw as receiver } from './sites/receiver'
import { draw as station, where as bus } from './sites/station'
import { core } from './sites/core'
import { draw as bench } from './sites/bench'
import { draw as hearts } from './sites/hearts'
import { draw as lighthouse } from './sites/lighthouse'
import { draw as valley } from './sites/valley'

export type Monument = { id: string; size: number; at?: [number, number]; lift?: number; turn?: number; flip?: boolean; k?: number }
export type Place = {
  id: string
  slugs: string[]
  lat: number
  lon: number
  monuments: Monument[]
  view: [d: number, pitch: number, yaw: number] // the camera's rest here: distance, elevation, bearing
  ink: readonly number[] // its colour in the beam
  draw?: (k: number) => void // its own spectacle, drawn each frame through ctx (ctx.ts)
  where?: (o: number[], t: number) => number[] // where it is at planet time t, if it moves: the camera rides with it
}

export const PLACES: Place[] = [
  { id: 'valley', slugs: ['esp-dvbs2'], lat: 18, lon: 8, monuments: [], view: [0.32, 0.55, 0.3], ink: [0.5, 0.78, 1], draw: valley },
  { id: 'launch', slugs: ['pigeon-vision', 'yapogee'], lat: 34, lon: -38, monuments: [{ id: 'pigeon-carrier', size: 0.07 }, { id: 'yapogee-s3', size: 0.05, at: [0.06, 0.02], turn: 0.6 }], view: [0.16, 0.3, -0.5], ink: [1, 0.7, 0.35], draw: launch, where: rocket },
  { id: 'lighthouse', slugs: ['r-01'], lat: -12, lon: 44, monuments: [{ id: 'r01-chassis', size: 0.13, at: [0.1666, -0.0336], turn: 1.41 }, { id: 'r01-polygon', size: 0.052, at: [0.1067, -0.0215], lift: 0.084, turn: 1.41 }, { id: 'laserbrain', size: 0.0715, at: [0.1634, -0.0495], lift: 0.039, turn: 1.41 }, { id: 'laserdriver', size: 0.0358, at: [0.1972, -0.0179], lift: 0.047, turn: 1.41 }], view: [0.6, 1.15, 0.9], ink: [1, 0.35, 0.3], draw: lighthouse },
  { id: 'bench', slugs: ['peep', 'strobeglasses'], lat: 2, lon: -16, monuments: [{ id: 'peep', size: 0.055, at: [-0.005, 0.03], lift: 0.012, turn: 0.25, flip: true }, { id: 'strobe-board', size: 0.037, at: [-0.1, 0.03], turn: -0.4 }], view: [0.23, 0.6, 0.1], ink: [0.45, 1, 0.62], draw: bench },
  { id: 'hearts', slugs: ['rava-heart'], lat: 46, lon: 28, monuments: [], view: [0.22, 0.55, 0.0], ink: [1, 0.4, 0.55], draw: hearts },
  { id: 'receiver', slugs: ['ephemeris', 'driftwood'], lat: 8, lon: 82, monuments: [{ id: 'ephemeris', size: 0.07 }], view: [0.3, 0.6, -0.3], ink: [0.6, 0.9, 1], draw: receiver },
  { id: 'station', slugs: ['samwise', 'cubesat-imaging-sim', 'yapling-observatory'], lat: -30, lon: -70, monuments: [{ id: 'coil', size: 0.08 }, { id: 'picohat', size: 0.045, at: [0.06, -0.03], turn: 0.8 }], view: [0.2, 0.4, 0.4], ink: [0.75, 0.6, 1], draw: station, where: bus },
  { id: 'core', slugs: ['primesf', 'autoprime'], lat: 89, lon: 0, monuments: [], view: [0.5, 1.2, 0], ink: [1, 0.85, 0.4], draw: core },
]

// The river, on the planet as it was in the valley: the meander's heading integrated over its stretch, z = ∫ e^{iθ} ds,
// laid on the ground at the valley's place, metres become radii at 1:400.
export const RIVER: number[] = (() => {
  const out: number[] = [], th = (s: number) => W1 * Math.sin((TAU * s) / M1) + W2 * Math.sin((TAU * s) / M2 + PHI)
  let x = 0, y = 0
  for (let s = 0; s <= 120; s += 0.25) out.push(x, y), (x += 0.25 * Math.cos(th(s))), (y += 0.25 * Math.sin(th(s)))
  return out.map((v, i) => (v - (i % 2 ? 0 : out[out.length - 2] / 2)) / 400)
})()


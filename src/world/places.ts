// The places on River's planet: where each project stands, what stands there (River's hardware, from its own CAD,
// grown to the size of a landmark), and what of it moves or shines. Sites are planet-local (lat, lon) in degrees;
// sizes in radii. Every place names the projects (projects.ts slugs) whose page it opens. The valley's river is the
// intro's own θ(s), cut into the land as a canyon (planet.wgsl).
import { draw as launch, where as rocket } from './sites/launch'
import { draw as receiver } from './sites/receiver'
import { NORMAL as SSO, draw as station, where as bus } from './sites/station'
import { NORMAL as BLEPS, draw as bleps, where as cube } from './sites/bleps'
import { core } from './sites/core'
import { LIFT, draw as glasses } from './sites/glasses'
import { draw as hearts } from './sites/hearts'

export type Monument = { id: string; size: number; at?: [number, number]; lift?: number; turn?: number; flip?: boolean; k?: number }
export type Place = {
  id: string
  slugs: string[]
  lat: number // where it stands (a place at 80° or more stands on nothing: the pole's sea, or the sky)
  lon: number
  monuments: Monument[]
  view: [d: number, pitch: number, yaw: number] // the camera's rest here: distance, elevation, bearing
  ink: readonly number[] // its colour, in its page and the index
  draw?: (k: number) => void // what of it moves or shines, placed each frame through ctx (ctx.ts)
  where?: (o: number[], t: number) => number[] // where it is at planet time t, if it moves: the camera rides with it
  rise?: number // how high over the ground the camera looks (radii), if not at the ground
  orbit?: readonly number[] // its orbit's normal, if it is in orbit: the camera rides in the orbit's own frame
  // Steers the camera while it rests here, `since` seconds after it came to rest, with part `picked` (ctx.picked) or ''
  // clicked: write the distance, elevation and bearing wanted into o, and o.at, an offset (radii, the planet's frame)
  // of the point looked at from the place's own; return false to leave the camera to the visitor. A drag or the wheel
  // takes the camera back for a while.
  steer?: (since: number, picked: string, o: Steer) => boolean
  // What its clickable parts (ctx.part) are, by id: a name and a line of what each does, and the board's picture
  // (public/media/boards/) if it is one of River's boards.
  about?: Record<string, About>
}
export type Steer = { d: number; pitch: number; yaw: number; at: number[] }
export type About = { name: string; does: string; board?: string }

// In the order the index lists them, the work of now first. (Those on land keep their order among themselves in
// planet.wgsl's FLAT; the arrival finds the hearts among them.)
export const PLACES: Place[] = [
  { id: 'bleps', slugs: ['bleps', 'cubesat-imaging-sim', 'yapling-observatory'], lat: 90, lon: 0, monuments: [], view: [0.2, 0.42, 0.75], ink: [0.55, 0.85, 1], draw: bleps, where: cube, orbit: BLEPS },
  { id: 'launch', slugs: ['pigeon-vision', 'yapogee'], lat: 34, lon: -38, monuments: [], view: [0.13, 0.75, -0.5], ink: [1, 0.7, 0.35], draw: launch, where: rocket },
  { id: 'valley', slugs: ['esp-dvbs2'], lat: 18, lon: 8, monuments: [], view: [0.32, 0.55, 0.3], ink: [0.5, 0.78, 1] },
  { id: 'receiver', slugs: ['ephemeris', 'driftwood'], lat: 8, lon: 82, monuments: [{ id: 'ephemeris', size: 0.07 }], view: [0.2, 0.42, -0.3], ink: [0.6, 0.9, 1], draw: receiver },
  { id: 'lighthouse', slugs: ['r-01'], lat: -13.732, lon: 53.734, monuments: [{ id: 'r01-chassis', size: 0.13, turn: 1.41 }, { id: 'r01-polygon', size: 0.052, at: [-0.0592, 0.0096], lift: 0.084, turn: 1.41 }, { id: 'laserbrain', size: 0.0715, at: [-0.0026, -0.0158], lift: 0.039, turn: 1.41 }, { id: 'laserdriver', size: 0.0358, at: [0.0291, 0.0166], lift: 0.047, turn: 1.41 }], view: [0.42, 0.6, 2.2], ink: [1, 0.35, 0.3] },
  { id: 'bench', slugs: ['peep', 'infiniterecon'], lat: 2, lon: -16, monuments: [{ id: 'peep', size: 0.055, lift: 0.012, turn: 0.25, flip: true }], view: [0.15, 0.5, 0.1], ink: [0.45, 1, 0.62] },
  { id: 'glasses', slugs: ['strobeglasses'], lat: -20, lon: 18, monuments: [{ id: 'strobe-frame', size: 0.13, turn: Math.PI / 2, lift: LIFT }, { id: 'strobe-board', size: 0.05, at: [0.1, 0.06], turn: -0.5 }], view: [0.36, 0.1, 0.05], ink: [0.95, 0.95, 0.55], draw: glasses, rise: 0.07 },
  { id: 'hearts', slugs: ['rava-heart'], lat: 46, lon: 28, monuments: [], view: [0.22, 0.55, -1.05], ink: [1, 0.4, 0.55], draw: hearts },
  { id: 'station', slugs: ['samwise'], lat: -30, lon: -70, monuments: [{ id: 'coil', size: 0.08 }, { id: 'picohat', size: 0.045, at: [0.06, -0.03], turn: 0.8 }], view: [0.17, 0.35, 0.55], ink: [0.75, 0.6, 1], draw: station, where: bus, orbit: SSO },
  { id: 'core', slugs: ['primesf', 'autoprime'], lat: 89, lon: 0, monuments: [], view: [0.5, 1.2, 0], ink: [1, 0.85, 0.4], draw: core },
]

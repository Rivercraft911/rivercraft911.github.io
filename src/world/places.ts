// The places on River's planet: where each project stands, what stands there (River's hardware, from its own CAD,
// grown to the size of a landmark), and what of it moves or shines. Sites are planet-local (lat, lon) in degrees;
// sizes in radii. Every place names the projects (projects.ts slugs) whose page it opens. The valley's river is the
// intro's own θ(s), cut into the land as a canyon (planet.wgsl).
import { draw as launch, where as rocket } from './sites/launch'
import { about as rxAbout, draw as receiver, steer as rxSteer } from './sites/receiver'
import { ABOUT as SAMWISE, NORMAL as SSO, VIEW as SAT, draw as station, steer as detumble, where as bus } from './sites/station'
import { NORMAL as BLEPS, draw as bleps, where as cube } from './sites/bleps'
import { about as primes, core, steer as descend, where as well } from './sites/core'
import { RISE as BROW, about as strobe, draw as glasses, steer as look } from './sites/glasses'
import { draw as hearts } from './sites/hearts'
import { about as r01, draw as lighthouse, steer as projector } from './sites/lighthouse'
import { RISE as DESK, about as peep, draw as bench, steer as plug } from './sites/bench'
import { about as dvAbout, draw as dvbs2, steer as dvSteer } from './sites/dvbs2'

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
  { id: 'valley', slugs: ['esp-dvbs2'], lat: 18, lon: 8, monuments: [], view: [0.36, 0.4, -0.7], ink: [0.5, 0.78, 1], draw: dvbs2, steer: dvSteer, about: dvAbout },
  { id: 'receiver', slugs: ['ephemeris', 'driftwood'], lat: 8, lon: 82, monuments: [], view: [0.38, 0.5, -0.3], ink: [0.6, 0.9, 1], draw: receiver, steer: rxSteer, about: rxAbout },
  { id: 'lighthouse', slugs: ['r-01'], lat: -13.732, lon: 53.734, monuments: [], view: [0.75, 0.38, 3.84], ink: [1, 0.35, 0.3], draw: lighthouse, steer: projector, about: r01 },
  { id: 'bench', slugs: ['peep', 'infiniterecon'], lat: 2, lon: -16, monuments: [], view: [0.25, 0.36, -0.15], ink: [0.45, 1, 0.62], draw: bench, rise: DESK, steer: plug, about: peep },
  { id: 'glasses', slugs: ['strobeglasses'], lat: -20, lon: 18, monuments: [], view: [0.36, 0.1, 0.05], ink: [0.95, 0.95, 0.55], draw: glasses, rise: BROW, steer: look, about: strobe },
  { id: 'hearts', slugs: ['rava-heart'], lat: 46, lon: 28, monuments: [], view: [0.22, 0.55, -1.05], ink: [1, 0.4, 0.55], draw: hearts },
  { id: 'station', slugs: ['samwise'], lat: -30, lon: -70, monuments: [], view: SAT, ink: [0.75, 0.6, 1], draw: station, where: bus, orbit: SSO, steer: detumble, about: SAMWISE },
  { id: 'core', slugs: ['primesf', 'autoprime'], lat: 89, lon: 0, monuments: [], view: [0.5, 1.2, 0], ink: [1, 0.85, 0.4], draw: core, where: well, steer: descend, about: primes },
]

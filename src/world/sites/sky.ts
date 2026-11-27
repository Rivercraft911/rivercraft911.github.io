// What the places in the planet's sky share: a circular orbit, as planet.ts draws its rings, and the constants.
import type { V } from '../ctx'

export const DEG = Math.PI / 180
export const RE = 6.371e6, C = 299792458 // an Earth radius, m; light, m/s

// Where argument of latitude u is on the circular orbit of radius r, node raan and inclination inc.
export function orbit(r: number, raan: number, inc: number, u: number, o: V) {
  const x = Math.cos(u), y = Math.sin(u)
  o[0] = r * (x * Math.cos(raan) - y * Math.cos(inc) * Math.sin(raan))
  o[1] = r * y * Math.sin(inc)
  o[2] = r * (x * Math.sin(raan) + y * Math.cos(inc) * Math.cos(raan))
  return o
}

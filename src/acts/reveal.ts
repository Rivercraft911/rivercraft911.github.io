// The reveal: up out of the drain. The pool drained into the eye of a storm, and we climb the storm's axis: the eye,
// its wall and its arms are the pool's own law at the size of a world, so the turning we came down with slows as we
// rise (angular momentum: ω ∝ 1/r²), the glyphs we fell through give way to light, and the planet comes whole, its
// orbits round it. River's. The name is written over it (ident), and the world (world/planet.ts) takes the camera
// from exactly where this leaves it.
import { PLANET } from '../gpu/fields'
import type { Field } from '../gpu/raster'
import { Path } from '../beam/path'
import { aim } from './reality'
import { ident } from './ident'
import { place, sing } from './choir'
import { REVEAL, RV } from './clock'
import { TAU, clamp, smooth, type Scene } from './scene'
import { ctx, look, seen, trace, unit, type V } from '../world/ctx'
import { HOME, EXPOSE, clock } from '../world/planet'

const H0 = 0.02 // altitude at the start, radii: down in the eye, its dark water filling the frame
const W0 = 1.1 // the turning we arrive with, rad/s, as the whirlpool's camera had it
const p = ctx.p
const F: Field = { shader: PLANET, k: 1, p, res: 2 }
const Y = [0, 1, 0]
const home = unit([Math.cos(HOME.pitch) * Math.sin(HOME.yaw), Math.sin(HOME.pitch), Math.cos(HOME.pitch) * Math.cos(HOME.yaw)])
const eye: V = [0, 0, 0], dir: V = [0, 0, 0], up: V = [0, 0, 0], L: V = [0, 0, 0]
const H1 = HOME.d - 1
const A = Math.log(H1 / H0) / REVEAL // the climb's rate, e-folds a second
const orbits = new Path(), RING = new Float64Array(97 * 3), q: V = [0, 0, 0]

// Where the camera is t seconds into the climb (t may run past the end: it holds at home).
function climb(t: number) {
  const s = clamp(t / REVEAL)
  const h = H0 * Math.exp(A * REVEAL * smooth(0, 1, s) ** 0.85) // e-folding, eased in and out of the last stretch
  const k = smooth(0.3, 1, s), w = Math.acos(clamp(home[1], -1, 1))
  // from straight above the pole to home, along the meridian home is on
  const az = Math.atan2(home[0], home[2])
  const lat = Math.PI / 2 - w * k
  dir[0] = Math.cos(lat) * Math.sin(az), dir[1] = Math.sin(lat), dir[2] = Math.cos(lat) * Math.cos(az)
  for (let i = 0; i < 3; i++) eye[i] = dir[i] * (1 + h)
  // roll: the turning slows as the radius grows, θ = ∫ W0 (H0/h)² dt
  const roll = (W0 / (2 * A)) * (1 - Math.exp(-2 * A * Math.min(t, REVEAL)))
  const r0 = [Math.sin(roll), 0, Math.cos(roll)]
  for (let i = 0; i < 3; i++) up[i] = r0[i] * (1 - k) + Y[i] * k
  return h
}

const ring = (r: number, raan: number, inc: number, u: number, o: V) => {
  const x = Math.cos(u), y = Math.sin(u)
  o[0] = r * (x * Math.cos(raan) - y * Math.cos(inc) * Math.sin(raan))
  o[1] = r * y * Math.sin(inc)
  o[2] = r * (x * Math.sin(raan) + y * Math.cos(inc) * Math.cos(raan))
  return o
}
function sky(t: number, a: number) {
  orbits.clear()
  if (a <= 0.01) return
  for (let pl = 0; pl < 6; pl++) {
    const raan = (pl * TAU) / 6, inc = (55 * Math.PI) / 180
    for (let i = 0; i <= 96; i++) RING.set(ring(4.17, raan, inc, (i / 96) * TAU, q), 3 * i)
    orbits.color(0.35, 0.55, 1, 0.3 * a)
    trace(orbits, RING, 97)
    for (let sv = 0; sv < 4; sv++) if (look(ring(4.17, raan, inc, (sv * TAU) / 4 + (pl * TAU) / 24 + 0.05 * t, q))) orbits.color(0.75, 0.9, 1, a).dot(seen.x, seen.y, 0.01)
  }
  for (let i = 0; i <= 96; i++) RING.set(ring(1.086, 0.4, (97.6 * Math.PI) / 180, (i / 96) * TAU, q), 3 * i)
  orbits.color(0.75, 0.6, 1, 0.45 * a)
  trace(orbits, RING, 97)
}

// The planet as this scene's camera sees it at planet time pt.
function planet(t: number, pt: number, f: Parameters<Scene['build']>[1]) {
  const h = climb(t)
  ctx.E[0] = eye[0], ctx.E[1] = eye[1], ctx.E[2] = eye[2]
  aim(p, [0, 0, 0], [-eye[0], -eye[1], -eye[2]], up, 0.62)
  clock(pt, L)
  const text = 1 - smooth(0.4, 2.6, t) // the glyphs we fell through, dissolving as the eyewall comes into view
  p.set([-eye[0], -eye[1], -eye[2], 1, L[0], L[1], L[2], pt, 0, 1, 0, 0, 1, 0.07, 1, 1, EXPOSE * smooth(-0.2, 1.2, t), 1, 0, 0, text, 0, 0, 0], 16)
  F.cell = text > 0.01 ? 12 : undefined
  F.ink = [0.55, 0.85, 1]
  f.field = F
  sky(pt, smooth(0.45, 2.5, h))
  f.ch.push({ w: 0.5, path: orbits })
  f.rate = 2.4e6
  f.look = { tau: 0.03 }
}

const T0 = -(REVEAL + ident.dur) // planet time at the reveal's start: the world's clock reads 0 when it takes over
export const reveal: Scene = {
  dur: REVEAL,
  build(t, f) {
    planet(t, T0 + t, f)
    place(RV + t)
    return (tt, o) => sing(RV + tt, o) // the choir swells all the way out, and is cut as the planet comes whole
  },
}
// The name, written over the planet as it hangs where the world will pick it up.
export const named: Scene = {
  dur: ident.dur,
  build(t, f) {
    const v = ident.build(t, f)
    planet(REVEAL + t, T0 + REVEAL + t, f)
    return v
  },
}


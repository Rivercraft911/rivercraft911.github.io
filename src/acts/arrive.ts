// The arrival. The drain let go of us into the dark, and the dark is the inside of a cloud: we fall through a tower of
// it, out of its base, into the air of River's planet at sunrise over the hearts. One of them stands on the land
// ahead, as tall as the clouds are high, its LEDs beating, the sun coming up behind it. We go down into the light, past
// the heart, and climb out through the clear sky the planet keeps over its places, up through the air until the
// planet hangs whole, where the world (world/planet.ts) takes the camera from exactly where this leaves it: its home,
// at its clock's zero. The near air is arrive.wgsl's, and as the eye climbs it hands the frame back to planet.wgsl.
import { ARRIVE as SHADER } from '../gpu/fields'
import type { Field } from '../gpu/raster'
import type { Solids } from '../gpu/mesh'
import { ARRIVE } from './clock'
import { clamp, glide, mix, smooth, type Scene } from './scene'
import { ctx, cross, frame, len, site, unit, type V } from '../world/ctx'
import { PLACES } from '../world/places'
import { lamp } from '../world/sites/hearts'
import { arrival } from '../world/sound'
import { EXPOSE, HOME, paint, type Pose } from '../world/planet'

const HEART = PLACES.findIndex((P) => P.id === 'hearts'), SLOT = PLACES.filter((P) => P.lat < 80).indexOf(PLACES[HEART]) // (its slot in planet.wgsl's places)
const S = site(PLACES[HEART].lat, PLACES[HEART].lon), e: V = [0, 0, 0], N: V = [0, 0, 0]
frame(S, e, N)
const H = [Math.cos(HOME.pitch) * Math.sin(HOME.yaw), Math.sin(HOME.pitch), Math.cos(HOME.pitch) * Math.cos(HOME.yaw)]
const hd = H[0] * S[0] + H[1] * S[1] + H[2] * S[2]
const HX = (H[0] * e[0] + H[1] * e[1] + H[2] * e[2]) / hd, HY = (H[0] * N[0] + H[1] * N[1] + H[2] * N[2]) / hd // home, east and north of the hearts (gnomonic)

// The eye's flight, [t, east, north (gnomonic, rad from the hearts), ln altitude (radii)]: down the tower and out of its
// base, low under the deck toward the heart, up beside it through the cloud into the sunrise over the cloud's top, and
// up out of the air to home. A key before the start, so it is already falling.
const EYE = [
  [-1, -0.1135, 0.0414, Math.log(0.016)],
  [0, -0.1128, 0.041, Math.log(0.0105)],
  [2.4, -0.105, 0.037, Math.log(0.0026)],
  [5, -0.065, 0.022, Math.log(0.0022)],
  [7.5, -0.042, 0.01, Math.log(0.007)],
  [9.5, -0.04, 0.006, Math.log(0.024)],
  [11.5, 0.1 * HX, 0.1 * HY, Math.log(0.11)],
  [13, 0.45 * HX, 0.45 * HY, Math.log(0.8)],
  [ARRIVE, HX, HY, Math.log(HOME.d - 1)],
]
// Where it looks, [t, east, north, altitude]: straight down the fall, then ahead to the heart, up it as we rise; the
// planet's centre takes over as we climb away.
const AT = [
  [-1, -0.1135, 0.0414, -0.05],
  [0, -0.113, 0.041, -0.03],
  [1.8, -0.09, 0.03, -0.006],
  [3.6, 0, 0, 0.008],
  [7.5, 0.003, -0.001, 0.02],
  [9.5, 0.005, -0.002, 0.028],
  [ARRIVE, 0.005, -0.002, 0.028],
]

const pose: Pose = { eye: [0, 0, 0], at: [0, 0, 0], up: [0, 0, 0] }, u0: V = [0, 0, 0], u1: V = [0, 0, 0]
const ROLL = 0.63, SPIN = 1.2 // the drain's roll as it lets go of us, rad/s, and how long that takes to die away, s
const k4 = [0, 0, 0], g: V = [0, 0, 0]
const on = (x: number, y: number, alt: number, o: V) => {
  for (let i = 0; i < 3; i++) g[i] = S[i] + x * e[i] + y * N[i]
  unit(g)
  for (let i = 0; i < 3; i++) o[i] = g[i] * (1 + alt)
  return o
}
function fly(t: number) {
  glide(EYE, t, k4)
  on(k4[0], k4[1], Math.exp(k4[2]), pose.eye)
  glide(AT, t, k4)
  on(k4[0], k4[1], k4[2], pose.at)
  const c = smooth(10, ARRIVE - 0.4, t), w = smooth(10.5, ARRIVE, t)
  for (let i = 0; i < 3; i++) pose.at[i] *= 1 - c
  // up: away from the ground, and toward the planet's north as the eye goes out to home
  const r = len(pose.eye)
  for (let i = 0; i < 3; i++) pose.up[i] = mix(pose.eye[i] / r, i === 1 ? 1 : 0, w)
  // looking straight down, up is the way we are going, turned as the drain's water still turns us, slowing
  const dn = smooth(2.2, 0.6, t), roll = ROLL * SPIN * (1 - Math.exp(-(t + 1) / SPIN)), c0 = Math.cos(roll), s0 = Math.sin(roll)
  for (let i = 0; i < 3; i++) u0[i] = -0.94 * e[i] + 0.34 * N[i]
  cross(S, u0, u1)
  for (let i = 0; i < 3; i++) pose.up[i] = mix(pose.up[i], c0 * u0[i] + s0 * u1[i], dn)
  unit(pose.up)
  return Math.exp(glide(EYE, t, k4)[2])
}

const F: Field = { shader: SHADER, k: 1, p: ctx.p, res: 0.8 }
const FOV = Math.min(0.75, Math.max(0.5, 0.62 - 0.04 * Math.log10(0.3 / (HOME.d - 1)))) // the world's own, at home (planet.paint)
const solids = {} as Solids, sunc = [0, 0, 0, 0], LOOK = { tau: 0.05 }
let last = 0
export const arrive: Scene = {
  dur: ARRIVE,
  build(t, f) {
    const dt = clamp(t - last, 0, 0.1), pt = t - ARRIVE // the world's clock reads 0 as it takes over
    last = t
    const alt = fly(t)
    const fov = mix(1.05, FOV, smooth(9, ARRIVE, t))
    paint(f, pose, pt, dt, HEART, 0, false, fov)
    // the world's solids, standing on the planet (for the traced light), under this scene's exposure: out of the
    // dark it opens as we fall, and settles on the world's
    Object.assign(solids, f.field!.solids!, { ground: undefined, sunc })
    for (let i = 0; i < 3; i++) sunc[i] = f.field!.solids!.sunc[i]
    const ex = EXPOSE * mix(2.2, 1, smooth(8, ARRIVE - 1, t)) * smooth(0.1, 1.6, t)
    ctx.p[32] = sunc[3] = ex
    F.solids = solids
    f.field = F
    LOOK.tau = mix(0.05, 0.02, smooth(8.5, 9.5, t)) // a longer persistence in the cloud, so its grain averages away; a short one for the climb
    f.look = LOOK
    // the near world's share, the heart's beat, which place it is, and the time
    ctx.p[56] = 1 - smooth(0.05, 0.11, alt)
    ctx.p[57] = lamp[3]
    ctx.p[58] = SLOT
    ctx.p[59] = t
    ctx.p[7] = lamp[0], ctx.p[11] = lamp[1], ctx.p[15] = lamp[2]
    return arrival(t) // the fall's choir lands as we come out under the cloud, and the world's sound comes up under it
  },
}

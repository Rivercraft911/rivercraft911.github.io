// The arrival. The drain let go of us into the dark, and the dark is the inside of a cloud: we fall through a tower of
// it, out of its base, into the air of River's planet before sunrise. The hearts stand in a bowl the land keeps level
// for them, ringed by mountains wrapped in cumulus; one of them stands ahead, on its tip, 47 km of it leaning back to
// the east, its LEDs beating. The sun comes up over the ring behind it while the bowl is still in shadow; we climb past
// its face into the light, and on out of the air until the planet hangs whole, where the world (world/planet.ts) takes
// the camera from exactly where this leaves it: its home, at its clock's zero. The near air is arrive.wgsl's, and as
// the eye climbs it hands the frame back to planet.wgsl.
import { ARRIVE as SHADER } from '../gpu/fields'
import type { Field } from '../gpu/raster'
import type { Solids } from '../gpu/mesh'
import { ARRIVE } from './clock'
import { clamp, glide, mix, smooth, type Scene } from './scene'
import { ctx, cross, frame, len, site, unit, type V } from '../world/ctx'
import { PLACES } from '../world/places'
import { lamp } from '../world/sites/hearts'
import { arrival } from '../world/sound'
import { clock, EXPOSE, HOME, paint, type Pose } from '../world/planet'

const HEART = PLACES.findIndex((P) => P.id === 'hearts'), SLOT = PLACES.filter((P) => P.lat < 80).indexOf(PLACES[HEART]) // (its slot in planet.wgsl's places)
const S = site(PLACES[HEART].lat, PLACES[HEART].lon), e: V = [0, 0, 0], N: V = [0, 0, 0]
frame(S, e, N)
const H = [Math.cos(HOME.pitch) * Math.sin(HOME.yaw), Math.sin(HOME.pitch), Math.cos(HOME.pitch) * Math.cos(HOME.yaw)]
const hd = H[0] * S[0] + H[1] * S[1] + H[2] * S[2]
const HX = (H[0] * e[0] + H[1] * e[1] + H[2] * e[2]) / hd, HY = (H[0] * N[0] + H[1] * N[1] + H[2] * N[2]) / hd // home, east and north of the hearts (gnomonic)

// The heart's own ground frame, in km: u the way it leans (bearing 120°, the sun's side; its tip is at u = −17, its
// lobes 44 km up over u = +17, its face looking back up the way we come), v across it. A key there, as east and north
// of the hearts (gnomonic, rad); or a share of the way from where the climb leaves the heart to home.
const B = 2.0916
const at = (u: number, v: number) => [(u * Math.sin(B) - v * Math.cos(B)) / 1000, (u * Math.cos(B) + v * Math.sin(B)) / 1000]
const LEAVE = at(-40, -6)
const home = (s: number) => [mix(LEAVE[0], HX, s), mix(LEAVE[1], HY, s)]
const ln = (km: number) => Math.log(km / 1000)

// The eye's flight, [t, east, north, ln altitude (radii)]: down the tower (the bowl's floor is level, under 1 km) and
// out of its base, low over the bowl toward the heart as the sun comes up behind it, round and up its face and over its
// lobes against the sun, and on a log curve out of the air to home. A key before the start, so it is already falling.
const EYE = [
  [-1, ...at(-48, -33), ln(13)],
  [0, ...at(-47.5, -32.5), ln(10.5)],
  [2.4, ...at(-46, -30), ln(3.1)],
  [5, ...at(-37, -21), ln(2.4)],
  [7.5, ...at(-30, -12), ln(8)],
  [9.5, ...LEAVE, ln(32)],
  [11.5, ...home(0.03), ln(110)],
  [13, ...home(0.25), ln(800)],
  [ARRIVE, HX, HY, Math.log(HOME.d - 1)],
]
// Where it looks, [t, east, north, altitude (radii)]: straight down the fall, then ahead to the heart's tip and up its
// face as we rise, to its middle, and down it to the ground as we pass over; the planet's centre takes over as we
// climb away. (The look never turns faster than a radian a second.)
const AT = [
  [-1, ...at(-48, -33), -0.05],
  [0, ...at(-47.5, -32.5), -0.03],
  [1.4, ...at(-42, -27), -0.01],
  [3.9, ...at(-14, -4), 0.004],
  [7.5, ...at(-6, -2), 0.014],
  [9, ...at(2, 0), 0.024],
  [10.5, ...at(10, 0), 0.01],
  [12, ...at(14, 0), 0],
  [ARRIVE, ...at(14, 0), 0],
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
  const alt = Math.exp(k4[2])
  on(k4[0], k4[1], alt, pose.eye)
  glide(AT, t, k4)
  on(k4[0], k4[1], k4[2], pose.at)
  const c = smooth(10.5, ARRIVE - 0.4, t), w = smooth(10.5, ARRIVE, t)
  for (let i = 0; i < 3; i++) pose.at[i] *= 1 - c
  // up: away from the ground, and toward the planet's north as the eye goes out to home
  const r = len(pose.eye)
  for (let i = 0; i < 3; i++) pose.up[i] = mix(pose.eye[i] / r, i === 1 ? 1 : 0, w)
  // looking straight down, up is the way we are going, turned as the drain's water still turns us, slowing
  const dn = smooth(2.2, 0.6, t), roll = ROLL * SPIN * (1 - Math.exp(-(t + 1) / SPIN)), c0 = Math.cos(roll), s0 = Math.sin(roll)
  for (let i = 0; i < 3; i++) u0[i] = Math.sin(B) * e[i] + Math.cos(B) * N[i]
  cross(S, u0, u1)
  for (let i = 0; i < 3; i++) pose.up[i] = mix(pose.up[i], c0 * u0[i] + s0 * u1[i], dn)
  unit(pose.up)
  return alt
}

// The sun through the arrival: where the world's clock has it as the world takes over, and moving as fast there; before
// that a little lower, so it is still under the ring as we come out of the cloud and clears it as we climb.
const DAWN = 5.5, L: V = [0, 0, 0]
const dawn = (t: number) => t - ARRIVE - DAWN * (1 - t / ARRIVE) ** 2

const F: Field = { shader: SHADER, k: 1, p: ctx.p, res: 0.8 }
const FOV = Math.min(0.75, Math.max(0.5, 0.62 - 0.04 * Math.log10(0.3 / (HOME.d - 1)))) // the world's own, at home (planet.paint)
const solids = {} as Solids, sunc = [0, 0, 0, 0], LOOK = { tau: 0.05 }
let last = 0, n = 0
export const arrive: Scene = {
  dur: ARRIVE,
  build(t, f) {
    const dt = clamp(t - last, 0, 0.1), pt = t - ARRIVE // the world's clock reads 0 as it takes over
    last = t
    const alt = fly(t)
    const fov = mix(1.05, FOV, smooth(9, ARRIVE, t))
    paint(f, pose, pt, dt, HEART, 0, false, fov)
    const sun = f.field!.solids!.sun as number[]
    clock(dawn(t), L)
    for (let i = 0; i < 3; i++) ctx.p[20 + i] = sun[i] = L[i]
    sun[3] = 22 * clamp((L[0] * S[0] + L[1] * S[1] + L[2] * S[2]) * 6 + 0.5, 0, 1)
    // the world's solids, standing on the planet (for the traced light), under this scene's exposure: an eye's at dawn
    // in the air, settling on the world's. (The dark at the start is the cloud's own: nothing is faded in.)
    Object.assign(solids, f.field!.solids!, { ground: undefined, sunc })
    for (let i = 0; i < 3; i++) sunc[i] = f.field!.solids!.sunc[i]
    const ex = EXPOSE * mix(2.6, 1, smooth(7, ARRIVE - 1, t))
    ctx.p[32] = sunc[3] = ex
    ctx.p[35] = 1 - smooth(8.5, 10.5, t) // the tower, rained out as the sun climbs (it is the arrival's own: the world has none)
    F.solids = solids
    // once the near air has handed the frame to the planet's own, the field sharpens, a step at a time while the eye
    // rushes out, to the world's own size, and the phosphor's memory settles on the world's
    F.res = 0.8 + 0.2 * Math.floor(6 * smooth(12, 14.5, t))
    f.field = F
    // the phosphor's memory: long in the slow dawn, so it averages what each frame's few cloud steps miss; short as the
    // eye speeds up, so nothing bright streaks; the world's own as it slows into home
    LOOK.tau = t < 11 ? mix(0.035, 0.012, smooth(5.5, 10, t)) : mix(0.012, 0.025, smooth(12.5, ARRIVE, t))
    f.look = LOOK
    // the near world's share, the heart's beat, which place it is, and the frame (each frame samples its own depths)
    ctx.p[56] = 1 - smooth(0.05, 0.11, alt)
    ctx.p[57] = lamp[3]
    ctx.p[58] = SLOT
    ctx.p[59] = n = (n + 1) % 4096
    ctx.p[7] = lamp[0], ctx.p[11] = lamp[1], ctx.p[15] = lamp[2]
    return arrival(t) // the fall's choir lands as we come out under the cloud, and the world's sound comes up under it
  },
}

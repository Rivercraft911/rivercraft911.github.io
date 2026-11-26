// The tour: hard cuts, faster and faster, through River's own worlds, where the fall's fractals used to be. We don't
// know yet that they are one world: the reveal climbs out of the storm and shows it. The first time round each place
// is seen the way one of its own instruments sees it (seeing.ts): out of Pigeon Vision's fisheye as it climbs, R-01's
// drive on a scope painting R-01's frame, PEEP's world read out as text, the hearts lit at golden hour through a macro
// lens, Ephemeris-1's satellites despread on an analyser, the field SAMWISE's magnetometer feels, esp-dvbs2's I and Q.
// The second time round, faster, each place is itself, lit, the camera wilder (high with the lens tilted to a toy's,
// close in, a whip), the hearts on a sweep, and at the last the valley goes to glyphs, the glyphs the climb comes out of.
// Each place is still running while we are elsewhere, so a cut back finds it further on. The first pass holds each
// place a second down to 0.6 s, the second comes round faster, to under a third; only cuts of 0.6 s or more flash, so
// flashes are never closer than 0.6 s. Every cut lands on the splice's beat, and each place bends the choir its own way.
// ?w=<n> plays cut n over and over, for review.
import type { Look } from '../gpu/phosphor'
import type { Field } from '../gpu/raster'
import { place, sing, type Mood } from './choir'
import { CUTS, R3 as AT, TOUR } from './clock'
import { jump, splice } from './reality'
import { clamp, smooth, type Frame, type Scene } from './scene'
import { FISH, beat, despread, fishBeam, fisheye, hodo, iq, tube } from './seeing'
import { PLACES } from '../world/places'
import { ctx, frame, site, type V } from '../world/ctx'
import { clock, paint, type Pose } from '../world/planet'
import { shot as s1 } from '../world/sites/station'
import { shot as s2 } from '../world/sites/receiver'
import { shot as s3 } from '../world/sites/launch'
const SHOTS: Record<string, (k: number, tc: number, pose: Pose, t: number) => void> = { station: s1, receiver: s2, launch: s3 }

const ORDER = ['launch', 'lighthouse', 'bench', 'hearts', 'receiver', 'station', 'valley'].map((id) => PLACES.findIndex((P) => P.id === id))
const STARTS = CUTS.map((_, i) => CUTS.slice(0, i).reduce((a, b) => a + b, 0))
const PIN = Number(new URLSearchParams(location.search).get('w') ?? -1)
const cut = (t: number) => {
  if (PIN >= 0) return PIN
  let i = 0
  while (i + 1 < STARTS.length && t >= STARTS[i + 1]) i++
  return i
}
// how each place bends the choir (choir.ts moods: each keeps it a tone)
const MOODS: Mood[] = [{ gold: 1, lift: 0 }, { gold: 1, times: 3 }, { gold: 1, snap: 1 }, { gold: 1, mirror: 0 }, { gold: 1, prime: 1 }, { gold: 1, times: 2 }, { gold: 1 }]

// How each cut sees its place, and how its camera moves: pushing in, held, high with the lens tilted to a toy's, in a
// macro close enough that the lens is wide open, or whipping round it.
type How = 'lit' | 'fish' | 'tube' | 'text' | 'iq' | 'spread' | 'yarn' | 'beat'
type Cam = 'push' | 'hold' | 'high' | 'macro' | 'whip'
const PLAN: [How, Cam][] = [
  ['fish', 'push'], ['tube', 'push'], ['text', 'macro'], ['lit', 'hold'], ['spread', 'push'], ['yarn', 'push'], ['iq', 'high'],
  ['lit', 'push'], ['lit', 'high'], ['lit', 'macro'], ['beat', 'hold'], ['lit', 'whip'], ['lit', 'push'], ['text', 'high'],
]
// the phosphor each way of seeing wants: a scope's persistence holds a raster's frame, an analyser's density, a sweep
const LOOKS: Record<How, Partial<Look>> = { lit: { tau: 0.025 }, fish: { tau: 0.03 }, text: { tau: 0.025 }, tube: { tau: 0.3 }, iq: { tau: 0.05 }, spread: { tau: 0.12 }, yarn: { tau: 0.06 }, beat: { tau: 0.08 } }
const UNDER = 0.3 // the place's own light under an instrument's trace (under a picture, half that)

const pose: Pose = { eye: [0, 0, 0], at: [0, 0, 0], up: [0, 0, 0] }
const n: V = [0, 0, 0], e: V = [0, 0, 0], N: V = [0, 0, 0]
// Close on place k, tc into cut i: low over its hardware, pushing in and turning as a crane would, or as cam says.
function close(k: number, i: number, tc: number, cam: Cam) {
  const P = PLACES[k], [d0, p0, y0] = P.view
  site(P.lat, P.lon, n), frame(n, e, N)
  let d = d0 * (0.55 - 0.08 * tc), pitch = Math.max(0.12, p0 * 0.6 + 0.1 * Math.sin(i)), yaw = y0 + 0.9 * Math.sin(1.7 * i) + 0.25 * tc
  if (cam === 'hold') (d = d0 * 0.4), (yaw -= 0.21 * tc)
  else if (cam === 'high') (d = 0.3 + 0.08 * tc), (pitch = 1.05), (yaw += 0.2 * tc)
  else if (cam === 'macro') (d = d0 * (0.42 - 0.12 * tc)), (pitch = 0.5)
  else if (cam === 'whip') (d = d0 * 0.45), (yaw += 4 * tc - 0.8)
  const c = Math.cos(pitch), s = Math.sin(pitch)
  for (let j = 0; j < 3; j++) {
    pose.at[j] = n[j] * 1.012
    pose.up[j] = n[j]
    pose.eye[j] = pose.at[j] + d * (c * (Math.sin(yaw) * e[j] + Math.cos(yaw) * N[j]) + s * n[j])
  }
}

// Each place is seen at its own golden hour: the planet time, in the turn before the world's clock starts, when its
// sun stands 12° up in the east (morning) or west (alternately). The cuts are cuts in time as well as place.
const SUN = Math.sin((12 * Math.PI) / 180), Lt: V = [0, 0, 0]
const GOLD = ORDER.map((k, i) => {
  site(PLACES[k].lat, PLACES[k].lon, n)
  let best = 0, bd = Infinity
  for (let pt = -320; pt < 0; pt += 0.25) {
    clock(pt, Lt)
    const h = n[0] * Lt[0] + n[1] * Lt[1] + n[2] * Lt[2], rising = (clock(pt + 1, e), n[0] * e[0] + n[1] * e[1] + n[2] * e[2]) > h
    const d = Math.abs(h - SUN) + (rising === (i % 2 === 0) ? 0 : 1)
    if (d < bd) (bd = d), (best = pt)
  }
  return best
})

// The tour's own copy of the planet's field, so a cut may dim it or read it out as text without touching the world's.
const G: Field = { shader: 0, k: 1, p: ctx.p }
function own(f: Frame, k: number) {
  const F = f.field!
  G.shader = F.shader, G.p = F.p, G.solids = F.solids, G.res = F.res, G.k = k
  G.cell = undefined, G.ink = undefined, G.lift = undefined
  return (f.field = G)
}
const PEEP_INK = [0.26, 1.5, 0.52], DRAIN_INK = [0.55, 0.85, 1] // PEEP's green, in light; the glyphs the reveal climbs out of
let last = 0
export const tour: Scene = {
  dur: TOUR,
  build(t, f) {
    const i = cut(t), tc = PIN >= 0 ? t % CUTS[i] : t - STARTS[i], k = ORDER[i % ORDER.length], [how, cam] = PLAN[i % PLAN.length], pt = GOLD[i % ORDER.length] + t, ink = PLACES[k].ink
    const dt = clamp(t - last, 0, 0.1)
    last = t
    const run = tc * (i < ORDER.length ? 1 : 2) // second time round, the cameras move twice as fast
    if (how === 'fish') fisheye(tc, CUTS[i], pt, pose)
    else {
      close(k, i, run, cam)
      if (cam === 'push') SHOTS[PLACES[k].id]?.(k, run, pose, pt)
    }
    const n0 = f.ch.length
    paint(f, pose, pt, 1 / 60, k, how === 'fish' ? 0 : 1)
    const F = own(f, how === 'lit' || how === 'text' || how === 'fish' ? 1 : how === 'tube' ? UNDER / 2 : UNDER), S = F.solids!
    f.look = LOOKS[how]
    if (cam === 'high') S.aperture = 30 // a tilted lens's thin band of focus, on the place: the world below a model of itself
    if (cam === 'hold') S.focus = (S.focus ?? 1) * (1 + 2 * (1 - smooth(0, 0.45, tc))) // held, the focus racked in from behind
    if (how === 'fish') {
      ctx.p[3] = -FISH // the field through the fisheye (camera.wgsl); the solids, a pinhole's, stand down
      S.items.length = 0, (S.aperture = 0), (F.res = 2)
      f.ch.length = n0
      fishBeam(f, pt, ink)
    } else if (how === 'text') {
      ctx.p[36] = 1 // all of it read out (planet.wgsl's text, p[9].x)
      const drain = i === CUTS.length - 1
      F.cell = drain ? 12 : 10, F.ink = drain ? DRAIN_INK : PEEP_INK, F.lift = drain ? 2 : 1
    } else if (how !== 'lit') {
      f.ch.length = n0 // the place's own beam gives way to its instrument's
      f.rate = 4e6
      if (how === 'tube') tube(f, t - tc, t, ink)
      else if (how === 'iq') iq(f, tc, t, dt, ink)
      else if (how === 'spread') despread(f, tc, pt, ink)
      else if (how === 'yarn') hodo(f, tc, ink)
      else beat(f, pt, ink)
    }
    jump(tc, f, CUTS[i] >= 0.6, 0)
    place(t + AT)
    return (tt, o) => {
      const j = cut(tt), from = PIN >= 0 ? tt - (tt % CUTS[j]) : STARTS[j]
      if (splice(tt - from, o)) return
      sing(tt + AT, o, smooth(0, 0.03, tt - from), MOODS[j % MOODS.length])
    }
  },
}

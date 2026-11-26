// The tour: hard cuts, faster and faster, through River's own worlds, where the fall's fractals used to be. Each cut is
// a place on the planet seen close, through a macro lens, its hardware standing in its own light and its spectacle
// running (each still running while we are elsewhere, so a cut back finds it further on). We don't know yet that
// they are one world: the reveal climbs out of the storm and shows it. The first pass holds each place a second down
// to 0.6 s, the second comes round faster, to under a third; only cuts of 0.6 s or more flash, so flashes are never
// closer than 0.6 s. Every cut lands on the splice's beat, and each place bends the choir its own way.
// ?w=<n> pins cut n, for review.
import { place, sing, type Mood } from './choir'
import { CUTS, R3 as AT, TOUR } from './clock'
import { jump, splice } from './reality'
import { smooth, type Scene } from './scene'
import { PLACES } from '../world/places'
import { frame, site, type V } from '../world/ctx'
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

const pose: Pose = { eye: [0, 0, 0], at: [0, 0, 0], up: [0, 0, 0] }
const n: V = [0, 0, 0], e: V = [0, 0, 0], N: V = [0, 0, 0]
// Close on place k, tc into the cut: low over its hardware, pushing in and turning as a crane would.
function close(k: number, i: number, tc: number) {
  const P = PLACES[k], [d0, pitch0, yaw0] = P.view
  site(P.lat, P.lon, n), frame(n, e, N)
  const d = d0 * (0.55 - 0.08 * tc), pitch = Math.max(0.12, pitch0 * 0.6 + 0.1 * Math.sin(i)), yaw = yaw0 + 0.9 * Math.sin(1.7 * i) + 0.25 * tc
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
export const tour: Scene = {
  dur: TOUR,
  build(t, f) {
    const i = cut(t), tc = t - STARTS[i], k = ORDER[i % ORDER.length]
    close(k, i, tc)
    SHOTS[PLACES[k].id]?.(k, tc, pose, GOLD[i % ORDER.length] + t)
    paint(f, pose, GOLD[i % ORDER.length] + t, 1 / 60, k, 1)
    jump(tc, f, CUTS[i] >= 0.6, 0)
    place(t + AT)
    return (tt, o) => {
      const j = cut(tt), from = PIN >= 0 ? 0 : STARTS[j]
      if (splice(tt - from, o)) return
      sing(tt + AT, o, smooth(0, 0.03, tt - from), MOODS[j % MOODS.length])
    }
  },
}

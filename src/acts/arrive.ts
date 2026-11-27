// The arrival. The drain let go of us into the dark, and the dark is the inside of a cloud: we fall through a tower of
// it, out of its base, into the air of River's planet before sunrise. The hearts stand in a bowl the land keeps level
// for them, ringed by mountains wrapped in cumulus; one of them stands ahead, on its tip, 47 km of it leaning back to
// the east, its LEDs beating. The sun comes up over the ring behind it while the bowl is still in shadow; we climb past
// its face into the light, then fly on round the planet past each of River's places, the sun going with us so each is
// lit as we come to it, its name put up as we pass; over the pole and out through the satellites' sky until the planet
// hangs whole, where the world (world/planet.ts) takes the camera from exactly where this leaves it: its home, at its
// clock's zero, its index made of the names we passed. The near air is arrive.wgsl's, and as the eye climbs it hands
// the frame back to planet.wgsl.
import { ARRIVE as SHADER } from '../gpu/fields'
import type { Field } from '../gpu/raster'
import type { Solids } from '../gpu/mesh'
import { ARRIVE } from './clock'
import { clamp, glide, mix, smooth, view, type Scene } from './scene'
import { ctx, cross, dot, frame, len, site, unit, type V } from '../world/ctx'
import { PLACES } from '../world/places'
import { lamp } from '../world/sites/hearts'
import { arrival } from '../world/sound'
import { covered, passed } from '../world/pages'
import { D0, DAY, EXPOSE, H0, HOME, L0, OB, paint, sunAt, tint, type Pose } from '../world/planet'

const HEART = PLACES.findIndex((P) => P.id === 'hearts'), SLOT = PLACES.filter((P) => P.lat < 80).indexOf(PLACES[HEART]) // (its slot in planet.wgsl's places)
const S = site(PLACES[HEART].lat, PLACES[HEART].lon), e: V = [0, 0, 0], N: V = [0, 0, 0]
frame(S, e, N)

// The heart's own ground frame, in km: u the way it leans (bearing 120°, the sun's side; its tip is at u = −17, its
// lobes 44 km up over u = +17, its face looking back up the way we come), v across it. A key there, as east and north
// of the hearts (gnomonic, rad).
const B = 2.0916
const at = (u: number, v: number) => [(u * Math.sin(B) - v * Math.cos(B)) / 1000, (u * Math.cos(B) + v * Math.sin(B)) / 1000]
const ln = (km: number) => Math.log(km / 1000)

// The eye's flight to the heart's crest, [t, east, north, ln altitude (radii)]: down the tower (the bowl's floor is
// level, under 1 km) and out of its base, low over the bowl toward the heart as the sun comes up behind it, round and up
// its face and over its lobes against the sun. A key before the start, so it is already falling; and one after the
// crest, for the way it leaves it. (The tour takes over from here.)
const EYE = [
  [-1, ...at(-48, -33), ln(13)],
  [0, ...at(-47.5, -32.5), ln(10.5)],
  [2.4, ...at(-46, -30), ln(3.1)],
  [5, ...at(-37, -21), ln(2.4)],
  [7.5, ...at(-30, -12), ln(8)],
  [9.5, ...at(-40, -6), ln(32)],
  [11.5, ...at(-35, -8), ln(110)],
]
// Where it looks, [t, east, north, altitude (radii)]: straight down the fall, then ahead to the heart's tip and up its
// face as we rise, to its middle. (The look never turns faster than a radian a second.)
const AT = [
  [-1, ...at(-48, -33), -0.05],
  [0, ...at(-47.5, -32.5), -0.03],
  [1.4, ...at(-42, -27), -0.01],
  [3.9, ...at(-14, -4), 0.004],
  [7.5, ...at(-6, -2), 0.014],
  [9, ...at(2, 0), 0.024],
  [10.5, ...at(10, 0), 0.01],
]
const k4 = [0, 0, 0], g: V = [0, 0, 0]
const on = (x: number, y: number, alt: number, o: V) => {
  for (let i = 0; i < 3; i++) g[i] = S[i] + x * e[i] + y * N[i]
  unit(g)
  for (let i = 0; i < 3; i++) o[i] = g[i] * (1 + alt)
  return o
}
const near = (t: number, o: V) => (glide(EYE, t, k4), on(k4[0], k4[1], Math.exp(k4[2]), o))
const looks = (t: number, o: V) => (glide(AT, t, k4), on(k4[0], k4[1], k4[2], o))

// A cubic through the keys (t, y) whose second derivative is continuous all along (glide's is only C¹, and stops at
// every turn of every coordinate): free at the first key, at rest at the last.
function cubic(T: number[], Y: number[]) {
  const n = T.length, M = new Float64Array(n), b = new Float64Array(n), d = new Float64Array(n), h = T.slice(1).map((x, i) => x - T[i])
  b[0] = 1
  for (let i = 1; i < n; i++) {
    const last = i === n - 1, a = h[i - 1]
    b[i] = last ? 2 * a : 2 * (a + h[i])
    d[i] = 6 * ((last ? 0 : (Y[i + 1] - Y[i]) / h[i]) - (Y[i] - Y[i - 1]) / a)
    const m = a / b[i - 1]
    b[i] -= m * (i === 1 ? 0 : h[i - 1]), d[i] -= m * d[i - 1]
  }
  for (let i = n - 1; i >= 0; i--) M[i] = (d[i] - (i < n - 1 && i > 0 ? h[i] * M[i + 1] : 0)) / b[i]
  return (t: number) => {
    if (t >= T[n - 1]) return Y[n - 1]
    if (t < T[0]) return Y[0] + ((Y[1] - Y[0]) / h[0] - (h[0] * (2 * M[0] + M[1])) / 6) * (t - T[0])
    let i = 0
    while (i < n - 2 && t > T[i + 1]) i++
    const u = t - T[i], v = T[i + 1] - t, H = h[i]
    return (M[i] * v * v * v + M[i + 1] * u * u * u) / (6 * H) + (Y[i] / H - (M[i] * H) / 6) * v + (Y[i + 1] / H - (M[i + 1] * H) / 6) * u
  }
}
// The same through points in space: their way (normalized) and how far out (`lift`: over the ground, by its log).
function curve(T: number[], P: V[], lift: boolean) {
  const c = [0, 1, 2].map((i) => cubic(T, P.map((p) => p[i]))), r = cubic(T, P.map((p) => (lift ? Math.log(len(p) - 1) : len(p))))
  return (t: number, o: V) => {
    for (let i = 0; i < 3; i++) o[i] = c[i](t)
    unit(o)
    const k = lift ? 1 + Math.exp(r(t)) : r(t)
    for (let i = 0; i < 3; i++) o[i] *= k
    return o
  }
}

// ---- the tour ----------------------------------------------------------------------------------------------------
// River's places after the heart, in an order one flight round the planet can take (east to the receiver, then west
// and south and north through the rest, over the pole), each looked at for a beat from how far and how steeply; then
// the satellites' sky on the way out. Their names go up as we pass.
const TOUR: [id: string, t: number, d: number, pitch: number][] = [
  ['receiver', 12.3, 0.35, 0.7],
  ['lighthouse', 13.4, 0.45, 0.7],
  ['glasses', 14.5, 0.4, 0.6],
  ['valley', 15.6, 0.4, 0.8],
  ['bench', 16.6, 0.3, 0.7],
  ['launch', 17.7, 0.3, 0.7],
  ['core', 19.2, 0.6, 0.95],
]
const SKY: [id: string, t: number][] = [['bleps', 20.4], ['station', 21.4]]
const CREST = 9.6, JOIN = [9.4, 10.6] // the heart passed; where the tour's flight takes over from the climb's
const idx = (id: string) => PLACES.findIndex((P) => P.id === id)
// Each beat's eye: behind its place and over it, along the heading (of every 7.5°) that turns the view least from one
// beat to the next (and least from the world's own view of it), chosen once, as a path through a trellis.
const beats = TOUR.map(([id, t, d, pitch]) => {
  const P = PLACES[idx(id)], n = site(P.lat, P.lon), E: V = [0, 0, 0], No: V = [0, 0, 0]
  frame(n, E, No)
  return { k: idx(id), t, d, pitch, p: n.map((x) => x * (1.01 + (P.rise ?? 0))), n, E, No, yaw: P.view[2] }
})
const HN = 48
const option = (b: (typeof beats)[0], j: number) => {
  const a = (2 * Math.PI * j) / HN, h = b.E.map((x, i) => Math.sin(a) * x + Math.cos(a) * b.No[i]), c = Math.cos(b.pitch), s = Math.sin(b.pitch)
  return { eye: b.p.map((x, i) => x - b.d * c * h[i] + b.d * s * b.n[i]), v: h.map((x, i) => c * x - s * b.n[i]), a }
}
const angle = (u: V, v: V) => Math.acos(clamp(dot(u, v), -1, 1))
const crest = near(CREST, [0, 0, 0]), crestV = unit(looks(CREST, [0, 0, 0]).map((x, i) => x - crest[i]))
let cost = Array.from({ length: HN }, (_, j) => [(angle(option(beats[0], j).v, crestV) / (beats[0].t - CREST)) ** 2, -1])
const back: number[][] = []
for (let k = 1; k < beats.length; k++) {
  const dt = beats[k].t - beats[k - 1].t, next = []
  for (let j = 0; j < HN; j++) {
    const o = option(beats[k], j), off = Math.abs(Math.atan2(Math.sin(o.a + Math.PI - beats[k].yaw), Math.cos(o.a + Math.PI - beats[k].yaw)))
    let best = [Infinity, -1]
    for (let i = 0; i < HN; i++) {
      const p = option(beats[k - 1], i), c = cost[i][0] + (angle(o.v, p.v) / dt) ** 2 + 0.3 * (len(o.eye.map((x, m) => x - p.eye[m])) / dt) ** 2 + 0.4 * off * off
      if (c < best[0]) best = [c, i]
    }
    next.push(best)
  }
  back.push(next.map((x) => x[1]))
  cost = next
}
const pick = [cost.reduce((b, c, i) => (c[0] < cost[b][0] ? i : b), 0)]
for (let k = back.length - 1; k >= 0; k--) pick.unshift(back[k][pick[0]])
const views = beats.map((b, k) => option(b, pick[k]))

// The flight: from the climb's own path through the crest, through each beat's eye, out to home at rest; and the
// way it looks, from the climb's own through each beat's view of its place.
const HOMEP = [Math.cos(HOME.pitch) * Math.sin(HOME.yaw), Math.sin(HOME.pitch), Math.cos(HOME.pitch) * Math.cos(HOME.yaw)].map((x) => x * HOME.d)
const lead = [8.5, 9, 9.5], up0: V = [0, 0, 0]
const tourEye = curve(
  [...lead, 10.6, ...beats.map((b) => b.t), ARRIVE],
  [...lead.map((t) => near(t, [0, 0, 0])), on(...(at(-36, -6) as [number, number]), 0.1, [0, 0, 0]), ...views.map((v) => v.eye), HOMEP],
  true,
)
const tourLook = curve([...lead, ...beats.map((b) => b.t)], [...lead.map((t) => unit(looks(t, [0, 0, 0]).map((x, i) => x - near(t, up0)[i]))), ...views.map((v) => v.v)], false)

// The sun: before the crest, the world's clock's, held a little behind it so it is still under the ring as we come
// out of the cloud and clears it as we climb; then going round with us, 30° up and 40° round from behind the eye at each
// place, so each is lit as we come to it (as the world lights a place it flies to: planet.ts's light()); at home,
// the world's clock's own. As [day, year]: sunAt's hours on and declination over the arrival's.
const DAWN = 5.5
const dawn = (t: number) => t - 15 - DAWN * (1 - t / 15) ** 2 - (t - ARRIVE) // (as the arrival was 15 s long)
const hour = (s: V, t: number) => [(H0 - Math.atan2(s[0], s[2])) / DAY - (t - ARRIVE), clamp(Math.asin(s[1]), -OB, OB) - D0]
const PERIOD = (2 * Math.PI) / DAY
let was = [dawn(lead[2]), 0]
const sunKeys = beats.map((b, k) => {
  // of the bearings round from behind the eye, the nearest to 40° either way that the year (±24°) can put the sun at,
  // and that the sun need go least far to from where it was
  let best = was, score = -Infinity
  for (let j = 0; j < 36; j++) {
    const o = (j * Math.PI) / 18, a = views[k].a + Math.PI + o, h = b.E.map((x, i) => Math.sin(a) * x + Math.cos(a) * b.No[i]), s = unit(h.map((x, i) => 0.866 * x + 0.5 * b.n[i]))
    const y = hour(s, b.t)
    y[0] -= PERIOD * Math.round((y[0] - was[0]) / PERIOD) // (the hour nearest the last)
    const off = Math.abs(Math.atan2(Math.sin(o), Math.cos(o))), c = -((off - 0.7) ** 2) - 40 * Math.max(Math.abs(Math.asin(s[1])) - OB, 0) ** 2 - 0.4 * (DAY * (y[0] - was[0])) ** 2 - 0.4 * (y[1] - was[1]) ** 2
    if (c > score) (score = c), (best = y)
  }
  return (was = best)
})
// At the pole any hour gives the same sun (its year's height): it takes the hour that lies on the way. On the way out,
// the face we see lit, coming round to the world's own morning (L0); and at home that morning itself, whole days on
// (the same sun: the world's clock reads 0).
const lit = beats.map((b, k) => [b.t, ...sunKeys[k]]).filter((_, k) => PLACES[beats[k].k].lat < 80)
for (const [, t] of SKY) {
  const E = tourEye(t, [0, 0, 0]), y = hour(unit(E.map((x, i) => mix(x / len(E), L0[i], 0.55))), t)
  y[0] -= PERIOD * Math.round((y[0] - lit[lit.length - 1][1]) / PERIOD)
  lit.push([t, ...y])
}
lit.push([ARRIVE, PERIOD * Math.round(lit[lit.length - 1][1] / PERIOD), 0])
const sunT = [...lead, ...lit.map((k) => k[0])]
const day = cubic(sunT, [...lead.map(dawn), ...lit.map((k) => k[1])]), year = cubic(sunT, [...lead.map(() => 0), ...lit.map((k) => k[2])])

// Which place is shown in full (its spectacle, its shadows): the heart, then each in its beat, the satellites in theirs,
// and none as the world takes over.
const SHOW = [...beats.map((b) => [b.k, b.t] as const), ...SKY.map(([id, t]) => [idx(id), t] as const)]
function shown(t: number) {
  if (t < (CREST + SHOW[0][1]) / 2) return HEART
  for (let i = 0; i < SHOW.length; i++) if (i === SHOW.length - 1 || t < (SHOW[i][1] + SHOW[i + 1][1]) / 2) return t < SHOW[i][1] + 1 ? SHOW[i][0] : -1
  return -1
}
// When each place is passed: the heart at its crest, the rest at their beats (and seconds since, negative before).
const PASS = new Float64Array(PLACES.length).fill(Infinity)
PASS[HEART] = CREST
for (const [k, t] of SHOW) PASS[k] = t
const since = new Float64Array(PLACES.length)

const pose: Pose = { eye: [0, 0, 0], at: [0, 0, 0], up: [0, 0, 0] }, u0: V = [0, 0, 0], u1: V = [0, 0, 0], a3: V = [0, 0, 0], b3: V = [0, 0, 0]
const ROLL = 0.63, SPIN = 1.2 // the drain's roll as it lets go of us, rad/s, and how long that takes to die away, s
const ease = (a: number, b: number, x: number) => {
  const k = clamp((x - a) / (b - a))
  return k * k * k * (k * (6 * k - 15) + 10) // (C²)
}
function fly(t: number) {
  // the climb's path, then the tour's
  const q = ease(JOIN[0], JOIN[1], t)
  if (q < 1) near(t, pose.eye), looks(t, pose.at)
  if (q > 0) {
    tourEye(t, a3), tourLook(Math.min(t, beats[beats.length - 1].t), b3)
    for (let i = 0; i < 3; i++) (b3[i] = a3[i] + 0.3 * b3[i]), (pose.eye[i] = mix(pose.eye[i], a3[i], q)), (pose.at[i] = mix(pose.at[i], b3[i], q))
  }
  // over the pole and out, it comes round to the planet's centre
  const c = ease(beats[beats.length - 1].t + 0.2, ARRIVE - 0.3, t), w = ease(ARRIVE - 4.5, ARRIVE, t)
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
  return r - 1
}

// As the index finishes laying itself, the planet comes to stand clear of it, the way the world frames it (planet.ts
// paint): looked past, by the share of the screen the words cover.
const fw: V = [0, 0, 0], rt: V = [0, 0, 0], uq: V = [0, 0, 0]
function clearOf(s: number, fov: number) {
  const c = covered()
  if (!(c[0] || c[1])) return
  for (let i = 0; i < 3; i++) fw[i] = pose.at[i] - pose.eye[i]
  const h = s * len(fw) * Math.tan(fov / 2)
  unit(fw), unit(cross(fw, pose.up, rt)), cross(rt, fw, uq)
  for (let i = 0; i < 3; i++) pose.at[i] += h * (c[0] * view.a * rt[i] - c[1] * uq[i])
}

const F: Field = { shader: SHADER, k: 1, p: ctx.p, res: 0.8 }
const FOV = Math.min(0.75, Math.max(0.5, 0.62 - 0.04 * Math.log10(0.3 / (HOME.d - 1)))) // the world's own, at home (planet.paint)
const solids = {} as Solids, sunc = [0, 0, 0, 0], LOOK = { tau: 0.05 }, L: V = [0, 0, 0], RIVER = site(PLACES[idx('valley')].lat, PLACES[idx('valley')].lon)
let last = 0, n = 0
export const arrive: Scene = {
  dur: ARRIVE,
  build(t, f) {
    const dt = clamp(t - last, 0, 0.1), pt = t - ARRIVE // the world's clock reads 0 as it takes over
    last = t
    const alt = fly(t), focus = shown(t)
    const fov = mix(1.05, FOV, smooth(9, ARRIVE, t))
    clearOf(ease(ARRIVE - 3, ARRIVE, t), fov)
    paint(f, pose, pt, dt, focus, 0, false, fov)
    // the sun, as it goes with us, on the field, on the hardware (its colour where it shines, through the air)
    const q = ease(JOIN[0], JOIN[1], t)
    sunAt(pt, mix(dawn(t), day(t), q), mix(0, year(t), q), L)
    const sun = f.field!.solids!.sun as number[], here = focus >= 0 ? site(PLACES[focus].lat, PLACES[focus].lon, a3) : RIVER
    for (let i = 0; i < 3; i++) ctx.p[20 + i] = sun[i] = ctx.L[i] = L[i]
    sun[3] = 22 * clamp(dot(here, L) * 6 + 0.5, 0, 1)
    tint(here, L, sunc)
    // the world's solids, standing on the planet (for the traced light), under this scene's exposure: an eye's at dawn
    // in the air, settling on the world's. (The dark at the start is the cloud's own: nothing is faded in.)
    const k = 1 - smooth(0.05, 0.11, alt)
    Object.assign(solids, f.field!.solids!, k > 0 ? { ground: undefined, sunc } : { sunc })
    const ex = EXPOSE * mix(2.6, 1, smooth(7, 12, t))
    ctx.p[32] = sunc[3] = ex
    ctx.p[35] = 1 - smooth(8.5, 10.5, t) // the tower, rained out as the sun climbs (it is the arrival's own: the world has none)
    F.solids = solids
    // once out over the pole, the field sharpens, a step at a time while the eye rushes out, to the world's own size,
    // and the phosphor's memory settles on the world's
    F.res = 0.8 + 0.2 * Math.floor(6 * smooth(ARRIVE - 3.5, ARRIVE - 1, t))
    f.field = F
    // the phosphor's memory: long in the slow dawn, so it averages what each frame's few cloud steps miss; short as the
    // eye speeds up, so nothing bright streaks; the world's own as it slows into home
    LOOK.tau = t < 11 ? mix(0.035, 0.012, smooth(5.5, 10, t)) : mix(0.016, 0.025, smooth(ARRIVE - 4, ARRIVE, t))
    f.look = LOOK
    // the near world's share, the heart's beat, which place it is, and the frame (each frame samples its own depths)
    ctx.p[56] = k
    ctx.p[57] = lamp[3]
    ctx.p[58] = SLOT
    ctx.p[59] = n = (n + 1) % 4096
    ctx.p[7] = lamp[0], ctx.p[11] = lamp[1], ctx.p[15] = lamp[2]
    // the names of the places passed, put up and laid into the index
    for (let i = 0; i < PLACES.length; i++) since[i] = t - PASS[i]
    passed(since)
    return arrival(t) // the fall's choir lands as we come out under the cloud, and the world's sound comes up under it
  },
}

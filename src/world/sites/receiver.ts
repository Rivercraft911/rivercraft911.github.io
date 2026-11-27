// Ephemeris-1 under the GPS constellation: River's board on the ground, its SMA taking the cable of a passive L1 patch
// beside it (Rev 1 sends no antenna bias), and, while the place is looked at, the receiver finding the sky.
//
// The sky. A Walker 24/6/1 shell at 4.17 radii (26 560 km), 55°, PRN 1 to 24 in slot order, seen from the patch over
// a 5° mask: each satellite's range, and its Doppler −ṙ/c · L1 (the shell goes round 343× fast here; the rates are
// scaled back to real ones).
// The search. From cold, as the firmware does it on the ground: one satellite at a time, its Doppler bins swept up
// from −12 kHz in steps of 2046/4096 kHz (a 1 ms dwell's FFT, zero-padded to 4096: 499.5 Hz), every code phase at once
// in each; where the sweep reaches the satellite's own Doppler, the peak, and it locks. Each found satellite is joined to
// the patch by a thread of light, and holds until it sets; then the next, up to the receiver's eight channels. It
// searches only what is up, strongest first (the firmware, cold, tries PRNs 1 to 32 in turn), and its pace is not real
// (thirty bins a second here). Which one it is searching for goes to the sound.
import { TAU, clamp } from '../../acts/scene'
import { L1 } from '../../dsp/gps'
import { box, make, pipe, slab, tube } from '../make'
import { ctx, cross, dot, frame, part, site, solid, unit, type V } from '../ctx'
import { PLACES, type About, type Steer } from '../places'
import { C, DEG, RE, orbit } from './sky'

const RATE = 0.05, SHELL = 4.17, INC = 55 * DEG // the shell
const LAPSE = RATE / (TAU / 43082) // real seconds a scene second: a GPS orbit is half a sidereal day
const MASK = Math.sin(5 * DEG) // elevation mask
const BIN = 2046 / 4.096, SPAN = 12000, BINS = 49, SWEEP = 30 // Hz a bin; the search's ±Hz, its bins; bins a second here

// ---- the bench, in millimetres: x north, y up, z east, from the board's place on the ground --------------------------
// The board is ephemeris.glb as places.ts used to stand it (0.07 radii across, its x north, its SMA facing south); the
// patch is a common passive L1 part: a 25 × 25 × 4 mm ceramic square, its silver 21 mm square cut at two corners for
// right-hand circular polarisation and fed 2.5 mm off centre, on a 50 mm ground plate; RG174 to an SMA plug.
const SIZE = 0.07, MM = SIZE / 51, FOOT = 2.19 // radii across the board (its SMA too), radii a millimetre, its underside under its middle
const PATCH = [-40, 8.6, 62] // the patch's face, its phase centre
const steel = { col: [0.62, 0.63, 0.65, 1], metal: 1, rough: 0.5 }, gold = { col: [1, 0.78, 0.34, 1], metal: 1, rough: 0.25 }
const black = { col: [0.02, 0.02, 0.022, 1], metal: 0, rough: 0.5 }
make('l1-patch', () => {
  box(steel, [-25, 3, -25], [25, 4.5, 25])
  for (const [x, z] of [[-21, -21], [-21, 21], [21, -21], [21, 21]]) tube(black, [x, 0, z], [0, 1, 0], 2, 2, 3, 12, true)
  box({ col: [0.75, 0.66, 0.52, 1], metal: 0, rough: 0.6 }, [-12.5, 4.5, -12.5], [12.5, 8.5, 12.5])
  const c = 3 // the truncated corners
  slab({ col: [0.92, 0.92, 0.9, 1], metal: 1, rough: 0.3 }, [[-10.5 + c, -10.5], [10.5, -10.5], [10.5, 10.5 - c], [10.5 - c, 10.5], [-10.5, 10.5], [-10.5, -10.5 + c]], 8.5, 8.6)
  tube(steel, [2.5, 8.6, 0], [0, 1, 0], 0.65, 0.65, 0.15, 12)
})
// the cable, from the plug on the board's SMA (its axis 3.5 mm up, its mouth 28.5 mm south of the board's middle) round
// to under the plate
make('l1-cable', () => {
  tube({ ...gold, col: [0.85, 0.85, 0.82, 1] }, [-25.5, 3.5, 0], [-1, 0, 0], 4.62, 4.62, 7, 6, true) // the coupling nut, 8 mm across flats
  tube(gold, [-32.5, 3.5, 0], [-1, 0, 0], 3, 3, 8.5, 16, true)
  tube(black, [-41, 3.5, 0], [-1, 0, 0], 2.6, 1.8, 9, 16)
  pipe(black, [[-50, 3.5, 0], [-54, 2.6, 2], [-57, 1.6, 8], [-58, 1.4, 16], [-55, 1.4, 25], [-49, 1.4, 32], [-44, 1.4, 38], [-41, 1.4, 50], [-40, 1.4, 62]], 1.4, 10)
})
// a GPS satellite, an emblem of one (body, two wings, its nadir panel), in units of its own: it is far too small to see
make('gps-sv', () => {
  box({ col: [0.75, 0.6, 0.25, 1], metal: 1, rough: 0.35 }, [-1, -1, -1.2], [1, 1, 1.2])
  box({ col: [0.86, 0.86, 0.84, 1], metal: 0, rough: 0.5 }, [-0.9, 1, -1], [0.9, 1.25, 1])
  for (const s of [-1, 1]) box({ col: [0.05, 0.07, 0.16, 1], metal: 0.6, rough: 0.3 }, [-0.7, -0.05, s * 1.6], [0.7, 0.05, s * 6.5])
})
// a thread of light: one unit long along x, widening sixteenfold, stretched to length when placed (thread()). It is
// light, not a thing: the tracer is not given it.
const TAPER = 16
make('gps-thread', () => tube({ col: [0.6, 0.9, 1, 1], metal: 0, rough: 1 }, [0, 0, 0], [1, 0, 0], 1, TAPER, 1, 6, true))

// ---- the sky, each frame -------------------------------------------------------------------------------------------
const n: V = [0, 0, 0], E: V = [0, 0, 0], N: V = [0, 0, 0], rx: V = [0, 0, 0], v: V = [0, 0, 0], S: V = [0, 0, 0]
const SV = new Float64Array(72), range = new Float64Array(24), doppler = new Float64Array(24), seenUp = new Uint8Array(24), elev = new Float64Array(24)
function sky(t: number) {
  for (let i = 0; i < 24; i++) {
    const raan = ((i >> 2) * TAU) / 6, u = ((i & 3) * TAU) / 4 + ((i >> 2) * TAU) / 24 + RATE * t
    orbit(SHELL, raan, INC, u, S), orbit(SHELL * RATE, raan, INC, u + Math.PI / 2, v)
    const dx = S[0] - rx[0], dy = S[1] - rx[1], dz = S[2] - rx[2], r = Math.hypot(dx, dy, dz)
    SV[3 * i] = S[0], SV[3 * i + 1] = S[1], SV[3 * i + 2] = S[2]
    range[i] = r
    elev[i] = (dx * n[0] + dy * n[1] + dz * n[2]) / r
    seenUp[i] = +(elev[i] > MASK)
    doppler[i] = ((-(v[0] * dx + v[1] * dy + v[2] * dz) / r) * RE) / LAPSE / C * L1
  }
}

// ---- the search ---------------------------------------------------------------------------------------------------
// cur: the satellite being searched for (−1 none); bin: how far up the sweep is; lit[i]: how far satellite i's thread
// has reached (0 to 1), and grows toward found[i] (1 locked, else how far the search has come)
let cur = -1, bin = 0, rest = 0
// Each lock, for the music (sound.ts): how many there have been, and the one just found's own note (its voice's, below).
export const events = { n: 0, f: 0 }
const found = new Float64Array(24), lit = new Float64Array(24)
function search(dt: number) {
  for (let i = 0; i < 24; i++) if (!seenUp[i]) found[i] = 0 // set: lost
  if (cur >= 0 && !seenUp[cur]) cur = -1
  if (cur < 0) {
    if ((rest -= dt) > 0) return
    // the next satellite up that is not held, highest first (the strongest), while a channel is free
    let best = -1, held = 0
    for (let i = 0; i < 24; i++) {
      if (found[i] >= 1) held++
      else if (seenUp[i] && (best < 0 || elev[i] > elev[best])) best = i
    }
    if (best < 0 || held >= 8) return
    cur = best, bin = 0
  }
  bin += SWEEP * dt
  const at = (doppler[cur] + SPAN) / BIN // the bin its Doppler falls in, counted from the bottom
  found[cur] = Math.min(0.4, (0.4 * bin) / BINS)
  if (bin >= Math.round(at)) (found[cur] = 1), (events.f = NOTE[cur] * 2 ** (doppler[cur] / 4500 / 24)), events.n++, (cur = -1), (rest = 0.6)
}
function cold() {
  cur = -1, bin = 0, rest = 0.25
  found.fill(0)
}

// ---- the parts: where they are and how they move -------------------------------------------------------------------
// A follower: x goes to its goal critically damped (no overshoot, no jump in its speed).
type F = { x: number; v: number }
const follow = (f: F, goal: number, w: number, dt: number) => ((f.v += (w * w * (goal - f.x) - 2 * w * f.v) * dt), (f.x += f.v * dt))
const apart: F = { x: 0, v: 0 }, held: F = { x: 0, v: 0 }, shown: F = { x: 0, v: 0 }
let spin = 0, was = false

const O: V = [0, 0, 0], w: V = [0, 0, 0], c: V = [0, 0, 0], ax: V = [0, 0, 0], ay: V = [0, 0, 0], az: V = [0, 0, 0], h: V = [0, 0, 0], to: V = [0, 0, 0]
// bench point (x north, y up, z east, mm) to the world: the place's own point is between the board and the patch
function world(x: number, y: number, z: number, o: V) {
  ;(x += 20), (z -= 31)
  const d = (x * x + z * z) * MM * 0.5 // the ground falls away from the tangent plane
  for (let i = 0; i < 3; i++) o[i] = O[i] * (1 + (y - d) * MM) + (N[i] * x + E[i] * z) * MM
  return o
}
// model `id`, made in millimetres (or `u` of them a unit: River's CAD is in metres), its origin at bench point (x, y, z),
// its axes along a, b, cc
function put(id: string, x: number, y: number, z: number, a: V, b: V, cc: V, u = 1) {
  const m = ctx.models[id]
  if (!m) return false
  world(x, y, z, w)
  const mx = (m.lo[0] + m.hi[0]) / 2, my = (m.lo[1] + m.hi[1]) / 2, mz = (m.lo[2] + m.hi[2]) / 2, s = u * MM
  for (let i = 0; i < 3; i++) w[i] += (a[i] * mx + b[i] * my + cc[i] * mz) * s
  return solid(id, w, a, b, cc, Math.max(m.hi[0] - m.lo[0], m.hi[1] - m.lo[1], m.hi[2] - m.lo[2]) * s)
}
// v turned th about unit axis a, in place
function rot(v: V, a: V, th: number) {
  const cs = Math.cos(th), sn = Math.sin(th), d = dot(a, v) * (1 - cs)
  const x = a[1] * v[2] - a[2] * v[1], y = a[2] * v[0] - a[0] * v[2], z = a[0] * v[1] - a[1] * v[0]
  ;(v[0] = v[0] * cs + x * sn + a[0] * d), (v[1] = v[1] * cs + y * sn + a[1] * d), (v[2] = v[2] * cs + z * sn + a[2] * d)
}
// a thread of light from world point a to b, `px` pixels wide where it starts, `glow` bright
const tx: V = [0, 0, 0], ty: V = [0, 0, 0], tz: V = [0, 0, 0]
function thread(a: V, b: V, px: number, glow: number) {
  for (let i = 0; i < 3; i++) tx[i] = b[i] - a[i]
  const r = (0.5 * px * Math.hypot(a[0] - ctx.E[0], a[1] - ctx.E[1], a[2] - ctx.E[2])) / ctx.ppr
  cross(tx, O, ty), unit(ty), cross(ty, tx, tz), unit(tz)
  if (!solid('gps-thread', a, tx, ty, tz, 1, 0, glow)) return
  const M = ctx.items[ctx.items.length - 1].m as number[]
  for (let q = 0; q < 3; q++) (M[q * 4] = tx[q]), (M[q * 4 + 1] = ty[q] * r), (M[q * 4 + 2] = tz[q] * r), (M[q * 4 + 3] = a[q] - ctx.E[q])
}

const pc: V = [0, 0, 0], sv: V = [0, 0, 0], sx: V = [0, 0, 0], sy: V = [0, 0, 0], sz: V = [0, 0, 0]
let ready = false
export function draw(k: number) {
  const th = ctx.models['gps-thread']
  if (th?.traced) th.traced = undefined
  if (!ready) {
    site(PLACES[k].lat, PLACES[k].lon, n), frame(n, E, N)
    for (let i = 0; i < 3; i++) (O[i] = n[i]), (rx[i] = n[i] * (1 + 8.6 * MM))
    ready = true
  }
  const dt = ctx.dt, here = ctx.focus === k
  if (here !== was) (was = here), here && cold()
  sky(ctx.t)
  if (here) search(dt)
  // it comes apart a few seconds after the camera comes to rest; a board picked comes up to be looked at
  follow(apart, here && ctx.since > 3 ? 1 : 0, 2.2, dt)
  follow(held, here && ctx.picked === 'ephemeris' ? 1 : 0, 2.6, dt)
  follow(shown, here ? 1 : 0, 3, dt)
  spin = held.x > 0.01 ? spin + 0.3 * dt : 0

  // the board: off the plug and up, then, picked, up to face the eye and turning slowly
  const a = apart.x, p = held.x
  const bx = 14 * clamp(2 * a), by = FOOT + 12 * a + 30 * p
  for (let i = 0; i < 3; i++) (ax[i] = N[i]), (ay[i] = O[i]), (az[i] = E[i])
  world(bx, by, 0, c)
  for (let i = 0; i < 3; i++) to[i] = ctx.E[i] - c[i]
  unit(to)
  const up = clamp(dot(to, O), -1, 1), tilt = 0.25 * a * (1 - p) + p * (Math.PI / 2 - Math.asin(up))
  cross(O, to, h), unit(h)
  rot(ax, h, tilt), rot(ay, h, tilt), rot(az, h, tilt), rot(ax, O, spin * p), rot(ay, O, spin * p), rot(az, O, spin * p)
  put('ephemeris', bx, by, 0, ax, ay, az, 1000)
  for (let i = 0; i < 3; i++) (ax[i] = N[i]), (ay[i] = O[i]), (az[i] = E[i])
  put('l1-cable', 0, 0, 0, ax, ay, az)
  put('l1-patch', PATCH[0], 0, PATCH[2], ax, ay, az)
  if (here) {
    world(bx, by, 0, c), part('ephemeris', c, 30 * MM)
    world(PATCH[0], 5, PATCH[2], c), part('antenna', c, 30 * MM)
  }

  // the sky, and the threads to what is found
  const f = shown.x
  if (f < 0.01) return void lit.fill(0)
  world(PATCH[0], PATCH[1], PATCH[2], pc)
  for (let i = 0; i < 24; i++) {
    lit[i] += ((here ? found[i] : 0) - lit[i]) * (1 - Math.exp(-(found[i] >= 1 ? 5 : 2) * dt))
    if (!seenUp[i] && lit[i] < 0.01) continue
    for (let j = 0; j < 3; j++) sv[j] = SV[3 * i + j]
    // the satellite, its nadir panel down and its wings square to the sun
    for (let j = 0; j < 3; j++) sy[j] = -sv[j]
    unit(sy), cross(sy, ctx.L, sz), unit(sz), cross(sy, sz, sx)
    if (seenUp[i]) solid('gps-sv', sv, sx, sy, sz, 0.014 * f, 1, 0.6 + 2 * clamp(lit[i]))
    if (lit[i] < 0.01) continue
    for (let j = 0; j < 3; j++) c[j] = pc[j] + (sv[j] - pc[j]) * lit[i]
    thread(pc, c, 1.8, f * (found[i] >= 1 ? 3 : 1.5))
  }
}

// What its parts are, for the page.
export const about: Record<string, About> = {
  ephemeris: { name: 'Ephemeris 1', does: 'A MAX2769B takes GPS L1 in through the SMA and hands raw I/Q, on a four-bit bus at 16.368 MHz, to an RP2350 that acquires, tracks and fixes at 5 Hz. $32.96 of parts.', board: 'gnss' },
  antenna: { name: 'L1 patch antenna', does: 'A passive L1 patch: a 25 mm ceramic square on its ground plate, cut at two corners for right-hand circular polarisation. Rev 1 sends no antenna bias, so it takes a passive one.' },
}

// The camera, while it rests here: with the board picked, up close to it.
export function steer(_since: number, picked: string, o: Steer) {
  if (picked !== 'ephemeris') return false
  world(14, FOOT + 56, 0, c)
  const P = PLACES.find((P) => P.id === 'receiver')!
  ;(o.d = 0.24), (o.pitch = 0.3), (o.yaw = P.view[2])
  for (let i = 0; i < 3; i++) o.at[i] = c[i] - n[i] * 1.01
  return true
}

// What it sounds like: every satellite in view as its carrier is once its code is wiped off, a pure tone, a chord of
// them. Each PRN has its own note of the pentatonic over 330 Hz (1320 Hz, the receiver's tone, two octaves down), and
// its Doppler bends it by up to a quarter tone, so each rises sharp and sets flat across its pass and the chord beats
// slowly against itself; each as loud as 1/ρ, coming in as it clears the mask. The one being searched for sings out,
// as its thread reaches for it.
// Each is a phasor turned a step a sample (x + iy times e^{iω}); its level and step are set every 64th sample.
const PENTA = [0, 2, 4, 7, 9], amp = new Float64Array(24), px = new Float64Array(24).fill(1), py = new Float64Array(24)
const NOTE = Float64Array.from({ length: 24 }, (_, i) => 330 * 2 ** ((PENTA[i % 5] + 12 * (Math.floor(i / 5) % 3)) / 12))
const rc = new Float64Array(24), rs = new Float64Array(24), live = new Int32Array(24)
let nl = 0, due = 0
export function voice(_t: number, dt: number) {
  if (--due < 0) {
    due = 63
    nl = 0
    for (let i = 0; i < 24; i++) {
      const a = (amp[i] += 0.0064 * ((seenUp[i] ? ((SHELL - 1) / range[i]) * (i === cur ? 1 : 0.35) : 0) - amp[i]))
      if (a < 1e-3) continue
      const w = TAU * dt * NOTE[i] * 2 ** (doppler[i] / 4500 / 24), n = 1 / Math.hypot(px[i], py[i])
      ;(rc[i] = Math.cos(w)), (rs[i] = Math.sin(w)), (px[i] *= n), (py[i] *= n), (live[nl++] = i)
    }
  }
  let out = 0
  for (let k = 0; k < nl; k++) {
    const i = live[k], x = px[i]
    px[i] = rc[i] * x - rs[i] * py[i]
    out += amp[i] * (py[i] = rs[i] * x + rc[i] * py[i])
  }
  return 0.2 * out
}

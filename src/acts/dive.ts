// The dive. The drain's throat is the top of a shaft bored through a mountain of worlds to a black hole
// (fields/dive.wgsl). The mountain is built in the hole's log-polar coordinates, which take the throat's cylinder onto
// the shaft's top, so we carry straight on down the same throat, at the speed, the acceleration and the spin the
// whirlpool's ride (wrap.ts) left us with, in its glyphs. Then the throat flares into a nave, the fire at the bottom
// lights it and eats the glyphs away, and we fall faster and faster, as the choir does, through a cathedral, a Menger
// sponge, a Mandelbox and a foam of bubbles, each found inside the last: the shaft is a cone with its apex in the hole,
// and a steady fall in ln r is a zoom without end. Out of its foot into the hollow where the hole hangs, its disk ablaze,
// and down on a plunging orbit (L = 3M, short of the 4M that would save us), round with the disk, into the shadow, and
// nothing. The arrival (arrive.ts) begins in that dark.
import { DIVE as SHADER } from '../gpu/fields'
import type { Field } from '../gpu/raster'
import type { Voice } from '../audio/audio'
import { hollow, place, sing } from './choir'
import { ASCII, DIVE as DUR, NOTHING, RD, WRAP } from './clock'
import { aim } from './reality'
import { pool, poolAt, ride, surface } from './wrap'
import { clamp, mix, smooth, type Scene } from './scene'

// The hole's world: M = 1, the spin axis N up, the shaft's axis A coming in 12° over the disk's plane, P across it
// toward the pole. The hollow is RW across, the disk from the last stable orbit to RO, and the worlds a band of ln r each
// over it: the drain's mouth at TOP.
const N = [0, 1, 0], A = [0, Math.sin(0.21), Math.cos(0.21)], P = [0, Math.cos(0.21), -Math.sin(0.21)]
// The plunge's plane: through A and T, leaning 70° from the pole toward the way the disk turns, so the eye goes round
// with the disk, never more than 23° over it, and crosses its plane only inside the last stable orbit, where it is gone.
const T = [Math.sin(1.22), Math.cos(1.22) * P[1], Math.cos(1.22) * P[2]]
const RW = 40, UW = Math.log(RW), BAND = 0.8, TOP = UW + 5 * BAND
const RI = 6, RO = 26, HORIZON = Math.log(2.06), B2 = cross(A, P)
const HALF = 0.32, PIPE = 0.02 // the shaft's half-width, stereographic (about 18°), and the drain's throat's at its top

// When: the glyphs are eaten by EAT; the eye reaches the horizon at IN, and the dark has it by the end.
const EAT = 2, IN = DUR - NOTHING
const W = WRAP + ASCII // the drain's clock at our 0
const DT = 1 / 240, U = new Float64Array(Math.ceil(DUR / DT) + 2), ROLL = new Float64Array(U.length)

// How the whirlpool's ride leaves us at W: how far under the mouth, how fast and how hard falling, how fast the picture
// turns (the yaw, clockwise from above), which way round it faces, the lens; and the throat's radius. All in the pool's
// units, asked of the ride on our first frame (it is laid out once the valley is). K: the throat in ln r is a cylinder
// PIPE across, so a pool unit of it is PIPE / hole e-folds. U0: where that puts us. OUT: when we come out of the
// shaft's foot into the hollow. LEVEL: the roll that sets us level with the disk as we do.
let LEFT = { below: 1.27, v: 1.43, acc: 0.9, spin: 1.2, yaw: 0, fov: 1.4, hole: 0.07 }
let K = 0, U0 = 0, OUT = 0, LEVEL = 0, planned = false
function plan() {
  planned = true
  const e = 0.01, z = [0, 0, 0], yaw = [0, 0, 0]
  let fov = 0
  for (let k = 0; k < 3; k++) {
    const q = ride(W + (k - 1) * e)
    ;(z[k] = q.eye[2]), (yaw[k] = Math.atan2(q.up[0], q.up[1]))
    if (k === 1) fov = q.fov
  }
  const s = poolAt(W, { ...pool }), dy = yaw[2] - yaw[0] - 2 * Math.PI * Math.round((yaw[2] - yaw[0]) / (2 * Math.PI))
  const o = { below: surface(s.hole, s) - z[1], v: (z[0] - z[2]) / (2 * e), acc: (2 * z[1] - z[0] - z[2]) / (e * e), spin: dy / (2 * e), yaw: yaw[1], fov, hole: s.hole }
  if (Object.values(o).every(Number.isFinite) && o.hole > 0) LEFT = o
  K = PIPE / LEFT.hole
  U0 = TOP - LEFT.below * K
  // The fall in ln r: at the ride's speed, still gaining as it was, then climbing the whole way down, as much as lands
  // it on the horizon at IN.
  const k0 = (t: number) => K * (LEFT.v + LEFT.acc * 0.6 * (1 - Math.exp(-t / 0.6))), k1 = (t: number) => smooth(0, IN, t) ** 2
  let I0 = 0, I1 = 0
  for (let i = 0; i < Math.round(IN / DT); i++) (I0 += k0((i + 0.5) * DT) * DT), (I1 += k1((i + 0.5) * DT) * DT)
  const amp = (U0 - HORIZON - I0) / I1
  for (let i = 1; i < U.length; i++) U[i] = U[i - 1] + (k0((i - 0.5) * DT) + amp * k1((i - 0.5) * DT)) * DT
  OUT = 0
  while (lnr(OUT) > UW) OUT += DT
  hollow.T = RD + OUT // the disk's song comes in with the disk
  for (let i = 1; i < ROLL.length; i++) ROLL[i] = ROLL[i - 1] + spin((i - 0.5) * DT) * DT
  const at = ROLL[Math.round(OUT / DT)]
  LEVEL = Math.round(at / (2 * Math.PI)) * 2 * Math.PI - at
  p[46] = 1 / K, p[47] = LEFT.yaw // the throat as the drain left it,
  p[51] = U0 - 0.08, p[55] = U0 - 0.75 // and where it flares into the nave
}
// (held at the horizon once the dark has us, as a body falling in is seen to be from outside)
const lnr = (t: number) => {
  const f = clamp(t / DT, 0, U.length - 1), i = Math.min(U.length - 2, Math.floor(f))
  return Math.max(U0 - (U[i] + (U[i + 1] - U[i]) * (f - i)), HORIZON)
}
// The roll the drain gave us (the picture turning on as the ride's yaw turned it, so the other way about A), quickening
// down the shaft and set level with the disk as we come out.
const spin = (t: number) => -Math.sign(LEFT.spin) * mix(Math.abs(LEFT.spin), 1.8, smooth(0.5, 3.5, t)) * (1 - smooth(4.5, OUT, t))
const roll = (t: number) => ROLL[Math.min(ROLL.length - 1, Math.round(t / DT))] + LEVEL * smooth(OUT - 2.5, OUT, t)
// Into the shadow the eye starts to turn about the way it looks, as the arrival (arrive.ts) has it turning at its 0 in the
// cloud's dark: 0.27 rad/s, up turning toward the left. How far it has turned by t: ∫ SEAM · smooth(IN − 1.6, IN − 0.4).
const SEAM = 0.27
const turned = (t: number) => {
  const a = IN - 1.6, b = IN - 0.4, x = clamp((t - a) / (b - a))
  return SEAM * ((b - a) * (x * x * x - (x * x * x * x) / 2) + Math.max(0, t - b))
}

// The plunge's shape, from the geodesic: a body falling from rest at infinity with angular momentum L winds round
// as dφ/d ln r = −w / √(2w/L² − w² + 2w³), w = 1/r; eased in over the first e-fold of the hollow.
const L = 3, PHI = new Float64Array(512)
const lnAt = (i: number) => UW - ((UW - Math.log(2.01)) * i) / (PHI.length - 1)
for (let i = 1; i < PHI.length; i++) {
  const u = (lnAt(i) + lnAt(i - 1)) / 2, w = Math.exp(-u), du = lnAt(i - 1) - lnAt(i)
  PHI[i] = PHI[i - 1] + (smooth(UW, UW - 1, u) * w * du) / Math.sqrt((2 * w) / (L * L) - w * w + 2 * w * w * w)
}
const phi = (u: number) => {
  const f = clamp(((UW - u) / (UW - Math.log(2.01))) * (PHI.length - 1), 0, PHI.length - 1), i = Math.min(PHI.length - 2, Math.floor(f))
  return PHI[i] + (PHI[i + 1] - PHI[i]) * (f - i)
}

// The sky's frame: what lies straight on past the hole as the plunge has wound 0.8 rad round it is the galaxy with a
// Mandelbulb at its heart (cosmos.ts MARVELS), lensed round the shadow.
const SKY: number[] = []
{
  const R = Math.PI / 180, lon = 95 * R, lat = -30 * R
  const g1 = [Math.cos(lat) * Math.cos(lon), Math.sin(lat), Math.cos(lat) * Math.sin(lon)]
  const t = [0.5, 0.8, 0.3], k = t[0] * g1[0] + t[1] * g1[1] + t[2] * g1[2]
  const g2 = unit(t.map((v, i) => v - k * g1[i])), g3 = cross(g1, g2)
  const f1 = A.map((v, i) => -Math.cos(0.8) * v - Math.sin(0.8) * T[i]), f3 = unit(cross(f1, N)), f2 = cross(f3, f1)
  for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) SKY.push(g1[i] * f1[j] + g2[i] * f2[j] + g3[i] * f3[j])
}
function unit(v: number[]) {
  const n = Math.hypot(v[0], v[1], v[2])
  return v.map((x) => x / n)
}
function cross(a: number[], b: number[]) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
}

// The glyphs' ink, as ascii.ts reads the drain with it: the foam's moonlit white, in linear light (each glyph tinted
// by the light it reads).
export const INK = [0.62, 0.8, 1].map((c) => 3 * c ** 2.2)
// How long before its end the ascii's picture is already ours: from there its eye is inside the drain's throat, which
// is the top of our shaft, so it hands the picture over in the throat while the throat is still lit, and the fire's light
// comes up from below before the moon's has gone.
export const EARLY = 1.5

const p = new Float32Array(60)
const GAIN = 0.3, LOOK = { tau: 0.006 } // a fresh picture each frame (wrap.ts TAU_RASTER)
const F: Field = { shader: SHADER, k: 1, p, cell: 14, fine: 2, ink: INK, lift: 40, tint: 1 } // read out as ascii.ts reads the drain
const eye = [0, 0, 0], fwd = [0, 0, 0], up = [0, 0, 0], was = [0, 0, 0], st = { ...pool }
// Before our 0 (the ascii's last EARLY seconds) the eye is still the ride's, down the throat: its depth under the mouth,
// its yaw and its lens, in ours.
const pre = { u: 0, a: 0, fov: 0 }
function early(t: number) {
  const T = W + t, q = ride(T)
  poolAt(T, st)
  const yaw = Math.atan2(q.up[0], q.up[1]) - LEFT.yaw
  ;(pre.u = TOP - K * (surface(st.hole, st) - q.eye[2])), (pre.a = -(yaw - 2 * Math.PI * Math.round(yaw / (2 * Math.PI)))), (pre.fov = q.fov)
  return pre
}
// Where the eye is at t, into o: down the axis to the foot, then round on the plunge.
function at(t: number, o: number[]) {
  const u = lnr(t), r = Math.exp(u), f = phi(u), c = Math.cos(f), s = Math.sin(f)
  for (let i = 0; i < 3; i++) o[i] = r * (c * A[i] + s * T[i])
  return u
}
p.set(N, 16), p.set(A, 20), p.set(P, 24)
p[23] = TOP, p[27] = UW
p[32] = BAND, p[33] = HALF, p[34] = 0.5
p[36] = 2600, p[37] = RI, p[38] = RO, p[39] = 3 * RW * RW
p[41] = 1.0 // the dome's edge
p[43] = PIPE, p[11] = W // the drain's throat, and its clock
p[44] = 0.3 // the disk's brightness
p[45] = 6500 // the camera's white: daylight
p[42] = 1 / GAIN // the sky as it is
for (let j = 0; j < 3; j++) p.set(SKY.slice(3 * j, 3 * j + 3), 48 + 4 * j)

export const dive: Scene = {
  dur: DUR,
  build(t, f) {
    if (!planned) plan()
    const e = t < 0 ? early(t) : undefined
    const u = e ? e.u : at(t, eye), r = Math.exp(u), ph = phi(u), c = Math.cos(ph), s = Math.sin(ph)
    if (e) for (let i = 0; i < 3; i++) eye[i] = r * A[i]
    // forward: at the hole, a little ahead along the orbit; up: in the shaft the drain's roll about the axis, in the
    // hollow the spin axis, so the disk lies level
    const lead = 0.12 * smooth(UW, UW - 1.5, u)
    for (let i = 0; i < 3; i++) fwd[i] = -(c * A[i] + s * T[i]) + lead * (c * T[i] - s * A[i])
    const a = e ? e.a : roll(t), ca = Math.cos(a), sa = Math.sin(a), out = smooth(UW + 0.3, UW - 0.3, u)
    for (let i = 0; i < 3; i++) up[i] = mix(ca * P[i] + sa * B2[i], N[i], out)
    // the lens closes in on the hole as we come out, opens as it grows so its ring stays round it, and at the last
    // closes on the shadow, and in its dark is the arrival's
    const fov = e
      ? e.fov
      : mix(mix(mix(mix(mix(LEFT.fov, 1.35, smooth(0, 1.5, t)), 1, smooth(OUT - 0.8, OUT + 0.8, t)), 1.5, smooth(IN - 2.4, IN - 0.9, t)), 0.8, smooth(IN - 0.9, IN - 0.1, t)), 1.05, smooth(IN, DUR, t))
    aim(p, eye, fwd, up, fov)
    // and turning about the way it looks (up toward −right, as arrive.ts turns it)
    const tw = turned(t), ct = Math.cos(tw), st2 = Math.sin(tw)
    for (let i = 0; i < 3; i++) (up[i] = ct * p[8 + i] - st2 * p[4 + i]), (was[i] = ct * p[4 + i] + st2 * p[8 + i])
    for (let i = 0; i < 3; i++) (p[8 + i] = up[i]), (p[4 + i] = was[i])
    // the eye's velocity in the static frame, out of the shaft: free fall from rest far off, E = 1, so |β| = √(2/r)
    // whatever its angular momentum (its aberration keeps the shadow under half the sky even at the horizon)
    at(t + 0.01, was)
    const vx = was[0] - eye[0], vy = was[1] - eye[1], vz = was[2] - eye[2], vn = Math.hypot(vx, vy, vz) || 1
    const beta = Math.min(0.99, Math.sqrt(2 / r)) * smooth(UW, UW - 1, u)
    p[28] = (beta * vx) / vn, p[29] = (beta * vy) / vn, p[30] = (beta * vz) / vn
    p[31] = 1 / Math.sqrt(Math.max(1e-4, 1 - 2 / r))
    // the glyphs eaten from the middle out; time; the disk's clock, 20 M a second
    p[7] = mix(-0.4, 2.6, smooth(0.5, EAT, t))
    p[15] = t
    p[19] = 20 * t
    p[35] = smooth(2, OUT, t)
    // exposure: in the shaft for walls lit by the hole (∝ r⁻², so the zoom keeps one exposure), in the hollow for
    // the disk; the fire's light coming up the throat, and the dark closing as we go in
    p[40] = GAIN * Math.exp(2 * (Math.max(u, UW) - UW)) * smooth(-1, 1.6, t) ** 2 * (1 - smooth(IN - 0.25, IN, t))
    F.cell = p[7] < 2.5 ? 14 : undefined
    f.field = F
    f.look = LOOK
    place(RD + t)
    return voice
  },
}
const voice: Voice = (tt, o) => sing(RD + tt, o)

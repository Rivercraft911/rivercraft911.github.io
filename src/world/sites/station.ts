// SAMWISE in the planet's sky: Stanford SSI's 2U as the team assembled it (samwise.glb, its arrays and tapes deployed),
// detumbling in the planet's own magnetic field, and River's boards in it drawn out of it.
//
// The field. A centred dipole, B = −B₀ (R/r)³ (3(M̂·r̂)r̂ − M̂), B₀ = 31.2 μT on the ground at the magnetic equator,
// its axis M̂ ten degrees off the planet's.
// The orbit. Sun-synchronous, 97.6° at 1.086 radii (planet.ts's ring). A real one at that height goes round in
// 2π√(a³/μ) = 95.5 min; this one in 10.5 s, so from afar the film runs 547× and every rate in it is that many times its
// own; as we come to it, the time-lapse eases down to life.
// The bus. A rigid body, Euler's equations, a quaternion, with the flight software's inertia (samwise-adcs-flight's
// I_BODY, arrays out) and its B-dot law: each axis's coils are driven at a duty of −k dB/dt (k = 10⁵ s/T, clamped to
// ±1) of that axis's moment (0.046, 0.046 and 0.018 A m²), as the magnetometer sees the field turn in the body's frame,
// so the torque m × B always takes spin out. Arriving, we see it leave its deployer, with the tumble the team's own
// propagator starts from, (0.01, 0.02, 0.1) rad/s; from afar it has long since settled to riding the field line.
// The coils. River's magnetorquer coil boards, twelve of them, under the solar panels: two X/Y boards to each long
// side, two Z boards to each end, five copper spirals in series in each, every axis's set glowing faintly with its
// current (V/R × duty). A few seconds after we come to rest (or on a click) they lift off their faces along each face's
// normal, and River's radio test bench floats in beside: a Pico carrying the S-band and UHF LoRa modules. Clicked, a
// board comes to the camera and turns, to show both faces.
import { TAU, clamp } from '../../acts/scene'
import { ctx, cross, dot, len, part, solid, unit, type V } from '../ctx'
import type { About, Steer } from '../places'
import { DEG, RE, orbit } from './sky'

const A = 1.086, RAAN = 0.4, INC = 97.6 * DEG, RATE = 0.6 // the orbit, as planet.ts draws it
const N0 = Math.sqrt(3.986004418e14 / (A * RE) ** 3), HERE = N0 // rad a real second; and here, life
const B0 = 3.12e-5 // T
const M: V = unit([Math.sin(10 * DEG) * 0.6, Math.cos(10 * DEG), Math.sin(10 * DEG) * 0.8]) // magnetic north
const J = [0.01861, 0.00529, 0.0001439, 0.00529, 0.01833, 0.0000585, 0.0001439, 0.0000585, 0.01558] // kg m², body axes
const KB = 1e5, MU = [0.046, 0.046, 0.018] // duty per T/s; A m² at full duty
const KICK: V = [0.01, 0.02, 0.1] // rad/s off the deployer
const MM = 0.028 / 100 // radii a millimetre: a 1U is the size of a landmark here, as BLEPS's is

// B at r (radii), tesla
function field(r: ArrayLike<number>, o: V) {
  const R = len(r), c = dot(M, r) / R, k = B0 / R ** 3
  for (let i = 0; i < 3; i++) o[i] = -k * ((3 * c * r[i]) / R - M[i])
  return o
}
const Ji = (() => {
  const [a, b, c, d, e, f, g, h, i] = J, A = e * i - f * h, B = f * g - d * i, C = d * h - e * g, det = a * A + b * B + c * C
  return [A, c * h - b * i, b * f - c * e, B, a * i - c * g, c * d - a * f, C, b * g - a * h, a * e - b * d].map((x) => x / det)
})()

// ---- the bus: attitude q (body → world), spin w in the body's frame ------------------------------------------
const q = [1, 0, 0, 0], w: V = [0, 0, 0], bp: V = [0, 0, 0], duty: V = [0, 0, 0]
const X: V = [1, 0, 0], Y: V = [0, 1, 0], Z: V = [0, 0, 1], AX = [X, Y, Z] // the body's axes, in the world
const c: V = [0, 0, 0], Bw: V = [0, 0, 0], b: V = [0, 0, 0]
let fresh = true
// a quaternion's axes
function rot(q: number[], X: V, Y: V, Z: V) {
  const [s, x, y, z] = q
  X[0] = 1 - 2 * (y * y + z * z), X[1] = 2 * (x * y + s * z), X[2] = 2 * (x * z - s * y)
  Y[0] = 2 * (x * y - s * z), Y[1] = 1 - 2 * (x * x + z * z), Y[2] = 2 * (y * z + s * x)
  Z[0] = 2 * (x * z + s * y), Z[1] = 2 * (y * z - s * x), Z[2] = 1 - 2 * (x * x + y * y)
}
// h real seconds of it, at orbit phase u
function step(u: number, h: number) {
  field(orbit(A, RAAN, INC, u, c), Bw)
  for (let i = 0; i < 3; i++) b[i] = dot(AX[i], Bw)
  if (fresh) (bp[0] = b[0]), (bp[1] = b[1]), (bp[2] = b[2]), (fresh = false)
  for (let i = 0; i < 3; i++) (duty[i] = clamp((-KB * (b[i] - bp[i])) / h, -1, 1)), (bp[i] = b[i]) // what the magnetometer saw change
  const m0 = duty[0] * MU[0], m1 = duty[1] * MU[1], m2 = duty[2] * MU[2]
  const [wx, wy, wz] = w, L0 = J[0] * wx + J[1] * wy + J[2] * wz, L1 = J[3] * wx + J[4] * wy + J[5] * wz, L2 = J[6] * wx + J[7] * wy + J[8] * wz
  const g0 = m1 * b[2] - m2 * b[1] - (wy * L2 - wz * L1), g1 = m2 * b[0] - m0 * b[2] - (wz * L0 - wx * L2), g2 = m0 * b[1] - m1 * b[0] - (wx * L1 - wy * L0)
  for (let i = 0; i < 3; i++) w[i] += h * (Ji[3 * i] * g0 + Ji[3 * i + 1] * g1 + Ji[3 * i + 2] * g2) // I ẇ = τ − w × I w
  const [s, x, y, z] = q, k = h / 2
  q[0] -= k * (x * w[0] + y * w[1] + z * w[2]), q[1] += k * (s * w[0] + y * w[2] - z * w[1])
  q[2] += k * (s * w[1] + z * w[0] - x * w[2]), q[3] += k * (s * w[2] + x * w[1] - y * w[0])
  const n = Math.hypot(q[0], q[1], q[2], q[3])
  for (let i = 0; i < 4; i++) q[i] /= n
  rot(q, X, Y, Z)
}

// Where the bus is now: what a camera that rides with it looks at. Its orbit's normal: the camera rides in its frame.
let u = 0, rate = RATE, tu = NaN // its argument of latitude (at planet time tu, once drawn), and how fast that goes
// (At planet time t: the camera asks before draw() has moved it on, so it is carried forward to when it is asked, as
// draw() will carry it, a frame's time at most 0.1 s, or the two would stand apart and it would shake as frames vary.)
export const where = (o: V, t = tu) => orbit(A, RAAN, INC, u + rate * (clamp(t - tu, 0, 0.1) || 0), o)
export const NORMAL = cross(orbit(1, RAAN, INC, 0, [0, 0, 0]), orbit(1, RAAN, INC, Math.PI / 2, [0, 0, 0]))

// ---- River's boards ------------------------------------------------------------------------------------------
// samwise.glb's box (arrays and tapes and all) is 347.6 mm at its widest, its middle 6.9, −0.1 and 59 mm along the
// body's axes from the bus's. Each coil board sits on face f (axis f >> 1, outward sign), its mid-plane SEAT mm out
// (inner, connector in, then outer), and lifts LIFT mm further: the Z+ pair clears the tapes. In a board's own frame
// (as baked) y is its top face, z down its page: on a long side its page runs toward −Z, on an end toward ∓Y. The
// boards' boxes sit 1.3 mm under their mid-planes (the connector beneath). The test bench floats in on the camera's side.
const SAT = 347.6, MID: V = [6.9, -0.1, 59], SEAT = [[50.4, 52], [50.4, 52], [108.5, 110]], LIFT = [60, 100], UNDER = -1.3
type Board = { id: string; model: string; size: number; f: number; l: number; q: number[]; k: number; pk: number; th: number }
const SIDE = ['+X', '−X', '+Y', '−Y', '+Z', '−Z'], board = (id: string, model: string, size: number, f: number, l: number) => ({ id, model, size, f, l, q: [1, 0, 0, 0], k: 0, pk: 0, th: 0 })
const BOARDS: Board[] = []
for (let f = 0; f < 6; f++) for (let l = 0; l < 2; l++) BOARDS.push(board(`coil${SIDE[f].replace('−', '-')}${l ? '' : '-inner'}`, f < 4 ? 'coil-xy' : 'coil', f < 4 ? 215.5 : 97.3, f, l))
BOARDS.push(board('picohat', 'picohat', 83.2, -1, 0))

const COIL = 'six layers of 2 oz copper, five of them spirals in series. Current through it makes a magnetic moment that pushes against the planet’s field, and the B-dot law uses the push to take the tumble out of the bus after it leaves its deployer.'
export const ABOUT: Record<string, About> = {
  samwise: { name: 'SAMWISE', does: 'Stanford SSI’s 2U CubeSat, its arrays and tapes deployed. Under the solar panels of every face, two magnetorquer coil boards.' },
  picohat: { name: 'Radio test bench', does: 'A Pico carrying the S-band and UHF LoRa modules (a LoRa1280F27-TCXO and an RFM98PW), its pins out to the rest of the avionics stack.', board: 'picohat' },
}
for (const B of BOARDS) // (a face's outer board answers for the pair: they are the same board)
  if (B.l && B.f >= 0) ABOUT[B.id] = { name: `Magnetorquer coil board, ${SIDE[B.f]}`, board: B.f < 4 ? 'coil-xy' : 'coil',
    does: `A magnetorquer coil board, ${B.f < 4 ? 'X and Y: 81.5 × 215.5 mm, two to each long side' : 'Z: 97 × 97 mm, two to each end'}, ${COIL}` }

// minimum jerk; a board by its id; and a quaternion from a rotation's columns (and back, rot), blended the short way
const ease = (s: number) => s * s * s * (10 - 15 * s + 6 * s * s)
function byId(id: string) {
  for (const B of BOARDS) if (B.id === id) return B
}
const mq = new Array(9)
function quat(a: V, b: V, cc: V, o: number[]) {
  mq[0] = a[0], mq[1] = b[0], mq[2] = cc[0], mq[3] = a[1], mq[4] = b[1], mq[5] = cc[1], mq[6] = a[2], mq[7] = b[2], mq[8] = cc[2]
  const m = mq, t = m[0] + m[4] + m[8]
  let s
  if (t > 0) (s = 2 * Math.sqrt(1 + t)), (o[0] = s / 4), (o[1] = (m[7] - m[5]) / s), (o[2] = (m[2] - m[6]) / s), (o[3] = (m[3] - m[1]) / s)
  else if (m[0] > m[4] && m[0] > m[8]) (s = 2 * Math.sqrt(1 + m[0] - m[4] - m[8])), (o[0] = (m[7] - m[5]) / s), (o[1] = s / 4), (o[2] = (m[1] + m[3]) / s), (o[3] = (m[2] + m[6]) / s)
  else if (m[4] > m[8]) (s = 2 * Math.sqrt(1 + m[4] - m[0] - m[8])), (o[0] = (m[2] - m[6]) / s), (o[1] = (m[1] + m[3]) / s), (o[2] = s / 4), (o[3] = (m[5] + m[7]) / s)
  else (s = 2 * Math.sqrt(1 + m[8] - m[0] - m[4])), (o[0] = (m[3] - m[1]) / s), (o[1] = (m[2] + m[6]) / s), (o[2] = (m[5] + m[7]) / s), (o[3] = s / 4)
  return o
}
function blend(a: number[], b: number[], k: number) {
  const g = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3] < 0 ? -k : k
  for (let i = 0; i < 4; i++) a[i] = a[i] * (1 - k) + b[i] * g
  const n = Math.hypot(a[0], a[1], a[2], a[3])
  for (let i = 0; i < 4; i++) a[i] /= n
}

// ---- the place: the bus, its boards lifting off, one brought to the camera ---------------------------------------
export const VIEW: [number, number, number] = [0.28, 0.3, 0.55] // the camera's rest: distance, elevation, bearing
const APART = 3.5, LIFTS = 2.8, PICK = 1.6, ROUND = 0.035, TURN = 0.35 // s at rest, then s to come apart; s to the camera; rad/s
let go = 0, held = '', shown = 0, near = 9, settled = false, steered = 0 // how far apart (0–1, linear), the board followed
const cam = { yaw: 0, pitch: VIEW[1], zoom: 1 }, seen = { yaw: 0, pitch: 0, d: 0 } // the camera steered, and as last seen
const eye: V = [0, 0, 0], e0: V = [0, 0, 0], N1: V = [0, 0, 0], r: V = [0, 0, 0], up: V = [0, 0, 0], v: V = [0, 0, 0]
const at: V = [0, 0, 0], ax: V = [0, 0, 0], ay: V = [0, 0, 0], az: V = [0, 0, 0], qd = [1, 0, 0, 0], show: V = [0, 0, 0]

export function draw(k: number) {
  const dt = ctx.dt, here = ctx.focus === k, rest = here && ctx.since >= 0, u0 = u
  rate *= Math.exp(clamp(Math.log((here ? HERE : RATE) / rate), -1, 1) * (1 - Math.exp(-2.5 * dt)))
  u += rate * dt, tu = ctx.t
  if (rest && !settled) (w[0] = KICK[0]), (w[1] = KICK[1]), (w[2] = KICK[2]), (fresh = true), (go = 0), (cam.yaw = 0), (cam.pitch = VIEW[1]), (cam.zoom = 1) // off the deployer, as we arrive
  settled = rest
  const lapse = (dt * rate) / N0, n = Math.max(1, Math.ceil(lapse / 1.5)) // real seconds this frame, in steps of 1.5
  if (dt > 0) for (let i = 1; i <= n; i++) step(u0 + ((u - u0) * i) / n, lapse / n)
  else field(orbit(A, RAAN, INC, u, c), Bw)

  // the bus
  for (let i = 0; i < 3; i++) (at[i] = c[i] + MM * (MID[0] * X[i] + MID[1] * Y[i] + MID[2] * Z[i])), (az[i] = -Y[i])
  solid('samwise', at, X, Z, az, SAT * MM)
  near = Math.hypot(c[0] - ctx.E[0], c[1] - ctx.E[1], c[2] - ctx.E[2])
  if (near > 0.8) return
  if (rest && go === 0) part('samwise', c, 0.05)

  // apart: after a while at rest, or once anything is clicked; back together as we leave
  go = clamp(go + (dt / LIFTS) * (rest && (ctx.since > APART || ctx.picked) ? 1 : -1))
  cam.yaw += ROUND * dt * (1 - 0.6 * ease(go)) * (1 - shown)
  // the camera's side of the bus, as planet.ts's restAt has it in the orbit's frame, and its right and up; and where
  // the camera was last seen, in the same terms
  unit(where(r))
  const h = dot(NORMAL, r), cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch), sy = Math.sin(VIEW[2] + cam.yaw), cy = Math.cos(VIEW[2] + cam.yaw)
  for (let i = 0; i < 3; i++) e0[i] = NORMAL[i] - r[i] * h
  unit(e0), cross(r, e0, N1)
  for (let i = 0; i < 3; i++) (v[i] = ctx.E[i] - c[i] - show[i] * shown), (eye[i] = cp * (sy * e0[i] + cy * N1[i]) + sp * r[i])
  seen.d = len(v), seen.pitch = Math.asin(clamp(dot(v, r) / seen.d, -1, 1)), seen.yaw = Math.atan2(dot(v, e0), dot(v, N1)) - VIEW[2]
  for (let i = 0; i < 3; i++) up[i] = ctx.p[8 + i]
  cross(up, eye, r), unit(r), cross(eye, r, up)
  // the board the camera follows: the one picked, or the one going back
  if (byId(ctx.picked)) held = ctx.picked
  const H = byId(held)
  shown = H ? ease(H.pk) : 0
  for (let i = 0; i < 3; i++) show[i] = eye[i] * 0.08 // where a board is shown: toward the camera from the bus, radii

  for (let j = 0; j < BOARDS.length; j++) {
    const B = BOARDS[j]
    // how far it has lifted (staggered round the faces; the rest back home while one is shown), and how far it has come
    // to the camera, turning (face on as it arrives)
    B.k = ease(clamp(1.5 * go - (0.5 * j) / BOARDS.length)) * (B.id === held ? 1 : 1 - shown)
    B.pk = clamp(B.pk + (dt / PICK) * (ctx.picked === B.id ? 1 : -1))
    B.th = B.pk > 0 ? B.th + TURN * dt : -TURN * PICK
    if (B.k <= 0 && B.f < 0) continue
    if (B.f >= 0) {
      // on its face, or off it along the normal, in the body's frame
      const i = B.f >> 1, g = B.f & 1 ? -1 : 1, d = g * (SEAT[i][B.l] + LIFT[B.l] * B.k), n = AX[i]
      for (let m = 0; m < 3; m++) {
        ay[m] = g * n[m], ax[m] = -X[m], az[m] = -Z[m]
        at[m] = c[m] + MM * (d * n[m] + UNDER * ay[m])
      }
      if (i < 2) cross(ay, az, ax)
      else cross(ax, ay, az)
    } else {
      // the test bench: in from the camera's left, below the bus and nearer, bobbing
      for (let m = 0; m < 3; m++) {
        at[m] = c[m] + MM * (-r[m] * (115 + 260 * (1 - B.k)) - 100 * up[m] + eye[m] * (170 + 12 * Math.sin(0.4 * ctx.t)))
        ay[m] = eye[m] * 0.94 + up[m] * 0.34, az[m] = -up[m]
      }
      unit(ay), cross(ay, az, ax), unit(ax), cross(ax, ay, az)
    }
    quat(ax, ay, az, B.q)
    const pk = ease(B.pk)
    if (pk > 0) {
      // shown: in front of the bus, upright, turning about the camera's up to show both faces
      const ct = Math.cos(B.th), st = Math.sin(B.th)
      for (let m = 0; m < 3; m++) (ay[m] = ct * eye[m] + st * r[m]), (az[m] = -up[m]), (at[m] += (c[m] + show[m] - at[m]) * pk)
      cross(ay, az, ax)
      blend(B.q, quat(ax, ay, az, qd), pk)
    }
    rot(B.q, ax, ay, az)
    const s = B.size * MM, lit = B.f >= 0 ? Math.abs(duty[B.f >> 1]) : 0
    solid(B.model, at, ax, ay, az, s, 1, 0.04 + 0.6 * lit)
    if (rest && B.k > 0.6 && B.id in ABOUT) part(B.id, at, 0.45 * s)
  }
}

// While it rests here: round the bus, slowly; back a little as it comes apart; in to a board brought to the camera.
// Taken back after the visitor has had it (a gap in being asked), from wherever they left it.
export function steer(_since: number, _picked: string, o: Steer) {
  const now = performance.now(), H = byId(held), d = VIEW[0] * (1 + 0.35 * ease(go)) * (1 - shown) + (H ? 2.2 * H.size * MM : 0) * shown
  if (now - steered > 250) (cam.yaw = seen.yaw + TAU * Math.round((cam.yaw - seen.yaw) / TAU)), (cam.pitch = seen.pitch), (cam.zoom = seen.d / d)
  steered = now
  o.d = d * cam.zoom, o.pitch = cam.pitch, o.yaw = VIEW[2] + cam.yaw
  for (let i = 0; i < 3; i++) o.at[i] = show[i] * shown
  return near < 0.8
}

// What it sounds like. The field, as a proton magnetometer hears it: the protons precess at γ|B|/2π, 42.58 Hz to the
// microtesla, a kilohertz or so, and twice that over the poles, since a dipole's field is twice as strong there. Four
// octaves down that is the station's key (tonic), rising an octave and falling again twice an orbit, and the coils
// sing in it: three notes, its root, fifth and octave, each as loud as the duty the B-dot law asks of that axis's coils,
// swelling and turning over with its sign as the bus tumbles in the field, and gone once it has stopped. High over
// them, very quietly, the precession itself.
const coil = [0, 0, 0], ph = [0, 0, 0], RATIO = [1, 1.5, 2], REF = 0.25 // the duty a fresh tumble asks of X and Y
let fp = 0, hi = 0
export const tonic = () => fp / 16
export function voice(_t: number, dt: number) {
  fp += 1e-3 * (42.577e6 * len(Bw) - fp)
  hi += dt * fp, hi -= Math.floor(hi)
  let out = 0.025 * Math.sin(TAU * hi)
  for (let i = 0; i < 3; i++) {
    ph[i] += (dt * RATIO[i] * fp) / 16, ph[i] -= Math.floor(ph[i])
    const a = (coil[i] += 2e-4 * (clamp(duty[i] / REF, -1.2, 1.2) - coil[i])), x = Math.sin(TAU * ph[i])
    out += 0.3 * a * (x + 0.15 * (2 * x * x - 1))
  }
  return out
}

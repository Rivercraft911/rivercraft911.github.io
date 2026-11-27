// SAMWISE in the planet's sky: a 2U bus detumbling in the planet's own magnetic field, a time-lapse in real units.
//
// The field. A centred dipole, B = −B₀ (R/r)³ (3(M̂·r̂)r̂ − M̂), B₀ = 31.2 μT on the ground at the magnetic equator,
// its axis M̂ ten degrees off the planet's.
// The orbit. Sun-synchronous, 97.6° at 1.086 radii (planet.ts's ring). A real one at that height goes round in
// 2π√(a³/μ) = 95.5 min; this one in 10.5 s, so the film runs LAPSE ≈ 547× and every rate in it is LAPSE× its own.
// The bus. A rigid 2U (0.1 × 0.1 × 0.227 m at the standard's 2.66 kg, uniform), Euler's equations, a quaternion. It
// leaves its deployer tumbling at 0.9°/s. Its magnetometer sees the field turn in the body's frame, and the coils
// answer with the B-dot law, m = −k dB/dt, so the torque τ = m × B always takes spin out. What is left when it has
// worked is the bus riding the field line, which turns twice an orbit.
// The bus is River's Z coil panel on every 1U face, turning as the attitude does; B and m go on to the sound.
import { TAU, clamp } from '../../acts/scene'
import { ctx, cross, dot, len, solid, unit, type V } from '../ctx'
import { DEG, RE, orbit } from './sky'

const A = 1.086, RAAN = 0.4, INC = 97.6 * DEG, RATE = 0.6 // the orbit, as planet.ts draws it
const LAPSE = RATE / Math.sqrt(3.986004418e14 / (A * RE) ** 3) // real seconds a scene second
const B0 = 3.12e-5 // T
const M: V = unit([Math.sin(10 * DEG) * 0.6, Math.cos(10 * DEG), Math.sin(10 * DEG) * 0.8]) // magnetic north
const IX = (2.66 * (0.1 ** 2 + 0.227 ** 2)) / 12, IZ = (2.66 * 2 * 0.1 ** 2) / 12 // kg m², across and along
const K = 4e3 // A m² s/T: spin across B dies in I/(kB²), four tenths of an orbit
const TUMBLE = 0.9 * DEG, M_REF = K * TUMBLE * 4e-5 // rad/s off the deployer; the moment that asks of the coils
const U = 0.028, H = 1.135 * U // a 1U edge, and half the bus's length, in radii: a landmark's size

// B at r (radii), tesla
function field(r: ArrayLike<number>, o: V) {
  const R = len(r), c = dot(M, r) / R, k = B0 / R ** 3
  for (let i = 0; i < 3; i++) o[i] = -k * ((3 * c * r[i]) / R - M[i])
  return o
}

// ---- the bus: attitude q (body → world), spin w in the body's frame ------------------------------------------
const q = [1, 0, 0, 0], w: V = [0, 0, 0], bp: V = [0, 0, 0], m: V = [0, 0, 0]
const X: V = [1, 0, 0], Y: V = [0, 1, 0], Z: V = [0, 0, 1], AX = [X, Y, Z] // the body's axes, in the world
const c: V = [0, 0, 0], Bw: V = [0, 0, 0], b: V = [0, 0, 0]
let fresh = true, kicks = 0
function axes() {
  const [s, x, y, z] = q
  X[0] = 1 - 2 * (y * y + z * z), X[1] = 2 * (x * y + s * z), X[2] = 2 * (x * z - s * y)
  Y[0] = 2 * (x * y - s * z), Y[1] = 1 - 2 * (x * x + z * z), Y[2] = 2 * (y * z + s * x)
  Z[0] = 2 * (x * z + s * y), Z[1] = 2 * (y * z - s * x), Z[2] = 1 - 2 * (x * x + y * y)
}
// Off the deployer again: a spin about some axis of its own.
function kick() {
  const a = 2.4 * ++kicks, z = Math.cos(1.7 * kicks) * 0.6
  w[0] = TUMBLE * Math.cos(a) * Math.sqrt(1 - z * z), w[1] = TUMBLE * Math.sin(a) * Math.sqrt(1 - z * z), w[2] = TUMBLE * z
  fresh = true
}
// h real seconds of it, at orbit phase u
function step(u: number, h: number) {
  field(orbit(A, RAAN, INC, u, c), Bw)
  for (let i = 0; i < 3; i++) b[i] = dot(AX[i], Bw)
  if (fresh) (bp[0] = b[0]), (bp[1] = b[1]), (bp[2] = b[2]), (fresh = false)
  for (let i = 0; i < 3; i++) (m[i] = (-K * (b[i] - bp[i])) / h), (bp[i] = b[i]) // what the magnetometer saw change
  const tx = m[1] * b[2] - m[2] * b[1], ty = m[2] * b[0] - m[0] * b[2], tz = m[0] * b[1] - m[1] * b[0]
  const [wx, wy, wz] = w
  w[0] += (h * (tx - (IZ - IX) * wy * wz)) / IX, w[1] += (h * (ty - (IX - IZ) * wz * wx)) / IX, w[2] += (h * tz) / IZ
  const [s, x, y, z] = q, k = h / 2
  q[0] -= k * (x * w[0] + y * w[1] + z * w[2]), q[1] += k * (s * w[0] + y * w[2] - z * w[1])
  q[2] += k * (s * w[1] + z * w[0] - x * w[2]), q[3] += k * (s * w[2] + x * w[1] - y * w[0])
  const n = Math.hypot(q[0], q[1], q[2], q[3])
  for (let i = 0; i < 4; i++) q[i] /= n
  axes()
}

// Where the bus is at planet time t: what a camera that rides with it looks at.
export const where = (o: V, t = ctx.t) => orbit(A, RAAN, INC, RATE * t, o)

// A coil panel on the bus: its copper facing out along ±n, s from the centre (and z along the bus), its x along a.
const tc: V = [0, 0, 0], tn: V = [0, 0, 0], tz: V = [0, 0, 0]
function tile(n: V, s: number, z: number, a: V, size: number) {
  const g = Math.sign(s)
  for (let i = 0; i < 3; i++) (tc[i] = c[i] + n[i] * s + Z[i] * z), (tn[i] = n[i] * g)
  solid('coil', tc, a, tn, cross(a, tn, tz), size, 1, 0.12) // a little of its own light, so it is not lost in eclipse
}

let was = -2, last = -1
export function draw(k: number) {
  const t = ctx.t, dt = ctx.dt, here = ctx.focus === k
  // a deployment as we arrive, and one every four orbits
  if ((here && was !== k) || Math.floor((RATE * t) / (4 * TAU)) !== last) kick()
  was = ctx.focus, last = Math.floor((RATE * t) / (4 * TAU))
  const n = Math.max(1, Math.ceil((dt * LAPSE) / 1.5))
  if (dt > 0) for (let i = 1; i <= n; i++) step(RATE * (t - dt + (dt * i) / n), (dt * LAPSE) / n)
  else field(orbit(A, RAAN, INC, RATE * t, c), Bw)
  // the bus: River's coil panel on every face it has one for
  tile(Z, H, 0, X, U)
  tile(Z, -H, 0, X, U)
  if (Math.hypot(c[0] - ctx.E[0], c[1] - ctx.E[1], c[2] - ctx.E[2]) < 1.2) for (let f = 0; f < 8; f++) tile(AX[f & 1], f & 2 ? U / 2 : -U / 2, f & 4 ? H / 2 : -H / 2, Z, 0.98 * U)
}

// What it sounds like. The field, as a proton magnetometer hears it: the protons precess at γ|B|/2π, 42.58 Hz to the
// microtesla, a kilohertz or so, and twice that over the poles, since a dipole's field is twice as strong there. Four
// octaves down that is the station's key (tonic), rising an octave and falling again twice an orbit, and the coils
// sing in it: three notes, its root, fifth and octave, each as loud as the moment the B-dot law asks of that coil,
// swelling and turning over with its sign as the bus tumbles in the field, and gone once it has stopped. High over
// them, very quietly, the precession itself.
const coil = [0, 0, 0], ph = [0, 0, 0], RATIO = [1, 1.5, 2]
let fp = 0, hi = 0
export const tonic = () => fp / 16
export function voice(_t: number, dt: number) {
  fp += 1e-3 * (42.577e6 * len(Bw) - fp)
  hi += dt * fp, hi -= Math.floor(hi)
  let out = 0.025 * Math.sin(TAU * hi)
  for (let i = 0; i < 3; i++) {
    ph[i] += (dt * RATIO[i] * fp) / 16, ph[i] -= Math.floor(ph[i])
    const a = (coil[i] += 2e-4 * (clamp(m[i] / M_REF, -1.2, 1.2) - coil[i])), x = Math.sin(TAU * ph[i])
    out += 0.3 * a * (x + 0.15 * (2 * x * x - 1))
  }
  return out
}

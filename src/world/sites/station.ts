// SAMWISE in the planet's sky: a 2U bus detumbling in the planet's own magnetic field, a time-lapse in real units.
//
// The field. A centred dipole, B = −B₀ (R/r)³ (3(M̂·r̂)r̂ − M̂), B₀ = 31.2 μT on the ground at the magnetic equator,
// its axis M̂ ten degrees off the planet's. The beam draws its lines, r = L sin²θ in the magnetic frame, light
// running along them the way B points, and the one line the bus is on.
// The orbit. Sun-synchronous, 97.6° at 1.086 radii (planet.ts's ring). A real one at that height goes round in
// 2π√(a³/μ) = 95.5 min; this one in 10.5 s, so the film runs LAPSE ≈ 547× and every rate in it is LAPSE× its own.
// The bus. A rigid 2U (0.1 × 0.1 × 0.227 m at the standard's 2.66 kg, uniform), Euler's equations, a quaternion. It
// leaves its deployer tumbling at 0.9°/s. Its magnetometer sees the field turn in the body's frame, and the coils
// answer with the B-dot law, m = −k dB/dt, so the torque τ = m × B always takes spin out. What is left when it has
// worked is the bus riding the field line, which turns twice an orbit.
// The bus is River's Z coil panel on every 1U face, its rails drawn by the beam; the beam draws B, m and ω at it,
// the coil's own dipole field as strong as m is, and the path both ends of the bus have swept.
import { equation } from '../../acts/reality'
import { TAU, clamp } from '../../acts/scene'
import { Path } from '../../beam/path'
import { ctx, cross, dot, len, solid, unit, type V } from '../ctx'
import { DEG, RE, numbers, orbit, to, up } from './sky'

const A = 1.086, RAAN = 0.4, INC = 97.6 * DEG, RATE = 0.6 // the orbit, as planet.ts draws it
const LAPSE = RATE / Math.sqrt(3.986004418e14 / (A * RE) ** 3) // real seconds a scene second
const B0 = 3.12e-5 // T
const M: V = unit([Math.sin(10 * DEG) * 0.6, Math.cos(10 * DEG), Math.sin(10 * DEG) * 0.8]) // magnetic north
const MX: V = unit(cross(M, [0, 0, 1])), MY: V = cross(M, MX)
const IX = (2.66 * (0.1 ** 2 + 0.227 ** 2)) / 12, IZ = (2.66 * 2 * 0.1 ** 2) / 12 // kg m², across and along
const K = 4e3 // A m² s/T: spin across B dies in I/(kB²), four tenths of an orbit
const TUMBLE = 0.9 * DEG, M_REF = K * TUMBLE * 4e-5 // rad/s off the deployer; the moment that asks of the coils
const U = 0.028, H = 1.135 * U // a 1U edge, and half the bus's length, in radii: a landmark's size
const INK = [0.75, 0.6, 1], COLD = [0.5, 0.85, 1], WARM = [1, 0.75, 0.4]

// B at r (radii), tesla
function field(r: ArrayLike<number>, o: V) {
  const R = len(r), c = dot(M, r) / R, k = B0 / R ** 3
  for (let i = 0; i < 3; i++) o[i] = -k * ((3 * c * r[i]) / R - M[i])
  return o
}

// ---- the bus: attitude q (body → world), spin w in the body's frame ------------------------------------------
const q = [1, 0, 0, 0], w: V = [0, 0, 0], bp: V = [0, 0, 0], m: V = [0, 0, 0]
const X: V = [1, 0, 0], Y: V = [0, 1, 0], Z: V = [0, 0, 1], AX = [X, Y, Z] // the body's axes, in the world
const c: V = [0, 0, 0], Bw: V = [0, 0, 0], b: V = [0, 0, 0], mw: V = [0, 0, 0], ww: V = [0, 0, 0]
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
// The intro's cut to it, tc seconds in, at planet time t: riding just behind and outside the bus, drifting round it.
const fw: V = [0, 0, 0], sd: V = [0, 0, 0]
export function shot(_k: number, tc: number, pose: { eye: V; at: V; up: V }, t: number) {
  where(pose.at, t), orbit(A, RAAN, INC, RATE * t + Math.PI / 2, fw) // where it is, and the way it flies
  const a = 0.5 + 0.5 * tc, d = 0.2 * (1 - 0.15 * tc)
  for (let i = 0; i < 3; i++) pose.up[i] = pose.at[i] / A
  cross(pose.up, fw, sd)
  for (let i = 0; i < 3; i++) pose.eye[i] = pose.at[i] + d * ((Math.sin(a) * sd[i] - Math.cos(a) * fw[i]) / A + 0.45 * pose.up[i])
}

// ---- the planet's field lines, laid out once -----------------------------------------------------------------
const SHELLS = [1.45, 2.2, 3.4], LONS = 8, PTS = 44
const LINES = new Float64Array(SHELLS.length * LONS * PTS * 3)
// Colatitude th, longitude ph on shell L of the dipole about axis a (with x, y across it), centre o, into p.
const p3: V = [0, 0, 0]
function shell(L: number, th: number, ph: number, a: V, x: V, y: V, o: ArrayLike<number>) {
  const s = Math.sin(th), r = L * s * s, cx = r * s * Math.cos(ph), cy = r * s * Math.sin(ph), ca = r * Math.cos(th)
  for (let i = 0; i < 3; i++) p3[i] = o[i] + cx * x[i] + cy * y[i] + ca * a[i]
  return p3
}
const O = [0, 0, 0]
SHELLS.forEach((L, a) => {
  const t0 = Math.asin(Math.sqrt(1.003 / L))
  for (let j = 0; j < LONS; j++)
    for (let i = 0; i < PTS; i++) LINES.set(shell(L, Math.PI - t0 - ((Math.PI - 2 * t0) * i) / (PTS - 1), ((j + a / 3) * TAU) / LONS, M, MX, MY, O), ((a * LONS + j) * PTS + i) * 3)
})

// ---- what the beam draws -------------------------------------------------------------------------------------
const lines = new Path(), bus = new Path(), swept = new Path()
const NT = 200, trail = new Float64Array(2 * NT * 3)
let head = 0, filled = 0, was = -2, last = -1
const p1: V = [0, 0, 0], p2: V = [0, 0, 0], d: V = [0, 0, 0], pc: V = [0, 0, 0], vals = [0, 0, 0]
const HALF = [U / 2, U / 2, H]

// A coil panel on the bus: its copper facing out along ±n, s from the centre (and z along the bus), its x along a.
const tc: V = [0, 0, 0], tn: V = [0, 0, 0], tz: V = [0, 0, 0]
function tile(n: V, s: number, z: number, a: V, size: number) {
  const g = Math.sign(s)
  for (let i = 0; i < 3; i++) (tc[i] = c[i] + n[i] * s + Z[i] * z), (tn[i] = n[i] * g)
  solid('coil', tc, a, tn, cross(a, tn, tz), size, 1, 0.12) // a little of its own light, so it is not lost in eclipse
}

// An arrow from the bus along v (world), l long, a dwell at its tip.
function arrow(v: ArrayLike<number>, l: number, col: readonly number[]) {
  const n = len(v) || 1
  bus.color(col[0], col[1], col[2], 1)
  up(), to(bus, c[0], c[1], c[2])
  if (to(bus, c[0] + (v[0] / n) * l, c[1] + (v[1] / n) * l, c[2] + (v[2] / n) * l)) bus.lineTo(bus.tip()[0], bus.tip()[1], 0.012)
}

export function draw(k: number) {
  const t = ctx.t, dt = ctx.dt, here = ctx.focus === k
  // a deployment as we arrive, and one every four orbits
  if ((here && was !== k) || Math.floor((RATE * t) / (4 * TAU)) !== last) kick()
  was = ctx.focus, last = Math.floor((RATE * t) / (4 * TAU))
  const n = Math.max(1, Math.ceil((dt * LAPSE) / 1.5))
  if (dt > 0) for (let i = 1; i <= n; i++) step(RATE * (t - dt + (dt * i) / n), (dt * LAPSE) / n)
  else field(orbit(A, RAAN, INC, RATE * t, c), Bw)
  for (let i = 0; i < 3; i++) (mw[i] = X[i] * m[0] + Y[i] * m[1] + Z[i] * m[2]), (ww[i] = X[i] * w[0] + Y[i] * w[1] + Z[i] * w[2])
  const mag = len(m), near = Math.hypot(c[0] - ctx.E[0], c[1] - ctx.E[1], c[2] - ctx.E[2])

  // the planet's field: light runs south to north along every line, as B does outside the planet
  lines.clear()
  const base = here ? 0.3 : 0.14
  for (let l = 0; l < SHELLS.length * LONS; l++) {
    up()
    for (let i = 0; i < PTS; i++) {
      const o = (l * PTS + i) * 3, run = 0.5 + 0.5 * Math.sin(TAU * (i / 11 - 0.35 * t + l * 0.37))
      lines.color(0.5, 0.45, 1, base * (0.25 + 0.75 * run * run * run))
      to(lines, LINES[o], LINES[o + 1], LINES[o + 2])
    }
  }
  // the line the bus is on
  const R = len(c), cm = dot(M, c) / R, L = Math.min(R / Math.max(1 - cm * cm, 1e-3), 40), ph = Math.atan2(dot(MY, c), dot(MX, c))
  const t0 = Math.asin(Math.sqrt(1.003 / L))
  lines.color(INK[0], INK[1], INK[2], 0.8), up()
  for (let i = 0; i <= 72; i++) {
    const p = shell(L, t0 + ((Math.PI - 2 * t0) * i) / 72, ph, M, MX, MY, O)
    to(lines, p[0], p[1], p[2])
  }

  // the bus: River's coil panel on every face it has one for, and its rails
  tile(Z, H, 0, X, U)
  tile(Z, -H, 0, X, U)
  if (near < 1.2) for (let f = 0; f < 8; f++) tile(AX[f & 1], f & 2 ? U / 2 : -U / 2, f & 4 ? H / 2 : -H / 2, Z, 0.98 * U)
  bus.clear().color(1, 0.95, 0.85, 0.9)
  for (let i = 0; i < 3; i++) d[i] = ctx.E[i] - c[i]
  const out = (a: number, s: number) => s * dot(AX[a], d) > HALF[a] // is the eye outside that face?
  for (let a = 0; a < 3; a++) {
    const b1 = (a + 1) % 3, b2 = (a + 2) % 3
    for (let e = 0; e < 4; e++) {
      const s1 = e & 1 ? 1 : -1, s2 = e & 2 ? 1 : -1
      if (!out(b1, s1) && !out(b2, s2)) continue // an edge shows if a face on either side of it does
      for (let i = 0; i < 3; i++) p1[i] = c[i] + AX[b1][i] * s1 * HALF[b1] + AX[b2][i] * s2 * HALF[b2]
      up(), to(bus, p1[0] - AX[a][0] * HALF[a], p1[1] - AX[a][1] * HALF[a], p1[2] - AX[a][2] * HALF[a])
      to(bus, p1[0] + AX[a][0] * HALF[a], p1[1] + AX[a][1] * HALF[a], p1[2] + AX[a][2] * HALF[a])
    }
  }
  // the field here, the spin, and the moment the coils make against it
  arrow(Bw, 3 * U, COLD)
  arrow(ww, 3 * U * clamp(len(w) / TUMBLE, 0, 1.3), WARM)
  const drive = clamp(mag / M_REF, 0, 1.2)
  if (drive > 0.03) {
    arrow(mw, 3.4 * U * drive, INK)
    // the coils' own field, a dipole about m as strong as m
    unit(cross(mw, Math.abs(mw[1]) < 0.9 * mag ? [0, 1, 0] : [1, 0, 0], p1)), cross(mw, p1, p2), unit(p2)
    const ax = unit([mw[0], mw[1], mw[2]])
    for (let l = 0; l < 12; l++) {
      bus.color(INK[0], INK[1], INK[2], 0.55 * Math.min(1, drive)), up()
      for (let i = 0; i <= 32; i++) {
        const p = shell(l & 1 ? 5.5 * U : 3.2 * U, 0.3 + ((Math.PI - 0.6) * i) / 32, (l * TAU) / 12, ax, p1, p2, c)
        to(bus, p[0], p[1], p[2])
      }
    }
  }
  // what the two ends of the bus have swept
  if (Math.hypot(c[0] - pc[0], c[1] - pc[1], c[2] - pc[2]) > 0.2) filled = 0 // a cut in time: the path starts again
  pc[0] = c[0], pc[1] = c[1], pc[2] = c[2]
  if (dt > 0) {
    for (let e = 0; e < 2; e++) for (let i = 0; i < 3; i++) trail[(e * NT + head) * 3 + i] = c[i] + Z[i] * (e ? -2.4 : 2.4) * U
    head = (head + 1) % NT, filled = Math.min(NT, filled + 1)
  }
  swept.clear()
  for (let e = 0; e < 2; e++) {
    up()
    for (let i = NT - filled; i < NT; i++) {
      const o = (e * NT + ((head + i) % NT)) * 3
      swept.color(e ? COLD[0] : INK[0], e ? COLD[1] : INK[1], e ? COLD[2] : INK[2], 0.75 * (i / NT) ** 1.5)
      to(swept, trail[o], trail[o + 1], trail[o + 2])
    }
  }
  ctx.f.ch.push({ w: 0.5, path: lines }, { w: 0.25, path: bus }, { w: 0.2, path: swept })
  if (here) {
    vals[0] = len(w) / DEG, vals[1] = len(Bw) * 1e6, vals[2] = mag * 1e3
    equation(ctx.f, 'm=-k\\frac{dB}{dt}\\qquad\\tau=m\\times B\\qquad I\\frac{d\\omega}{dt}=\\tau-\\omega\\times I\\omega', INK)
    numbers('|\\omega|=\\num{0}{0.000}\\,°/s\\qquad|B|=\\num{1}{00.0}\\,\\mu T\\qquad|m|=\\num{2}{0.00}\\,mA\\,m^2', INK, vals)
  }
}

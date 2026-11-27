// The valley, drawn the way a pen draws it and made of signals. The meander the wave became is the
// river; the camera cranes down from the map to its bank and the land rises around it in a wave rolling
// upstream. The ground is a power-law field (spectral synthesis: random phases under |k|^−β, inverted)
// carved into a valley that climbs toward the peaks in cascades, and it is drawn as the pulsar plot was,
// cross-section after cross-section, front to back, each hidden behind the ones before it (a floating
// horizon, recomputed every frame). Firs are triangle waves under a tapering envelope; the far peaks are
// spectra. The speakers trace what the beam draws, simplified to what they can (beam/scope.ts), so a scope
// on the jack draws the valley too, and every equation it is made of is written live above it.
import { Path, STRIDE } from '../beam/path'
import { SHARP, screen, tune } from '../beam/scope'
import { load, use } from '../beam/font'
import { fft, hann } from '../dsp/fft'
import { Field } from '../dsp/terrain'
import { FALL, ahead, lag, place, sing } from './choir'
import { VALLEY as DUR, SING } from './clock' // the choirs begin to sing at SING
import { A0, GF, HF, M, RIM, TAU_RASTER, V as VR, join, loud, ride, sight, vortex as whirl } from './wrap'
import { LOOK } from '../gpu/phosphor'
import { Board, MORPH, say, type Place } from './say'
import { TAU, cam, clamp, glide, hash, lock, mix, smooth, space, view, type Scene } from './scene'

use(await load('tech'))

const INK = [0.78, 0.88, 1] as const, PINE = [0.45, 1, 0.62] as const, WATER = [0.5, 0.78, 1] as const
const rnd = (n: number) => hash(n) * 0.5 + 0.5

// ── the river: a meander of two scales, skewed, climbing in cascades ─────────────────────────────────
const CASCADES = [10, 24, 38, 51] // where the river steps down
export const LIP = 62 // where the river reaches the rim of the shaft it ends in
const SC = 15 // a pool
const X0 = -12, X1 = 104, DX = 0.1, NX = Math.round((X1 - X0) / DX) + 1
const RZ = new Float64Array(NX), RY = new Float64Array(NX)
// The heading is the meander's last equation: θ(s) = ω₁ sin(2πs/M₁) + ω₂ sin(2πs/M₂ + φ). Its first
// MAP metres (three bends) are the stretch the meander drew; XM is where they end.
export const W1 = 0.85, M1 = 13, W2 = 0.55, M2 = 41, PHI = 1.1, MAP = 3 * M1
export const theta = (s: number) => W1 * Math.sin((TAU * s) / M1) + W2 * Math.sin((TAU * s) / M2 + PHI)
let XM = 0
{
  let x = X0, z = 0, s = 0, i = 0
  while (i < NX) {
    const th = -theta(s) // −z is up on the map
    const nx = x + 0.02 * Math.cos(th), nz = z + 0.02 * Math.sin(th)
    while (i < NX && X0 + i * DX <= nx) (RZ[i] = z + ((nz - z) * (X0 + i * DX - x)) / (nx - x)), i++
    x = nx, z = nz, s += 0.02
    if (s <= MAP) XM = x
  }
  for (let i = 0; i < NX; i++) {
    const x = X0 + i * DX
    RY[i] = -4 * (1 - Math.exp(-Math.max(0, x) / 30)) - CASCADES.reduce((a, c, j) => a + [0.6, 0.8, 0.7, 0.9][j] * smooth(c - 0.25, c + 0.25, x), 0)
  }
}
const idx = (x: number) => Math.max(0, Math.min(NX - 1, Math.round((x - X0) / DX)))
export const riverZ = (x: number) => RZ[idx(x)], riverY = (x: number) => RY[idx(x)]
const W0 = 1.6
const wide = (x: number) => W0 * (1 + 0.3 * Math.sin(0.21 * x + 0.4) + 0.2 * Math.sin(0.07 * x) + 1.6 * Math.exp(-(((x - SC) / 3.5) ** 2))) // narrows, pools

// ── the land ────────────────────────────────────────────────────────────────────────────────────────
// The shaft the river ends in (wrap.ts): its axis RIM downstream of the lip, its floor the pool, HF below.
// The river runs round its rim in a moat, widest where it comes in, and goes over all the way round.
const YL = riverY(LIP - 0.2), ZL = riverZ(LIP)
const SX = LIP + RIM * M, SZ = ZL, RR = RIM * M, YP = YL - HF * M
export const SHAFT = [SX, YP, SZ] // the vortex's axis stands here, straight up: where it meets the pool's still water
const moat = (x: number, z: number) => RR + 3.4 + (1.1 * (SX - x)) / (Math.hypot(x - SX, z - SZ) || 1)
const field = new Field(128, 2.1, 11)
function height(x: number, z: number) {
  const dc = Math.hypot(x - SX, z - SZ)
  if (dc < RR) return YP
  const m = dc - moat(x, z), W = wide(x), d = W + Math.max(0, Math.min(Math.abs(z - riverZ(x)) - W, m)) // as far from the moat as from the river
  const base = mix(YL, riverY(x), smooth(0, 4, m))
  if (d <= W) return base
  const wall = (6 + 3 * Math.sin(0.05 * x + 1) + 2 * Math.sin(0.13 * x)) * smooth(W, 17, d) ** 1.4
  const rough = field.at(x * 0.7, z * 0.7) * (0.3 + 2.4 * smooth(1.5, 12, d))
  return base + 0.3 * smooth(W, W + 0.7, d) + wall + rough * smooth(W, W + 2, d)
}

// NR rows to the lip, then NB more past it, wider: round the shaft and on to the far peaks. RK: what each
// point is, land, water (1) or the shaft's void (2).
const NR = 170, NB = 76, NT = NR + NB, NC = 200, ZW = 21
const rowX = (i: number) => (i < NR ? X0 + 1 + (i * (LIP - X0 - 1)) / (NR - 1) : LIP + (i - NR + 1) * 0.55) // row NR − 1 is the lip
const RH = new Float32Array(NT * NC), RZp = new Float32Array(NT * NC), RK = new Uint8Array(NT * NC)
for (let i = 0; i < NT; i++)
  for (let j = 0; j < NC; j++) {
    const x = rowX(i), z = riverZ(x) + (j / (NC - 1) - 0.5) * 2 * (i < NR ? ZW : 2.2 * ZW), dc = Math.hypot(x - SX, z - SZ)
    RZp[i * NC + j] = z, RH[i * NC + j] = height(x, z)
    RK[i * NC + j] = dc < RR ? 2 : dc < moat(x, z) || (x <= LIP && Math.abs(z - riverZ(x)) < wide(x)) ? 1 : 0
  }

// ── items: firs, stones, far peaks; all strokes in world space, ordered by x ────────────────────────
type Item = { x: number; a: number; n: number; c: readonly number[]; t0: number; base: number; kind: number }
const V: number[] = []
const items: Item[] = []
const TREE = 0, PEAK = 2, HATCH = 3, FLOW = 4, FIR2 = 5 // FIR2: a fir past the lip, neither counted nor sung
const item = (x: number, pts: number[], c: readonly number[], t0: number, base: number, kind: number) =>
  (items.push({ x, a: V.length / 3, n: pts.length / 3, c, t0, base, kind }), V.push(...pts))

function fir(x: number, z: number, H: number, seed: number, t0: number) {
  const y0 = height(x, z), teeth = 7 + Math.floor(6 * rnd(seed)), Wd = H * (0.27 + 0.08 * rnd(seed + 3)), pts: number[] = []
  for (let k = 0; k <= 2 * teeth; k++) {
    const y = H * (0.12 + (0.88 * k) / (2 * teeth)), amp = Wd * (1 - (y / H) ** 0.9)
    pts.push(x + (k & 1 ? amp : -amp) * 0.6, y0 + y, z + (k & 1 ? amp : -amp) * (0.85 + 0.3 * rnd(seed + k)))
  }
  pts.push(x, y0 + H * 1.04, z)
  item(x, [x, y0, z, x, y0 + H * 0.5, z], PINE, t0, y0, TREE)
  item(x, pts, PINE, t0, y0, TREE)
}
for (let i = 0; i < 420; i++) {
  const x = 0.5 + 57 * rnd(i * 3) ** 1.2, side = i & 1 ? 1 : -1, z = riverZ(x) + side * (wide(x) + 0.5 + 9 * rnd(i * 5) ** 1.6)
  if (height(x, z) - riverY(x) > 6) continue // the tree line
  fir(x, z, 0.6 + 1.3 * rnd(i * 7), i, 2.5 + x * 0.04)
}

// The line the meander drew opens into the river, a wave racing downstream: when it reaches x, and how
// far open it is there.
const opens = (x: number) => 0.25 + 0.03 * (x - X0)
// lock([[0, 0], [t0, 1]], t, wn, ζ) without building its keys, for the loops that run it per vertex
function settle(t: number, t0: number, wn: number, zeta: number) {
  const tau = t - t0, a = zeta * wn, wd = wn * Math.sqrt(1 - zeta * zeta)
  return tau <= 0 ? 0 : 1 - Math.exp(-a * tau) * (Math.cos(wd * tau) + (a / wd) * Math.sin(wd * tau))
}
const open = (x: number, t: number) => clamp(settle(t, opens(x), 7, 0.55), 0, 1.25)

// The water: a steady flow field and its streamlines. The current runs down the channel fastest in the
// middle; every stone sheds an eddy, every bend keeps a pool turning on its inside bank, and curl noise
// stirs the rest. Streamlines traced through it are drawn with a bright head racing downstream, so the
// water visibly runs, swirls and turns back on itself.
const vortex: [number, number, number][] = [] // x, z, circulation
for (let x = 2; x < LIP - 2; x += 0.5) {
  const a = riverZ(x - 0.5), b = riverZ(x), c = riverZ(x + 0.5)
  if ((b - a) * (c - b) < 0) vortex.push([x + 0.6, b - Math.sign(b - a) * wide(x) * 0.45, 1.6 * Math.sign(b - a)]) // a pool inside each bend
}
function flowAt(x: number, z: number, o: { x: number; z: number }) {
  const dz = (riverZ(x + 0.1) - riverZ(x - 0.1)) / 0.2, n = Math.hypot(1, dz), d = (z - riverZ(x)) / wide(x)
  const U = 1.2 * Math.max(0.15, 1 - d * d) * (1 + 0.8 * smooth(0.3, 0, Math.abs(((x + 0.3) % 19) - 9.5) / 9.5))
  o.x = U / n, o.z = (U * dz) / n // downstream is toward +x, away from us
  for (const [vx, vz, g] of vortex) {
    const rx = x - vx, rz = z - vz, r2 = rx * rx + rz * rz + 0.04, k = (g / r2) * Math.exp(-r2 / 0.9)
    o.x += -rz * k - 0.15 * rx * Math.abs(k), o.z += rx * k - 0.15 * rz * Math.abs(k) // swirling, drawing inward
  }
  const e = 0.08, curl = 0.5 // ψ from the land's own field, at a finer scale
  o.x += (curl * (field.at(x * 3, (z + e) * 3) - field.at(x * 3, (z - e) * 3))) / (2 * e)
  o.z -= (curl * (field.at((x + e) * 3, z * 3) - field.at((x - e) * 3, z * 3))) / (2 * e)
}

// The surface: travelling waves crossing at angles, choppier where the water is fast. Heave and sway.
const wave = (x: number, z: number, t: number) =>
  0.035 * Math.sin(3.1 * x + 1.7 * z + 7 * t) + 0.025 * Math.sin(-2.3 * x + 3.7 * z + 5.3 * t) + 0.02 * Math.sin(5.9 * x - 1.1 * z + 9.1 * t)

// The far peaks are spectra: the dB magnitude of a square wave with a slow FM wobble.
function spectrum(seed: number, n = 512) {
  const re = new Float64Array(n), im = new Float64Array(n)
  const duty = 0.3 + 0.4 * rnd(seed), fm = 2 + 6 * rnd(seed + 1), f0 = 3 + 4 * rnd(seed + 2)
  for (let k = 0; k < n; k++) {
    const ph = (f0 * k) / n + 0.02 * fm * Math.sin((TAU * fm * k) / n)
    re[k] = ((ph % 1) < duty ? 1 : -1) * hann(k, n) + 0.02 * hash(seed * 977 + k)
  }
  fft(re, im)
  const out = new Float64Array(n / 2)
  for (let k = 0; k < n / 2; k++) out[k] = 20 * Math.log10(Math.hypot(re[k], im[k]) + 1e-3)
  const lo = Math.min(...out), hi = Math.max(...out)
  return out.map((v) => (v - lo) / (hi - lo))
}
function peaks(seed: number, x: number, z0: number, z1: number, base: number, H: number, t0: number) {
  const sp = spectrum(seed), P = 170, r: number[] = [], pts: number[] = []
  const at = (u: number, lo: number, hi: number) => {
    const f = lo + u * (hi - lo), i = Math.floor(f)
    return sp[i] + (sp[i + 1] - sp[i]) * (f - i)
  }
  for (let i = 0; i < P; i++) {
    const u = i / (P - 1)
    r.push(H * Math.max(0, at(u, 2, 44) ** 1.4 + 0.07 * (at(u, 120, 250) - 0.5)) * Math.sin(Math.PI * u) ** 0.35)
  }
  const Z = (i: number) => mix(z0, z1, i / (P - 1))
  for (let i = 0; i < P; i++) pts.push(x, base + r[i], Z(i))
  item(x, pts, INK, t0, base, PEAK)
  for (let i = 0; i < P - 1; i++) {
    const shade = clamp(0.35 + (0.5 * (r[i + 1] - r[i])) / (H * 0.02)), n = Math.floor(shade * 6 * (0.6 + 0.4 * rnd(seed + i)))
    for (let k = 1; k <= n; k++) {
      const d = k * 0.06 * H * (0.8 + 0.4 * rnd(seed * 13 + i * 7 + k)), cut = 0.15 + 0.25 * rnd(i * 3 + k)
      if (Math.min(r[i], r[i + 1]) - d < 0.05 * H) break
      item(x, [x, base + mix(r[i], r[i + 1], cut) - d, mix(Z(i), Z(i + 1), cut), x, base + mix(r[i], r[i + 1], 1 - cut / 2) - d * 1.05, mix(Z(i), Z(i + 1), 1 - cut / 2)], INK, t0 + 0.8 + 0.008 * i, base, HATCH)
    }
  }
}
{
  const v = { x: 0, z: 0 }, pts: number[] = []
  for (let k = 0; k < 1800; k++) {
    let x = X0 + 0.5 + (LIP - X0 - 1) * rnd(k * 11 + 1), z = riverZ(x) + (rnd(k * 13 + 2) * 2 - 1) * wide(x) * 0.9
    pts.length = 0
    for (let s = 0; s < 34; s++) {
      if (Math.abs(z - riverZ(x)) > wide(x) * 0.97 || x > LIP) break
      pts.push(x, riverY(x) + 0.02, z)
      flowAt(x, z, v)
      const m = Math.hypot(v.x, v.z) || 1
      x += (0.13 * v.x) / m, z += (0.13 * v.z) / m
    }
    if (pts.length >= 18) item(pts[0], pts.slice(), WATER, opens(pts[0]), 0, FLOW)
  }
}
// Round the shaft and beyond it: firs, and the moat's current, running round from where the river comes in
// and quickening to the rim (critical there: Fr = 1), then the first of its fall. All of it rises at FAR,
// as we leave the pool and it comes into sight: until then it costs the beam nothing.
const FAR = 5
for (let i = 0; i < 300; i++) {
  const a = TAU * rnd(i * 3 + 7000), r = RR + 5.5 + 30 * rnd(i * 5 + 7001) ** 1.3, x = SX + r * Math.cos(a), z = SZ + r * Math.sin(a), h = height(x, z) - YL
  if (x < 58 || x > X1 - 3 || h > 7 || h < 0.25) continue
  fir(x, z, 0.6 + 1.3 * rnd(i * 7 + 7002), 7000 + i, FAR + 0.02 * (x - LIP))
  items[items.length - 1].kind = items[items.length - 2].kind = FIR2
}
for (let k = 0; k < 640; k++) {
  let a = Math.PI * (2 * rnd(k * 17 + 9001) - 1) * (k < 400 ? 1 : 0.22), // and more where the river comes in
     r = RR + 0.2 + (moat(SX - Math.cos(a), SZ + Math.sin(a)) - RR - 0.4) * rnd(k * 19 + 9002) // a: round from where the river comes in
  const pts: number[] = []
  for (let s = 0; s < 44 && r > RR; s++) {
    pts.push(SX - r * Math.cos(a), YL + 0.02, SZ + r * Math.sin(a))
    const vt = 0.9 * (1 - (0.75 * Math.abs(a)) / Math.PI), vr = 0.2 + 1.6 * Math.exp(-(r - RR) / 1.3), sp = Math.hypot(vt, vr), step = 0.07 * (0.6 + sp)
    a += (Math.sign(a) * vt * step) / (sp * r), r -= (vr * step) / sp
  }
  if (r <= RR) for (let s = 1; s <= 3; s++) pts.push(SX - (RR - VR * 0.12 * s) * Math.cos(a), YL - 0.5 * GF * (0.12 * s) ** 2, SZ + (RR - VR * 0.12 * s) * Math.sin(a))
  if (pts.length >= 15) item(pts[0], pts.slice(), WATER, FAR + 0.02 * (pts[0] - LIP), 0, FLOW)
}
peaks(13, 104, riverZ(104) - 60, riverZ(104) + 60, riverY(LIP) - 4, 30, 4.5)
items.sort((a, b) => a.x - b.x)
const VX = Float32Array.from(V)

// ── the board: every equation the valley is made of, with the numbers it is running on ────────────────
const WHITE = [0.9, 0.95, 1] as const
const L = (src: string, c: readonly number[], at: number) => ({ src, c, at, vals: [0, 0, 0, 0], hot: 0 })
const RIVER = L('\\theta(s) = \\num{0}{0.00} \\sin(2\\pi s / 13) + \\num{1}{0.00} \\sin(2\\pi s / 41 + 1.1)', WATER, 0)
const OPEN = L('w(x, t) = W(x)\\, L(t - 0.25 - 0.03 (x + 12)),\; x_f = \\num{0}{-00.0}', WATER, 0.3)
const LAND = L('T(x, z) = \\sum_k |k|^{-1.05} \\cos(k \\cdot r + \\phi_k),\; x_i = \\num{0}{-00.0}', INK, 1.5)
const WALL = L('y = y_r + (6 + 3 \\sin(0.05 x + 1) + 2 \\sin(0.13 x))\\, S(d)^{1.4} + T', INK, 2.2)
const FLOWS = L('u = 1.2 (1 - d^2)\\, s + \\sum_j \\Gamma_j \\frac{y \\times r_j}{|r_j|^2} + 0.5\\, \\nabla \\times T', WATER, 0.6)
const WAVES = L('\\eta = 0.035 \\sin(3.1 x + 1.7 z + \\num{0}{0.00}) + 0.025 \\sin(3.7 z - 2.3 x + \\num{1}{0.00})', WATER, 3)
const FIRS = L('x(y) = 0.3 H (1 - y / H)^{0.9}\\, tri(\\pi n y / H),\; N = \\num{0}{000}', PINE, 3.2)
const PEAKS = L('h(z) = 20 \\log_{10} |S(e^{i \\omega})|', INK, 5)
const SPRAY = L('(x, y) = (x_0 + v_x \\tau,\; y_0 + v_y \\tau - 3.5 \\tau^2)', WHITE, 2)
const EYE = L('eye = (\\num{0}{-00.0}, \\num{1}{-00.0}, \\num{2}{-00.0})', WHITE, 4.2)
const board = new Board([RIVER, OPEN, FLOWS, LAND, SPRAY, WALL, WAVES, FIRS, EYE, PEAKS]) // in the order they arrive
const slot: Place = { x: 0, y: 0, size: 0 }, lead = [0, 0, 0], RISE = 0.1, TAKE = RISE + MORPH // the river's line rises into the board, which takes it over
export const RIVER_EQ = '\\theta(s) = \\omega_1 \\sin(2\\pi s / M_1) + \\omega_2 \\sin(2\\pi s / M_2 + \\phi)'
let ceil = 1 // nothing of the land is drawn above this: the board's room
let grown = 0 // firs standing, counted as they are drawn

// ── each frame ──────────────────────────────────────────────────────────────────────────────────────
const SCAN = 1.2, SCAN_DUR = 3.2
const EXPOSE = 210 // the light drawn on the screen (length in screen units times intensity) the valley is exposed for
export const WIDE = 1.3 // how far the exposure is opened for the meander's lines, and the valley while they last
const HB = 1024, horizon = new Float32Array(HB)
const p3 = { x: 0, y: 0, z: 0, k: 1 }, q3 = { x: 0, y: 0, z: 0, k: 1 }
const sx = new Float32Array(NC), sy = new Float32Array(NC), sz = new Float32Array(NC), sk = new Float32Array(NC), ok = new Uint8Array(NC)
const ink = new Path(), line = new Path()
let occlude = 1, landK = 1, lp = 0 // lp: the roar's low-pass state

// The flight: one continuous path, eye, target and lens gliding through these without stopping. Straight
// down on the map the meander drew; a crane up and back as the valley rises; down over the firs to skim the
// pool turning in its bend, and up and on downstream; low and fast down the river to the lip, where the
// whirlpool's ride (wrap.ts) carries it on, over and down into the shaft.
const MAP_FOV = 1.1
export const RUN = 7 // the run for the lip: from half a second on, the falls' own stretch
const JOIN = 7.7 // the lip, where the whirlpool's ride takes the camera over
const on = (x: number, h: number, dz: number, tx: number, fov: number) => [x, riverY(x) + h, riverZ(x) + dz, tx, riverY(tx), riverZ(tx), fov]
const KEYS: number[][] = [
  [0, 0, 0, 0, 0, 0, 0, 0], // the map, framed each frame to the screen
  [1.2, 0, 0, 0, 0, 0, 0, 0], // held while the line opens into a river
  // the crane: up, back and round, at its highest before it is furthest back, so it never stops in the air
  [2.4, X0 + 4, riverY(0) + 16.5, riverZ(0) - 4, 11, riverY(11), riverZ(11), 1.05],
  [3.45, X0 - 5, riverY(0) + 13.5, riverZ(0) - 9, 22, riverY(22), riverZ(22), 1],
  [5, ...on(SC - 4, 3.6, -2, SC + 5, 1.05)], // down over the firs, low over the pool
  [6.1, ...on(SC + 11, 7.5, 2.5, 42, 1)], // and up, on downstream
  [RUN, ...on(43, 6.5, 0, 57, 1)],
  // low and fast to the lip, the mist the shaft breathes rising ahead; from the lip on the whirlpool's ride flies us
  // (wrap.ts), carrying on from this run (the row past the lip only shapes the run's last stretch)
  [JOIN, 55.5, YL + 2.6, riverZ(55.5), LIP + 22, YL - 9, ZL, 1.05],
  [8.25, LIP - 0.3, YL + 1.3, ZL, LIP + 12, YL - 20, ZL, 1.2],
]
// Straight down on the stretch the meander drew, framed as it framed it.
function framed(k: number[]) {
  let lo = Infinity, hi = -Infinity, y = 0, n = 0
  for (let x = X0; x <= XM; x += 0.5) (lo = Math.min(lo, riverZ(x))), (hi = Math.max(hi, riverZ(x))), (y += riverY(x)), n++
  const xc = (X0 + XM) / 2, zc = (lo + hi) / 2, D = (XM - X0) / 2 / Math.tan(MAP_FOV / 2) / (0.9 * view.a)
  k[1] = xc, k[2] = y / n + D, k[3] = zc + 0.05 * D, k[4] = xc, k[5] = y / n, k[6] = zc, k[7] = MAP_FOV
}
const eye = { x: 0, y: 0, z: 0 }, cur: number[] = [], fwd = { x: 1, y: 0, z: 0 }
// The shaft's own units (wrap.ts): across, downstream and up from the drain, M metres to one; and back, into o at i.
const toPool = (x: number, y: number, z: number, o: number[]) => ((o[0] = (z - SZ) / M), (o[1] = (x - SX) / M), (o[2] = (y - YP) / M))
const fromPool = (x: number, y: number, z: number, o: number[], i: number) => ((o[i] = SX + M * y), (o[i + 1] = YP + M * z), (o[i + 2] = SZ + M * x))
function crane(t: number) {
  framed(KEYS[0]), framed(KEYS[1])
  // off the map from rest without a lurch: across the first stretch, time is eased by w(s) = 3s² − 3s³ + s⁴,
  // which sets off with no acceleration and hands over to the next key at the same speed and acceleration
  const a = KEYS[1][0], b = KEYS[2][0], s = clamp((t - a) / (b - a))
  if (t < JOIN) glide(KEYS, t > a && t < b ? a + (b - a) * s * s * (3 - 3 * s + s * s) : t, cur)
  else {
    const { eye: e, fwd: d, fov } = ride(t - DUR)
    fromPool(e[0], e[1], e[2], cur, 0), fromPool(e[0] + d[0], e[1] + d[1], e[2] + d[2], cur, 3), (cur[6] = fov)
  }
  eye.x = cur[0], eye.y = cur[1], eye.z = cur[2]
  cam.aim(cur[0], cur[1], cur[2], cur[3], cur[4], cur[5], cur[6])
  const L = Math.hypot(cur[3] - cur[0], cur[4] - cur[1], cur[5] - cur[2])
  fwd.x = (cur[3] - cur[0]) / L, fwd.y = (cur[4] - cur[1]) / L, fwd.z = (cur[5] - cur[2]) / L
  // a floating horizon only means something while we look across the land, downstream
  occlude = smooth(0.4, 0.75, fwd.x) * smooth(-0.9, -0.7, fwd.y)
}

// The river on the map, as the meander must leave it: the same stretch through the same lens. map() aims
// the camera there, and SPRING is where the river begins.
export const MEANDER = 4.2 // how long the meander runs before us: its current's phase carries on from there
export const glow = (u: number, t: number) => 0.65 + 0.35 * Math.cos(TAU * (6 * u - 2.5 * t))
export const SPRING = X0, map = () => crane(0)
export const room = (y: number) => 1 - smooth(0.6, 0.72, y) // what the meander's lines leave the equation above them
export const reach = (x: number) => (x - X0) / (XM - X0) // 0 at the spring, 1 where the meander's three bends end

// The land on the map: contour lines every CI metres above the water, LEVELS to a bank. Each is where a
// walk straight out from the river first stands that high, so they nest and never cross; the lowest is
// the bank itself. contour() is the z of level l on a side (±1) at x, NaN where the land never gets there.
export const LEVELS = 14
export const CI = 0.35
const CDX = 0.2, CN = Math.ceil((XM + 8 - X0) / CDX) + 1, CZ = new Float32Array(2 * LEVELS * CN).fill(NaN)
for (let i = 0; i < CN; i++)
  for (const side of [-1, 1]) {
    const x = X0 + i * CDX, o = ((side + 1) / 2) * LEVELS * CN + i
    for (let d = 0.1, l = 0, was = 0; d < 32 && l < LEVELS; d += 0.1) {
      const h = height(x, riverZ(x) + side * d) - riverY(x)
      for (; l < LEVELS && h >= (l + 0.5) * CI; l++) CZ[o + l * CN] = riverZ(x) + side * (d - (0.1 * (h - (l + 0.5) * CI)) / (h - was))
      was = Math.max(was, h)
    }
  }
export function contour(side: number, l: number, x: number) {
  const f = clamp((x - X0) / CDX, 0, CN - 1.001), i = Math.floor(f), o = ((side + 1) / 2) * LEVELS * CN + l * CN + i
  return CZ[o] + (CZ[o + 1] - CZ[o]) * (f - i)
}

const col = (x: number) => Math.max(0, Math.min(HB - 1, Math.round(((x / view.a) * 0.45 + 0.5) * (HB - 1))))
// How much of a point shows: nothing above the board; behind the land in front, less and less as the floating
// horizon comes on, so lines hide as we come to look across the land, not all at once.
const shade = (x: number, y: number) => (y >= ceil ? 0 : y > horizon[col(x)] - 0.002 ? 1 : 1 - occlude)
const visible = (x: number, y: number) => shade(x, y) > 0.5
function raise(x0: number, y0: number, x1: number, y1: number) {
  if (x0 > x1) [x0, y0, x1, y1] = [x1, y1, x0, y0]
  const a = col(x0), b = col(x1), s = (y1 - y0) / (x1 - x0 || 1)
  for (let c = a; c <= b; c++) {
    const y = b > a ? y0 + s * clamp(((c / (HB - 1) - 0.5) / 0.45) * view.a - x0, 0, x1 - x0) : Math.max(y0, y1) // exact, even where an end is off the screen
    if (y > horizon[c]) horizon[c] = y
  }
}
const fog = (z: number) => Math.min(1, 0.25 + 0.9 * z)

// The pen. Every stroke the valley draws goes through to(): clipped to the screen, so the beam spends no time
// off it and the exposure, which reads the drawn length, holds steady as strokes swing out past the lens; and
// what comes within NEAR metres of the lens fades out on its way, each segment as faint as its nearer end, so
// nothing sweeps in huge from off the screen and pops as it passes.
const NEAR = 3
let ax = 0, ay = 0, ak = 0, inked = false, u0 = 0, u1 = 1 // the pen: where it is, its fade, whether the path is there too
// Projects a world point into o, with how far it is from fading into the lens, o.k.
function look(x: number, y: number, z: number, o = p3) {
  if (!cam.project(x, y, z, o)) return false
  const d = (x - eye.x) * fwd.x + (y - eye.y) * fwd.y + (z - eye.z) * fwd.z
  o.k = d >= NEAR ? 1 : smooth(NEAR / 4, NEAR, d)
  return true
}
// One edge of the screen, Liang–Barsky: q the stroke's run toward it, r the room before it.
function edge(q: number, r: number) {
  if (!q) return r >= 0
  const u = r / q
  if (q < 0) u > u0 && (u0 = u)
  else u < u1 && (u1 = u)
  return u0 <= u1
}
// A stroke from the pen to (x, y), whose fade is k, in colour c at intensity i; or a move there, if the pen is up.
function to(p: Path, down: boolean, x: number, y: number, k: number, c: readonly number[], i: number) {
  const x0 = ax, y0 = ay, X = view.a + 0.02, Y = 1.02
  i *= ak < k ? ak : k
  ;(ax = x), (ay = y), (ak = k)
  if (!down || i < 0.003) return void (inked = false)
  p.color(c[0], c[1], c[2], i)
  if (x0 > -X && x0 < X && y0 > -Y && y0 < Y && x > -X && x < X && y > -Y && y < Y) { // all on the screen, as most are
    if (!inked) p.moveTo(x0, y0)
    return void (p.lineTo(x, y), (inked = true))
  }
  const dx = x - x0, dy = y - y0
  ;(u0 = 0), (u1 = 1)
  if (!edge(-dx, x0 + X) || !edge(dx, X - x0) || !edge(-dy, y0 + Y) || !edge(dy, Y - y0)) return void (inked = false)
  if (!inked || u0 > 0) p.moveTo(x0 + u0 * dx, y0 + u0 * dy)
  p.lineTo(x0 + u1 * dx, y0 + u1 * dy)
  inked = u1 >= 1
}

// Draws one world-space segment if both ends clear the horizon.
function seg(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: readonly number[], i: number) {
  if (!look(x0, y0, z0, p3) || !look(x1, y1, z1, q3)) return
  const a = shade(p3.x, p3.y), b = shade(q3.x, q3.y)
  if (!a || !b) return
  to(ink, false, p3.x, p3.y, p3.k * a, c, 0), to(ink, true, q3.x, q3.y, q3.k * b, c, i * fog(p3.z) * landK)
}

function items_(t: number, upto: number, next: { i: number }) {
  for (; next.i < items.length && items[next.i].x < upto; next.i++) {
    const it = items[next.i]
    if (t < it.t0) continue
    const k = clamp(settle(t, it.t0, 7, 0.45), 0, 1.3)
    let pen = false
    for (let v = 0; v < it.n; v++) {
      const o = 3 * (it.a + v), wv = it.kind === FLOW ? wave(VX[o], VX[o + 2], t) : 0, y = it.kind === FLOW ? VX[o + 1] + wv : it.base + (VX[o + 1] - it.base) * k
      let px = VX[o], pz = VX[o + 2] + 1.5 * wv
      if (it.kind === FLOW) pz = riverZ(px) + (pz - riverZ(px)) * Math.min(1, open(px, t))
      const sh = look(px, y, pz) ? shade(p3.x, p3.y) : 0, fir = (it.kind === TREE || it.kind === FIR2) && it.n > 2
      if (fir) (fs[next.i] = v ? fs[next.i] : nf), (fp[2 * nf] = sh > 0.5 && into(p3.x, p3.y) ? p3.x : NaN), (fp[2 * nf + 1] = p3.y), (fe[next.i] = ++nf)
      if (!sh) {
        pen = false
        continue
      }
      let g = it.kind === HATCH ? 0.5 : 1
      if (it.kind === FLOW) {
        const head = (t * 0.55 + rnd(it.a)) % 1, u = (v / (it.n - 1) - head + 1) % 1
        // bright at the head, trailing back upstream, rising from nothing where the head is, so as it passes a vertex
        // nothing steps; flaring as it opens, from nothing too
        g = (0.04 + 0.5 * Math.exp(-u * 9) * smooth(0, 0.08, u) * k) * (1 + 3 * Math.exp(-(t - it.t0) / 0.4)) * smooth(it.t0, it.t0 + 0.15, t)
      }
      if (it.kind === TREE && it.n > 2 && !v && k >= 1) grown++
      if (!v && (it.kind === TREE || it.kind === FIR2) && it.n > 2) heard(next.i, k * fog(p3.z) * p3.k, p3.z)
      if (it.kind === PEAK) far = next.i
      to(ink, pen, p3.x, p3.y, p3.k * sh, it.c, fog(p3.z) * g * landK)
      pen = true
    }
  }
}

// ── what the speakers trace ─────────────────────────────────────────────────────────────────────────
// The beam's own picture, thinned to what the speakers can draw at a note (beam/scope.ts), on two pages, one
// traced forth and the other back, both ending with the river's banks, so the trace swings between them
// without a flyback. The first begins with the land's skyline, its silhouette against the sky. Then each page
// takes its share of the cross-sections, only as much of each as the beam shows (what the land in front hides
// is skipped, as on the screen: the hidden-line picture is the depth), thinned by depth, so that on a scope they
// stand about as far apart near as far, a little closer near: every row near the eye, every other further,
// every fourth, and so on, each fading in as the camera brings it near enough, so the picture grows rather
// than steps. Nearer ones are worth more time, so brighter, as dwell is a scope's only brightness. Then the
// rim of the shaft ahead, as the land in front hides it; the firs nearest the eye, half on each page; the
// contours and the line the meander left, while they last; the far peaks. Each stretch is worth its drawn
// length times its brightness, so what fades in or out on the screen grows or shrinks in the speakers' time
// instead of popping, and the tables change from one refresh to the next only as much as the picture does: a
// tone, not static.
const STRIDE0 = 0.65, FIRS_HEARD = 12, FIR_W = 2.5
const sc = screen, shore = new Float32Array(2 * 2 * NR) // the banks' points, left then right
const store = new Float32Array(2 * NT * NC), cut: number[] = [] // the rows taken: their points, and per row its end, page and worth
let flips = 0, far = -1, banks = 0, nf = 0, rimmed_ = false
// every fir's outline as the beam drew it, hidden points NaN: the speakers take the nearest
const fp = new Float32Array(2 * 48 * 1024), fs = new Int32Array(items.length), fe = new Int32Array(items.length)
const firs: number[] = [], near: number[] = [] // the nearest firs drawn this frame, nearest first: item, closeness
function heard(i: number, k: number, z: number) {
  if (k < 0.3) return
  let j = firs.length
  if (j === FIRS_HEARD + 1 && z <= near[j - 1]) return
  if (j === FIRS_HEARD + 1) j--
  while (j > 0 && near[j - 1] < z) (firs[j] = firs[j - 1]), (near[j] = near[j - 1]), j--
  ;(firs[j] = i), (near[j] = z)
}
const into = (x: number, y: number) => Math.abs(x) < view.a && y > -1 && y < ceil
// A cross-section, from the screen arrays, as the speakers draw it, if its depth d wants it: a row is kept in
// every 2^λ, λ how many times 2 divides its index (so the choice is the land's, not the camera's), where the
// depth asks for one in STRIDE0 (d / 6)^1.5, fading over half a doubling; rows alternate pages by the next bit
// up, and every other one on a page runs backwards, finer the nearer it is.
function section(i: number, o: number, w: number, x: number) {
  const d = Math.max(1, (x - eye.x) * fwd.x + (riverY(x) - eye.y) * fwd.y + (riverZ(x) - eye.z) * fwd.z)
  const l = i ? Math.min(31 - Math.clz32(i & -i), 10) : 10, keep = clamp(l - Math.log2(STRIDE0 * (d / 6) ** 1.5) + 0.5)
  if (keep < 0.02) return
  const p = (i >> (l + 1)) & 1, back = (flips >> p) & 1, step = d < 12 ? 2 : d < 30 ? 3 : 5
  let n = cut.length ? cut[cut.length - 3] : 0
  for (let k = 0; k < NC; k += step) {
    const j = back ? NC - 1 - k : k, y = sy[j]
    const seen = ok[j] && RK[o + j] < 2 && into(sx[j], y) && shade(sx[j], y) > 0.5
    ;(store[2 * n] = seen ? sx[j] : NaN), (store[2 * n + 1] = y), n++
  }
  cut.push(n, p, keep * w * (0.7 + 0.8 * clamp(1.5 - d / 20)))
  flips ^= 1 << p
}
// The land's skyline, the floating horizon left to right, where it is on the screen under the board; the
// cross-sections taken after it, each on its page; then the nearest firs' outlines as the beam drew them.
function skyline(w: number) {
  let pen = false
  sc.page(1).weight = w
  for (let c = 0; w > 0.02 && c < HB; c += 6) {
    const x = ((c / (HB - 1) - 0.5) / 0.45) * view.a, y = horizon[c]
    if (!(y > -1 && y < ceil && Math.abs(x) < view.a)) pen = false
    else pen ? sc.lineTo(x, y) : ((pen = true), sc.moveTo(x, y))
  }
  for (let r = 0, n = 0; r < cut.length; r += 3) {
    sc.page(1 << cut[r + 1]).weight = cut[r + 2]
    for (pen = false; n < cut[r]; n++) {
      const x = store[2 * n], y = store[2 * n + 1]
      if (x !== x) pen = false
      else pen ? sc.lineTo(x, y) : ((pen = true), sc.moveTo(x, y))
    }
  }
  for (let j = 0; j < Math.min(FIRS_HEARD, firs.length); j++) {
    // the last few fade as one further off nears them, so a fir joining or leaving them grows or wanes
    sc.page(1 << (j & 1)).weight = FIR_W * (firs.length > FIRS_HEARD ? clamp((near[j] - near[FIRS_HEARD]) / 0.15) : 1)
    for (let n = fs[firs[j]], pen = false; n < fe[firs[j]]; n++) {
      const x = fp[2 * n], y = fp[2 * n + 1]
      if (x !== x) pen = false
      else pen ? sc.lineTo(x, y) : ((pen = true), sc.moveTo(x, y))
    }
  }
  sc.page(3)
}
// A world-space polyline of items' vertices, every `every`-th, as it is drawn.
function traced(it: Item, w: number, every: number, t: number) {
  const k = clamp(settle(t, it.t0, 7, 0.45), 0, 1.3)
  let pen = false
  sc.weight = w
  for (let v = 0; v < it.n; v += Math.min(every, Math.max(1, it.n - 1 - v))) {
    const o = 3 * (it.a + v)
    if (!cam.project(VX[o], it.base + (VX[o + 1] - it.base) * k, VX[o + 2], p3) || !visible(p3.x, p3.y) || !into(p3.x, p3.y)) pen = false
    else pen ? sc.lineTo(p3.x, p3.y) : ((pen = true), sc.moveTo(p3.x, p3.y))
    if (v === it.n - 1) break
  }
}
function bank(side: number, w: number) {
  let pen = false
  sc.weight = w
  for (let b = 0; b < banks; b++) {
    const i = side > 0 ? banks - 1 - b : b, x = shore[4 * i + (side > 0 ? 2 : 0)], y = shore[4 * i + (side > 0 ? 3 : 1)]
    if (x !== x) pen = false
    else pen ? sc.lineTo(x, y) : ((pen = true), sc.moveTo(x, y))
  }
}
// The rim of the shaft the river ends in, once it is in sight.
function rimmed(w: number) {
  let pen = false
  sc.weight = w
  for (let j = 0; j <= 48; j++) {
    const a = (TAU * j) / 48
    if (!cam.project(SX + RR * Math.cos(a), YL, SZ + RR * Math.sin(a), p3) || !visible(p3.x, p3.y) || !into(p3.x, p3.y)) pen = false
    else pen ? sc.lineTo(p3.x, p3.y) : ((pen = true), sc.moveTo(p3.x, p3.y))
  }
}
// The refresh rate, a bass line in A under the picture, which is its timbre: on A while the line opens,
// walking as the land rises and the firs grow, and climbing the major chord as we run for the lip, to A (110 Hz),
// held: the note the choir takes up. Over the lip (OVER) the note falls with the choir (choir.lag).
const A1 = 55, CS = 69.3, E1 = 41.2, B1 = 61.74, D2 = 73.42, E2 = 82.41, FS = 46.25
const RIFF = [A1, A1, E1, A1, B1, CS, B1, E1, D2, CS, A1, E1, FS, A1, B1, CS, A1, E1, A1]
const CLIMB = [CS, E2, 2 * A1], OVER = SING + FALL
const NOTES: [number, number][] = [[0, A1], ...RIFF.map((n, i): [number, number] => [1.2 + ((RUN - 1.2) * i) / RIFF.length, n]), ...CLIMB.map((n, i): [number, number] => [RUN + 0.2 * i, n])]
const CYCLES = tune(NOTES)
let shift = NaN, was = NaN // the bass line's phase, set to go on from where the meander left the trace

// White water: at each cascade a foam lip curling across the river, and spray thrown downstream on
// ballistic arcs, each droplet a parabola; around each stone, ripple rings running outward.
const G = 7, FOAM = [0.85, 0.95, 1], SPRAY_C = [0.9, 0.97, 1]
function whitewater(t: number, xc: number) {
  const y0 = riverY(xc - 0.3), zc = riverZ(xc), w = wide(xc), on = smooth(opens(xc), opens(xc) + 1.5, t) * landK
  for (let k = 0; k < 7; k++) {
    let pen = false
    for (let j = 0; j <= 24; j++) {
      const u = j / 24 - 0.5, curl = 0.08 * Math.sin(TAU * (u * 3 + t * 1.3 + k * 0.4))
      const sh = look(xc + 0.1 * k + curl, y0 - 0.06 * k + wave(xc, zc + u * 2 * w, t), zc + u * 2 * w * 0.98) ? shade(p3.x, p3.y) : 0
      if (!sh) {
        pen = false
        continue
      }
      to(ink, pen, p3.x, p3.y, p3.k * sh, FOAM, on * (1 - k / 8) * fog(p3.z))
      pen = true
    }
  }
  for (let d = 0; d < 90; d++) {
    const life = 0.9 + 0.5 * rnd(d * 3 + xc), age = ((t + life * rnd(d * 7 + xc)) % life)
    const vx = 1.2 + 1.5 * rnd(d + xc), vy = 1 + 2.2 * rnd(d * 5 + xc), vz = (rnd(d * 11 + xc) * 2 - 1) * 1.2, z0 = zc + (rnd(d * 13 + xc) * 2 - 1) * w
    const at = (a: number) => look(xc + vx * a, y0 + vy * a - 0.5 * G * a * a, z0 + vz * a)
    const sh = at(age) ? shade(p3.x, p3.y) : 0
    if (!sh) continue
    const x1 = p3.x, y1 = p3.y, k1 = p3.k * sh
    if (!at(Math.max(0, age - 0.05))) continue
    to(ink, false, p3.x, p3.y, p3.k, SPRAY_C, 0), to(ink, true, x1, y1, k1, SPRAY_C, on * smooth(0, 0.1, age) * (1 - age / life) * fog(p3.z)) // born and dying faint
  }
}
// The shaft. The river goes over its rim all the way round and falls into it; down there it is night, moonlit
// water, and the pool the soundtrack's waterfall plot (wrap.ts, drops.wgsl), placed in the pool's own units. What the pen draws of it is its rim,
// heaving with the spectrum going over it now, angle for log-frequency, and the moat's outer bank, until the
// mist the shaft breathes takes them.
const WE = [0, 0, 0], WT = [0, 0, 0], UP = [0, 0, 1]
// the run's last moments, in the pool's units, for the ride to carry on from
join(JOIN - DUR, [2, 1, 0].map((k) => (glide(KEYS, JOIN - k * 1e-3, cur), toPool(cur[0], cur[1], cur[2], WE), toPool(cur[3], cur[4], cur[5], WT), [...WE, ...WT, cur[6]])), 1e-3)
type Stroke = { a: number; n: number; kind: number; x: number }
const SV: number[] = [], rims: Stroke[] = []
const RIMK = 0, BANK = 1
const stroke = (list: Stroke[], pts: number[], kind = 0) => (list.push({ a: SV.length / 3, n: pts.length / 3, kind, x: pts[0] }), SV.push(...pts))
for (let k = 0; k < 120; k++)
  for (const kind of [RIMK, BANK]) {
    const pts: number[] = []
    for (let i = 0; i <= 3; i++) {
      const a = (TAU * (k + i / 3)) / 120, r = kind ? moat(SX + Math.cos(a), SZ + Math.sin(a)) : RR
      pts.push(SX + r * Math.cos(a), YL + 0.03, SZ + r * Math.sin(a))
    }
    stroke(rims, pts, kind)
  }
rims.sort((a, b) => a.x - b.x)
const SVX = Float32Array.from(SV)
// The lane at angle a round the shaft: 80 Hz to 8 kHz over half of it, mirrored on the other.
const lane = (a: number) => {
  const b = ((((a - A0) / Math.PI) % 2) + 2) % 2
  return b > 1 ? 2 - b : b
}
// Close beside the lens a point projects far off the screen, and a stroke out to it would cost the beam its
// whole budget and the exposure its light: such points are not drawn.
const framed_ = () => Math.abs(p3.x) < 1.3 * view.a && Math.abs(p3.y) < 1.3
// The rim and the moat's bank, up to x, in their place in the sweep.
let heave = 0
function rim(upto: number, next: { i: number }, k: number) {
  for (; next.i < rims.length && rims[next.i].x < upto; next.i++) {
    const it = rims[next.i]
    let pen = false
    for (let v = 0; v < it.n; v++) {
      const o = 3 * (it.a + v), x = SVX[o], z = SVX[o + 2], lv = it.kind ? 0 : loud(lane(Math.atan2(z - SZ, x - SX)))
      if (k <= 0 || !cam.project(x, SVX[o + 1] + 0.9 * heave * lv, z, p3) || !framed_() || !visible(p3.x, p3.y)) {
        pen = false
        continue
      }
      if (it.kind) ink.color(WATER[0], WATER[1], WATER[2], 0.6 * k * fog(p3.z) * landK)
      else ink.color(1, mix(0.8, 0.97, lv), mix(0.6, 0.95, lv), k * fog(p3.z) * (0.5 + 2 * lv * lv))
      pen ? ink.lineTo(p3.x, p3.y) : ink.moveTo(p3.x, p3.y)
      pen = true
    }
  }
}

export const valley: Scene = {
  dur: DUR,
  build(t, f) {
    crane(t)
    ink.clear(), sc.clear(2), (grown = 0), (far = -1), (banks = firs.length = near.length = 0)
    horizon.fill(-9)
    const next = { i: 0 }, edge = { i: 0 }, behind = occlude > 0.5 ? eye.x + 0.3 : -Infinity, now = (f.at ?? 0) + t
    ;(cut.length = 0), (flips = 0), (nf = 0), (rimmed_ = false)
    let heroRow = -1
    // Running for the lip, the moonlit world shows through the mouth under the ink, a breath of mist over it; the
    // rim's ink goes where the water's lip catches the moon, the moat's streamlines going on over it as its flow
    // lines in their own light; and over the edge, through the mist curling over it, the land drops away behind.
    const land = (landK = 1 - smooth(8.3, 8.95, t))
    const T = t - DUR, lit = smooth(6.1, 7.3, t), plume = smooth(5.3, 6.9, t), veil = 0.35 + 0.65 * smooth(8, 8.35, t) * (1 - smooth(8.5, 9, t))
    const brim = smooth(FAR, FAR + 1, t) * (1 - smooth(7.7, 8.35, t))
    heave = smooth(4.5, 6.5, t)

    // strokes too faint to see would still cost the beam its time: once the valley is gone, skip it
    for (let i = 0; i < (t > FAR ? NT : NR) && land > 0.06; i++) {
      const x = rowX(i), x0 = rowX(i - 1), rise = clamp(lock([[0, 0], [i < NR ? SCAN + (i / NR) * SCAN_DUR : FAR + (0.8 * (i - NR)) / NB, 1]], t, 7, 0.45), 0, 1.35)
      if (x < behind) continue
      items_(t, x, next)
      rim(x, edge, brim)
      if (!rimmed_ && x >= SX - RR && t > FAR) (rimmed_ = true), rimmed(2 * smooth(FAR, FAR + 1, t)) // the speakers' rim, as the land in front of it hides it
      for (const c of CASCADES) if (c >= x0 && c < x && t > opens(c)) whitewater(t, c)
      // the banks and the current, from the last row to this one
      if (i > 0 && i < NR && x0 >= behind && t > opens(x0)) {
        const y0 = riverY(x0), y1 = riverY(x), w0 = wide(x0) * open(x0, t), w1 = wide(x) * open(x, t)
        for (const side of [-1, 1]) seg(x0, y0, riverZ(x0) + side * w0, x, y1, riverZ(x) + side * w1, WATER, 0.9)
        if (i % 2 === 0) for (const side of [-1, 1]) {
          const ok = cam.project(x, y1, riverZ(x) + side * w1, p3) && visible(p3.x, p3.y) && into(p3.x, p3.y), o = 4 * banks + side + 1
          ;(shore[o] = ok ? p3.x : NaN), (shore[o + 1] = p3.y), (banks += (side + 1) / 2)
        }
      }
      if (rise <= 0) continue
      // the cross-section, risen from the river's level, drawn where it clears the horizon
      const o = i * NC, base = riverY(x)
      for (let j = 0; j < NC; j++) {
        ok[j] = look(x, base + (RH[o + j] - base) * rise, RZp[o + j]) ? 1 : 0
        sx[j] = p3.x, sy[j] = p3.y, sz[j] = p3.z, sk[j] = p3.k
      }
      const index = (i % 8 === 0 ? 1 : 0.6) * Math.min(1, rise * 2.5) * land
      let pen = false
      for (let j = 0; j < NC; j++) {
        const water = RK[o + j] === 1
        const sh = ok[j] ? shade(sx[j], sy[j]) : 0
        if (!sh || (water && i % 3) || RK[o + j] > 1) {
          pen = false
          continue
        }
        const c = water ? WATER : INK
        to(ink, pen, sx[j], sy[j], sk[j] * sh, c, index * fog(sz[j]) * (water ? 0.25 : 1))
        pen = true
      }
      if (t >= SCAN && rise < 1.2) heroRow = i
      section(i, o, index * fog(sz[NC >> 1]), x)
      for (let j = 1; j < NC; j++) if (ok[j] && ok[j - 1] && RK[o + j] < 2 && RK[o + j - 1] < 2) raise(sx[j - 1], sy[j - 1], sx[j], sy[j])
    }
    if (land > 0.06) items_(t, Infinity, next)
    skyline(1.2 * smooth(0.5, 0.9, occlude) * land)
    // the contours the meander's rivers combed out onto, carried on at their own heights, so they tilt with the land
    // as we crane up, and give way as its cross-sections rise
    const cl = 0.22 * (1 - smooth(1, 2.6, t))
    if (cl > 0.01)
      for (const side of [-1, 1])
        for (let l = 0; l < LEVELS; l++) {
          let pen = false, kept = 0
          if (l % 2 === 0) (sc.page(l % 4 ? 1 : 2).weight = 8 * cl), (kept = 1) // the speakers keep every other, a page each
          for (let x = X0; x < XM + 8; x += CDX) {
            const z = contour(side, l, x)
            if (z !== z || !look(x, riverY(x) + (l + 0.5) * CI, z)) {
              pen = false
              continue
            }
            to(ink, pen, p3.x, p3.y, p3.k, INK, cl * room(p3.y))
            if (kept) pen ? sc.lineTo(p3.x, p3.y) : sc.moveTo(p3.x, p3.y)
            pen = true
          }
        }
    rim(Infinity, edge, brim)
    // the shaft's printer runs from early on, so the water has its history when it shows; the plume rises out of
    // its mouth as we run for the lip, its drops fall from then on, fewer while they are far off
    if (t > 1) {
      whirl(T, (f.at ?? 0) + t, f, lit, smooth(6.1, 7.3, t), mix(0.35, 1, smooth(7.5, 8.5, t)), plume, veil)
      if (t < JOIN) {
        toPool(cur[0], cur[1], cur[2], WE), toPool(cur[3], cur[4], cur[5], WT)
        WT[0] -= WE[0], WT[1] -= WE[1], WT[2] -= WE[2]
        sight(WE, WT, UP, cur[6])
      } else {
        const r = ride(T)
        sight(r.eye, r.fwd, r.up, r.fov)
      }
      f.look = lit > 0 ? { tau: mix(LOOK.tau, TAU_RASTER, smooth(7.5, 8.5, t)) } : undefined
    }
    // exposure: the ink is energy per length, so as the valley fills in it would burn brighter and
    // brighter; past a reference light, stop down, as an eye or a camera would (opened WIDE while the
    // meander's lines are all there is). It reads the light drawn, not the length, so a stroke fading out
    // eases it rather than jolting it when it goes.
    let light = 0
    for (let i = STRIDE, v = ink.v; i < v.length; i += STRIDE)
      if (v[i + 7]) {
        const dx = v[i] - v[i - STRIDE], dy = v[i + 1] - v[i + 1 - STRIDE]
        light += v[i + 2] * Math.sqrt(dx * dx + dy * dy)
      }
    const stop = Math.min(mix(WIDE, 1, smooth(2.6, 4, t)), (EXPOSE / Math.max(1e-3, light)) ** 0.7)
    for (let i = 2; i < ink.v.length; i += STRIDE) ink.v[i] *= stop
    f.ch.push({ w: 1, path: ink })

    // the line the meander drew, still running, until the river it became has opened all along it
    const fade = 1 - smooth(0.8, 2.6, t)
    if (fade > 0) {
      line.clear()
      let pen = false
      for (let x = X0; x < LIP; x += 0.1) {
        const k = 1 - smooth(opens(x) - 0.2, opens(x) + 0.6, t)
        if (k <= 0 || !look(x, riverY(x), riverZ(x))) {
          pen = false
          continue
        }
        to(line, pen, p3.x, p3.y, p3.k, WATER, glow((x - X0) / (XM - X0), t + MEANDER) * k * room(p3.y))
        pen = true
      }
      f.ch.push({ w: fade, path: line, gain: WIDE })
    }
    const hero = (a: number, b: number) => smooth(a - 0.3, a, t) * (1 - smooth(b - 0.3, b, t)) // what is new, from a to b: the river, the land, the firs
    RIVER.vals[0] = W1, RIVER.vals[1] = W2, RIVER.hot = hero(-1, SCAN)
    OPEN.vals[0] = clamp(X0 + (t - 0.25) / 0.03, X0, LIP), OPEN.hot = 1 - smooth(2, 3.5, t)
    LAND.vals[0] = rowX(Math.max(0, heroRow)), LAND.hot = hero(SCAN, 3)
    FIRS.vals[0] = grown, FIRS.hot = hero(3, 4.8)
    WAVES.vals[0] = (7 * t) % TAU, WAVES.vals[1] = (5.3 * t) % TAU, WAVES.hot = FLOWS.hot = 0.4
    EYE.vals[0] = eye.x, EYE.vals[1] = eye.y, EYE.vals[2] = eye.z, EYE.hot = 0.3
    // the equations: the meander's carries on a moment, then rises into the head of the board as it takes the
    // numbers in, one equation morphing, and the board goes on drawing it among everything the valley is made of
    const led = t < TAKE
    if (t < RISE) say.say(f, now, RIVER_EQ, WATER, [['\\omega_1', W1, 2], ['\\omega_2', W2, 2], ['M_1', M1, 0], ['M_2', M2, 0]])
    else if (led) {
      const h = RIVER.hot // lit as the board will light it when it takes it over
      ;(lead[0] = mix(0.75, WATER[0], h)), (lead[1] = mix(0.8, WATER[1], h)), (lead[2] = mix(0.85, WATER[2], h))
      say.say(f, now, RIVER.src, lead, [], mix(0.35, 1, h), board.first(slot), RIVER.vals)
    }
    // running for the lip the board goes, and from the lip on nothing is written: only the water
    const hand = smooth(7.1, 7.7, t)
    ceil = mix(board.show(f, t, smooth(0.2, 0.8, t) * (1 - hand), led), 1, hand)

    f.rate = mix(2.4e6, 7.2e6, smooth(1, 8, t))
    if (t > SING) place(t - SING)
    // the spatial voices on the shaft ahead: the choir's left and right on its rim, which opens round us as we
    // run at it, and its middle (the sub, the roar) down in it
    const half = 0.35 + 1.2 * smooth(6, OVER + 0.8, t)
    ;(space[9] = -Math.sin(half)), (space[10] = 0), (space[11] = -Math.cos(half))
    ;(space[12] = Math.sin(half)), (space[13] = 0), (space[14] = -Math.cos(half))
    ;(space[15] = 0), (space[16] = -0.4), (space[17] = -0.9)
    // the speakers' picture goes on, on both pages: the line while it lasts, the far peaks, and last the banks
    sc.page(3)
    if (fade > 0) {
      let pen = false
      for (let i = 0; i < 2; i++) {
        sc.weight = 2 * fade
        for (let j = 0, n = line.v.length / STRIDE; j < n; j += 4) {
          const v = STRIDE * (i ? j : n - 1 - j)
          if (!line.v[v + 7] || !into(line.v[v], line.v[v + 1])) pen = false
          else pen ? sc.lineTo(line.v[v], line.v[v + 1]) : ((pen = true), sc.moveTo(line.v[v], line.v[v + 1]))
        }
      }
    }
    if (far >= 0) traced(items[far], 0.6, 3, t)
    if (banks) bank(-1, 1.5 * land), bank(1, 1.5 * land)
    sc.commit(now)
    if (!(t > was)) shift = NaN
    was = t
    return (tt, o) => {
      // the speakers swing forth over one page and back over the other at the bass line's note, going on from
      // where the meander's trace was. Over the lip the scope rule ends: the note falls with the choir, the
      // plates' low-pass closes with the choir's filter, and the trace gives way to the choir that grew out of it
      if (shift !== shift) shift = sc.u / 2 - (CYCLES(tt) % 1)
      const c = CYCLES(tt) + 2 * A1 * lag(tt - SING) + shift, k = 1 - smooth(OVER, OVER + 1.4, tt)
      if (k > 0) sc.play(c, tt, o, k, SHARP - (SHARP - 0.08) * smooth(OVER, OVER + 1.2, tt), true)
      // the falls are heard coming, from the shaft ahead; at the lip they draw a breath; over the edge they are
      // all round us, and roar
      const hush = 1 - 0.35 * smooth(OVER - 0.2, OVER + 0.2, tt) * (1 - smooth(OVER + 0.4, OVER + 1, tt))
      if (tt > 3) { // on through the crossfade: the whirlpool takes the choir over smoothly (sing caches a repeated t)
        lp += (hash(tt * 48_000) - lp) * 0.04
        const roar = 0.5 * lp * smooth(5.1, 6.9, tt) * hush * (1 - 0.6 * smooth(OVER + 1.5, DUR - 3.5, tt)) * (1 - smooth(DUR - 3.3, DUR, tt)), a = ahead(tt - SING)
        ;(o.l += (1 - a) * roar), (o.r += (1 - a) * roar), (o.s[5] += a * roar)
        if (tt > SING) sing(tt - SING, o) // silent until the run for the lip, then rising from the shaft; on past the end, as the speakers run ahead
      }
    }
  },
}

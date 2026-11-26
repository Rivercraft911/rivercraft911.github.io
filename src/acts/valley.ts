// The valley, drawn the way a pen draws it and made of signals. The meander the wave became is the
// river; the camera cranes down from the map to its bank and the land rises around it in a wave rolling
// upstream. The ground is a power-law field (spectral synthesis: random phases under |k|^−β, inverted)
// carved into a valley that climbs toward the peaks in cascades, and it is drawn as the pulsar plot was,
// cross-section after cross-section, front to back, each hidden behind the ones before it (a floating
// horizon, recomputed every frame). Firs are triangle waves under a tapering envelope; the far peaks are
// spectra; the stones in the shallows are 16APSK. What is being seeded is the hero: the speakers trace it
// and its equation is written live beneath the scene.
import { Path, STRIDE } from '../beam/path'
import { load, use } from '../beam/font'
import { fft, hann } from '../dsp/fft'
import { Field } from '../dsp/terrain'
import { place, sing } from './choir'
import { VALLEY as DUR, SING } from './clock' // the choirs begin to sing at SING
import { Kind } from '../dsp/dvbs2'
import { ON, RS, STEPS, STONES, chase, decision, esn0, offset, order, rain, sig, sigma, signal, stone, turn } from './modem'
import { A0, GF, HF, KEYS as POOL, M, R, RIM, TAU_RASTER, V as VR, loud, say as tell, sight, surface, turned, turning, vortex as whirl } from './wrap'
import { LOOK } from '../gpu/phosphor'
import { Board, Say } from './say'
import { TAU, cam, clamp, glide, hash, lock, mix, smooth, view, type Scene } from './scene'

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
const open = (x: number, t: number) => clamp(lock([[0, 0], [opens(x), 1]], t, 7, 0.55), 0, 1.25)

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
const FAR = 8.5
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
const WHITE = [0.9, 0.95, 1] as const, CYAN = [0.1, 0.95, 0.9] as const
const L = (src: string, c: readonly number[], at: number) => ({ src, c, at, vals: [0, 0, 0, 0], hot: 0 })
const RIVER = L('\\theta(s) = \\num{0}{0.00} \\sin(2\\pi s / 13) + \\num{1}{0.00} \\sin(2\\pi s / 41 + 1.1)', WATER, 0)
const OPEN = L('w(x, t) = W(x)\\, L(t - 0.25 - 0.03 (x + 12)),\; x_f = \\num{0}{-00.0}', WATER, 0.3)
const LAND = L('T(x, z) = \\sum_k |k|^{-1.05} \\cos(k \\cdot r + \\phi_k),\; x_i = \\num{0}{-00.0}', INK, 1.5)
const WALL = L('y = y_r + (6 + 3 \\sin(0.05 x + 1) + 2 \\sin(0.13 x))\\, S(d)^{1.4} + T', INK, 2.2)
const FLOWS = L('u = 1.2 (1 - d^2)\\, s + \\sum_j \\Gamma_j \\frac{y \\times r_j}{|r_j|^2} + 0.5\\, \\nabla \\times T', WATER, 0.6)
const WAVES = L('\\eta = 0.035 \\sin(3.1 x + 1.7 z + \\num{0}{0.00}) + 0.025 \\sin(3.7 z - 2.3 x + \\num{1}{0.00})', WATER, 3)
const FIRS = L('x(y) = 0.3 H (1 - y / H)^{0.9}\\, tri(\\pi n y / H),\; N = \\num{0}{000}', PINE, 4)
const PEAKS = L('h(z) = 20 \\log_{10} |S(e^{i \\omega})|', INK, 6)
const SPRAY = L('(x, y) = (x_0 + v_x \\tau,\; y_0 + v_y \\tau - 3.5 \\tau^2)', WHITE, 2)
const EYE = L('eye = (\\num{0}{-00.0}, \\num{1}{-00.0}, \\num{2}{-00.0})', WHITE, 5.2)
// From the lip on one equation is told at a time, each growing out of the last (wrap.ts say): the lip's
// critical flow, the fall, the plot the falling water is, and then the vortex's own.
const FROUDE = 'Fr^2 = \\frac{v^2}{g h}', BALLISTIC = 'y = y_l - \\frac{1}{2} g \\tau^2', STFT = 'S(f, t) = |\\sum_n x[n]\\, w[n - t H]\\, e^{-i 2 \\pi f n / N}|'
const STONE = [1, 0.8, 0.45] as const
const MODEM = L('E_s / N_0 = \\num{0}{-00.0}\\,dB,\; M = \\num{1}{00},\; \\Delta f = \\num{2}{-000}\\,Hz', STONE, ON)
const RAIN = L('A = 0.0239\\, R^{1.18} L,\; R = \\num{0}{00.0}\\,mm/h', INK, 6)
const board = new Board([RIVER, OPEN, FLOWS, LAND, WALL, WAVES, SPRAY, FIRS, MODEM, EYE, PEAKS, RAIN])
const say = new Say()
export const RIVER_EQ = '\\theta(s) = \\omega_1 \\sin(2\\pi s / M_1) + \\omega_2 \\sin(2\\pi s / M_2 + \\phi)'
let ceil = 1 // nothing of the land is drawn above this: the board's room
let grown = 0 // firs standing, counted as they are drawn

// ── each frame ──────────────────────────────────────────────────────────────────────────────────────
const SCAN = 1.2, SCAN_DUR = 3.2
const EXPOSE = 1000 // the drawn length, in screen units, the valley is exposed for // rows rise in a wave rolling downstream
const HB = 1024, horizon = new Float32Array(HB)
const p3 = { x: 0, y: 0, z: 0 }, q3 = { x: 0, y: 0, z: 0 }
const sx = new Float32Array(NC), sy = new Float32Array(NC), sz = new Float32Array(NC), ok = new Uint8Array(NC)
const ink = new Path(), line = new Path()
const HERO = 4096, hx = new Float32Array(HERO), hy = new Float32Array(HERO)
let heroN = 0, heroGain = 0.7, occlude = 1, landK = 1, lp = 0, hl = 0, hr = 0 // lp: the roar's low-pass state; hl, hr: the hero's

// The flight: one continuous path, eye, target and lens gliding through these without stopping. Straight
// down on the map the meander drew; a crane up and back as the valley rises; downstream over the firs;
// down to the pool as its stones lock, low over it through the rain and up as the sky clears; low and
// fast down the river to the lip; over it and round in an arc to face the falls, held there on the plot
// they have become; then up and over as it pours down into the plunge pool below (wrap.ts).
const MAP_FOV = 1.1
const on = (x: number, h: number, dz: number, tx: number, fov: number) => [x, riverY(x) + h, riverZ(x) + dz, tx, riverY(tx), riverZ(tx), fov]
const KEYS: number[][] = [
  [0, 0, 0, 0, 0, 0, 0, 0], // the map, framed each frame to the screen
  [1.2, 0, 0, 0, 0, 0, 0, 0], // held while the line opens into a river
  [3.6, X0 - 5, riverY(0) + 15, riverZ(0) - 9, 22, riverY(22), riverZ(22), 1],
  [5.6, ...on(2, 7.5, 6, SC, 0.95)], // down toward the pool as the carrier locks
  [7, ...on(SC - 5.5, 2.8, -2.5, SC + 1, 1.05)], // low over the water, in the worst of the rain
  [8.4, ...on(SC - 4, 6, 3.5, SC + 3, 1.05)], // up over the stones as the sky clears and they multiply
  [9.3, ...on(SC + 9, 8, 3, 42, 1)],
  [10.5, ...on(43, 6.5, 0, 57, 1)],
  // low and fast to the lip, the shaft opening ahead; over it with the water, looking down the fall at the
  // pool; down inside the curtain as fast as it falls, so the plot hangs still round us; out over the pool
  // at its foot to see it lip to foot; and up, to look down on the disc the spectrum makes (wrap.ts flies on)
  [11.2, 55.5, YL + 2.6, riverZ(55.5), LIP + 22, YL - 9, ZL, 1.05],
  [11.7, LIP - 0.4, YL + 1.5, ZL, LIP + 13, YL - 20, ZL, 1.1],
  [12.35, LIP + 4.6, YL - 1.6, ZL + 0.4, SX - 2, YP, SZ, 1.2],
  [13.2, SX - 6, YL - 9.5, SZ + 1.5, LIP + 3, YL - 12, ZL, 1.1],
  [14.3, SX - 3, YL - 21, SZ - 1, LIP + 4, YL - 22, ZL - 2, 1.05],
  [15.4, SX + 4, YP + 1.8, SZ + 2, SX - 13, YP + 13, SZ, 1.1],
  [16.8, SX + 5, YP + 8, SZ - 7, SX - 5, YP + 3, SZ + 1, 1.05],
]
// Straight down on the stretch the meander drew, framed as it framed it.
function framed(k: number[]) {
  let lo = Infinity, hi = -Infinity, y = 0, n = 0
  for (let x = X0; x <= XM; x += 0.5) (lo = Math.min(lo, riverZ(x))), (hi = Math.max(hi, riverZ(x))), (y += riverY(x)), n++
  const xc = (X0 + XM) / 2, zc = (lo + hi) / 2, D = (XM - X0) / 2 / Math.tan(MAP_FOV / 2) / (0.9 * view.a)
  k[1] = xc, k[2] = y / n + D, k[3] = zc + 0.05 * D, k[4] = xc, k[5] = y / n, k[6] = zc, k[7] = MAP_FOV
}
const eye = { x: 0, y: 0, z: 0 }, cur: number[] = [], fwd = { x: 1, y: 0 }
function crane(t: number) {
  framed(KEYS[0]), framed(KEYS[1])
  glide(KEYS, t, cur)
  eye.x = cur[0], eye.y = cur[1], eye.z = cur[2]
  cam.aim(cur[0], cur[1], cur[2], cur[3], cur[4], cur[5], cur[6])
  const L = Math.hypot(cur[3] - cur[0], cur[4] - cur[1], cur[5] - cur[2])
  fwd.x = (cur[3] - cur[0]) / L, fwd.y = (cur[4] - cur[1]) / L
  // a floating horizon only means something while we look across the land, downstream
  occlude = smooth(0.4, 0.75, fwd.x) * smooth(-0.9, -0.7, fwd.y)
}

// The river on the map, as the meander must leave it: the same stretch through the same lens. map() aims
// the camera there, and SPRING is where the river begins.
export const MEANDER = 4.2 // how long the meander runs before us: its current's phase carries on from there
export const glow = (u: number, t: number) => 0.65 + 0.35 * Math.cos(TAU * (6 * u - 2.5 * t))
export const SPRING = X0, map = () => crane(0)
export const reach = (x: number) => (x - X0) / (XM - X0) // 0 at the spring, 1 where the meander's three bends end

// The land on the map: contour lines every CI metres above the water, LEVELS to a bank. Each is where a
// walk straight out from the river first stands that high, so they nest and never cross; the lowest is
// the bank itself. contour() is the z of level l on a side (±1) at x, NaN where the land never gets there.
export const LEVELS = 14
const CI = 0.35, CDX = 0.2, CN = Math.ceil((XM + 8 - X0) / CDX) + 1, CZ = new Float32Array(2 * LEVELS * CN).fill(NaN)
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
const visible = (x: number, y: number) => y < ceil && (occlude < 0.5 || y > horizon[col(x)] - 0.002)
function raise(x0: number, y0: number, x1: number, y1: number) {
  let a = col(x0), b = col(x1)
  if (a > b) [a, b, x0, y0, x1, y1] = [b, a, x1, y1, x0, y0]
  for (let c = a; c <= b; c++) {
    const y = b > a ? y0 + ((y1 - y0) * (c - a)) / (b - a) : Math.max(y0, y1)
    if (y > horizon[c]) horizon[c] = y
  }
}
const fog = (z: number) => Math.min(1, 0.25 + 0.9 * z)

// Draws one world-space segment if both ends clear the horizon.
function seg(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, c: readonly number[], i: number) {
  if (!cam.project(x0, y0, z0, p3) || !cam.project(x1, y1, z1, q3)) return
  if (!visible(p3.x, p3.y) || !visible(q3.x, q3.y)) return
  ink.color(c[0], c[1], c[2], i * fog(p3.z) * landK).moveTo(p3.x, p3.y).lineTo(q3.x, q3.y)
}

function items_(t: number, upto: number, next: { i: number }) {
  for (; next.i < items.length && items[next.i].x < upto; next.i++) {
    const it = items[next.i]
    if (t < it.t0) continue
    const k = clamp(lock([[0, 0], [it.t0, 1]], t, 7, 0.45), 0, 1.3)
    let pen = false
    for (let v = 0; v < it.n; v++) {
      const o = 3 * (it.a + v), wv = it.kind === FLOW ? wave(VX[o], VX[o + 2], t) : 0, y = it.kind === FLOW ? VX[o + 1] + wv : it.base + (VX[o + 1] - it.base) * k
      let px = VX[o], pz = VX[o + 2] + 1.5 * wv
      if (it.kind === FLOW) pz = riverZ(px) + (pz - riverZ(px)) * Math.min(1, open(px, t))
      if (!cam.project(px, y, pz, p3) || !visible(p3.x, p3.y)) {
        pen = false
        continue
      }
      let g = it.kind === HATCH ? 0.5 : 1
      if (it.kind === FLOW) {
        const head = (t * 0.55 + rnd(it.a)) % 1, u = (v / (it.n - 1) - head + 1) % 1
        g = (0.04 + 0.5 * Math.exp(-u * 9) * k) * (1 + 3 * Math.exp(-(t - it.t0) / 0.4)) // bright at the head, trailing back upstream; flaring as it opens
      }
      ink.color(it.c[0], it.c[1], it.c[2], fog(p3.z) * g * landK)
      if (it.kind === TREE && it.n > 2 && !v && k >= 1) grown++
      pen ? ink.lineTo(p3.x, p3.y) : ink.moveTo(p3.x, p3.y)
      pen = true
    }
  }
}

// White water: at each cascade a foam lip curling across the river, and spray thrown downstream on
// ballistic arcs, each droplet a parabola; around each stone, ripple rings running outward.
const G = 7
function whitewater(t: number, xc: number) {
  const y0 = riverY(xc - 0.3), zc = riverZ(xc), w = wide(xc), on = smooth(opens(xc), opens(xc) + 1.5, t) * landK
  for (let k = 0; k < 7; k++) {
    let pen = false
    for (let j = 0; j <= 24; j++) {
      const u = j / 24 - 0.5, curl = 0.08 * Math.sin(TAU * (u * 3 + t * 1.3 + k * 0.4))
      if (!cam.project(xc + 0.1 * k + curl, y0 - 0.06 * k + wave(xc, zc + u * 2 * w, t), zc + u * 2 * w * 0.98, p3) || !visible(p3.x, p3.y)) {
        pen = false
        continue
      }
      ink.color(0.85, 0.95, 1, on * (1 - k / 8) * fog(p3.z))
      pen ? ink.lineTo(p3.x, p3.y) : ink.moveTo(p3.x, p3.y)
      pen = true
    }
  }
  for (let d = 0; d < 90; d++) {
    const life = 0.9 + 0.5 * rnd(d * 3 + xc), age = ((t + life * rnd(d * 7 + xc)) % life)
    const vx = 1.2 + 1.5 * rnd(d + xc), vy = 1 + 2.2 * rnd(d * 5 + xc), vz = (rnd(d * 11 + xc) * 2 - 1) * 1.2, z0 = zc + (rnd(d * 13 + xc) * 2 - 1) * w
    const at = (a: number) => cam.project(xc + vx * a, y0 + vy * a - 0.5 * G * a * a, z0 + vz * a, p3)
    if (!at(age) || !visible(p3.x, p3.y)) continue
    const x1 = p3.x, y1 = p3.y
    if (!at(Math.max(0, age - 0.05))) continue
    ink.color(0.9, 0.97, 1, on * (1 - age / life) * fog(p3.z)).moveTo(p3.x, p3.y).lineTo(x1, y1)
  }
}
// The shaft. The river goes over its rim all the way round and falls, a curtain of drops each carrying the
// spectrum of the moment it went over (the true STFT of what the speakers are playing): the droplets are
// drops.wgsl's, placed in the pool's own units (wrap.ts), and what the pen draws of the shaft is here. Its
// rock, in flutes down the wall and broken strata round it; its rim, heaving with the spectrum going over
// it now, angle for log-frequency; the moat's outer bank; and the pool at its foot, hatched along the
// streamlines of the vortex turning there, r = Re^(−βt) wound by Φ(r).
const toPool = (x: number, y: number, z: number, o: number[]) => ((o[0] = (z - SZ) / M), (o[1] = (x - SX) / M), (o[2] = (y - YP) / M))
const WE = [0, 0, 0], WT = [0, 0, 0], UP = [0, 0, 1]
const fromPool = (k: number[]) => [k[0] + DUR, SX + M * k[2], YP + M * k[3], SZ + M * k[1], SX + M * k[5], YP + M * k[6], SZ + M * k[4], k[7]]
KEYS.push(...POOL.map(fromPool)) // on down into the pool: the whirlpool's own flight, so it goes on unbroken
type Stroke = { a: number; n: number; kind: number; x: number }
const SV: number[] = [], rock: Stroke[] = [], rims: Stroke[] = []
const RIMK = 0, BANK = 1
const stroke = (list: Stroke[], pts: number[], kind = 0) => (list.push({ a: SV.length / 3, n: pts.length / 3, kind, x: pts[0] }), SV.push(...pts))
const crag = (a: number, y: number) => 0.9 * Math.abs(field.at(a * 21, y * 0.8)) + 0.35 * Math.abs(field.at(a * 77, y * 2.3)) // the wall's roughness, outward
for (let j = 0; j < 170; j++) {
  const a = (TAU * (j + rnd(j * 3 + 8000))) / 170, top = YL - 24 * rnd(j * 5 + 8001) ** 2, len = 4 + 22 * rnd(j * 7 + 8002), pts: number[] = []
  for (let k = 0; k <= 10; k++) {
    const y = Math.max(YP, top - (len * k) / 10), r = RR + crag(a, y)
    pts.push(SX + r * Math.cos(a), y, SZ + r * Math.sin(a))
  }
  stroke(rock, pts)
}
for (let l = 0; l < 16; l++)
  for (let k = 0; k < 60; k++) {
    if (rnd(l * 61 + k * 3 + 8100) > 0.7) continue // ledges, broken
    const pts: number[] = []
    for (let i = 0; i <= 4; i++) {
      const a = (TAU * (k + i / 4)) / 60, y = YL - 1 - (27 * (l + rnd(l + 8200))) / 16 + 0.3 * field.at(a * 9, l * 3.1), r = RR + crag(a, y)
      pts.push(SX + r * Math.cos(a), y, SZ + r * Math.sin(a))
    }
    stroke(rock, pts)
  }
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
// What is down the shaft is seen from over its rim only through its mouth.
function through(x: number, y: number, z: number) {
  if (eye.y <= YL) return true
  const k = (eye.y - YL) / (eye.y - y)
  return Math.hypot(eye.x + (x - eye.x) * k - SX, eye.z + (z - eye.z) * k - SZ) < RR
}
// The rim and the moat's bank, up to x, in their place in the sweep.
let heave = 0
function rim(upto: number, next: { i: number }, k: number) {
  for (; next.i < rims.length && rims[next.i].x < upto; next.i++) {
    const it = rims[next.i]
    let pen = false
    for (let v = 0; v < it.n; v++) {
      const o = 3 * (it.a + v), x = SVX[o], z = SVX[o + 2], lv = it.kind ? 0 : loud(lane(Math.atan2(z - SZ, x - SX)))
      if (!cam.project(x, SVX[o + 1] + 0.9 * heave * lv, z, p3) || !framed_() || !visible(p3.x, p3.y)) {
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
// The rock down the wall, and the pool: hatched along its streamlines, each with a brighter stretch running in.
function shaft(t: number, k: number, hatch: number) {
  const grow = clamp(lock([[0, 0], [FAR + 0.4, 1]], t, 7, 0.45), 0, 1.2)
  for (const it of rock) {
    let pen = false
    for (let v = 0; v < it.n; v++) {
      const o = 3 * (it.a + v), y = YL + (SVX[o + 1] - YL) * grow
      if (!through(SVX[o], y, SVX[o + 2]) || !cam.project(SVX[o], y, SVX[o + 2], p3) || !framed_() || p3.y > ceil) {
        pen = false
        continue
      }
      ink.color(INK[0], INK[1], INK[2], (it.n > 5 ? 0.05 : 0.1) * k * fog(p3.z) * grow)
      pen ? ink.lineTo(p3.x, p3.y) : ink.moveTo(p3.x, p3.y)
      pen = true
    }
  }
  for (let j = 0; j < 30 && hatch > 0.02; j++) {
    const head = (0.3 * t + rnd(j * 3 + 8500)) % 1
    let pen = false
    for (let i = 0; i <= 32; i++) {
      const u = i / 32, r = RIM * 0.98 * Math.exp(-3.4 * u), a = (TAU * j) / 30 + turned(Math.min(r, R)) + 0.25 * Math.sin(3 * u + j)
      const x = SX + M * r * Math.cos(a), y = YP + M * surface(r) + 0.03, z = SZ + M * r * Math.sin(a)
      if (!through(x, y, z) || !cam.project(x, y, z, p3) || !framed_() || p3.y > ceil) {
        pen = false
        continue
      }
      ink.color(WATER[0], WATER[1], WATER[2], hatch * fog(p3.z) * (0.08 + 0.7 * Math.exp(-((u - head + 1) % 1) * 7)))
      pen ? ink.lineTo(p3.x, p3.y) : ink.moveTo(p3.x, p3.y)
      pen = true
    }
  }
}

// The pool: the modem's I/Q plane lying on the water (modem.ts), I downstream, Q across. Every point of its
// constellation is a stone with rings running out from it; every symbol decided is a splash where the
// receiver saw it land, so the worse the weather the wider they scatter; and skimming between them is the
// wire itself, the last few milliseconds of what the speakers are playing. Unlocked, that is a ring.
const RW = 2.2, PY0 = riverY(SC) + 0.04, PZ0 = riverZ(SC)
const st = { i: 0, q: 0, a: 0 }, dc = { i: 0, q: 0 }
const si = new Float64Array(STONES), sq = new Float64Array(STONES), sa = new Float64Array(STONES), round = new Uint8Array(STONES)
let slip = 0, standing = 0
// Where every stone is now, turned as the carrier is; and the ones standing, in order round the pool,
// which is the order the speakers visit them in.
function place_(t: number) {
  const ph = turn(t, slip), c = Math.cos(ph), s = Math.sin(ph)
  standing = 0
  for (let n = 0; n < STONES; n++) {
    stone(n, t, st)
    si[n] = st.i * c - st.q * s, sq[n] = st.i * s + st.q * c, sa[n] = st.a
    if (st.a > 0.5) round[standing++] = n
  }
  round.subarray(0, standing).sort((a, b) => Math.atan2(sq[a], si[a]) - Math.atan2(sq[b], si[b]))
}
const wet = (i: number, q: number) => cam.project(SC + RW * i, PY0, PZ0 + RW * q, p3) && visible(p3.x, p3.y)
function stones(t: number) {
  const k0 = Math.floor(t * RS), on = landK * smooth(ON, ON + 0.3, t)
  for (let n = 0; n < STONES; n++) {
    if (sa[n] < 0.02) continue
    const i = si[n], q = sq[n]
    for (let ring = 0; ring < 3; ring++) {
      const u = ring > 1 ? (0.9 * t + 0.37 * n) % 1 : 0, r = ring > 1 ? 0.11 + 0.3 * u : (ring ? 0.06 : 0.11) * sa[n]
      ink.color(STONE[0], STONE[1], STONE[2], on * sa[n] * (ring > 1 ? 0.45 * (1 - u) : 1.8))
      let pen = false
      for (let j = 0; j <= 12; j++) {
        const a = (j / 12) * TAU
        if (!wet(i + r * Math.cos(a), q + r * Math.sin(a))) {
          pen = false
          continue
        }
        pen ? ink.lineTo(p3.x, p3.y) : ink.moveTo(p3.x, p3.y)
        pen = true
      }
    }
  }
  // talking, the wire is a scribble: keep only a moment of it, faint, under the stones
  const m = smooth(ON + 0.7, ON + 1.2, t)
  ink.color(WATER[0], WATER[1], WATER[2], mix(0.6, 0.14, m) * on)
  let pen = false
  for (let j = 0; j < 160; j++) {
    signal(t - mix(0.003, 0.001, m) * (1 - j / 159), slip)
    if (!wet(sig.i, sig.q)) {
      pen = false
      continue
    }
    pen ? ink.lineTo(p3.x, p3.y) : ink.moveTo(p3.x, p3.y)
    pen = true
  }
  for (let a = 0; a < 420 && (k0 - a) / RS > ON + 1.2; a++) {
    const lit = decision(k0 - a, slip, dc) === Kind.Data ? 0.8 : 1.5 // headers and pilots are the receiver's references: hotter
    if (wet(dc.i, dc.q)) ink.color(WHITE[0], WHITE[1], WHITE[2], 1.6 * on * lit * (1 - a / 420)).dot(p3.x, p3.y, 0.006)
  }
}

// Rain: streaks falling through the valley, as many as the rain is heavy, each in its place in the depth
// of the picture so the land in front of it hides it.
const DROPS = 2600, RX = Float32Array.from({ length: DROPS }, (_, d) => -8 + 66 * rnd(d * 3 + 1)).sort()
function drop(d: number, t: number, heavy: number) {
  const x = RX[d]
  if (rnd(d * 11 + 5) > heavy || x < eye.x + 1.5) return
  const z = riverZ(x) + (2 * rnd(d * 5 + 2) - 1) * 12, y = riverY(x) + 13 - ((9 * t + 13 * rnd(d * 7 + 3)) % 13)
  if (y > height(x, z)) seg(x, y, z, x + 0.2, y + 0.8, z, INK, 0.6)
}

// The firs, loudest first: the speakers follow one at a time, the newest every ninth of a second. A fir is a
// triangle wave, so each is a pitch, the number of its teeth times the rate it is retraced at.
const FIR = items.map((it, i) => (it.kind === TREE && it.n > 2 ? i : -1)).filter((i) => i >= 0).sort((a, b) => items[a].t0 - items[b].t0)
function newest(t: number) {
  const q = Math.floor(t * 9) / 9
  let it = items[FIR[0]]
  for (const i of FIR) if (items[i].t0 <= q) it = items[i]
  for (let v = 0; v < it.n; v++) if (cam.project(VX[3 * (it.a + v)], VX[3 * (it.a + v) + 1], VX[3 * (it.a + v) + 2], p3)) (hx[heroN] = p3.x), (hy[heroN++] = p3.y)
}

// The speakers retrace their trace at a note, not a hum: harmonics of the river's 55 Hz, [from, harmonic],
// 4 : 5 : 6 a major chord, climbing it as we run for the lip. (The firs bring their own pitch, so they are
// retraced slowly.) The phase is carried across each change, so the trace never jumps.
const NOTES = [[0, 4], [1.2, 4], [1.65, 6], [2.1, 8], [2.55, 6], [3, 0.5], [8.7, 4], [9.15, 5], [9.6, 6], [10.05, 8], [10.5, 10], [10.95, 12], [11.4, 1]] // and over the lip it is the river's own hum again, under the roar
const CYC = [0]
for (let i = 1; i < NOTES.length; i++) CYC.push(CYC[i - 1] + 55 * NOTES[i - 1][1] * (NOTES[i][0] - NOTES[i - 1][0]))
function cycles(tt: number) {
  let i = NOTES.length - 1
  while (i > 0 && tt < NOTES[i][0]) i--
  return CYC[i] + 55 * NOTES[i][1] * (tt - NOTES[i][0])
}
// At the pool the note is the modem's: the fewer the stones, the lower, down to the hook's own 110 Hz.
const TONES = STEPS.map(([t, c]) => [t, { 4: 2, 8: 3, 16: 4, 32: 6 }[c.pts.length / 2] ?? 4])
const PCYC = [0]
for (let i = 1; i < TONES.length; i++) PCYC.push(PCYC[i - 1] + 55 * TONES[i - 1][1] * (TONES[i][0] - TONES[i - 1][0]))
function rounds(tt: number) {
  let i = TONES.length - 1
  while (i > 0 && tt < TONES[i][0]) i--
  return PCYC[i] + 55 * TONES[i][1] * (tt - TONES[i][0])
}
let pl = 0, pr = 0 // the pool's low-pass state

export const valley: Scene = {
  dur: DUR,
  build(t, f) {
    crane(t)
    ink.clear(), (heroN = 0), (grown = 0)
    horizon.fill(-9)
    const next = { i: 0 }, edge = { i: 0 }, behind = occlude > 0.5 ? eye.x + 0.3 : -Infinity, heavy = rain(t) / 45
    let heroRow = -1, nd = 0, pooled = t < ON
    slip = chase(t)
    if (t > ON) place_(t)
    const land = (landK = 1 - smooth(11.9, 12.5, t)) // under the rim the land is out of sight: only the shaft's rock is left
    const T = t - DUR, lit = smooth(11.2, 12.3, t), wall = smooth(FAR, FAR + 1, t) * (1 - smooth(12.3, 13.3, t)) // the rock's ink, until the falls are between us and it
    const brim = smooth(FAR, FAR + 1, t) * (1 - smooth(18.4, DUR, t))
    heave = smooth(8, 10, t)

    // strokes too faint to see would still cost the beam its time: once the valley is gone, skip it
    for (let i = 0; i < (t > FAR ? NT : NR) && land > 0.06; i++) {
      const x = rowX(i), x0 = rowX(i - 1), rise = clamp(lock([[0, 0], [i < NR ? SCAN + (i / NR) * SCAN_DUR : FAR + (0.8 * (i - NR)) / NB, 1]], t, 7, 0.45), 0, 1.35)
      if (x < behind) continue
      items_(t, x, next)
      rim(x, edge, brim)
      if (!pooled && x > SC - 3.2) (pooled = true), stones(t)
      for (; heavy > 0 && nd < DROPS && RX[nd] < x; nd++) drop(nd, t, heavy)
      for (const c of CASCADES) if (c >= x0 && c < x && t > opens(c)) whitewater(t, c)
      // the banks and the current, from the last row to this one
      if (i > 0 && i < NR && x0 >= behind && t > opens(x0)) {
        const y0 = riverY(x0), y1 = riverY(x), w0 = wide(x0) * open(x0, t), w1 = wide(x) * open(x, t)
        for (const side of [-1, 1]) seg(x0, y0, riverZ(x0) + side * w0, x, y1, riverZ(x) + side * w1, WATER, 0.9)
      }
      if (rise <= 0) continue
      // the cross-section, risen from the river's level, drawn where it clears the horizon
      const o = i * NC, base = riverY(x)
      for (let j = 0; j < NC; j++) {
        ok[j] = cam.project(x, base + (RH[o + j] - base) * rise, RZp[o + j], p3) ? 1 : 0
        sx[j] = p3.x, sy[j] = p3.y, sz[j] = p3.z
      }
      const index = (i % 8 === 0 ? 1 : 0.6) * Math.min(1, rise * 2.5) * land
      let pen = false
      for (let j = 0; j < NC; j++) {
        const water = RK[o + j] === 1
        if (!ok[j] || !visible(sx[j], sy[j]) || (water && i % 3) || RK[o + j] > 1) {
          pen = false
          continue
        }
        const c = water ? WATER : INK
        ink.color(c[0], c[1], c[2], index * fog(sz[j]) * (water ? 0.25 : 1))
        pen ? ink.lineTo(sx[j], sy[j]) : ink.moveTo(sx[j], sy[j])
        pen = true
      }
      if (t >= SCAN && rise < 1.2) heroRow = i
      for (let j = 1; j < NC; j++) if (ok[j] && ok[j - 1] && RK[o + j] < 2 && RK[o + j - 1] < 2) raise(sx[j - 1], sy[j - 1], sx[j], sy[j])
      if (heroRow === i && t < 3) for (let j = 0; j < NC && heroN < HERO; j++) if (ok[j]) (hx[heroN] = sx[j]), (hy[heroN++] = sy[j])
    }
    if (land > 0.06) items_(t, Infinity, next)
    // the contours the meander's rivers combed out onto, carried on at their own heights, so they tilt with the land
    // as we crane up, and give way as its cross-sections rise
    const cl = 0.2 * (1 - smooth(1, 2.6, t))
    if (cl > 0.01)
      for (const side of [-1, 1])
        for (let l = 0; l < LEVELS; l++) {
          let pen = false
          ink.color(INK[0], INK[1], INK[2], cl)
          for (let x = X0; x < XM + 8; x += 0.4) {
            const z = contour(side, l, x)
            if (z !== z || !cam.project(x, riverY(x) + (l + 0.5) * CI, z, p3)) {
              pen = false
              continue
            }
            pen ? ink.lineTo(p3.x, p3.y) : ink.moveTo(p3.x, p3.y)
            pen = true
          }
        }
    rim(Infinity, edge, brim)
    if (wall > 0) shaft(t, wall, 1 - 0.8 * smooth(12.6, 14, t))
    if (t >= 3 && t < ON + 0.3) newest(t)
    // nothing new growing: the speakers trace the river itself, from under us to the lip
    if (heroN < 2 && t >= SCAN && land > 0.06)
      for (let x = Math.max(X0, eye.x + 1); x < LIP && heroN < HERO; x += 0.3)
        if (cam.project(x, riverY(x), riverZ(x), p3)) (hx[heroN] = p3.x), (hy[heroN++] = p3.y)
    heroGain = t < SCAN ? 0.3 : t < 3 ? 0.7 : t < ON + 0.3 ? 1 : 0.4 // a ridge or one far fir carries less than the river does
    // the shaft's printer runs from early on, so the water has its history when it shows; its drops fall
    // from when we run for the lip, its water is lit as we come over, and both turn from water to the plot
    // as we ride down with them
    if (t > 4.5) {
      whirl(T, (f.at ?? 0) + t, f, lit, smooth(12.7, 14, t), smooth(10.2, 11, t), mix(0.35, 1, smooth(11, 12, t))) // fewer drops while they are far off
      toPool(cur[0], cur[1], cur[2], WE), toPool(cur[3], cur[4], cur[5], WT)
      WT[0] -= WE[0], WT[1] -= WE[1], WT[2] -= WE[2]
      sight(WE, WT, UP, cur[6])
      f.look = lit > 0 ? { tau: mix(LOOK.tau, TAU_RASTER, smooth(0, 0.2, lit)) } : undefined
    }
    // over the edge the speakers trace the rim, the spectrum going over it, until the choir takes over
    if (heroN < 2 && t > 6)
      for (let j = 0; j < 96 && heroN < HERO; j++) {
        const a = (TAU * j) / 96
        if (cam.project(SX + RR * Math.cos(a), YL + 0.9 * loud(lane(a)), SZ + RR * Math.sin(a), p3)) (hx[heroN] = p3.x), (hy[heroN++] = p3.y) // heard even where it is out of frame
      }
    // exposure: the ink is energy per length, so as the valley fills in it would burn brighter and
    // brighter; past a reference length, stop down, as an eye or a camera would
    const stop = Math.min(1, (EXPOSE / Math.max(1, ink.len)) ** 0.7)
    for (let i = 2; i < ink.v.length; i += STRIDE) ink.v[i] *= stop
    f.ch.push({ w: 1, path: ink })

    // the line the meander drew, still running, until the river it became has opened all along it
    const fade = 1 - smooth(0.8, 2.6, t)
    if (fade > 0) {
      line.clear()
      let pen = false
      for (let x = X0; x < LIP; x += 0.1) {
        const k = 1 - smooth(opens(x) - 0.2, opens(x) + 0.6, t)
        if (k <= 0 || !cam.project(x, riverY(x), riverZ(x), p3)) {
          pen = false
          continue
        }
        line.color(WATER[0], WATER[1], WATER[2], glow((x - X0) / (XM - X0), t + MEANDER) * k)
        pen ? line.lineTo(p3.x, p3.y) : line.moveTo(p3.x, p3.y)
        pen = true
        if (t < SCAN && heroN < HERO) (hx[heroN] = p3.x), (hy[heroN++] = p3.y)
      }
      f.ch.push({ w: fade, path: line })
    }
    // the equations: the meander's carries on a moment, then the board of everything takes over
    if (t < 0.6) say.say(f, t, RIVER_EQ, WATER, [['\\omega_1', W1, 2], ['\\omega_2', W2, 2], ['M_1', M1, 0], ['M_2', M2, 0]], 1 - smooth(0, 0.6, t))
    const hero = t < SCAN ? 0 : t < 3 ? 1 : t < ON ? 2 : t < 8.7 ? 4 : 3 // what the speakers are tracing: river, land, firs, the river to the falls, the pool
    RIVER.vals[0] = W1, RIVER.vals[1] = W2, RIVER.hot = +(hero === 0)
    OPEN.vals[0] = clamp(X0 + (t - 0.25) / 0.03, X0, LIP), OPEN.hot = 1 - smooth(2, 3.5, t)
    LAND.vals[0] = rowX(Math.max(0, heroRow)), LAND.hot = +(hero === 1)
    FIRS.vals[0] = grown, FIRS.hot = +(hero === 2)
    WAVES.vals[0] = (7 * t) % TAU, WAVES.vals[1] = (5.3 * t) % TAU, WAVES.hot = FLOWS.hot = 0.4
    EYE.vals[0] = eye.x, EYE.vals[1] = eye.y, EYE.vals[2] = eye.z, EYE.hot = 0.3
    MODEM.vals[0] = esn0(t), MODEM.vals[1] = order(t), MODEM.vals[2] = offset(t), MODEM.hot = +(hero === 4)
    RAIN.vals[0] = rain(t), RAIN.hot = heavy
    // running for the lip the board gives way to one equation at a time: the water goes critical at the rim
    // (Fr = 1, where it runs as fast as its own waves), falls, is the plot, and turns
    const hand = smooth(10.6, 11.2, t)
    ceil = mix(board.show(f, t, smooth(0.2, 0.8, t) * (1 - hand)), 1, hand)
    if (t > 11 && t < 12.2) {
      const fr = mix(0.4, 1, smooth(46, LIP, eye.x)), h = (1.44 / (GF * fr * fr)) ** (1 / 3) // q = vh = 1.2 m²/s the whole way
      tell.say(f, T, FROUDE, WATER, [['v', 1.2 / h, 2], ['h', h, 2], ['Fr', fr, 2]], smooth(11, 11.4, t))
    } else if (t >= 12.2 && t < 13.5) {
      const tau = Math.sqrt((2 * Math.max(0, YL - eye.y)) / GF)
      tell.say(f, T, BALLISTIC, WHITE, [['g', GF, 1], ['\\tau', tau, 2], ['y_l - y', YL - eye.y, 1]])
    } else if (t >= 13.5 && t < 16.2) tell.say(f, T, STFT, CYAN, [['t', (f.at ?? 0) + t, 2], ['N', 4096, 0], ['H', 100, 0]])
    else if (t >= 16.2) turning(f, T)

    f.rate = mix(2.4e6, 7.2e6, smooth(1, 8, t))
    if (t > SING) place(t - SING)
    // autoset, as a scope does: whatever is traced fills the speakers' range, however small it is on screen
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
    for (let i = 0; i < heroN; i++) (x0 = Math.min(x0, hx[i])), (x1 = Math.max(x1, hx[i])), (y0 = Math.min(y0, hy[i])), (y1 = Math.max(y1, hy[i]))
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, fit = 1.8 / Math.max(hero === 2 ? 0.05 : 0.3, x1 - x0, y1 - y0) // a far fir is small
    return (tt, o) => {
      // at the pool the speakers follow the wire while it is a bare carrier, its beat falling to nothing as
      // it locks; then the stones, round and round at the modem's note, landing on each where the receiver
      // saw it land. So a clear sky is a clean tone, rain is the grit in it, and four stones are a square wave.
      const wire = smooth(ON, ON + 0.25, tt) * (1 - smooth(8.5, 8.9, tt)), talk = smooth(ON + 0.7, ON + 1.2, tt)
      if (wire > 0) {
        let x = 0, y = 0
        if (talk < 1) signal(tt, slip), (x = (1 - talk) * sig.i), (y = (1 - talk) * sig.q)
        if (talk > 0 && standing) {
          const v = rounds(tt) * standing, n = round[Math.floor(v) % standing], sd = sigma(tt)
          x += talk * (si[n] + sd * hash(Math.floor(v) * 1.618)), y += talk * (sq[n] + sd * hash(Math.floor(v) * 2.414 + 7))
        }
        pl += (0.3 * wire * x - pl) * 0.4, pr += (0.3 * wire * y - pr) * 0.4
        o.l += pl, o.r += pr
      }
      // the falls are heard coming; at the lip everything holds its breath; over the edge the scope rule
      // ends, and they roar
      const hush = 1 - 0.9 * smooth(11.3, 11.5, tt) * (1 - smooth(11.75, 12.05, tt))
      if (tt > 6.5) { // on through the crossfade: the whirlpool takes the choir over smoothly (sing caches a repeated t)
        lp += (hash(tt * 48_000) - lp) * 0.04
        const roar = 0.5 * lp * smooth(8.6, 10.4, tt) * hush * (1 - 0.6 * smooth(12.8, 16.8, tt)) * (1 - smooth(17, DUR, tt))
        o.l += roar, o.r += roar
        if (tt > SING) sing(tt - SING, o) // silent until we go over, then fading in; on past the end, as the speakers run ahead
      }
      if (heroN < 2 || tt > 17.8) return
      const ph = (cycles(tt) % 1) * 2, u = (ph < 1 ? ph : 2 - ph) * (heroN - 1), i = Math.min(heroN - 2, Math.floor(u)), a = u - i
      const k = heroGain * (1 - wire) * hush * (1 - smooth(13.8, 17.8, tt))
      // a gentle low-pass (about 4 kHz) takes the edge off the traced corners
      hl += (k * fit * (hx[i] + (hx[i + 1] - hx[i]) * a - cx) - hl) * 0.4
      hr += (k * fit * (hy[i] + (hy[i + 1] - hy[i]) * a - cy) - hr) * 0.4
      o.l += hl, o.r += hr
    }
  },
}

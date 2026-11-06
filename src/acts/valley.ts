// The valley, drawn the way a pen draws it and made of signals. The meander the wave became is the
// river; the camera cranes down from the map to its bank and the land rises around it in a wave rolling
// upstream. The ground is a power-law field (spectral synthesis: random phases under |k|^−β, inverted)
// carved into a valley that climbs toward the peaks in cascades, and it is drawn as the pulsar plot was,
// cross-section after cross-section, front to back, each hidden behind the ones before it (a floating
// horizon, recomputed every frame). Firs are triangle waves under a tapering envelope; the far peaks are
// spectra; the stones in the shallows are 16APSK. What is being seeded is the hero: the speakers trace it
// and its equation is written live beneath the scene.
import { Path } from '../beam/path'
import { load, use } from '../beam/font'
import { fft, hann } from '../dsp/fft'
import { APSK16 } from '../dsp/dvbs2'
import { Field } from '../dsp/terrain'
import { sig, signal } from './receive'
import { place, sing } from './choir'
import { heard } from '../audio/audio'
import { Say, type Val } from './say'
import { TAU, cam, clamp, glide, hash, lock, mix, smooth, view, type Scene } from './scene'

use(await load('tech'))

const INK = [0.78, 0.88, 1] as const, PINE = [0.45, 1, 0.62] as const, WATER = [0.5, 0.78, 1] as const, STONE = [1, 0.8, 0.52] as const
const rnd = (n: number) => hash(n) * 0.5 + 0.5

// ── the river: a meander of two scales, skewed, climbing in cascades ─────────────────────────────────
const CASCADES = [10, 24, 38, 51] // where the river steps down
export const LIP = 62 // where the valley ends and the river pours off the edge
const STONES = 12, SC = 15 // when the stepping stones arrive, and the pool they arrive in
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
    RY[i] = -4 * (1 - Math.exp(-Math.max(0, x) / 30)) - CASCADES.reduce((a, c, j) => a + [0.6, 0.8, 0.7, 0.9][j] * smooth(c - 0.25, c + 0.25, x), 0) - 60 * smooth(LIP, LIP + 0.8, x)
  }
}
const idx = (x: number) => Math.max(0, Math.min(NX - 1, Math.round((x - X0) / DX)))
export const riverZ = (x: number) => RZ[idx(x)], riverY = (x: number) => RY[idx(x)]
const W0 = 1.6
const wide = (x: number) => W0 * (1 + 0.3 * Math.sin(0.21 * x + 0.4) + 0.2 * Math.sin(0.07 * x) + 1.6 * Math.exp(-(((x - SC) / 3.5) ** 2))) // narrows, pools

// ── the land ────────────────────────────────────────────────────────────────────────────────────────
const field = new Field(128, 2.1, 11)
function height(x: number, z: number) {
  const d = Math.abs(z - riverZ(x)), base = riverY(x), W = wide(x)
  if (d < W) return base
  const wall = (6 + 3 * Math.sin(0.05 * x + 1) + 2 * Math.sin(0.13 * x)) * smooth(W, 17, d) ** 1.4
  const rough = field.at(x * 0.7, z * 0.7) * (0.3 + 2.4 * smooth(1.5, 12, d))
  return base + 0.3 * smooth(W, W + 0.7, d) + wall + rough * smooth(W, W + 2, d)
}

const NR = 170, NC = 200, ZW = 21
const rowX = (i: number) => X0 + 1 + (i * (LIP - X0 - 1)) / (NR - 1) // the last row is the edge
const RH = new Float32Array(NR * NC), RZp = new Float32Array(NR * NC)
for (let i = 0; i < NR; i++)
  for (let j = 0; j < NC; j++) {
    const x = rowX(i), z = riverZ(x) + (j / (NC - 1) - 0.5) * 2 * ZW
    RZp[i * NC + j] = z, RH[i * NC + j] = height(x, z)
  }

// ── items: firs, stones, far peaks; all strokes in world space, ordered by x ────────────────────────
type Item = { x: number; a: number; n: number; c: readonly number[]; t0: number; base: number; kind: number }
const V: number[] = []
const items: Item[] = []
const TREE = 0, ROCK = 1, PEAK = 2, HATCH = 3, FLOW = 4
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
  fir(x, z, 0.6 + 1.3 * rnd(i * 7), i, 4 + x * 0.06)
}
{
  const p = APSK16.pts, cx = SC
  for (let k = 0; k < p.length / 2; k++) {
    const sx = cx + 3.4 * p[2 * k + 1], sz = riverZ(cx) + 2.6 * p[2 * k], y = riverY(sx), r = 0.42 + 0.1 * rnd(k), pts: number[] = []
    for (const q of [1, 0.66, 0.33]) for (let a = 0; a <= 18; a++) pts.push(sx + 0.8 * q * r * Math.sin((TAU * a) / 18), y + 0.03 + 0.6 * r * (1 - q * q) ** 0.5 + 0.2 * q * r * Math.max(0, Math.cos((TAU * a) / 18)), sz + q * r * Math.cos((TAU * a) / 18))
    item(sx, pts, STONE, STONES + 0.05 * k, y, ROCK)
    item(sx, [sx - 0.5 * r, y + 0.25 * r, sz - 0.4 * r, sx + 0.3 * r, y + 0.35 * r, sz + 0.5 * r, sx - 0.1 * r, y + 0.2 * r, sz + 0.7 * r], STONE, STONES + 0.05 * k, y, ROCK)
  }
}

// The line the meander drew opens into the river, a wave racing downstream: when it reaches x, and how
// far open it is there.
const opens = (x: number) => 0.5 + 0.035 * (x - X0)
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
  for (let k = 0; k < APSK16.pts.length / 2; k++) {
    const sx = SC + 3.4 * APSK16.pts[2 * k + 1]
    vortex.push([sx + 0.6, riverZ(SC) + 2.6 * APSK16.pts[2 * k] + 0.2, k & 1 ? 0.5 : -0.5]) // each stone sheds an eddy
  }
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
peaks(13, 104, riverZ(104) - 60, riverZ(104) + 60, riverY(LIP) - 4, 30, 6)
items.sort((a, b) => a.x - b.x)
const VX = Float32Array.from(V)

// ── the live equation: what is being seeded now, in the colour of what it draws, with its numbers ────
const STAGES: [number, string, readonly number[]][] = [
  [0, '\\theta(s) = \\omega_1 \\sin(2\\pi s / M_1) + \\omega_2 \\sin(2\\pi s / M_2 + \\phi)', WATER],
  [0.6, 'u = U (1 - d^2)\\, s + \\sum_j \\frac{\\Gamma_j\\, y \\times r_j}{|r_j|^2} + \\nabla \\times \\psi', WATER],
  [1.6, 'T(x, z) = \\sum_k |k|^{-\\beta/2} \\cos(k \\cdot r + \\phi_k)', INK],
  [4.2, 'x(y) = A (1 - y / H)\\; tri(2\\pi f y)', PINE],
  [6.6, 'h(z) = 20\\, \\log_{10} |S(e^{i\\omega})|', INK],
  [8.6, 'x(t) = e^{-t^2 / 2\\sigma^2} \\cos(2\\pi (f_0 t + \\frac{1}{2} k t^2))', [0.85, 0.7, 1]],
  [12, 's_k\\, e^{i \\Delta\\phi(t)},\\; s_k \\in \\{ R_1 e^{i\\pi(2m+1)/4},\\; R_2 e^{i\\pi(2m+1)/12} \\}', STONE],
  [22.5, 'u(s, t) = U \\cos(2\\pi (s / \\lambda - f t))', WATER],
  [29.5, '(x, y) = (x_0 + v_0 \\tau,\\; y_0 - \\frac{1}{2} g \\tau^2)', [0.85, 0.95, 1]],
  [34, 'S(f, t) = |\\sum_n x[n]\\, w[n - tH]\\, e^{-i 2\\pi f n / N}|', [0.1, 0.95, 0.9]],
]
const say = new Say()
let grown = 0 // firs standing, counted as they are drawn
function equation(f: Parameters<Scene['build']>[1], t: number, row: number) {
  let e = 0
  while (e + 1 < STAGES.length && STAGES[e + 1][0] <= t) e++
  let fish = FISH[0]
  for (const q of FISH) if (q.t0 <= t) fish = q
  const T: Val = ['t', t, 3]
  const vals: Val[] =
    e === 0 ? [['\\omega_1', W1, 2], ['\\omega_2', W2, 2], ['M_1', M1, 0], ['M_2', M2, 0]]
    : e === 1 ? [['x', Math.min(LIP, X0 + (t - 0.5) / 0.035), 1], T]
    : e === 2 ? [['\\beta', 2.1, 1], ['x', rowX(Math.max(0, row)), 2], T]
    : e === 3 ? [['n', grown, 0], T]
    : e === 5 ? [['f_0', fish.f0, 0], ['k', fish.sweep, 0], T]
    : e === 6 ? [['\\Delta\\phi', spin(t), 3], T]
    : e === 8 ? [['v_0', V0, 1], ['g', FALL_G, 1], T]
    : e === 9 ? [T, ['N', NF, 0]]
    : [T]
  say.say(f, t, STAGES[e][1], STAGES[e][2], vals)
}

// ── each frame ──────────────────────────────────────────────────────────────────────────────────────
const SCAN = 1.5, SCAN_DUR = 4 // rows rise in a wave rolling downstream
const HB = 1024, horizon = new Float32Array(HB)
const p3 = { x: 0, y: 0, z: 0 }, q3 = { x: 0, y: 0, z: 0 }
const sx = new Float32Array(NC), sy = new Float32Array(NC), sz = new Float32Array(NC), ok = new Uint8Array(NC)
const ink = new Path(), line = new Path()
const HERO = 4096, hx = new Float32Array(HERO), hy = new Float32Array(HERO)
let heroN = 0, occlude = 1, landK = 1, lp = 0 // lp: the roar's low-pass state

// The flight: one continuous path, eye, target and lens gliding through these without stopping. Straight
// down on the map the meander drew; a crane up and back as the valley rises; downstream over the firs;
// around the pool as its stones lock; low and fast down the river to the lip; over it and round in an
// arc to face the falls; then back, the lens narrowing as we go, until the falls are flat as a plot.
export const DUR = 45, SING = 24 // the choirs begin to sing at SING
const MAP_FOV = 1.1, YL = riverY(LIP - 0.2), ZL = riverZ(LIP), YS = riverY(SC), ZS = riverZ(SC)
const on = (x: number, h: number, dz: number, tx: number, fov: number) => [x, riverY(x) + h, riverZ(x) + dz, tx, riverY(tx), riverZ(tx), fov]
const KEYS: number[][] = [
  [0, 0, 0, 0, 0, 0, 0, 0], // the map, framed each frame to the screen
  [1.5, 0, 0, 0, 0, 0, 0, 0], // held while the line opens into a river
  [5.2, X0 - 5, riverY(0) + 15, riverZ(0) - 9, 22, riverY(22), riverZ(22), 1],
  [8.6, ...on(1, 8.5, 6, 17, 0.95)],
  [12.5, SC - 8, YS + 5.5, ZS + 1.5, SC + 1, YS, ZS, 0.95],
  [16, SC - 6, YS + 4.5, ZS - 4.5, SC + 2, YS, ZS, 0.95],
  [19.5, SC - 2.5, YS + 5, ZS - 6.5, SC + 5, YS, ZS + 0.5, 0.95],
  [23, ...on(SC + 7, 8, 5, 36, 1)],
  [27, ...on(44, 4.5, 0, 56, 1)],
  [30, LIP - 8, YL + 5, riverZ(LIP - 8) + 2, LIP + 6, YL - 4, ZL + 2, 1],
  [32.5, LIP + 10, YL + 4, ZL + 11, LIP + 2, YL - 8, ZL, 1],
  [35, LIP + 14, YL - 4, ZL + 9, LIP + 1.5, YL - 11, ZL, 0.9],
  [38, LIP + 18, YL - 11, ZL, LIP + 1, YL - 12, ZL, 0.8],
  [DUR, LIP + 40, YL - 12, ZL, LIP + 1, YL - 12, ZL, 0.34],
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

// The river on the map, as the meander must leave it: the same stretch through the same lens.
export const glow = (u: number, t: number) => 0.65 + 0.35 * Math.cos(TAU * (6 * u - 2.5 * t))
export function mapped(p: Path, t: number) {
  crane(0)
  p.clear()
  for (let x = X0; x <= XM; x += 0.1) {
    cam.project(x, riverY(x), riverZ(x), p3)
    p.color(WATER[0], WATER[1], WATER[2], glow((x - X0) / (XM - X0), t))
    x > X0 ? p.lineTo(p3.x, p3.y) : p.moveTo(p3.x, p3.y)
  }
  return p
}

const col = (x: number) => Math.max(0, Math.min(HB - 1, Math.round(((x / view.a) * 0.45 + 0.5) * (HB - 1))))
const visible = (x: number, y: number) => occlude < 0.5 || y > horizon[col(x)] - 0.002
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

// The stones arrive as a whirlpool: the constellation spins (a carrier offset) with its gravel strewn
// (noise), and the loop pulls it in, overshooting, until it stands still and the gravel settles.
const SZ = () => riverZ(SC)
const spin = (t: number) => {
  const u = Math.max(0, t - STONES)
  return 2.2 * TAU * 0.9 * (1 - Math.exp(-u / 0.9)) * Math.exp(-u / 6) + 0.25 * Math.sin(1.7 * u) * Math.exp(-u / 1.5)
}
const strew = (t: number) => 0.35 * Math.exp(-Math.max(0, t - STONES - 1) / 1.6)

function items_(t: number, upto: number, next: { i: number }, hero: number) {
  for (; next.i < items.length && items[next.i].x < upto; next.i++) {
    const it = items[next.i]
    if (t < it.t0) continue
    const k = clamp(lock([[0, 0], [it.t0, 1]], t, it.kind === ROCK ? 9 : 7, 0.45), 0, 1.3)
    let pen = false
    for (let v = 0; v < it.n; v++) {
      const o = 3 * (it.a + v), wv = it.kind === FLOW ? wave(VX[o], VX[o + 2], t) : 0, y = it.kind === FLOW ? VX[o + 1] + wv : it.base + (VX[o + 1] - it.base) * (it.kind === ROCK ? 1 : k), drop = it.kind === ROCK ? (1 - Math.min(1, k)) * 0.5 : 0
      let px = VX[o], pz = VX[o + 2] + 1.5 * wv
      if (it.kind === FLOW) pz = riverZ(px) + (pz - riverZ(px)) * Math.min(1, open(px, t))
      if (it.kind === ROCK) {
        const a = spin(t), c = Math.cos(a), sn = Math.sin(a), dx = px - SC, dz = pz - SZ(), g = strew(t), seed = it.a
        px = SC + dx * c - dz * sn + g * hash(seed + Math.floor(t * 9)), pz = SZ() + dx * sn + dz * c + g * hash(seed * 3 + Math.floor(t * 9))
      }
      if (!cam.project(px, y + drop, pz, p3) || (it.kind !== ROCK && !visible(p3.x, p3.y))) {
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
      if (it.kind === hero && it.t0 <= t && t - it.t0 < 0.5 && heroN < HERO) (hx[heroN] = p3.x), (hy[heroN++] = p3.y)
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
function ripples(t: number, x0: number, x1: number) {
  const p = APSK16.pts
  for (let k = 0; k < p.length / 2; k++) {
    const sx = SC + 3.4 * p[2 * k + 1]
    if (sx < x0 || sx >= x1 || t < STONES + 0.05 * k) continue
    const sz = riverZ(SC) + 2.6 * p[2 * k], y = riverY(sx) + 0.01
    for (let r = 0; r < 3; r++) {
      const age = ((t - 12 - 0.11 * k) * 0.6 + r / 3) % 1, rad = 0.2 + 0.9 * age
      let pen = false
      for (let a = 0; a <= 28; a++) {
        if (!cam.project(sx + rad * 0.8 * Math.cos((TAU * a) / 28), y, sz + rad * Math.sin((TAU * a) / 28), p3) || !visible(p3.x, p3.y)) {
          pen = false
          continue
        }
        ink.color(WATER[0], WATER[1], WATER[2], (1 - age) * 0.7 * fog(p3.z) * landK)
        pen ? ink.lineTo(p3.x, p3.y) : ink.moveTo(p3.x, p3.y)
        pen = true
      }
    }
  }
}

// The falls. The river leaves the lip and drops; every lane of the falling sheet is a frequency (log,
// 80 Hz to 8 kHz) and every droplet carries the spectrum of the moment it went over: the true STFT of
// what the speakers are playing. So the falls are a waterfall display, rows born at the lip and falling.
const LANES = 72, ROWS = 512, NF = 1024
const spec = new Float32Array(ROWS * LANES), stamp = new Float64Array(ROWS).fill(-1e9)
const re = new Float64Array(NF), im = new Float64Array(NF)
let row = 0, ref = -20 // ref: the display's reference level, dB, riding the loudest bin
function listen(t: number) {
  const r = heard.buf, m = r.length - 1
  for (let n = 0; n < NF; n++) (re[n] = r[(heard.n - NF + n) & m] * hann(n, NF)), (im[n] = 0)
  fft(re, im)
  const o = (row % ROWS) * LANES
  let top = -120
  for (let l = 0; l < LANES; l++) {
    const f = 80 * 100 ** (l / (LANES - 1)), b = Math.min(NF / 2 - 1, Math.round((f * NF) / heard.sr))
    const db = 20 * Math.log10(Math.hypot(re[b], im[b]) + 1e-6)
    spec[o + l] = db, (top = Math.max(top, db))
  }
  ref = Math.max(-40, ref + (top - ref) * (top > ref ? 0.2 : 0.01)) // silence stays dark
  for (let l = 0; l < LANES; l++) spec[o + l] = clamp((spec[o + l] - ref + 40) / 40) ** 2
  stamp[row % ROWS] = t
  row++
}
// The row printed nearest time t (no older than the history holds), as an offset into spec.
function rowAt(t: number) {
  let lo = Math.max(0, row - ROWS), hi = row - 1
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1
    stamp[m % ROWS] < t ? (lo = m) : (hi = m)
  }
  return (Math.abs(stamp[lo % ROWS] - t) < Math.abs(stamp[hi % ROWS] - t) ? lo % ROWS : hi % ROWS) * LANES
}
const past = (t: number, lane: number) => (row ? spec[rowAt(t) + lane] : 0)
const PAL = [[0.02, 0.08, 0.35], [0.05, 0.4, 1], [0.1, 0.95, 0.9], [1, 0.85, 0.2], [1, 1, 1]]
const FALL_G = 5, V0 = 1.6, TAU_MAX = 3.4
const fallX = (tau: number, l: number) => LIP + V0 * tau + 0.05 * Math.sin(7 * tau + l)
const fallZ = (tau: number, l: number) => ZL + (0.5 - l / (LANES - 1)) * 2 * wide(LIP) * 1.3 * (1 + 1.1 * tau) // fanning as it falls
function shade(v: number, i: number) {
  const f = clamp(v) * (PAL.length - 1), k = Math.min(PAL.length - 2, Math.floor(f)), u = f - k, c = PAL[k], d = PAL[k + 1]
  ink.color(mix(c[0], d[0], u), mix(c[1], d[1], u), mix(c[2], d[2], u), i)
}
// Where the falls are on screen. Face to face with them they flatten into what a waterfall display draws:
// a lane per frequency across, time falling down from the lip, the lip itself the live spectrum on top.
let near = 1 // spray too close to the lens to hold in focus, thinned out
function fallAt(tau: number, l: number, lift: number, flat: number) {
  const x = fallX(tau, l), y = YL - 0.5 * FALL_G * tau * tau + 1.2 * lift, z = fallZ(tau, l), ok = cam.project(x, y, z, p3)
  if (!ok && flat < 1) return false
  if (!ok) p3.z = 1
  near = mix(smooth(4, 14, Math.hypot(x - eye.x, y - eye.y, z - eye.z)), 1, flat)
  p3.x = mix(p3.x, (l / (LANES - 1) - 0.5) * 2.3 * view.a, flat)
  p3.y = mix(p3.y, 0.7 - (tau / TAU_MAX) * 1.85 + 0.22 * lift, flat)
  return flat > 0.5 || visible(p3.x, p3.y)
}
function falls(t: number, show: number) {
  const rows = smooth(36, 39, t), flat = smooth(37, 42, t), water = 0.15 * (1 - smooth(30, 34, t))
  // as we come round to face it, the lanes give way to rows: the raster of a waterfall plot
  for (let j = 0; j < 130 && rows > 0; j++) {
    const tau = (j / 129) * TAU_MAX, r = row ? rowAt(t - tau) : 0
    let pen = false
    for (let l = 0; l < LANES; l++) {
      const v = spec[r + l]
      if (!fallAt(tau, l, 0, flat)) {
        pen = false
        continue
      }
      shade(v, show * rows * (0.1 + 0.9 * v) * smooth(0, 0.3, tau + flat))
      pen ? ink.lineTo(p3.x, p3.y) : ink.moveTo(p3.x, p3.y)
      pen = true
    }
  }
  // the lip, heaving with the spectrum going over it now
  const lip = smooth(32, 36, t)
  let pen = false
  for (let l = 0; l < LANES && lip > 0; l++) {
    const v = past(t, l)
    if (!fallAt(0, l, v * lip, flat)) {
      pen = false
      continue
    }
    ink.color(1, mix(0.75, 0.95, v), mix(0.45, 0.85, v), show * lip * (0.3 + v * v))
    pen ? ink.lineTo(p3.x, p3.y) : ink.moveTo(p3.x, p3.y)
    pen = true
  }
  if (rows >= 1) return
  // seen obliquely the lanes crowd together; keep the ink per unit of screen what it is face on
  for (let l = 0; l < LANES; l++) {
    let pen = false
    for (let j = 0; j <= 44; j++) {
      const tau = (j / 44) ** 1.3 * TAU_MAX, v = past(t - tau, l)
      if (!fallAt(tau, l ? l - 1 : 1, 0, flat)) {
        pen = false
        continue
      }
      const nx = p3.x, ny = p3.y
      if (!fallAt(tau, l, 0, flat)) {
        pen = false
        continue
      }
      const gap = clamp(Math.hypot(p3.x - nx, p3.y - ny) / 0.025, 0.08, 1)
      shade(v + water, 0.45 * near * gap * show * (1 - rows) * (0.08 + 0.8 * v) * fog(p3.z) * smooth(0, 0.5, tau))
      pen ? ink.lineTo(p3.x, p3.y) : ink.moveTo(p3.x, p3.y)
      pen = true
    }
  }
}

// Fish: each is a Gaussian-windowed chirp, the waveform drawn as its own body (a spindle whose stripes
// tighten toward the tail), thrown on a ballistic arc out of the current and back in, a ripple where it
// leaves and where it lands. The speakers chirp with it.
const FISH = Array.from({ length: 14 }, (_, k) => {
  const t0 = 8.5 + k * 0.95 + 0.4 * rnd(k * 17)
  return { t0, ahead: 7 + 9 * rnd(k * 19), lane: (rnd(k * 23) * 2 - 1) * 0.6, f0: 300 + 400 * rnd(k), sweep: 1500 + 2500 * rnd(k + 9) }
})
const LEAP = 1.25, FG = 9.81
const fk: number[] = []
const fishX = (k: number) => glide(KEYS, FISH[k].t0, fk)[3] + FISH[k].ahead - 11 // near where we look as it leaps
function fishes(t: number, x0: number, x1: number) {
  for (let k = 0; k < FISH.length; k++) {
    const f = FISH[k], a = t - f.t0, fx = fishX(k)
    if (fx < x0 || fx >= x1 || a < -0.1 || a > LEAP + 1.2) continue
    const fz = riverZ(fx) + f.lane * wide(fx), y0 = riverY(fx), vy = (FG * LEAP) / 2, vx = 1.6
    if (a >= 0 && a <= LEAP) {
      // they leap across the current, so we see them side on
      const dir = f.lane > 0 ? -1 : 1, pz = fz + dir * vx * a, py = y0 + vy * a - 0.5 * FG * a * a, tilt = Math.atan2(vy - FG * a, vx)
      let pen = false
      for (let j = 0; j <= 40; j++) {
        const u = j / 20 - 1, env = Math.exp(-3 * u * u), w = 0.55 * env * Math.cos(TAU * (1.2 * u + 0.9 * u * u) - 9 * a)
        const along = 1.7 * u, bz = pz + dir * along * Math.cos(tilt), by = py + along * Math.sin(tilt) + w
        if (!cam.project(fx, by, bz, p3) || !visible(p3.x, p3.y)) {
          pen = false
          continue
        }
        ink.color(0.85, 0.7, 1, (0.7 + 1.3 * env) * fog(p3.z) * landK)
        pen ? ink.lineTo(p3.x, p3.y) : ink.moveTo(p3.x, p3.y)
        pen = true
      }
    }
    for (const [oz, at] of [[0, 0], [(f.lane > 0 ? -1 : 1) * vx * LEAP, LEAP]]) {
      const age = a - at
      if (age < 0 || age > 1.2) continue
      let pen = false
      for (let j = 0; j <= 24; j++) {
        const r = 0.15 + 0.7 * age
        if (!cam.project(fx + r * Math.cos((TAU * j) / 24), y0 + 0.01, fz + oz + r * Math.sin((TAU * j) / 24), p3) || !visible(p3.x, p3.y)) {
          pen = false
          continue
        }
        ink.color(0.82, 0.72, 1, (1 - age / 1.2) * 0.7 * fog(p3.z) * landK)
        pen ? ink.lineTo(p3.x, p3.y) : ink.moveTo(p3.x, p3.y)
        pen = true
      }
    }
  }
}
const chirp = (tt: number) => {
  let s = 0
  for (const f of FISH) {
    const a = tt - f.t0
    if (a < 0 || a > LEAP) continue
    const u = a / LEAP
    s += 0.16 * Math.sin(Math.PI * u) ** 2 * Math.sin(TAU * (f.f0 * a + 0.5 * (f.sweep / LEAP) * a * a))
  }
  return s
}

export const valley: Scene = {
  dur: DUR,
  build(t, f) {
    crane(t)
    ink.clear(), (heroN = 0), (grown = 0)
    horizon.fill(-9)
    const next = { i: 0 }, heroKind = t < 4 ? -1 : t < 12 ? TREE : ROCK, behind = occlude > 0.5 ? eye.x + 0.3 : -Infinity
    let heroRow = -1
    const land = (landK = 1 - smooth(29.5, 30.8, t)) // the valley falls away behind us as we go over

    // strokes too faint to see would still cost the beam its time: once the valley is gone, skip it
    for (let i = 0; i < NR && land > 0.06; i++) {
      const x = rowX(i), x0 = rowX(i - 1), rise = clamp(lock([[0, 0], [SCAN + (i / NR) * SCAN_DUR, 1]], t, 7, 0.45), 0, 1.35)
      if (x < behind) continue
      items_(t, x, next, heroKind)
      for (const c of CASCADES) if (c >= x0 && c < x && t > opens(c)) whitewater(t, c)
      if (i > 0) ripples(t, x0, x), fishes(t, x0, x)
      // the banks and the current, from the last row to this one
      if (i > 0 && x0 >= behind && t > opens(x0)) {
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
        const water = Math.abs(RZp[o + j] - riverZ(x)) < wide(x)
        if (!ok[j] || !visible(sx[j], sy[j]) || (water && i % 3)) {
          pen = false
          continue
        }
        const c = water ? WATER : INK
        ink.color(c[0], c[1], c[2], index * fog(sz[j]) * (water ? 0.25 : 1))
        pen ? ink.lineTo(sx[j], sy[j]) : ink.moveTo(sx[j], sy[j])
        pen = true
      }
      if (t >= SCAN && rise < 1.2) heroRow = i
      for (let j = 1; j < NC; j++) if (ok[j] && ok[j - 1]) raise(sx[j - 1], sy[j - 1], sx[j], sy[j])
      if (heroRow === i && heroKind < 0) for (let j = 0; j < NC && heroN < HERO; j++) if (ok[j]) (hx[heroN] = sx[j]), (hy[heroN++] = sy[j])
    }
    if (land > 0.06) items_(t, Infinity, next, heroKind)
    if (t > 18) listen(t), falls(t, smooth(18, 20, t))
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
        line.color(WATER[0], WATER[1], WATER[2], glow((x - X0) / (XM - X0), t + 4) * k)
        pen ? line.lineTo(p3.x, p3.y) : line.moveTo(p3.x, p3.y)
        pen = true
        if (t < SCAN && heroN < HERO) (hx[heroN] = p3.x), (hy[heroN++] = p3.y)
      }
      f.ch.push({ w: fade, path: line })
    }
    equation(f, t, heroRow)

    f.rate = mix(2.4e6, 7.2e6, smooth(1, 8, t))
    if (t > SING) place(t - SING)
    return (tt, o) => {
      // over the edge the scope rule ends: the falls roar and the choirs begin to sing around us
      if (tt > 22 && tt < DUR) {
        lp += (hash(tt * 48_000) - lp) * 0.04
        const roar = 0.5 * lp * smooth(22, 28, tt) * (1 - 0.6 * smooth(34, 40, tt))
        // fish leaping in the falls: Gaussian chirplets sweeping up, each a bright diagonal in the waterfall
        const ft = tt * 1.7, n = Math.floor(ft), a = ft - n, f0 = 250 + 500 * rnd(n), k = 900 + 2600 * rnd(n + 7)
        const fish = smooth(26, 28, tt) * 0.18 * Math.exp(-(((a - 0.5) / 0.16) ** 2)) * Math.sin(TAU * (f0 * a + 0.5 * k * a * a) / 1.7)
        o.l += roar + fish, o.r += roar + fish
        if (tt > SING) sing(tt - SING, o)
      }
      const ch = chirp(tt)
      o.l += ch, o.r += ch
      if (tt > STONES && tt < 22) {
        // the stones are symbols: the modem itself, spinning down to lock (receive.ts's locked 16APSK stretch)
        signal(9 + tt - STONES, spin(tt))
        const k = smooth(STONES, STONES + 0.5, tt) * (1 - smooth(20, 22, tt))
        o.l += 0.6 * k * sig.i, o.r += 0.6 * k * sig.q
        return
      }
      if (heroN < 2 || tt > 26) return
      const ph = ((tt * 55) % 1) * 2, u = (ph < 1 ? ph : 2 - ph) * (heroN - 1), i = Math.min(heroN - 2, Math.floor(u)), a = u - i
      const k = 1 - smooth(22, 26, tt)
      o.l += (0.8 * k * (hx[i] + (hx[i + 1] - hx[i]) * a)) / view.a
      o.r += 0.8 * k * (hy[i] + (hy[i + 1] - hy[i]) * a)
    }
  },
}

// The tour's ways of seeing: each of River's places through an instrument of its own, and each instrument shows what is
// really there. R-01's drive put on a scope's XY input paints R-01's frame; esp-dvbs2's I and Q on the same input draw
// its 8PSK as the carrier loop pulls in; Ephemeris-1's satellites come up out of the noise on an analyser as each code
// is wiped off; SAMWISE's magnetometer draws the field it feels as the bus tumbles; the hearts' beats on a dual-trace
// sweep; Pigeon Vision's own fisheye. Each draws into the frame it is given, over the place's own light, dimmed.
import type { Fn } from '../beam/beam'
import { Path } from '../beam/path'
import { Frames, SPAN, rc, rings } from '../dsp/dvbs2'
import { L1 } from '../dsp/gps'
import { TAU, clamp, type Frame } from './scene'
import { equation } from './reality'
import { clear, cross, dot, frame, len, seen, site, unit, type V } from '../world/ctx'
import { PLACES } from '../world/places'
import { clock } from '../world/planet'
import { C, DEG, RE, numbers, orbit } from '../world/sites/sky'

// A scope's graticule, w × h scope units about the middle, in nx × ny divisions, its centre lines ticked.
function graticule(p: Path, w: number, h: number, nx: number, ny: number, c: readonly number[]) {
  p.color(c[0], c[1], c[2], 0.07)
  for (let i = 0; i <= nx; i++) p.moveTo(-w + (2 * w * i) / nx, -h).lineTo(-w + (2 * w * i) / nx, h)
  for (let j = 0; j <= ny; j++) p.moveTo(-w, -h + (2 * h * j) / ny).lineTo(w, -h + (2 * h * j) / ny)
  p.color(c[0], c[1], c[2], 0.14)
  for (let i = 0; i <= nx * 5; i++) p.moveTo(-w + (2 * w * i) / (nx * 5), -0.012).lineTo(-w + (2 * w * i) / (nx * 5), 0.012)
  for (let j = 0; j <= ny * 5; j++) p.moveTo(-0.012, -h + (2 * h * j) / (ny * 5)).lineTo(0.012, -h + (2 * h * j) / (ny * 5))
}

// ---- R-01 on the tube ----------------------------------------------------------------------------------------------
// R-01's drive is an x/y/z signal already: the polygon's facet sweeps x, the galvo steps y (odd lines down, even lines
// back up, as its firmware orders them), the three lasers' 4-bit binary-weighted currents are z. On a scope's XY input
// it paints R-01's own 320 × 120 frame, the one it was built to show, over the same 54° × 21.5° it throws; the flyback
// between facets is blanked, as the lasers are. Here at 300 lines a second, a sixth of its 1800.
const NX = 320, NY = 120, LV = new Uint8Array(NX * NY * 3), LVL = Float32Array.from({ length: 16 }, (_, l) => Math.sqrt(l / 15))
const lin = (v: number) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
fetch(`${import.meta.env.BASE_URL}media/r01/raster.png`)
  .then((r) => r.blob())
  .then(createImageBitmap)
  .then((b) => {
    const c = new OffscreenCanvas(NX, NY).getContext('2d')!
    c.drawImage(b, 0, 0, NX, NY)
    const px = c.getImageData(0, 0, NX, NY).data
    for (let i = 0; i < NX * NY; i++) for (let k = 0; k < 3; k++) LV[3 * i + k] = Math.round(15 * lin(px[4 * i + k]))
  })
  .catch(() => {})
const LINES = 300, TW = 1.66, TH = (TW * 21.5) / 54
const scan = { t0: 0, j: -1 }
const paint: Fn = (t, s) => {
  const q = LINES * (t - scan.t0), j = Math.floor(q), h = q - j, n = ((j % NY) + NY) % NY, L = n < 60 ? 2 * n + 1 : 238 - 2 * n
  const o = (L * NX + Math.min(NX - 1, Math.floor(h * NX))) * 3
  s.x = (2 * h - 1) * TW, s.y = TH - ((L + 0.5) / NY) * 2 * TH
  s.r = LVL[LV[o]], s.g = LVL[LV[o + 1]], s.b = LVL[LV[o + 2]]
  s.z = j === scan.j ? 1.6 : 0 // the facet's flyback, dark
  scan.j = j
}
const TUBE = { w: 1, fn: paint }, tv = [0]
export function tube(f: Frame, t0: number, t: number, ink: readonly number[]) {
  scan.t0 = t0
  f.ch.push(TUBE)
  const n = ((Math.floor(LINES * (t - t0)) % NY) + NY) % NY
  tv[0] = n < 60 ? 2 * n + 1 : 238 - 2 * n
  equation(f, 'x=\\theta_{polygon}\\quad y=\\theta_{galvo}\\quad z=\\sum_{k=0}^{3}2^k\\,b_k\\,I_0\\qquad n=\\num{0}{000}', ink, 0.9, tv)
}

// ---- esp-dvbs2 on the tube -----------------------------------------------------------------------------------------
// I on x, Q on y: the stream the valley's tower stands up in time, normal FECFRAMEs of 8PSK 9/10 with pilots, through
// the raised-cosine pulse (no intersymbol interference: every trajectory passes through a stone at its symbol's
// instant, so the stones are where the beam dwells). The receiver's carrier arrives 5 Hz off; a decision-directed
// second-order loop (ωn = 50 rad/s, ζ = 0.7, its error sin 8θ / 8) slips most of a turn and pulls in, a third of a
// second, onto one of the eight phases it cannot tell apart. Shown at 72 000 symbols a second.
const PSK = rings('8PSK', '9/10', 17, [[8, 1, 0]]), TX = new Frames(1, () => PSK, 64800)
const RS = 72_000, MAXS = 4096, SI = new Float32Array(MAXS), SQ = new Float32Array(MAXS), SK = new Uint8Array(MAXS)
const PH = 64, TAP = new Float32Array(PH * 2 * SPAN) // the pulse at PH phases of a symbol, 2·SPAN taps each
for (let p = 0; p < PH; p++) for (let m = 0; m < 2 * SPAN; m++) TAP[p * 2 * SPAN + m] = rc(p / PH + SPAN - 1 - m)
const INK = [[1, 1, 1], [1, 0.72, 0.3], [0.45, 0.75, 1]] // header, pilot, data (dvbs2.Kind)
const R8 = 0.6, sym = { i: 0, q: 0 }, loop = { t: -1, th: 0, v: 0 }, iv = [0, 0]
let kb = 0
const iqFn: Fn = (t, s) => {
  const x = RS * t, k = Math.floor(x), p = Math.min(PH - 1, Math.round((x - k) * PH)), o = k - kb, a = p * 2 * SPAN
  let I = 0, Q = 0
  for (let m = 0; m < 2 * SPAN; m++) {
    const j = o - SPAN + 1 + m
    if (j >= 0 && j < MAXS) (I += SI[j] * TAP[a + m]), (Q += SQ[j] * TAP[a + m])
  }
  const c = INK[SK[Math.max(0, Math.min(MAXS - 1, o + (p > PH / 2 ? 1 : 0)))]]
  s.x = I * R8, s.y = Q * R8, s.r = c[0], s.g = c[1], s.b = c[2], s.z = c === INK[2] ? 0.55 : 1.1
}
const IQ = { w: 1, fn: iqFn }, grid = new Path(), GRID = { w: 0.08, path: grid }
export function iq(f: Frame, tc: number, t: number, dt: number, ink: readonly number[]) {
  // the loop, from the cut on: θ is the phase the receiver has yet to take out, the constellation's turn
  if (tc < loop.t || loop.t < 0) (loop.t = tc), (loop.th = loop.v = 0)
  const W = TAU * 5, wn = 50, kp = 2 * 0.7 * wn, ki = wn * wn
  for (let n = Math.ceil((tc - loop.t) / 0.002), h = (tc - loop.t) / Math.max(n, 1); n > 0; n--) {
    const e = Math.sin(8 * loop.th) / 8
    loop.v += ki * e * h, loop.th += (W - kp * e - loop.v) * h
  }
  loop.t = tc
  // the symbols this refresh spans, turned by θ as it stands at each
  kb = Math.floor(RS * (t - dt)) - SPAN
  const n = Math.min(MAXS, Math.ceil(RS * dt) + 2 * SPAN + 2), c = Math.cos(loop.th), sn = Math.sin(loop.th)
  for (let j = 0; j < n; j++) {
    SK[j] = TX.sym(kb + j, sym)
    SI[j] = sym.i * c - sym.q * sn, SQ[j] = sym.i * sn + sym.q * c
  }
  grid.clear()
  graticule(grid, 1.2 * R8 * 1.6, 1.2 * R8 * 1.6 * 0.8, 10, 8, INK[2])
  f.ch.push(GRID, IQ)
  iv[0] = (loop.th / TAU) * 360, iv[1] = W / TAU - loop.v / TAU
  equation(f, 's(t)=\\sum_k a_k\\,g(t-kT)\\,e^{i\\theta}\\qquad\\theta=\\num{0}{-000}°\\qquad\\Delta f=\\num{1}{-0.00}\\,Hz', ink, 0.9, iv)
}

// ---- Ephemeris-1 on the analyser -------------------------------------------------------------------------------
// GPS is 18 dB under the noise at the antenna; no analyser shows it. Multiply the capture by a satellite's own C/A
// code at the right phase and the spread signal collapses back into its carrier, a line at its Doppler: 10 ms of it
// (half a nav bit) is sinc²((f − f_D) · 10 ms) standing C/N₀ · 10 ms over the noise. Every satellite over the receiver's 5° mask,
// each in its own hue (receiver.ts's), its code wiped off one after another, strongest first; the Dopplers and C/N₀
// are the Walker shell's own, as the receiver sees it, the noise exponential in each 25 Hz bin, four sweeps averaged.
const SHELL = 4.17, INC = 55 * DEG, RATE = 0.05, LAPSE = RATE / (TAU / 43082)
const BINS = 481, SPANF = 6000, AW = 1.5, AH = 0.62, COH = 0.01 // the span, ±Hz; the screen, half-width and height; 10 ms coherent
const rx: V = [0, 0, 0], up: V = [0, 0, 0], S: V = [0, 0, 0], vel: V = [0, 0, 0]
const fd = new Float64Array(24), cn = new Float64Array(24), order = Array.from({ length: 24 }, (_, i) => i), inView = new Uint8Array(24)
const hue = (i: number, o: number[]) => {
  const h = i / 24
  o[0] = 0.62 + 0.38 * Math.cos(TAU * h), o[1] = 0.72 + 0.28 * Math.cos(TAU * (h - 0.33)), o[2] = 0.8 + 0.2 * Math.cos(TAU * (h - 0.67))
  return o
}
const trace = new Path(), TRACE = { w: 0.9, path: trace }, col = [0, 0, 0], dv = [0, 0, 0]
const byStrength = (a: number, b: number) => inView[b] - inView[a] || cn[b] - cn[a]
const RX = PLACES.find((P) => P.id === 'receiver')!
export function despread(f: Frame, tc: number, pt: number, ink: readonly number[]) {
  site(RX.lat, RX.lon, up)
  for (let j = 0; j < 3; j++) rx[j] = up[j] * 1.012
  for (let i = 0; i < 24; i++) {
    const raan = ((i >> 2) * TAU) / 6, u = ((i & 3) * TAU) / 4 + ((i >> 2) * TAU) / 24 + RATE * pt
    orbit(SHELL, raan, INC, u, S), orbit(SHELL * RATE, raan, INC, u + Math.PI / 2, vel)
    const dx = S[0] - rx[0], dy = S[1] - rx[1], dz = S[2] - rx[2], r = Math.hypot(dx, dy, dz)
    inView[i] = +((dx * up[0] + dy * up[1] + dz * up[2]) / r > Math.sin(5 * DEG))
    fd[i] = (-(vel[0] * dx + vel[1] * dy + vel[2] * dz) / r) * (RE / LAPSE) * (L1 / C) // the shell's rate, in real m/s
    cn[i] = 45.6 - 20 * Math.log10(r / (SHELL - 1))
  }
  order.sort(byStrength)
  trace.clear()
  graticule(trace, AW, AH, 12, 8, ink)
  let found = -1
  for (let n = 0; n < 24 && inView[order[n]]; n++) {
    const i = order[n], on = tc > 0.1 + 0.06 * n, snr = on ? 10 ** (cn[i] / 10) * COH : 0
    if (on) found = i
    hue(i, col)
    for (let b = 0; b < BINS; b++) {
      const fr = -SPANF + (2 * SPANF * b) / (BINS - 1), x = (fr - fd[i]) * COH, sinc = Math.abs(x) < 1e-6 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x)
      const noise = -Math.log((1 - 0.9999 * Math.random()) * (1 - 0.9999 * Math.random()) * (1 - 0.9999 * Math.random()) * (1 - 0.9999 * Math.random())) / 4 // four sweeps averaged
      const s = snr * sinc * sinc, db = 10 * Math.log10(noise + s)
      const X = -AW + (2 * AW * b) / (BINS - 1), Y = -AH + ((db + 8) / 40) * 2 * AH
      trace.color(col[0], col[1], col[2], 0.07 + s / (noise + s))
      b ? trace.lineTo(X, Math.min(AH, Y)) : trace.moveTo(X, Math.min(AH, Y))
    }
  }
  f.ch.push(TRACE)
  if (found >= 0) (dv[0] = found + 1), (dv[1] = fd[found]), (dv[2] = cn[found])
  equation(f, 'R_k(f)=|\\sum_n x_n\\,c_k(n-\\tau)\\,e^{-2\\pi ifn/f_s}|^2\\qquad k=\\num{0}{00}', ink, 0.9, dv)
  numbers('f_D=\\num{1}{-0000}\\,Hz\\qquad C/N_0=\\num{2}{00.0}\\,dB\\,Hz\\qquad T=10\\,ms\\qquad 5\\,dB/div', ink, dv)
}

// ---- SAMWISE's magnetometer -----------------------------------------------------------------------------------
// What the bus feels: the planet's field in the bus's own axes, the three-axis magnetometer's reading drawn as a curve
// in space. Off the deployer the bus tumbles and the field it feels whirls round it, a ball of yarn; B-dot,
// m = −k dB/dt, takes the spin out, and what is left is the field turning twice an orbit, a loop. The same bus,
// field and law as station.ts (a centred dipole 10° off the pole, 31.2 μT, 2U at 2.66 kg, sun-synchronous at 1.086),
// integrated once from deployment over two orbits.
const A = 1.086, RAAN = 0.4, SINC = 97.6 * DEG, ORATE = 0.6, OLAPSE = ORATE / Math.sqrt(3.986004418e14 / (A * RE) ** 3)
const M: V = unit([Math.sin(10 * DEG) * 0.6, Math.cos(10 * DEG), Math.sin(10 * DEG) * 0.8])
const IX = (2.66 * (0.1 ** 2 + 0.227 ** 2)) / 12, IZ = (2.66 * 2 * 0.1 ** 2) / 12, KB = 4e3, B0 = 3.12e-5
const NH = 3000, HB = new Float32Array(NH * 3), HSPAN = (2 * TAU) / ORATE // samples; scene seconds they cover
{
  const q = [1, 0, 0, 0], w = [0.9 * DEG * 0.62, 0.9 * DEG * 0.55, 0.9 * DEG * 0.56], c: V = [0, 0, 0], B: V = [0, 0, 0], b = [0, 0, 0], bp = [0, 0, 0]
  const X = [0, 0, 0], Y = [0, 0, 0], Z = [0, 0, 0], h = 1.5, per = Math.round((HSPAN * OLAPSE) / h / NH)
  for (let n = 0; n < NH * per; n++) {
    orbit(A, RAAN, SINC, (ORATE * n * h) / OLAPSE, c)
    const R = len(c), cm = dot(M, c) / R, k = B0 / R ** 3
    for (let i = 0; i < 3; i++) B[i] = -k * ((3 * cm * c[i]) / R - M[i])
    const [s, x, y, z] = q
    X[0] = 1 - 2 * (y * y + z * z), X[1] = 2 * (x * y + s * z), X[2] = 2 * (x * z - s * y)
    Y[0] = 2 * (x * y - s * z), Y[1] = 1 - 2 * (x * x + z * z), Y[2] = 2 * (y * z + s * x)
    Z[0] = 2 * (x * z + s * y), Z[1] = 2 * (y * z - s * x), Z[2] = 1 - 2 * (x * x + y * y)
    b[0] = dot(X, B), b[1] = dot(Y, B), b[2] = dot(Z, B)
    if (n % per === 0) HB.set(b, (n / per) * 3)
    const m = [0, 1, 2].map((i) => (-KB * (b[i] - (n ? bp[i] : b[i]))) / h)
    bp[0] = b[0], bp[1] = b[1], bp[2] = b[2]
    const tx = m[1] * b[2] - m[2] * b[1], ty = m[2] * b[0] - m[0] * b[2], tz = m[0] * b[1] - m[1] * b[0], [wx, wy, wz] = w
    w[0] += (h * (tx - (IZ - IX) * wy * wz)) / IX, w[1] += (h * (ty - (IX - IZ) * wz * wx)) / IX, w[2] += (h * tz) / IZ
    const g = h / 2
    q[0] -= g * (x * w[0] + y * w[1] + z * w[2]), q[1] += g * (s * w[0] + y * w[2] - z * w[1])
    q[2] += g * (s * w[1] + z * w[0] - x * w[2]), q[3] += g * (s * w[2] + x * w[1] - y * w[0])
    const l = Math.hypot(...q)
    for (let i = 0; i < 4; i++) q[i] /= l
  }
}
const yarn = new Path(), YARN = { w: 1, path: yarn }, hv = [0]
export function hodo(f: Frame, tc: number, ink: readonly number[]) {
  // the reading from deployment until now, an orbit and a half in, the spin mostly gone; now runs at the sky's lapse
  const now = Math.min(NH - 1, Math.floor(0.8 * NH + (NH / HSPAN) * tc)), from = 0
  const yaw = 0.6 + 0.9 * tc, cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(0.45), sp = Math.sin(0.45), k = 0.88 / 4.8e-5
  yarn.clear()
  for (let n = from; n <= now; n++) {
    const x = HB[3 * n], y = HB[3 * n + 1], z = HB[3 * n + 2]
    const X = x * cy + z * sy, Z0 = -x * sy + z * cy, Y = y * cp - Z0 * sp, D = y * sp + Z0 * cp, a = (n - from) / (now - from)
    yarn.color(ink[0] * (0.6 + 0.4 * a), ink[1], ink[2], (0.25 + 0.75 * a * a) * (1 + 0.5 * D * k))
    n === from ? yarn.moveTo(X * k, Y * k) : yarn.lineTo(X * k, Y * k)
  }
  const x = HB[3 * now], y = HB[3 * now + 1], z = HB[3 * now + 2]
  yarn.color(1, 1, 1, 1).moveTo(0, 0).lineTo((x * cy + z * sy) * k, (y * cp - (-x * sy + z * cy) * sp) * k, 0.03)
  f.ch.push(YARN)
  hv[0] = Math.hypot(x, y, z) * 1e6
  equation(f, 'B_{body}=R(q)^T B\\qquad m=-k\\frac{dB_{body}}{dt}\\qquad|B|=\\num{0}{00.0}\\,\\mu T', ink, 0.9, hv)
}

// ---- the hearts on a dual-trace sweep -----------------------------------------------------------------------------
// The firmware's lub-dub, b(φ) at 64 bpm, as each heart's LEDs show it (the rim at 0.82 of the centre), the leader on
// one trace and its twin on the other, 66.8 ms late: light's time round the planet. Under them the radio: each
// ESP-NOW beacon, 664 μs every 450 ms, the follower's 137 ms after the leader's. Two seconds across, rolling.
const T = 60 / 64, LAG = (Math.PI * RE) / C, gauss = (x: number, c: number, w: number) => Math.exp(-0.5 * ((x - c) / w) ** 2)
const beatOf = (t: number) => {
  const ph = ((t % T) + T) % T
  return Math.min(1, 0.98 * gauss(ph, 0.15, 0.088) + 0.62 * gauss(ph, 0.41, 0.12))
}
const sweep = new Path(), SWEEP = { w: 1, path: sweep }, bv = [0, 0], TWIN = [1, 0.6, 0.75]
export function beat(f: Frame, pt: number, ink: readonly number[]) {
  const W = 1.6, win = 2, n = 500
  sweep.clear()
  graticule(sweep, W, 0.75, 10, 8, ink)
  for (let h = 0; h < 2; h++)
    for (let l = 0; l < 6; l++) {
      const y0 = h ? -0.48 : 0.12, lag = h ? LAG : 0, c = h ? TWIN : ink
      const g = 0.82 + (0.18 * l) / 5
      for (let s = 0; s <= n; s++) {
        const tt = pt - win + (win * s) / n, x = -W + (2 * W * s) / n, y = y0 + 0.5 * g * beatOf(tt - lag)
        sweep.color(c[0], c[1], c[2], 0.25 + 0.75 * (s / n) ** 2)
        s ? sweep.lineTo(x, y) : sweep.moveTo(x, y)
      }
    }
  // the radio, its envelope a millisecond a point: a beacon is all of one point
  sweep.color(0.75, 0.85, 1, 0.8).moveTo(-W, -0.66)
  for (let s = 0; s <= 2000; s++) {
    const tt = pt - win + (win * s) / 2000, a = ((tt % 0.45) + 0.45) % 0.45, b = (((tt - 0.137) % 0.45) + 0.45) % 0.45
    sweep.lineTo(-W + (2 * W * s) / 2000, a < 0.001 || b < 0.001 ? -0.56 : -0.66)
  }
  f.ch.push(SWEEP)
  bv[0] = beatOf(pt), bv[1] = ((pt % T) + T) % T * 1000
  equation(f, 'b=0.98\\,e^{-\\frac{(\\varphi-150)^2}{2(88)^2}}+0.62\\,e^{-\\frac{(\\varphi-410)^2}{2(120)^2}}\\qquad\\varphi=\\num{1}{000}\\,ms', ink, 0.9, bv)
}

// ---- Pigeon Vision's fisheye ------------------------------------------------------------------------------------------
// One of the camera section's two 200° lenses, equidistant (r = fθ), looking out the side of the airframe as it leaves
// the rail into the low sun: the boost's first few hundred metres, h = ½at², time-lapsed into the cut, the roll turning
// the world past. The raster sees through the same lens (camera.wgsl); the beam draws through it the orbits overhead
// and the graticule on the ground.
export const FISH = 1.7453 / 0.97 // radians a unit of the screen: the rim, 100° off the axis, just inside its height
const ps: V = [0, 0, 0], E: V = [0, 0, 0], fw: V = [0, 0, 0], rt: V = [0, 0, 0], uv: V = [0, 0, 0], pn: V = [0, 0, 0], pe: V = [0, 0, 0], pN: V = [0, 0, 0], q: V = [0, 0, 0], L: V = [0, 0, 0]
// Where world point w lands through the lens, into seen; false past the rim or behind the planet.
function lens(w: ArrayLike<number>) {
  const dx = w[0] - E[0], dy = w[1] - E[1], dz = w[2] - E[2], l = Math.hypot(dx, dy, dz)
  const th = Math.acos(clamp((dx * fw[0] + dy * fw[1] + dz * fw[2]) / l, -1, 1))
  if (th > 1.74 || !clear(w)) return false
  const x = dx * rt[0] + dy * rt[1] + dz * rt[2], y = dx * uv[0] + dy * uv[1] + dz * uv[2], m = Math.hypot(x, y) || 1
  seen.x = ((th / FISH) * x) / m, seen.y = ((th / FISH) * y) / m
  return true
}
const sky = new Path(), SKY = { w: 0.6, path: sky }, fv = [0]
let pen = false
const to = (p: Path, w: ArrayLike<number>) => {
  if (!lens(w)) return (pen = false)
  pen ? p.lineTo(seen.x, seen.y) : p.moveTo(seen.x, seen.y)
  return (pen = true)
}
// The pose of the lens tc into the cut, at planet time pt: into pose (for paint), eye and axes kept here. Heights are
// launch.ts's (3048 m is half a radius), from where its camera section stands on the pad.
const HM = 360, PAD = PLACES.find((P) => P.id === 'launch')! // the climb shown, metres
export function fisheye(tc: number, dur: number, pt: number, pose: { eye: V; at: V; up: V }) {
  const s = site(PAD.lat, PAD.lon, ps), e = pe, N = pN
  frame(s, e, N)
  for (let i = 0; i < 3; i++) pn[i] = s[i] - 0.05 * e[i] + 0.03 * N[i] // the pad, as launch.ts has it
  unit(pn), frame(pn, pe, pN)
  clock(pt, L)
  const a = clamp(tc / dur), h = 0.035 + ((0.5 * HM) / 3048) * a * a, sun = Math.atan2(dot(L, pN), dot(L, pe)), roll = sun - 0.9 + 1.5 * tc, dip = 0.12
  fv[0] = HM * a * a
  for (let i = 0; i < 3; i++) {
    E[i] = pn[i] * (1 + h) + pe[i] * h * 0.1 // the rail's 84°, downrange
    fw[i] = Math.cos(dip) * (Math.cos(roll) * pe[i] + Math.sin(roll) * pN[i]) - Math.sin(dip) * pn[i]
    pose.eye[i] = E[i], pose.at[i] = E[i] + fw[i], pose.up[i] = pn[i]
  }
  unit(cross(fw, pn, rt)), cross(rt, fw, uv)
}
// The beam's share, once paint has drawn the world through the lens: the graticule, the orbits and the rim.
const RING = 97
export function fishBeam(f: Frame, pt: number, ink: readonly number[]) {
  sky.clear()
  sky.color(0.55, 0.8, 1, 0.12)
  for (let lon = 0; lon < 360; lon += 15) {
    pen = false
    for (let lat = -90; lat <= 90; lat += 3) to(sky, site(lat, lon, q))
  }
  for (let lat = -75; lat <= 75; lat += 15) {
    pen = false
    for (let lon = 0; lon <= 360; lon += 3) to(sky, site(lat, lon, q))
  }
  for (let pl = 0; pl < 6; pl++) {
    sky.color(0.35, 0.55, 1, 0.25), (pen = false)
    for (let i = 0; i < RING; i++) to(sky, orbit(4.17, (pl * TAU) / 6, 55 * DEG, (i / (RING - 1)) * TAU, q))
    for (let sv = 0; sv < 4; sv++) if (lens(orbit(4.17, (pl * TAU) / 6, 55 * DEG, (sv * TAU) / 4 + (pl * TAU) / 24 + 0.05 * pt, q))) sky.color(0.75, 0.9, 1, 1).dot(seen.x, seen.y, 0.01)
  }
  sky.color(0.75, 0.6, 1, 0.4), (pen = false)
  for (let i = 0; i < RING; i++) to(sky, orbit(1.086, 0.4, 97.6 * DEG, (i / (RING - 1)) * TAU, q))
  sky.color(ink[0], ink[1], ink[2], 0.5).circle(0, 0, 0.97, 128)
  f.ch.push(SKY)
  equation(f, 'r=f\\theta\\qquad\\theta\\le100°\\qquad h=\\num{0}{0000}\\,m', ink, 0.9, fv)
}

// Ephemeris-1 under the GPS constellation: every satellite in view sends its ray down to the board, and the board
// finds each of them the way a receiver does, by correlation.
//
// The rays. The Walker 24/6/1 shell planet.ts draws, PRN 1 to 24 in slot order. A ray is dashed by its PRN's own C/A
// code (dsp/gps.ts), the chips stretched to be seen and running down to the antenna.
// The capture. Four milliseconds of what a MAX2769B hands over, two bits a rail, taken here as complex baseband at
// 2.048 MHz (the board's own stream is 16.368 MHz), so a code period is 2048 samples. In it every satellite in view, its code delayed by its range (modulo a period), its
// carrier off by its Doppler −ṙ/c · L1 (the shell goes round 343× fast here; the rates are scaled back to real ones),
// at C/N₀ = P/kT less the front end's 1.4 dB, P = −157 dBW overhead and falling as 1/ρ², and noise 18 dB over it.
// The search. For each Doppler bin the capture is mixed down and correlated against the PRN's code at every code
// phase at once, R = IFFT(FFT(x e^{−2πift}) · FFT(c)*), a millisecond at a time, the four |R|² summed (one alone leaves
// the peak too close to the tallest of 84 000 cells of noise): the surface, Doppler one way, code phase the other. A
// few bins a frame, so the surface is swept as a receiver sweeps it. Its peak is where the satellite is; the numbers
// under the equation are read off the peak, not known.
// driftwood. A pin walks the river in the valley at 1.4 m/s (the river is 120 m long at its 1:400), and back.
import { equation } from '../../acts/reality'
import { TAU, view } from '../../acts/scene'
import { Path } from '../../beam/path'
import { fft } from '../../dsp/fft'
import { CODES, L1 } from '../../dsp/gps'
import { gnss } from '../copper'
import { clear, ctx, frame, look, seen, site, unit, type V } from '../ctx'
import { PLACES, RIVER } from '../places'
import { C, DEG, RE, numbers, orbit, to, up } from './sky'

const RATE = 0.05, SHELL = 4.17, INC = 55 * DEG // the shell, as planet.ts draws it
const LAPSE = RATE / (TAU / 43082) // real seconds a scene second: a GPS orbit is half a sidereal day
const MASK = Math.sin(5 * DEG), CHIP = 0.03, RUN = 14 // elevation mask; a chip on a ray, radii; chips a second down it
const FS = 2.048e6, NS = 2048, MS = 4, ROWS = 41, BIN = 250, COLS = 256, POOL = NS / COLS // a code period; Doppler ±5 kHz in 250 Hz bins
const SWEEP = 3, HOLD = 0.8 // bins a frame; seconds a found peak is held
const WX = 0.055, WY = 0.036, WH = 0.06, LIFT = 0.022 // the surface over the board: half-widths, height, radii

// ---- the sky, each frame ----------------------------------------------------------------------------------------
const n: V = [0, 0, 0], e: V = [0, 0, 0], N: V = [0, 0, 0], rx: V = [0, 0, 0]
const S: V = [0, 0, 0], v: V = [0, 0, 0]
const dir = new Float64Array(24 * 3), range = new Float64Array(24), doppler = new Float64Array(24), seenUp = new Uint8Array(24)
function sky(t: number) {
  for (let i = 0; i < 24; i++) {
    const raan = ((i >> 2) * TAU) / 6, u = ((i & 3) * TAU) / 4 + ((i >> 2) * TAU) / 24 + RATE * t
    orbit(SHELL, raan, INC, u, S), orbit(SHELL * RATE, raan, INC, u + Math.PI / 2, v)
    const dx = S[0] - rx[0], dy = S[1] - rx[1], dz = S[2] - rx[2], r = Math.hypot(dx, dy, dz)
    dir[3 * i] = dx / r, dir[3 * i + 1] = dy / r, dir[3 * i + 2] = dz / r, range[i] = r
    seenUp[i] = +((dx * n[0] + dy * n[1] + dz * n[2]) / r > MASK)
    doppler[i] = ((-(v[0] * dx + v[1] * dy + v[2] * dz) / r) * RE) / LAPSE / C * L1
  }
}

// ---- the receiver ---------------------------------------------------------------------------------------------
const xr = new Float64Array(MS * NS), xi = new Float64Array(MS * NS), yr = new Float64Array(NS), yi = new Float64Array(NS), acc = new Float64Array(NS)
const spectra: (Float64Array[] | undefined)[] = []
// FFT(c)* of PRN i + 1's code, sampled as the capture is
function spectrum(i: number) {
  return (spectra[i] ??= (() => {
    const re = new Float64Array(NS), im = new Float64Array(NS)
    for (let k = 0; k < NS; k++) re[k] = 1 - 2 * CODES[i][Math.floor((k * 1023) / NS)]
    fft(re, im)
    for (let k = 0; k < NS; k++) im[k] = -im[k]
    return [re, im]
  })())
}
const gauss = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(TAU * Math.random())
// MS milliseconds off the antenna, as the front end quantises them: sign and magnitude, the threshold at the noise's σ.
function capture() {
  for (let k = 0; k < MS * NS; k++) (xr[k] = gauss()), (xi[k] = gauss())
  for (let i = 0; i < 24; i++) {
    if (!seenUp[i]) continue
    const m = range[i] * RE, cn0 = 45.6 - 20 * Math.log10(range[i] / (SHELL - 1)), a = Math.sqrt((2 * 10 ** (cn0 / 10)) / FS)
    const tau = (((m / C) * 1e3) % 1) * NS, w = (TAU * doppler[i]) / FS, code = CODES[i]
    let cr = Math.cos(TAU * ((m / (C / L1)) % 1)), ci = -Math.sin(TAU * ((m / (C / L1)) % 1))
    const wr = Math.cos(w), wi = Math.sin(w)
    for (let k = 0; k < MS * NS; k++) {
      const s = a * (1 - 2 * code[Math.floor(((k - tau + NS) * 1023) / NS) % 1023])
      xr[k] += s * cr, xi[k] += s * ci
      const c = cr * wr - ci * wi
      ci = cr * wi + ci * wr, cr = c
    }
  }
  for (let k = 0; k < MS * NS; k++) (xr[k] = Math.sign(xr[k]) * (Math.abs(xr[k]) > 1 ? 3 : 1)), (xi[k] = Math.sign(xi[k]) * (Math.abs(xi[k]) > 1 ? 3 : 1))
}
const H = new Float32Array(ROWS * COLS), age = new Uint8Array(ROWS) // |R|² over its floor; which rows this dwell has swept
const found = { prn: 0, f: 0, tau: 0, cn0: 0, row: 0, col: 0, h: 0 }
let cur = -1, row = ROWS, hold = 0, sum = 0, best = 0, bestRow = 0, bestLag = 0, floor = MS * NS * 10
// One Doppler bin of the search for PRN cur + 1.
function bin(j: number) {
  const w = (-TAU * (j - (ROWS - 1) / 2) * BIN) / FS, wr = Math.cos(w), wi = Math.sin(w), [cre, cim] = spectrum(cur)
  acc.fill(0)
  for (let b = 0; b < MS; b++) {
    for (let k = 0, o = b * NS, cr = 1, ci = 0; k < NS; k++) {
      yr[k] = xr[o + k] * cr - xi[o + k] * ci, yi[k] = xr[o + k] * ci + xi[o + k] * cr
      const c = cr * wr - ci * wi
      ci = cr * wi + ci * wr, cr = c
    }
    fft(yr, yi)
    for (let k = 0; k < NS; k++) {
      const a = yr[k] * cre[k] - yi[k] * cim[k]
      yi[k] = -(yr[k] * cim[k] + yi[k] * cre[k]), yr[k] = a // conjugated, so a forward transform inverts it
    }
    fft(yr, yi)
    for (let k = 0; k < NS; k++) acc[k] += (yr[k] * yr[k] + yi[k] * yi[k]) / (NS * NS)
  }
  for (let c = 0; c < COLS; c++) {
    let top = 0
    for (let k = c * POOL; k < (c + 1) * POOL; k++) {
      const P = acc[k]
      sum += P
      if (P > top) top = P
      if (P > best) (best = P), (bestRow = j), (bestLag = k)
    }
    H[j * COLS + c] = top / floor
  }
  age[j] = 1
}
function search(dt: number) {
  if (row >= ROWS) {
    if ((hold -= dt) > 0) return
    // the next satellite in view, a fresh millisecond
    let k = cur
    do k = (k + 1) % 24
    while (!seenUp[k] && k !== cur)
    if (!seenUp[k]) return
    cur = k, row = 0, sum = 0, best = 0, hold = HOLD
    age.fill(0), capture()
  }
  for (let j = 0; j < SWEEP && row < ROWS; j++) bin(row++)
  if (row < ROWS) return
  floor = sum / (ROWS * NS)
  found.prn = cur + 1, found.f = (bestRow - (ROWS - 1) / 2) * BIN, found.tau = (bestLag * 1023) / NS
  found.cn0 = 10 * Math.log10(Math.max(best / floor - 1, 1e-3) * 1e3) // signal over noise in the 1 kHz a millisecond resolves
  found.row = bestRow, found.col = Math.floor(bestLag / POOL), found.h = best / floor
}

// The intro's cut to it: far enough back to hold the board, the search over it and the rays coming down.
export function shot(k: number, tc: number, pose: { eye: V; at: V; up: V }) {
  if (!ready) init(k)
  const a = -0.5 + 0.3 * tc
  for (let i = 0; i < 3; i++) {
    pose.up[i] = n[i]
    pose.at[i] = rx[i] + n[i] * LIFT
    pose.eye[i] = pose.at[i] + 0.2 * (Math.sin(a) * e[i] + Math.cos(a) * N[i]) + 0.06 * n[i]
  }
}

// ---- what the beam draws -------------------------------------------------------------------------------------
const rays = new Path(), surf = new Path(), pin = new Path()
const hue = (i: number, o: number[]) => {
  const h = i / 24
  o[0] = 0.62 + 0.38 * Math.cos(TAU * h), o[1] = 0.72 + 0.28 * Math.cos(TAU * (h - 0.33)), o[2] = 0.8 + 0.2 * Math.cos(TAU * (h - 0.67))
  return o
}
const col = [0, 0, 0], vals = [0, 0, 0, 0], o3: V = [0, 0, 0]
const O = [0, 0, 0], EX = [0, 0, 0], NY = [0, 0, 0], UZ = [0, 0, 0]
let ready = false, clockS = 0
const RW: number[] = []
function init(k: number) {
  site(PLACES[k].lat, PLACES[k].lon, n), frame(n, e, N)
  for (let i = 0; i < 3; i++) rx[i] = n[i] * 1.012
  // the river's own points (planet.ts lays them the same way), for the pin
  const valley = PLACES.find((P) => P.id === 'valley')!, s = site(valley.lat, valley.lon), a: V = [0, 0, 0], b: V = [0, 0, 0]
  frame(s, a, b)
  for (let i = 0; i < RIVER.length; i += 2) {
    const g = unit([0, 1, 2].map((j) => s[j] + a[j] * RIVER[i] + b[j] * RIVER[i + 1]))
    RW.push(g[0] * 1.0015, g[1] * 1.0015, g[2] * 1.0015)
  }
  ready = true
}
// a world vector in the camera's frame
function cam(w: ArrayLike<number>, o: number[]) {
  const p = ctx.p
  o[0] = w[0] * p[4] + w[1] * p[5] + w[2] * p[6], o[1] = w[0] * p[8] + w[1] * p[9] + w[2] * p[10], o[2] = w[0] * p[12] + w[1] * p[13] + w[2] * p[14]
}
// a point of the surface: x, y in [−1, 1], h its height; through the camera without asking the planet again
function pt(x: number, y: number, h: number, pen: boolean) {
  const a = x * WX, b = y * WY, c = h * WH
  const z = O[2] + EX[2] * a + NY[2] * b + UZ[2] * c
  if (z < 0.02) return false
  const sx = ((O[0] + EX[0] * a + NY[0] * b + UZ[0] * c) * ctx.p[3]) / z, sy = ((O[1] + EX[1] * a + NY[1] * b + UZ[1] * c) * ctx.p[3]) / z
  if (Math.abs(sx) > 4 || Math.abs(sy) > 3) return false
  if (pen) surf.lineTo(sx, sy)
  else surf.moveTo(sx, sy)
  return true
}

export function draw(k: number) {
  if (!ready) init(k)
  const t = ctx.t, p = ctx.p, here = ctx.focus === k
  const close = Math.hypot(rx[0] - ctx.E[0], rx[1] - ctx.E[1], rx[2] - ctx.E[2]) < 0.9
  sky(t)
  if (close) search(ctx.dt)
  gnss(xr, xi, here) // the capture, leaving the MAX2769B on its four lines

  // the rays, each in its own code
  rays.clear()
  const slide = RUN * t, whole = Math.floor(slide), frac = slide - whole
  for (let i = 0; i < 24; i++) {
    if (!seenUp[i]) continue
    const code = CODES[i], r = range[i], dx = dir[3 * i], dy = dir[3 * i + 1], dz = dir[3 * i + 2]
    hue(i, col), rays.color(col[0], col[1], col[2], close && i === cur ? 1.1 : 0.42)
    for (let j = 0, a = -1; (j - frac) * CHIP < r; j++) {
      const on = code[(j + whole) % 1023]
      if (on && a < 0) a = Math.max(0, j - frac) * CHIP
      const b = Math.min(r, (j + 1 - frac) * CHIP)
      if (a >= 0 && (!code[(j + 1 + whole) % 1023] || b >= r)) {
        up(), to(rays, rx[0] + dx * a, rx[1] + dy * a, rx[2] + dz * a), to(rays, rx[0] + dx * b, rx[1] + dy * b, rx[2] + dz * b)
        a = -1
      }
    }
  }
  ctx.f.ch.push({ w: 0.4, path: rays })

  // the search, over the board
  if (close && cur >= 0) {
    surf.clear()
    for (let i = 0; i < 3; i++) o3[i] = rx[i] + n[i] * LIFT - ctx.E[i]
    if (clear(rx)) {
      cam(o3, O), cam(e, EX), cam(N, NY), cam(n, UZ)
      hue(cur, col)
      for (let j = 0; j < ROWS; j++) {
        const y = (2 * j) / (ROWS - 1) - 1, lit = age[j] ? 1 : 0.3, scan = j === row - 1 && row < ROWS
        let pen = false
        for (let c = 0; c < COLS; c++) {
          const h = Math.min(H[j * COLS + c] / 28, 1.3)
          if (scan) surf.color(1, 1, 1, 0.9)
          else surf.color(col[0], col[1], col[2], lit * Math.min(1.5, 0.02 + 5 * h * h))
          pen = pt((2 * c) / (COLS - 1) - 1, y, h, pen)
        }
      }
      // its frame, and the peak: a stem down to the plane and the two readings across it
      surf.color(col[0], col[1], col[2], 0.25)
      pt(-1, -1, 0, false), pt(1, -1, 0, true), pt(1, 1, 0, true), pt(-1, 1, 0, true), pt(-1, -1, 0, true)
      if (row >= ROWS) {
        const x = (2 * found.col) / (COLS - 1) - 1, y = (2 * found.row) / (ROWS - 1) - 1, h = Math.min(found.h / 28, 1.3)
        surf.color(1, 1, 1, 0.5), pt(x, -1, 0, false), pt(x, 1, 0, true), pt(-1, y, 0, false), pt(1, y, 0, true)
        surf.color(1, 1, 1, 1), pt(x, y, 0, false)
        if (pt(x, y, h, true)) surf.lineTo(surf.tip()[0], surf.tip()[1], 0.02)
      }
    }
    ctx.f.ch.push({ w: 0.9, path: surf })
    if (here) {
      vals[0] = found.prn, vals[1] = found.f, vals[2] = found.tau, vals[3] = found.cn0
      equation(ctx.f, 'R_k(\\tau,f)=|\\sum_n x_n\\,c_k(n-\\tau)\\,e^{-2\\pi ifn/f_s}|^2', PLACES[k].ink)
      numbers('k=\\num{0}{00}\\quad f=\\num{1}{-0000}\\,Hz\\quad\\tau=\\num{2}{0000.0}\\quad C/N_0=\\num{3}{00.0}\\,dB\\,Hz', PLACES[k].ink, vals)
    }
  }

  // driftwood's pin, walking the river and back
  clockS += ctx.dt
  const M = RW.length / 3 - 1, s = ((1.4 * clockS) / 0.25) % (2 * M), back = s > M, f = back ? 2 * M - s : s, i0 = Math.min(M - 1, Math.floor(f)), g = f - i0
  for (let i = 0; i < 3; i++) o3[i] = RW[3 * i0 + i] + (RW[3 * i0 + 3 + i] - RW[3 * i0 + i]) * g
  pin.clear()
  if (look(o3)) {
    const x0 = seen.x, y0 = seen.y, r = (0.004 * p[3]) / seen.d
    for (let i = 0; i < 3; i++) o3[i] *= 1.012
    if (look(o3) && Math.abs(seen.x) < view.a && r < 0.2) {
      pin.color(0.6, 1, 0.7, 1).moveTo(x0, y0).lineTo(seen.x, seen.y - r).circle(seen.x, seen.y, r, 16)
      pin.moveTo(x0, y0)
      pin.lineTo(x0, y0, 0.01)
      up()
      for (let a = 60; a >= 0; a--) {
        const j = back ? i0 + 1 + a : i0 - a // the last 15 m it walked
        if (j >= 0 && j <= M) pin.color(0.6, 1, 0.7, 0.9 * (1 - a / 60)), to(pin, RW[3 * j], RW[3 * j + 1], RW[3 * j + 2])
      }
      ctx.f.ch.push({ w: 0.06, path: pin })
    }
  }
}

// What it sounds like: every satellite in view as its carrier is once its code is wiped off, a tone, at 1320 Hz and
// a quarter of its Doppler (two octaves down: ±4.5 kHz would not fit under it), so each falls the whole of its
// pass, from rising to setting, as loud as 1/ρ. Its own C/A code still keys it, the phase turned over chip by chip
// at the pace the rays run. The one being searched for stands out, as its ray does.
const amp = new Float32Array(24), chip = new Float32Array(24), turns = new Float64Array(24)
export function voice(t: number, dt: number) {
  const c = ((Math.floor(RUN * t) % 1023) + 1023) % 1023
  let out = 0
  for (let i = 0; i < 24; i++) {
    const a = (amp[i] += 4e-4 * ((seenUp[i] ? ((SHELL - 1) / range[i]) * (i === cur ? 1 : 0.4) : 0) - amp[i]))
    if (a < 1e-3) continue
    chip[i] += 4e-3 * (1 - 2 * CODES[i][c] - chip[i])
    turns[i] += dt * (1320 + doppler[i] / 4)
    out += a * chip[i] * Math.sin(TAU * turns[i])
  }
  return 0.25 * out
}

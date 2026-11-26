// The valley: the intro's river, and at its middle the pool where esp-dvbs2 stands, a whole DVB-S2 transmitter out
// of one ESP32-S3's own Wi-Fi radio. The pool is its I/Q plane, I downstream and Q across, with a stone at every
// point of 8PSK, as the intro's pool had. What rises from it is the signal itself with its time axis stood on end:
// s(t) = Σ aₖ g(t − kT), the raised-cosine pulses of dsp/dvbs2.ts, each symbol a step up the tower, so the newest is
// at the water and every chord of the constellation is a thread of the weave. A pulse g has no intersymbol
// interference, so the curve passes through a stone's own vertical at every symbol. The stream is real framing:
// normal FECFRAMEs of 8PSK 9/10 with pilots, 58 192 bits in 22 194 symbols, which at esp-dvbs2's 69.8 Mb/s is its
// 36 MHz. A header (90 symbols of π/2-BPSK) climbs as a white zigzag between two points, a pilot block (36 symbols on
// one point) as a straight amber rod. Shown at 60 symbols a second.
import { equation } from '../../acts/reality'
import { TAU } from '../../acts/scene'
import { Path } from '../../beam/path'
import { Frames, Kind, SPAN, rc, rings } from '../../dsp/dvbs2'
import { ctx, cross, frame, site, unit, type V } from '../ctx'
import { PLACES, RIVER } from '../places'
import { numbers, to, up } from './sky'

const PSK8 = rings('8PSK', '9/10', 17, [[8, 1, 0]])
const tx = new Frames(1, () => PSK8, 64800), FRAME = Frames.len(PSK8, 64800)
const RS = 60, T0 = 4096 // symbols a second, here; and the stream began this long before the planet's clock
const A = 0.026, DZ = 0.0019, TALL = 250 // the unit circle, a symbol's rise, the symbols drawn (radii)

// transmitted symbols by index, cached
const M = 1024, CK = new Float64Array(M).fill(-1), CI = new Float32Array(M), CQ = new Float32Array(M), CT = new Uint8Array(M), o = { i: 0, q: 0 }
function sym(k: number) {
  const j = k & (M - 1)
  if (CK[j] !== k) (CK[j] = k), (CT[j] = tx.sym(k, o)), (CI[j] = o.i), (CQ[j] = o.q)
  return j
}
const INK = [[1, 1, 1], [1, 0.72, 0.3], [0.45, 0.75, 1]] // header, pilot, data (dvbs2.Kind)

const tower = new Path(), pool = new Path(), TOWER = { w: 1, path: tower }, POOL = { w: 0.2, path: pool }
const g: V = [0, 0, 0], e: V = [0, 0, 0], N: V = [0, 0, 0], u: V = [0, 0, 0], v: V = [0, 0, 0], vals = [0, 0, 0]
let k0 = -1
// the pool's place: the river's middle, and which way the river runs there
function lay(k: number) {
  const P = PLACES[k], n = site(P.lat, P.lon), i = RIVER.length >> 2 << 1, dx = RIVER[i + 2] - RIVER[i - 2], dy = RIVER[i + 3] - RIVER[i - 1]
  frame(n, e, N)
  for (let j = 0; j < 3; j++) g[j] = n[j] + e[j] * RIVER[i] + N[j] * RIVER[i + 1]
  unit(g), frame(g, e, N)
  for (let j = 0; j < 3; j++) u[j] = (e[j] * dx + N[j] * dy) / Math.hypot(dx, dy)
  cross(g, u, v), (k0 = k)
}
// the pen to (I, Q) on the plane z above the water
const pen = (p: Path, i: number, q: number, z: number) =>
  to(p, g[0] * (1.003 + z) + A * (i * u[0] + q * v[0]), g[1] * (1.003 + z) + A * (i * u[1] + q * v[1]), g[2] * (1.003 + z) + A * (i * u[2] + q * v[2]))

export function draw(k: number) {
  if (k !== k0) lay(k)
  if (g[0] * ctx.E[0] + g[1] * ctx.E[1] + g[2] * ctx.E[2] < 0.6) return
  const focus = ctx.focus === k, x = (ctx.t + T0) * RS, kn = Math.floor(x), per = focus ? 6 : 3, tall = focus ? TALL : 160
  tower.clear(), pool.clear()
  // the signal, newest at the water
  up()
  for (let s = 0; s <= tall * per; s++) {
    const xs = x - s / per, ks = Math.floor(xs), f = xs - ks
    let I = 0, Q = 0
    for (let m = 1 - SPAN; m <= SPAN; m++) {
      const j = sym(ks + m), w = rc(f - m)
      I += CI[j] * w, Q += CQ[j] * w
    }
    const c = INK[CT[sym(ks + (f > 0.5 ? 1 : 0))]], age = s / (tall * per)
    tower.color(c[0], c[1], c[2], (c === INK[2] ? 0.2 : 0.7) * (1 - age) ** 1.4 + 0.012)
    pen(tower, I, Q, (s / per) * DZ)
  }
  // the stones, each with its vertical up the tower, and the ring they stand on
  const pts = PSK8.pts, now = sym(kn), hit = x - kn
  for (let p = 0; p < 8; p++) {
    const i = pts[2 * p], q = pts[2 * p + 1], on = Math.hypot(CI[now] - i, CQ[now] - q) < 0.1
    up(), pool.color(0.45, 0.75, 1, 0.16), pen(pool, i, q, 0), pen(pool, i, q, tall * DZ)
    up(), pool.color(0.8, 0.92, 1, 0.9)
    for (let a = 0; a <= 8; a++) pen(pool, i + 0.07 * Math.cos((a * TAU) / 8), q + 0.07 * Math.sin((a * TAU) / 8), 0)
    // the symbol just sent, a splash round its stone
    if (on && CT[now] === Kind.Data) {
      up(), pool.color(1, 1, 1, 1.6 * (1 - hit))
      for (let a = 0; a <= 12; a++) pen(pool, i + (0.1 + 0.25 * hit) * Math.cos((a * TAU) / 12), q + (0.1 + 0.25 * hit) * Math.sin((a * TAU) / 12), 0)
    }
  }
  up(), pool.color(0.5, 0.8, 1, 0.35)
  for (let a = 0; a <= 48; a++) pen(pool, 1.25 * Math.cos((a * TAU) / 48), 1.25 * Math.sin((a * TAU) / 48), 0)
  TOWER.w = focus ? 1.2 : 0.4
  ctx.f.ch.push(TOWER, POOL)
  if (!focus) return
  vals[0] = kn % FRAME, vals[1] = CI[now], vals[2] = CQ[now]
  equation(ctx.f, 's(t)=\\sum_k a_k\\,g(t-kT)\\qquad\\frac{58192}{22194}\\,R_s=69.8\\,Mb/s', PLACES[k].ink)
  numbers('k=\\num{0}{00000}\\qquad I=\\num{1}{-0.00}\\qquad Q=\\num{2}{-0.00}', PLACES[k].ink, vals)
}

// What it sounds like: the same s(t) on a carrier, as it leaves the antenna, Re s(t) e^{2πi f t}, the carrier
// brought down to 480 Hz, eight cycles to a symbol. A pilot block is 0.6 s of bare tone and a header a second and a
// half of one phase rocking; the data is that tone made to carry three bits, sixty times a second.
const FC = 8 * RS, EVERY = 32 // the envelope is slow: it is found every 32nd sample, and runs straight between
let vi = 0, vq = 0, di = 0, dq = 0, due = 0
export function voice(t: number, dt: number) {
  if (--due < 0) {
    const x = (t + EVERY * dt + T0) * RS, k = Math.floor(x), f = x - k
    let I = 0, Q = 0
    for (let m = 1 - SPAN; m <= SPAN; m++) {
      const j = sym(k + m), w = rc(f - m)
      I += CI[j] * w, Q += CQ[j] * w
    }
    di = (I - vi) / EVERY, dq = (Q - vq) / EVERY, due = EVERY - 1
  }
  vi += di, vq += dq
  return 0.28 * (vi * Math.cos(TAU * FC * t) - vq * Math.sin(TAU * FC * t))
}

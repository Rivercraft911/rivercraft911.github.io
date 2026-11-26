// Rava Heart: two heart-shaped boards of 144 LEDs that keep one heartbeat between them over ESP-NOW. One stands here
// and its twin at the antipode, as far apart as two things on a planet can be. Everything is the firmware's own: the
// LED matrix in the order its two chains are clocked, the 64 bpm lub-dub b(φ), a centre a little hotter than the rim,
// and a 16-byte beacon of the beat's phase broadcast every 450 ms on channel 6. On air that beacon is a vendor action
// frame at 1 Mb/s behind the long preamble, 664 µs or 199 km of it, drawn at its true length as six wavefronts (sync,
// PLCP header, MAC header, ESP-NOW header, payload, FCS). A broadcast leaves in every direction, so on a sphere it is
// a ring that widens to the equator and closes again on the antipode, as bright as its circumference is short: every
// frame the one heart sends comes to a focus on the other. Light takes πR/c = 66.8 ms to get there, so the follower
// (the higher MAC) beats that much late; the rings are shown 25× slower than light, the beat in real time.
import { equation } from '../../acts/reality'
import { Path } from '../../beam/path'
import { ctx, frame, look, seen, site, solid, type V } from '../ctx'
import { PLACES } from '../places'
import { C, RE, numbers, to, up } from './sky'

// column (5.6 mm apart) and row (5.2 mm) of every LED, chain 0 then chain 1, as HeartArray.kicad_pcb places them
const COL = '6776545677654323456776543212345677654321012345677654321002345665432345439889aba9889abcdcba9889abcdedcba9889abcdefedcba9889abcdeffdcba99abcdcbabc'
const ROW = 'ddcccbbbbaaaaa9999998888887777777666666655555555444444443333332222111100'.repeat(2)
const LEDS = 144, LX = new Float32Array(LEDS), LZ = new Float32Array(LEDS), LIFT = new Float32Array(LEDS)
for (let i = 0; i < LEDS; i++) {
  const c = parseInt(COL[i], 16), r = parseInt(ROW[i], 16)
  LX[i] = 5.6 * c - 42, LZ[i] = 5.2 * r - 40.65 // mm from the outline's centre, x right, z down the page
  LIFT[i] = Math.min(1, Math.max(0.82, 1.1 - 0.32 * Math.hypot(c / 15 - 0.5, (13 - r) / 13 - 0.53)))
}
const T = 60 / 64, SYNC = 0.45, LAG = (Math.PI * RE) / C // the beat, the beacon's interval, light's time to the antipode
const SLOW = 25, FLIGHT = LAG * SLOW, RAD = (C * 1e-6) / RE // radians of ground a microsecond of frame covers
const gauss = (x: number, c: number, w: number) => Math.exp(-0.5 * ((x - c) / w) ** 2)
const beat = (ph: number) => Math.min(1, 0.98 * gauss(ph, 0.15, 0.088) + 0.62 * gauss(ph, 0.41, 0.12))
const mod = (a: number, b: number) => ((a % b) + b) % b
// The frame's fields, in the order they pass: µs each, and how the beam inks them.
const FIELDS: [us: number, r: number, g: number, b: number][] = [[144, 0.75, 0.85, 1], [48, 1, 0.8, 0.45], [192, 0.4, 0.55, 1], [120, 0.4, 0.55, 1], [128, 1, 0.3, 0.5], [32, 0.4, 0.55, 1]]
const AIR = FIELDS.reduce((a, f) => a + f[0], 0)

const SIZE = 0.06, TILT = 0.9, FACE = -0.45, MM = SIZE / 94.5 // radii across; its lean back from flat; the bearing it faces; radii a millimetre
const leds = new Path(), air = new Path()
const n: V = [0, 0, 0], e: V = [0, 0, 0], N: V = [0, 0, 0], m: V = [0, 0, 0], c: V = [0, 0, 0], w: V = [0, 0, 0]
const ax: V = [0, 0, 0], ay: V = [0, 0, 0], az: V = [0, 0, 0], mc = [0, 0, 0]
const LIT = { w: 0.35, path: leds }, RINGS = { w: 0.3, path: air }

// A heart stood at unit g, leaning back to face whoever comes from bearing FACE, lit as the firmware lights it at phase ph.
function heart(g: V, ph: number) {
  frame(g, e, N)
  const ct = Math.cos(TILT), st = Math.sin(TILT), cf = Math.cos(FACE), sf = Math.sin(FACE), M = ctx.models.heart, env = beat(ph), top = M ? M.hi[1] * 1000 : 2.8
  for (let j = 0; j < 3; j++) {
    const h = cf * N[j] + sf * e[j] // the way it faces, along the ground
    ax[j] = sf * N[j] - cf * e[j], ay[j] = ct * g[j] + st * h, az[j] = ct * h - st * g[j]
    c[j] = g[j] * (1.004 + 44 * MM * st)
    mc[j] = M ? (M.lo[j] + M.hi[j]) * 500 : 0 // the model is placed by its box's middle, mm
  }
  solid('heart', c, ax, ay, az, SIZE)
  w[0] = c[0] - ctx.E[0], w[1] = c[1] - ctx.E[1], w[2] = c[2] - ctx.E[2]
  const px = (1.75 * MM * ctx.p[3]) / Math.hypot(w[0], w[1], w[2]) // a WS2812B-MINI's half-width on the screen
  for (let i = 0; i < LEDS; i++) {
    const x = (LX[i] - mc[0]) * MM, y = (top - mc[1]) * MM, z = (LZ[i] - mc[2]) * MM, v = Math.min(1, 0.018 + env * LIFT[i])
    for (let j = 0; j < 3; j++) w[j] = c[j] + ax[j] * x + ay[j] * y + az[j] * z
    if (!look(w)) continue
    leds.color(1, 0.07 + 0.25 * v * v, 0.1 + 0.2 * v * v, 0.25 + 2.2 * v)
    if (px > 0.004) leds.circle(seen.x, seen.y, px, 6)
    leds.dot(seen.x, seen.y, 0.0015 + 0.006 * v)
  }
  return env
}

// The wavefront th radians of ground from the heart at n (π − th from its twin), at 1.006 radii.
let fine = 96 // a great circle's segments
function ring(th: number, i: number, r: number, g: number, b: number) {
  const s = Math.sin(th), co = Math.cos(th), k = Math.max(48, Math.ceil(fine * s))
  air.color(r, g, b, i * Math.min(7, 1 / Math.max(s, 1e-3)))
  up()
  for (let q = 0; q <= k; q++) {
    const a = (q / k) * 2 * Math.PI, x = s * Math.cos(a), y = s * Math.sin(a)
    to(air, 1.006 * (co * n[0] + x * e[0] + y * N[0]), 1.006 * (co * n[1] + x * e[1] + y * N[1]), 1.006 * (co * n[2] + x * e[2] + y * N[2]))
  }
}

const vals = [0, 0]
export function draw(k: number) {
  const P = PLACES[k], t = ctx.t, focus = ctx.focus === k
  leds.clear(), air.clear()
  site(P.lat, P.lon, n)
  m[0] = -n[0], m[1] = -n[1], m[2] = -n[2]
  const ph = mod(t, T), env = heart(n, ph)
  heart(m, mod(t - LAG, T))
  frame(n, e, N), (fine = focus ? 200 : 144)
  // the beacons in flight: every 450 ms from each heart, the follower's 137 ms after the leader's, out and round
  for (let from = 0; from < 2; from++) {
    const t0 = t - 0.137 * from
    for (let j = Math.floor(t0 / SYNC), age; (age = t0 - j * SYNC) < FLIGHT * (1 + (AIR * RAD) / Math.PI); j--) {
      let us = 0
      for (let f = 0; f < FIELDS.length; f++) {
        const F = FIELDS[f], th = (age / FLIGHT) * Math.PI - (us + F[0] / 2) * RAD // this field's middle, behind the frame's leading edge
        us += F[0]
        if (th > 0.004 && th < Math.PI - 0.004 && (focus || f === 0 || f === 4)) ring(from ? Math.PI - th : th, F[0] / (focus ? 1500 : 4000), F[1], F[2], F[3])
      }
    }
  }
  RINGS.w = focus ? 0.6 : 0.3
  ctx.f.ch.push(LIT, RINGS)
  if (!focus) return
  vals[0] = env, vals[1] = ph * 1000
  equation(ctx.f, 'b=0.98\\,e^{-\\frac{(\\varphi-150)^2}{2(88)^2}}+0.62\\,e^{-\\frac{(\\varphi-410)^2}{2(120)^2}}', P.ink)
  numbers('b=\\num{0}{0.00}\\qquad\\varphi=\\num{1}{000}\\,ms\\qquad\\frac{\\pi R}{c}=66.8\\,ms\\qquad c\\to c/25', P.ink, vals)
}

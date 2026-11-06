// Live demos, drawn by the beam into the box a project's page leaves for them. Each is a pure function
// of the time since the project was opened. Box: x0 < x1, y0 < y1 in scope units.
import { Path } from '../beam/path'
import { text, type Face } from '../beam/font'
import { APSK16, Frames, Kind, PLH, PSK8, QPSK, rc, rings, SPAN, type Constellation } from '../dsp/dvbs2'
import { TAU, clamp, hash } from '../acts/scene'
import { DIT, KEYING, station, type Ear } from './voice'

export type Box = { x0: number; y0: number; x1: number; y1: number }
const GREEN = [0.35, 1, 0.55] as const

// ---- DVB-S2: the real framing from src/dsp/dvbs2.ts, at a symbol rate the eye can follow -------------
const P = Math.PI
const QPSK910: Constellation = { ...QPSK, rate: '9/10', modcod: 11 }
const PSK8_910: Constellation = { ...PSK8, rate: '9/10', modcod: 17 }
const PSK8_56: Constellation = { ...PSK8, rate: '5/6', modcod: 15 }
const APSK16_56: Constellation = { ...APSK16, modcod: 21 } // γ = 2.70 is the 5/6 ratio
const APSK32_56 = rings('32APSK', '5/6', 27, [[4, 1 / 4.64, P / 4], [12, 2.64 / 4.64, P / 12], [16, 1, 0]]) // γ1 2.64, γ2 4.64
const RS = 2400 // symbols a second, slowed a ten-thousandfold
const YAP = [QPSK910, PSK8_56, APSK16_56, APSK32_56]
const streams = {
  esp: new Frames(RS, () => PSK8_910),
  yapogee: new Frames(RS, (t) => YAP[Math.floor(t / 3.4) % 4]), // each frame its own modcod: VCM
}
const sym = { i: 0, q: 0 }
const gauss = (k: number, s: number) => Math.sqrt(-2 * Math.log(0.5 + 0.4999 * hash(k * 1.618 + s))) * Math.cos(P * hash(k * 0.707 + s * 3.1))

export function constellation(p: Path, which: 'esp' | 'yapogee', t: number, b: Box, f: Face) {
  const tx = streams[which], R = 0.42 * Math.min(b.x1 - b.x0, b.y1 - b.y0), cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2 + 0.02
  const now = Math.floor(t * RS), fr = tx.frame(now), con = tx.con(fr), sigma = 0.07
  // axes and the rings of the modcod on air
  p.color(...GREEN, 0.18).moveTo(cx - 1.25 * R, cy).lineTo(cx + 1.25 * R, cy).moveTo(cx, cy - 1.25 * R).lineTo(cx, cy + 1.25 * R)
  for (const r of con.radii) p.circle(cx, cy, R * r, 72)
  // the shaped trajectory over the last few symbols, faint: Σ a_k g(t − kT)
  p.color(...GREEN, 0.1)
  const x = t * RS
  for (let j = 0; j <= 240; j++) {
    const xx = x - 24 + j / 10, k0 = Math.floor(xx)
    let I = 0, Q = 0
    for (let k = k0 - SPAN + 1; k <= k0 + SPAN; k++) {
      tx.sym(Math.max(0, k), sym)
      const g = rc(xx - k)
      I += sym.i * g, Q += sym.q * g
    }
    j ? p.lineTo(cx + R * I, cy + R * Q) : p.moveTo(cx + R * I, cy + R * Q)
  }
  // the last 1200 decisions, newest brightest; headers and pilots, the receiver's references, burn hotter
  for (let a = 0; a < 1200; a++) {
    const k = now - a
    if (k < 0) break
    const data = tx.sym(k, sym) === Kind.Data, I = (data ? 0.8 : 1.4) * (1 - (0.7 * a) / 1200)
    data ? p.color(...GREEN, I) : p.color(1, 0.75, 0.35, I)
    p.dot(cx + R * (sym.i + sigma * gauss(k, 2.1)), cy + R * (sym.q + sigma * gauss(k, 5.3)), 0.0025)
  }
  const pos = now - tx.start(fr)
  p.color(...GREEN, 0.85)
  text(p, `${con.name} ${con.rate}`, b.x0 + 0.02, b.y1 - 0.05, 0.032, 0, f)
  p.intensity(pos < PLH + 600 ? 1 : 0.45)
  text(p, `PLS  modcod ${con.modcod}  pilots`, b.x0 + 0.02, b.y1 - 0.095, 0.024, 0, f)
  p.intensity(0.5)
  text(p, `α 0.20   E_s/N_0 ≈ ${(-20 * Math.log10(sigma * Math.SQRT2)).toFixed(0)} dB`, b.x1 - 0.02, b.y0 + 0.03, 0.024, 1, f)
}

// ---- autoprime: the Ulam spiral, filling in -------------------------------------------------------------
const SIDE = 61, NU = SIDE * SIDE
const UX = new Int16Array(NU + 1), UY = new Int16Array(NU + 1), PRIME = new Uint8Array(NU + 1).fill(1)
PRIME[0] = PRIME[1] = 0
for (let i = 2; i * i <= NU; i++) if (PRIME[i]) for (let j = i * i; j <= NU; j += i) PRIME[j] = 0
for (let n = 2, x = 0, y = 0, d = 0, run = 1, left = 1, turns = 0; n <= NU; n++) {
  // walk the square spiral: runs of 1, 1, 2, 2, 3, 3, … turning left each time
  x += [1, 0, -1, 0][d], y += [0, 1, 0, -1][d]
  UX[n] = x, UY[n] = y
  if (--left === 0) (d = (d + 1) & 3), (turns++, (run += turns % 2 === 0 ? 1 : 0)), (left = run)
}

export function ulam(p: Path, t: number, b: Box, f: Face) {
  const cell = (Math.min(b.x1 - b.x0, b.y1 - b.y0) * 0.86) / SIDE, cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2
  const n = Math.min(NU, Math.floor(1 + 500 * t ** 1.3))
  let pi = 0
  for (let k = 2; k <= n; k++) {
    if (!PRIME[k]) continue
    pi++
    const age = (n - k) / 260
    p.color(...GREEN, 0.55 + 1.6 * Math.exp(-age * 3))
    p.dot(cx + UX[k] * cell, cy + UY[k] * cell, 0.004)
  }
  // the walker's last steps, so you see the spiral being laid
  p.color(1, 0.75, 0.35, 0.6)
  for (let k = Math.max(1, n - 40); k <= n; k++) (k === Math.max(1, n - 40) ? p.moveTo : p.lineTo).call(p, cx + UX[k] * cell, cy + UY[k] * cell)
  p.color(...GREEN, 0.8)
  text(p, `n ${n}   π(n) ${pi}   n / ln n ${Math.round(n / Math.log(n))}`, b.x0 + 0.02, b.y0 + 0.03, 0.026, 0, f)
}

// ---- R-01: a 64 × 24 frame (its 320 × 120 over five) rastered the way R-01 paints ---------------------
// Every line sweeps left to right like a polygon facet, colour quantised to the projector's rrrgggbb byte,
// and the galvo steps odd lines down, then even lines back up, so it never makes a long jump.
const W = 64, H = 24
const BARS = [[1, 1, 1], [1, 1, 0], [0, 1, 1], [0, 1, 0], [1, 0, 1], [1, 0, 0], [0, 0, 1]]
const ORDER = [...Array.from({ length: H / 2 }, (_, i) => 2 * i + 1), ...Array.from({ length: H / 2 }, (_, i) => H - 2 - 2 * i)]
const px = [0, 0, 0]
function pixel(x: number, y: number, t: number) {
  if (y < 14) {
    const c = BARS[Math.floor((x / W) * 7)]
    return (px[0] = 0.75 * c[0]), (px[1] = 0.75 * c[1]), (px[2] = 0.75 * c[2]), px
  }
  const u = x / W, v = (y - 14) / 10, s = Math.sin(TAU * (u * 2 + t * 0.2)) + Math.sin(TAU * (v + u * 0.7 - t * 0.31)) + Math.sin(TAU * Math.hypot(u - 0.5, v - 0.5) * 2 - t)
  px[0] = Math.round(clamp(0.5 + 0.5 * Math.sin(s * 1.3)) * 7) / 7
  px[1] = Math.round(clamp(0.5 + 0.5 * Math.sin(s * 1.3 + 2.1)) * 7) / 7
  px[2] = Math.round(clamp(0.5 + 0.5 * Math.sin(s * 1.3 + 4.2)) * 3) / 3
  return px
}

export function raster(p: Path, t: number, b: Box, f: Face) {
  const w = Math.min(b.x1 - b.x0 - 0.06, ((b.y1 - b.y0 - 0.12) * 8) / 3), h = (w * 3) / 8
  const x0 = (b.x0 + b.x1) / 2 - w / 2, y0 = (b.y0 + b.y1) / 2 + h / 2 + 0.02, dx = w / W, dy = h / H
  const FRAME = 2.4, ph = (t % FRAME) / FRAME, line = Math.floor(ph * H), frameT = Math.floor(t / FRAME) * FRAME
  for (let j = 0; j < H; j++) {
    const y = ORDER[j], yy = y0 - y * dy, fresh = j === line ? 1.8 : 1
    const tt = j <= line ? frameT : frameT - FRAME // lines not yet repainted still show the last frame
    p.moveTo(x0, yy)
    for (let i = 0; i < W; i++) {
      const c = pixel(i, y, tt), on = c[0] + c[1] + c[2] > 0
      p.color(c[0], c[1], c[2], on ? fresh * (j === line && i > ((ph * H) % 1) * W ? 0.5 : 1) : 0)
      p.lineTo(x0 + (i + 1) * dx, yy)
    }
  }
  const sx = x0 + (((ph * H) % 1) * W) * dx, sy = y0 - ORDER[line] * dy
  p.color(1, 1, 1, 1).dot(sx, sy, 0.01)
  p.color(...GREEN, 0.7)
  text(p, `line ${ORDER[line] + 1} of ${H}   ${line < H / 2 ? 'odd lines, galvo down' : 'even lines, galvo up'}   rrrgggbb`, x0, y0 - h - 0.06, 0.024, 0, f)
}

// ---- the QSL: the callsign, and its CW keying at 20 WPM ---------------------------------------------
export function qsl(p: Path, t: number, b: Box, f: Face) {
  const w = b.x1 - b.x0, size = Math.min(0.2, w / 7.2)
  p.color(...GREEN, 1)
  text(p, 'KJ5SCH', (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, size, 0.5, f)
  // the keyed carrier scrolling past, as a scope on the receiver's audio shows it: the 700 Hz tone in
  // bursts of one dit and three, the last 6 s of DE KJ5SCH, newest on the right
  const y = b.y0 + 0.08, n = 1400, now = t / DIT, span = 100 // dits on screen
  p.color(1, 0.75, 0.35, 0.8)
  for (let j = 0; j <= n; j++) {
    const at = now - span * (1 - j / n), d = Math.floor(at), on = at > 0 ? KEYING[d % KEYING.length] : 0
    const x = b.x0 + 0.03 + ((w - 0.06) * j) / n
    p.lineTo(x, y + on * 0.03 * Math.sin(j * 2.4))
  }
}

// ---- what the receiver hears, on a scope: the same signal the speakers play --------------------------
const WINDOW: Record<string, number> = { strobeglasses: 0.4, infiniterecon: 0.6 }
const scopeEar: Ear = { lp: 0, lp1: 0, lp2: 0 }
export function scope(p: Path, slug: string, t: number, b: Box, f: Face) {
  const W = WINDOW[slug] ?? 0.1, n = 2400, cy = (b.y0 + b.y1) / 2, h = (b.y1 - b.y0) * 0.6
  scopeEar.lp = scopeEar.lp1 = scopeEar.lp2 = 0
  p.color(...GREEN, 0.18).moveTo(b.x0 + 0.02, cy).lineTo(b.x1 - 0.02, cy)
  p.color(...GREEN, 0.9)
  for (let j = 0; j <= n; j++) {
    const tt = Math.floor(t * 30) / 30 - W + (W * j) / n, x = b.x0 + 0.02 + ((b.x1 - b.x0 - 0.04) * j) / n // a sweep every refresh
    const y = cy + h * station(slug, tt, hash(tt * 48000), scopeEar)
    j ? p.lineTo(x, y) : p.moveTo(x, y)
  }
  p.color(...GREEN, 0.5)
  text(p, `what the receiver hears   ${Math.round(W * 1000)} ms`, b.x0 + 0.02, b.y0 + 0.03, 0.024, 0, f)
}

// ---- driftwood: a phone that is not there, walking ----------------------------------------------------
// A loop of city blocks in metres, walked at 1.4 m/s (shown 20× faster), reported the way a GPS would:
// an NMEA RMC sentence with its real checksum.
const ROUTE = [[0, 0], [140, 0], [140, 90], [300, 90], [300, -50], [430, -50], [430, 130], [60, 130], [60, 60], [0, 60], [0, 0]]
const LEGS = ROUTE.slice(1).map((q, i) => Math.hypot(q[0] - ROUTE[i][0], q[1] - ROUTE[i][1]))
const LOOP = LEGS.reduce((a, b) => a + b)
const LAT0 = 37.4275, LON0 = -122.1697 // Stanford's Main Quad
const where = (s: number, o: number[]) => {
  s = ((s % LOOP) + LOOP) % LOOP
  let i = 0
  while (s > LEGS[i]) s -= LEGS[i++]
  const a = ROUTE[i], b = ROUTE[i + 1], k = s / LEGS[i]
  return (o[0] = a[0] + (b[0] - a[0]) * k), (o[1] = a[1] + (b[1] - a[1]) * k), (o[2] = Math.atan2(b[0] - a[0], b[1] - a[1])), o
}
const pos = [0, 0, 0]
const dm = (deg: number, w: number) => {
  const d = Math.floor(Math.abs(deg)), m = (Math.abs(deg) - d) * 60
  return `${String(d).padStart(w, '0')}${m.toFixed(4).padStart(7, '0')}`
}

export function walk(p: Path, t: number, b: Box, f: Face) {
  const s = 1.4 * 20 * t, sc = Math.min((b.x1 - b.x0 - 0.1) / 430, (b.y1 - b.y0 - 0.2) / 180)
  const ox = (b.x0 + b.x1) / 2 - 215 * sc, oy = (b.y0 + b.y1) / 2 - 40 * sc + 0.03
  p.color(...GREEN, 0.22)
  ROUTE.forEach((q, i) => (i ? p.lineTo : p.moveTo).call(p, ox + q[0] * sc, oy + q[1] * sc))
  p.color(...GREEN, 0.9)
  for (let j = 0; j <= 60; j++) where(s - 90 + (90 * j) / 60, pos), j ? p.lineTo(ox + pos[0] * sc, oy + pos[1] * sc) : p.moveTo(ox + pos[0] * sc, oy + pos[1] * sc)
  where(s, pos)
  p.color(1, 0.75, 0.35, 1).dot(ox + pos[0] * sc, oy + pos[1] * sc, 0.012)
  const lat = LAT0 + pos[1] / 111_320, lon = LON0 + pos[0] / (111_320 * Math.cos((LAT0 * Math.PI) / 180))
  const now = new Date(), hms = now.toISOString().slice(11, 19).replace(/:/g, ''), dmy = now.toISOString().slice(2, 10).split('-').reverse().join('')
  const course = (((pos[2] * 180) / Math.PI + 360) % 360).toFixed(1)
  const body = `GPRMC,${hms}.00,A,${dm(lat, 2)},N,${dm(lon, 3)},W,2.72,${course},${dmy},,,A`
  let cs = 0
  for (const ch of body) cs ^= ch.charCodeAt(0)
  const nmea = `$${body}*${cs.toString(16).toUpperCase().padStart(2, '0')}`, size = Math.min(0.022, (b.x1 - b.x0 - 0.04) / (nmea.length * 0.62))
  p.color(...GREEN, 0.75)
  text(p, nmea, b.x0 + 0.02, b.y0 + 0.03, size, 0, f)
}

// R-01, the lighthouse. River's RGB raster laser projector, grown to a tower, paints its frame on the planet. The
// machine is r01.ts's, number for number: a 4-facet polygon at 27 000 RPM is 1800 lines a second, the beam on the
// ground for the middle 30 % of each facet's sweep (±27° of azimuth, the reflection turning twice as fast as the
// mirror), the galvo stepping the odd lines down and the even lines back up over its own 21.5°, each laser's four
// binary-weighted currents giving 16 levels. The polygon's axis is the tower's, so a line is a sweep of azimuth, as a
// lighthouse's is; the head is tipped down until the frame lands on the ground, and every pixel is where its ray meets
// the sphere, so the picture is a keystone on a curved world, right way round from behind the tower. The place is
// the middle of the picture; the tower stands back from it. The frame is
// the one R-01's firmware was written to paint and never did (its motor caught fire on demo day). Shown 15× slow,
// 120 lines a second: the ground holds each line as an eye would, brightest where the scan has just been.
import type { Fn } from '../../beam/beam'
import { Path } from '../../beam/path'
import { equation } from '../../acts/reality'
import { ctx, cross, dot, frame, look, seen, site, unit, type V } from '../ctx'
import { PLACES } from '../places'
import { numbers } from './sky'

const NX = 320, NY = 120, W0 = 0.35, WIN = 0.3, AW = (WIN * Math.PI) / 2, ET = 0.27, EB = -0.105 // as r01.ts
const SLOW = 15, RATE = 1800 / SLOW // lines a second, here
const AT = [0.1666, -0.0336] // the tower, east and north of the place: the place is the middle of the picture
const H = 0.09, OUT = 0.06, TIP = 0.8, DECK = 1.004 // the polygon: up the tower, out at its deck's edge; the head's tip down; the painted sphere
const line = (j: number) => (j < 60 ? 2 * j + 1 : 238 - 2 * j) // the galvo's order
const slot = (L: number) => (L & 1 ? (L - 1) / 2 : 119 - L / 2)

// The frame: 4-bit levels a laser, and each line's running sum of them, so any span of a line averages in one step.
const lv = new Uint8Array(NX * NY * 3), sum = new Float32Array(NY * (NX + 1) * 3)
let ready = false
const lin = (v: number) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
fetch(`${import.meta.env.BASE_URL}media/r01/raster.png`)
  .then((r) => r.blob())
  .then(createImageBitmap)
  .then((b) => {
    const c = new OffscreenCanvas(NX, NY).getContext('2d')!
    c.drawImage(b, 0, 0, NX, NY)
    const px = c.getImageData(0, 0, NX, NY).data
    for (let i = 0; i < NX * NY; i++) for (let k = 0; k < 3; k++) lv[3 * i + k] = Math.round(15 * lin(px[4 * i + k])) // quantised in linear light
    for (let L = 0; L < NY; L++)
      for (let x = 0; x < NX; x++)
        for (let k = 0; k < 3; k++) sum[(L * (NX + 1) + x + 1) * 3 + k] = sum[(L * (NX + 1) + x) * 3 + k] + lv[(L * NX + x) * 3 + k] / 15
    ready = true
  })

const n: V = [0, 0, 0], e: V = [0, 0, 0], N: V = [0, 0, 0], g: V = [0, 0, 0], fwd: V = [0, 0, 0], rt: V = [0, 0, 0], O: V = [0, 0, 0], w: V = [0, 0, 0]
// Where the ray for pixel position h (0..1 along the line) of line L meets the ground, into w.
function ground(L: number, h: number) {
  const a = AW - 2 * AW * h, ep = ET - ((L + 0.5) / NY) * (ET - EB) - TIP, ce = Math.cos(ep), se = Math.sin(ep), ca = Math.cos(a), sa = Math.sin(a)
  for (let j = 0; j < 3; j++) w[j] = ce * (ca * fwd[j] - sa * rt[j]) + se * g[j]
  const b = dot(O, w), t = -b - Math.sqrt(Math.max(0, b * b - dot(O, O) + DECK * DECK))
  for (let j = 0; j < 3; j++) w[j] = O[j] + t * w[j]
  return w
}

// The frame on the ground, through the camera: KX knots a line, where they land on the screen and whether they show.
const KX = 9, K = new Float32Array(NY * KX * 2), SEE = new Uint8Array(NY * KX), PITCH = new Float32Array(NY), LIT = new Float32Array(NY)
const GAIN = 1
let all = 0, pu = 2, pL = -1, lx = 0, ly = 0, ph = 0
// The ground's light, as the beam: every line each refresh, a line's pixels averaged over each sample's span of it, its
// energy the frame's own radiance times the screen it covers, so the picture is as bright from orbit as from the tower.
const paint: Fn = (_, s, u) => {
  if (u < pu) {
    let W = 0
    for (let i = 0; i < ctx.f.ch.length; i++) W += ctx.f.ch[i].w
    all = ((0.5 / u) * Math.max(1, W)) / SHARE.w // every channel's samples this frame
    pL = -1
  }
  pu = u
  const x = u * NY, L = Math.min(NY - 1, Math.floor(x)), a = x - L, h = L & 1 ? 1 - a : a // there and back: no flyback
  const kf = h * (KX - 1), i0 = Math.min(KX - 2, Math.floor(kf)), fr = kf - i0, o = L * KX + i0
  const sx = K[2 * o] + (K[2 * o + 2] - K[2 * o]) * fr, sy = K[2 * o + 1] + (K[2 * o + 3] - K[2 * o + 1]) * fr
  s.x = sx, s.y = sy, s.z = 0
  if (L === pL && SEE[o] && SEE[o + 1]) {
    const p0 = Math.floor(Math.min(ph, h) * NX), p1 = Math.min(NX, Math.max(p0 + 1, Math.floor(Math.max(ph, h) * NX))), row = L * (NX + 1) * 3, k = 1 / (p1 - p0)
    // the beam takes its colours as a display's, squared-ish into light: the root of the power, then
    s.r = Math.sqrt((sum[row + p1 * 3] - sum[row + p0 * 3]) * k)
    s.g = Math.sqrt((sum[row + p1 * 3 + 1] - sum[row + p0 * 3 + 1]) * k)
    s.b = Math.sqrt((sum[row + p1 * 3 + 2] - sum[row + p0 * 3 + 2]) * k)
    s.z = GAIN * LIT[L] * PITCH[L] * Math.hypot(sx - lx, sy - ly) * all * 16.7
  }
  pL = L, lx = sx, ly = sy, ph = h
}

const air = new Path(), vals = [0], A: V = [0, 0, 0]
const SHARE = { w: 1, fn: paint }, AIR = { w: 0.15, path: air }
// a ray of the fan: from the polygon to a point of the ground
function ray(r: number, g: number, b: number, i: number, to: V) {
  if (r + g + b < 0.02 || !look(to)) return
  const x = seen.x, y = seen.y, p = ctx.p, E = ctx.E
  // from behind the tower the polygon is behind the eye too: the ray is cut where it comes into view
  let dO = 0, dT = 0
  for (let j = 0; j < 3; j++) (dO += (O[j] - E[j]) * p[12 + j]), (dT += (to[j] - E[j]) * p[12 + j])
  const s = dO < 0.08 ? Math.min(1, (0.08 - dO) / (dT - dO)) : 0
  for (let j = 0; j < 3; j++) A[j] = O[j] + s * (to[j] - O[j])
  if (look(A)) air.color(r, g, b, i).moveTo(seen.x, seen.y).lineTo(x, y)
}
// a beam on the deck, between points (back from the polygon, to the side of the axis)
function beam(r: number, g: number, b: number, b0: number, s0: number, b1: number, s1: number) {
  for (let j = 0; j < 3; j++) (A[j] = O[j] - b0 * fwd[j] + s0 * rt[j]), (w[j] = O[j] - b1 * fwd[j] + s1 * rt[j])
  if (!look(A)) return
  const x = seen.x, y = seen.y
  if (look(w)) air.color(r, g, b, 0.6).moveTo(x, y).lineTo(seen.x, seen.y)
}
export function draw(k: number) {
  const P = PLACES[k], t = ctx.t
  site(P.lat, P.lon, n)
  if (!ready || dot(n, ctx.E) < 0.75) return
  frame(n, e, N)
  for (let j = 0; j < 3; j++) g[j] = n[j] + AT[0] * e[j] + AT[1] * N[j]
  const c = dot(n, unit(g))
  for (let j = 0; j < 3; j++) fwd[j] = n[j] - c * g[j] // the tower looks at the place
  cross(unit(fwd), g, rt)
  for (let j = 0; j < 3; j++) O[j] = g[j] * (1 + H) + OUT * fwd[j]

  // the scan: facets since the frame's top, and how long ago each line was painted
  const q = RATE * t, qm = ((q % NY) + NY) % NY
  let shown = 0
  for (let L = 0; L < NY; L++) {
    const age = ((((qm - slot(L) - W0 - WIN) % NY) + NY) % NY) / RATE
    LIT[L] = 0.3 + 0.5 * Math.exp(-age / 0.6) + 2.4 * Math.exp(-age / 0.05)
    for (let i = 0; i < KX; i++) {
      const o = L * KX + i
      if ((SEE[o] = look(ground(L, i / (KX - 1))) && Math.abs(seen.x) < 6 && Math.abs(seen.y) < 4 ? 1 : 0)) (K[2 * o] = seen.x), (K[2 * o + 1] = seen.y), shown++
    }
  }
  if (!shown) return
  for (let L = 0; L < NY; L++) {
    const a = (L > 0 ? L - 1 : L) * KX + 4, b = (L < NY - 1 ? L + 1 : L) * KX + 4
    PITCH[L] = Math.min(0.03, Math.hypot(K[2 * b] - K[2 * a], K[2 * b + 1] - K[2 * a + 1]) / ((b - a) / KX))
  }
  const focus = ctx.focus === k
  SHARE.w = focus ? 1.6 : 0.5
  ctx.f.ch.push(SHARE)

  // the light in the air: the three lasers up the tower as one beam, and the facets' sweeps of this refresh, each ray
  // at its own instant of the scan and the colour of its pixel
  air.clear()
  // red down the deck's axis, green and blue joining it at their dichroics
  beam(1, 0, 0, 0.115, 0, 0.08, 0), beam(0, 1, 0.1, 0.08, 0.04, 0.08, 0), beam(1, 0.9, 0, 0.08, 0, 0.045, 0)
  beam(0.1, 0.2, 1, 0.045, 0.04, 0.045, 0), beam(1, 1, 1, 0.045, 0, 0, 0)
  const dq = RATE * Math.min(0.05, Math.max(ctx.dt, 1 / 120)), RAYS = focus ? 40 : 10
  for (let i = 0; i < RAYS; i++) {
    const qi = q - dq * ((i + 0.5) / RAYS), f = Math.floor(qi), h = qi - f, L = line(((f % NY) + NY) % NY), px = (L * NX + Math.floor(h * NX)) * 3
    ray(Math.sqrt(lv[px] / 15), Math.sqrt(lv[px + 1] / 15), Math.sqrt(lv[px + 2] / 15), 0.35, ground(L, h))
  }
  ctx.f.ch.push(AIR)
  if (!focus) return
  vals[0] = line(Math.floor(qm))
  equation(ctx.f, 'f_{line}=\\frac{4\\cdot 27000}{60}=1800\\,Hz\\qquad f_{px}=1.83\\,MHz', P.ink)
  numbers('n=\\num{0}{000}\\qquad t\\to t/15', P.ink, vals)
}

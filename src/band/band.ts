// The Band. Every project sits at its real frequency on one log axis, from a year-long orbit precession
// at 31.7 nHz to the red, green and blue lines of a laser projector at 470–666 THz. The screen is a
// constant-Q spectrum analyzer you tune like a receiver: drag, wheel or flick to tune and it pulls in to
// the nearest carrier; ←/→ seek; Enter demodulates, narrowing the span onto the carrier until its real
// shape shows and its page opens. The waterfall under the trace is the chronology: a row a week since
// October 2024, each project lit in the weeks it was worked on, from its public commit history.
import { Path } from '../beam/path'
import { faces, load, measure, text, type Face } from '../beam/font'
import { clamp, mix, view, type Scene } from '../acts/scene'
import { PROJECTS, WEEK0 } from './projects'
import { an, sweep, K, MAX, SPAN_ALL, MID, binOf, CMB_PEAK } from './analyzer'
import { ORDER, KEYS, keyOf, hz, show, screen, when, activate, slugAt, route, weekDate, root } from './dom'
import { constellation, qsl, raster, scope, ulam, walk, type Box } from './demos'
import { voice } from './voice'

load('tech')
const face = (): Face => faces.tech ?? faces.hershey
const GREEN = [0.35, 1, 0.55] as const
const AMBER = [1, 0.7, 0.28] as const
const LF = PROJECTS.map((p) => Math.log10(p.freq))
// Where a project's page centres the dial: the middle of everything it radiates.
const MIDK = PROJECTS.map((p) => {
  let lo = Infinity, hi = -Infinity
  for (const s of p.sig) {
    const [a, b] = s.k === 'lines' ? [s.f[0], s.f[s.f.length - 1]] : s.k === 'band' ? [s.lo, s.hi] : [s.f, s.f]
    lo = Math.min(lo, a), hi = Math.max(hi, b)
  }
  return (Math.log10(lo) + Math.log10(hi)) / 2
})
const EDGE = [MID - SPAN_ALL / 2, MID + SPAN_ALL / 2]

// ---- the chronology: each project's weeks, from its commits ----------------------------------------
const WEEKS = Math.floor((Date.UTC(2026, 10, 6) - WEEK0) / 6048e5) + 1
const ACT = new Float32Array(K * WEEKS)
PROJECTS.forEach((p, k) => {
  if (!p.log.length) return
  const a = ACT.subarray(k * WEEKS, (k + 1) * WEEKS)
  for (const [w, n] of p.log) {
    const v = 0.35 + 0.65 * (Math.log1p(n) / Math.log1p(434))
    for (let d = 0; d < 3 && w + d < WEEKS; d++) a[w + d] = Math.max(a[w + d], v * 0.4 ** d) // and an afterglow
  }
})
const commits = (k: number, w: number) => PROJECTS[k].log.find((e) => e[0] === w)?.[1] ?? 0

// ---- motion: second-order loops, like everything else on this scope that settles ------------------
type Loop = { x: number; v: number; to: number }
function settle(l: Loop, dt: number, wn: number, z = 0.8) {
  for (let h = 0, left = dt; left > 0; left -= h) {
    h = Math.min(left, 1 / 240)
    l.v += (wn * wn * (l.to - l.x) - 2 * z * wn * l.v) * h
    l.x += l.v * h
  }
}
const c: Loop = { x: MID, v: 0, to: MID } // the dial, log10 Hz
const s: Loop = { x: Math.log10(SPAN_ALL), v: 0, to: 0 } // the span, log10 decades
const ko: Loop = { x: 0, v: 0, to: 0 } // how open the page is
const ref: Loop = { x: 0, v: 0, to: 0 } // reference level, dB at the top of the graticule
let user = SPAN_ALL // the span the listener chose
let open = -1, tuned = -1, hover = -1
let coast = 0, idle = 9, snapped = true // a flick's glide (decades/s), time since the last touch of the dial
let clock = 0, opened = 0, built = 0, seed = 0, active = false
const RANGE = 80 // dB from the top of the graticule to the bottom

// ---- layout: the frequency axis runs across a landscape screen and down a portrait one -------------
const L = { vert: false, u0: 0, u1: 0, tv0: 0, tv1: 0, lane: 0, rows: 4, row: 0, tick: 0, wv0: 0, wv1: 0, size: 0.03, A: 1, quiet: false }
function layout(k: number) {
  const A = (L.A = view.a)
  L.vert = A < 0.85
  L.quiet = L.vert && k > 0.3 // a phone with a page open keeps only a strip of spectrum
  if (!L.vert) {
    L.u0 = -A + 0.12, L.u1 = A - 0.12
    L.tv0 = mix(-0.06, 0.44, k), L.tv1 = mix(0.5, 0.72, k)
    L.lane = L.tv1 + 0.06, L.row = mix(0.056, 0.05, k), L.rows = k > 0.5 ? 2 : 4
    L.tick = L.tv0 - 0.07
    L.wv0 = -0.22, L.wv1 = -0.93
    L.size = 0.03
  } else {
    L.u0 = 0.8, L.u1 = mix(-0.72, -0.95, k)
    L.tick = -A + 0.025
    L.tv0 = -A + mix(0.16, 0.03, k), L.tv1 = mix(-0.04, -A + 0.15, k)
    L.lane = L.tv1 + 0.04, L.row = 0, L.rows = 1
    L.wv0 = 0.22, L.wv1 = A - 0.03
    L.size = 0.024
  }
}
const P = { x: 0, y: 0 }
// u along the frequency axis in [0, 1], w a coordinate across it, in scope units
function at(u: number, w: number) {
  const a = L.u0 + u * (L.u1 - L.u0)
  L.vert ? ((P.x = w), (P.y = a)) : ((P.x = a), (P.y = w))
  return P
}
const to = (p: Path, u: number, w: number) => (at(u, w), p.lineTo(P.x, P.y))
const mv = (p: Path, u: number, w: number) => (at(u, w), p.moveTo(P.x, P.y))
const uOf = (logf: number) => (logf - c.x) / an.s + 0.5
const pxAxis = () => (Math.abs(L.u1 - L.u0) / 2) * (L.vert ? innerHeight : innerWidth / view.a) // u-axis length in px

// The colour of light at frequency f, roughly as the eye sees it; the phosphor's green elsewhere.
function hue(f: number, o: number[]) {
  const nm = 2.99792458e17 / f
  if (nm < 380 || nm > 780) return (o[0] = GREEN[0]), (o[1] = GREEN[1]), (o[2] = GREEN[2]), o
  const [r, g, b] = nm < 440 ? [(440 - nm) / 60, 0, 1] : nm < 490 ? [0, (nm - 440) / 50, 1] : nm < 510 ? [0, 1, (510 - nm) / 20] : nm < 580 ? [(nm - 510) / 70, 1, 0] : nm < 645 ? [1, (645 - nm) / 65, 0] : [1, 0, 0]
  const fade = nm < 420 ? 0.3 + (0.7 * (nm - 380)) / 40 : nm > 700 ? 0.3 + (0.7 * (780 - nm)) / 80 : 1
  return (o[0] = r * fade + 0.08), (o[1] = g * fade + 0.08), (o[2] = b * fade + 0.08), o
}

// ---- drawing ------------------------------------------------------------------------------------------
const trace = new Path(), grat = new Path(), marks = new Path(), words = new Path(), wf = new Path(), demo = new Path()
const rgb = [0, 0, 0]
const FW = new Float32Array(K * MAX), F0 = new Int16Array(K), F1 = new Int16Array(K)
const hits: { k: number; x: number; y: number; x0: number; y0: number; x1: number; y1: number }[] = []
const rowEnd = new Float64Array(8)

function graticule(n: number, f: Face) {
  const z = L.size
  grat.clear().color(...GREEN, 0.16)
  for (let d = 0; d <= RANGE; d += 10) {
    const w = mix(L.tv0, L.tv1, d / RANGE)
    for (let u = 0; u <= 1.0001; u += 0.01) at(u, w), grat.dot(P.x, P.y, 0.0015)
  }
  // frequency ticks: decades from far away, 1-2-5 closer, linear steps when the span is narrow
  const lo = an.c - an.s / 2, hi = an.c + an.s / 2
  const ticks: number[] = []
  if (an.s > 1.6) {
    const every = an.s > 12 ? 3 : 1
    for (let e = Math.ceil(lo); e <= hi; e++) ticks.push(e, e % every === 0 ? 1 : 0)
  } else if (an.s > 0.25) {
    for (let e = Math.floor(lo); e <= hi; e++) for (const m of [1, 2, 5]) ticks.push(e + Math.log10(m), 1)
  } else {
    const f0 = 10 ** lo, f1 = 10 ** hi, raw = (f1 - f0) / 5, mag = 10 ** Math.floor(Math.log10(raw))
    const st = [1, 2, 5, 10].map((m) => m * mag).find((x) => x >= raw)!
    for (let fq = Math.ceil(f0 / st) * st; fq <= f1; fq += st) ticks.push(Math.log10(fq), 1)
  }
  for (let j = 0; j < ticks.length; j += 2) {
    const u = uOf(ticks[j]), major = ticks[j + 1]
    if (u < 0 || u > 1 || ticks[j] < EDGE[0] || ticks[j] > EDGE[1]) continue
    grat.intensity(major ? 0.22 : 0.12)
    for (let v = 0; v <= 1.0001; v += 0.025) at(u, mix(L.tv0, L.tv1, v)), grat.dot(P.x, P.y, 0.0015)
    if (!major || L.quiet) continue
    const label = hz(10 ** ticks[j], an.s > 0.25 ? 3 : 7).replace(/(\.[0-9]*?)0+ /, '$1 ').replace('. ', ' ')
    words.intensity(0.45)
    at(u, L.tick)
    L.vert ? text(words, label, L.tick, P.y - z * 0.4, z * 0.85, 0, f) : text(words, label, P.x, L.tick, z * 0.9, 0.5, f)
  }
  void n
}

function traceAndMarks(n: number, reveal: number, f: Face) {
  const bottom = ref.x - RANGE, z = L.size
  trace.clear()
  let pen = false
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1), v = clamp((an.db[i] - bottom) / RANGE), lf = an.c + an.s * (u - 0.5)
    if (lf < EDGE[0] || lf > EDGE[1]) { pen = false; continue } // past the ends of the dial: nothing
    hue(10 ** lf, rgb)
    trace.color(rgb[0], rgb[1], rgb[2], 1)
    pen ? to(trace, u, mix(L.tv0, L.tv1, v)) : mv(trace, u, mix(L.tv0, L.tv1, v))
    pen = true
  }
  trace.reveal(reveal)

  // The cosmic background gets a note where it is, faint: the one signal here nobody made.
  const uc = uOf(Math.log10(CMB_PEAK))
  if (uc > 0.05 && uc < 0.95 && an.s > 2 && !L.quiet) {
    const v = clamp((an.floor + 18 - bottom) / RANGE)
    words.intensity(0.3)
    at(uc, mix(L.tv0, L.tv1, v) + 0.05)
    text(words, 'CMB 2.725 K', P.x, P.y, z * 0.8, L.vert ? 0 : 0.5, f)
  }

  // Markers on every carrier in view, labels stacked in the lane above (beside, on a phone).
  marks.clear()
  hits.length = 0
  rowEnd.fill(-Infinity)
  let last = Infinity
  for (const k of ORDER) {
    const u = uOf(LF[k])
    if (u < -0.01 || u > 1.01 || u > reveal + 0.02) continue
    const ib = Math.round(binOf(LF[k]))
    let e = 0 // the carrier's own power here, not the noise riding on it, so markers hold still
    for (let i = Math.max(0, ib - 2); i <= Math.min(n - 1, ib + 2); i++) e = Math.max(e, an.each[k * MAX + i])
    const v = clamp((10 * Math.log10(e + 10 ** (an.floor / 10)) - bottom) / RANGE), w = mix(L.tv0, L.tv1, v)
    const me = k === tuned || k === open, lit = me || k === hover
    const col = me ? AMBER : GREEN, I = me ? 1 : lit ? 0.9 : 0.55, d = 0.014
    marks.color(col[0], col[1], col[2], I)
    // a small triangle pointing at the peak
    mv(marks, u, w + 0.012), at(u, w + 0.036)
    const tx = P.x, ty = P.y
    L.vert ? marks.lineTo(tx, ty + d).lineTo(tx, ty - d).lineTo(P.x - 0.024, P.y) : marks.lineTo(tx - d, ty).lineTo(tx + d, ty).lineTo(P.x, P.y - 0.024)
    const label = `${keyOf(k)} ${PROJECTS[k].title}`.trim(), lw = measure(label, z, f)
    let lx: number, ly: number
    if (!L.vert) {
      // the lowest row this label fits in without sliding; failing that, the row it slides least in
      let best = 0, bestX = Infinity
      for (let r = 0; r < L.rows; r++) {
        const x = Math.max(tx - lw / 2, rowEnd[r] + 0.03)
        if (x - (tx - lw / 2) < 1e-6) { best = r, bestX = x; break }
        if (x < bestX) (best = r), (bestX = x)
      }
      lx = clamp(bestX, -L.A + 0.03, L.A - 0.03 - lw), ly = L.lane + best * L.row
      rowEnd[best] = lx + lw
      marks.intensity(I * 0.5).moveTo(tx, ty).lineTo(tx, ly - z * 0.45).lineTo(lx + lw / 2, ly - z * 0.45)
    } else {
      lx = L.lane, ly = Math.min(ty - z * 0.4, last - z * 1.7)
      last = ly
      if (!L.quiet) marks.intensity(I * 0.5).moveTo(tx, ty).lineTo(lx - 0.01, ly + z * 0.4)
    }
    words.color(col[0], col[1], col[2], I)
    if (!L.quiet) text(words, label, lx, ly, z, 0, f)
    hits.push({ k, x: tx, y: ty, x0: lx, y0: ly - z * 0.3, x1: lx + lw, y1: ly + z * 1.1 })
  }
  words.color(...GREEN, 1)

  // the dial's pointer: where the receiver is tuned
  marks.color(...AMBER, 0.5)
  for (let v = -0.02; v <= 1.02; v += 0.02) mv(marks, 0.5, mix(L.tv0, L.tv1, v)), to(marks, 0.5, mix(L.tv0, L.tv1, v + 0.01))
}

// Each project's footprint in this sweep: its own bins, weighted by how far below its peak they sit.
function footprints(n: number) {
  for (let k = 0; k < K; k++) {
    const pk = an.peak[k]
    F0[k] = -1, F1[k] = -2
    if (pk < an.floor + 3) continue
    for (let i = 0; i < n; i++) {
      const db = 10 * Math.log10(an.each[k * MAX + i] + 1e-30), w = clamp(1 + (db - pk) / 22)
      FW[k * MAX + i] = w
      if (w > 0) (F0[k] < 0 && (F0[k] = i)), (F1[k] = i)
    }
  }
}

function waterfall(n: number, f: Face, show: number) {
  wf.clear()
  if (show <= 0.01) return
  const z = L.size, d = an.s / (n - 1), j0 = Math.floor((an.c - an.s / 2) / d), lo = an.c - an.s / 2
  for (let r = 0; r < WEEKS; r++) {
    const wk = WEEKS - 1 - r, w = mix(L.wv0, L.wv1, r / (WEEKS - 1)), fade = show * smoothRow(r)
    if (fade <= 0) continue
    // the floor's own history, a faint speckle pinned to frequency so it scrolls with the dial
    for (let j = Math.max(j0, Math.ceil(EDGE[0] / d)); j < Math.min(j0 + n, EDGE[1] / d); j++) {
      const h =Math.imul(j ^ Math.imul(r + 7, 0x27d4eb2d), 0x9e3779b1) >>> 0, x = (h ^ (h >>> 15)) & 1023
      if (x >= 22) continue
      wf.intensity(fade * (0.06 + 0.22 * ((h >>> 20) / 4096) ** 3))
      at((j * d - lo) / an.s, w), wf.dot(P.x, P.y, 0.0012)
    }
    for (let j = 0; j < K; j++) {
      const a = ACT[j * WEEKS + wk] * fade
      if (a <= 0 || F1[j] < F0[j]) continue
      let pen = false
      for (let i = F0[j]; i <= F1[j]; i++) {
        const I = a * FW[j * MAX + i], u = i / (n - 1)
        wf.intensity(I)
        if (I > 0.01) pen ? to(wf, u, w) : (mv(wf, u, w), (pen = true))
        else pen = false
      }
    }
  }
  // the years down the side, and now at the top
  words.color(...GREEN, 0.4 * show)
  const yr = (y: number, label: string) => {
    const wk = (Date.UTC(y, 0, 1) - WEEK0) / 6048e5, w = mix(L.wv0, L.wv1, (WEEKS - 1 - wk) / (WEEKS - 1))
    if (L.vert) text(words, label, w, L.u0 + 0.035, z * 0.8, 0.5, f)
    else {
      text(words, label, -L.A + 0.02, w - z * 0.35, z * 0.8, 0, f)
      grat.intensity(0.2 * show).moveTo(L.u0 - 0.03, w).lineTo(L.u0 - 0.01, w)
    }
  }
  yr(2025, '2025'), yr(2026, '2026')
  L.vert ? text(words, 'now', L.wv0, L.u0 + 0.035, z * 0.8, 0.5, f) : text(words, 'now', -L.A + 0.02, L.wv0 - z * 0.35, z * 0.8, 0, f)
}
let rowsIn = 0 // the power-up: rows of the waterfall arrive top first
const smoothRow = (r: number) => clamp(rowsIn * WEEKS * 1.2 - r, 0, 1)

function readouts(f: Face) {
  if (L.quiet) return
  const A = L.A, z = L.size, x = L.vert ? -A + 0.03 : -A + 0.12, y = 0.93
  words.color(...AMBER, 0.75)
  text(words, 'RIVER DOWDY  KJ5SCH', x, y, z * 0.95, 0, f)
  words.color(...GREEN, 0.55)
  const rbw = an.q * 100
  const line = `${L.vert ? '' : 'CENTER '}${hz(10 ** c.x, 7)}   SPAN ${an.s >= 1 ? an.s.toFixed(1) + ' dec' : hz(10 ** (c.x + an.s / 2) - 10 ** (c.x - an.s / 2), 3)}${L.vert ? '' : `   RBW ${rbw < 1 ? rbw.toFixed(3) : rbw.toFixed(1)} %   REF ${ref.x.toFixed(0)} dB`}`
  L.vert ? text(words, line, x, y - z * 1.6, z * 0.8, 0, f) : text(words, line, x + measure('RIVER DOWDY  KJ5SCH', z * 0.95, f) + 0.08, y, z * 0.85, 0, f)
}

function drawDemo(f: Face) {
  demo.clear()
  if (open < 0 || ko.x < 0.6) return
  const r = screen(open), p = PROJECTS[open]
  if (!r) return
  const A = view.a, b: Box = { x0: (r.left / innerWidth) * 2 * A - A, x1: (r.right / innerWidth) * 2 * A - A, y0: 1 - (2 * r.bottom) / innerHeight, y1: 1 - (2 * r.top) / innerHeight }
  const t = clock - opened
  if (p.demo === 'esp' || p.demo === 'yapogee') constellation(demo, p.demo, t, b, f)
  else if (p.demo === 'ulam') ulam(demo, t, b, f)
  else if (p.demo === 'raster') raster(demo, t, b, f)
  else if (p.demo === 'scope') scope(demo, p.slug, t, b, f)
  else if (p.demo === 'walk') walk(demo, t, b, f)
  else if (p.slug === 'qsl') qsl(demo, t, b, f)
}

// ---- the receiver's controls ---------------------------------------------------------------------------
function tune(k: number) {
  c.to = LF[k]
  coast = 0, idle = 9, snapped = true
}
function demodulate(k: number) {
  if (k < 0) return
  if (open !== k) opened = clock
  open = k, ko.to = 1
  c.to = MIDK[k]
  coast = 0, idle = 9, snapped = true
  route(k)
}
function close() {
  if (open < 0) return
  c.to = LF[open]
  open = -1, ko.to = 0
  route(-1)
}
function seek(dir: number) {
  const from = open >= 0 ? LF[open] : c.to
  const list = dir > 0 ? ORDER : [...ORDER].reverse()
  const k = list.find((j) => (LF[j] - from) * dir > 1e-6)
  if (k === undefined) return
  open >= 0 ? demodulate(k) : tune(k)
}
function touched() {
  idle = 0, snapped = false
}

// Snap: when the dial comes to rest near a carrier, it pulls in, like a PLL inside its capture range.
function capture() {
  let best = -1, d = 0.07 * an.s
  for (let k = 0; k < K; k++) if (Math.abs(LF[k] - c.to) < d) (d = Math.abs(LF[k] - c.to)), (best = k)
  if (best >= 0) c.to = LF[best]
  snapped = true
}

function update(dt: number) {
  if (coast) {
    c.to += coast * dt
    coast *= Math.exp(-dt / 0.35)
    if (Math.abs(coast) < 0.06 * an.s) (coast = 0), (idle = 0.3)
  }
  c.to = clamp(c.to, EDGE[0], EDGE[1])
  idle += dt
  if (!snapped && !drag && !coast && idle > 0.3) capture()
  // tuning away from an open project breaks the lock: the page closes
  if (open >= 0 && Math.abs(c.to - MIDK[open]) > PROJECTS[open].span * 0.6 && !drag) close()
  const base = open >= 0 ? PROJECTS[open].span : user
  s.to = Math.log10(Math.min(SPAN_ALL, Math.max(base, 2.4 * Math.abs(c.to - c.x)))) // fly out, then back in
  drag ? ((c.x = c.to), (c.v = 0)) : settle(c, dt, 9, 0.85)
  settle(s, dt, 7, 0.9)
  settle(ko, dt, 8, 0.9)
  tuned = -1
  let d = 0.03 * 10 ** s.x
  if (open >= 0) tuned = open
  else for (let k = 0; k < K; k++) if (Math.abs(LF[k] - c.x) < d) (d = Math.abs(LF[k] - c.x)), (tuned = k)
}

// ---- input ------------------------------------------------------------------------------------------
type Drag = { id: number; x: number; y: number; t: number; v: number; moved: number }
let drag: Drag | null = null
const pts = new Map<number, { x: number; y: number }>()
const along = (e: { clientX: number; clientY: number }) => (L.vert ? e.clientY : e.clientX) // px in the direction of rising u
const busy = (e: Event) => !!(e.target as Element).closest?.('a, button, video, input, .open .page, .open .card, .lit')

function hit(cx: number, cy: number) {
  const A = view.a, x = (cx / innerWidth) * 2 * A - A, y = 1 - (2 * cy) / innerHeight
  let best = -1, bd = (28 / innerHeight) * 2
  for (const h of hits) {
    const d = Math.min(Math.hypot(x - h.x, y - h.y), x >= h.x0 && x <= h.x1 && y >= h.y0 && y <= h.y1 ? 0 : Infinity)
    if (d < bd) (bd = d), (best = h.k)
  }
  return best
}

addEventListener('pointerdown', (e) => {
  if (!active || e.button > 0 || busy(e)) return
  pts.set(e.pointerId, { x: e.clientX, y: e.clientY })
  if (pts.size === 1) drag = { id: e.pointerId, x: along(e), y: e.clientY, t: e.timeStamp, v: 0, moved: 0 }
  coast = 0
})
addEventListener('pointermove', (e) => {
  if (!active) return
  const pt = pts.get(e.pointerId)
  if (pts.size === 2 && pt) {
    // pinch: the span follows the fingers
    const [a, b] = [...pts.values()], d0 = Math.hypot(a.x - b.x, a.y - b.y)
    pt.x = e.clientX, pt.y = e.clientY
    const d1 = Math.hypot(a.x - b.x, a.y - b.y)
    if (d0 > 0 && d1 > 0) user = clamp(user * (d0 / d1), 0.001, SPAN_ALL)
    drag = null
    return
  }
  if (drag && e.pointerId === drag.id) {
    const x = along(e), dx = x - drag.x, dt = Math.max(1, e.timeStamp - drag.t)
    const dec = (-dx * an.s) / pxAxis()
    c.to += dec
    drag.v = mix(drag.v, (dec / dt) * 1000, 0.4)
    drag.moved += Math.abs(dx)
    drag.x = x, drag.t = e.timeStamp
    touched()
    return
  }
  const k = e.pointerType === 'mouse' && !busy(e) ? hit(e.clientX, e.clientY) : -1
  hover = k
  document.body.style.cursor = k >= 0 ? 'pointer' : ''
  hoverWeek(e.clientX, e.clientY, k)
})
const lift = (e: PointerEvent) => {
  pts.delete(e.pointerId)
  if (!drag || e.pointerId !== drag.id) return
  const d = drag
  drag = null
  if (d.moved < 6) {
    const k = hit(e.clientX, e.clientY)
    if (k >= 0) return demodulate(k)
    if (inWaterfall(e.clientX, e.clientY)) return
    c.to = c.x + (uAtPx(e.clientX, e.clientY) - 0.5) * an.s // a click elsewhere tunes there
    return touched()
  }
  if (e.timeStamp - d.t < 90 && Math.abs(d.v) > 0.2 * an.s) coast = clamp(d.v, -0.8 * an.s, 0.8 * an.s) // a flick glides a fraction of a span, then pulls in
  touched()
}
addEventListener('pointerup', lift)
addEventListener('pointercancel', lift)

function uAtPx(cx: number, cy: number) {
  const A = view.a, x = (cx / innerWidth) * 2 * A - A, y = 1 - (2 * cy) / innerHeight
  return ((L.vert ? y : x) - L.u0) / (L.u1 - L.u0)
}
function inWaterfall(cx: number, cy: number) {
  const A = view.a, w = L.vert ? (cx / innerWidth) * 2 * A - A : 1 - (2 * cy) / innerHeight
  return ko.x < 0.5 && (w - L.wv0) * (L.wv1 - w) >= 0
}
function hoverWeek(cx: number, cy: number, k: number) {
  if (k >= 0 || !inWaterfall(cx, cy)) return when('')
  const A = view.a, w = L.vert ? (cx / innerWidth) * 2 * A - A : 1 - (2 * cy) / innerHeight
  const wk = WEEKS - 1 - Math.round(((w - L.wv0) / (L.wv1 - L.wv0)) * (WEEKS - 1)), i = Math.round(uAtPx(cx, cy) * (an.n - 1))
  let best = -1, bw = 0.05
  for (let j = 0; j < K; j++) {
    const a = ACT[j * WEEKS + wk] * (i >= F0[j] && i <= F1[j] ? FW[j * MAX + i] : 0)
    if (a > bw) (bw = a), (best = j)
  }
  if (best < 0) return when(`week of ${weekDate(wk)}`, cx + 14, cy + 14)
  const n = commits(best, wk)
  when(`week of ${weekDate(wk)} · ${PROJECTS[best].title}${n ? ` · ${n} commit${n > 1 ? 's' : ''}` : ''}`, cx + 14, cy + 14)
}

addEventListener(
  'wheel',
  (e) => {
    if (!active || (e.target as Element).closest?.('.open .page, .open .card')) return
    e.preventDefault()
    const px = (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) * (e.deltaMode ? 16 : 1)
    if (e.ctrlKey) user = clamp(user * Math.exp(e.deltaY * 0.01), 0.001, SPAN_ALL)
    else c.to += (px * an.s) / pxAxis()
    coast = 0
    touched()
  },
  { passive: false },
)

addEventListener(
  'keydown',
  (e) => {
    if (!active || e.metaKey || e.altKey || (e.target as Element).closest?.('input, textarea')) return
    const k = e.key, page = open >= 0
    const fwd = k === 'ArrowRight' || (L.vert && !page && k === 'ArrowDown'), back = k === 'ArrowLeft' || (L.vert && !page && k === 'ArrowUp')
    if (fwd || back) seek(fwd ? 1 : -1)
    else if (k === 'Enter' && !(e.target as Element).closest?.('a, button')) demodulate(open >= 0 ? open : tuned)
    else if (k === 'Escape') page ? close() : ((user = SPAN_ALL), (c.to = MID))
    else if (k >= '0' && k <= '9') {
      const j = PROJECTS.findIndex((p) => p.slug === KEYS[(+k + 9) % 10])
      if (j >= 0) page ? demodulate(j) : tune(j)
    } else if (k === 'q') demodulate(PROJECTS.findIndex((p) => p.slug === 'qsl'))
    else if (k === '+' || k === '=') user = Math.max(0.001, user / 2)
    else if (k === '-' || k === '_') user = Math.min(SPAN_ALL, user * 2)
    else return
    e.preventDefault()
    e.stopImmediatePropagation() // the band has the keys now, not the timeline
  },
  { capture: true },
)

// Links inside the band route here instead of reloading; history moves the dial.
root.addEventListener('click', (e) => {
  const lit = (e.target as Element).closest<HTMLElement>('article.lit')
  if (lit && !(e.target as Element).closest('a')) return demodulate(+lit.dataset.k!)
  const a = (e.target as Element).closest('a')
  const href = a?.getAttribute('href')
  if (!href?.startsWith('/') || e.metaKey || e.ctrlKey) return
  e.preventDefault()
  demodulate(slugAt(href))
})
root.addEventListener('focusin', (e) => {
  const art = (e.target as Element).closest('article')
  if (art && open < 0) tune(+art.dataset.k!)
})
addEventListener('popstate', () => {
  const k = slugAt()
  k >= 0 ? demodulate(k) : close()
})

// Deep links and ?band skip the intro; a deep link starts tuned and open.
const q = new URLSearchParams(location.search)
export const direct = () => q.has('band') || slugAt() >= 0 || q.has('open')
{
  const k = q.has('open') ? PROJECTS.findIndex((p) => p.slug === q.get('open')) : slugAt()
  if (k >= 0) {
    demodulate(k)
    c.x = c.to, s.x = s.to = Math.log10(PROJECTS[k].span), ko.x = 1
  }
}

requestAnimationFrame(function watch(now) {
  if (active && now - built > 300) (active = false), activate(false), when('')
  requestAnimationFrame(watch)
})

let last = 0
export const band: Scene = {
  dur: Infinity,
  build(_t, fr) {
    const now = performance.now(), dt = last ? Math.min(0.1, (now - last) / 1000) : 0
    last = built = now
    if (!active) (active = true), activate(true)
    clock += dt
    update(dt)
    layout(ko.x)
    const f = face(), n = L.vert ? 420 : Math.min(MAX, 760)
    sweep(c.x, 10 ** s.x, n, seed++)

    // the reference level rides the strongest carrier in view, so a hump stays on screen as the RBW narrows
    let top = an.floor + 46
    for (let k = 0; k < K; k++) if (an.peak[k] > top - 4 && Math.abs(uOf(LF[k]) - 0.5) < 0.55) top = an.peak[k] + 4
    ref.to = top
    if (!ref.x) ref.x = top
    settle(ref, dt, 6, 1)

    const reveal = clamp(clock / 1.3)
    rowsIn = clamp((clock - 0.9) / 1.4)
    words.clear()
    graticule(n, f)
    traceAndMarks(n, reveal, f)
    footprints(n)
    waterfall(n, f, 1 - ko.x)
    readouts(f)
    drawDemo(f)
    show(hover >= 0 && hover !== open ? hover : tuned, open)

    fr.ch.push(
      { w: 0.4, gain: 0.5, path: grat },
      { w: 1.4, gain: 1, path: trace },
      { w: 0.5, gain: 0.8, path: marks },
      { w: 1, gain: 0.75, path: words },
      { w: 0.9, gain: 0.8, path: wf },
    )
    if (demo.len) fr.ch.push({ w: 1.4, gain: 0.85, path: demo })
    fr.rate = 3e6
    fr.look = { tau: 0.06 }
    return voice(open >= 0 ? open : tuned, open >= 0 ? 1 : tuned >= 0 ? clamp(1 - Math.abs(LF[tuned] - c.x) / (0.03 * an.s)) : 0)
  },
}

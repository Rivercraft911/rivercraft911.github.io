// The copper: River's boards carry what they really carry. Where a board stands on the planet (ctx.ts's solids, from
// KiCad's own GLB), the beam draws its signals on its traces: each net's tracks, vias and pads as KiCad has them
// (src/boards/<id>.json, mm from the outline's top-left, y down), routed pad to pad through the copper and laid in the
// solid's own frame (bake-models.mjs: metres, KiCad's x along +x and its y along +z, the top side +y, the outline's
// middle on the mid-plane at the origin), so a stroke lies on the trace it belongs to however the board is stood,
// leant or flown. Copper under the surface is drawn where it is, dimmer, as through the board.
//
// A signal is a row of cells, one bit (or one sample) each, running down the wire: cell k is `lam` mm long and its
// front is (x − k) lam from the source at clock x. Near, it stands off the copper as a scope would draw it, level
// against distance; far, the copper is lit where the line is high; farther, where a cell is under a few pixels,
// the wire only glows at its mean level; and a board too small to read is left alone.
//
// Time. No wire here can be watched at its own speed, and the phosphor holds what it is shown for 25 ms, so a cell
// must last several times that to be seen apart from the next: every board runs on its own slowed clock, about
// twelve cells a second, and each place says how slow under its equation. The bits are the real
// ones: what the place is doing, in the wire's own format.
import { project, seen } from '../acts/reality'
import { clamp, mix, smooth, view } from '../acts/scene'
import { draw as write, tex } from '../beam/math'
import { Path } from '../beam/path'
import { load, type Board } from '../boards'
import { QPSK, rc, symbol } from '../dsp/dvbs2'
import { clear, ctx } from './ctx'

// ---- a net as a graph, and a wire through it --------------------------------------------------------------------
type Graph = { x: number[]; y: number[]; l: number[]; e: number[][]; pads: Map<string, number[]>; tracks: number; via: boolean[] }
const nets = new WeakMap<Board, Map<number, Graph>>()
const ref = (name: string) => name.split(' ')[0]

// Net `net` of b: a node at every track vertex, an edge along every segment; a track's end joined to whatever track
// it lands on (KiCad's own ends can miss each other by a hundredth); vias joining what they pass through; and each
// pad joined to the copper that crosses it, on its own layer or up a via inside it. A net may also be joined by a
// pour, which the geometry does not have: its vias are then one hop from each other, at four times the distance, so
// copper that is known is always taken first (wire() leaves such a hop undrawn).
function graph(b: Board, net: number) {
  const m = nets.get(b) ?? nets.set(b, new Map()).get(b)!
  let g = m.get(net)
  if (g) return g
  m.set(net, (g = { x: [], y: [], l: [], e: [], pads: new Map(), tracks: 0, via: [] }))
  const { x, y, l, e, via } = g, ids = new Map<string, number>(), segs: number[] = [], ends: number[] = []
  const link = (i: number, j: number, w = Math.hypot(x[i] - x[j], y[i] - y[j])) => i !== j && (e[i].push(j, w), e[j].push(i, w))
  // how near segment a–b comes to (px, py), and where: into `near`
  const near = [0, 0]
  const reach = (px: number, py: number, a: number, c: number) => {
    const dx = x[c] - x[a], dy = y[c] - y[a], k = clamp(((px - x[a]) * dx + (py - y[a]) * dy) / (dx * dx + dy * dy || 1))
    return (near[0] = x[a] + k * dx - px), (near[1] = y[a] + k * dy - py), Math.hypot(near[0], near[1])
  }
  for (const t of b.tracks) {
    if (t[2] !== net) continue
    for (let i = 3, a = -1; i < t.length; i += 2) {
      const k = `${t[0]},${t[i]},${t[i + 1]}`
      let c = ids.get(k)
      if (c === undefined) ids.set(k, (c = x.length)), x.push(t[i]), y.push(t[i + 1]), l.push(t[0]), e.push([])
      if (a >= 0 && a !== c) link(a, c), segs.push(a, c)
      if (i === 3 || i === t.length - 2) ends.push(c, t[1] / 2)
      a = c
    }
  }
  const n = (g.tracks = x.length)
  for (let q = 0; q < ends.length; q += 2) for (let s = 0, i = ends[q]; s < segs.length; s += 2) if (l[segs[s]] === l[i] && reach(x[i], y[i], segs[s], segs[s + 1]) <= ends[q + 1]) link(i, segs[s]), link(i, segs[s + 1])
  for (const [vx, vy, , d] of b.vias) for (let i = 0, a = -1; i < n; i++) if (Math.hypot(x[i] - vx, y[i] - vy) < d / 2) a >= 0 && link(a, i, 0), (a = i), (via[i] = true)
  for (const [px, py, pn, pl, w, h, turn, name] of b.pads) {
    if (pn !== net) continue
    const c = Math.cos((turn * Math.PI) / 180), s = Math.sin((turn * Math.PI) / 180), i = x.length
    const inside = (dx: number, dy: number) => Math.abs(dx * c - dy * s) <= w / 2 + 0.06 && Math.abs(dx * s + dy * c) <= h / 2 + 0.06
    x.push(px), y.push(py), l.push(Math.max(0, pl)), e.push([])
    for (let q = 0; q < segs.length; q += 2) {
      const a = segs[q], z = segs[q + 1]
      if (pl < 0 || l[a] === pl) reach(px, py, a, z), inside(near[0], near[1]) && (pl < 0 && !e[i].length && (l[i] = l[a]), link(i, a), link(i, z)) // a through pad is met on the layer its track comes in on
      else for (const j of [a, z]) if (via[j] && inside(x[j] - px, y[j] - py)) link(i, j)
    }
    const r = ref(name)
    ;(g.pads.get(r) ?? g.pads.set(r, []).get(r)!).push(i)
  }
  for (let i = 0; i < n; i++) if (via[i]) for (let j = 0; j < i; j++) if (via[j] && Math.hypot(x[i] - x[j], y[i] - y[j]) > 1) link(i, j, 4 * Math.hypot(x[i] - x[j], y[i] - y[j]))
  return g
}

// The shortest way through g from any of `from` to any of `to`: the nodes it passes.
function walk(g: Graph, from: number[], to: number[]) {
  const n = g.x.length, d = new Float64Array(n).fill(Infinity), back = new Int32Array(n).fill(-1), done = new Uint8Array(n), out: number[] = []
  for (const i of from) d[i] = 0
  for (;;) {
    let u = -1
    for (let i = 0; i < n; i++) if (!done[i] && d[i] < Infinity && (u < 0 || d[i] < d[u])) u = i
    if (u < 0) return out
    if (to.includes(u)) {
      for (; u >= 0; u = back[u]) out.unshift(u)
      return out
    }
    done[u] = 1
    for (let q = 0, a = g.e[u]; q < a.length; q += 2) if (d[u] + a[q + 1] < d[a[q]]) (d[a[q]] = d[u] + a[q + 1]), (back[a[q]] = u)
  }
}

// A wire: points in the solid's frame (m), how far each is from the source along the copper (mm), its layer, and
// whether the copper is broken before it (a part stands between).
export type Wire = { n: number; p: Float32Array; s: Float32Array; lay: Uint8Array; cut: Uint8Array; len: number }
// 'U1.21 U3.2 | U3.13 R2.1 | R2.2 J2.1': from pad to pad along their net, and on through each part between. A '>'
// after the last pad runs the wire on to that pad's far end (a USB contact is a pad 6 mm long).
function wire(b: Board, spec: string): Wire {
  const P: number[] = [], S: number[] = [], L: number[] = [], C: number[] = []
  let s = 0
  for (const leg of spec.split('|')) {
    const [ra, rb] = leg.trim().split(/\s+/), far = rb.endsWith('>'), rz = far ? rb.slice(0, -1) : rb, pad = (r: string) => b.pads.find((p) => ref(p[7]) === r)
    const pa = pad(ra), pz = pad(rz), g = pa && graph(b, pa[2]), ids = g ? walk(g, g.pads.get(ra) ?? [], g.pads.get(rz) ?? []) : []
    if (!g || ids.length < 2) {
      console.warn(`copper: ${b.id} has no copper from ${ra} to ${rz}`)
      continue
    }
    ids.forEach((i, k) => {
      const j = ids[k - 1], pour = k > 0 && g.via[i] && g.via[j] && !g.e[i].some((v, q) => !(q & 1) && v === j && g.e[i][q + 1] < 3 * Math.hypot(g.x[i] - g.x[j], g.y[i] - g.y[j]) + 1e-6)
      const put = (x: number, y: number, l: number) => (P.push(x, y), L.push(l), S.push(s), C.push(k && !pour ? 0 : 1))
      if (pour) s += Math.hypot(g.x[i] - g.x[j], g.y[i] - g.y[j])
      else if (k && g.l[i] === g.l[j]) s += Math.hypot(g.x[i] - g.x[j], g.y[i] - g.y[j])
      else if (k && i >= g.tracks) put(g.x[j], g.y[j], g.l[i]), (s += Math.hypot(g.x[i] - g.x[j], g.y[i] - g.y[j])) // down the via, then across the pad
      else if (k && j >= g.tracks) put(g.x[i], g.y[i], g.l[j])
      put(g.x[i], g.y[i], g.l[i])
    })
    if (far && pz) {
      const [px, py, , , w, h, turn] = pz, a = (turn * Math.PI) / 180 + (h > w ? 0 : Math.PI / 2), r = Math.max(w, h) / 2, n = P.length
      const dx = Math.sin(a) * r, dy = Math.cos(a) * r, k = (P[n - 4] - px) * dx + (P[n - 3] - py) * dy > 0 ? -1 : 1 // away from where it came in
      P.push(px + k * dx, py + k * dy), L.push(L[L.length - 1]), S.push((s += r)), C.push(0)
    }
  }
  return laid(b, P, S, L, C)
}
// Board points (mm, and their layers) as a wire in the solid's frame.
function laid(b: Board, P: number[], S: number[], L: number[], C: number[]): Wire {
  const n = S.length, nl = b.layers.length - 1, p = new Float32Array(3 * n)
  for (let i = 0; i < n; i++) {
    p[3 * i] = (P[2 * i] - b.w / 2) / 1e3, p[3 * i + 2] = (P[2 * i + 1] - b.h / 2) / 1e3
    p[3 * i + 1] = (b.t * (0.5 - L[i] / nl) + (L[i] ? (L[i] === nl ? -0.04 : 0) : 0.04)) / 1e3 // on the mask, not in it
  }
  return { n, p, s: Float32Array.from(S), lay: Uint8Array.from(L), cut: Uint8Array.from(C), len: S[n - 1] ?? 0 }
}
// ?copper: every track on a board's two faces, lit, to see that the wires lie where the solid's copper does.
const CHECK = new URLSearchParams(location.search).has('copper'), whole = new WeakMap<Board, Wire>()
function every(b: Board) {
  const P: number[] = [], S: number[] = [], L: number[] = [], C: number[] = []
  let s = 0
  for (const t of b.tracks) if (!t[0] || t[0] === b.layers.length - 1) for (let i = 3; i < t.length; i += 2) P.push(t[i], t[i + 1]), L.push(t[0]), C.push(+(i === 3)), S.push(i > 3 ? (s += Math.hypot(t[i] - t[i - 2], t[i + 1] - t[i - 1])) : s)
  return laid(b, P, S, L, C)
}
// The wire of net `name` from its pad that matches `from` to the one that matches `to`.
function span(b: Board, name: string, from: RegExp, to: RegExp) {
  const k = b.nets.indexOf(name), at = (re: RegExp) => ref(b.pads.find((p) => p[2] === k && re.test(p[7]))?.[7] ?? '?')
  return wire(b, `${at(from)} ${at(to)}`)
}
// A board's wires, made when its geometry has come (asked for the first time the board is drawn).
function wires<T>(id: string, make: (b: Board) => T) {
  let w: T | undefined, b: Board | undefined, asked = false
  return () => {
    if (!asked) (asked = true), load(id).then((g) => ((w = make(g)), (b = g)))
    return (B = b!), w
  }
}

// ---- the board in the frame, and the pen --------------------------------------------------------------------------
const cu = new Path(), CU = { w: 0, path: cu }, note = new Path(), NOTE = { w: 0.1, path: note }
const MAX = 16384, SX = new Float32Array(MAX), SY = new Float32Array(MAX), TX = new Float32Array(MAX), TY = new Float32Array(MAX), VIS = new Float32Array(MAX), OUT = new Uint8Array(MAX)
const RES = 0.007, INNER = 0.55, FAR = 0.4 // the smallest cell worth drawing, of the screen's half-height; copper inside the board, and on its far side
const q = [0, 0, 0]
let B: Board, M: ArrayLike<number>, U = 0, SIDE = 1, GAIN = 0 // the board, its solid's transform, a mm on the screen, the side the eye is on
let W: Wire, pen = false, lifted = false, low = false, cr = 1, cg = 1, cb = 1

// Is the last `model` placed there to be drawn on, and near enough to read? Sets the frame for the strokes.
function on(model: string) {
  const mod = ctx.models[model], items = ctx.items
  let i = items.length - 1
  while (i >= 0 && items[i].model !== mod) i--
  if (i < 0 || !mod || !B) return false
  M = items[i].m
  const x = M[3], y = M[7], z = M[11], sc = Math.hypot(M[0], M[4], M[8]), big = Math.max(B.w, B.h)
  U = (sc * 1e-3 * ctx.p[3]) / Math.hypot(x, y, z)
  q[0] = x + ctx.E[0], q[1] = y + ctx.E[1], q[2] = z + ctx.E[2]
  if (U * big < 0.06 || !clear(q)) return false
  if (project(ctx.p, x, y, z) && (Math.abs(seen.x) > view.a + U * big || Math.abs(seen.y) > 1 + U * big)) return false
  SIDE = M[1] * x + M[5] * y + M[9] * z < 0 ? 1 : -1
  GAIN = 1.2 * smooth(0.06, 0.45, U * big)
  if (!ctx.f.ch.includes(CU)) cu.clear(), ctx.f.ch.push(CU)
  if (CHECK) glow(whole.get(B) ?? whole.set(B, every(B)).get(B)!, 0.3, 1, 0.9, 0.5)
  return true
}
// The channel's share of the beam follows what there is to draw.
const share = () => (CU.w = clamp(cu.len / 9, 0.05, 1.6))

// Wire w through the camera, and the line H mm off the board over it, on the eye's side.
function show(w: Wire, H: number) {
  const nl = B.layers.length - 1, top = SIDE > 0 ? 0 : nl, yt = (SIDE * (B.t / 2 + H)) / 1e3, a = view.a + 0.15, p = ctx.p
  W = w, pen = false, lifted = H > 0
  for (let i = 0; i < w.n && i < MAX; i++) {
    const x = w.p[3 * i], y = w.p[3 * i + 1], z = w.p[3 * i + 2]
    VIS[i] = project(p, M[0] * x + M[1] * y + M[2] * z + M[3], M[4] * x + M[5] * y + M[6] * z + M[7], M[8] * x + M[9] * y + M[10] * z + M[11]) ? (w.lay[i] === top ? 1 : w.lay[i] === nl - top ? FAR : INNER) : 0
    SX[i] = seen.x, SY[i] = seen.y
    OUT[i] = (seen.x < -a ? 1 : seen.x > a ? 2 : 0) | (seen.y < -1.15 ? 4 : seen.y > 1.15 ? 8 : 0)
    if (!H) continue
    if (!project(p, M[0] * x + M[1] * yt + M[2] * z + M[3], M[4] * x + M[5] * yt + M[6] * z + M[7], M[8] * x + M[9] * yt + M[10] * z + M[11])) VIS[i] = 0
    TX[i] = seen.x, TY[i] = seen.y
  }
}
// The pen to the point f of the way along segment i, h of the way up to the line over it.
function to(i: number, f: number, h: number, I: number) {
  const v = Math.min(VIS[i], VIS[i + 1])
  if (!v || W.cut[i + 1] || OUT[i] & OUT[i + 1] || (low && v < 1)) return void (pen = false)
  let x = SX[i] + (SX[i + 1] - SX[i]) * f, y = SY[i] + (SY[i + 1] - SY[i]) * f
  if (lifted && v === 1) (x += (TX[i] + (TX[i + 1] - TX[i]) * f - x) * h), (y += (TY[i] + (TY[i + 1] - TY[i]) * f - y) * h)
  cu.color(cr, cg, cb, I * v * GAIN)
  pen ? cu.lineTo(x, y) : cu.moveTo(x, y)
  pen = true
}
// The wire from sa to sb mm, climbing from ha to hb. `at` is where the last stretch left off: they come in order.
let at = 0
function stretch(sa: number, sb: number, ha: number, hb: number, I: number) {
  const S = W.s, n = Math.min(W.n, MAX), fr = (s: number) => (S[at + 1] > S[at] ? clamp((s - S[at]) / (S[at + 1] - S[at])) : 0)
  const h = (s: number) => (sb > sa ? ha + ((hb - ha) * (s - sa)) / (sb - sa) : ha)
  while (at < n - 2 && S[at + 1] <= sa) at++
  to(at, fr(sa), ha, I)
  while (at < n - 2 && S[at + 1] < sb) to(at, 1, h(S[at + 1]), I), at++, to(at, 0, h(S[at]), I)
  to(at, fr(sb), hb, I)
}

// A signal: cells `lam` mm long, cell k's level (0…1, or −1…1 for a `wave`, which is drawn through its samples
// rather than stepped); `dc` what it averages when it can't be resolved, `res` the mm that must show for it to be.
export type Sig = { lam: number; at: (k: number) => number; dc?: number; wave?: boolean; res?: number }
// The whole wire at one level: a line that is simply high, or too fast to see.
function glow(w: Wire, r: number, g: number, b: number, I: number) {
  if (!w.n || I <= 0) return
  show(w, 0), (cr = r), (cg = g), (cb = b), (at = 0)
  stretch(0, w.len, 0, 0, I)
}
// Signal G on wire w at clock x (cells), in colour, standing up to H mm off the board when near.
function run(w: Wire, G: Sig, x: number, r: number, g: number, b: number, I = 1, H = 0) {
  const lam = G.lam, res = (G.res ?? lam) * U
  if (!w.n) return
  if (res < RES) return glow(w, r, g, b, I * (G.dc ?? 0.5))
  const f = H ? smooth(1.5 * RES, 5 * RES, res) : 0, k0 = Math.floor(x), s0 = (x - k0) * lam
  show(w, H * f), (cr = r), (cg = g), (cb = b), (at = 0)
  if (G.wave) {
    // sample k is (x − k) lam down the wire; the first stretch starts between two of them
    let va = G.at(k0 + 1), sa = s0 - lam
    for (let k = k0; sa < w.len; k--) {
      const vb = G.at(k), sb = sa + lam, a = Math.max(sa, 0), z = Math.min(sb, w.len), ha = va + ((vb - va) * (a - sa)) / lam, hb = va + ((vb - va) * (z - sa)) / lam
      stretch(a, z, 0.5 + 0.5 * ha, 0.5 + 0.5 * hb, I * mix(Math.abs(ha + hb) / 2, 0.75, f))
      va = vb, sa = sb
    }
    return
  }
  for (let k = k0, sa = 0, sb = s0; sa < w.len; k--) {
    const v = G.at(k)
    while (sb < w.len && G.at(k - 1) === v) k--, (sb += lam) // one stroke for a run of cells at one level
    pen = false, low = !v // no risers: an edge that moves leaves a comb of itself on the phosphor
    if (v > 0 || f > 0) stretch(sa, Math.min(sb, w.len), v, v, I * mix(v, 0.3 + 0.7 * v, f))
    sa = sb, sb += lam
  }
  low = false
}
// What the copper's clock is, under the place's equation and its numbers.
function say(src: string, c: readonly number[], vals?: ArrayLike<number>) {
  if (ctx.f.ch.includes(NOTE)) return
  note.clear().color(c[0], c[1], c[2])
  write(note, tex(src), -view.a * 0.9, 0.57, 0.04, 0, 0.75, vals)
  ctx.f.ch.push(NOTE)
}
const mod = (a: number, n: number) => ((a % n) + n) % n

// ---- the bench: PEEP, and the glasses' board ----------------------------------------------------------------------
// PEEP's own nets. The photodiode's current into the VSOP38338 is the 38 kHz bursts themselves (342 cycles each, not
// resolved here); its output idles high and drops for each burst, and the first falling edge is the STM32's EXTI.
// Then the pair. A full-speed bit is 83.3 ns; here it is 83.3 ms, a million times slow, where the bench is 25, so
// only one transaction in forty can be seen whole: the device's answer to the IN poll every 400 ms (of the bench's
// time), just as the bus has it. That is SYNC, the PID (DATA0: press reports are the even ones), the 8-byte boot
// keyboard report, CRC16 and EOP, bits LSB first, bit-stuffed after six ones, NRZI, J the idle state with D+ up; or,
// when no report is waiting, a NAK. D+ is drawn green and D− white, as in a USB cable.
const PEEP = wires('peep', (b) => ({ dp: wire(b, 'U1.20 J1.3>'), dm: wire(b, 'U1.19 J1.2>'), ir: wire(b, 'D1.C U3.7'), out: wire(b, 'U3.3 U1.7') }))
const LINE = new Uint8Array(128) // the packet on the pair, a line state a bit: 0 SE0, 1 J, 2 K
let bits = 0, sent = -1
function packet(pid: number, report?: ArrayLike<number>) {
  let st = 1, ones = 0, crc = 0xffff
  bits = 0
  const byte = (v: number, sum = false) => {
    for (let i = 0; i < 8; i++) {
      const b = (v >> i) & 1
      if (sum) crc = (crc ^ b) & 1 ? (crc >> 1) ^ 0xa001 : crc >> 1
      if (!b) (st = 3 - st), (ones = 0)
      LINE[bits++] = st
      if (b && ++ones === 6) (st = 3 - st), (LINE[bits++] = st), (ones = 0) // the stuffed zero
    }
  }
  byte(0x80), byte(pid)
  if (report) {
    for (let i = 0; i < 8; i++) byte(i === 0 ? report[0] : i === 2 ? report[1] : 0, true)
    crc ^= 0xffff
    byte(crc & 255), byte(crc >> 8)
  }
  LINE[bits++] = 0, LINE[bits++] = 0, LINE[bits++] = 1
}
const WINDOW = 120, POLL = 400 // cells a transaction is given; ms of the bench's time between the ones shown
const state = (k: number) => (k >= sent * WINDOW && k - sent * WINDOW < bits ? LINE[k - sent * WINDOW] : 1)
const DP: Sig = { lam: 0.42, at: (k) => +(state(k) === 1), dc: 0.7 }, DM: Sig = { lam: 0.42, at: (k) => +(state(k) === 2), dc: 0.3 }

// The strobe board. The ATtiny402 drives each valve from two pins through 1 kΩ, never with DC: at its fastest,
// darkest setting a 50 ms frame is 10 ms clear, both electrodes low, then four pairs of 5 ms one way and 5 ms the
// other, 100 Hz across the cell. Here sixteen times slow, a cell 5 ms: A up on the first half of each pair, B on the second.
const pads = (a: string, r: string, j: string) => `U1.${a} ${r}.1 | ${r}.2 ${j}`
const STROBE = wires('strobe', (b) => [pads('4', 'R4', 'J3.1'), pads('5', 'R8', 'J3.2'), pads('2', 'R9', 'J4.1'), pads('3', 'R10', 'J4.2')].map((s) => wire(b, s)))
const half = (k: number, odd: number) => +(mod(k, 10) >= 2 && (mod(k, 10) & 1) === odd)
const LCD: Sig[] = [{ lam: 1.4, at: (k) => half(k, 0) }, { lam: 1.4, at: (k) => half(k, 1) }]

// ms: the bench's cycle clock; lit: is a burst on the photodiode; codes: the macro as [modifier, usage] a character.
export function bench(ms: number, lit: boolean, codes: ArrayLike<ArrayLike<number>>, here: boolean) {
  const w = PEEP()
  if (w && on('peep')) {
    const j = Math.floor(ms / POLL), H = 0.5
    if (j !== sent) (sent = j), 20 * j < codes.length ? packet(0xc3, codes[20 * j]) : packet(0x5a) // a character is 20 ms
    if (lit) glow(w.ir, 1, 0.12, 0.3, 1.2)
    else glow(w.out, 1, 0.85, 0.5, 0.7)
    run(w.dp, DP, (ms / POLL) * WINDOW, 0.35, 1, 0.45, 1.1, H), run(w.dm, DM, (ms / POLL) * WINDOW, 1, 1, 1, 1.1, H)
    share()
  }
  const s = STROBE()
  if (s && on('strobe-board')) {
    for (let i = 0; i < 4; i++) run(s[i], LCD[i & 1], ctx.t * 12.5, i & 1 ? 0.55 : 0.45, 1, i & 1 ? 1 : 0.62, 1, 1)
    share()
  }
  if (here) say('\\USB:\\ T_b=83.3\\,ns\\to 83.3\\,ms\\qquad\\LCD:\\ t\\to t/16', [0.45, 1, 0.62])
}

// ---- the hearts ---------------------------------------------------------------------------------------------------
// The data line. Two chains of 72 WS2812B, each fed from the ESP32-C3 through a level shifter and 33 Ω, at 800 kb/s:
// a pixel is 24 bits, G R B, and each LED keeps the first 24 it hears and passes the rest on, so the line after LED k
// only wakes when LED k has had its own and falls quiet with all the others: the lit run grows a LED a word. A frame
// is 2.16 ms a chain, one chain then the other, each closed by 300 µs of low. Bits can't be seen at any speed a
// heartbeat allows, so a wire shows the word on it: lit by the share of the word the line is high (a 1 is 0.8 of
// 1.25 µs, a 0 is 0.4). One frame a beat is shown, the one sent at the lub's peak, 190 times slow.
const HEART = wires('heart', (b) => {
  const next = (d: string) => {
    const out = b.pads.find((p) => p[7].startsWith(`${d}.2 `))
    return out && b.pads.find((p) => p[2] === out[2] && p[7].includes('DIN'))?.[7].split('.')[0]
  }
  return [['U4.3 R15.1 | R15.2 D13.4', 'D13'], ['U4.6 R14.1 | R14.2 D85.4', 'D85']].map(([feed, d]) => {
    const hops = [wire(b, feed)]
    for (let n; (n = next(d)); d = n) hops.push(wire(b, `${d}.2 ${n}.4`))
    return hops
  })
})
const CHAIN = 2.46, WORD = 0.03, FRAME = 2 * CHAIN // ms: a chain's 72 words and its reset; a word; both chains
// ph: the beat's phase, s, of its period T; lift: how hot each LED runs, in the order they are clocked.
export function heart(ph: number, T: number, lift: ArrayLike<number>, here: boolean) {
  const w = HEART()
  if (here) say('\\WS:\\ 800\\,kb/s,\\ 24\\,b\\ a\\ pixel\\qquad t\\to t/190', [1, 0.4, 0.55])
  if (!w || !on('heart')) return
  const ms = (mod(ph - 0.15, T) / T) * FRAME, c = ms < CHAIN ? 0 : 1, j = Math.floor((ms - c * CHAIN) / WORD)
  if (j < 72) {
    // the word for LED j: red alone survives the firmware's gamma
    const red = Math.round(255 * (Math.round(255 * Math.min(1, 0.018 + lift[72 * c + j])) / 255) ** 2.2)
    let ones = 0
    for (let v = red; v; v >>= 1) ones += v & 1
    for (let k = 0; k <= j && k < w[c].length; k++) glow(w[c][k], 1, 0.16, 0.24, 1.6 * (0.32 + (0.32 * ones) / 24))
  }
  share()
}

// ---- the lighthouse: LaserBrain and LaserDriverRGB ---------------------------------------------------------------
// Twelve lines. Each laser has four current sinks, binary-weighted, and the pixel is which of them are on: EN1 the
// least bit, EN4 the most, straight off the controller's GPIO at 1.83 MHz, 320 pixels in the middle 30 % of each
// facet. They leave LaserBrain by its ribbon and arrive on LaserDriverRGB's, as late as the copper between is long,
// and at the iC-HG30s the enabled sinks add: each cathode line carries the sum, the diode's own current, lit by it.
// The frame is the lighthouse's own, in the galvo's order; a pixel here is 1/12 s, and the dead 70 % of each
// facet is not waited for. After every line the galvo's MCP4921 takes one 16-bit word, too quick to read: its
// lines only flash, and its output steps down the frame.
const RGB = ['RED', 'GR', 'BLUE'], LASER = ['RED', 'GREEN', 'BLUE'], INK = [[1, 0.2, 0.15], [0.25, 1, 0.3], [0.3, 0.45, 1]], PX = 12, NX = 320, NY = 120
let LV: Uint8Array
const level = (k: number, c: number) => {
  const f = Math.floor(k / NX), j = mod(f, NY)
  return LV[((j < 60 ? 2 * j + 1 : 238 - 2 * j) * NX + k - NX * f) * 3 + c]
}
const EN: Sig[] = [], SUM: Sig[] = []
for (let c = 0; c < 3; c++) {
  for (let n = 0; n < 4; n++) EN.push({ lam: 0.75, at: (k) => (level(k, c) >> n) & 1 })
  SUM.push({ lam: 0.75, at: (k) => level(k, c) / 15, dc: 0.35 })
}
const each = (b: Board, from: RegExp, to: RegExp) => RGB.flatMap((c) => [1, 2, 3, 4].map((n) => span(b, `${c}_EN${n}`, from, to)))
const BRAIN = wires('laserbrain', (b) => ({
  en: each(b, /^J12\./, /^J1\./),
  dac: ['CS_DAC', 'SCK_DAC', 'SDI_DAC'].map((n) => span(b, n, /^J12\./, /^U2\./)),
  out: span(b, 'V_DAC', /^U2\./, /^R10\./),
}))
const DRIVER = wires('laserdriver', (b) => ({ en: each(b, /^J1\./, /^U\d/), sum: LASER.map((c) => span(b, `${c}_CATH`, /LDK/, /^LD\d/)) }))
// lv: the frame, 4 bits a laser a pixel, as the lighthouse has it.
export function lasers(lv: Uint8Array, here: boolean) {
  const x = ctx.t * PX, a = BRAIN(), late = a ? a.en : undefined
  LV = lv
  if (here) say('f_{px}=1.83\\,MHz\\to 12\\,Hz\\qquad i=(8b_4+4b_3+2b_2+b_1)\\,i_1', [1, 0.35, 0.3])
  if (a && on('laserbrain')) {
    for (let i = 0; i < 12; i++) run(a.en[i], EN[i], x, INK[i >> 2][0], INK[i >> 2][1], INK[i >> 2][2], 0.9, 1.2)
    const f = Math.floor(x / NX), j = mod(f, NY), row = j < 60 ? 2 * j + 1 : 238 - 2 * j, word = x - NX * f < 5 // 16 bits at 6 MHz: five pixels long
    for (let i = 0; i < 3; i++) if (word !== !i) glow(a.dac[i], 1, 0.8, 0.4, 0.6) // chip select is the one that is low for it
    glow(a.out, 1, 0.8, 0.4, 0.25 + 0.75 * (row / NY))
    share()
  }
  const d = DRIVER()
  if (d && on('laserdriver')) {
    for (let i = 0; i < 12; i++) run(d.en[i], EN[i], x - (late ? late[i].len / 0.75 : 0), INK[i >> 2][0], INK[i >> 2][1], INK[i >> 2][2], 0.9, 0.8)
    for (let c = 0; c < 3; c++) run(d.sum[c], SUM[c], x - (late ? late[4 * c].len / 0.75 : 0) - d.en[4 * c].len / 0.75, INK[c][0], INK[c][1], INK[c][2], 1.8)
    share()
  }
}

// ---- the receiver: Ephemeris-1 -----------------------------------------------------------------------------------
// What the MAX2769B hands over: I and Q, two bits each, sign and magnitude, and the clock they change on. The
// samples are the capture the search is run on (receiver.ts: every satellite in view under 18 dB of noise, the
// threshold at σ, taken at 2.048 MHz), in order, six samples a second; each line goes through the level
// shifter and its 33 Ω to the header. The antenna's line and the LNA's only glow: L1 is 770 cycles a sample.
const GNSS = wires('gnss', (b) => ({
  // I1, I0, Q1, Q0: sign then magnitude
  bits: ['U1.21 U3.2 | U3.13 R2.1 | R2.2 J2.1', 'U1.20 U3.3 | U3.12 R3.1 | R3.2 J2.3', 'U1.17 U3.4 | U3.11 R4.1 | R4.2 J2.5', 'U1.18 U3.5 | U3.10 R5.1 | R5.2 J2.7'].map((s) => wire(b, s)),
  clk: wire(b, 'U1.16 U4.10 | U4.5 R6.2 | R6.1 J2.9'),
  rf: [wire(b, 'J1.1 C1.1 | C1.2 U1.27'), wire(b, 'U1.2 C2.1 | C2.2 U1.5')],
}))
let XR: Float64Array, XI: Float64Array
const SAMPLE: Sig[] = [0, 1, 2, 3].map((i) => ({ lam: 1.2, at: (k) => { const v = (i & 2 ? XI : XR)[mod(k, XR.length)]; return +(i & 1 ? Math.abs(v) > 1 : v < 0) } }))
const CLOCK: Sig = { lam: 0.6, at: (k) => k & 1 }
export function gnss(xr: Float64Array, xi: Float64Array, here: boolean) {
  const w = GNSS(), x = ctx.t * 6
  XR = xr, XI = xi
  if (here) say('f_s=2.048\\,MHz\\to 6\\,Hz\\qquad I,Q\\in\\{\\pm 1,\\pm 3\\}', [0.6, 0.9, 1])
  if (!w || !on('ephemeris')) return
  for (let i = 0; i < 4; i++) run(w.bits[i], SAMPLE[i], x, i & 2 ? 1 : 0.5, i & 2 ? 0.75 : 0.95, i & 2 ? 0.4 : 1, i & 1 ? 1.2 : 1.7, 1)
  run(w.clk, CLOCK, 2 * x, 1, 1, 1, 0.9, 0.6)
  glow(w.rf[0], 0.6, 0.9, 1, 0.8), glow(w.rf[1], 0.6, 0.9, 1, 0.8)
  share()
}

// ---- the pad: Pigeon's carrier and the Yapogee S3 ------------------------------------------------------------------
// The video's way out. The CM5 clocks transport stream to the S3 over SPI (mode 0, MSB first, 16 MHz on the bench's
// live run), one 1332-byte message a chip select: 'PV', version 1, type 1 (TS), a sequence number and a length
// (little-endian, 1316), four spare, seven 188-byte TS packets, each led by its 0x47, and a CRC-32 of the lot; READY
// is the S3 saying it has room. What is inside a TS packet is coded video, which is noise to anything but a decoder,
// and is noise here (a hash of where the byte is); the CRC is computed over it. A bit is a sixth of a second, 2.7·10⁶
// slow, and the same bits come up the S3's edge as late as the carrier's copper is long. Under the carrier's surface
// the two cameras' CSI-2 lanes glow on their inner layer: 2064 × 1552 at 30 a second each, far too quick to read.
// On the same clock the S3's radio line carries 3 symbols a second for its 8 Msym/s: the QPSK launch.ts sends down,
// I as it leaves the S3 on 2.42 GHz, through the pad and the balun into the RFFC5072's mixer against 3.70 GHz, and
// out the other balun, the filter and the amplifier on 1.28 GHz. The carriers themselves are not resolved.
const LEN = 1332, GAP = 32 // bytes a message; bytes of quiet between two (the CM5 waits on READY)
const hash8 = (n: number) => (Math.imul(n ^ (n >>> 15), 0x2c1b3c6d) >>> 24) & 255
let seq = -1, crc = 0
const raw = (m: number, i: number) => (i < 2 ? (i ? 0x56 : 0x50) : i < 4 ? 1 : i < 6 ? (m >> (8 * (i - 4))) & 255 : i < 8 ? (1316 >> (8 * (i - 6))) & 255 : i < 12 ? 0 : (i - 12) % 188 ? hash8(m * LEN + i) : 0x47)
function pv(k: number) {
  const byte = Math.floor(k / 8), m = Math.floor(byte / (LEN + GAP)), i = byte - m * (LEN + GAP)
  if (i >= LEN) return 0
  if (m !== seq) {
    seq = m, crc = ~0
    for (let j = 0; j < LEN - 4; j++) for (let b = 0, v = raw(m & 0xffff, j); b < 8; b++, v >>= 1) crc = (crc ^ v) & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1
    crc = ~crc
  }
  return ((i < LEN - 4 ? raw(m & 0xffff, i) : (crc >>> (8 * (i - LEN + 4))) & 255) >> (7 - (k & 7))) & 1
}
const busy = (k: number) => mod(Math.floor(k / 8), LEN + GAP) < LEN
const D0: Sig = { lam: 1.6, at: pv }, SCK: Sig = { lam: 0.8, at: (k) => +(busy(k >> 1) && (k & 1) === 1) }, CS: Sig = { lam: 1.6, at: (k) => +!busy(k), dc: 0 }
const SPS = 8, RF: Sig = {
  lam: 3.2 / SPS, res: 1.2, wave: true, dc: 0.6,
  at: (k) => {
    let v = 0
    for (let n = Math.floor(k / SPS), j = n - 3; j <= n + 4; j++) v += QPSK.pts[2 * symbol(j, 2)] * rc(k / SPS - j)
    return clamp(v / Math.SQRT1_2, -1.2, 1.2) / 1.2
  },
}
const NRF: Sig = { ...RF, at: (k) => -RF.at(k) }
const CARRIER = wires('pigeon-carrier', (b) => ({
  spi: [span(b, '/CM5/SCLK', /^J3\./, /^J13\./), span(b, '/CM5/CS_N', /^J3\./, /^J13\./), span(b, '/CM5/D0', /^J3\./, /^J13\./)],
  ready: wire(b, 'J13.11 U14.3 | U14.4 J3.41'),
  csi: b.nets.flatMap((n) => (/MIPI\d_/.test(n) ? [span(b, n, /^J[78]\./, /^J5\./)] : [])),
}))
const edge = (pin: string, r: string, io: string) => `J1.${pin} ${r}.2 | ${r}.1 U1.${io}`
const YAPOGEE = wires('yapogee-s3', (b) => ({
  spi: [edge('2', 'R26', '20'), edge('4', 'R27', '18'), edge('5', 'R28', '19')].map((s) => wire(b, s)),
  ready: wire(b, 'U1.12 R32.1 | R32.2 J1.11'),
  rf: [wire(b, 'J3.1 R47.1 | R47.2 T1.1'), wire(b, 'T1.3 C33.1 | C33.2 U7.24'), wire(b, 'T1.4 C32.1 | C32.2 U7.23'),
    wire(b, 'U7.28 C59.1 | C59.2 T2.3'), wire(b, 'U7.27 C60.1 | C60.2 T2.4'), wire(b, 'T2.1 FL1.1 | FL1.3 C52.1 | C52.2 U10.3'), wire(b, 'U10.1 C53.1 | C53.2 R50.1 | R50.2 J4.1')],
}))
const SPI = [SCK, CS, D0], WHITE = [[1, 1, 1], [1, 0.7, 0.35], [1, 0.85, 0.55]]
export function pigeon(here: boolean) {
  const x = ctx.t * 6, c = CARRIER(), late = c ? c.spi : undefined
  if (here) say('\\SPI:\\ 16\\,MHz\\to 6\\,Hz\\qquad R_s=8\\,MBd\\to 3\\,Bd', [1, 0.7, 0.35])
  if (c && on('pigeon-carrier')) {
    for (let i = 0; i < 3; i++) run(c.spi[i], SPI[i], i ? x : 2 * x, WHITE[i][0], WHITE[i][1], WHITE[i][2], i ? 1.1 : 0.6, 2)
    glow(c.ready, 0.5, 1, 0.6, 0.5)
    if (U * B.w > 0.5) for (const w of c.csi) glow(w, 0.45, 0.6, 1, 0.35)
    share()
  }
  const y = YAPOGEE()
  if (y && on('yapogee-s3')) {
    for (let i = 0; i < 3; i++) {
      const xi = x - (late ? late[i].len / 1.6 : 0)
      run(y.spi[i], SPI[i], i ? xi : 2 * xi, WHITE[i][0], WHITE[i][1], WHITE[i][2], i ? 1.1 : 0.6, 1)
    }
    glow(y.ready, 0.5, 1, 0.6, 0.5)
    for (let i = 0, d = 0; i < 7; i++) {
      run(y.rf[i], i === 2 || i === 4 ? NRF : RF, x * SPS * 0.5 - d, i < 3 ? 0.55 : 1, i < 3 ? 0.8 : 0.6, i < 3 ? 1 : 0.3, 1.3, 2.4)
      if (i !== 1 && i !== 3) d += y.rf[i].len / RF.lam // the two halves of a pair run together
    }
    share()
  }
}

// ---- the station: the Z coil panel, and the ground station's hat --------------------------------------------------
// The coil is one wire: 49 turns a layer on five layers, in series, the same current everywhere along it at once, so
// nothing runs down it but the current itself. The beam shows that: marks along the top layer's turns that move the
// way the current goes, as fast as it is strong, and are as bright. The current is the one the B-dot law is asking
// of that face: i = m/NA, NA = 0.931 m² a panel (the board's own note: 0.0558 A m² at 60 mA).
export const NA = 0.931 // m²: a panel's turns times their area
const COIL = wires('coil', (b) => {
  const w = wire(b, 'J1.2 NT1.1'), a = w.lay.indexOf(0), z = w.lay.lastIndexOf(0) + 1 // its top layer, which is all that shows
  const top: Wire = { n: z - a, p: w.p.subarray(3 * a, 3 * z), s: w.s.subarray(a, z).map((s) => s - w.s[a]), lay: w.lay.subarray(a, z), cut: w.cut.subarray(a, z), len: w.s[z - 1] - w.s[a] }
  // which way round it winds, seen from the top: anticlockwise, and current along it makes m out of the top side
  let area = 0
  for (let i = 3; i < 3 * top.n; i += 3) area += top.p[i - 3] * top.p[i + 2] - top.p[i] * top.p[i - 1]
  return { top, dir: area < 0 ? 1 : -1 }
})
let gap = 4
const MARK: Sig = { lam: 6, at: (k) => +(mod(k, gap) === 0), res: 1e3 }
const flow = [0, 0, 0, 0], seenAt = [NaN, NaN, NaN, NaN]
// i: the current, as a fraction of the most the law asks; axis: whose it is (the body's x, y or z, or 3: the ground's).
export function coil(i: number, axis: number) {
  const w = COIL()
  if (!w) return
  if (seenAt[axis] !== ctx.t) (flow[axis] += 9 * i * w.dir * ctx.dt), (seenAt[axis] = ctx.t)
  if (Math.abs(i) < 0.02 || !on('coil') || SIDE < 0) return
  gap = Math.max(3, Math.ceil((w.top.len * U) / 40)) // the marks, thinned to what the beam can afford
  run(w.top, MARK, flow[axis], 0.75, 0.6, 1, 0.9 * Math.min(1, Math.abs(i)))
  share()
}

// The hat's UHF line: the 438.1 MHz LoRa the satellite beacons on (SF7, 125 kHz: a symbol is 2⁷ chips, 1.024 ms),
// coming in from the antenna to the RFM98. What every packet opens with is fixed by those settings alone and is all
// that is drawn: eight up-chirps, the sync word 0x12 as two more shifted 8 and 16 chips, and 2¼ down-chirps; then
// the line is quiet until the next. Baseband, I: f runs −62.5 → +62.5 kHz across a symbol. A symbol is 1.6 s here.
const HAT = wires('picohat', (b) => wire(b, 'J2.1 U1.1'))
const saw = (y: number) => ((y -= Math.floor(y)), (y * y - y) / 2) // ∫ of a sawtooth: the chirp's phase, turns per 2⁷
const CHIRP: Sig = {
  lam: 30 / 512, res: 1.5, wave: true, dc: 0.4,
  at: (k) => {
    const u = mod(k, 20 * 512) / 512, n = Math.floor(u), a = n === 8 ? 8 / 128 : n === 9 ? 16 / 128 : 0
    return u >= 12.25 ? 0 : 0.9 * Math.cos(2 * Math.PI * 128 * (saw(u - n + a) - saw(a))) // a down-chirp's I is an up-chirp's
  },
}
// i: the Z coil's current, as coil() takes it; ma: the same in mA, for the line under the numbers.
const amps = [0]
export function ground(i: number, ma: number, here: boolean) {
  coil(i, 3)
  const w = HAT()
  if (w && on('picohat')) run(w, CHIRP, (ctx.t * 512) / 1.6, 0.75, 0.6, 1, 1.2, 2.5), share()
  amps[0] = ma
  if (here) say('i_z=\\frac{m_z}{NA}=\\num{0}{-0.00}\\,mA\\qquad NA=0.931\\,m^2', [0.75, 0.6, 1], amps)
}

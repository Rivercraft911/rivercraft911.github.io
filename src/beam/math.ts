// A small TeX for the beam. tex() lays an equation out once into positioned glyphs (cached by source),
// draw() traces them, morphEq() carries every term to its place in another equation the way Manim's
// TransformMatchingTex does, and roll() turns a live number over like an odometer.
// Syntax: x^2  x_{n+1}  \frac{a}{b}  \sum_{n=0}^{N}  \int_a^b  \omega …  \, \; \quad  and @id{…}
// (or \id{id}{…}) to name a term, so it keeps its identity when the equation around it changes.
// \num{k}{-00.00} holds a live number: room for that many digits, filled at draw time from vals[k]
// on odometer wheels, so an equation can carry the values it is running on.
import { font, glyph, type Face, type Glyph } from './font'
import type { Path } from './path'

// One glyph of a laid-out equation, in units of the equation's cap height. ch '' is a rule of width w.
export type Inst = { id: string; ch: string; x: number; y: number; s: number; w: number; a: number }
export type Eq = { g: Inst[]; n: number; w: number; face: Face }

const SYM: Record<string, string> = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ', iota: 'ι',
  kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π', rho: 'ρ', sigma: 'σ', tau: 'τ', upsilon: 'υ',
  phi: 'φ', varphi: 'φ', vartheta: 'θ', chi: 'χ', psi: 'ψ', omega: 'ω', Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ',
  Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Upsilon: 'Υ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω', sum: '∑', prod: '∏', int: '∫', partial: '∂',
  infty: '∞', nabla: '∇', pm: '±', cdot: '·', times: '×', to: '→', leftarrow: '←', approx: '≈', neq: '≠',
  le: '≤', ge: '≥', hbar: 'ℏ', ldots: '…',
}
const SPACE: Record<string, number> = { ',': 0.25, ';': 0.4, quad: 1.4, qquad: 2.8, '!': -0.25 }
const BIN = '+−±×·', REL = '=≈≠<>≤≥→←', OPEN = '([{'
const SCRIPT = 0.62

// Vertical extent of a glyph's strokes, cached.
const extent = new WeakMap<Glyph, [number, number]>()
function ext(g: Glyph | undefined): [number, number] {
  if (!g) return [0, 0.7]
  let e = extent.get(g)
  if (!e) {
    e = [Infinity, -Infinity]
    for (const st of g[1]) for (let i = 1; i < st.length; i += 2) (e[0] = Math.min(e[0], st[i])), (e[1] = Math.max(e[1], st[i]))
    if (e[0] > e[1]) e[0] = e[1] = 0
    extent.set(g, e)
  }
  return e
}

function layout(src: string, face: Face): Eq {
  const g: Inst[] = []
  let i = 0, op = true // op: the last atom was an operator or nothing, so a minus here is a sign
  const put = (id: string, ch: string, x: number, y: number, s: number, w = 0) => {
    g.push({ id, ch, x, y, s, w, a: 1 })
    return ch ? (face.g[ch]?.[0] ?? 0.6) * s : w
  }
  // Lowest and highest ink of glyphs a..b, and moving them by dx, dy.
  const span = (a: number, b = g.length) => {
    let lo = Infinity, hi = -Infinity
    for (let j = a; j < b; j++) {
      const [l, h] = g[j].ch ? ext(face.g[g[j].ch]) : [0, 0]
      ;(lo = Math.min(lo, g[j].y + l * g[j].s)), (hi = Math.max(hi, g[j].y + h * g[j].s))
    }
    return lo > hi ? [0, 0] : [lo, hi]
  }
  const move = (a: number, b: number, dx: number, dy: number) => {
    for (let j = a; j < b; j++) (g[j].x += dx), (g[j].y += dy)
  }
  const skip = () => {
    while (src[i] === ' ') i++
  }
  const name = () => {
    const m = /^[a-zA-Z]+|^./.exec(src.slice(i))![0]
    return (i += m.length), m
  }
  const tag = (re: RegExp) => {
    const m = re.exec(src.slice(i))![0]
    return (i += m.length), m
  }
  // Steps over a script's argument without laying it out; the scripts are placed after both are seen.
  const pass = () => {
    skip()
    if (src[i] === '\\') return i++, name()
    if (src[i++] === '{') for (let d = 1; i < src.length && d; i++) d += src[i] === '{' ? 1 : src[i] === '}' ? -1 : 0
  }
  // A braced group or a single atom at x, y; returns its advance.
  const arg = (x: number, y: number, s: number, id: string): number => {
    skip()
    if (src[i] !== '{') return atom(x, y, s, id)
    i++
    const w = row(x, y, s, id)
    return i++, w
  }
  const row = (x: number, y: number, s: number, id: string) => {
    const was = op
    let cx = x
    op = true
    for (skip(); i < src.length && src[i] !== '}'; skip()) cx += atom(cx, y, s, id)
    op = was
    return cx - x
  }
  // One atom and its scripts: limits over and under ∑ and ∏, beside everything else.
  const atom = (x: number, y: number, s: number, id: string): number => {
    const a = g.length
    let ch = src[i++], w = -1, big = false, sign = op
    op = false
    if (ch === '{') w = (i--, arg(x, y, s, id))
    else if (ch === '@') w = arg(x, y, s, tag(/^[\w.-]*/))
    else if (ch === '\\' && (ch = name()) in SPACE) return SPACE[ch] * s
    else if (ch === 'id') {
      i++
      const t = tag(/^[^}]*/)
      w = (i++, arg(x, y, s, t))
    }
    else if (ch === 'num') {
      const k = tag(/^\{\d+\}/).slice(1, -1), f = tag(/^\{[^}]*\}/).slice(1, -1), dot = f.indexOf('.')
      const dec = dot < 0 ? 0 : f.length - dot - 1, n = f.replace(/[^0]/g, '').length
      w = (n * (face.g['0']?.[0] ?? 0.6) + (dec ? (face.g['.']?.[0] ?? 0.3) : 0) + (f[0] === '-' ? (face.g['−']?.[0] ?? 0.6) : 0)) * s
      g.push({ id: `${k}:${dec}`, ch: '#', x, y, s, w, a: 1 })
      op = false
    }
    else if (ch === 'frac') {
      const k = s * 0.8, gap = 0.16 * s, ax = y + axis(face) * s
      const n0 = g.length, wn = arg(x, y, k, id), n1 = g.length, wd = arg(x, y, k, id), wb = Math.max(wn, wd) + 0.3 * s
      move(n0, n1, (wb - wn) / 2, ax + gap - span(n0, n1)[0])
      move(n1, g.length, (wb - wd) / 2, ax - gap - span(n1)[1])
      put(id, '', x, ax, s, wb)
      w = wb + 0.1 * s
    }
    if (w < 0 && ch.length > 1 && !SYM[ch]) {
      w = 0.15 * s // \sin, \log: an operator name, upright, a little apart
      for (const c of ch) {
        const up = String.fromCharCode(0xe000 + c.charCodeAt(0)) // a math face's upright letter
        w += put(id, face.g[up] ? up : c, x + w - 0.15 * s, y, s)
      }
    }
    if (w < 0) {
      if (ch === '-') ch = '−'
      ch = SYM[ch] ?? ch
      big = ch === '∑' || ch === '∏' || ch === '∫'
      const pad = s > 0.7 && !sign ? (BIN.includes(ch) ? 0.3 : REL.includes(ch) ? 0.4 : 0) * s : 0
      // big operators grow and center on the math axis, ∫ the most, as in display style
      const S = big ? s * (ch === '∫' ? 1.5 : 1.2) : s, [l, h] = ext(face.g[ch])
      w = put(id, ch, x + pad, big ? y + axis(face) * s - ((l + h) / 2) * S : y, S) + 2 * pad
      op = BIN.includes(ch) || REL.includes(ch) || OPEN.includes(ch) || big
    }
    let sup = -1, sub = -1
    for (skip(); src[i] === '^' || src[i] === '_'; skip()) src[i++] === '^' ? (sup = i) : (sub = i), pass()
    if (sup < 0 && sub < 0) return w
    const end = i, k = s * SCRIPT, [lo, hi] = span(a), limits = big && ch !== '∫'
    let ws = 0
    for (const [at, up] of [[sup, true], [sub, false]] as const) {
      if (at < 0) continue
      i = at
      const b = g.length, sw = arg(0, 0, k, id), [l, h] = span(b)
      if (limits) move(b, g.length, x + (w - sw) / 2, up ? hi + 0.12 * s - l : lo - 0.12 * s - h)
      else move(b, g.length, x + w - (big && !up ? 0.2 * s : 0), up ? Math.max(y + 0.5 * s, hi - 0.45 * k) : Math.min(y - 0.28 * s, lo + 0.1 * s))
      ws = Math.max(ws, sw)
    }
    i = end
    op = big
    if (!limits) return w + ws + 0.05 * s
    move(a, g.length, Math.max(0, ws - w) / 2, 0) // limits wider than ∑ widen it, centered
    return Math.max(w, ws) + 0.1 * s
  }
  const w = row(0, 0, 1, '')
  return { g, n: g.length, w, face }
}

// The math axis: the height of the minus sign, where fraction bars sit.
const axis = (f: Face) => ext(f.g['−'])[1] || 0.4

// The face equations are set in unless told otherwise: a math face once one is loaded.
export const mathFont: { face?: Face } = {}
const cache = new WeakMap<Face, Map<string, Eq>>()
export function tex(src: string, f = mathFont.face ?? font.face) {
  let c = cache.get(f), e = c?.get(src)
  if (!c) cache.set(f, (c = new Map()))
  if (!e) c.set(src, (e = layout(src, f)))
  return e
}

// Traces e with its baseline at y; align as for text. Returns the width.
export function draw(p: Path, e: Eq, x: number, y: number, size: number, align = 0, i = 1, vals?: ArrayLike<number>) {
  const ox = x - e.w * size * align
  for (let j = 0; j < e.n; j++) {
    const q = e.g[j]
    if (q.a < 0.005) continue
    p.intensity(i * q.a)
    const gx = ox + q.x * size, gy = y + q.y * size
    if (q.ch === '#') {
      const c = q.id.indexOf(':')
      roll(p, vals?.[+q.id.slice(0, c)] ?? 0, gx + q.w * size, gy, q.s * size, +q.id.slice(c + 1), 1, i * q.a, e.face)
    } else if (q.ch) glyph(p, q.ch, gx, gy, q.s * size, e.face)
    else p.moveTo(gx, gy).lineTo(gx + q.w * size, gy)
  }
  p.intensity(i)
  return e.w * size
}

// For each glyph of b, the index of its partner in a: same term id, same character, same rank among
// its twins in that term. A named term that appears more often in b splits off its first copy in a.
// -1 where there is none; rest lists a's glyphs nobody claimed. Computed once per pair.
type Pairing = { m: Int32Array; rest: Int32Array }
const pairs = new WeakMap<Eq, WeakMap<Eq, Pairing>>()
function pair(a: Eq, b: Eq) {
  let p = pairs.get(a)?.get(b)
  if (p) return p
  const m = new Int32Array(b.n).fill(-1), used = new Uint8Array(a.n)
  const same = (j: number, k: number) => a.g[k].id === b.g[j].id && a.g[k].ch === b.g[j].ch
  for (let j = 0; j < b.n; j++)
    for (let k = 0; m[j] < 0 && k < a.n; k++) if (!used[k] && same(j, k)) (used[k] = 1), (m[j] = k)
  for (let j = 0; j < b.n; j++) for (let k = 0; m[j] < 0 && b.g[j].id && k < a.n; k++) if (same(j, k)) m[j] = k
  p = { m, rest: Int32Array.from(used.keys()).filter((k) => !used[k]) }
  if (!pairs.has(a)) pairs.set(a, new WeakMap())
  pairs.get(a)!.set(b, p)
  return p
}

function lerp(e: Eq, n: number, p: Inst, q: Inst, t: number, a: number) {
  const o = (e.g[n] ??= { id: '', ch: '', x: 0, y: 0, s: 0, w: 0, a: 0 })
  o.id = q.id, o.ch = q.ch, o.a = a
  o.x = p.x + (q.x - p.x) * t, o.y = p.y + (q.y - p.y) * t, o.s = p.s + (q.s - p.s) * t, o.w = p.w + (q.w - p.w) * t
}

// a at k = 0, b at k = 1: matched glyphs travel; the rest fade, a's out in the first half and b's in
// over the second, so mid-flight only what persists is on screen. k may overshoot (a lock() that
// rings) and the travellers ring with it. Writes into out and returns it.
export function morphEq(a: Eq, b: Eq, k: number, out: Eq) {
  const { m, rest } = pair(a, b), f = Math.min(1, Math.max(0, k))
  for (let j = 0; j < b.n; j++) {
    const q = b.g[j], p = m[j] >= 0 ? a.g[m[j]] : q
    lerp(out, j, p, q, k, m[j] >= 0 ? p.a + (q.a - p.a) * f : q.a * Math.max(0, 2 * f - 1))
  }
  for (let j = 0; j < rest.length; j++) lerp(out, b.n + j, a.g[rest[j]], a.g[rest[j]], 0, a.g[rest[j]].a * Math.max(0, 1 - 2 * f))
  out.n = b.n + rest.length
  out.w = a.w + (b.w - a.w) * k
  out.face = b.face
  return out
}
export const eq = (): Eq => ({ g: [], n: 0, w: 0, face: mathFont.face ?? font.face })

// v written with dec decimals, every digit on its own wheel: the lowest turns over as v crosses
// each step, and each higher one turns with the carry. Tabular figures, so align = 1 keeps it still.
const wheels = new Float64Array(24)
export function roll(p: Path, v: number, x: number, y: number, size: number, dec = 0, align = 0, i = 1, f = mathFont.face ?? font.face) {
  const adv = (f.g['0']?.[0] ?? 0.6) * size, dot = (f.g['.']?.[0] ?? 0.3) * size, u = Math.abs(v) * 10 ** dec
  const n = Math.min(20, Math.max(dec + 1, Math.floor(Math.log10(Math.max(1, u))) + 1))
  const sign = v < 0 && u >= 0.5 ? (f.g['−']?.[0] ?? 0.6) * size : 0
  const w = sign + n * adv + (dec ? dot : 0)
  let cx = x - w * align, r = smoothstep((u % 1 - 0.7) / 0.3), lower = Math.floor(u)
  for (let k = 0; k <= n; k++) {
    wheels[k] = r
    if (lower % 10 !== 9) r = 0
    lower = Math.floor(lower / 10)
  }
  if (sign) cx += glyph(p, '−', cx, y, size, f)
  // a wheel about to grow a digit: it rolls in from blank, just left of the number
  if (wheels[n] > 0) wheel(p, -1, 1, wheels[n], cx - adv, y, size, i, f)
  for (let k = n - 1; k >= 0; k--) {
    const d = Math.floor(u / 10 ** k) % 10
    wheel(p, d, (d + 1) % 10, wheels[k], cx, y, size, i, f)
    cx += adv
    if (k === dec && dec) cx += glyph(p, '.', cx, y, size, f)
  }
  p.intensity(i)
  return w
}
const smoothstep = (k: number) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k))
// Digit d (blank if d < 0) leaving upward as digit e arrives from below, r of the way round.
function wheel(p: Path, d: number, e: number, r: number, x: number, y: number, size: number, i: number, f: Face) {
  const h = size * 1.25
  if (r < 1 && d >= 0) p.intensity(i * (1 - r) ** 2), glyph(p, String.fromCharCode(48 + d), x, y + r * h, size, f)
  if (r > 0) p.intensity(i * r * r), glyph(p, String.fromCharCode(48 + e), x, y - (1 - r) * h, size, f)
}

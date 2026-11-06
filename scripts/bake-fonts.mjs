// Bakes single-stroke fonts into beam paths: cap height 1, baseline 0, y up, one JSON per face.
// Hershey comes from the hersheytext package; the rest are SVG fonts of open paths in scripts/fonts,
// whose curves are flattened to vertices spaced evenly along the stroke so the beam draws them at
// even brightness. Glyphs a face lacks (Greek, math) fall back to Relief plus hand-drawn Greek.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import hershey from 'hersheytext'

const STEP = 0.035 // arc length between vertices along a curve, in cap heights
const CORNER = 0.5 // radians of turn that pin a vertex as a corner
const FLAT = 0.003 // a run this close to its chord is a straight line
const KEEP = /[\x20-\x7eΑ-ω°±·×ℏ←↑→↓↔∂∆∇∏∑−√∞∫≈≠≤≥…′]/u
const NAMES = { Delta: 'Δ', Omega: 'Ω', uni00B5: 'μ' } // Relief files these under the wrong code points
const SRC = new URL('./fonts/', import.meta.url)
const OUT = new URL('../src/beam/fonts/', import.meta.url)
const r = (v) => Math.round(v * 1000) / 1000

// An SVG path as strokes of [x, y, ...] in font units, curves sampled densely.
function strokes(d) {
  const t = d.match(/[a-z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? []
  const out = []
  let i = 0, cmd = '', x = 0, y = 0, sx = 0, sy = 0, cx = 0, cy = 0, s = null
  const num = () => +t[i++]
  const to = (nx, ny) => (s.push(nx, ny), (x = nx), (y = ny))
  const curve = (pts) => {
    // de Casteljau on 3 or 4 control points, 24 samples: dense; `even` evens them out later
    for (let k = 1; k <= 24; k++) {
      const u = k / 24, p = pts.slice()
      for (let n = p.length / 2 - 1; n > 0; n--)
        for (let j = 0; j < n * 2; j++) p[j] += (p[j + 2] - p[j]) * u
      to(p[0], p[1])
    }
  }
  while (i < t.length) {
    if (/[a-z]/i.test(t[i])) cmd = t[i++]
    const rel = cmd === cmd.toLowerCase(), ox = rel ? x : 0, oy = rel ? y : 0
    switch (cmd.toUpperCase()) {
      case 'M': out.push((s = [])), to(ox + num(), oy + num()), (sx = x), (sy = y), (cmd = rel ? 'l' : 'L'); break
      case 'L': to(ox + num(), oy + num()); break
      case 'H': to(ox + num(), y); break
      case 'V': to(x, oy + num()); break
      case 'Z': to(sx, sy); break
      case 'C': { const a = [x, y, ox + num(), oy + num(), (cx = ox + num()), (cy = oy + num()), ox + num(), oy + num()]; curve(a); break }
      case 'S': { const a = [x, y, 2 * x - cx, 2 * y - cy, (cx = ox + num()), (cy = oy + num()), ox + num(), oy + num()]; curve(a); break }
      case 'Q': { const a = [x, y, (cx = ox + num()), (cy = oy + num()), ox + num(), oy + num()]; curve(a); break }
      case 'T': { const a = [x, y, (cx = 2 * x - cx), (cy = 2 * y - cy), ox + num(), oy + num()]; curve(a); break }
      default: throw new Error(`path command ${cmd}`)
    }
    if (!/[CSQT]/i.test(cmd)) (cx = x), (cy = y)
  }
  return out.filter((s) => s.length > 2)
}

// Keeps corners, makes straight runs one segment, and respaces curved runs at even arc length.
function even(s) {
  const p = [s[0], s[1]]
  for (let i = 2; i < s.length; i += 2) if (Math.hypot(s[i] - p.at(-2), s[i + 1] - p.at(-1)) > 1e-4) p.push(s[i], s[i + 1])
  const n = p.length / 2, out = [p[0], p[1]]
  const turn = (i) => {
    const a = Math.atan2(p[2 * i + 1] - p[2 * i - 1], p[2 * i] - p[2 * i - 2])
    const b = Math.atan2(p[2 * i + 3] - p[2 * i + 1], p[2 * i + 2] - p[2 * i])
    return Math.abs(((b - a + 3 * Math.PI) % (2 * Math.PI)) - Math.PI)
  }
  for (let a = 0, b = 1; b < n; b++) {
    if (b < n - 1 && turn(b) < CORNER) continue
    const cum = [0]
    let dev = 0
    for (let i = a + 1; i <= b; i++) cum.push(cum.at(-1) + Math.hypot(p[2 * i] - p[2 * i - 2], p[2 * i + 1] - p[2 * i - 1]))
    const L = cum.at(-1), dx = p[2 * b] - p[2 * a], dy = p[2 * b + 1] - p[2 * a + 1], c = Math.hypot(dx, dy)
    for (let i = a; i <= b; i++) dev = Math.max(dev, Math.abs((p[2 * i] - p[2 * a]) * dy - (p[2 * i + 1] - p[2 * a + 1]) * dx) / c)
    if (c < L / 2) dev = Infinity // a loop
    const m = dev < FLAT ? 1 : Math.max(2, Math.round(L / STEP))
    for (let k = 1, j = a; k <= m; k++) {
      const at = (k / m) * L
      while (j < b - 1 && cum[j + 1 - a] < at) j++
      const u = (at - cum[j - a]) / (cum[j + 1 - a] - cum[j - a] || 1)
      out.push(r(p[2 * j] + (p[2 * j + 2] - p[2 * j]) * u), r(p[2 * j + 1] + (p[2 * j + 3] - p[2 * j + 1]) * u))
    }
    a = b
  }
  return out
}

const top = (g) => Math.max(...g[1].flatMap((s) => s.filter((_, i) => i & 1)))

// An SVG font file → { char: [advance, strokes] } normalized by the height of its own H.
function svg(file) {
  const src = readFileSync(new URL(file, SRC), 'utf8')
  const dflt = +src.match(/<font\b[^>]*horiz-adv-x="([\d.]+)"/)[1]
  const raw = {}
  for (const [tag] of src.matchAll(/<glyph\b[^>]*>/g)) {
    const at = (k) => tag.match(new RegExp(`\\s${k}="([^"]*)"`))?.[1]
    const u = NAMES[at('glyph-name')] ?? at('unicode')?.replace(/&#(x?)([\da-f]+);/gi, (_, x, n) => String.fromCodePoint(parseInt(n, x ? 16 : 10)))
      .replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&apos;/g, "'")
    if (u && [...u].length === 1 && KEEP.test(u) && !raw[u]) raw[u] = [+(at('horiz-adv-x') ?? dflt), strokes(at('d') ?? '')]
  }
  const cap = top(raw.H)
  const g = {}
  for (const [ch, [adv, ss]] of Object.entries(raw))
    g[ch] = [r(adv / cap), ss.map((s) => even(s.map((v) => v / cap)))]
  return { g, xh: r(top(g.x)) }
}

function hersheyFont(name, map = (c) => c) {
  const out = {}
  hershey.getFontData(name).chars.forEach((g, i) => {
    const strokes = g.d.split('M').filter(Boolean).map((s) =>
      s.replace('L', ' ').trim().split(/\s+/).flatMap((p) => {
        const [x, y] = p.split(',').map(Number)
        return [r(x / 21), r((22 - y) / 21)]
      }))
    const c = map(String.fromCharCode(33 + i))
    if (c) out[c] = [r((2 * g.o) / 21), strokes]
  })
  return out
}
// Hershey's Greek set sits on the Latin keys, a → α, q → θ, w → ω.
const GREEK = 'αβχδεφγηι κλμνοπθρστυ ωξψζΑΒΧΔΕΦΓΗΙ ΚΛΜΝΟΠΘΡΣΤΥ ΩΞΨΖ'
const greekOf = (c) => (/[a-z]/i.test(c) ? GREEK['abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'.indexOf(c)].trim() : '')

// Fills what a face lacks from the fallback, scaling lowercase Greek to the face's x-height.
function fill(face, fb) {
  for (const [ch, [adv, ss]] of Object.entries(fb.g)) {
    if ((face.g[ch] && ch !== '±') || ch < '\x7f') continue // the EMS ± glyphs are broken
    const k = /\p{Ll}/u.test(ch) && /\p{Script=Greek}/u.test(ch) ? Math.min(1.1, face.xh / fb.xh) : 1
    face.g[ch] = [r(adv * k), ss.map((s) => s.map((v) => r(v * k)))]
  }
  return face
}

const FACES = {
  relief: ['Relief SingleLine', 'relief/ReliefSingleLineSVG-Regular.svg'],
  readability: ['EMS Readability', 'ems/EMSReadability.svg'],
  nixish: ['EMS Nixish', 'ems/EMSNixish.svg'],
  herculean: ['EMS Herculean', 'ems/EMSHerculean.svg'],
  tech: ['EMS Tech', 'ems/EMSTech.svg'],
  spacerocks: ['EMS SpaceRocks', 'ems/EMSSpaceRocks.svg'],
}

mkdirSync(OUT, { recursive: true })
const write = (id, name, face) => {
  writeFileSync(new URL(`${id}.json`, OUT), JSON.stringify({ name, ...face }))
  console.log(id, Object.keys(face.g).length, 'glyphs')
}
const math = fill(svg('relief/ReliefSingleLineSVG-Regular.svg'), svg('greek.svg'))
const futural = hersheyFont('futural')
write('hershey', 'Hershey Simplex', fill({ g: { ...futural, ...hersheyFont('greek', greekOf) }, xh: r(top(futural.x)) }, math))
for (const [id, [name, file]] of Object.entries(FACES)) write(id, name, id === 'relief' ? math : fill(svg(file), math))

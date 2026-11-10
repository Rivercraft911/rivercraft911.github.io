// Bakes River's boards for the long zoom. Per board: a top-down picture, public/media/boards/<id>.webp, cropped
// to the Edge.Cuts bounding box, and its geometry, src/boards/<id>.json, in mm from that box's top-left with y
// down, so (x / w, y / h) is the picture's uv. KiCad renders a copy of each board, since kicad-cli leaves a lock
// file beside whatever it opens and the sources are not ours to touch; KIPRJMOD points home so the project's own
// 3D models still resolve. Parts overhang the outline, so a second render with every model missing finds the
// outline in pixels. `npm run boards -- <id…>` renders only those (the geometry is cheap and always baked).
// Needs KiCad 10, ffmpeg and cwebp.
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'

const GH = '/Users/river/Documents/github/'
// In the order the film falls through them. A source is a local file, or a repo path read from its clone when
// there is one, else fetched. `stackup` recolours the picture, by stackup layer type.
const WHITE = { 'Top Silk Screen': '#101010FF', 'Bottom Silk Screen': '#101010FF', 'Top Solder Mask': '#F6F6F1F4', 'Bottom Solder Mask': '#F6F6F1F4' }
const BOARDS = [
  { id: 'gnss', title: 'GNSS IQ Breakout', project: 'GNSS front end', file: GH + 'Personal PCBs/GNSS-IQ-Breakout/hardware/GNSS-IQ-Breakout.kicad_pcb' },
  // moves to the repo Rivercraft911/rava-heart, hardware/HeartArray.kicad_pcb, once that is published
  { id: 'heart', title: 'Rava Heart', project: 'Rava Heart', stackup: WHITE, file: '/Users/river/Documents/LocalBoards/PCB_Heart/KicadFiles/HeartArray/HeartArray.kicad_pcb' },
  { id: 'laserbrain', title: 'LaserBrain', project: 'R-01', repo: 'Rivercraft911/R-01_Raster_Laser_Projector', path: 'pcbs/LaserBrain/LaserBrain.kicad_pcb', clone: GH + 'R-01_Raster_Laser_Projector' },
  { id: 'laserdriver', title: 'LaserDriverRGB', project: 'R-01', repo: 'Rivercraft911/R-01_Raster_Laser_Projector', path: 'pcbs/LaserDriverRGB/LaserDriverRGB.kicad_pcb', clone: GH + 'R-01_Raster_Laser_Projector' },
  { id: 'strobe', title: 'strobeGlasses MK1', project: 'strobeGlasses', repo: 'Rivercraft911/strobeGlasses', path: 'strobeGlassesMK1/strobeGlassesMK1.kicad_pcb', clone: GH + 'strobeGlasses' },
  { id: 'peep', title: 'PEEP', project: 'PEEP', repo: 'Rivercraft911/PEEP', path: 'PCB/peep/peep.kicad_pcb', clone: GH + 'PEEP' },
  { id: 'coil', title: 'Magnetorquer coil', project: 'SAMWISE', repo: 'stanford-ssi/samwise-avionics', path: 'Universal_Z_MagTorq/Coil_Panel_Z_v1/Coil_Panel_Z.kicad_pcb', clone: GH + 'samwise-avionics' },
]

const KICAD = '/Applications/KiCad/KiCad.app/Contents/MacOS/kicad-cli', FFMPEG = '/opt/homebrew/bin/ffmpeg', CWEBP = '/opt/homebrew/bin/cwebp'
const PCM = join(homedir(), 'Documents/KiCad/10.0/3rdparty') // older boards name the plugin libraries by older versions' variables
const RENDER = 4096 // px, square: the board's long side comes out near 3930, twice the picture's
const SIDE = 2048, Q = 80 // the picture's long side; WebP quality
const TOL = 0.005 // mm: chords stay this close to their arcs
const OUT = new URL('../src/boards/', import.meta.url), MEDIA = new URL('../public/media/boards/', import.meta.url)
const TAU = 2 * Math.PI
const r = (v) => Math.round(v * 100) / 100

// A KiCad S-expression as nested arrays of strings.
function parse(s) {
  const st = [[]]
  for (const [t] of s.matchAll(/[()]|"(?:[^"\\]|\\.)*"|[^\s()"]+/g))
    t === '(' ? st.push([]) : t === ')' ? st.at(-2).push(st.pop()) : st.at(-1).push(t[0] === '"' ? t.slice(1, -1).replace(/\\(.)/g, '$1') : t)
  return st[0][0]
}
const kid = (n, k) => n.find((c) => c[0] === k), all = (n, k) => n.filter((c) => c[0] === k)
const pt = (n, k) => kid(n, k).slice(1, 3).map(Number)

// Points round the circle about c from p through the angle s, every chord within TOL of the curve.
function around([cx, cy], [px, py], s) {
  const R = Math.hypot(px - cx, py - cy), a = Math.atan2(py - cy, px - cx), out = []
  const n = Math.ceil(Math.abs(s) / (2 * Math.acos(Math.max(-1, 1 - TOL / R))))
  for (let i = 0; i <= n; i++) out.push(cx + R * Math.cos(a + (s * i) / n), cy + R * Math.sin(a + (s * i) / n))
  return out
}
// The arc from a through m to b: about its circumcentre, the sweep from a that passes m on the way to b.
function arc(a, m, b) {
  const [ax, ay] = a, [mx, my] = m, [bx, by] = b, d = 2 * (ax * (my - by) + mx * (by - ay) + bx * (ay - my))
  if (Math.abs(d) < 1e-12) return [ax, ay, bx, by]
  const A = ax * ax + ay * ay, M = mx * mx + my * my, B = bx * bx + by * by
  const c = [(A * (my - by) + M * (by - ay) + B * (ay - my)) / d, (A * (bx - mx) + M * (ax - bx) + B * (mx - ax)) / d]
  const t = ([x, y]) => (Math.atan2(y - c[1], x - c[0]) - Math.atan2(ay - c[1], ax - c[0]) + 2 * TAU) % TAU
  return around(c, a, t(m) < t(b) ? t(b) : t(b) - TAU)
}
// An Edge.Cuts shape as a polyline. (None of these boards draws its outline inside a footprint.)
function edge(n) {
  const [x0, y0] = pt(n, n[0] === 'gr_circle' ? 'center' : 'start')
  switch (n[0]) {
    case 'gr_line': return [x0, y0, ...pt(n, 'end')]
    case 'gr_arc': return arc([x0, y0], pt(n, 'mid'), pt(n, 'end'))
    case 'gr_circle': return around([x0, y0], pt(n, 'end'), TAU)
    case 'gr_rect': { const [x1, y1] = pt(n, 'end'); return [x0, y0, x1, y0, x1, y1, x0, y1, x0, y0] }
  }
  throw new Error(`edge ${n[0]}`)
}

const rev = (p) => { const q = []; for (let i = p.length - 2; i >= 0; i -= 2) q.push(p[i], p[i + 1]); return q }
// Chains pieces { k, p } of the same key that meet end to end into longer polylines. At a junction only the
// first two pieces there are joined.
function chain(pieces) {
  const ends = new Map(), live = new Set(pieces), key = (c, i) => `${c.k} ${c.p.at(i ? -2 : 0)} ${c.p.at(i ? -1 : 1)}`
  const mark = (c, on) => { for (const e of [key(c, 0), key(c, 1)]) on ? ends.has(e) || ends.set(e, c) : ends.get(e) === c && ends.delete(e) }
  for (let c of pieces) {
    for (const e of [key(c, 0), key(c, 1)]) {
      const o = ends.get(e)
      if (!o || o === c) continue
      mark(o, false), mark(c, false), live.delete(c)
      if (key(o, 0) === e) o.p = rev(o.p)
      if (key(c, 1) === e) c.p = rev(c.p)
      o.p = o.p.concat(c.p.slice(2)), (c = o)
    }
    mark(c, true)
  }
  return [...live]
}

function geometry({ id, title, project }, src) {
  const pcb = parse(src), on = (n, l) => kid(n, 'layer')?.[1] === l
  const shapes = pcb.filter((n) => /^gr_/.test(n[0]) && on(n, 'Edge.Cuts')).map(edge)
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  for (const p of shapes) for (let i = 0; i < p.length; i += 2)
    (x0 = Math.min(x0, p[i])), (x1 = Math.max(x1, p[i])), (y0 = Math.min(y0, p[i + 1])), (y1 = Math.max(y1, p[i + 1]))
  const at = (p) => p.map((v, i) => r(v - (i & 1 ? y0 : x0)))
  const layers = kid(pcb, 'layers').slice(1).map((l) => l[1]).filter((l) => l.endsWith('.Cu'))
    .sort((a, b) => (a[0] === 'F' ? -1 : a[0] === 'B' ? 99 : +a.slice(2, -3)) - (b[0] === 'F' ? -1 : b[0] === 'B' ? 99 : +b.slice(2, -3)))
  // nets are named in place now; older files number them against a table
  const table = Object.fromEntries(all(pcb, 'net').map((n) => [n[1], n[2]])), nets = [], index = new Map()
  const net = (n) => { const v = kid(n, 'net')?.[1] ?? '', s = table[v] ?? v; return index.get(s) ?? (index.set(s, nets.length), nets.push(s) - 1) }
  const pieces = pcb.filter((n) => n[0] === 'segment' || n[0] === 'arc').map((n) => ({
    k: [layers.indexOf(kid(n, 'layer')[1]), r(+kid(n, 'width')[1]), net(n)],
    p: at(n[0] === 'arc' ? arc(pt(n, 'start'), pt(n, 'mid'), pt(n, 'end')) : [...pt(n, 'start'), ...pt(n, 'end')]),
  }))
  const g = {
    id, title, project, w: r(x1 - x0), h: r(y1 - y0), layers,
    outline: chain(shapes.map((p) => ({ k: '', p: at(p) }))).map((c) => c.p),
    tracks: chain(pieces).map((c) => [...c.k, ...c.p]),
    nets,
    vias: all(pcb, 'via').map((n) => [...at(pt(n, 'at')), r(+kid(n, 'drill')[1]), r(+kid(n, 'size')[1])]),
  }
  return [g, pieces.length]
}

// The board as RGBA, size from the PNG's header.
const rgba = (png) => {
  const h = readFileSync(png)
  return { W: h.readUInt32BE(16), H: h.readUInt32BE(20), px: execFileSync(FFMPEG, ['-v', 'error', '-i', png, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'], { maxBuffer: 1 << 30 }) }
}

function picture(b, src, home, tmp) {
  const f = join(tmp, `${b.id}.kicad_pcb`), bare = join(tmp, `${b.id}-bare.kicad_pcb`)
  const pro = home.replace(/\.kicad_pcb$/, '.kicad_pro')
  const paint = (m, t) => (b.stackup?.[t] ? `(type "${t}") (color "${b.stackup[t]}")` : m) // kicad-cli renders stackup colours
  writeFileSync(f, src.replace(/\(type "([^"]+)"\)(?:\s*\(color "[^"]*"\))?/g, paint))
  writeFileSync(bare, src.replaceAll('(model "', '(model "/-/')) // models nowhere: no parts
  if (existsSync(pro)) copyFileSync(pro, f.replace(/pcb$/, 'pro')) // its text variables
  const render = (file, quality, out) => execFileSync(KICAD, ['pcb', 'render', '--side', 'top', '--background', 'transparent', '--quality', quality,
    '-w', RENDER, '-h', RENDER, '-D', `KIPRJMOD=${dirname(home)}`, '-D', `KICAD8_3RD_PARTY=${PCM}`, '-D', `KICAD9_3RD_PARTY=${PCM}`, '-o', out, file].map(String), { stdio: 'pipe' })
  render(bare, 'basic', join(tmp, 'bare.png')), render(f, 'high', join(tmp, 'full.png'))
  // the outline is where the bare board is at least half there; the camera frames the outline either way
  const m = rgba(join(tmp, 'bare.png'))
  let x0 = m.W, y0 = m.H, x1 = 0, y1 = 0
  for (let y = 0; y < m.H; y++) for (let x = 0; x < m.W; x++)
    if (m.px[(y * m.W + x) * 4 + 3] >= 128) (x0 = Math.min(x0, x)), (x1 = Math.max(x1, x)), (y0 = Math.min(y0, y)), (y1 = Math.max(y1, y))
  if (!x0 || !y0 || x1 === m.W - 1 || y1 === m.H - 1) throw new Error(`${b.id}: the board runs off the render`)
  // high quality lays the board on a floor whose shadow is translucent black; it goes, and the holes open
  const { W, px } = rgba(join(tmp, 'full.png')), cw = x1 - x0 + 1, ch = y1 - y0 + 1, crop = Buffer.alloc(cw * ch * 4)
  for (let i = 3; i < px.length; i += 4) if (px[i] < 255 && Math.max(px[i - 3], px[i - 2], px[i - 1]) < 8) px[i] = 0
  for (let y = 0; y < ch; y++) px.copy(crop, y * cw * 4, ((y0 + y) * W + x0) * 4, ((y0 + y) * W + x1 + 1) * 4)
  const raw = join(tmp, 'pic.rgba'), png = join(tmp, 'pic.png'), webp = new URL(`${b.id}.webp`, MEDIA).pathname
  writeFileSync(raw, crop) // a frame this big through a pipe makes ffmpeg complain
  execFileSync(FFMPEG, ['-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${cw}x${ch}`, '-i', raw, '-vf',
    `scale=${SIDE}:${SIDE}:force_original_aspect_ratio=decrease:flags=lanczos`, '-y', png])
  execFileSync(CWEBP, ['-quiet', '-q', Q, '-m', 6, '-sharp_yuv', '-alpha_filter', 'best', '-o', webp, png].map(String))
  const out = rgba(png)
  return `${cw}x${ch} → ${out.W}x${out.H} px, ${readFileSync(webp).length} B`
}

const only = process.argv.slice(2), tmp = mkdtempSync(join(tmpdir(), 'boards-'))
mkdirSync(OUT, { recursive: true }), mkdirSync(MEDIA, { recursive: true })
try {
  const list = []
  for (const b of BOARDS) {
    let home = b.file ?? join(b.clone ?? '', b.path)
    if (!existsSync(home)) {
      home = join(tmp, basename(b.path))
      writeFileSync(home, execFileSync('gh', ['api', `repos/${b.repo}/contents/${b.path}${b.ref ? `?ref=${b.ref}` : ''}`, '-H', 'Accept: application/vnd.github.raw'], { maxBuffer: 1 << 30 }))
    }
    const src = readFileSync(home, 'utf8'), [g, n] = geometry(b, src), json = JSON.stringify(g)
    writeFileSync(new URL(`${b.id}.json`, OUT), json)
    list.push({ id: g.id, title: g.title, project: g.project, w: g.w, h: g.h })
    const pic = !only.length || only.includes(b.id) ? picture(b, src, home, tmp) : 'picture kept'
    console.log(b.id, `${g.w}x${g.h} mm`, `${g.tracks.length}/${n} tracks`, `${g.vias.length} vias`, `${g.layers.length} layers`, `${json.length} B;`, pic)
  }
  writeFileSync(new URL('list.json', OUT), JSON.stringify(list))
} finally {
  rmSync(tmp, { recursive: true, force: true })
}

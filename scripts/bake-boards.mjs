// Bakes River's boards, for the pages and once for the long zoom. Per board: both faces, public/media/boards/<id>.webp
// from above and <id>-back.webp from below (turned over side to side, as a hand turns it), each cropped to the
// Edge.Cuts bounding box, and its geometry, src/boards/<id>.json, in mm from that box's top-left with y
// down, so (x / w, y / h) is the picture's uv. KiCad renders a copy of each board, since kicad-cli leaves a lock
// file beside whatever it opens and the sources are not ours to touch; KIPRJMOD points home so the project's own
// 3D models still resolve. Parts overhang the outline, so a second render with every model missing finds the
// outline in pixels. Around the hole the zoom falls through it also renders close-ups, <id>-<n>.webp, each a square
// of the board seen closer, so the hole is still sharp as it fills the screen. `npm run boards -- <id…>` renders
// only those (the geometry is cheap and always baked). Needs KiCad 10, ffmpeg and cwebp.
// The world's monuments carry their signals on this geometry (src/world/copper.ts), so it also has the board's
// thickness and every pad that is on a routed net. bake-schematics.mjs reads this list too.
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const GH = '/Users/river/Documents/github/', PV = '/Users/river/Documents/stanford/SSI/IREC/Pigeon_Vision/PigeonVision/hardware/'
const SATS = '/Users/river/Documents/stanford/SSI/SATS/'
// In the order the film falls through them. A source is a local file, or a repo path read from its clone when
// there is one, else fetched. `stackup` recolours the picture, by stackup layer type. `hole` is the hole the zoom
// falls through, [x, y, drill, pad] in mm (pad = drill: unplated), and `close` the close-ups around it, each a
// square that many mm across, 512 px, or [mm, px]. `skip`: parts' 3D models left out (as bake-models.mjs leaves them).
const ink = (silk, mask) => ({ 'Top Silk Screen': silk, 'Bottom Silk Screen': silk, 'Top Solder Mask': mask, 'Bottom Solder Mask': mask })
const WHITE = ink('#101010FF', '#F6F6F1F4'), BLACK = ink('White', 'Black') // as the boards were made (and bake-models.mjs paints them)
export const BOARDS = [
  { id: 'gnss', title: 'GNSS IQ Breakout', project: 'GNSS front end', stackup: BLACK, file: GH + 'Personal PCBs/GNSS-IQ-Breakout/hardware/GNSS-IQ-Breakout.kicad_pcb',
    hole: [19.45, 17.34, 0.3, 0.6], close: [11.25, 5.6, 2.8, 1.4] }, // a via between the front end and the lock LED
  { id: 'heart', title: 'Rava Heart', project: 'Rava Heart', stackup: WHITE, repo: 'Rivercraft911/rava-heart', path: 'hardware/HeartArray.kicad_pcb', clone: GH + 'rava-heart',
    hole: [47, 76.25, 2.2, 3.8], close: [23.5, 11.75, 5.9, 2.9] }, // H3, the mounting hole on the heart's axis
  { id: 'laserbrain', title: 'LaserBrain', project: 'R-01', repo: 'Rivercraft911/R-01_Raster_Laser_Projector', path: 'pcbs/LaserBrain/LaserBrain.kicad_pcb', clone: GH + 'R-01_Raster_Laser_Projector',
    hole: [50, 50, 30, 30], close: [[50, 1024]] }, // the 30 mm hole in the middle
  { id: 'laserdriver', title: 'LaserDriverRGB', project: 'R-01', repo: 'Rivercraft911/R-01_Raster_Laser_Projector', path: 'pcbs/LaserDriverRGB/LaserDriverRGB.kicad_pcb', clone: GH + 'R-01_Raster_Laser_Projector',
    hole: [2.4, 2.4, 2.2, 3.8], close: [12.5, 6.25, 3.1] }, // H1, the top-left mounting hole
  { id: 'strobe', title: 'strobeGlasses MK1', project: 'strobeGlasses', repo: 'Rivercraft911/strobeGlasses', path: 'strobeGlassesMK1/strobeGlassesMK1.kicad_pcb', clone: GH + 'strobeGlasses',
    hole: [25.85, 6, 0.3, 0.6], close: [10.3, 5.15, 2.6, 1.3] }, // a via beside the microcontroller
  { id: 'peep', title: 'PEEP', project: 'PEEP', stackup: BLACK, repo: 'Rivercraft911/PEEP', path: 'PCB/peep/peep.kicad_pcb', clone: GH + 'PEEP',
    hole: [4.63, 2.22, 0.3, 0.6], close: [3, 1.5, 0.75] }, // a via in the second contact
  { id: 'coil', title: 'Magnetorquer coil', project: 'SAMWISE', repo: 'stanford-ssi/samwise-avionics', path: 'Universal_Z_MagTorq/Coil_Panel_Z_v1/Coil_Panel_Z.kicad_pcb', clone: GH + 'samwise-avionics' },
  // not in the zoom: for the pages
  { id: 'coil-xy', title: 'XY magnetorquer coil', project: 'SAMWISE', repo: 'stanford-ssi/samwise-avionics', path: 'Universal_XY_MagTorq/Coil_Panel_XY.kicad_pcb', clone: GH + 'samwise-avionics' },
  { id: 'picohat', title: 'Radio test bench', project: 'SAMWISE', file: GH + 'samwise-groundstation/SoftwareDebugPicoHat/SoftwareDebugPicoHat.kicad_pcb' },
  { id: 'pigeon-carrier', title: 'Pigeon carrier', project: 'Pigeon Vision', file: PV + 'carrier/PigeonCarrier/PigeonCarrier.kicad_pcb' },
  { id: 'yapogee-s3', title: 'Yapogee S3', project: 'Pigeon Vision', file: PV + 'yapogee-s3/kicad/YapogeeS3.kicad_pcb' },
  { id: 'finertia', title: 'Finertia', project: 'BLEPS', file: SATS + 'Satellite-Avionics-rotor/project-janus/ADCS/rotor-controller/Rotor.kicad_pcb', skip: /2610T/ }, // (Faulhaber's motor model stays out)
]

const KICAD = '/Applications/KiCad/KiCad.app/Contents/MacOS/kicad-cli', FFMPEG = '/opt/homebrew/bin/ffmpeg', CWEBP = '/opt/homebrew/bin/cwebp'
const PCM = join(homedir(), 'Documents/KiCad/10.0/3rdparty') // older boards name the plugin libraries by older versions' variables
// Where a part's 3D model is, by the names boards give them (as bake-models.mjs finds them): KiCad 10 ships its library
// as STEP alone.
const LIB = '/Applications/KiCad/KiCad.app/Contents/SharedSupport/3dmodels'
const VARS = { KICAD8_3RD_PARTY: PCM, KICAD9_3RD_PARTY: PCM, KICAD10_3RD_PARTY: PCM, KICAD6_3DMODEL_DIR: LIB, KICAD7_3DMODEL_DIR: LIB, KICAD8_3DMODEL_DIR: LIB,
  KICAD9_3DMODEL_DIR: LIB, KICAD10_3DMODEL_DIR: LIB, RIVERS_DIR: GH + 'RiversKicadLibrary', SAMWISE_AVIONICS: GH + 'samwise-avionics' }
const found = (p, home) => {
  const f = resolve(dirname(home), p.replace(/\$\{(\w+)\}/g, (v, k) => (k === 'KIPRJMOD' ? dirname(home) : VARS[k] ?? v)))
  return [f, f.replace(/\.wrl$/i, '.step')].find(existsSync)
}
const RENDER = 4096 // px, square: the board's long side comes out near 3930, twice the picture's
const SIDE = 2048, Q = 80 // the picture's long side; WebP quality
const PAN = 0.0782, ZOOM = 0.25 // a kicad-cli --pan of 1 moves the board this much of its long side; it zooms no further than about 0.3 × that side in mm (both measured)
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
// An Edge.Cuts shape as a polyline; `to` places a footprint's own (the Yapogee S3 draws its outline in one).
function edge(n, to = (p) => p) {
  const at = (k) => to(pt(n, k)), k = n[0].slice(3), [x0, y0] = at(k === 'circle' ? 'center' : 'start')
  switch (k) {
    case 'line': return [x0, y0, ...at('end')]
    case 'arc': return arc([x0, y0], at('mid'), at('end'))
    case 'circle': return around([x0, y0], at('end'), TAU)
    case 'rect': { const [x1, y1] = at('end'); return [x0, y0, x1, y0, x1, y1, x0, y1, x0, y0] }
  }
  throw new Error(`edge ${n[0]}`)
}
// KiCad's turn: a degrees, anticlockwise on a page whose y runs down
const turn = ([x, y], a) => { const c = Math.cos((a * Math.PI) / 180), s = Math.sin((a * Math.PI) / 180); return [x * c + y * s, y * c - x * s] }

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
  const shapes = pcb.filter((n) => /^gr_/.test(n[0]) && on(n, 'Edge.Cuts')).map((n) => edge(n))
  for (const f of all(pcb, 'footprint')) {
    const [fx, fy, fa = 0] = kid(f, 'at').slice(1).map(Number)
    shapes.push(...f.filter((n) => /^fp_(line|arc|circle|rect)$/.test(n[0]) && on(n, 'Edge.Cuts')).map((n) => edge(n, (p) => { const [x, y] = turn(p, fa); return [fx + x, fy + y] })))
  }
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
  // a pad: where it is, its net, its layer (−1: through them all), its size and turn, and whose it is ("U1.3 PA11")
  const pads = all(pcb, 'footprint').flatMap((f) => {
    const [fx, fy, fa = 0] = kid(f, 'at').slice(1).map(Number), ref = all(f, 'property').find((q) => q[1] === 'Reference')?.[2] ?? all(f, 'fp_text').find((q) => q[1] === 'reference')?.[2]
    return all(f, 'pad').filter((q) => kid(q, 'net')).map((q) => {
      const [px, py, pa = 0] = kid(q, 'at').slice(1).map(Number), [dx, dy] = turn([px, py], fa), cu = kid(q, 'layers').slice(1)
      return [...at([fx + dx, fy + dy]), net(q), cu.includes('*.Cu') ? -1 : layers.indexOf(cu.find((l) => l.endsWith('.Cu'))), ...kid(q, 'size').slice(1, 3).map((v) => r(+v)), pa % 180, [`${ref}.${q[1]}`, kid(q, 'pinfunction')?.[1]].filter(Boolean).join(' ')]
    })
  })
  const routed = new Set(pieces.map((c) => c.k[2]))
  const g = {
    id, title, project, w: r(x1 - x0), h: r(y1 - y0), t: +kid(kid(pcb, 'general'), 'thickness')[1], layers,
    outline: chain(shapes.map((p) => ({ k: '', p: at(p) }))).map((c) => c.p),
    tracks: chain(pieces).map((c) => [...c.k, ...c.p]),
    nets,
    vias: all(pcb, 'via').map((n) => [...at(pt(n, 'at')), r(+kid(n, 'drill')[1]), r(+kid(n, 'size')[1])]),
    pads: pads.filter((q) => routed.has(q[2])),
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
  const parts = src.replace(/\(model "([^"]*)"/g, (m, p) => `(model "${b.skip?.test(p) ? '/-/' : found(p, home) ?? p}"`)
  writeFileSync(f, parts.replace(/\(type "([^"]+)"\)(?:\s*\(color "[^"]*"\))?/g, paint))
  writeFileSync(bare, src.replaceAll('(model "', '(model "/-/')) // models nowhere: no parts
  if (existsSync(pro)) copyFileSync(pro, f.replace(/pcb$/, 'pro')) // its text variables
  const out = join(tmp, 'render.png') // kicad-cli renders a little short of the size it is asked for, by more when small
  const render = (file, quality, size = RENDER, view = [], side = 'top') => (execFileSync(KICAD, ['pcb', 'render', '--side', side, '--background', 'transparent', '--quality', quality,
    '-w', size, '-h', size, ...view, '-D', `KIPRJMOD=${dirname(home)}`, '-D', `KICAD8_3RD_PARTY=${PCM}`, '-D', `KICAD9_3RD_PARTY=${PCM}`, '-o', out, file].map(String), { stdio: 'pipe' }), rgba(out))
  // the outline is where the bare board is at least half there; the camera frames the outline either way
  const outline = (m) => {
    let x0 = m.W, y0 = m.H, x1 = 0, y1 = 0
    for (let y = 0; y < m.H; y++) for (let x = 0; x < m.W; x++)
      if (m.px[(y * m.W + x) * 4 + 3] >= 128) (x0 = Math.min(x0, x)), (x1 = Math.max(x1, x)), (y0 = Math.min(y0, y)), (y1 = Math.max(y1, y))
    if (!x0 || !y0 || x1 === m.W - 1 || y1 === m.H - 1) throw new Error(`${b.id}: the board runs off the render`)
    return [x0, y0, x1, y1]
  }
  // high quality lays the board on a floor whose shadow is translucent black; it goes, and the holes open
  const lift = (px) => { for (let i = 3; i < px.length; i += 4) if (px[i] < 255 && Math.max(px[i - 3], px[i - 2], px[i - 1]) < 8) px[i] = 0 }
  const save = (name, px, w, h, scale = []) => {
    const raw = join(tmp, 'pic.rgba'), png = join(tmp, 'pic.png'), webp = new URL(`${name}.webp`, MEDIA).pathname
    writeFileSync(raw, px) // a frame this big through a pipe makes ffmpeg complain
    execFileSync(FFMPEG, ['-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${w}x${h}`, '-i', raw, ...scale, '-y', png])
    execFileSync(CWEBP, ['-quiet', '-q', Q, '-m', 6, '-sharp_yuv', '-alpha_filter', 'best', '-o', webp, png].map(String))
    return readFileSync(webp).length
  }
  const face = (side, name) => {
    const [x0, y0, x1, y1] = outline(render(bare, 'basic', RENDER, [], side))
    const { W, px } = render(f, 'high', RENDER, [], side), cw = x1 - x0 + 1, ch = y1 - y0 + 1, crop = Buffer.alloc(cw * ch * 4)
    lift(px)
    for (let y = 0; y < ch; y++) px.copy(crop, y * cw * 4, ((y0 + y) * W + x0) * 4, ((y0 + y) * W + x1 + 1) * 4)
    return [cw, ch, save(name, crop, cw, ch, ['-vf', `scale=${SIDE}:${SIDE}:force_original_aspect_ratio=decrease:flags=lanczos`])]
  }
  const [cw, ch, top] = face('top', b.id), [, , back] = face('bottom', `${b.id}-back`)

  // The close-ups, each the middle P px of a render a little larger. Zoomed, the render still centres the board's
  // box and scales as the zoom (at ½ the board fits, so its size there gives the scale), and a pan puts the hole in
  // the middle; then where the hole lands in the bare render, its own transparent disc, pins the square to the
  // board's mm, whatever the pan was off by. kicad-cli holds the zoom down, so a closer one renders bigger.
  const L = Math.max(b.w, b.h), [hx, hy] = b.hole ?? []
  const close = (b.close ?? []).map((c, j) => {
    const [mm, P = 512] = [c].flat(), scale = (R) => { const o = outline(render(bare, 'basic', R, ['--zoom', 0.5])); return (2 * Math.max(o[2] - o[0] + 1, o[3] - o[1] + 1)) / L }
    let R = P + 48, k = scale(R)
    if (P / mm / k > ZOOM * L) (R = Math.ceil((R * P) / mm / k / ZOOM / L) + 48), (k = scale(R))
    const Z = P / mm / k, ppm = Z * k, view = ['--zoom', Z, '--pan', `${(-(hx - b.w / 2) / (PAN * L)).toFixed(5)},${((hy - b.h / 2) / (PAN * L)).toFixed(5)},0`]
    const middle = (m) => {
      const c = (m.W - P) >> 1, px = Buffer.alloc(P * P * 4)
      if (c < 0 || m.H !== m.W) throw new Error(`${b.id}: a ${m.W} px close-up`)
      for (let y = 0; y < P; y++) m.px.copy(px, y * P * 4, ((c + y) * m.W + c) * 4, ((c + y) * m.W + c + P) * 4)
      return { W: P, H: P, px }
    }
    const [bx, by, area] = disc(middle(render(bare, 'basic', R, view)), P / 2, P / 2)
    const m = middle(render(f, 'high', R, view))
    lift(m.px), save(`${b.id}-${j}`, m.px, P, P)
    const box = [hx - bx / ppm, hy - by / ppm, P / ppm, P].map((v) => Math.round(v * 1e4) / 1e4)
    console.log(`  ${b.id}-${j}: ${mm} mm at ${P} px, zoom ${Z.toFixed(2)} of ${R} px, hole at ${bx.toFixed(1)},${by.toFixed(1)} px, ${(2 * Math.sqrt(area / Math.PI) / ppm).toFixed(3)} mm across`)
    return box
  })
  return [`${cw}x${ch} → ${SIDE} px, ${top} + ${back} B`, close]
}

// The transparent disc nearest (cx, cy) that does not touch the edge: its centroid and area, px.
function disc({ W, H, px }, cx, cy) {
  const seen = new Uint8Array(W * H), open = (i) => px[i * 4 + 3] < 128
  let best = [0, 0, 0], d = Infinity
  for (let i = 0; i < W * H; i++) {
    if (seen[i] || !open(i)) continue
    const st = [i]
    let n = 0, sx = 0, sy = 0, edge = false
    seen[i] = 1
    while (st.length) {
      const j = st.pop(), x = j % W, y = (j / W) | 0
      n++, (sx += x + 0.5), (sy += y + 0.5), (edge ||= !x || !y || x === W - 1 || y === H - 1)
      for (const k of [x > 0 ? j - 1 : -1, x < W - 1 ? j + 1 : -1, j - W, j + W]) if (k >= 0 && k < W * H && !seen[k] && open(k)) (seen[k] = 1), st.push(k)
    }
    const e = Math.hypot(sx / n - cx, sy / n - cy)
    if (!edge && n > 8 && e < d) (d = e), (best = [sx / n, sy / n, n])
  }
  if (!best[2]) throw new Error('no hole in the close-up')
  return best
}

const only = process.argv.slice(2), tmp = process.argv[1] === fileURLToPath(import.meta.url) && mkdtempSync(join(tmpdir(), 'boards-'))
if (tmp) try {
  mkdirSync(OUT, { recursive: true }), mkdirSync(MEDIA, { recursive: true })
  const list = [], was = existsSync(new URL('list.json', OUT)) ? JSON.parse(readFileSync(new URL('list.json', OUT), 'utf8')) : []
  for (const b of BOARDS) {
    let home = b.file ?? join(b.clone ?? '', b.path)
    if (!existsSync(home)) {
      home = join(tmp, basename(b.path))
      writeFileSync(home, execFileSync('gh', ['api', `repos/${b.repo}/contents/${b.path}${b.ref ? `?ref=${b.ref}` : ''}`, '-H', 'Accept: application/vnd.github.raw'], { maxBuffer: 1 << 30 }))
    }
    const src = readFileSync(home, 'utf8'), [g, n] = geometry(b, src), json = JSON.stringify(g)
    writeFileSync(new URL(`${b.id}.json`, OUT), json)
    const [pic, close] = !only.length || only.includes(b.id) ? picture({ ...b, w: g.w, h: g.h }, src, home, tmp) : ['picture kept', was.find((w) => w.id === b.id)?.close]
    list.push({ id: g.id, title: g.title, project: g.project, w: g.w, h: g.h, ...(b.hole && { hole: b.hole, close }) })
    console.log(b.id, `${g.w}x${g.h} mm`, `${g.tracks.length}/${n} tracks`, `${g.vias.length} vias`, `${g.layers.length} layers`, `${json.length} B;`, pic)
  }
  writeFileSync(new URL('list.json', OUT), JSON.stringify(list))
} finally {
  rmSync(tmp, { recursive: true, force: true })
}

// Bakes River's hardware into GLB for the project world: public/media/models/<id>.glb, and list.json beside them,
// { id, file, bytes, tris, bounds, up, materials, project, note } each. A board goes through kicad-cli with its copper,
// pads, vias, silk, mask and every part's 3D model. A STEP assembly goes through kicad-cli too, as the one 3D model
// of an empty board, so OCCT tessellates it with its parts where they were assembled. STL and OBJ go straight to
// Blender. Then scripts/bake-models.py culls, welds and decimates each to its budget and merges primitives by
// material. The GLB frame is metres, y up. A board lies in x–z, top side +y, centred on its outline and mid-plane:
// KiCad's x is +x and its y, down the page, is +z. As in bake-boards.mjs, KiCad opens copies, since it leaves a lock
// file beside what it opens. `npm run models -- <id…>` bakes only those. Needs KiCad 10 and Blender.
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'

const GH = '/Users/river/Documents/github/', IREC = '/Users/river/Documents/stanford/SSI/IREC/', DL = '/Users/river/Downloads/'
const PV = IREC + 'Pigeon_Vision/PigeonVision/hardware/'
// Mask and silk, by stackup layer type, where the KiCad file names no colour and the board isn't green.
const ink = (silk, mask) => ({ 'Top Silk Screen': silk, 'Bottom Silk Screen': silk, 'Top Solder Mask': mask, 'Bottom Solder Mask': mask })
const BLACK = ink('White', 'Black'), WHITE = ink('#101010FF', '#F6F6F1F4') // the heart's, as bake-boards paints it
// Mesh materials, [r, g, b, metallic, roughness], linear.
const ACRYLIC = [0.8, 0.8, 0.78, 0, 0.25], SMOKED = [0.02, 0.02, 0.022, 0, 0.25], PLA = [0.75, 0.74, 0.7, 0, 0.6]
const PETG = [0.035, 0.037, 0.04, 0, 0.6], PETG2 = [0.05, 0.052, 0.056, 0, 0.55]
// A model is a `pcb`; a `step`, with `keep` the nodes kept and their materials; or `parts`, [file, material, place],
// place { yup: an Onshape STL exported y up, scale }.
const YUP = { scale: 0.001, yup: true }
const MODELS = [
  { id: 'peep', project: 'PEEP', note: 'IR-triggered keystroke injector, 12.06 × 8 mm, STM32F042', pcb: GH + 'PEEP/PCB/peep/peep.kicad_pcb', stackup: BLACK },
  { id: 'heart', project: 'Rava Heart', note: 'heart of 144 LEDs that beats in sync with its twin over ESP-NOW', pcb: GH + 'rava-heart/hardware/HeartArray.kicad_pcb', stackup: WHITE },
  { id: 'strobe-board', project: 'strobeGlasses', note: 'the MK1 glasses board', pcb: GH + 'strobeGlasses/strobeGlassesMK1/strobeGlassesMK1.kicad_pcb' },
  { id: 'ephemeris', project: 'Ephemeris-1', note: 'GNSS IQ breakout', pcb: GH + 'Personal PCBs/GNSS-IQ-Breakout/hardware/GNSS-IQ-Breakout.kicad_pcb', stackup: BLACK },
  { id: 'laserbrain', project: 'R-01', note: 'LaserBrain, the projector controller', pcb: GH + 'R-01_Raster_Laser_Projector/pcbs/LaserBrain/LaserBrain.kicad_pcb' },
  { id: 'laserdriver', project: 'R-01', note: 'LaserDriverRGB, 4 binary-weighted current channels per laser', pcb: GH + 'R-01_Raster_Laser_Projector/pcbs/LaserDriverRGB/LaserDriverRGB.kicad_pcb' },
  { id: 'coil', project: 'SAMWISE', note: 'Z magnetorquer coil panel', pcb: GH + 'samwise-avionics/Universal_Z_MagTorq/Coil_Panel_Z_v1/Coil_Panel_Z.kicad_pcb' },
  { id: 'pigeon-carrier', project: 'Pigeon Vision', note: 'CM5 carrier, 144.78 mm across', pcb: PV + 'carrier/PigeonCarrier/PigeonCarrier.kicad_pcb' },
  { id: 'yapogee-s3', project: 'Pigeon Vision', note: 'Yapogee S3, the DVB-S2 transmitter daughterboard', pcb: PV + 'yapogee-s3/kicad/YapogeeS3.kicad_pcb' },
  { id: 'picohat', project: 'SAMWISE', note: 'ground station debug hat for a Pico, S-band and UHF LoRa', pcb: GH + 'samwise-groundstation/SoftwareDebugPicoHat/SoftwareDebugPicoHat.kicad_pcb' },
  // the STLs lie as printed; the assembly STEP has the cover on the frame
  { id: 'strobe-frame', project: 'strobeGlasses', note: 'MK1 frame and brow cover, as assembled', step: GH + 'strobeGlasses/mechanical/strobe-glasses-mk1.step', keep: { Frame: PETG, 'Brow cover': PETG2 } },
  { id: 'r01-chassis', project: 'R-01', note: 'base box and deck, colours after the CAD render', parts: [
    [DL + 'MainBody - BasePlate/MainBody - BasePlate.obj', ACRYLIC], [DL + 'MainBody - Part 8.stl', SMOKED, YUP], [DL + 'MainBody - Part 9.stl', SMOKED, YUP],
    [DL + 'Top Panel.stl', ACRYLIC, YUP], [DL + 'MainBody - Part 12.stl', PLA, YUP], [DL + 'MainBody - Part 16.stl', ACRYLIC, YUP]] },
  { id: 'r01-polygon', project: 'R-01', note: 'polygon mirror mount and spinner', parts: [[DL + 'LaserPolygon123/LaserPolygon.obj']] },
  { id: 'r01-laser-plate', project: 'R-01', note: 'laser mounting plate', parts: [[DL + 'LaserAssemblyFRFR.stl', PLA, YUP]] },
  { id: 'pigeon-tube', project: 'Pigeon Vision', note: 'camera section: 6 in tube and two camera cradles, as assembled', step: IREC + '3dModels/pigeon-camera-section/output/pigeon_camera_section.step' },
]
const BUDGET = { board: { tris: 150e3, bytes: 4e6 }, mesh: { tris: 150e3, bytes: 3e6 } }

const KICAD = '/Applications/KiCad/KiCad.app/Contents/MacOS/kicad-cli', BLENDER = '/Applications/Blender.app/Contents/MacOS/Blender'
const LIB = '/Applications/KiCad/KiCad.app/Contents/SharedSupport/3dmodels', PCM = join(homedir(), 'Documents/KiCad/10.0/3rdparty')
// What boards name their 3D models by: older KiCads' variables and River's own libraries.
const VARS = { KICAD8_3RD_PARTY: PCM, KICAD9_3RD_PARTY: PCM, KICAD10_3RD_PARTY: PCM, KICAD9_3DMODEL_DIR: LIB, KICAD10_3DMODEL_DIR: LIB,
  RIVERS_DIR: GH + 'RiversKicadLibrary', SAMWISE_AVIONICS: GH + 'samwise-avionics' }
const RENAMED = { 'HTSOP-8-1EP_3.9x4.9mm_Pitch1.27mm': 'HTSOP-8-1EP_3.9x4.9mm_P1.27mm' } // KiCad 5's name
const MEDIA = new URL('../public/media/models/', import.meta.url), PY = new URL('bake-models.py', import.meta.url).pathname

// A 3D model's file, absolute, or nothing. KiCad 10 ships its library as STEP alone.
function model(p, home, tmp) {
  const f = resolve(dirname(home), p.replace(/\$\{(\w+)\}/g, (v, k) => (k === 'KIPRJMOD' ? dirname(home) : VARS[k] ?? v)))
  const g = [f, f.replace(/\.wrl$/i, '.step'), f.replace(/[^/]+(?=\.\w+$)/, (n) => RENAMED[n] ?? n)].find(existsSync)
  return g?.endsWith('.3mf') ? vrml(g, tmp) : g
}

// kicad-cli reads no 3MF. Rivers_IC's STM32 is one, counted in mils whatever its unit says, and KiCad's VRML is in 0.1 in.
function vrml(f, tmp) {
  const x = execFileSync('unzip', ['-p', f, '3D/3dmodel.model']).toString(), out = join(tmp, basename(f, '.3mf') + '.wrl')
  const rgb = [...x.matchAll(/<m:color color="#(\w\w)(\w\w)(\w\w)/g)].map((m) => m.slice(1).map((h) => (parseInt(h, 16) / 255).toFixed(3)).join(' '))
  const pts = [...x.matchAll(/<vertex x="([^"]+)" y="([^"]+)" z="([^"]+)"/g)].map((m) => m.slice(1).map((v) => v / 100).join(' ')).join(',')
  const by = {}
  for (const [, a, b, c, p = 0] of x.matchAll(/<triangle v1="(\d+)" v2="(\d+)" v3="(\d+)"(?: pid="\d+" p1="(\d+)")?/g)) (by[p] ??= []).push(`${a},${b},${c},-1`)
  writeFileSync(out, '#VRML V2.0 utf8\n' + Object.entries(by).map(([p, t]) => `Shape { appearance Appearance { material Material { diffuseColor ${rgb[p] ?? '0.5 0.5 0.5'} } }
  geometry IndexedFaceSet { coord Coordinate { point [${pts}] } coordIndex [${t.join(',')}] } }`).join('\n'))
  return out
}

const glb = (f, opts, out) => execFileSync(KICAD, ['pcb', 'export', 'glb', '-f', ...opts, '-o', out, f], { stdio: 'pipe', encoding: 'utf8' })

// A board as KiCad would build it, with its parts. Returns the parts whose 3D models are missing.
function pcb(m, tmp, out) {
  const f = join(tmp, 'board.kicad_pcb'), pro = m.pcb.replace(/\.kicad_pcb$/, '.kicad_pro'), missing = []
  const paint = (s, t) => (m.stackup?.[t] ? `(type "${t}") (color "${m.stackup[t]}")` : s)
  const find = (s, p) => { const g = model(p, m.pcb, tmp); return g ? `(model "${g}"` : (missing.push(basename(p)), s) }
  writeFileSync(f, readFileSync(m.pcb, 'utf8').replace(/\(type "([^"]+)"\)(?:\s*\(color "[^"]*"\))?/g, paint).replace(/\(model "([^"]+)"(?!\s*\(hide yes\))/g, find))
  if (existsSync(pro)) copyFileSync(pro, f.replace(/pcb$/, 'pro')) // its text variables
  glb(f, ['--subst-models', '--no-dnp', '--include-tracks', '--include-pads', '--include-zones', '--include-silkscreen', '--include-soldermask'], out)
  return missing
}

function step(m, tmp, out) {
  const f = join(tmp, 'step.kicad_pcb')
  writeFileSync(f, `(kicad_pcb (version 20240108) (generator "bake") (general (thickness 1.6)) (paper "A4") (layers (0 "F.Cu" signal) (31 "B.Cu" signal))
  (footprint "step" (layer "F.Cu") (at 0 0) (model "${m.step}")))`)
  glb(f, ['--no-board-body'], out)
  return []
}

const only = process.argv.slice(2), tmp = mkdtempSync(join(tmpdir(), 'models-'))
mkdirSync(MEDIA, { recursive: true })
try {
  const was = existsSync(new URL('list.json', MEDIA)) ? JSON.parse(readFileSync(new URL('list.json', MEDIA), 'utf8')) : []
  const list = []
  for (const m of MODELS) {
    if (only.length && !only.includes(m.id)) {
      const w = was.find((w) => w.id === m.id)
      if (w) list.push(w)
      continue
    }
    const raw = join(tmp, 'raw.glb'), out = new URL(`${m.id}.glb`, MEDIA).pathname, t0 = Date.now()
    const missing = m.pcb ? pcb(m, tmp, raw) : m.step ? step(m, tmp, raw) : []
    const parts = m.parts ? m.parts.map(([file, mat, place]) => ({ file, mat, ...place })) : [{ file: raw, keep: m.keep }]
    const job = { id: m.id, kind: m.pcb ? 'board' : 'mesh', parts, out, ...BUDGET[m.pcb ? 'board' : 'mesh'] }
    const log = execFileSync(BLENDER, ['-b', '--factory-startup', '--python-exit-code', '1', '--python', PY, '--', JSON.stringify(job)], { maxBuffer: 1 << 28, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] })
    const s = JSON.parse(log.match(/^MODEL (.*)$/m)[1]), bytes = statSync(out).size
    list.push({ id: m.id, file: `${m.id}.glb`, bytes, tris: s.tris, bounds: s.bounds, up: 'y', materials: s.materials, project: m.project, note: m.note })
    const mm = s.bounds.slice(3).map((v, i) => Math.round((v - s.bounds[i]) * 1e4) / 10)
    console.log(m.id, `${(bytes / 1e6).toFixed(2)} MB`, `${s.tris} tris`, `${s.materials} materials`, `${mm.join(' × ')} mm`, log.match(/^RAW (.*)$/m)?.[1], JSON.stringify(s.ratios),
      missing.length ? `missing ${missing.length}: ${[...new Set(missing)].join(', ')}` : '', `${((Date.now() - t0) / 1e3).toFixed(0)} s`)
  }
  writeFileSync(new URL('list.json', MEDIA), JSON.stringify(list, null, 1))
} finally {
  rmSync(tmp, { recursive: true, force: true })
}

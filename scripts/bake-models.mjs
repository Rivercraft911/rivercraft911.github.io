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
const SATS = '/Users/river/Documents/stanford/SSI/SATS/', CAM = DL + 'SSI Payload Carrier/Camera assembly/'
const PV = IREC + 'Pigeon_Vision/PigeonVision/hardware/'
// Mask and silk, by stackup layer type, where the KiCad file names no colour and the board isn't green.
const ink = (silk, mask) => ({ 'Top Silk Screen': silk, 'Bottom Silk Screen': silk, 'Top Solder Mask': mask, 'Bottom Solder Mask': mask })
const BLACK = ink('White', 'Black'), WHITE = ink('#101010FF', '#F6F6F1F4') // the heart's, as bake-boards paints it
// Mesh materials, [r, g, b, metallic, roughness], linear.
const PETG = [0.035, 0.037, 0.04, 0, 0.6], PETG2 = [0.05, 0.052, 0.056, 0, 0.55]
// A model is a `pcb`, with `skip` the parts' 3D models left out; a `step`, with `keep` the nodes kept and their
// materials (bake-models.py), or `drop` the nodes left out, by a pattern of their names, and a `box` to cut by; or
// `parts`, [file, material, place], place { yup: an Onshape STL exported y up, scale }. `budget` overrides BUDGET's.
const has = (v, ...nodes) => Object.fromEntries(nodes.map((n) => [n, v]))
// R-01, River's Onshape assembly of it, in the pieces that move: the box it stands on (base, fan, posts, switch and the
// MangoPi), the acrylic air duct, the deck with its optics (lasers and dichroics, the polygon's motor and facet sensor,
// the galvo, their supply and fans), the lid, and the two mirrors that turn. River's own two boards are KiCad's, above.
const R01 = DL + 'R-01-Laser.step', LID = [21, 22, 23, 24, 25, 26].map((n) => `ChassisAssembly <1>/Part ${n}`)
const PADDLE = [[38, 6.5, -137.4], [47.6, 16, -135.8]] // the galvo's mirror, where the assembly has it (mm)
const MIRROR = [0.92, 0.92, 0.93, 1, 0.06] // first-surface aluminium
const MODELS = [
  { id: 'peep', project: 'PEEP', note: 'IR-triggered keystroke injector, 12.06 × 8 mm, STM32F042', pcb: GH + 'PEEP/PCB/peep/peep.kicad_pcb', stackup: BLACK },
  { id: 'heart', project: 'Rava Heart', note: 'heart of 144 LEDs that beats in sync with its twin over ESP-NOW', pcb: GH + 'rava-heart/hardware/HeartArray.kicad_pcb', stackup: WHITE },
  { id: 'strobe-board', project: 'strobeGlasses', note: 'the MK1 glasses board', pcb: GH + 'strobeGlasses/strobeGlassesMK1/strobeGlassesMK1.kicad_pcb' },
  { id: 'ephemeris', project: 'Ephemeris-1', note: 'GNSS IQ breakout', pcb: GH + 'Personal PCBs/GNSS-IQ-Breakout/hardware/GNSS-IQ-Breakout.kicad_pcb', stackup: BLACK },
  { id: 'laserbrain', project: 'R-01', note: 'LaserBrain, the projector controller', pcb: GH + 'R-01_Raster_Laser_Projector/pcbs/LaserBrain/LaserBrain.kicad_pcb' },
  { id: 'laserdriver', project: 'R-01', note: 'LaserDriverRGB, 4 binary-weighted current channels per laser', pcb: GH + 'R-01_Raster_Laser_Projector/pcbs/LaserDriverRGB/LaserDriverRGB.kicad_pcb' },
  { id: 'coil', project: 'SAMWISE', note: 'Z magnetorquer coil panel', pcb: GH + 'samwise-avionics/Universal_Z_MagTorq/Coil_Panel_Z_v1/Coil_Panel_Z.kicad_pcb' },
  // the CM5 and Yapogee S3 come off it, so they are their own models
  { id: 'pigeon-carrier', project: 'Pigeon Vision', note: 'CM5 carrier, 144.78 mm across, without its CM5 and Yapogee S3', pcb: PV + 'carrier/PigeonCarrier/PigeonCarrier.kicad_pcb', skip: /YapogeeS3_Rev1|CM5R5/ },
  { id: 'yapogee-s3', project: 'Pigeon Vision', note: 'Yapogee S3, the DVB-S2 transmitter daughterboard', pcb: PV + 'yapogee-s3/kicad/YapogeeS3.kicad_pcb' },
  { id: 'picohat', project: 'SAMWISE', note: 'ground station debug hat for a Pico, S-band and UHF LoRa', pcb: GH + 'samwise-groundstation/SoftwareDebugPicoHat/SoftwareDebugPicoHat.kicad_pcb' },
  // the STLs lie as printed; the assembly STEP has the cover on the frame
  { id: 'strobe-frame', project: 'strobeGlasses', note: 'MK1 frame and brow cover, as assembled', step: GH + 'strobeGlasses/mechanical/strobe-glasses-mk1.step', keep: { Frame: PETG, 'Brow cover': PETG2 } },
  { id: 'r01-base', project: 'R-01', note: 'base, intake fan, posts, switch and the MangoPi', step: R01, keep: {
    ...has(null, 'R-01-Laser/Part 1', 'rubberFeet <1>', 'rubberFeet <2>', 'rubberFeet <3>', 'rubberFeet <4>', '140MMFan <1>', 'OPENSWITCH <1>', 'MangoPiStandIn <1>', 'ChassisAssembly <1>'),
    ...has(false, ...LID, 'ChassisAssembly <1>/Part 16', 'ChassisAssembly <1>/CoolingTube') } },
  { id: 'r01-duct', project: 'R-01', note: 'the acrylic air duct round the boards', step: R01, keep: has(null, 'ChassisAssembly <1>/CoolingTube') },
  { id: 'r01-deck', project: 'R-01', note: 'the optics deck: lasers, dichroics, polygon motor, galvo, their supply and fans', step: R01, box: [...PADDLE, false], keep: {
    ...has(null, 'ChassisAssembly <1>/Part 16', 'LaserA^2 <1>', 'Polygon <1>', 'GalvoScannerX <1>', 'GalvoPSU <1>', '40mmFan <1>', '40mmFan <2>'), 'Polygon <1>/Part 3': false,
    'GalvoDriver <1>': [0.03, 0.09, 0.035, 0, 0.5] } }, // (the bought galvo driver, a stand-in board in the CAD)
  { id: 'r01-lid', project: 'R-01', note: 'the tinted lid', step: R01, keep: has(null, ...LID, '60mmFan <1>') },
  { id: 'r01-galvo-mirror', project: 'R-01', note: 'the galvo’s mirror', step: R01, box: [...PADDLE, true], keep: has(MIRROR, 'GalvoScannerX <1>/Part 1') },
  { id: 'r01-polygon-mirror', project: 'R-01', note: 'the polygon: four facets, 14.2 mm', step: R01, keep: has(MIRROR, 'Polygon <1>/Part 3') },
  { id: 'pigeon-tube', project: 'Pigeon Vision', note: 'camera section: 6 in tube and two camera cradles, as assembled', step: IREC + '3dModels/pigeon-camera-section/output/pigeon_camera_section.step' },
  // Faulhaber lets its motor model go only whole and unaltered, and the bake decimates, so the motor stays out.
  { id: 'finertia', project: 'BLEPS', note: 'Finertia, BLEPS’s reaction wheel controller, 26 × 26 mm (its Faulhaber 2610 motor left out)',
    pcb: SATS + 'Satellite-Avionics-rotor/project-janus/ADCS/rotor-controller/Rotor.kicad_pcb', skip: /2610T/ },
  // the team's whole 2U as assembled, arrays and tapes deployed. Out: River's coil boards (their own models), the stack
  // and payload boards the panels hide, the fasteners, and the strays (a stowed copy of the tapes, a second Z panel and
  // a coax cable left far off the bus).
  { id: 'samwise', project: 'SAMWISE', note: 'the 2U as assembled, arrays deployed, River’s coil boards left out', step: DL + 'samwisesatstep.step',
    drop: /Coil_Panel|universal_coil|Z_universal|Stowed Antenna|WPC_25A|^ZPlus_Panel_v2\.4_2025-04-22:2$|^(Pycubed|Battery Board|Reaction Wheel|ADCS) Assembly|Raspberry Pi 4|Camera Multiplexer|RPi_interface|Torx|Screw|Nut|Spacer|Standoff|ISO14581|HNN SCRIPT|^9\d{4}A\d/ },
  { id: 'coil-xy', project: 'SAMWISE', note: 'XY magnetorquer coil board, 81.5 × 215.5 mm, five coil layers in series', pcb: GH + 'samwise-avionics/Universal_XY_MagTorq/Coil_Panel_XY.kicad_pcb' },
  { id: 'pigeon-cm5', project: 'Pigeon Vision', note: 'Raspberry Pi CM5, as its carrier places it (Raspberry Pi’s model)', step: PV + 'libraries/3dmodels/CM5R5-3dsteps.step',
    occt: { paint: { DIELECTRIC_Model_1_Inst: [0.02, 0.12, 0.05, 0, 0.45] } } }, // KiCad can't mesh it; and its board is green, not cream
  // one camera of the camera section on its cradle, as its reference assembly draws it: board, adapter, M12 holder and
  // CIL212 fisheye; and half the tube, cut across the cameras' axis, so the section can open
  { id: 'pigeon-camera', project: 'Pigeon Vision', note: 'IMX900 camera on its P22 adapter, M12 holder and CIL212 fisheye (dimensional envelopes), on its printed cradle',
    step: IREC + '3dModels/pigeon-camera-section/build/reference_assembly_with_hardware_envelopes.step',
    keep: { Cradle_A: [0.6, 0.22, 0.06, 0, 0.55], A_sensor_pcb_envelope: [0.02, 0.09, 0.05, 0, 0.4], A_p22_pcb_envelope: [0.02, 0.1, 0.055, 0, 0.4], A_stock_m12_holder_envelope: [0.02, 0.02, 0.022, 0, 0.55],
      A_cil212_external_envelope: [0.015, 0.015, 0.017, 0.5, 0.35], A_p22_ffc_connector_envelope: [0.7, 0.66, 0.55, 0, 0.6], A_four_mm_purchased_spacers: [0.8, 0.6, 0.3, 1, 0.35] } },
  { id: 'pigeon-shell', project: 'Pigeon Vision', note: 'half the camera section’s 6 in tube, with one lens port and its cradle’s seats, painted as the airframe',
    step: IREC + '3dModels/pigeon-camera-section/output/tube.step', occt: { half: [1, 0, 0], paint: { '*': [0.8, 0.8, 0.79, 0, 0.3] } } },
  // BLEPS's insides, River's: the TT&C board (Yapling) and the payload board with its Jetson Orin NX, as placed in KiCad;
  // the two kinds of camera on it, each a FRAMOS IMX676C on its MC50A adapter, the main one behind a Commonlands CIL160
  // (16 mm f/1.9) and the 360 pair behind CIL220 fisheyes; and the star tracker, a FRAMOS IMX900M behind an Edmund
  // 16 mm f/1.8, and its baffle.
  { id: 'yapling', project: 'BLEPS', note: 'Yapling, the TT&C board: S-band downlink from an ESP32-S3, UHF, an RP2350B, 80 × 80 mm', pcb: SATS + 'Satellite-Avionics-TTC/project-janus/TTC/schematics/Yapling.kicad_pcb', budget: { bytes: 3e6 } },
  { id: 'payload-carrier', project: 'BLEPS', note: 'the payload board, 80 × 80 mm, carrying a Jetson Orin NX and the cameras’ links', pcb: SATS + 'Satellite-Avionics-payload/project-janus/PAYLOAD/payload-carrier/payload-carrier.kicad_pcb', budget: { bytes: 3e6 } },
  { id: 'cam-main', project: 'BLEPS', note: 'the main camera: IMX676C, CIL160 16 mm f/1.9, MC50A', step: CAM + 'Main Camera Assembly - CIL160.step', budget: { tris: 15e3 } },
  { id: 'cam-360', project: 'BLEPS', note: 'one of the 360 pair: IMX676C, CIL220 fisheye, MC50A', step: CAM + 'CIL220 camera with MC50A.step', budget: { tris: 15e3 } },
  { id: 'star-tracker', project: 'BLEPS', note: 'the star tracker: IMX900M, Edmund #33-883 16 mm f/1.8, MC50A', step: CAM + 'Star Tracker Assembly.step', budget: { tris: 25e3 } },
  // the reaction wheels' motor, FAULHABER 2610T012B, from FAULHABER's own STEP (River keeps it beside Finertia). FAULHABER
  // lets its models go only complete and unaltered, so this one is tessellated whole and never decimated (a budget it
  // cannot reach); the rotor is the wheel, no flywheel on it.
  { id: 'faulhaber-2610', project: 'BLEPS', note: 'FAULHABER 2610T012B, the reaction wheels’ motor, from FAULHABER’s STEP, whole and not decimated', step: SATS + 'Satellite-Avionics-rotor/project-janus/ADCS/rotor-controller/models/2610T_B.stp', budget: { tris: 1e7, bytes: 1e9 } },
  { id: 'star-baffle', project: 'BLEPS', note: 'the star tracker’s baffle: aluminium, four vanes and an entrance stop', step: DL + 'Star Tracker Baffle/Star Tracker Baffle.step' },
]
const BUDGET = { board: { tris: 150e3, bytes: 4e6 }, mesh: { tris: 150e3, bytes: 3e6 } }

const KICAD = '/Applications/KiCad/KiCad.app/Contents/MacOS/kicad-cli', BLENDER = '/Applications/Blender.app/Contents/MacOS/Blender'
const OCP = join(homedir(), '.cache/ssi-cad-venv/bin/python') // a Python with cadquery's OCP, for STEPs KiCad can't mesh (step2glb.py)
const LIB = '/Applications/KiCad/KiCad.app/Contents/SharedSupport/3dmodels', PCM = join(homedir(), 'Documents/KiCad/10.0/3rdparty')
// What boards name their 3D models by: older KiCads' variables and River's own libraries.
const VARS = { KICAD8_3RD_PARTY: PCM, KICAD9_3RD_PARTY: PCM, KICAD10_3RD_PARTY: PCM, KICAD9_3DMODEL_DIR: LIB, KICAD10_3DMODEL_DIR: LIB,
  RIVERS_DIR: GH + 'RiversKicadLibrary', SAMWISE_AVIONICS: GH + 'samwise-avionics', SSI_ICS: SATS + 'Satellite-Avionics-TTC/component_library/kicad-libraries/SSI_ICs' }
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
  const find = (s, p) => {
    if (m.skip?.test(p)) return `${s} (hide yes)`
    const g = model(p, m.pcb, tmp)
    return g ? `(model "${g}"` : (missing.push(basename(p)), s)
  }
  writeFileSync(f, readFileSync(m.pcb, 'utf8').replace(/\(type "([^"]+)"\)(?:\s*\(color "[^"]*"\))?/g, paint).replace(/\(model "([^"]+)"(?!\s*\(hide yes\))/g, find))
  if (existsSync(pro)) copyFileSync(pro, f.replace(/pcb$/, 'pro')) // its text variables
  glb(f, ['--subst-models', '--no-dnp', '--include-tracks', '--include-pads', '--include-zones', '--include-silkscreen', '--include-soldermask'], out)
  return missing
}

// OCCT copies a model into the board's assembly only if its labels are self-contained, and an instance's colour
// overriding its part's is not: it would flatten the whole into one mesh, names and colours lost. The overrides go.
function step(m, tmp, out) {
  if (m.occt) return execFileSync(OCP, [new URL('step2glb.py', import.meta.url).pathname, m.step, out, JSON.stringify(m.occt)], { stdio: 'pipe' }), []
  const f = join(tmp, 'step.kicad_pcb'), s = join(tmp, 'model.step')
  writeFileSync(s, readFileSync(m.step, 'latin1').replace(/#\d+\s*=\s*CONTEXT_DEPENDENT_OVER_RIDING_STYLED_ITEM\([^;]*\);\s*/g, ''), 'latin1')
  writeFileSync(f, `(kicad_pcb (version 20240108) (generator "bake") (general (thickness 1.6)) (paper "A4") (layers (0 "F.Cu" signal) (31 "B.Cu" signal))
  (footprint "step" (layer "F.Cu") (at 0 0) (model "${s}")))`)
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
    const parts = m.parts ? m.parts.map(([file, mat, place]) => ({ file, mat, ...place })) : [{ file: raw, keep: m.keep, drop: m.drop?.source, box: m.box }]
    const job = { id: m.id, kind: m.pcb ? 'board' : 'mesh', parts, out, ...BUDGET[m.pcb ? 'board' : 'mesh'], ...m.budget }
    const log = execFileSync(BLENDER, ['-b', '--factory-startup', '--python-exit-code', '1', '--python', PY, '--', JSON.stringify(job)], { maxBuffer: 1 << 28, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] })
    const s = JSON.parse(log.match(/^MODEL (.*)$/m)[1]), bytes = statSync(out).size
    list.push({ id: m.id, file: `${m.id}.glb`, bytes, tris: s.tris, bounds: s.bounds, up: 'y', materials: s.materials, project: m.project, note: m.note })
    const mm = s.bounds.slice(3).map((v, i) => Math.round((v - s.bounds[i]) * 1e4) / 10)
    console.log(m.id, `${(bytes / 1e6).toFixed(2)} MB`, `${s.tris} tris`, `${s.materials} materials`, `${mm.join(' × ')} mm`, log.match(/^RAW (.*)$/m)?.[1], JSON.stringify(s.ratios),
      missing.length ? `missing ${missing.length}: ${[...new Set(missing)].join(', ')}` : '', `${((Date.now() - t0) / 1e3).toFixed(0)} s`)
  }
  for (const w of was) if (!MODELS.some((m) => m.id === w.id)) list.push(w) // models baked elsewhere (bleps, from its simulator) stay
  writeFileSync(new URL('list.json', MEDIA), JSON.stringify(list, null, 1))
} finally {
  rmSync(tmp, { recursive: true, force: true })
}
execFileSync(process.execPath, [new URL('pack-models.mjs', import.meta.url).pathname], { stdio: 'inherit' }) // and packed for the wire

// The bench: PEEP doing its job, at true scale. A desk on the ground (a monitor, a keyboard, the computer, a small tower
// with two USB-A ports in its front, and a TV remote) and PEEP, 12.06 × 8 mm, just out of a port. Arriving, the camera
// comes down to the tower's front and PEEP slides into the port, all of it but its back edge, as it sits in a real one;
// the camera draws back, the remote fires PEEP's trigger (three 9 ms bursts of 38 kHz infrared, 30 ms apart, violet as a
// camera's sensor sees infrared; shown ten times slow so the three can be counted) and the screen fills at the macro's
// own pace, a key every 20 ms (a press report, 10 ms, a release, 10 ms), in real time. Then PEEP comes out of the port again, a part to click: it comes up to the camera and
// turns over, and its chips are parts in turn. In the intro's fly-past the same in a second: it plugs in, it fires, it types.
import { TAU, clamp, glide, mix, smooth } from '../../acts/scene'
import { Plucks } from '../../dsp/pluck'
import { ball, box, dome, make, prism, rounded, text, tube, type Mat } from '../make'
import { ctx, frame, part, site, solid, turn, unit, type V } from '../ctx'
import { PLACES, type About, type Steer } from '../places'
import { faces } from '../../beam/font'

// What PEEP types: its own one line, ASCII only, as its hid_ascii can send (River may change it).
export const MACRO = 'PEEP: a 12.06 x 8 mm keystroke injector. An IR burst from any TV remote, and it types this.'
const KEY = 0.02 // s a character: press, 10 ms, release, 10 ms (macro.c's REPORT_MS, twice)
const BURST = 0.009, GAP = 0.03, IRSLOW = 10 // the trigger (esp32-trigger), and how slow it is shown
const MM = 1.8e-4, GROUND = 1.0003 // radii a millimetre (1 radius is 5.6 m), and where the ground is
export const RISE = 0.017 // the place is looked at 150 mm up, the desk's middle

// ---- the desk, in millimetres. Each model's own axes: x to the right as you face it, y up, z toward you ----------------
const graphite: Mat = { col: [0.045, 0.046, 0.05, 1], metal: 0.7, rough: 0.35 }
const black: Mat = { col: [0.012, 0.012, 0.014, 1], metal: 0, rough: 0.3 }
const SW = 527, SH = 296, SY = 290 // the panel's picture (a 24-inch 16:9) and its middle's height
const BG: Mat = { col: [0.007, 0.008, 0.012, 1], metal: 0, rough: 0.6 } // the editor's ground, lit from within
const G = 10, AR = 0.25 // how bright the screen is (glow), and how much of the world's light its coating gives back
make('peep-monitor', () => {
  // the bezel round the picture, the panel's body, the back's bulge, the neck and the round foot
  box(black, [-SW / 2 - 7, SY - SH / 2 - 19, -9], [SW / 2 + 7, SY - SH / 2, 0])
  box(black, [-SW / 2 - 7, SY + SH / 2, -9], [SW / 2 + 7, SY + SH / 2 + 7, 0])
  for (const s of [-1, 1]) box(black, [s < 0 ? -SW / 2 - 7 : SW / 2, SY - SH / 2, -9], [s < 0 ? -SW / 2 : SW / 2 + 7, SY + SH / 2, 0])
  box(graphite, [-SW / 2 - 7, SY - SH / 2 - 19, -12], [SW / 2 + 7, SY + SH / 2 + 7, -9])
  box(graphite, [-170, SY - 120, -42], [170, SY + 110, -12])
  box(graphite, [-32, 8, -60], [32, SY + 40, -42])
  tube(graphite, [0, 0, -70], [0, 1, 0], 128, 122, 8, 64, true)
})
make('peep-screen', () => box(BG, [-SW / 2, SY - SH / 2, -1.5], [SW / 2, SY + SH / 2, -1]))
make('peep-blank', () => box(BG, [-50, -50, -50], [50, 50, 50])) // the untyped part of a line: the ground, over it
// The editor: a title bar, then the macro, wrapped at word ends, a line number in the gutter of each.
const CAP = 19, LEAD = 34, X0 = -SW / 2 + 70, TOP = SY + SH / 2 - 62, ZT = -0.8
const ink: Mat = { col: [0.78, 0.8, 0.84, 1], metal: 0, rough: 0.6 }, green: Mat = { col: [0.3, 1, 0.48, 1], metal: 0, rough: 0.6 }
const dim: Mat = { col: [0.09, 0.1, 0.12, 1], metal: 0, rough: 0.6 }
make('peep-chrome', () => {
  box({ col: [0.03, 0.033, 0.045, 1], metal: 0, rough: 0.6 }, [-SW / 2, SY + SH / 2 - 26, -0.95], [SW / 2, SY + SH / 2, -0.9])
  text(() => dim, 'untitled', -SW / 2 + 16, SY + SH / 2 - 17, -0.85, 9, 1.3)
})
// the macro, wrapped at word ends; each line's first key, the pen's x after each of its keys, and its baseline
const MAXW = SW / 2 - 24 - X0, width = (t: string) => [...t].reduce((w, ch) => w + (faces.hershey.g[ch]?.[0] ?? 0.6), 0) * CAP
const lines: { from: number; ends: number[]; y: number }[] = []
for (let from = 0; from < MACRO.length; ) {
  let to = MACRO.length
  if (width(MACRO.slice(from)) > MAXW) for (let i = from; i < MACRO.length; i++) if (MACRO[i] === ' ' && width(MACRO.slice(from, i)) <= MAXW) to = i + 1
  const j = lines.length, y = TOP - j * LEAD, f = from, ends: number[] = []
  make(`peep-line-${j}`, () => {
    text(() => dim, String(j + 1), X0 - 44, y, ZT, CAP * 0.7, 2)
    ends.push(...text((i) => (f + i < 4 ? green : ink), MACRO.slice(f, to), X0, y, ZT, CAP, 2.3))
  })
  lines.push({ from, ends, y }), (from = to)
}
make('peep-caret', () => box(green, [-1.3, -6, -0.3], [1.3, CAP + 5, -0.2]))

// The keyboard: an aluminium deck and 104 keys on 19.05 mm, untouched while the text comes.
const KW = 440, KD = 135, KH = 16, U = 19.05
const shell: Mat = { col: [0.62, 0.62, 0.64, 1], metal: 1, rough: 0.25 }, gold: Mat = { col: [0.85, 0.65, 0.25, 1], metal: 1, rough: 0.25 }
make('peep-keyboard', () => {
  const deck: Mat = { col: [0.55, 0.56, 0.58, 1], metal: 1, rough: 0.42 }, cap: Mat = { col: [0.72, 0.72, 0.7, 1], metal: 0, rough: 0.5 }
  box(deck, [-KW / 2, 0, -KD / 2], [KW / 2, KH, KD / 2])
  // the keys, row by row from the back: widths in units, 0 a gap of half a key, negative a gap of that many
  const ROWS = [
    [1, -1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 0, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2],
    [1.5, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.5],
    [1.75, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2.25],
    [2.25, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2.75],
    [1.25, 1.25, 1.25, 6.25, 1.25, 1.25, 1.25, 1.25],
  ]
  const NAV = ['111', '111', '111', '000', '010', '111'], PAD = ['0000', '1111', '111T', '1110', '111T', '2010']
  const key = (x: number, z: number, w: number, d = 1) => box(cap, [x + 1.6, KH, z + 1.6], [x + w * U - 1.6, KH + 7, z + d * U - 1.6])
  const left = -KW / 2 + 10, back = -KD / 2 + 7
  ROWS.forEach((row, r) => {
    let x = left
    const z = back + (r ? r + 0.4 : 0) * U
    for (const w of row) w > 0 ? (key(x, z, w), (x += w * U)) : (x += (w === 0 ? 0.5 : -w) * U)
    NAV[r].split('').forEach((c, i) => c === '1' && key(left + (15.5 + i) * U, z, 1))
    PAD[r].split('').forEach((c, i) => c === '1' ? key(left + (19 + i) * U, z, 1) : c === 'T' ? key(left + (19 + i) * U, z, 1, 2) : c === '2' && key(left + (19 + i) * U, z, 2))
  })
})

// The computer: a small white tower, 185 × 400 × 380 mm, on four feet, its front a bezel with vents and, near the top,
// two USB-A ports (each a steel shell round a 12.5 × 5 mm opening 14 mm deep, a white tongue on its floor and four gold
// contacts on the tongue) and the power button, its light on. PEEP goes into the left port.
const TW = 185, TH = 400, TD = 380, ZF = TD / 2, PY = 362, PXS = [-16, 16], PX = PXS[0] // the box; the ports' row and middles
make('peep-tower', () => {
  const body: Mat = { col: [0.62, 0.62, 0.6, 1], metal: 0, rough: 0.45 }, bezel: Mat = { col: [0.55, 0.55, 0.54, 1], metal: 0, rough: 0.5 }
  const slat: Mat = { col: [0.08, 0.08, 0.085, 1], metal: 0, rough: 0.6 }, white: Mat = { col: [0.8, 0.8, 0.78, 1], metal: 0, rough: 0.5 }
  box(body, [-TW / 2, 10, -TD / 2], [TW / 2, TH, ZF - 16])
  for (const x of [-1, 1]) for (const z of [-1, 1]) box(black, [x * (TW / 2 - 25) - 12, 0, z * (TD / 2 - 30) - 15], [x * (TW / 2 - 25) + 12, 10, z * (TD / 2 - 30) + 15])
  // the bezel, solid but for the two ports' mouths
  const y0 = PY - 2.8, y1 = PY + 2.8, [a, b] = PXS, z0 = ZF - 16
  box(bezel, [-TW / 2, 10, z0], [TW / 2, y0, ZF]), box(bezel, [-TW / 2, y1, z0], [TW / 2, TH, ZF])
  box(bezel, [-TW / 2, y0, z0], [a - 6.55, y1, ZF]), box(bezel, [a + 6.55, y0, z0], [b - 6.55, y1, ZF]), box(bezel, [b + 6.55, y0, z0], [TW / 2, y1, ZF])
  for (const x of PXS) {
    const x0 = x - 6.55, x1 = x + 6.55, zb = ZF - 14
    box(shell, [x0, y0, zb], [x1, y0 + 0.3, ZF + 0.3]), box(shell, [x0, y1 - 0.3, zb], [x1, y1, ZF + 0.3])
    box(shell, [x0, y0, zb], [x0 + 0.3, y1, ZF + 0.3]), box(shell, [x1 - 0.3, y0, zb], [x1, y1, ZF + 0.3])
    box(white, [x - 5.25, y0 + 0.3, zb], [x + 5.25, y0 + 2.14, ZF - 4])
    for (const d of [-3.5, -1, 1, 3.5]) box(gold, [x + d - 0.5, y0 + 2.14, zb + 1], [x + d + 0.5, y0 + 2.24, ZF - 5])
  }
  tube(body, [55, PY, ZF], [0, 0, 1], 7, 6.6, 1.5, 32) // the power button
  for (let i = 0; i < 18; i++) box(slat, [-62, 40 + i * 15, ZF - 0.5], [62, 46 + i * 15, ZF + 1]) // the vents' slats
})
make('peep-led', () => ball({ col: [0.55, 0.75, 1, 1], metal: 0, rough: 1 }, [0, 0, 0], 0.8, 12))

// The remote: a TV remote lying on the ground, its infrared LED behind a dark window in its front end. Its own axes:
// x across, y along it (+y its front), z up.
const RL = 185, RW = 46, RT = 16
const LED: [number, number, number] = [0, RL / 2 + 0.6, RT / 2]
make('peep-remote', () => {
  const body: Mat = { col: [0.03, 0.03, 0.034, 1], metal: 0.2, rough: 0.42 }, rub: Mat = { col: [0.07, 0.07, 0.075, 1], metal: 0, rough: 0.85 }
  prism(body, rounded(RW, RL, 12), 0, RT)
  dome({ col: [0.05, 0.004, 0.012, 1], metal: 0, rough: 0.12 }, [LED[0], LED[1] - 1.5, LED[2]], [0, 1, 0], 2.8)
  tube({ col: [0.5, 0.03, 0.025, 1], metal: 0, rough: 0.7 }, [0, 66, RT], [0, 0, 1], 5, 4.6, 2.5)
  tube(rub, [0, 28, RT], [0, 0, 1], 15, 14.5, 1.6, 48), tube(rub, [0, 28, RT], [0, 0, 1], 7, 6.6, 3, 32)
  for (let r = 0; r < 4; r++) for (let c = -1; c <= 1; c++) tube(rub, [c * 12, -8 - r * 14, RT], [0, 0, 1], 4.4, 4, 2, 20)
  for (const x of [-15, 15]) box(rub, [x - 4.5, -76, RT], [x + 4.5, -58, RT + 2])
})
make('peep-ir', () => ball({ col: [0.62, 0.44, 1, 1], metal: 0, rough: 1 }, [0, 0, 0], 3, 16))

// ---- where things are: x to the west (your right as you face the screen from the north), y up, z north, mm ----------
type F = { o: V; x: V; y: V; z: V }
const blank = (): F => ({ o: [0, 0, 0], x: [0, 0, 0], y: [0, 0, 0], z: [0, 0, 0] })
const n: V = [0, 0, 0], e: V = [0, 0, 0], No: V = [0, 0, 0]
// the ground's frame at (x, z) from the place, turned ψ about the vertical
function ground(x: number, z: number, psi: number, o: F) {
  for (let i = 0; i < 3; i++) o.y[i] = n[i] + (-e[i] * x + No[i] * z) * MM
  unit(o.y), frame(o.y, o.x, o.z)
  for (let i = 0; i < 3; i++) o.x[i] = -o.x[i], (o.o[i] = o.y[i] * GROUND)
  turn(o.x, o.y, psi, o.x), turn(o.z, o.y, psi, o.z)
  return o
}
const pt = (f: F, x: number, y: number, z: number, o: V) => {
  for (let i = 0; i < 3; i++) o[i] = f.o[i] + (f.x[i] * x + f.y[i] * y + f.z[i] * z) * MM
  return o
}
// model `id`, whose units are u mm, its origin at world point O and its axes along ax, ay, az (right-handed; scaled,
// to stretch it); k and glow as solid()'s
const c: V = [0, 0, 0]
function put(id: string, O: ArrayLike<number>, ax: V, ay: V, az: V, u = 1, k = 1, glow = 0) {
  const m = ctx.models[id]
  if (!m) return
  const s = u * MM
  for (let i = 0; i < 3; i++) c[i] = O[i] + s * (ax[i] * (m.lo[0] + m.hi[0]) + ay[i] * (m.lo[1] + m.hi[1]) + az[i] * (m.lo[2] + m.hi[2])) / 2
  solid(id, c, ax, ay, az, s * Math.max(m.hi[0] - m.lo[0], m.hi[1] - m.lo[1], m.hi[2] - m.lo[2]), k, glow)
}
const MON = blank(), KB = blank(), TOW = blank(), REM = blank()
const AT0: V = [0, 0, 0] // the place's own look point
const MONX = 100, MONZ = -190, KBZ = 60, TOWX = -290, TOWZ = -20 - ZF, REMX = -170, REMZ = 250 // where each stands (the desk's middle on the place)
let built = -1
function build(k: number) {
  if (built === k) return
  built = k
  site(PLACES[k].lat, PLACES[k].lon, n), frame(n, e, No)
  ground(MONX, MONZ, 0, MON), ground(MONX, KBZ, 0, KB), ground(TOWX, TOWZ, 0, TOW)
  // the remote points at the port
  ground(REMX, REMZ, Math.atan2(TOWX + PX - REMX, TOWZ + ZF - REMZ), REM)
  for (let i = 0; i < 3; i++) AT0[i] = n[i] * (1.01 + RISE)
  // the close look's point, 14 mm out of the port and 6 up: where it truly is (the tower stands on the curve, leaning
  // 3° out from the place's own up), in the place's own frame
  pt(TOW, PX, PY + 6, ZF + 14, c)
  for (let i = 0; i < 3; i++) c[i] = (c[i] - AT0[i]) / MM
  CLOSE[3] = -(c[0] * e[0] + c[1] * e[1] + c[2] * e[2]), CLOSE[4] = c[0] * n[0] + c[1] * n[1] + c[2] * n[2], CLOSE[5] = c[0] * No[0] + c[1] * No[1] + c[2] * No[2]
  KEYS = [[0, ...WIDE], [0.2, ...WIDE], [1.5, ...CLOSE], [3.6, ...CLOSE], [5.2, ...WIDE], [12, ...WIDE]]
}

// ---- the beat: what happens, s seconds in; a visit's (the camera's), or the fly-past's, a second long -----------------
type Beat = { in0: number; in1: number; fire: number; out0: number; out1: number; end: number }
const VISIT: Beat = { in0: 1.6, in1: 3.2, fire: 5.6, out0: 9.4, out1: 10.8, end: 11.2 }
const PASS: Beat = { in0: 0, in1: 0.4, fire: 0.45, out0: 4, out1: 5, end: 5 }
let beat = VISIT, s = Infinity, B = -Infinity // the beat, how far in, and the planet time it began
let resting = false, passing = false
const OUT = 26 // mm PEEP stands out of the port, apart
// how far PEEP is out of the port, mm
const out = (q: number) => OUT * (1 - smooth(beat.in0, beat.in1, q) + smooth(beat.out0, beat.out1, q))
// the old text, fading as PEEP goes in; how many keys are down; the remote's light (0–1)
const old = (q: number) => (q < beat.fire ? 1 - smooth(beat.in0, beat.in1, q) : 0)
const typed = (q: number) => (q < beat.fire ? MACRO.length : clamp(Math.floor((q - beat.fire) / KEY) + 1, 0, MACRO.length))
function ir(q: number) {
  const u = (q - beat.fire) / IRSLOW, i = Math.floor(u / (BURST + GAP)), w = u - i * (BURST + GAP)
  if (i < 0 || i > 2) return 0
  const r = 0.0025 // a tenth of a burst to rise and fall, so nothing pops
  return smooth(-r, r, w) * (1 - smooth(BURST - r, BURST + r, w))
}

// ---- PEEP, and clicking it -------------------------------------------------------------------------------------------
// Its chips, in its own frame (KiCad's: x across, z from its USB edge at −4 mm to its back edge at +4, the parts on −y).
export const about: Record<string, About> = {
  peep: { name: 'PEEP', does: 'A USB keyboard 12.06 × 8 mm that sits inside a USB-A port, its board edge the plug. Any 38 kHz infrared burst starts its stored macro; it types it as ordinary key reports, 20 ms a key, ignores IR while it types, and re-arms after 250 ms of quiet.', board: 'peep.webp' },
  'peep-mcu': { name: 'STM32F042G6', does: 'A Cortex-M0 in a 4 × 4 mm UFQFPN28, running USB full speed with no crystal (it trims its clock to the host’s frames). TinyUSB makes it a keyboard; the firmware keeps to 24 KiB of flash and 4 KiB of RAM.' },
  'peep-ir': { name: 'VSOP38338', does: 'Vishay’s 38 kHz infrared receiver, 2 × 2 mm, at the back edge, looking out of the port. Its output falls when a carrier burst arrives; that falling edge starts the macro.' },
  'peep-pd': { name: 'VEMD10940F', does: 'A side-looking PIN photodiode, 3 × 2 mm, beside the receiver at the back edge.' },
  'peep-ldo': { name: 'TPS7A02', does: '3.3 V for the chip from the port’s 5 V, in a 1 × 1 mm X2SON.' },
  'peep-usb': { name: 'USB-A contacts', does: 'The board edge is the plug: four gold contacts on a 0.8 mm four-layer board, pressed to the port’s tongue by two 0 Ω 0805 resistors soldered on their sides as 1.25 mm spacers.' },
}
const CHIPS: [id: string, x: number, y: number, z: number, r: number][] = [
  ['peep-mcu', 1.5, -0.95, -1.28, 2.6],
  ['peep-ir', 1.5, -0.8, 2.63, 1.3],
  ['peep-pd', -2.59, -0.9, 2.33, 1.5],
  ['peep-ldo', -3.98, -0.6, -3.05, 0.8],
  ['peep-usb', -0.21, 0.45, -2, 3],
]
const mine = (id: string) => id === 'peep' || id.startsWith('peep-')
// What the world's music hears from here (sound.ts): n, how many events so far; f, the last one's pitch (Hz). Every key
// PEEP types (the note of its usage code, below) and every burst of the remote's (760 Hz: the 38 kHz carrier slowed 50×).
export const events = { n: 0, f: 0 }
let told = 0, flashed = 0
let lift = 0, vlift = 0, spin = 0 // how far PEEP has come up to the camera (a critically damped spring), and its turn
const P: V = [0, 0, 0], ax: V = [0, 0, 0], ay: V = [0, 0, 0], az: V = [0, 0, 0], q: V = [0, 0, 0], w: V = [0, 0, 0]
// PEEP in the port: across it (its x along the tower's −x), parts up (its y down), its USB edge in (its z out)
function peep(o: V) {
  // (its middle 3.5 mm inside the mouth when in, on the tongue's contacts; out, it comes down to the port's line)
  const f = out(s) / OUT, z = ZF - 7.5 + OUT * f, y = PY - 0.16 + 20 * f * f
  pt(TOW, PX, y, z, w)
  pt(TOW, PX, PY + 30, ZF + 45, P) // where it comes to, clicked: up and toward the camera
  const a = lift, arc = Math.sin(Math.PI * a) * 14 * MM
  for (let i = 0; i < 3; i++) (o[i] = mix(w[i], P[i], a) + TOW.y[i] * arc), (ax[i] = -TOW.x[i]), (ay[i] = -TOW.y[i]), (az[i] = TOW.z[i])
  turn(ay, ax, spin, ay), turn(az, ax, spin, az)
  return o
}

export function draw(k: number) {
  build(k)
  // the beat's clock: a visit starts one when the camera comes to rest here, the fly-past (planet time < 0, the
  // arrival's) when it comes to look; either lets one that is running finish first
  const dt = ctx.dt, here = ctx.focus === k, rest = here && ctx.since >= 0, past = here && ctx.since < 0 && ctx.t < 0
  if (rest && !resting && s >= beat.end) (beat = VISIT), (s = 0)
  if (past && !passing && s >= beat.end) (beat = PASS), (s = 0)
  ;(resting = rest), (passing = past), (s += dt), (B = ctx.t - s)
  // the keys gone down and the bursts fired, told as they happen (only while a beat runs)
  const keys = s < beat.end && s >= beat.fire ? typed(s) : 0, fired = s < beat.end ? clamp(Math.floor((s - beat.fire) / IRSLOW / (BURST + GAP)) + 1, 0, 3) : 0
  if (keys < told) told = 0
  if (fired < flashed) flashed = 0
  for (; flashed < fired; flashed++) events.n++, (events.f = 760)
  for (; told < keys; told++) events.n++, (events.f = NOTE[told])
  // clicked: up to the camera, turning over slowly, the pads and then the parts to it; let go, back, flat
  const want = here && mine(ctx.picked) ? 1 : 0, W = 3.2
  vlift += (W * W * (want - lift) - 2 * W * vlift) * dt
  lift = clamp(lift + vlift * dt, 0, 1)
  if (want) spin += 0.45 * dt
  else spin += (TAU * Math.round(spin / TAU) - spin) * (1 - Math.exp(-2.5 * dt))

  // the desk
  put('peep-monitor', MON.o, MON.x, MON.y, MON.z)
  put('peep-screen', MON.o, MON.x, MON.y, MON.z, 1, AR, G)
  put('peep-chrome', MON.o, MON.x, MON.y, MON.z, 1, AR, G)
  put('peep-keyboard', KB.o, KB.x, KB.y, KB.z)
  put('peep-tower', TOW.o, TOW.x, TOW.y, TOW.z)
  put('peep-led', pt(TOW, 55, PY - 13, ZF + 0.3, q), TOW.x, TOW.y, TOW.z, 1, 0, 14)
  for (let i = 0; i < 3; i++) (ax[i] = -REM.x[i]), (ay[i] = REM.z[i])
  put('peep-remote', REM.o, ax, ay, REM.y)
  const l = ir(s)
  if (l > 0.01) put('peep-ir', pt(REM, LED[0], LED[2], LED[1], q), REM.x, REM.y, REM.z, 1, 0, 4000 * l)
  // the screen: the old text fading, or the new as far as it is typed (the line being typed is covered past its last key
  // by a piece of the editor's ground); the caret after it
  const A = old(s), N = typed(s), fresh = s >= beat.fire
  for (let j = 0; j < lines.length; j++) {
    const L = lines[j], a = fresh ? +(N > L.from) : A, i = N - L.from
    if (a < 0.01) continue
    put(`peep-line-${j}`, MON.o, MON.x, MON.y, MON.z, 1, AR * a, G * a)
    if (!fresh || i >= L.ends.length) continue
    const x0 = L.ends[i - 1], x1 = L.ends[L.ends.length - 1] + 4
    for (let m = 0; m < 3; m++) (ax[m] = MON.x[m] * ((x1 - x0) / 100)), (ay[m] = MON.y[m] * (LEAD / 100)), (az[m] = MON.z[m] * 0.003)
    put('peep-blank', pt(MON, (x0 + x1) / 2, L.y + CAP / 2 - 1, -0.55, q), ax, ay, az, 1, AR, G)
  }
  const at = fresh ? N : A > 0.01 ? MACRO.length : 0
  let j = lines.length - 1
  while (j > 0 && lines[j].from > at) j--
  const L = lines[j], x = at > L.from ? L.ends[at - L.from - 1] : X0
  const blink = fresh && N < MACRO.length ? 1 : 0.5 + 0.5 * Math.cos(TAU * 1.06 * ctx.t) // (steady while it types)
  if (blink > 0.05) put('peep-caret', pt(MON, x + 2, L.y, 0, q), MON.x, MON.y, MON.z, 1, AR * blink, G * blink)
  // PEEP
  peep(q)
  put('peep', q, ax, ay, az, 1000)
  if (!here) return
  // clickable once it has typed; clicked, its chips too, those on the side turned to the camera
  if (s >= beat.fire + MACRO.length * KEY + 0.3 || lift > 0.05) reach('peep', q, 7.5)
  if (lift > 0.6)
    for (const [id, x, y, z, r] of CHIPS) {
      for (let i = 0; i < 3; i++) w[i] = q[i] + (ax[i] * x + ay[i] * y + az[i] * z) * MM
      if (Math.sign(y) * ((ctx.E[0] - q[0]) * ay[0] + (ctx.E[1] - q[1]) * ay[1] + (ctx.E[2] - q[2]) * ay[2]) > 0) reach(id, w, r)
    }
}
// A part a click can find (ctx.part): a ball, r mm, at c. A click finds only what is 0.02 radii or more from the eye
// (reality.project), and PEEP comes nearer than that, so a ball nearer is slid out along the eye's ray, grown as it goes:
// the same disc on the screen.
const far: V = [0, 0, 0]
function reach(id: string, c: V, r: number) {
  const E = ctx.E, D = Math.hypot(c[0] - E[0], c[1] - E[1], c[2] - E[2]), k = Math.max(1, 0.025 / D)
  for (let i = 0; i < 3; i++) far[i] = E[i] + (c[i] - E[i]) * k
  part(id, far, r * MM * k)
}

// ---- the camera, while it rests here: down to the port as PEEP goes in, back for the remote and the screen; to PEEP,
// clicked. Keys: [s, ln d, pitch, yaw, the point looked at (mm from the place's own: west, up, north)]
const WIDE = [Math.log(0.25), 0.36, -0.15, 0, 0, 0]
const CLOSE = [Math.log(0.012), 0.3, 0.65, 0, 0, 0] // (its point set where the port is: build())
let KEYS: number[][] = []
const cam = [0, 0, 0, 0, 0, 0]
export function steer(_since: number, _picked: string, o: Steer) {
  if (s >= VISIT.end && lift < 1e-3) return false
  glide(KEYS, beat === VISIT ? s : VISIT.end, cam)
  // and to PEEP, clicked: 50 mm off it, a little above, from the east-northeast
  const a = lift
  o.d = Math.exp(mix(cam[0], Math.log(0.009), a)), o.pitch = mix(cam[1], 0.22, a), o.yaw = mix(cam[2], 1.25, a)
  for (let i = 0; i < 3; i++) o.at[i] = mix((-e[i] * cam[3] + n[i] * cam[4] + No[i] * cam[5]) * MM, P[i] - AT0[i], a)
  return true
}

// ---- what it sounds like, on the beat's clock --------------------------------------------------------------------------
// Its key is its 38 kHz carrier brought down 25×, 1520 Hz: a soft tick as PEEP seats; the trigger, three soft notes an
// octave under that, in step with the bursts as they are shown; then a note for every key as it goes down, each report's
// usage code (as PEEP's hid_ascii sends it, US layout) a note of the pentatonic over 190 Hz (the carrier three octaves
// further down): the macro as a run.
function usage(ch: string) {
  const c = ch.charCodeAt(0)
  if (c >= 97 && c <= 122) return c - 93
  if (c >= 65 && c <= 90) return c - 61
  if (c >= 49 && c <= 57) return c - 19
  const p = ' -=[]\\;\'`,./'.indexOf(ch)
  return ch === '0' ? 0x27 : ch === ':' ? 0x33 : p >= 0 ? [0x2c, 0x2d, 0x2e, 0x2f, 0x30, 0x31, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38][p] : 0
}
const PENTA = [0, 2, 4, 7, 9], NOTE = [...MACRO].map((ch) => {
  const u = usage(ch)
  return 190 * 2 ** ((PENTA[u % 5] + 12 * (Math.floor(u / 5) % 2)) / 12)
})
const pluck = new Plucks(48000, 0.42)
let down = -1, burst = -1, seat = false
export function voice(t: number) {
  const q = t - B, i = Math.floor((q - beat.fire) / KEY), b = Math.floor((q - beat.fire) / IRSLOW / (BURST + GAP))
  if (i !== down) (down = i), i >= 0 && i < MACRO.length && pluck.strike(NOTE[i], 0.09, 0, 0.25, 1.6)
  if (b !== burst) (burst = b), b >= 0 && b < 3 && pluck.strike(760, 0.14, 0, 0.5, 0.8)
  const seated = q >= beat.in1 && q < beat.out0
  if (seated && !seat) pluck.strike(2280, 0.05, 0, 0.08, 4)
  seat = seated
  return pluck.mono()
}

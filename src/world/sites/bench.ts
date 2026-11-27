// The bench: PEEP doing its job, at true scale. A desk on the ground (a monitor, a keyboard, the computer, a small tower
// with two USB-A ports in its front) and PEEP, 12.06 × 8 mm, just out of a port; in front of the tower, River's trigger,
// an ESP32 and an IR emitter aimed at the port, and a phone showing the page the ESP32 serves. Arriving, the camera comes
// down to the tower's front and PEEP slides into the port, all of it but its back edge, as it sits in a real one; the
// camera draws back, fire is pressed on the phone, the emitter sends PEEP's trigger (three 9 ms bursts of 38 kHz
// infrared, 30 ms apart, violet as a camera's sensor sees infrared; shown ten times slow so the three can be counted) and
// the screen fills at the macro's own pace, a key every 20 ms (a press report, 10 ms, a release, 10 ms), in real time.
// Then PEEP comes out of the port again. Clicked, it comes out and up and turns over, and its chips are parts in turn.
// In the intro's fly-past the same in a second: it plugs in, it fires, it types.
import { TAU, clamp, glide, smooth } from '../../acts/scene'
import { Plucks } from '../../dsp/pluck'
import { ball, box, dome, make, pipe, quad, rounded, slab, text, tube, type Mat } from '../make'
import { ctx, frame, part, site, solid, turn, unit, type V } from '../ctx'
import { PLACES, type About, type Steer } from '../places'
import { faces } from '../../beam/font'

// What PEEP types: its own one line, ASCII only, as its hid_ascii can send (River may change it).
export const MACRO = 'PEEP: a 12.06 x 8 mm keystroke injector. Three 38 kHz IR bursts, and it types this.'
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
const wide = (t: string, size: number) => [...t].reduce((w, ch) => w + (faces.hershey.g[ch]?.[0] ?? 0.6), 0) * size
const MAXW = SW / 2 - 24 - X0, width = (t: string) => wide(t, CAP)
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

// Where each stands, mm from the place (x west, z north): the trigger in front of the tower, looking at the port.
const MONX = 100, MONZ = -190, KBZ = 60, TOWX = -290, TOWZ = -20 - ZF, RIGX = -330, RIGZ = 140, PHX = -190, PHZ = 200

// The trigger, as River's (PEEP's esp32-trigger): a Seeed XIAO ESP32-C6, 21 × 17.8 mm, wired on 3V3, GND and D1 to an
// Adafruit 5639 high-power IR emitter, which stands on a printed wedge aimed up at PEEP's port. The XIAO serves one
// button, fire, on the local Wi-Fi network; pressed, it sends three 9 ms bursts of 38 kHz, 30 ms apart. The rig's own
// axes: x across, y up, z toward the port. (The two boards' details are drawn from their sizes, not their CAD.)
const AIM = Math.atan2(PY - 24, Math.hypot(RIGX - TOWX - PX, RIGZ - TOWZ - ZF) - 10), WL = 17, WH = WL * Math.tan(AIM) // how far up it looks; the wedge
// a point of the emitter's own frame (x across, y off its face, z along it toward its LED, from the wedge slope's middle), in the rig's
const slope = (x: number, y: number, z: number): [number, number, number] => [x, WH / 2 + y * Math.cos(AIM) + z * Math.sin(AIM), WL / 2 - y * Math.sin(AIM) + z * Math.cos(AIM)]
const LED: [number, number, number] = [0, 4.1, 15.2]
make('peep-rig', () => {
  const pcb: Mat = { col: [0.02, 0.025, 0.03, 1], metal: 0, rough: 0.5 }, can: Mat = { col: [0.7, 0.7, 0.72, 1], metal: 1, rough: 0.3 }
  const print: Mat = { col: [0.5, 0.5, 0.52, 1], metal: 0, rough: 0.7 }
  // the XIAO, flat behind the wedge, its USB-C to the back: its board, its RF can, the receptacle, its castellated pads
  box(pcb, [-8.9, 0, -45], [8.9, 1, -24]), box(can, [-5.6, 1, -38], [5.6, 2.8, -26]), box(can, [-4.45, 1, -46.5], [4.45, 4.2, -39.2])
  for (const x of [-1, 1]) for (let i = 0; i < 7; i++) box(gold, [x * 8.9 - 0.7, 0, -43.3 + i * 2.54 - 0.6], [x * 8.9 + 0.7, 1.05, -43.3 + i * 2.54 + 0.6])
  // the wedge
  const a: [number, number, number] = [-10, 0, 0], b: [number, number, number] = [10, 0, 0], c: [number, number, number] = [10, 0, WL], d: [number, number, number] = [-10, 0, WL]
  const f: [number, number, number] = [10, WH, WL], g: [number, number, number] = [-10, WH, WL]
  quad(print, a, b, c, d, [0, -1, 0]), quad(print, d, c, f, g, [0, 0, 1]), quad(print, a, g, f, b, [0, Math.cos(AIM), -Math.sin(AIM)])
  quad(print, a, d, g, g, [-1, 0, 0]), quad(print, b, f, c, c, [1, 0, 0])
  // its wires: 3V3 (red) and GND (black) from one side of the XIAO, D1 (yellow) from the other, to the emitter's socket
  ;[[8.2, 2, [0.6, 0.05, 0.04, 1]], [8.2, 1, [0.02, 0.02, 0.02, 1]], [-8.2, 1, [0.8, 0.62, 0.06, 1]]].forEach(([x, i, col], k) => {
    const from: [number, number, number] = [x as number, 1.4, -43.3 + (i as number) * 2.54], to = slope(2 - 2 * k, 4.5, -10.5)
    pipe({ col: col as number[], metal: 0, rough: 0.6 }, [from, [from[0], 3.5, from[2] + 5], [(to[0] + from[0]) / 2, 5, (from[2] + to[2]) / 2], [to[0], to[1] - 1, to[2] - 4], to], 0.55, 8)
  })
})
make('peep-emitter', () => {
  const led: Mat = { col: [0.12, 0.09, 0.16, 1], metal: 0, rough: 0.08 }
  box(black, [-8.9, 0, -12.7], [8.9, 1.6, 12.7]) // the board, 17.8 × 25.4 mm
  box({ col: [0.85, 0.85, 0.82, 1], metal: 0, rough: 0.5 }, [-4, 1.6, -12.7], [4, 7.6, -7.5]) // its JST PH socket
  tube(led, [0, LED[1], 8], [0, 0, 1], 2.5, 2.5, 6.5, 24, true), dome(led, [0, LED[1], 14.5], [0, 0, 1], 2.5) // the 5 mm LED
})
// A phone by it, showing the XIAO's page (esp32-trigger's own): "peep.", the red fire button, and what came back. The
// page's own axes: x across, y up the screen, z out of it.
const PW = 71.5, PL = 147, PT = 7.8, SAID = ['ready', 'sending...', 'trigger sent.']
const centred = (m: Mat, t: string, y: number, size: number, w: number) => text(() => m, t, -wide(t, size) / 2, y, 0.05, size, w)
make('peep-phone', () => slab(graphite, rounded(PW, PL, 9), 0, PT))
make('peep-page', () => {
  box({ col: [0.004, 0.004, 0.005, 1], metal: 0, rough: 0.3 }, [-PW / 2 + 2.5, -PL / 2 + 3, -0.1], [PW / 2 - 2.5, PL / 2 - 3, 0])
  centred({ col: [0.85, 0.85, 0.85, 1], metal: 0, rough: 0.6 }, 'peep.', 44, 10, 1.4)
})
make('peep-fire', () => centred({ col: [1, 0.09, 0.07, 1], metal: 0, rough: 0.6 }, 'fire', -14, 22, 3))
SAID.forEach((t, i) => make(`peep-said-${i}`, () => centred({ col: [0.33, 0.33, 0.33, 1], metal: 0, rough: 0.6 }, t, -46, 3.4, 0.5)))
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
const MON = blank(), KB = blank(), TOW = blank(), RIG = blank(), PH = blank()
const AT0: V = [0, 0, 0] // the place's own look point
let built = -1
function build(k: number) {
  if (built === k) return
  built = k
  site(PLACES[k].lat, PLACES[k].lon, n), frame(n, e, No)
  ground(MONX, MONZ, 0, MON), ground(MONX, KBZ, 0, KB), ground(TOWX, TOWZ, 0, TOW)
  ground(RIGX, RIGZ, Math.atan2(TOWX + PX - RIGX, TOWZ + ZF - RIGZ), RIG), ground(PHX, PHZ, 0.35, PH)
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
let resting = false, passing = false, last = 0
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
  'peep-xiao': { name: 'XIAO ESP32-C6', does: 'PEEP’s trigger: Seeed’s 21 × 17.8 mm ESP32-C6 board serves one button, fire, on the local Wi-Fi network (peep-trigger.local). Pressed, it keys a 38 kHz carrier on D1 into three 9 ms bursts, 30 ms apart, then waits half a second before it will fire again.' },
  'peep-emitter': { name: 'Adafruit 5639', does: 'A high-power infrared LED emitter with its own driver, its input active-high: the XIAO’s 38 kHz bursts on D1 light it. It is aimed at PEEP’s side-facing detector, since the port’s shell can block the light.' },
  'peep-phone': { name: 'The trigger’s page', does: 'What the XIAO serves: “peep.”, one red button, fire, and a line saying what came back (“trigger sent.”). Anyone on the network can press it; there is no password, so it belongs on a trusted LAN.' },
}
const CHIPS: [id: string, x: number, y: number, z: number, r: number][] = [
  ['peep-mcu', 1.5, -0.95, -1.28, 2.9],
  ['peep-ir', 1.5, -0.8, 2.63, 1.5],
  ['peep-pd', -2.59, -0.9, 2.33, 1.8],
  ['peep-ldo', -3.98, -0.6, -3.05, 0.8],
  ['peep-usb', -0.21, 0.45, -2, 5],
]
const mine = (id: string) => id === 'peep' || CHIPS.some((c) => c[0] === id)
// What the world's music hears from here (sound.ts): n, how many events so far; f, the last one's pitch (Hz). Every key
// PEEP types (the note of its usage code, below) and every burst of the emitter's (760 Hz: the 38 kHz carrier slowed 50×).
export const events = { n: 0, f: 0 }
let told = 0, flashed = 0
let lift = 0, vlift = 0, spin = 0 // how far PEEP has come out, clicked (a critically damped spring), and its turn
const ax: V = [0, 0, 0], ay: V = [0, 0, 0], az: V = [0, 0, 0], q: V = [0, 0, 0], w: V = [0, 0, 0]
// PEEP in the port: across it (its x along the tower's −x), parts up (its y down), its USB edge in (its z out). Its middle
// is 3.5 mm inside the mouth when in, on the tongue's contacts; out, it comes down to the port's line; clicked, it comes
// 16 mm out of wherever it was, then 14 mm up, and turns over.
function peep(o: V) {
  const f = out(s) / OUT, z = ZF - 7.5 + OUT * f + 16 * smooth(0, 0.5, lift), y = PY - 0.16 + 20 * f * f + 14 * smooth(0.3, 1, lift)
  pt(TOW, PX, y, z, o)
  for (let i = 0; i < 3; i++) (ax[i] = -TOW.x[i]), (ay[i] = -TOW.y[i]), (az[i] = TOW.z[i])
  turn(ay, ax, spin, ay), turn(az, ax, spin, az)
  return o
}

export function draw(k: number) {
  build(k)
  // the beat's clock: a visit starts one when the camera comes to rest here, the fly-past (planet time < 0, the
  // arrival's) when it comes to look; either lets one that is running finish first
  const dt = ctx.dt, here = ctx.focus === k, rest = here && ctx.since >= 0, past = here && ctx.since < 0 && ctx.t < 0
  if (rest && !resting) (last = ctx.since), s >= beat.end && ((beat = VISIT), (s = 0))
  if (past && !passing && s >= beat.end) (beat = PASS), (s = 0)
  // (a visit's clock is the place's own, which waits while the visitor holds the camera or has a part picked)
  ;(s += rest ? Math.max(ctx.since - last, 0) : dt), (resting = rest), (passing = past), (last = ctx.since), (B = ctx.t - s)
  // the keys gone down and the bursts fired, told as they happen (only while a beat runs)
  const keys = s < beat.end && s >= beat.fire ? typed(s) : 0, fired = s < beat.end ? clamp(Math.floor((s - beat.fire) / IRSLOW / (BURST + GAP)) + 1, 0, 3) : 0
  if (keys < told) told = 0
  if (fired < flashed) flashed = 0
  for (; flashed < fired; flashed++) events.n++, (events.f = 760)
  for (; told < keys; told++) events.n++, (events.f = NOTE[told])
  // clicked: out and up, turning over slowly, the pads and then the parts to the light; let go, back, flat
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
  // the trigger, its emitter on the wedge's slope; and the phone, fire pressed a moment before the bursts, saying what came back
  put('peep-rig', RIG.o, RIG.x, RIG.y, RIG.z)
  const ca = Math.cos(AIM), sa = Math.sin(AIM), m0 = slope(0, 0, 0), l = ir(s)
  for (let i = 0; i < 3; i++) (ay[i] = RIG.y[i] * ca - RIG.z[i] * sa), (az[i] = RIG.y[i] * sa + RIG.z[i] * ca)
  put('peep-emitter', pt(RIG, m0[0], m0[1], m0[2], q), RIG.x, ay, az)
  const led = slope(LED[0], LED[1], LED[2])
  if (l > 0.01) put('peep-ir', pt(RIG, led[0], led[1], led[2], q), RIG.x, RIG.y, RIG.z, 1, 0, 4000 * l)
  put('peep-phone', PH.o, PH.x, PH.y, PH.z)
  const press = smooth(beat.fire - 0.75, beat.fire - 0.6, s) * (1 - smooth(beat.fire - 0.35, beat.fire - 0.15, s))
  const said = s < beat.fire - 0.6 ? 0 : s < beat.fire + 3 * IRSLOW * (BURST + GAP) ? 1 : 2
  for (let i = 0; i < 3; i++) ay[i] = -PH.z[i]
  pt(PH, 0, PT, 0, q)
  put('peep-page', q, PH.x, ay, PH.y, 1, AR, G), put('peep-fire', q, PH.x, ay, PH.y, 1, AR, G * (1 + 2 * press)), put(`peep-said-${said}`, q, PH.x, ay, PH.y, 1, AR, G)
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
  // what a click can find, each a ball about half its size across: PEEP; clicked, its chips too, those on the side turned
  // to the camera; the trigger's two boards and the phone
  part('peep', q, 6.5 * MM)
  if (lift > 0.6)
    for (const [id, x, y, z, r] of CHIPS) {
      for (let i = 0; i < 3; i++) w[i] = q[i] + (ax[i] * x + ay[i] * y + az[i] * z) * MM
      if (Math.sign(y) * ((ctx.E[0] - q[0]) * ay[0] + (ctx.E[1] - q[1]) * ay[1] + (ctx.E[2] - q[2]) * ay[2]) > 0) part(id, w, r * MM)
    }
  part('peep-xiao', pt(RIG, 0, 1, -35, w), 11 * MM)
  const em = slope(0, 2, 0)
  part('peep-emitter', pt(RIG, em[0], em[1], em[2], w), 14 * MM)
  part('peep-phone', pt(PH, 0, PT / 2, 0, w), 75 * MM)
}

// ---- the camera, while it rests here: down to the port as PEEP goes in, back for the trigger and the screen. Keys: [s, ln d, pitch, yaw, the point looked at (mm from the place's own: west, up, north)]
const WIDE = [Math.log(0.25), 0.36, -0.15, 0, 0, 0]
const CLOSE = [Math.log(0.012), 0.3, 0.65, 0, 0, 0] // (its point set where the port is: build())
let KEYS: number[][] = []
const cam = [0, 0, 0, 0, 0, 0]
export function steer(_since: number, _picked: string, o: Steer) {
  if (s >= VISIT.end) return false
  glide(KEYS, beat === VISIT ? s : VISIT.end, cam)
  o.d = Math.exp(cam[0]), o.pitch = cam[1], o.yaw = cam[2]
  for (let i = 0; i < 3; i++) o.at[i] = (-e[i] * cam[3] + n[i] * cam[4] + No[i] * cam[5]) * MM
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

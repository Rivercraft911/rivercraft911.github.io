// esp-dvbs2 on its bench, as River ran the live video (examples/live-video): two fisheye cameras on a CM5 clock an
// MPEG transport stream over SPI into one ESP32-S3, which sends it as DVB-S2 out of its own Wi-Fi radio at 2420 MHz;
// coax and 30 dB of attenuation carry it to a second S3, which demodulates and decodes every frame on the chip and
// sends the stream out of a W5500 to a screen. Both S3s are Seeed XIAOs (21 × 17.8 mm), made here as they are. The
// bench stands across the valley's pool, the coax over the water: the transmitter by the camera on the north rim, the
// receiver, its W5500 and the screen on the south.
//
// The signal. 8PSK 3/4 in short FECFRAMEs with pilots (MODCOD 14, 5598 symbols a frame), as the live run sent it,
// from dsp/dvbs2.ts. Each symbol is a bead of light riding the coax from one U.FL to the other, set round the cable at
// its own phase and amplitude, so the cable carries its I/Q: data in the place's blue, a header's π/2-BPSK gold, a pilot
// white. 12 symbols a second, 400 000× slow.
// The receiver. It finds a frame by its header, so each visit comes as one goes into it. Until it has the whole header,
// what it makes of the signal is turned and smeared: its carrier not yet found, its timing half a symbol off, so the
// raised-cosine pulses of the neighbours fall in. Then both settle in a third of a second and its points sit on the
// eight, as the real one's do at the live run's 25.5 dB MER (the beads past the attenuator are the receiver's view);
// and the picture comes up on its screen: both fisheye streams, as received (public/media/esp-dvbs2/live.jpg, 64 × 30
// in 16 colours).
import { clamp, hash } from '../../acts/scene'
import { Frames, rc, rings } from '../../dsp/dvbs2'
import { ball, box, dome, make, pipe, tube } from '../make'
import { ctx, cross, frame, part, site, solid, unit, type V } from '../ctx'
import { PLACES, type About } from '../places'

type V3 = [number, number, number]
const MM = 5.5e-4 // radii a millimetre
// the pool's middle, from the place's own point (the river's middle), radii east and north (planet.wgsl's POOL)
const POOL = [0.33 / 400, 5.74 / 400]

// ---- what stands there, in millimetres -----------------------------------------------------------------------------
const mat = (r: number, g: number, b: number, metal = 0, rough = 0.5, a = 1) => ({ col: [r, g, b, a], metal, rough })
const MASK = mat(0.015, 0.015, 0.018, 0, 0.45), GOLD = mat(1, 0.78, 0.34, 1, 0.3), TIN = mat(0.8, 0.8, 0.82, 1, 0.42)
const BLACK = mat(0.02, 0.02, 0.022, 0, 0.5), WHITE = mat(0.85, 0.85, 0.83, 0, 0.6), GLASS = mat(0.015, 0.02, 0.03, 0, 0.05)
const DUPONT = [mat(0.6, 0.05, 0.03), mat(0.9, 0.5, 0.05), mat(0.85, 0.75, 0.1), mat(0.08, 0.45, 0.12), mat(0.06, 0.2, 0.7), mat(0.4, 0.1, 0.5)]

// The XIAO ESP32-S3: x along it (its USB-C at +x), y up from its underside, z across; seven castellated pads down
// each side, the wires soldered to them. Its RF can is apart from it (`xiao-can`), and under the can the S3 and its
// crystal.
make('xiao', () => {
  box(MASK, [-10.5, 0, -8.9], [10.5, 1.2, 8.9])
  for (const s of [-1, 1])
    for (let i = 0; i < 7; i++) {
      box(GOLD, [-7.62 + 2.54 * i - 0.75, 0, s * 8.9 - 1.3 * (s + 1) / 2], [-7.62 + 2.54 * i + 0.75, 1.24, s * 8.9 + 1.3 * (1 - s) / 2])
      box(mat(0.8, 0.8, 0.78), [-7.62 + 2.54 * i - 0.5, 1.2, s * 6.6 - 0.3], [-7.62 + 2.54 * i + 0.5, 1.23, s * 6.6 + 0.3]) // its label
    }
  box(mat(0.03, 0.03, 0.035, 0, 0.35), [-6.8, 1.2, -4.1], [0.2, 2.1, 2.9]) // ESP32-S3R8, 7 mm square
  box(TIN, [-9.4, 1.2, 3.4], [-7.4, 1.9, 5.0]) // its 40 MHz crystal
  for (let i = 0; i < 6; i++) box(mat(0.55, 0.45, 0.3), [1 + 0.4 * (i % 2), 1.2, -4 + 1.3 * i], [1.6 + 0.4 * (i % 2), 1.7, -3.5 + 1.3 * i])
  box(GOLD, [-10.3, 1.2, -6.4], [-7.3, 1.6, -3.4]) // the U.FL, at the corner
  tube(TIN, [-8.8, 1.6, -4.9], [0, 1, 0], 1, 1, 0.85, 16)
  box(TIN, [5.8, 1.2, -4.47], [11.8, 4.4, 4.47]) // USB-C
  box(BLACK, [11.75, 1.9, -3.6], [11.85, 3.7, 3.6])
  for (const s of [-1, 1]) box(mat(0.7, 0.7, 0.7), [3.2, 1.2, s * 5.2 - 1], [5, 2, s * 5.2 + 1]) // BOOT, RESET
})
make('xiao-can', () => box(TIN, [-9.6, 0, -3], [3.6, 2.2, 6.2]))
// The 360 camera, as River's photo labels it: a white body on a white box, a 200° fisheye either side (sizes assumed).
// With an eye either side of its head it is a bird already, so it has a pigeon's beak, a 13 mm one, a pigeon's own
// length, dark, looking at the transmitter it feeds: Pigeon Vision's camera, before it flew.
make('cam360', () => {
  box(WHITE, [-30, 0, -18], [30, 30, 18])
  tube(WHITE, [0, 30, 0], [0, 1, 0], 25, 25, 56, 48, true)
  for (const s of [-1, 1]) {
    tube(BLACK, [s * 23, 64, 0], [s, 0, 0], 9, 8.5, 7, 32)
    dome(GLASS, [s * 29.5, 64, 0], [s, 0, 0], 7.5, 24)
  }
  tube(mat(0.06, 0.06, 0.07, 0, 0.4), [0, 57, 24], [0, 0, 1], 5, 0.6, 13, 24, true) // the beak
  box(BLACK, [-12, 6, 18], [12, 12, 18.6]) // where the SPI comes out
})
// The W5500 module: its RJ45 at +x, a 2 × 5 header at −x (sizes assumed).
make('w5500', () => {
  box(mat(0.03, 0.2, 0.09, 0, 0.45), [-19, 0, -14], [19, 1.6, 14])
  box(TIN, [5, 1.6, -8], [21, 15, 8])
  box(BLACK, [20.9, 3, -6], [21.1, 12, 6])
  box(mat(0.03, 0.03, 0.035, 0, 0.35), [-11, 1.6, -3.5], [-4, 2.9, 3.5]) // the W5500, LQFP-48
  box(TIN, [-2.5, 1.6, -9], [1.5, 4.6, -7]) // 25 MHz
  box(BLACK, [-18.6, 1.6, -6.35], [-13.5, 4.1, 6.35])
  for (const x of [-17.3, -14.76]) for (let j = 0; j < 5; j++) box(GOLD, [x - 0.32, 0.6, -5.08 + 2.54 * j - 0.32], [x + 0.32, 10.1, -5.08 + 2.54 * j + 0.32])
})
// A small screen (4.3", 105 × 67 mm, its picture 95 × 54), facing −x, on a stand.
const SW = 95, SH = 54, SY = 49.5 // the picture, and its middle's height
make('screen', () => {
  box(BLACK, [-3, 16, -52.5], [3, 83, 52.5])
  box(GLASS, [-3.1, SY - SH / 2, -SW / 2], [-3, SY + SH / 2, SW / 2])
  box(BLACK, [3, 30, -8], [9, 70, 8])
  box(BLACK, [-22, 0, -28], [22, 4, 28])
  box(BLACK, [2, 4, -6], [10, 30, 6])
})
// What it shows: the mosaic, a run of one colour a box, in front of the glass.
const PAL = [[0.007, 0.01, 0.009], [0.296, 0.381, 0.323], [0.631, 0.761, 0.672], [0.098, 0.13, 0.102], [0.171, 0.242, 0.191], [0.445, 0.552, 0.479], [0.031, 0.06, 0.038], [0.479, 0.617, 0.558], [0.188, 0.279, 0.235], [0.034, 0.078, 0.067], [0.058, 0.065, 0.034], [0.246, 0.25, 0.191], [0.223, 0.171, 0.136], [0.026, 0.044, 0.056], [0.533, 0.552, 0.503], [0.054, 0.048, 0.024]]
const PIC = [
  '00000000000000000000000000000000000000000000000000000000000000000000000000009999dd0000000000000000000000000000000000000000000000',
  '00000060a411511522227133900000000000000031411111111111bcb30ad0000000000311884881172711130300000000000003111111111111b3b111303d00',
  '000000313311111111177111309000000000603111111111111bc11111b3030000000308c111111111141184130300000006034448111111111c111111113a30',
  '00003001c311175111111888443030000000a1348111111111311111111130a00006003c3ccc111e711111844333a90000604348411111111b1111111e213306',
  '00000003b1111111111111111133f30000a3444481111111b111111112254300000000003111111111b1111111343a0009631844111111111111111111513330',
  '0000000031111111111111111148306006a1181575557171251111111111496000000000355255551111111171484a6000355531272131111711111111133330',
  '00000009122221221351111b4115530000631111122251113344111b111333300000000883122222431220000611130000033000372221413333633043300330',
  '06000009003111223d95530000003300000300063175133811330030313003b60143000000000011909993300000300000633000317133338113118938300030',
  '00000000000000330069393603333000000600001727251111722280008333000003000000000051190390063333300000000042222222222772222584711840',
  '00031333122222222136000003000000000931222222222222227772227111300003151122222222222213003430000000032222222222222227551111271130',
  '03112112222222222222225111116000006652222222222222222227181011000011112222222222222222222222300000003222222222222222227963933300',
  '0032522222222222222222222225000000090122222222222222219660693060000122222222222222222222222300000000a012222222222222246000630600',
  '000a52222222222222222222221060000000da01222222222222228006300000000035722222222222222222210a000000000da0172752222715511133000000',
  '00060315222222222222222210a000000000000a0315771111111118306000000000006811111111111111130000000000000000600334448444433000000000',
  '00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000',
].join('')
const PW = 64, PH = 30, CELL = SW / PW
make('picture', () => {
  const m = PAL.map((c) => mat(c[0], c[1], c[2], 0, 1))
  for (let y = 0; y < PH; y++)
    for (let x = 0; x < PW; ) {
      const c = PIC[y * PW + x]
      let e = x
      while (e < PW && PIC[y * PW + e] === c) e++
      const y0 = SY + (PH / 2 - y - 1) * CELL
      box(m[parseInt(c, 16)], [-3.3, y0, x * CELL - SW / 2], [-3.2, y0 + CELL, e * CELL - SW / 2])
      x = e
    }
})

// ---- the bench, in millimetres from the pool's middle at the water: x east, y up, z north -------------------------
// Where each thing stands, the ground under it (the pool's banks there, as planet.wgsl raises them: found by looking),
// and its turn (its own x along bench (cos, ·, sin) of the angle from east, its y up).
const TX = [0, 1.5, 95, Math.PI / 2], RX = [0, 2, -102, Math.PI / 2], CAM = [50, 1.5, 98, -Math.PI / 2], ETH = [36, 2.5, -102, -Math.PI / 2], SCR = [6, 4, -190, -0.9]
// a model's point, from its own millimetres to the bench's
const at = (p: number[], x: number, y: number, z: number): V3 => {
  const c = Math.cos(p[3]), s = Math.sin(p[3])
  return [p[0] + x * c + z * s, p[1] + y, p[2] + x * s - z * c]
}
// The link, at true size, every joint mated. At each S3's U.FL a plug and a pigtail of 1.13 mm micro-coax, straight off
// the board into an SMA jack, heat-shrunk at its back; the transmitter's jack takes a jumper of RG316 (2.5 mm, its FEP
// jacket tan), an SMA plug at each end (a hex nut 8 mm across flats screwed over the jack's thread, its body, a crimp
// ferrule and heat-shrink for strain relief), which bends away, crosses the pool hanging under its own weight and comes
// ashore into the 30 dB attenuator, an SMA jack-to-plug barrel, its gold body banded, whose plug is screwed onto the
// receiver's jack, its pigtail straight into the receiver's U.FL. The connectors lie along the banks, east–west, in
// line with each S3's U.FL; the jumper bends round to them (Catmull–Rom through the points it passes).
const UTX = at(TX, -8.8, 2.4, -4.9), URX = at(RX, -8.8, 2.4, -4.9), HEX = 8 / Math.sqrt(3) // the U.FLs; an SMA nut's corner radius
const YN = TX[1] + HEX, YS = RX[1] + HEX, ZN = UTX[2], ZS = URX[2] // the north and south runs: their height and line
const spline = (q: V3[], n = 6): V3[] => {
  const out: V3[] = [q[0]]
  for (let i = 0; i + 1 < q.length; i++) {
    const a = q[Math.max(i - 1, 0)], b = q[i], c = q[i + 1], d = q[Math.min(i + 2, q.length - 1)]
    for (let k = 1; k <= n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t
      out.push([0, 1, 2].map((j) => 0.5 * (2 * b[j] + (c[j] - a[j]) * t + (2 * a[j] - 5 * b[j] + 4 * c[j] - d[j]) * t2 + (3 * b[j] - a[j] - 3 * c[j] + d[j]) * t3)) as V3)
    }
  }
  return out
}
const RG316 = mat(0.55, 0.36, 0.22, 0, 0.45), NICKEL = mat(0.75, 0.75, 0.74, 1, 0.3), BAND = mat(0.05, 0.05, 0.06, 0, 0.5)
// connector pieces along x, from x0, s the way (+1 east, −1 west): [r at start, r at end, length, sides, finish]
type Piece = [number, number, number, number, ReturnType<typeof mat>]
const JACK: Piece[] = [[1.5, 1.5, 12, 16, BLACK], [2, 2, 5, 16, GOLD], [HEX, HEX, 3, 6, GOLD], [3.15, 3.15, 6, 24, GOLD]] // back to front (26 mm)
const PLUG: Piece[] = [[HEX, HEX, 7, 6, NICKEL], [3, 3, 3, 24, GOLD], [2.2, 2.2, 5, 16, GOLD], [1.8, 1.45, 14, 16, BLACK]] // front to back (29)
const ATTEN: Piece[] = [[3.15, 3.15, 6, 24, GOLD], [4.3, 4.3, 5, 32, GOLD], [4.34, 4.34, 4, 32, BAND], [4.3, 4.3, 7, 32, GOLD], [HEX, HEX, 3, 6, GOLD], [HEX, HEX, 7, 6, NICKEL]] // (32)
const run = (x: number, y: number, z: number, s: number, ps: Piece[]) => {
  for (const [r0, r1, l, n, m] of ps) tube(m, [x, y, z], [s, 0, 0], r0, r1, l, n, true), (x += s * l)
  return x
}
const flip = (ps: Piece[]) => ps.map(([r0, r1, l, n, m]): Piece => [r1, r0, l, n, m]).reverse()
// A plug's nut goes 5 mm over its jack's 6 mm thread. The north run, west from the transmitter's jack's back: the jack,
// the jumper's plug on it. The south run, east from where the jumper comes ashore: its other plug, the attenuator (its
// jack's thread under that nut), the receiver's jack (its thread under the attenuator's plug nut).
const OVER = 5, N0 = -12, N1 = N0 - 26 + OVER, NE = N1 - 29, S0 = -90, S1 = S0 + 29 - OVER, S2 = S1 + 32 - OVER, SE = S2 + 26
const PIG_N = spline([[UTX[0], UTX[1] + 0.8, ZN], [-7.5, 5.3, ZN], [-10, 6, ZN], [N0 - 2, YN, ZN]]) // (it ends 2 mm into the jack's shrink)
// (no bend in it tighter than RG316's 12.5 mm, five times its width)
const SPAN = spline([[NE + 2, YN, ZN], [NE - 6, YN - 0.3, ZN], [-76, 5, 83], [-84, 4, 72], [-84, 3.4, 58], [-70.5, 2.7, 41.5], [-56.6, 2.2, 21.6], [-50, 2, -8], [-56.6, 2.2, -37.6], [-70.5, 2.7, -57.5], [-88, 3.4, -70], [-104, 4, -80], [-114, 4.6, -92], [-115, 5, -103], [-108, YS - 0.4, -110], [-98, YS, ZS], [S0 + 2, YS, ZS]], 6)
const PIG_S = spline([[SE - 2, YS, ZS], [SE + 1.5, YS - 0.2, ZS], [-8.5, 5.9, ZS], [-6.4, 5.3, ZS], [URX[0], URX[1] + 0.8, ZS]]) // (it starts 2 mm into the jack's shrink)
// the beads' way, and where it is hidden in a connector
const WAY: V3[] = [...PIG_N, [NE, YN, ZN], ...SPAN.slice(1, -1), [S0, YS, ZS], [SE, YS, ZS], ...PIG_S.slice(1)]
const HIDE = [PIG_N.length - 1, PIG_N.length, PIG_N.length + SPAN.length - 1, PIG_N.length + SPAN.length] // [from, to) a vertex range twice
make('coax', () => {
  pipe(BLACK, PIG_N, 0.57, 8), pipe(BLACK, PIG_S, 0.57, 8) // the pigtails
  pipe(RG316, SPAN, 1.25, 12)
  for (const u of [UTX, URX]) tube(NICKEL, [u[0], u[1], u[2]], [0, 1, 0], 1, 1, 1.25, 16, true) // the U.FL plugs on their jacks
  run(N0, YN, ZN, -1, JACK), run(N1, YN, ZN, -1, PLUG)
  run(S0, YS, ZS, 1, flip(PLUG)), run(S1, YS, ZS, 1, ATTEN), run(S2, YS, ZS, 1, flip(JACK))
})
// The jumpers: SPI from the camera to the transmitter (SCK, CS, MOSI, READY, GND), and from the receiver to the W5500
// (SCLK, MOSI, MISO, CS, 3V3, GND); Ethernet on to the screen.
const jumper = (a: V3, b: V3, rise: number): V3[] => {
  const p: V3[] = []
  for (let i = 0; i <= 12; i++) {
    const s = i / 12
    p.push([a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s + rise * 4 * s * (1 - s), a[2] + (b[2] - a[2]) * s])
  }
  return p
}
make('jumpers', () => {
  for (let i = 0; i < 5; i++) pipe(DUPONT[i], jumper(at(TX, -7.62 + 2.54 * i, 1.3, 9.2), at(CAM, 8 - 4 * i, 9, 19), 6), 0.45, 6)
  for (let i = 0; i < 6; i++) {
    const hp = at(ETH, -17.3 + 2.54 * (i & 1), 0, -5.08 + 2.54 * (i >> 1)), ht: V3 = [hp[0], hp[1] + 6.6, hp[2]]
    box(BLACK, [ht[0] - 1.27, ht[1] - 2, ht[2] - 1.27], [ht[0] + 1.27, ht[1] + 12, ht[2] + 1.27])
    pipe(DUPONT[i], jumper(at(RX, -7.62 + 2.54 * i, 1.3, 9.2), [ht[0], ht[1] + 12, ht[2]], 8 + 1.5 * i), 0.45, 6)
  }
  const jack = at(ETH, 21, 8, 0), back = at(SCR, 9, 40, 0), g = ETH[1] + 2.7
  pipe(mat(0.08, 0.25, 0.75, 0, 0.45), [jack, [jack[0], jack[1] - 1, jack[2] - 8], [jack[0] - 1, g, jack[2] - 22], [back[0] + 22, g, back[2] + 8], [back[0] + 12, g + 8, back[2] + 2], [back[0] + 6, back[1] - 12, back[2]], back], 2.7, 12)
})
// A bead of light, a symbol: data, a header's, a pilot's.
const BEAD = 0.55, RING = 2.6 // mm: a bead's radius, and the ring the constellation is set on round the cable
const KINDS = ['bead-h', 'bead-p', 'bead-d']
make('bead-h', () => ball(mat(1, 0.72, 0.3), [0, 0, 0], BEAD, 10))
make('bead-p', () => ball(mat(1, 1, 1), [0, 0, 0], BEAD, 10))
make('bead-d', () => ball(mat(0.5, 0.78, 1), [0, 0, 0], BEAD, 10))

// ---- the path's length, and its frame along it (a symbol's I across it and level, its Q over it) ------------------
const PATH = WAY, NP = PATH.length, LEN = new Float64Array(NP), SIDE: V3[] = [], LIFT: V3[] = []
for (let i = 0; i < NP; i++) {
  const a = PATH[Math.max(i - 1, 0)], b = PATH[Math.min(i + 1, NP - 1)], t = unit([b[0] - a[0], b[1] - a[1], b[2] - a[2]])
  const s = unit(cross(t, [0, 1, 0])), u = cross(s, t)
  SIDE.push(s as V3), LIFT.push(u as V3)
  if (i) LEN[i] = LEN[i - 1] + Math.hypot(PATH[i][0] - PATH[i - 1][0], PATH[i][1] - PATH[i - 1][1], PATH[i][2] - PATH[i - 1][2])
}
// the beads are hidden in the connectors' runs; past the attenuator's plug they are the receiver's own
const L = LEN[NP - 1], IN = [LEN[HIDE[0]], LEN[HIDE[1]], LEN[HIDE[2]], LEN[HIDE[3]]], FROM_ATT = IN[2] + (S2 + OVER - S0)

// ---- the signal ----------------------------------------------------------------------------------------------------
const PSK8 = rings('8PSK', '3/4', 14, [[8, 1, 0]])
const tx = new Frames(1, () => PSK8)
const FRAME = Frames.len(PSK8) // symbols a frame
const RS = 6, SPEED = 36, GAP = SPEED / RS // symbols a second here; mm a second along the cable; mm between them
const LOCK = 0.4 // seconds into a visit the receiver has the whole header
const s0 = { i: 0, q: 0 }, s1 = { i: 0, q: 0 }

// ---- the parts and how they move -----------------------------------------------------------------------------------
type F = { x: number; v: number }
const follow = (f: F, goal: number, w: number, dt: number) => ((f.v += (w * w * (goal - f.x) - 2 * w * f.v) * dt), (f.x += f.v * dt))
const apart: F = { x: 0, v: 0 }, shown: F = { x: 0, v: 0 }, held = { tx: { x: 0, v: 0 }, rx: { x: 0, v: 0 } } as Record<string, F>
let start = 0, was = false, framed = 0
// Each frame the receiver finds (as the last of its header comes in), for the music (sound.ts): how many there have
// been, and a pitch from its MODCOD, a semitone a step from 240 Hz at the bench's 14 (valley.ts's tonic).
export const events = { n: 0, f: 0 }

const n: V = [0, 0, 0], E: V = [0, 0, 0], N: V = [0, 0, 0], O: V = [0, 0, 0], w: V = [0, 0, 0], c: V = [0, 0, 0]
const ax: V = [0, 0, 0], ay: V = [0, 0, 0], az: V = [0, 0, 0]
// bench point to the world: the bench is the pool's tangent plane (its heights are the rim's under each thing)
function world(x: number, y: number, z: number, o: V) {
  for (let i = 0; i < 3; i++) o[i] = O[i] * (1 + y * MM) + (E[i] * x + N[i] * z) * MM
  return o
}
// model `id` with its origin at bench point (x, y, z) and its axes along a, b, cc
function put(id: string, x: number, y: number, z: number, a: V, b: V, cc: V, k = 1, glow = 0) {
  const m = ctx.models[id]
  if (!m) return false
  world(x, y, z, w)
  const mx = (m.lo[0] + m.hi[0]) / 2, my = (m.lo[1] + m.hi[1]) / 2, mz = (m.lo[2] + m.hi[2]) / 2
  for (let i = 0; i < 3; i++) w[i] += (a[i] * mx + b[i] * my + cc[i] * mz) * MM
  return solid(id, w, a, b, cc, Math.max(m.hi[0] - m.lo[0], m.hi[1] - m.lo[1], m.hi[2] - m.lo[2]) * MM, k, glow)
}
// axes for a thing turned th from east about the vertical
function turned(th: number) {
  const cs = Math.cos(th), sn = Math.sin(th)
  for (let i = 0; i < 3; i++) (ax[i] = E[i] * cs + N[i] * sn), (ay[i] = O[i]), (az[i] = E[i] * sn - N[i] * cs)
}

// A XIAO (`id`, its place p): it stays where it is, wired and plugged in; when apart, or picked, its can lifts off the S3.
function board(id: string, p: number[], dt: number, here: boolean) {
  const f = held[id], a = Math.max(apart.x, f.x)
  follow(f, here && ctx.picked === id ? 1 : 0, 2.6, dt)
  const y = p[1]
  turned(p[3])
  world(p[0], y, p[2], c)
  put('xiao', p[0], y, p[2], ax, ay, az)
  // the can, over the S3 (its middle 3 mm toward the U.FL end, 1.6 to the side)
  const lift = 1.2 + 12 * a
  for (let i = 0; i < 3; i++) w[i] = c[i] + (ay[i] * lift + ax[i] * -3 + az[i] * 1.6) * MM
  const m = ctx.models['xiao-can']
  if (m) {
    for (let i = 0; i < 3; i++) w[i] += ay[i] * 1.1 * MM
    solid('xiao-can', w, ax, ay, az, 13.2 * MM)
  }
  if (here) (c[0] += ay[0] * MM), (c[1] += ay[1] * MM), (c[2] += ay[2] * MM), part(id, c, 11 * MM)
}

let ready = false
export function draw(k: number) {
  if (!ready) {
    site(PLACES[k].lat, PLACES[k].lon, n), frame(n, E, N)
    for (let i = 0; i < 3; i++) O[i] = n[i] + E[i] * POOL[0] + N[i] * POOL[1]
    unit(O), frame(O, E, N)
    ready = true
  }
  // It runs while it is looked at, or the eye is near (the arrival sweeps past it before and after its turn).
  const dt = ctx.dt, here = ctx.focus === k, t = ctx.t
  const live = here || Math.hypot(O[0] - ctx.E[0], O[1] - ctx.E[1], O[2] - ctx.E[2]) < 0.5
  if (live !== was) (was = live), live && ((start = t), (framed = 0))
  follow(apart, here && ctx.since > 3 ? 1 : 0, 2.2, dt)
  follow(shown, live ? 1 : 0, 3, dt)

  // what stands
  board('tx', TX, dt, here), board('rx', RX, dt, here)
  turned(CAM[3]), put('cam360', CAM[0], CAM[1], CAM[2], ax, ay, az)
  turned(ETH[3]), put('w5500', ETH[0], ETH[1], ETH[2], ax, ay, az)
  turned(SCR[3]), put('screen', SCR[0], SCR[1], SCR[2], ax, ay, az)
  put('coax', 0, 0, 0, E, O, N), put('jumpers', 0, 0, 0, E, O, N) // (made in the bench's own millimetres)
  if (here) {
    world(CAM[0], CAM[1] + 43, CAM[2], c), part('camera', c, 43 * MM)
    world(S1 + 16, YS, ZS, c), part('coax', c, 16 * MM)
    world(ETH[0], ETH[1] + 5, ETH[2], c), part('w5500', c, 19 * MM)
    world(SCR[0], SCR[1] + SY, SCR[2], c), part('screen', c, 52 * MM)
  }
  const f = shown.x
  if (f < 0.01) return

  // the signal. The symbol leaving the transmitter now; each visit comes as a frame's header goes into the receiver,
  // and the receiver locks as the last of it arrives (it has the start of frame and the PLS code: the MODCOD).
  const u = (t - start) * RS, k0 = Math.floor(u), first = FRAME + 89 + Math.round((L / SPEED - LOCK) * RS)
  const sync = t - start - LOCK, settle = sync < 0 ? 1 : Math.exp(-sync / 0.3)
  const found = Math.floor((first + u - L / GAP - 89) / FRAME) // the frames whose headers the receiver has whole
  if (live && found > framed) (framed = found), (events.f = 240 * 2 ** ((PSK8.modcod - 14) / 12)), events.n++
  const phase = sync < 0 ? 0.8 * (t - start) : 0.8 * LOCK * settle, tau = 0.5 * settle
  for (let j = 0; ; j++) {
    const s = (u - k0 + j) * GAP // how far along the cable symbol k0 − j has come
    if (s > L) break
    if ((s > IN[0] && s < IN[1]) || (s > IN[2] && s < IN[3])) continue // in a connector
    const sym = first + k0 - j, kind = tx.sym(sym, s0)
    // past the attenuator: the receiver's own view of it, its carrier and timing as found so far, and its noise
    let I = s0.i, Q = s0.q
    if (s > FROM_ATT) {
      let ri = 0, rq = 0
      for (let m = -4; m <= 4; m++) {
        const g = rc(m + tau)
        if (g === 0) continue
        tx.sym(sym - m, s1), (ri += g * s1.i), (rq += g * s1.q)
      }
      const cs = Math.cos(phase), sn = Math.sin(phase), e = 0.0375
      I = ri * cs - rq * sn + e * (hash(sym) + hash(sym + 0.5) + hash(sym + 0.25))
      Q = ri * sn + rq * cs + e * (hash(sym + 0.75) + hash(sym + 0.125) + hash(sym + 0.375))
    }
    // where on the path
    let i = 1
    while (i < NP - 1 && LEN[i] < s) i++
    const g = (s - LEN[i - 1]) / (LEN[i] - LEN[i - 1]), P = PATH[i - 1], R = PATH[i]
    const thin = s < IN[0] || s > IN[3], r = RING * f * (thin ? 0.5 : 1) // (round a pigtail, a ring as much smaller)
    const x = P[0] + (R[0] - P[0]) * g + r * (I * SIDE[i][0] + Q * LIFT[i][0])
    const y = P[1] + (R[1] - P[1]) * g + r * (I * SIDE[i][1] + Q * LIFT[i][1])
    const z = P[2] + (R[2] - P[2]) * g + r * (I * SIDE[i][2] + Q * LIFT[i][2])
    world(x, y, z, c)
    solid(KINDS[kind], c, E, O, N, 2 * BEAD * MM * f * (thin ? 0.6 : 1), 0.3, 9 * f)
  }

  // the picture, once the frames are found
  const lit = clamp((sync - 0.1) / 0.4) * f
  if (lit > 0.005) turned(SCR[3]), put('picture', SCR[0], SCR[1], SCR[2], ax, ay, az, 0, 9 * lit)
}

// What its parts are, for the page.
export const about: Record<string, About> = {
  tx: { name: 'transmitting S3', does: 'A $5 ESP32-S3 on a Seeed XIAO running esp-dvbs2: it frames, codes, modulates and pulse-shapes DVB-S2 and sends it out of its own Wi-Fi radio. Here 8PSK 3/4 at 5 Msym/s on 2420 MHz, the live video; at most 69.8 Mb/s in 36 MHz.' },
  rx: { name: 'receiving S3', does: 'A second XIAO ESP32-S3 pulls it back in through its own radio at 16 MS/s, matched-filters it, finds and follows the frames and decodes every one on the chip: 12.64 Mb/s at most, 223 153 frames in the sweep, none lost.' },
  camera: { name: '360 camera', does: 'Two 200° fisheye cameras on a CM5, encoded into one 8 Mb/s MPEG transport stream and clocked over SPI into the transmitter.' },
  coax: { name: 'coax, 30 dB', does: 'The link, contained: coax through a 30 dB attenuator at 2420 MHz. Live, 2.4 hours on air: 5 725 408 frames decoded, none failed.' },
  w5500: { name: 'W5500', does: 'An Ethernet module on the receiver’s SPI: the decoded transport stream goes out as UDP at 10 Mb/s.' },
  screen: { name: 'the video, received', does: 'Both fisheye streams as received, as the laptop on the bench played them.' },
}


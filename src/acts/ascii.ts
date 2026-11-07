// R1 · ASCII. The same whirlpool read out as text, the way radio amateurs sent pictures by
// teleprinter: every 12 × 20 px cell becomes the glyph whose ink is laid out most like the light behind
// it. The glyphs are a teleprinter's: the ITA2 set, drawn once by the beam, so every character on screen is
// one RTTY can send, and it does: the centre row goes out as real FSK (45.45 Bd, mark 2125 Hz, space
// 2295 Hz, Baudot with its shifts), while the choir is held and crushed at the cell clock to five bits.
import type { Stereo } from '../audio/audio'
import { descent, place, sing } from './choir'
import { hang, PER, plunge, SHRINK } from './drain'
import { equation } from './reality'
import { DUR as WRAP, LEAD, VORTEX, live, surface, vortex } from './wrap'
import { TAU, clamp, mix, smooth, type Scene } from './scene'

// Baudot (ITA2, US figures) by code: letters, then figures. '\0' marks a code that prints nothing.
const LTRS = '\0E\nA SIU\rDRJNFCKTZLWHYPQOBG\0MXV\0'
const FIGS = "\x003\n- \x0787\r$4',!:(5\")2#6019?&\0./;\0"
const FIG = 27, LTR = 31
export const CHARS = " ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-?:$!&#'().,\"/;"

const BAUD = 45.45, MARK = 2125, SPACE = 2295
const HOLD = 3600 // the cell clock: 120 cells a row, 30 rows a second

const row = new Uint8Array(512) // the centre row of text, as the raster last read it out
const P1 = [0.1, 1, 0.27], AMBER = [1, 0.42, 0.02], EQ = [0.55, 0.85, 1] // linear light
const ink = [0, 0, 0]

// The teleprinter: one character after another from the centre row, each a start bit, five data bits
// LSB first and 1.5 stop bits, on continuous-phase FSK. Half-bits are its clock.
const tty = { t: -1, half: 0, bits: [] as number[], col: 0, figs: false, ph: 0 }
function queue() {
  const ch = String.fromCharCode(row[tty.col] || 32)
  tty.col = row[tty.col + 1] ? tty.col + 1 : 0
  let code = LTRS.indexOf(ch), figs = tty.figs
  if (code < 1) (code = FIGS.indexOf(ch)), (figs = true)
  else if (ch !== ' ') figs = false
  const send = (c: number) => {
    tty.bits.push(0, 0)
    for (let b = 0; b < 5; b++) tty.bits.push((c >> b) & 1, (c >> b) & 1)
    tty.bits.push(1, 1, 1)
  }
  if (code < 1) code = 4 // unknown: a space
  if (figs !== tty.figs) send(figs ? FIG : LTR), (tty.figs = figs)
  send(code)
}
function rtty(t: number) {
  if (t < tty.t) Object.assign(tty, { t, half: 0, bits: [], col: 0, figs: false, ph: 0 })
  const dt = t - tty.t
  tty.t = t
  const h = Math.floor(t * 2 * BAUD)
  while (tty.half < h) {
    tty.bits.shift()
    if (!tty.bits.length) queue()
    tty.half++
  }
  tty.ph += (tty.bits[0] ? MARK : SPACE) * dt
  return Math.sin(TAU * tty.ph)
}

// The choir, held at the cell clock and quantized to Baudot's five bits: x of it crushed, the rest clean.
const held = { k: -1, s: new Float64Array(6) }, smoothed = new Float64Array(6), tmp: Stereo = { l: 0, r: 0, s: new Float64Array(6) }
function crush(T: number, o: Stereo, x: number) {
  tmp.s.fill(0)
  sing(T, tmp)
  const k = Math.floor(T * HOLD)
  if (k !== held.k) {
    held.k = k
    for (let i = 0; i < 6; i++) held.s[i] = Math.round(tmp.s[i] * 64) / 64 // 32 levels over ±0.25, the choir's swing
  }
  // smoothed a little after the hold, so the steps are heard as grit, not as shrill images of the clock
  for (let i = 0; i < 6; i++) o.s[i] += mix(tmp.s[i], (smoothed[i] += (held.s[i] - smoothed[i]) * 0.3), x)
}

// The whirlpool goes on underneath, its drain opening onto the pearls below, and we are pulled down the
// throat into them (drain.ts): the text spreads over the water like an infection along the spiral, reads
// the world below as it opens, and is eaten back through by it as we fall in.
export const DUR = 3.5, AT = LEAD + WRAP + DUR // the choir's clock when the world below begins
const HOLE = 0.08 // the drain's mouth
const SPREAD = 0.9, EAT = [DUR - 1.1, DUR - 0.1] // how long the infection takes; when the world eats it back
const text = (t: number) => smooth(0, SPREAD, t) * (1 - smooth(EAT[0], EAT[1], t)) // how much of the sound is text
export const ascii: Scene = {
  dur: DUR,
  build(t, f) {
    const T = t + WRAP, fld = vortex(T, (f.at ?? 0) + t, f), p = fld.p
    const s = PER * (descent(T + LEAD) - descent(AT)), k = SHRINK ** s
    plunge(p, s, t - DUR, smooth(0, 1.6, t))
    p[15] = HOLE * smooth(0.2, 1.4, t)
    hang(p, surface(HOLE), k, t - DUR)
    p[46] = 1.3 * Math.min(1, t / SPREAD), p[47] = 1.1 * clamp((t - EAT[0]) / (EAT[1] - EAT[0]))
    const w = smooth(0, DUR, t)
    for (let i = 0; i < 3; i++) ink[i] = 1.4 * mix(P1[i], AMBER[i], w)
    fld.cell = 14
    fld.fine = 2
    fld.ink = ink
    fld.lift = 14
    fld.read = row
    equation(f, VORTEX, EQ, 0.9 * (1 - smooth(0, SPREAD, t)), live)
    place(T + LEAD)
    return (tt, o) => {
      const x = text(tt)
      crush(tt + WRAP + LEAD, o, x)
      const r = 0.035 * x * rtty(tt)
      o.l += r, o.r += r
    }
  },
}

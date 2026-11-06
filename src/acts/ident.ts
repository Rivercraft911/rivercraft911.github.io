// Station identification, and the transmission comes full circle. It began with a square wave built from
// its harmonics; it ends with a name built the same way. After the singularity there is only the beam's
// dot. Out of it unfold spinning phasors, the name's own Fourier series, c_n e^{inωt} chained tip to tail,
// and the last tip writes RIVER DOWDY while the terms keep arriving, so the name sharpens as it is drawn.
// Under it the call goes out in CW at 35 wpm (FCC §97.119), decodable by any CW app held to the speaker,
// and the speakers play the name itself, the same Fourier sum traced fifty times a second, so a real
// scope on the headphone jack reads it too. Then name and call rise into the corner of the instrument.
import { Path } from '../beam/path'
import { measure, text } from '../beam/font'
import { morph } from '../beam/morph'
import { Series } from '../dsp/fourier'
import { Say } from './say'
import { TAU, clamp, hash, lock, mix, smooth, view, type Scene } from './scene'

const MORSE: Record<string, string> = { D: '-..', E: '.', K: '-.-', J: '.---', '5': '.....', S: '...', C: '-.-.', H: '....' }
const DIT = 1.2 / 35 // seconds: 35 wpm
const KEY = 0.6 // when the epicycles unfold and keying starts
const DRAW = 2.8 // one pass of the tip through the name
const TONE = 700
const NMAX = 360 // harmonics the name ends with
const VISIBLE = 48 // epicycles drawn; the rest are summed into the last arm

// The keying as on/off intervals in dits: element gaps 1, letter gaps 3, word gaps 7.
const marks: [number, number][] = []
let dits = 0
for (const word of ['DE', 'KJ5SCH']) {
  for (const ch of word) {
    for (const e of MORSE[ch]) marks.push([dits, dits + (e === '.' ? 1 : 3)]), (dits = marks[marks.length - 1][1] + 1)
    dits += 2
  }
  dits += 4
}
const keyed = (t: number) => {
  const d = (t - KEY) / DIT
  for (const [a, b] of marks) if (d >= a && d < b) return smooth(a, a + 0.15, d) * smooth(b, b - 0.15, d)
  return 0
}

const DONE = KEY + DRAW // the name is written
const RISE = DONE + 2.2 // name and call rise into the header
const harmonics = (t: number) => Math.exp(Math.log(NMAX) * clamp(lock([[0, 0], [KEY, 1]], t, 1.6, 0.9), 0, 1))

const series = new Series(2048), c = { re: 0, im: 0 }, tip = { x: 0, y: 0, z: 0 }
const name = new Path(), call = new Path(), both = new Path(), head = new Path(), out = new Path()
const ink = new Path(), arms = new Path()
const eq = new Say()
let built = 0

export const ident: Scene = {
  dur: RISE + 1.6,
  build(t, f) {
    const A = view.a
    if (built !== A) {
      const size = Math.min(0.3, (1.75 * A) / measure('RIVER DOWDY', 1))
      name.clear().color(0.75, 1, 0.8, 1.6)
      text(name, 'RIVER DOWDY', 0, -0.02, size, 0.5)
      series.load(name)
      // the name and call as one, and where the instrument will wear them: the band's header
      both.clear().color(0.75, 1, 0.8, 1.6)
      text(both, 'RIVER DOWDY', 0, -0.02, size, 0.5)
      both.color(0.75, 1, 0.8, 0.8)
      text(both, 'KJ5SCH', 0, -0.3, 0.075, 0.5)
      const vert = A < 1, z = (vert ? 0.024 : 0.03) * 0.95
      head.clear().color(1, 0.7, 0.28, 0.75)
      text(head, 'RIVER DOWDY  KJ5SCH', vert ? -A + 0.03 : -A + 0.12, 0.93, z, 0)
      built = A
    }

    const up = clamp(lock([[0, 0], [RISE, 1]], t, 3.5, 0.8), 0, 1.05)
    if (up > 0) {
      // the name rises into the corner of the instrument that powers up around it
      f.ch.push({ w: 1, path: morph(both, head, up, out, 900) })
      return voice
    }
    if (t < KEY) {
      // the dot, alone, shivering
      f.ch.push({ w: 1, fn: (_, s) => ((s.x = 0.004 * hash(Math.random() * 1e4)), (s.y = 0.004 * hash(Math.random() * 1e4)), (s.z = 0.6)) })
      return voice
    }

    const N = harmonics(t)
    series.band(N)
    // the ink: the band-limited name as far as the tip has come; once written, all of it, still sharpening
    const u = clamp((t - KEY) / DRAW), m = series.m, upto = Math.floor(u * m)
    ink.clear()
    let pen = false
    for (let s = 0; s < upto; s += 2) {
      const z = clamp(series.z[s])
      if (z < 0.3) {
        pen = false
        continue
      }
      ink.color(0.75, 1, 0.8, 1.6 * z)
      pen ? ink.lineTo(series.x[s], series.y[s]) : ink.moveTo(series.x[s], series.y[s])
      pen = true
    }
    f.ch.push({ w: 1, path: ink })

    // the epicycles, chained tip to tail in order of frequency, unfolding out of the dot
    const open = clamp(lock([[0, 0], [KEY, 1]], t, 6, 0.8), 0, 1.1) * (1 - smooth(DONE, DONE + 0.8, t))
    if (open > 0) {
      arms.clear()
      series.coef(0, c)
      let x = c.re, y = c.im
      const ph = TAU * u
      for (let k = 1; k <= Math.min(VISIBLE, Math.floor(N)) * 2; k++) {
        const n = k & 1 ? (k + 1) >> 1 : -(k >> 1) // 1, −1, 2, −2, …
        series.coef(n, c)
        const r = Math.hypot(c.re, c.im) * open, a = Math.atan2(c.im, c.re) + n * ph
        if (r > 0.003) {
          arms.color(0.55, 0.75, 1, 0.25 * open).moveTo(x + r, y)
          for (let j = 1; j <= 40; j++) arms.lineTo(x + r * Math.cos((TAU * j) / 40), y + r * Math.sin((TAU * j) / 40))
        }
        arms.color(0.9, 0.95, 1, 0.8 * open).moveTo(x, y)
        x += r * Math.cos(a), y += r * Math.sin(a)
        arms.lineTo(x, y)
      }
      series.at(u, tip)
      arms.color(0.9, 0.95, 1, 0.5 * open).lineTo(mix(x, tip.x, open), mix(y, tip.y, open)) // the other terms, summed
      f.ch.push({ w: 0.6, path: arms })
    }

    const k = smooth(DONE + 0.3, DONE + 1, t)
    if (k > 0) {
      call.clear().color(0.75, 1, 0.8, 0.8) // reveal trims the path, so it is written afresh each frame
      text(call, 'KJ5SCH', 0, -0.3, 0.075, 0.5)
      f.ch.push({ w: 0.25, path: call.reveal(k) })
    }
    eq.say(f, t, 'z(t) = \\sum_{n=-N}^{N} c_n\\, e^{i n \\omega t}', [0.75, 1, 0.8], [['N', Math.floor(N), 0], ['t', t, 3]], 1 - smooth(DONE + 0.6, RISE, t))
    return voice
  },
}

// The relay, the call keyed in CW, and the name itself as x and y, its Fourier sum traced at 50 Hz.
const o3 = { x: 0, y: 0, z: 0 }
function voice(tt: number, o: { l: number; r: number }) {
  if (tt > KEY - 0.35 && tt < KEY - 0.3) o.l = o.r = 0.4 * hash(tt * 48_000) // the relay
  const tone = 0.3 * keyed(tt) * Math.sin(TAU * TONE * tt)
  o.l += tone, o.r += tone
  if (tt < KEY) return
  series.at((tt * 50) % 1, o3)
  const g = 0.5 * smooth(KEY, KEY + 0.5, tt) * (1 - smooth(RISE, RISE + 1.4, tt))
  o.l += (g * o3.x) / view.a, o.r += g * o3.y * 2
}

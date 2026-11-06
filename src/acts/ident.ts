// Station identification. A transmission must end with the station's call (FCC §97.119), so after the
// singularity there is only the beam's dot, shivering with thermal noise, then silence, a relay, and
// DE KJ5SCH keyed at 20 wpm on a 700 Hz sidetone, decodable by any CW app held to the speaker. The beam
// writes the keying as a tape of dits and dahs, and the tape becomes the name, the first words of the
// whole transmission. Then the name rings in the speakers as itself, traced fifty times a second.
import { Path } from '../beam/path'
import { measure, text } from '../beam/font'
import { morph } from '../beam/morph'
import { TAU, clamp, hash, lock, mix, smooth, view, type Scene } from './scene'

const MORSE: Record<string, string> = { D: '-..', E: '.', K: '-.-', J: '.---', '5': '.....', S: '...', C: '-.-.', H: '....' }
const DIT = 0.06 // seconds: 20 wpm
const KEY = 2.2 // when keying starts
const TONE = 700

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
dits -= 7
const END = KEY + dits * DIT
const keyed = (t: number) => {
  const d = (t - KEY) / DIT
  for (const [a, b] of marks) if (d >= a && d < b) return smooth(a, a + 0.08, d) * smooth(b, b - 0.08, d)
  return 0
}

const tape = new Path(), name = new Path(), call = new Path(), out = new Path()
let built = 0

// The tape: one line across the screen, raised where the key was down, written as it is sent.
function writeTape(t: number, A: number) {
  tape.clear().color(0.55, 1, 0.65, 1)
  const span = (2 * A * 0.9) / dits, x0 = -A * 0.9, upto = Math.min(dits, (t - KEY) / DIT)
  tape.moveTo(x0, 0)
  for (const [a, b] of marks) {
    if (a > upto) break
    tape.lineTo(x0 + a * span, 0).lineTo(x0 + a * span, 0.06).lineTo(x0 + Math.min(b, upto) * span, 0.06)
    if (b <= upto) tape.lineTo(x0 + b * span, 0)
  }
  if (upto > 0) tape.lineTo(x0 + upto * span, upto >= marks[marks.length - 1][1] ? 0 : tape.tip()[1])
  return tape
}

export const ident: Scene = {
  dur: 12,
  build(t, f) {
    const A = view.a
    if (built !== A) {
      const size = Math.min(0.3, (1.75 * A) / measure('RIVER DOWDY', 1))
      name.clear().color(0.75, 1, 0.8, 1.6)
      text(name, 'RIVER DOWDY', 0, -0.02, size, 0.5)
      built = A
    }
    if (t < KEY) {
      // the dot, alone, shivering
      f.ch.push({ w: 1, fn: (_, s) => ((s.x = 0.004 * hash(Math.random() * 1e4)), (s.y = 0.004 * hash(Math.random() * 1e4)), (s.z = 0.6)) })
    } else {
      const k = clamp(lock([[0, 0], [END + 0.4, 1]], t, 4, 0.75), 0, 1.1)
      f.ch.push({ w: 1, path: k > 0 ? morph(writeTape(Math.min(t, END), A), name, k, out, 800) : writeTape(t, A) })
    }
    const c = smooth(END + 1.4, END + 2.4, t)
    if (c > 0) {
      call.clear().color(0.75, 1, 0.8, 0.8)
      text(call, 'KJ5SCH', 0, -0.3, 0.075, 0.5)
      f.ch.push({ w: 0.25, path: call.reveal(c) })
    }
    return (tt, o) => {
      if (tt > KEY - 0.6 && tt < KEY - 0.55) o.l = o.r = 0.4 * hash(tt * 48_000) // the relay
      const tone = 0.35 * keyed(tt) * Math.sin(TAU * TONE * tt)
      o.l += tone, o.r += tone
      if (tt > END + 0.5) {
        // the name, traced fifty times a second: a real scope on the headphone jack would read it
        const n = name.v.length / 8, u = ((tt * 50) % 1) * (n - 1), i = Math.floor(u), a = u - i, v = name.v, j = Math.min(n - 1, i + 1)
        const g = 0.7 * smooth(END + 0.5, END + 1.5, tt)
        o.l += (g * mix(v[8 * i], v[8 * j], a)) / A, o.r += g * mix(v[8 * i + 1], v[8 * j + 1], a) * 2
      }
    }
  },
}

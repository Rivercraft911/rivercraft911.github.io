// The station identifies itself in Morse: DE KJ5SCH, keyed on a 700 Hz tone and rolled across the screen.
import { Path } from '../beam/path'
import { text } from '../beam/font'
import { CALL, header } from './header'
import { TAU, smooth, view, type Scene } from './scene'

const MSG = `DE ${CALL}`
const DIT = 0.05 // 24 wpm
const START = 0.6
const TONE = 700
const MORSE: Record<string, string> = { D: '-..', E: '.', K: '-.-', J: '.---', 5: '.....', S: '...', C: '-.-.', H: '....' }

// Key-down intervals in dits, and the dit at which each character of MSG has been sent.
const keyed: number[] = []
const sent: number[] = []
let d = 0
for (const ch of MSG) {
  if (ch === ' ') d += 2
  else for (const e of MORSE[ch]) keyed.push(d, (d += e === '.' ? 1 : 3)), (d += 1)
  sent.push(d)
  d += 2
}

// Key envelope at time t (seconds into the message), with 5 ms raised edges against key clicks.
function key(t: number) {
  const x = t / DIT
  for (let i = 0; i < keyed.length; i += 2) if (x > keyed[i] - 0.1 && x < keyed[i + 1] + 0.1) return smooth(keyed[i], keyed[i] + 0.1, x) * (1 - smooth(keyed[i + 1], keyed[i + 1] + 0.1, x))
  return 0
}
const cw = (t: number) => key(t - START) * Math.sin(TAU * TONE * t)

const label = new Path()
const big = new Path()
const WIN = 1.4

export const cwScene: Scene = {
  dur: 8,
  build(t, f) {
    const A = view.a * 0.92, done = START + d * DIT
    f.ch.push({
      w: 1,
      fn: (tt, s, u) => {
        const at = tt - WIN * (1 - u)
        s.x = (2 * u - 1) * A
        s.y = 0.18 + 0.22 * cw(at)
      },
    })

    const n = sent.filter((x) => START + x * DIT <= t).length
    big.clear().intensity(1 - smooth(done + 0.8, done + 1.6, t))
    text(big, MSG.slice(0, n), 0, -0.36, 0.13, 0.5)
    f.ch.push({ w: 0.4, path: big })

    label.clear()
    header(label, smooth(done + 1, done + 1.8, t))
    text(label, `CW  ${TONE} Hz  ·  24 wpm`, -A, -0.89, 0.05)
    text(label, 'dit = 50 ms', A, -0.89, 0.05, 1)
    f.ch.push({ w: 0.35, gain: 0.7, path: label })
    f.look = { tau: 0.05 }
    return (tt, o) => void (o.l = o.r = 0.8 * cw(tt))
  },
}

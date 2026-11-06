// The live equation, top left: what the beam is drawing right now, in the colour of what it draws, and
// under it the numbers it is running on, each on its odometer wheels. When the signal changes, the new
// equation grows out of the old one term by term.
import { Path } from '../beam/path'
import { draw, eq, mathFont, morphEq, roll, tex } from '../beam/math'
import { load } from '../beam/font'
import { clamp, lock, mix, smooth, view, type Frame } from './scene'

// Every equation in the piece is set in this face (?math=<face> to try another).
mathFont.face = await load(new URLSearchParams(location.search).get('math') ?? 'mserif')

export type Val = readonly [name: string, v: number, dec: number]
const SIZE = 0.058, SUB = 0.042

export class Say {
  private p = new Path()
  private out = eq()
  private src = ''
  private was = ''
  private at = -1e9

  say(f: Frame, t: number, src: string, c: readonly number[], vals: readonly Val[] = [], i = 1) {
    if (t < this.at) this.at = -1e9 // scrubbed back: no morph
    if (src !== this.src) (this.was = this.src), (this.src = src), (this.at = this.was ? t : -1e9)
    const p = this.p.clear().color(c[0], c[1], c[2], i), x = -view.a * 0.9, y = 0.86
    const k = t - this.at < 1.2 ? clamp(lock([[0, 0], [this.at, 1]], t, 14, 0.6), 0, 1.1) : 1
    draw(p, k < 1.1 && t - this.at < 1.2 ? morphEq(tex(this.was), tex(src), k, this.out) : tex(src), x, y, SIZE, 0, i)
    let cx = x
    for (const [name, v, dec] of vals) {
      cx += draw(p, tex(`${name} =`), cx, y - 2.7 * SIZE, SUB, 0, 0.75 * i) + 0.3 * SUB
      cx += roll(p, v, cx, y - 2.7 * SIZE, SUB, dec, 0, 0.75 * i) + 1.4 * SUB
    }
    f.ch.push({ w: 0.2, path: p })
  }
}

// The board: every equation a scene is made of, set across the top with the live numbers in it (\num
// slots), so the whole world could be rebuilt from what is on screen. Each line arrives when what it
// draws does, and burns brightest in its own colour while that is being drawn.
export type Line = { src: string; c: readonly number[]; at: number; vals: number[]; hot: number }
export class Board {
  private p = new Path()
  constructor(readonly lines: Line[], private size = 0.03) {}

  // Draws the lines that have arrived by t, wrapped across the top; returns the y the board ends at.
  show(f: Frame, t: number, k = 1) {
    const p = this.p.clear(), A = view.a * 0.92, z = this.size, rh = 2.5 * z
    let x = -A, y = 0.93
    for (const l of this.lines) {
      if (l.at > t) continue
      const e = tex(l.src), w = e.w * z
      if (x > -A && x + w > A) (x = -A), (y -= rh)
      const i = k * smooth(l.at, l.at + 0.6, t) * mix(0.35, 1, l.hot)
      p.color(mix(0.75, l.c[0], l.hot), mix(0.8, l.c[1], l.hot), mix(0.85, l.c[2], l.hot), i)
      draw(p, e, x, y, z, 0, i, l.vals)
      x += w + 3 * z
    }
    if (p.len) f.ch.push({ w: 0.25 * k, path: p })
    return x > -A ? y - 1.4 * z : y + rh - 1.4 * z
  }
}

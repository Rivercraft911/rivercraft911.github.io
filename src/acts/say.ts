// The live equation, top left: what the beam is drawing right now, in the colour of what it draws, and
// under it the numbers it is running on, each on its odometer wheels. When the signal changes, the new
// equation grows out of the old one term by term.
import { Path } from '../beam/path'
import { draw, eq, morphEq, roll, tex } from '../beam/math'
import { clamp, lock, view, type Frame } from './scene'

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
      cx += draw(p, tex(`${name} =`), cx, y - 2.1 * SIZE, SUB, 0, 0.75 * i) + 0.3 * SUB
      cx += roll(p, v, cx, y - 2.1 * SIZE, SUB, dec, 0, 0.75 * i) + 1.4 * SUB
    }
    f.ch.push({ w: 0.2, path: p })
  }
}

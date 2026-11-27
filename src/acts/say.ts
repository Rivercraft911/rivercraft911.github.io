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
export type Place = { x: number; y: number; size: number }
const SIZE = 0.058, SUB = 0.042
export const MORPH = 1.2 // how long a morph runs: it snaps, rings and is settled well within it

export class Say {
  private p = new Path()
  private out = eq()
  private src = ''
  private was = ''
  private at = -1e9
  private now = NaN
  private vals: readonly Val[] = []
  private old: readonly Val[] = [] // the numbers under the last equation, going as the new ones come
  private room: number[] = [] // each live number's room, eased to what it needs, so a digit coming does not shove the rest
  private ease = 1
  private from: Place = { x: 0, y: 0, size: 0 } // where the last equation stood
  private here: Place = { x: 0, y: 0, size: 0 }

  // t on one clock for everyone who speaks through it. The equation stands top left, or moves to `to` as it
  // morphs (nums fill its \num slots).
  say(f: Frame, t: number, src: string, c: readonly number[], vals: readonly Val[] = [], i = 1, to?: Place, nums?: ArrayLike<number>) {
    this.ease = t > this.now && t - this.now < 0.2 ? 1 - Math.exp(-(t - this.now) / 0.06) : 1
    this.now = t
    if (t < this.at) this.at = -1e9 // scrubbed back: no morph
    HOME.x = -view.a * 0.9
    const home = to ?? HOME, h = this.here
    if (src !== this.src) {
      ;(this.was = this.src), (this.src = src), (this.at = this.was ? t : -1e9)
      const same = this.vals.map((v) => v[0]).join() === vals.map((v) => v[0]).join()
      ;(this.old = same ? [] : this.vals), same || (this.room.length = 0)
      if (this.at < 0) Object.assign(h, home)
      Object.assign(this.from, h)
    }
    this.vals = vals
    const p = this.p.clear().color(c[0], c[1], c[2], i), morphing = t - this.at < MORPH
    const k = morphing ? clamp(lock([[0, 0], [this.at, 1]], t, 14, 0.6), 0, 1.1) : 1
    ;(h.x = mix(this.from.x, home.x, k)), (h.y = mix(this.from.y, home.y, k)), (h.size = mix(this.from.size, home.size, k))
    draw(p, morphing ? morphEq(tex(this.was), tex(src), k, this.out) : tex(src), h.x, h.y, h.size, 0, i, nums)
    // the numbers beneath go as the morph's unmatched glyphs do: the old in its first half, the new in its second
    const m = this.old.length ? Math.min(1, k) : 1
    if (m < 0.5) this.line(this.old, 0.75 * i * (1 - 2 * m), false)
    this.line(vals, 0.75 * i * (this.old.length ? Math.max(0, 2 * m - 1) : 1), true)
    f.ch.push({ w: 0.2, path: p })
  }

  // A line of numbers. Live, each is set right-aligned in its room, so a new leading digit rolls in where it
  // stands, and the room widens smoothly for it instead of the numbers after it jumping along.
  private line(vals: readonly Val[], i: number, live: boolean) {
    if (i < 0.01) return
    const p = this.p, y = 0.86 - 2.7 * SIZE, room = this.room
    let cx = -view.a * 0.9
    p.intensity(i)
    for (let k = 0; k < vals.length; k++) {
      const [name, v, dec] = vals[k]
      cx += draw(p, tex(`${name} =`), cx, y, SUB, 0, i) + 0.3 * SUB
      if (!live || !(room[k] >= 0)) {
        const w = roll(p, v, cx, y, SUB, dec, 0, i)
        if (live) room[k] = w
        cx += w + 1.4 * SUB
        continue
      }
      const w = roll(p, v, cx + room[k], y, SUB, dec, 1, i)
      cx += room[k] + 1.4 * SUB
      room[k] += (w - room[k]) * this.ease
    }
  }
}
const HOME: Place = { x: 0, y: 0.86, size: SIZE }

// The opening's equations all speak through this one, the hook's, the meander's and the valley's, so each grows
// out of the last across the handovers and two are never on screen at once.
export const say = new Say()

// The board: every equation a scene is made of, set across the top with the live numbers in it (\num
// slots), so the whole world could be rebuilt from what is on screen. Each line arrives when what it
// draws does, and burns brightest in its own colour while that is being drawn.
export type Line = { src: string; c: readonly number[]; at: number; vals: number[]; hot: number }
export class Board {
  private p = new Path()
  constructor(readonly lines: Line[], private size = 0.03) {}

  // Draws the lines that have arrived by t, wrapped across the top; returns the y the board ends at, which
  // comes down as a new row's first line fades in rather than in a step. Lines are listed in the order they
  // arrive, so an arrival never moves one already there.
  // While the first line is still arriving as another equation morphing into it (`led`), its room is kept
  // but it is not drawn: first() says where it lands.
  show(f: Frame, t: number, k = 1, led = false) {
    const p = this.p.clear(), A = view.a * 0.92, z = this.size, rh = 2.5 * z
    let x = -A, y = 0.93, opened = 1
    for (const l of this.lines) {
      if (l.at > t) continue
      const e = tex(l.src), w = e.w * z, a = smooth(l.at, l.at + 0.6, t)
      if (x > -A && x + w > A) (x = -A), (y -= rh), (opened = a)
      const i = k * a * mix(0.35, 1, l.hot)
      p.color(mix(0.75, l.c[0], l.hot), mix(0.8, l.c[1], l.hot), mix(0.85, l.c[2], l.hot), i)
      if (!led || l !== this.lines[0]) draw(p, e, x, y, z, 0, i, l.vals)
      x += w + 3 * z
    }
    if (p.len) f.ch.push({ w: 0.25 * k, path: p })
    return y + rh * (1 - opened) - 1.4 * z
  }
  first(o: Place) {
    return (o.x = -view.a * 0.92), (o.y = 0.93), (o.size = this.size), o
  }
}

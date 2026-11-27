// What a scope on the headphone jack draws: the scene's own picture, simplified to what the speakers can
// trace. Each frame a scene lays its strokes down in drawing order, in screen units, on one page or two; each
// page is resampled into a table of N points by cost (arc length times a weight, so the beam's speed and so
// its brightness follow what the scene says a stretch is worth: a scope has no Z input on a headphone jack, so
// dwell is its only brightness), and the speakers trace the tables at a note, as oscilloscope music does: the
// picture is the timbre, the refresh rate the pitch. A swing goes forth over the first page and back over the
// second, so a period draws two different pictures and never retraces; a scene that shares their first and
// last strokes leaves no flyback. Each frame's tables are crossfaded from the last across the audio it renders,
// so the drawing morphs rather than steps, and the trace is centred on their mean, since a headphone jack is
// AC-coupled: a figure riding on DC would wander off a real scope.
const N = 1024, PAGES = 2
const page = () => ({ x: [] as number[], y: [] as number[], c: [] as number[], pen: false })
export class Scope {
  static readonly N = N
  private ps = [page(), page()]
  private on = 1 // the pages strokes go to, as bits
  private n = 1 // pages laid down this frame
  weight = 1 // what a unit of length is worth, from here on
  private now = [new Float32Array(2 * N + 2), new Float32Array(2 * N + 2)] // x, y; then the mean
  private was = [new Float32Array(2 * N + 2), new Float32Array(2 * N + 2)]
  private pn = 0 // pages committed
  private t = NaN
  private span = 1 / 60
  private t0 = NaN
  u = 0 // where on the table it last played
  private lx = 0 // the plates, through a gentle low-pass: two poles of k a sample
  private ly = 0
  private lx2 = 0
  private ly2 = 0

  clear(pages = 1) {
    for (const q of this.ps) (q.x.length = q.y.length = q.c.length = 0), (q.pen = false)
    ;(this.n = Math.min(PAGES, pages)), (this.on = (1 << this.n) - 1), (this.weight = 1)
    return this
  }

  // Which pages the strokes from here go to: 1 the first, 2 the second, 3 both.
  page(bits: number) {
    this.on = bits
    return this
  }

  moveTo(x: number, y: number) {
    for (let p = 0; p < this.n; p++) if (this.on & (1 << p)) this.ps[p].pen = false
    return this.lineTo(x, y)
  }

  // A stretch costs its length times the weight, unless it says what it costs. A jump costs a tenth of its
  // length: the speakers glide it in a few samples, a faint line on a real scope, and never a click.
  lineTo(x: number, y: number, cost = -1) {
    for (let p = 0; p < this.n; p++) {
      if (!(this.on & (1 << p))) continue
      const q = this.ps[p], n = q.x.length, l = n ? Math.hypot(x - q.x[n - 1], y - q.y[n - 1]) : 0
      const d = !n ? 0 : !q.pen ? 0.1 * l : cost >= 0 ? cost : this.weight * l
      q.x.push(x), q.y.push(y), q.c.push((n ? q.c[n - 1] : 0) + d)
      q.pen = true
    }
    return this
  }

  get len() {
    const c = this.ps[0].c
    return c.length ? c[c.length - 1] : 0
  }

  // Resamples this frame's pages into their tables (the last frame's kept to fade from); t is the time.
  commit(t: number) {
    const fresh = !(Math.abs(t - this.t) < 0.2) || this.n !== this.pn // the first frame, a jump, or new pages: nothing to fade from
    ;[this.was, this.now] = [this.now, this.was]
    this.span = fresh ? 1 / 60 : Math.min(0.1, Math.max(1 / 240, t - this.t))
    ;(this.t = t), (this.t0 = NaN), (this.pn = this.n)
    let mx = 0, my = 0, m = 0
    for (let p = 0; p < this.n; p++) {
      const q = this.ps[p], T = this.now[p], n = q.x.length, L = n ? q.c[n - 1] : 0
      if (n < 2 || L <= 0) {
        for (let i = 0; i < N; i++) (T[2 * i] = n ? q.x[0] : 0), (T[2 * i + 1] = n ? q.y[0] : 0)
        continue
      }
      for (let i = 0, j = 1; i < N; i++) {
        const s = (L * i) / (N - 1)
        while (j < n - 1 && q.c[j] < s) j++
        const a = q.c[j - 1], b = q.c[j], k = b > a ? (s - a) / (b - a) : 1
        const x = q.x[j - 1] + (q.x[j] - q.x[j - 1]) * k, y = q.y[j - 1] + (q.y[j] - q.y[j - 1]) * k
        ;(T[2 * i] = x), (T[2 * i + 1] = y), (mx += x), (my += y), m++
      }
    }
    for (let p = 0; p < this.n; p++) (this.now[p][2 * N] = m ? mx / m : 0), (this.now[p][2 * N + 1] = m ? my / m : 0)
    if (fresh) for (let p = 0; p < this.n; p++) this.was[p].set(this.now[p])
    return this
  }

  // The speakers' trace at c, counting traversals: a saw goes forth over the pages in turn, a swing forth over
  // the first and back over the second. Played into the pair, scaled by g, through the plates' gentle low-pass;
  // the scope keeps where the trace is, so a scene that takes it over goes on from where the last one left it.
  play(c: number, tt: number, o: { l: number; r: number }, g = 1, k = SHARP, swing = false) {
    if (!(this.t === this.t)) return
    if (this.t0 !== this.t0) this.t0 = tt
    const h = swing ? 2 * c : c, n = Math.floor(h), f = h - n, u = swing && n & 1 ? 1 - f : f
    const p = this.pn > 1 ? (swing ? n & 1 : n % this.pn) : 0, A = this.was[p], B = this.now[p]
    const e = Math.min(1, (tt - this.t0) / this.span), i = Math.min(N - 2, Math.floor(u * (N - 1))), a = u * (N - 1) - i, j = 2 * i, M = 2 * N
    const xa = A[j] + (A[j + 2] - A[j]) * a - A[M], ya = A[j + 1] + (A[j + 3] - A[j + 1]) * a - A[M + 1]
    const xb = B[j] + (B[j + 2] - B[j]) * a - B[M], yb = B[j + 1] + (B[j + 3] - B[j + 1]) * a - B[M + 1]
    const x = xa + (xb - xa) * e, y = ya + (yb - ya) * e
    this.u = u
    ;(this.lx += (GX * x - this.lx) * k), (this.ly += (GY * y - this.ly) * k)
    ;(this.lx2 += (this.lx - this.lx2) * k), (this.ly2 += (this.ly - this.ly2) * k)
    ;(o.l += g * this.lx2), (o.r += g * this.ly2)
  }

  // The plates driven straight from a signal (x, y about the screen's axis), not from the tables.
  hold(x: number, y: number) {
    ;(this.lx = this.lx2 = GX * x), (this.ly = this.ly2 = GY * y)
  }
}
// How sharply the plates follow the tables, a sample at a time: enough low-pass to take the edge off a jump.
export const SHARP = 0.6

// The opening's one scope: the hook drives its plates, then the meander and the valley draw their tables on it
// in turn, so at each handover the trace goes on from where it was.
export const screen = new Scope()

// The refresh rate as a tune: [from, Hz] steps, and the number of refreshes by time t (its integral), so the
// phase never jumps when the note changes.
export function tune(notes: readonly (readonly [number, number])[], c0 = 0) {
  const at = [c0]
  for (let i = 1; i < notes.length; i++) at.push(at[i - 1] + notes[i - 1][1] * (notes[i][0] - notes[i - 1][0]))
  return (t: number) => {
    let i = notes.length - 1
    while (i > 0 && t < notes[i][0]) i--
    return at[i] + notes[i][1] * (t - notes[i][0])
  }
}

// The speakers' gains for the screen's x and y. A scope has a volts-per-division knob for each channel, and
// the picture is wider than tall, so y is given more swing to sound as present as x.
export const GX = 0.27, GY = 0.5

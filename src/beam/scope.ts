// What a scope on the headphone jack draws: the scene's own picture, simplified to what the speakers can
// trace. Each frame a scene lays its strokes down in drawing order, in screen units; they are resampled into
// a table of N points by cost (arc length, so the beam's speed and so its brightness are even, unless the
// scene says a stretch is worth more: a timebase is paced by time, not length), and the speakers trace the
// table at a note, as oscilloscope music does: the picture is the timbre, the refresh rate the pitch. Each
// frame's table is crossfaded from the last across the audio it renders, so the drawing morphs rather than
// steps, and each is centred on its own mean, since a headphone jack is AC-coupled: a figure riding on DC
// would wander off a real scope.
export class Scope {
  static readonly N = 1024
  private x: number[] = []
  private y: number[] = []
  private c: number[] = [] // cost to each point
  private pen = false
  weight = 1 // what a unit of length is worth, from here on
  private now = new Float32Array(2 * Scope.N + 2) // x, y; then the mean
  private was = new Float32Array(2 * Scope.N + 2)
  private t = NaN
  private span = 1 / 60
  private t0 = NaN

  clear() {
    this.x.length = this.y.length = this.c.length = 0
    ;(this.pen = false), (this.weight = 1)
    return this
  }

  moveTo(x: number, y: number) {
    this.pen = false
    return this.lineTo(x, y)
  }

  // A stretch costs its length times the weight, unless it says what it costs. A jump costs a tenth of its
  // length: the speakers glide it in a few samples, a faint line on a real scope, and never a click.
  lineTo(x: number, y: number, cost = -1) {
    const n = this.x.length, l = n ? Math.hypot(x - this.x[n - 1], y - this.y[n - 1]) : 0
    const d = !n ? 0 : !this.pen ? 0.1 * l : cost >= 0 ? cost : this.weight * l
    this.x.push(x), this.y.push(y), this.c.push((n ? this.c[n - 1] : 0) + d)
    this.pen = true
    return this
  }

  get len() {
    return this.x.length ? this.c[this.c.length - 1] : 0
  }

  // Resamples this frame's strokes into the table (the last frame's kept to fade from); t is the scene time.
  commit(t: number) {
    const fresh = !(Math.abs(t - this.t) < 0.2) // the first frame, or a jump: nothing to fade from
    ;[this.was, this.now] = [this.now, this.was]
    this.span = fresh ? 1 / 60 : Math.min(0.1, Math.max(1 / 240, t - this.t))
    ;(this.t = t), (this.t0 = NaN)
    const T = this.now, N = Scope.N, n = this.x.length, L = this.len
    if (n < 2 || L <= 0) {
      T.fill(0)
      if (n) for (let i = 0; i <= N; i++) (T[2 * i] = this.x[0]), (T[2 * i + 1] = this.y[0])
      return this
    }
    let mx = 0, my = 0
    for (let i = 0, j = 1; i < N; i++) {
      const s = (L * i) / (N - 1)
      while (j < n - 1 && this.c[j] < s) j++
      const a = this.c[j - 1], b = this.c[j], k = b > a ? (s - a) / (b - a) : 1
      const x = this.x[j - 1] + (this.x[j] - this.x[j - 1]) * k, y = this.y[j - 1] + (this.y[j] - this.y[j - 1]) * k
      ;(T[2 * i] = x), (T[2 * i + 1] = y), (mx += x), (my += y)
    }
    ;(T[2 * N] = mx / N), (T[2 * N + 1] = my / N)
    if (fresh) this.was.set(T)
    return this
  }

  // The point at u ∈ [0, 1] along the table, centred, into o; tt is the audio's time, which sets how far the
  // fade from the last table to this one has gone.
  at(u: number, tt: number, o: { x: number; y: number }) {
    if (this.t0 !== this.t0) this.t0 = tt
    const k = Math.min(1, (tt - this.t0) / this.span), N = Scope.N, f = Math.min(N - 1.0001, Math.max(0, u * (N - 1))), i = Math.floor(f), a = f - i
    const A = this.was, B = this.now, j = 2 * i
    const xa = A[j] + (A[j + 2] - A[j]) * a - A[2 * N], ya = A[j + 1] + (A[j + 3] - A[j + 1]) * a - A[2 * N + 1]
    const xb = B[j] + (B[j + 2] - B[j]) * a - B[2 * N], yb = B[j + 1] + (B[j + 3] - B[j + 1]) * a - B[2 * N + 1]
    o.x = xa + (xb - xa) * k, o.y = ya + (yb - ya) * k
  }
}

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

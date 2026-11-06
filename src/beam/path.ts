// A display list for the beam: strokes of vertices, traced once per refresh.
// Vertex stride: x, y, intensity, r, g, b, dwell, pen (0 = jump here blanked, 1 = draw).

export const STRIDE = 8

export class Path {
  v: number[] = []
  len = 0 // drawn arc length (jumps are free, dwells count)
  private pen = 0
  private cum: number[] = [] // drawn length up to each vertex, built lazily for `at`
  private c = [0.35, 1, 0.55, 1] // r, g, b, intensity

  clear() {
    this.v.length = 0
    this.len = 0
    this.pen = 0
    this.cum.length = 0
    return this
  }

  color(r: number, g: number, b: number, i = 1) {
    this.c[0] = r, this.c[1] = g, this.c[2] = b, this.c[3] = i
    return this
  }

  intensity(i: number) {
    this.c[3] = i
    return this
  }

  moveTo(x: number, y: number) {
    this.pen = 0
    return this.lineTo(x, y)
  }

  lineTo(x: number, y: number, dwell = 0) {
    const v = this.v, n = v.length
    if (this.pen && n) this.len += Math.hypot(x - v[n - STRIDE], y - v[n - STRIDE + 1])
    this.len += dwell
    v.push(x, y, this.c[3], this.c[0], this.c[1], this.c[2], dwell, this.pen)
    this.pen = 1
    return this
  }

  dot(x: number, y: number, dwell: number) {
    return this.moveTo(x, y).lineTo(x, y, dwell)
  }

  poly(pts: ArrayLike<number>, closed = false, ox = 0, oy = 0, s = 1) {
    this.moveTo(ox + pts[0] * s, oy + pts[1] * s)
    for (let i = 2; i < pts.length; i += 2) this.lineTo(ox + pts[i] * s, oy + pts[i + 1] * s)
    if (closed) this.lineTo(ox + pts[0] * s, oy + pts[1] * s)
    return this
  }

  circle(cx: number, cy: number, r: number, n = 96) {
    this.moveTo(cx + r, cy)
    for (let i = 1; i <= n; i++) {
      const a = (i / n) * Math.PI * 2
      this.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a))
    }
    return this
  }

  // Keep only the first fraction f of the drawn length: the beam "writes" the path on.
  reveal(f: number) {
    if (f >= 1) return this
    const v = this.v, keep = Math.max(0, f) * this.len
    let s = 0
    for (let i = STRIDE; i < v.length; i += STRIDE) {
      const d = v[i + 7] ? Math.hypot(v[i] - v[i - STRIDE], v[i + 1] - v[i - STRIDE + 1]) + v[i + 6] : 0
      if (s + d > keep) {
        const k = d > 0 ? (keep - s) / d : 0
        v[i] = v[i - STRIDE] + (v[i] - v[i - STRIDE]) * k
        v[i + 1] = v[i - STRIDE + 1] + (v[i + 1] - v[i - STRIDE + 1]) * k
        v.length = i + STRIDE
        this.len = keep
        this.cum.length = 0
        return this
      }
      s += d
    }
    return this
  }

  // Position at drawn arc length s, wrapping: how the speakers hear a display list.
  at(s: number, o: { l: number; r: number }) {
    const v = this.v, n = v.length / STRIDE
    if (n < 2 || this.len <= 0) return
    if (this.cum.length !== n) {
      this.cum.length = n
      let c = 0
      for (let i = 0; i < n; i++) {
        const j = i * STRIDE
        if (i && v[j + 7]) c += Math.hypot(v[j] - v[j - STRIDE], v[j + 1] - v[j - STRIDE + 1])
        this.cum[i] = c += v[j + 6]
      }
    }
    s = ((s % this.len) + this.len) % this.len
    let lo = 0, hi = n - 1
    while (lo < hi) {
      const m = (lo + hi) >> 1
      this.cum[m] < s ? (lo = m + 1) : (hi = m)
    }
    const j = lo * STRIDE, run = this.cum[lo] - v[j + 6] - (lo ? this.cum[lo - 1] : 0)
    const k = lo && run > 0 ? Math.min(1, (s - this.cum[lo - 1]) / run) : 1
    o.l = lo ? v[j - STRIDE] + (v[j] - v[j - STRIDE]) * k : v[j]
    o.r = lo ? v[j - STRIDE + 1] + (v[j + 1] - v[j - STRIDE + 1]) * k : v[j + 1]
  }

  // The point where the drawn path currently ends: the beam's pen tip.
  tip(): [number, number] {
    const n = this.v.length
    return n ? [this.v[n - STRIDE], this.v[n - STRIDE + 1]] : [0, 0]
  }
}

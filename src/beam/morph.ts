// One display list becoming another. Both are sampled at n points evenly spaced in drawn arc length,
// so point j of a and point j of b are the same fraction of the way through their tracing; then the
// beam interpolates them. A hop between strokes is dark in the path that has it, so a's breaks fade
// out as b's fade in, and a jump stays a blank jump only where both paths jump together.
import { STRIDE, type Path } from './path'

let A = new Float64Array(0), B = new Float64Array(0)

// Drawn length of vertex i's segment: the move from the last vertex if the pen is down, then the dwell.
const run = (v: number[], i: number) => (i && v[i + 7] ? Math.hypot(v[i] - v[i - STRIDE], v[i + 1] - v[i - STRIDE + 1]) : 0)

// Samples p at n points, j/(n-1) of the way along its drawn length: x, y, i, r, g, b, stroke, _.
function sample(p: Path, n: number, o: Float64Array) {
  const v = p.v, m = v.length
  if (!m) return o.fill(0, 0, n * 8)
  let i = 0, s = 0, stroke = 0 // vertex i's segment spans drawn length [s, s + run + dwell)
  for (let j = 0; j < n; j++) {
    const at = n > 1 ? (j / (n - 1)) * p.len : 0
    while (i + STRIDE < m && s + run(v, i) + v[i + 6] < at) {
      s += run(v, i) + v[i + 6]
      i += STRIDE
      if (!v[i + 7]) stroke++
    }
    const r = run(v, i), u = r > 0 ? Math.min(1, (at - s) / r) : 1, q = j * 8
    const px = r > 0 ? v[i - STRIDE] : v[i], py = r > 0 ? v[i - STRIDE + 1] : v[i + 1]
    o[q] = px + (v[i] - px) * u
    o[q + 1] = py + (v[i + 1] - py) * u
    for (let c = 2; c < 6; c++) o[q + c] = v[i + c]
    o[q + 6] = stroke
  }
  return o
}

export function morph(a: Path, b: Path, k: number, out: Path, n = 512) {
  if (A.length < n * 8) (A = new Float64Array(n * 8)), (B = new Float64Array(n * 8))
  sample(a, n, A)
  sample(b, n, B)
  out.clear()
  for (let j = 0; j < n; j++) {
    const q = j * 8
    const da = j > 0 && A[q + 6] === A[q - 2] ? 1 : 0, db = j > 0 && B[q + 6] === B[q - 2] ? 1 : 0
    const i = (1 - k) * A[q + 2] * da + k * B[q + 2] * db
    out.color(A[q + 3] + (B[q + 3] - A[q + 3]) * k, A[q + 4] + (B[q + 4] - A[q + 4]) * k, A[q + 5] + (B[q + 5] - A[q + 5]) * k, i)
    const x = A[q] + (B[q] - A[q]) * k, y = A[q + 1] + (B[q + 1] - A[q + 1]) * k
    i > 0.01 ? out.lineTo(x, y) : out.moveTo(x, y)
  }
  return out
}

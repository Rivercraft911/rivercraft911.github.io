// The waterfall's picture comes alive: the tesseract turns in four dimensions, drawn as ASCII by a beam
// running faster than any real phosphor could follow. We start to fall.
import { Path } from '../beam/path'
import { text } from '../beam/font'
import { EDGES, project } from '../dsp/tesseract'
import { header } from './header'
import { PICTURE } from './waterfall'
import { TAU, clamp, hash, mix, smooth, view, type Scene } from './scene'

const COLS = 64
const ROWS = 30
const RAMP = ' .:-=+*#%@'
const v = new Float64Array(48)
// Scale so the tesseract starts as large as the waterfall's picture of it.
project(PICTURE.xw, PICTURE.yz, PICTURE.zw, 1, v)
const SIZE = 0.6 / Math.max(...v.filter((_, i) => i % 3 === 1).map(Math.abs))
const grid = new Path()
const wire = new Path()
const label = new Path()

// Distance² from p to segment ab.
function seg2(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax, dy = by - ay, k = clamp(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy + 1e-12))
  return (px - ax - k * dx) ** 2 + (py - ay - k * dy) ** 2
}

export const ascii: Scene = {
  dur: Infinity,
  fade: 2,
  build(t, f) {
    const A = view.a * 0.92, cw = (2 * A) / COLS, ch = 1.44 / ROWS, top = 0.7
    const th = PICTURE.xw + 0.35 * t, ph = PICTURE.yz + 0.22 * t, ps = PICTURE.zw + 0.15 * t * smooth(1, 4, t)
    project(th, ph, ps, SIZE * (1 + 0.05 * t), v)
    const sigma2 = 2 * (0.4 * ch) ** 2

    grid.clear()
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) {
        const x = -A + (c + 0.5) * cw, y = top - (r + 0.5) * ch
        let b = 0, w = 0
        for (const [i, j] of EDGES) {
          const e = Math.exp(-seg2(x, y, v[3 * i], v[3 * i + 1], v[3 * j], v[3 * j + 1]) / sigma2)
          b += e
          w += e * (v[3 * i + 2] + v[3 * j + 2])
        }
        const star = hash(c * 7.13 + Math.floor(r + t * 6) * 131.7) > 0.97 // we fall, the dust rises
        const k = Math.min(RAMP.length - 1, Math.floor(clamp(b * 0.7) * RAMP.length))
        if (!k && !star) continue
        const hue = (w / (b + 1e-9)) * 0.18 + t * 0.03
        if (k) grid.color(0.5 + 0.5 * Math.cos(TAU * hue), 0.5 + 0.5 * Math.cos(TAU * (hue - 0.33)), 0.5 + 0.5 * Math.cos(TAU * (hue - 0.67)), 0.5 + 0.7 * clamp(b))
        else grid.color(0.25, 0.45, 1, 0.35)
        text(grid, k ? RAMP[k] : '.', x, y - ch * 0.32, ch * 0.66, 0.5)
      }
    f.ch.push({ w: 1, path: grid })

    wire.clear()
    for (const [i, j] of EDGES) wire.moveTo(v[3 * i], v[3 * i + 1]).lineTo(v[3 * j], v[3 * j + 1])

    const rate = mix(2.4, 7.2, smooth(0, 6, t))
    label.clear()
    header(label)
    text(label, `R_xw(θ) · R_yz(φ) · R_zw(ψ)    x' = x / (d - w)`, -A, -0.76, 0.05)
    text(label, `θ = ${(th % TAU).toFixed(2)}   φ = ${(ph % TAU).toFixed(2)}   ψ = ${(ps % TAU).toFixed(2)}`, -A, -0.89, 0.05)
    text(label, `BEAM  ${rate.toFixed(2)} MS/s`, A, -0.89, 0.05, 1)
    f.ch.push({ w: 0.12, gain: 0.7, path: label })
    f.rate = rate * 1e6
    f.look = { tau: 0.05 }
    return (tt, o) => wire.at(((tt * 50) % 1) * wire.len, o)
  },
}

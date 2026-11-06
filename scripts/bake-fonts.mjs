// Bakes Hershey single-stroke glyphs into beam paths: cap height 1, baseline 0, y up.
import { writeFileSync } from 'node:fs'
import hershey from 'hersheytext'

const r = (v) => Math.round(v * 1000) / 1000

function bake(name) {
  const out = {}
  hershey.getFontData(name).chars.forEach((g, i) => {
    const strokes = g.d.split('M').filter(Boolean).map((s) =>
      s.replace('L', ' ').trim().split(/\s+/).flatMap((p) => {
        const [x, y] = p.split(',').map(Number)
        return [r(x / 21), r((22 - y) / 21)]
      }))
    out[String.fromCharCode(33 + i)] = [r((2 * g.o) / 21), strokes]
  })
  return out
}

writeFileSync(new URL('../src/beam/glyphs.json', import.meta.url),
  JSON.stringify({ latin: bake('futural'), greek: bake('greek') }))

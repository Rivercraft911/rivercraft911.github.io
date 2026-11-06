// Single-stroke text traced by the beam. `_x` sets x as a subscript; `·` is a dwell of the beam.
// Faces are baked by scripts/bake-fonts.mjs: cap height 1, baseline 0, y up, keyed by character.
import hershey from './fonts/hershey.json'
import type { Path } from './path'

export type Glyph = [advance: number, strokes: number[][]]
export type Face = { name: string; xh: number; g: Record<string, Glyph> }

// Hershey ships with the first frame; the other faces load on demand.
const lazy = import.meta.glob<Face>(['./fonts/*.json', '!./fonts/hershey.json'], { import: 'default' })
export const faces: Record<string, Face> = { hershey: hershey as unknown as Face }
export const FACES = ['hershey', ...Object.keys(lazy).map((k) => k.slice(8, -5))]
export const load = async (id: string) => (faces[id] ??= await lazy[`./fonts/${id}.json`]())

export const font = { face: faces.hershey } // the face text uses unless told otherwise
export const use = (f: Face) => (font.face = f)

const SPACE = 0.6
const SUB = 0.6

export function measure(s: string, size: number, f = font.face) {
  let w = 0
  for (let i = 0; i < s.length; i++) {
    const sub = s[i] === '_' && i + 1 < s.length
    if (sub) i++
    w += (s[i] === '·' ? SPACE : f.g[s[i]]?.[0] ?? SPACE) * (sub ? SUB : 1)
  }
  return w * size
}

// Traces one glyph with its origin at x, y; returns the advance.
export function glyph(p: Path, ch: string, x: number, y: number, size: number, f = font.face) {
  if (ch === '·') return p.dot(x + SPACE * size * 0.5, y + size * 0.45, 0.25 * size), SPACE * size
  const g = f.g[ch]
  if (g) for (const st of g[1]) p.poly(st, false, x, y, size)
  return (g?.[0] ?? SPACE) * size
}

// Draws s with its baseline at y; align 0 = left, 0.5 = center, 1 = right. Returns the advance.
export function text(p: Path, s: string, x: number, y: number, size: number, align = 0, f = font.face) {
  let cx = x - measure(s, size, f) * align
  for (let i = 0; i < s.length; i++) {
    const sub = s[i] === '_' && i + 1 < s.length
    if (sub) i++
    cx += glyph(p, s[i], cx, sub ? y - size * 0.25 : y, sub ? size * SUB : size, f)
  }
  return cx - x
}

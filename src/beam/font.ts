// Hershey single-stroke text, traced by the beam. `_x` sets x as a subscript.
import glyphs from './glyphs.json'
import type { Path } from './path'

type Glyph = [number, number[][]]
const latin = glyphs.latin as unknown as Record<string, Glyph>
const greek = glyphs.greek as unknown as Record<string, Glyph>
const GREEK: Record<string, string> = {
  α: 'a', β: 'b', γ: 'g', δ: 'd', ε: 'e', ζ: 'z', η: 'h', θ: 'q', λ: 'l', μ: 'm',
  π: 'p', ρ: 'r', σ: 's', τ: 't', φ: 'f', ψ: 'y', ω: 'w', Σ: 'S', Δ: 'D', Φ: 'F', Ω: 'W',
}
const SPACE = 0.6
const SUB = 0.6

const glyph = (ch: string): Glyph | undefined => (GREEK[ch] ? greek[GREEK[ch]] : latin[ch])

export function measure(s: string, size: number) {
  let w = 0
  for (let i = 0; i < s.length; i++) {
    const sub = s[i] === '_' && i + 1 < s.length
    if (sub) i++
    w += (s[i] === '·' ? SPACE : glyph(s[i])?.[0] ?? SPACE) * (sub ? SUB : 1)
  }
  return w * size
}

// Draws s with its baseline at y; align 0 = left, 0.5 = center, 1 = right. Returns the advance.
export function text(p: Path, s: string, x: number, y: number, size: number, align = 0) {
  let cx = x - measure(s, size) * align
  for (let i = 0; i < s.length; i++) {
    const sub = s[i] === '_' && i + 1 < s.length
    if (sub) i++
    const k = sub ? size * SUB : size, by = sub ? y - size * 0.25 : y
    if (s[i] === '·') {
      p.dot(cx + SPACE * k * 0.5, by + k * 0.45, 0.25 * k)
      cx += SPACE * k
      continue
    }
    const g = glyph(s[i])
    if (g) for (const st of g[1]) p.poly(st, false, cx, by, k)
    cx += (g?.[0] ?? SPACE) * k
  }
  return cx - x
}

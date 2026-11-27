// R1 · ASCII. The whirlpool read out as text, the way radio amateurs sent pictures by teleprinter: every
// cell of the water's light becomes the glyph whose ink is laid out most like the light behind it, so the
// foam winding in is the dense ones, each glyph in the colour of the light it reads, so the spectrum's arms
// stay their frequencies. The glyphs are a teleprinter's: the ITA2 set, drawn once by the beam, so every
// character on screen is one RTTY could send.
import { place, sing } from './choir'
import { ASCII as DUR, LEAD, WRAP } from './clock'
import { EARLY, INK, dive } from './dive'
import { OVER, fly, vortex } from './wrap'
import { smooth, type Scene } from './scene'

export const CHARS = " ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-?:$!&#'().,\"/;"

// The whirlpool goes on underneath and we go on down it (wrap.ts flies us): the text spreads over the water
// like an infection along the spiral; the drain opens under it, and at the last we are over it and fall down
// its throat, its streaks glyphs too, darker the further down; and once we are inside it, it is the top of the dive's
// shaft (dive.ts), which carries the picture on from there.
const SPREAD = 0.9 // how long the infection takes
export const ascii: Scene = {
  dur: DUR,
  build(t, f) {
    if (t >= DUR - EARLY) {
      dive.build(t - DUR, f)
      return (tt, o) => sing(tt + WRAP + LEAD, o)
    }
    const T = t + WRAP, fld = vortex(T, (f.at ?? 0) + t, f, 1, 1 - smooth(OVER - WRAP, OVER - WRAP + 0.5, t)), p = fld.p
    fly(T)
    p[46] = 1.3 * Math.min(1, t / SPREAD)
    fld.cell = 14
    fld.fine = 2 // the water round the text is light, at the raster's own resolution
    fld.ink = INK
    fld.tint = 1
    fld.lift = 40 // moonlit foam is dim light: a little of it fills a cell
    place(T + LEAD)
    return (tt, o) => sing(tt + WRAP + LEAD, o)
  },
}

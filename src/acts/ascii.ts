// R1 · ASCII. The whirlpool read out as text, the way radio amateurs sent pictures by teleprinter: every
// cell of the water's light becomes the glyph whose ink is laid out most like the light behind it, so the
// moonlit foam winding in is the dense ones. The glyphs are a teleprinter's: the ITA2 set, drawn once by the
// beam, so every character on screen is one RTTY could send.
import { place, sing } from './choir'
import { ASCII as DUR, LEAD, WRAP } from './clock'
import { OVER, fly, vortex } from './wrap'
import { smooth, type Scene } from './scene'

export const CHARS = " ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-?:$!&#'().,\"/;"

const INK = [0.62, 0.8, 1].map((c) => 3 * c ** 2.2) // the foam's moonlit white, in linear light

// The whirlpool goes on underneath and we go on down it (wrap.ts flies us): the text spreads over the water
// like an infection along the spiral; the drain opens under it, and at the last we are over it and fall down
// its throat, its streaks glyphs too, into the dark.
const SPREAD = 0.9 // how long the infection takes
export const ascii: Scene = {
  dur: DUR,
  build(t, f) {
    const T = t + WRAP, dark = smooth(DUR - 0.6, DUR, t), fld = vortex(T, (f.at ?? 0) + t, f, 1, 1 - smooth(OVER - WRAP, OVER - WRAP + 0.5, t)), p = fld.p
    fly(T)
    p[46] = 1.3 * Math.min(1, t / SPREAD), p[47] = dark
    fld.cell = 14
    fld.fine = 2 // the water round the text is light, at the raster's own resolution
    fld.ink = INK
    fld.lift = 40 // moonlit foam is dim light: a little of it fills a cell
    place(T + LEAD)
    return (tt, o) => sing(tt + WRAP + LEAD, o)
  },
}

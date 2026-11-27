// The waves become rivers. The sine and the fan of waves it modulates stop being heights and become
// headings: a river turns by θ(s) as it runs, z(s) = ∫ e^{iθ} ds, its tangent the very FM the scope drew,
// its curvature the carrier's quickening. Each wave folds into its river, the sine into the river itself and
// every member of the fan into one of a sheaf around it, ω its index, from one bank's oxbows to the other's,
// the carrier smoothing out as it goes. It is the sine-generated meander (Langbein & Leopold, 1966): the
// river makes J₀(ω) of its length in headway, so the outermost, at J₀'s first zero, 2.405, close up into
// figure eights and go nowhere. The bends migrate downstream, as real ones do. Then a second, longer bend
// joins, the sheaf combs out into one river and the lines either side of it, which settle onto the land's own
// contours; they run off downstream, and what is left is the valley's river seen from above, where it lies.
// The speakers trace the sine's river and the outermost pair, as the scope traced the sine and its pair, then
// the sheaf combed out.
import { GREEN } from '../beam/beam'
import { Path } from '../beam/path'
import { SHARP, screen, tune } from '../beam/scope'
import { CLOSED, CYC, DUR as HOOK, FANNED, J0, NC, PR, SEAT, SWEPT, wave } from './hook'
import { say } from './say'
import { CI, LEVELS, M1, M2, MEANDER as END, PHI, RIVER_EQ, SPRING, W1, W2, WIDE, contour, glow, map, reach, riverY, room } from './valley'
import { TAU, cam, clamp, lock, mix, smooth, view, type Scene } from './scene'

const WATER = [0.5, 0.78, 1] as const, INK = [0.78, 0.88, 1] as const
const REACH = 90 // metres of river drawn, at most
const SA = CYC * M1 // what the speakers trace of each: as much as the sweep was
const STOP = 2.6 // the second bend joins
const DRY = 3.75 // the hero comes up to the valley's brightness from here; the contours stay, and the valley takes them on

// Each frame's state: how far the frame has settled from the hook's (origin ox, oy; kh units a metre) into
// the valley's map, how far the bends have migrated (v, in bends), and the level a ring of light has climbed
// to, spreading up the land from the water.
let seat = 0, ox = 0, oy = 0, kh = 0, v = 0, now = 0, set = 0, ring = -9
const q = { x: 0, y: 0, z: 0 }
// dx metres downstream of the spring and dz across it, on the screen (−z is up on the map): on a level
// sheet until the sheaf settles (set) onto the land, which steps down with the river, each line to its own
// contour's height h above it, where the valley carries it on.
function put(dx: number, dz: number, h = 0) {
  cam.project(SPRING + dx, mix(riverY(SPRING), riverY(SPRING + dx) + h, set), dz, q)
  q.x = mix(ox + kh * dx, q.x, seat), q.y = mix(oy - kh * dz, q.y, seat)
}

// One river, from z0 across the spring: θ(s) = a·S(s) + b sin(2πs/M₂ + φ), S = sin(2π(s/M₁ − v)),
// integrated a step ds at a time as the valley integrates its own, a vertex every `every` steps. fold < 1 is
// on the way from the wave it was, the scope's member with index b0 and n carrier cycles across; level > 0
// leans a line onto its contour as the sheaf settles. The hero (level 0) carries the current's glow. Each
// vertex as far as the sweep reached goes to the speakers' stroke, if one is given. Unfolded, it is only as
// long as the sweep it was, and it runs on past the sweep's end as it folds; and a wave the sweep drew (the
// share of its passes, swept) is lit as the sweep lit it, by time and not length, brightest where it runs
// flat, until it folds into a river and is lit along its length.
const AMP = (SEAT.r * CYC * M1) / (2 * view.a * 0.9) // the wave's height, in metres of the hook's frame
function strand(p: Path, a: number, b: number, z0: number, fold: number, i0: number, n: number, b0: number, ds: number, every: number, side = 0, level = 0, rec?: number[], swept = 0) {
  let x = 0, z = z0, pen = false, px = NaN, py = NaN
  const end = SA + (REACH - SA) * clamp(fold), h = level ? (level - 0.5) * CI : 0, du = (ds * every) / SA, f = clamp(fold)
  if (rec) rec.length = 0
  for (let k = 0, s = 0; s < end + 1e-6; k++, s += ds) {
    const S = Math.sin(TAU * (s / M1 - v))
    if (k % every === 0) {
      const zz = level && set > 0 ? mix(z, contour(side, level - 1, SPRING + x), set) : z, u = s / SA
      put(mix(s, x, fold), mix(-AMP * (b0 || n !== CYC ? wave(u, n, b0) : S), zz, fold), h)
      if (q.x > view.a + 0.05 && (!rec || s > SA)) break
      const own = i0 * (level ? 1 + 3 * Math.exp(-(((level - ring) / 2) ** 2)) : glow(reach(SPRING + x), now))
      const i = room(q.y) * (swept && f < 1 ? mix((SWEPT * swept * du) / (Math.hypot(q.x - px, q.y - py) || kh * ds * every), own, f) : own)
      ;(px = q.x), (py = q.y)
      const seen = i > 0.01 && q.y > -1.05 && q.x > -view.a - 0.05 && q.x < view.a + 0.05
      if (rec && s <= SA + 1e-6) seen ? rec.push(q.x, q.y) : rec.push(NaN, NaN) // what is not drawn is not traced
      if (!seen) pen = false
      else {
        p.intensity(i)
        pen ? p.lineTo(q.x, q.y) : p.moveTo(q.x, q.y)
        pen = true
      }
    }
    const th = a * S + b * Math.sin((TAU * s) / M2 + PHI)
    ;(x += ds * Math.cos(th)), (z -= ds * Math.sin(th))
  }
}

// The live equation: the heading the sine became, then the two the valley's river is made of. a is how far
// the bends have migrated, σ the hero's sinuosity, its length over its headway, 1/J₀(ω).
const SINE = 'z(s) = \\int_0^s e^{i \\theta} ds,\\; \\theta = \\omega \\sin(2\\pi (s - a) / M)'

// The speakers trace the sine's river and the outermost pair, forth and back as the sweep did, on the
// sweep's own clock, so they go on from the hook without a seam; then, from the first refresh after PAIR, the
// sheaf combed out, swung forth over one page and back over the other at A: three rivers a side, then four
// others, each page beginning and ending with the sine's river, so the swing has no flyback.
const PAIR = 1.2, CYCLES = tune([[0, PR / 4], [PAIR, 55]], (PR * HOOK) / 4) // a whole refresh at PAIR
const FOUR = [0, LEVELS, 0, -LEVELS] // levels by side, −z (the far bank) first
const PAGES = [[0, -11, -7, -3, 3, 7, 11, 0], [0, -13, -9, -5, -1, 1, 5, 9, 13, 0]], BOTH = PAGES.flat()
const sc = screen, recs = new Map([...FOUR, ...BOTH].map((l) => [l, [] as number[]]))

const sheaf = new Path(), c = [0, 0, 0]
const tint = (a: readonly number[], b: readonly number[], k: number) => ((c[0] = mix(a[0], b[0], k)), (c[1] = mix(a[1], b[1], k)), (c[2] = mix(a[2], b[2], k)), c)

export const meander: Scene = {
  dur: END,
  build(t, f) {
    const T = HOOK + t, A = view.a * 0.9
    map()
    ;(v = -0.25 + 1.25 * smooth(0, 3.2, t)), (now = t)
    seat = clamp(lock([[0, 0], [0.25, 1]], t, 5, 0.8)), (ox = -A), (oy = SEAT.cy), (kh = (2 * A) / SA)

    // the hero's ω swells and comes home; the sheaf combs out
    const w = lock([[0, 0.9], [1.3, 1.45], [2.5, W1]], t, 8, 0.75), w2 = W2 * smooth(STOP, STOP + 0.6, t)
    const comb = clamp(lock([[0, 0], [2.5, 1]], t, 6, 0.8))
    const wet = smooth(0.2, 1.1, t)
    ;(set = smooth(2.9, 3.5, t)), (ring = (t - 3.25) * 2.2 * LEVELS)
    const fold = (from: number) => clamp(lock([[0, 0], [from, 1]], t, 12, 0.7), 0, 1.15)
    const order = t < PAIR ? FOUR : BOTH, rec = (level: number) => (order.includes(level) ? recs.get(level) : undefined)

    sheaf.clear()
    for (let l = 1; l <= LEVELS; l++)
      for (const side of [-1, 1]) {
        const k = fold(0.14 + (0.5 * l) / LEVELS), z0 = contour(side, l - 1, SPRING), b0 = (side * CLOSED * l) / LEVELS
        const ink = tint(tint(GREEN, WATER, wet), INK, comb)
        sheaf.color(ink[0], ink[1], ink[2])
        strand(sheaf, mix(b0, w, comb), w2 * comb, comb * (z0 === z0 ? z0 : side * 12), k, 0.22 * (FANNED.includes(l) ? mix(0.5, 1, Math.min(1, k)) : Math.min(1, k)), NC, b0, 0.1, 1, side, l, rec(side * l), l === LEVELS ? 0.25 : 0)
      }
    const ink = tint(GREEN, WATER, wet)
    sheaf.color(ink[0], ink[1], ink[2])
    strand(sheaf, w, w2, 0, fold(0.08), mix(1.5, 1, smooth(DRY, END, t)), CYC, 0, 0.02, 5, 0, 0, rec(0), 0.5) // as bright as the valley will draw it, by the end
    f.ch.push({ w: 1, path: sheaf, gain: mix(1, WIDE, smooth(0.3, 3.5, t)) }) // opening to the valley's first exposure, which carries it on

    // the speakers' picture: each stroke forth or back in turn, as the sweep's passes were
    const pages = t < PAIR ? 1 : 2
    sc.clear(pages)
    for (let p = 0; p < pages; p++) {
      const strokes = pages > 1 ? PAGES[p] : FOUR
      sc.page(1 << p)
      for (let r = 0; r < strokes.length; r++) {
        const s = recs.get(strokes[r])!, m = s.length / 2
        let pen = false
        for (let j = 0; j < m; j++) {
          const i = r & 1 ? m - 1 - j : j, x = s[2 * i], y = s[2 * i + 1]
          if (x !== x) pen = false
          else pen ? sc.lineTo(x, y, 1) : ((pen = true), sc.moveTo(x, y))
        }
      }
    }
    sc.commit(T)

    const a = M1 * (v + 0.25)
    if (t < STOP) say.say(f, T, SINE, ink, [['\\omega', w, 2], ['a', a, 1], ['\\sigma', 1 / J0(w), 3]])
    else say.say(f, T, RIVER_EQ, WATER, [['\\omega_1', w, 2], ['\\omega_2', w2, 2], ['M_1', M1, 0], ['M_2', M2, 0]])

    f.rate = 2.4e6
    return (tt, o) => {
      sc.play(CYCLES(tt), tt, o, 1, SHARP, tt >= PAIR)
    }
  },
}

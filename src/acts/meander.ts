// The wave becomes rivers. The chain's height stops being a height and becomes a heading: a river turns
// by θ(s) = ω·S as it runs, z(s) = ∫ e^{iθ} ds, so the square's flat tops are straight reaches and the
// chart folds into a zigzag. Not one river but a sheaf, every ω from one bank's oxbows to the other's,
// and the chain at their spring still turning, so the bends migrate downstream as real ones do. Then the
// harmonics let go, the highest first, and the elbows round off into the curve rivers follow, the
// sine-generated meander (Langbein & Leopold, 1966). Its tangent e^{iθ} is phase modulation with index
// ω: the river makes J₀(ω) of its length in headway, so as ω swells toward J₀'s first zero, 2.405, the
// outermost close up into figure eights and go nowhere. The chain stops; a second, longer bend joins;
// the sheaf combs out into one river and the lines either side of it, which settle onto the land's own
// contours. They run off downstream, and what is left is the valley's river seen from above, where it lies.
import { GREEN } from '../beam/beam'
import { Path } from '../beam/path'
import { DUR as HOOK, F, HI, PER, SEAT, STOP as HALT, W, Y, at, chain, say, sing, sweep, tune, turn } from './hook'
import { LEVELS, M1, M2, MEANDER as END, PHI, RIVER_EQ, SPRING, W1, W2, contour, glow, map, reach, riverY } from './valley'
import { TAU, cam, clamp, lock, mix, smooth, view, type Scene } from './scene'

const WATER = [0.5, 0.78, 1] as const, INK = [0.78, 0.88, 1] as const
const REACH = 90 // metres of river drawn, at most
const CEIL = 0.72 // the equation's room
const CLOSED = 2.405 // J₀'s first zero
const STOP = HALT - HOOK // the chain has stopped
const DRY = 3.75 // the hero comes up to the valley's brightness from here; the contours stay, and the valley takes them on

// Each frame's state: how far the frame has settled from the hook's (origin ox, oy; kh units a metre) into
// the valley's map, the chain's turn, and the level a ring of light
// has climbed to, spreading up the land from the water.
let seat = 0, ox = 0, oy = 0, kh = 0, u = 0, now = 0, set = 0, ring = -9
const q = { x: 0, y: 0, z: 0 }
// dx metres downstream of the spring and dz across it, on the screen (−z is up on the map): on a level
// sheet until the sheaf settles (set) onto the land, which steps down with the river.
function put(dx: number, dz: number) {
  cam.project(SPRING + dx, mix(riverY(SPRING), riverY(SPRING + dx), set), dz, q)
  q.x = mix(ox + kh * dx, q.x, seat), q.y = mix(oy - kh * dz, q.y, seat)
}

// The hero as it was last drawn, for the speakers.
const HN = 1024, hx = new Float32Array(HN), hy = new Float32Array(HN)
let hn = 0

// One river, from z0 across the spring: θ(s) = a·S(u − s/M₁) + b sin(2πs/M₂ + φ), S the chain's height
// (a square stands π/4 tall), integrated a step ds at a time as the valley integrates its own, a vertex
// every `every` steps. fold < 1 is on the way from the chart, where S was a height; level > 0 leans a
// line onto its contour as the sheaf settles. The hero (level 0) carries the current's glow.
const AMP = (4 / Math.PI) * SEAT.r * ((PER * M1) / 2) // the chart's height, in metres of the hook's frame
function strand(p: Path, a: number, b: number, z0: number, fold: number, i0: number, ds: number, every: number, side = 0, level = 0) {
  let x = 0, z = z0, pen = false
  for (let n = 0, s = 0; s < REACH; n++, s += ds) {
    const v = u - s / M1, S = W[0] * Math.sin(TAU * v) + at(HI, v)
    if (n % every === 0) {
      const zz = level && set > 0 ? mix(z, contour(side, level - 1, SPRING + x), set) : z
      put(mix(s, x, fold), mix(-AMP * S, zz, fold))
      if (q.x > view.a + 0.05) break
      const i = i0 * (1 - smooth(CEIL - 0.12, CEIL, q.y)) * (level ? 1 + 3 * Math.exp(-(((level - ring) / 2) ** 2)) : glow(reach(SPRING + x), now))
      if (!(i > 0.01) || !(q.y > -1.05) || q.x < -view.a - 0.05) pen = false
      else {
        p.intensity(i)
        pen ? p.lineTo(q.x, q.y) : p.moveTo(q.x, q.y)
        pen = true
        if (!level && hn < HN) (hx[hn] = q.x), (hy[hn++] = q.y)
      }
    }
    const th = a * S + b * Math.sin((TAU * s) / M2 + PHI)
    ;(x += ds * Math.cos(th)), (z -= ds * Math.sin(th))
  }
}

// The live equation: the chain's height as a heading, the one sine it comes down to, then the two the
// valley's river is made of. a is how far the bends have migrated.
const ZIG = 'z(s) = \\int_0^s e^{i \\theta} ds,\\; \\theta = \\omega \\sum_{n = 1, 3, \\ldots}^{N} \\frac{\\sin(2\\pi n (s - a) / M)}{n}'
const SINE = 'z(s) = \\int_0^s e^{i \\theta} ds,\\; \\theta = \\omega \\sin(2\\pi (s - a) / M)'

// The speakers retrace the hero there and back at a note, an octave up at each turn of events, arriving
// on the valley's first. The phase is carried across each change.
const NOTES = [[0, 2], [1.9, 3], [3.3, 4]], CYC = [0]
for (let i = 1; i < NOTES.length; i++) CYC.push(CYC[i - 1] + 55 * NOTES[i - 1][1] * (NOTES[i][0] - NOTES[i - 1][0]))
function cycles(tt: number) {
  let i = NOTES.length - 1
  while (i > 0 && tt < NOTES[i][0]) i--
  return CYC[i] + 55 * NOTES[i][1] * (tt - NOTES[i][0])
}

const sheaf = new Path(), gear = new Path(), c = [0, 0, 0]
const tint = (a: readonly number[], b: readonly number[], k: number) => ((c[0] = mix(a[0], b[0], k)), (c[1] = mix(a[1], b[1], k)), (c[2] = mix(a[2], b[2], k)), c)

export const meander: Scene = {
  dur: END,
  build(t, f) {
    const T = HOOK + t, A = view.a * 0.9, N = tune(T)
    map()
    ;(u = turn(T)), (now = t), (hn = 0)
    seat = clamp(lock([[0, 0], [0.25, 1]], t, 5, 0.8)), (ox = -A), (oy = SEAT.cy), (kh = (2 * A) / (PER * M1))

    // the hero's ω swells and comes home; the sheaf's widest reaches for the figure eight, then combs out
    const w = lock([[0, 0.9], [1.3, 1.45], [2.5, W1]], t, 8, 0.75), w2 = W2 * smooth(STOP, STOP + 0.6, t)
    const wide = Math.min(CLOSED, lock([[0, 1.2], [0.9, CLOSED]], t, 4, 0.9)), comb = clamp(lock([[0, 0], [2.5, 1]], t, 6, 0.8))
    const wet = smooth(0.2, 1.1, t)
    ;(set = smooth(2.9, 3.5, t)), (ring = (t - 3.25) * 2.2 * LEVELS)
    const fold = (from: number) => clamp(lock([[0, 0], [from, 1]], t, 12, 0.7), 0, 1.15)

    sheaf.clear()
    for (let l = 1; l <= LEVELS; l++)
      for (const side of [-1, 1]) {
        const k = fold(0.14 + (0.5 * l) / LEVELS), z0 = contour(side, l - 1, SPRING)
        if (k < 0.02) continue
        const ink = tint(tint(GREEN, WATER, wet), INK, comb)
        sheaf.color(ink[0], ink[1], ink[2])
        strand(sheaf, mix((side * wide * l) / LEVELS, w, comb), w2 * comb, comb * (z0 === z0 ? z0 : side * 12), k, 0.2 * Math.min(1, 2 * k), 0.1, 1, side, l)
      }
    const ink = tint(GREEN, WATER, wet)
    sheaf.color(ink[0], ink[1], ink[2])
    strand(sheaf, w, w2, 0, fold(0.08), mix(1.5, 1, smooth(DRY, END, t)), 0.02, 5) // as bright as the valley will draw it, by the end
    f.ch.push({ w: 1, path: sheaf })

    // the chain, at the spring now, small and face on again, until it stops; and the scope's own trace of
    // its height, the chart the rivers fold out of, while the speakers still play it
    const hand = smooth(0.05, 0.6, t), turning = 1 - smooth(STOP - 0.5, STOP + 0.2, t)
    cam.project(SPRING, riverY(SPRING), 0, q)
    const cx = mix(-A, q.x, seat), cy = mix(SEAT.cy, q.y, seat), g = (4 / Math.PI) * A * mix(SEAT.r, 0.04, seat)
    if (turning > 0) chain(gear.clear(), cx, cy, g, u, seat, turning), f.ch.push({ w: 0.15, path: gear })
    if (hand < 1)
      f.ch.push({
        w: 1 - hand,
        fn: (tt, s) => {
          const l = sweep(HOOK + tt)
          put(l * M1, -AMP * at(Y, F * (HOOK + tt)))
          s.x = q.x, s.y = q.y, s.z = l > 0.985 * PER ? 0 : 0.8
        },
      })

    let run = 0 // the hero's sinuosity: its length over its headway, 1/J₀(ω) once it is one sine
    for (let i = 0; i < 256; i++) run += Math.cos(w * Y[i * 8])
    const a = M1 * (u + 0.5)
    if (t < STOP) say.say(f, T, N > 1 ? ZIG : SINE, ink, [['\\omega', w, 2], ['N', N, 0], ['a', a, 1], ['\\sigma', 256 / run, 3]])
    else say.say(f, T, RIVER_EQ, WATER, [['\\omega_1', w, 2], ['\\omega_2', w2, 2], ['M_1', M1, 0], ['M_2', M2, 0]])

    f.rate = 2.4e6
    let y0 = 0
    for (let i = 0; i < hn; i++) y0 += hy[i] / hn
    const vol = mix(0.45, 0.27, smooth(DRY, END, t)) / A // down to the level the valley takes it up at, on the same phase
    return (tt, o) => {
      if (hand < 1) sing(HOOK + tt, o, Math.PI / 2, 1 - hand)
      if (hn < 2) return
      const ph = (cycles(tt) % 1) * 2, v = (ph < 1 ? ph : 2 - ph) * (hn - 1), i = Math.min(hn - 2, Math.floor(v)), k = v - i
      o.l += hand * vol * (hx[i] + (hx[i + 1] - hx[i]) * k), o.r += hand * vol * 1.6 * (hy[i] + (hy[i + 1] - hy[i]) * k - y0)
    }
  },
}

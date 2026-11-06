// Type specimen (?specimen): every baked single-stroke face drawn by the beam, then the toolkit's
// morphs mid-flight. A bench for choosing the intro's typeface, not part of the intro.
import { Path } from '../beam/path'
import { FACES, faces, load, measure, text, use, type Face } from '../beam/font'
import { draw, eq, morphEq, roll, tex } from '../beam/math'
import { morph } from '../beam/morph'
import { TAU, cam, lock, note, smooth, view, type Scene } from './scene'

const FIRST = 3 // the overview, then one face per PAGE seconds, then the morph bench
const PAGE = 3
const MORPH = FIRST + PAGE * FACES.length
const EQ1 = 'x(t) + i\\,y(t) = \\sum_{n=-N}^{N} c_n\\, e^{i n \\omega_0 t}'
const EQ2 = '\\frac{1}{2\\pi} \\int f(t)\\, e^{-i\\omega t}\\, dt'
const GREEKS = 'αβγδεζηθλμνξπρστφψω  ΓΔΘΛΣΦΨΩ  ∂∇∞∫±·×→≈≤'

const big = new Path(), body = new Path(), small = new Path(), notes = new Path()
const a = new Path(), b = new Path(), m = new Path()
const mid = eq()
let loading = false

function page(f: Face) {
  const A = view.a * 0.9
  const name = 'RIVER DOWDY  KJ5SCH', size = Math.min(0.24, (2 * A) / measure(name, 1, f))
  text(small, f.name, -A, 0.84, 0.05, 0, f)
  text(big, name, 0, 0.36, size, 0.5, f)
  text(body, 'signals · silicon · light · orbit', 0, 0.1, 0.085, 0.5, f)
  draw(body, tex(EQ1, f), 0, -0.3, 0.11, 0.5)
  draw(body, tex(EQ2, f), 0, -0.66, 0.11, 0.5)
  text(small, GREEKS, 0, -0.9, 0.055, 0.5, f)
}

function overview() {
  const A = view.a * 0.9, n = FACES.length
  FACES.forEach((id, j) => {
    const f = faces[id], y = 0.78 - (j * 1.7) / (n - 1)
    if (!f) return
    text(small, f.name, -A, y, 0.045, 0, f)
    text(big, 'RIVER DOWDY  KJ5SCH', -A * 0.55, y, 0.07, 0, f)
    draw(body, tex('e^{i\\omega t} = \\cos\\omega t + i\\, \\sin\\omega t', f), A, y, 0.065, 1)
  })
}

// The bench: an equation re-arranging itself term by term, a term peeling off into the curve it
// names, a loop-locked readout rolling its digits, and notes on a camera-projected helix.
const E0 = '@x{x(t)} = @A{A}\\, @c{\\cos} (@w{\\omega} @t{t} + @p{\\varphi})'
const E1 = '@x{x(t)} = \\frac{@A{A}}{2} (e^{i(@w{\\omega} @t{t} + @p{\\varphi})} + e^{-i(@w{\\omega} @t{t} + @p{\\varphi})})'
const KEYS = [[0, 0], [1, 1], [5.2, 0]] as const
const READ = [[0, 2.4], [1, 9.97], [3.5, 12.5]] as const
const P = { x: 0, y: 0, z: 0 }

function bench(t: number) {
  const A = view.a * 0.9, k = lock(KEYS, t, 4, 0.55)
  use(faces.relief ?? faces.hershey)
  draw(body, morphEq(tex(E0), tex(E1), k, mid), 0, 0.62, 0.1, 0.5)

  // "A cos(ωt)" written by the beam, flying off into the wave it describes
  a.clear()
  draw(a, tex('A\\cos(\\omega t)'), -A, -0.1, 0.1)
  b.clear()
  for (let j = 0; j <= 200; j++) b.lineTo(-A + (j / 200) * 1.6, -0.1 + 0.2 * Math.cos((j / 200) * 3 * TAU))
  morph(a, b, smooth(0.5, 2.1, t), m, 600)

  // the loop-locked readout, odometer digits overshooting and settling
  const v = lock(READ, t, 6, 0.35)
  const w = text(small, 'f_0 = ', 0.35, -0.12, 0.07)
  roll(small, v, 0.35 + w + 0.32, -0.12, 0.07, 2, 1)
  text(small, 'MHz', 0.35 + w + 0.38, -0.12, 0.07)

  // a helix seen through the camera, with notes that dodge each other
  cam.aim(2.2 * Math.cos(0.3 * t), 0.8, 2.2 * Math.sin(0.3 * t), 0, 0, 0, 0.9)
  notes.clear()
  for (let j = 0; j <= 240; j++) {
    const u = j / 240, ok = cam.project(0.5 * Math.cos(u * 4 * TAU), u * 1.2 - 0.6, 0.5 * Math.sin(u * 4 * TAU), P)
    const x = 0.3 * P.x - A * 0.45, y = 0.3 * P.y - 0.62
    notes.intensity(ok ? P.z : 0)
    j ? notes.lineTo(x, y) : notes.moveTo(x, y)
  }
  notes.intensity(1)
  const tip = notes.tip()
  note(notes, tip[0], tip[1], 'r = 0.5', 1)
  note(notes, tip[0] - 0.01, tip[1] - 0.03, 'pitch 2π v/ω', 1)
  note(notes, -A * 0.45, -0.62, 'axis', -1)
}

export const specimen: Scene = {
  dur: MORPH + 6,
  build(t, f) {
    if (!loading) (loading = true), FACES.forEach(load)
    big.clear(), body.clear(), small.clear(), notes.clear(), m.clear()
    if (t < FIRST) overview()
    else if (t < MORPH) {
      const f = faces[FACES[Math.floor((t - FIRST) / PAGE)]]
      if (f) page(f)
    } else bench(t - MORPH)
    f.ch.push({ w: 1, gain: 0.9, path: big }, { w: 1, gain: 0.8, path: body }, { w: 0.5, gain: 0.6, path: small })
    if (t >= MORPH) f.ch.push({ w: 0.5, gain: 0.8, path: m }, { w: 0.4, gain: 0.6, path: notes })
    f.rate = 4e6
    f.look = { tau: 0.05 }
  },
}

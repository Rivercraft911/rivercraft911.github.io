// R5 · Ophanim, "their rims were full of eyes round about" (Ezekiel 1:18): four dimensions. First a
// quaternion Julia set, sliced by a hyperplane that turns through 4D (julia4.wgsl). Then a jump, and the
// polytopes inscribed in S³ turn through 4D, seen stereographically: the raster sweeps the tesseract and
// grows it into the 24-cell (polytope.wgsl), and the beam draws the 600-cell around it. All three are
// the unit quaternions of the binary icosahedral group or subsets of it: its 16 elements (±½, ±½, ±½, ±½)
// are the tesseract, with the 8 units ±1, ±i, ±j, ±k the 24-cell, and with the 96 even permutations of
// ½(±φ, ±1, ±1/φ, 0) all 120 vertices of the 600-cell. They fall into 12 cosets of a cyclic subgroup of
// order 10, each a great circle of S³, a Hopf fiber through ten vertices: twelve wheels, every one linked
// with every other, with eyes on their rims, open on alternate symbols. One rotation s ↦ L s R carries
// raster and beam alike. The choir's dread is full, its period back to the octave; the speakers play one
// fiber's field, E_x left and E_y right, through a turning waveplate.
import { Path } from '../beam/path'
import { fiber, turn, type Point4 } from '../dsp/hopf'
import { JULIA4, POLYTOPE } from '../gpu/fields'
import type { Field } from '../gpu/raster'
import { place, sing } from './choir'
import { aim, equation, jump, project, seen, splice } from './reality'
import { AT as R4, DUR as R4DUR } from './stutter'
import { TAU, mix, smooth, type Scene } from './scene'

export const AT = R4 + R4DUR
export const DUR = 10
const CUT = 3.5 // the Julia set gives way to the polytopes

// The binary icosahedral group, as flat x, y, z, w: the 24-cell first (its 16 tesseract vertices at 8),
// then the rest of the 600-cell; and the 600-cell's 720 edges, between vertices 36° apart.
const PHI = (1 + Math.sqrt(5)) / 2
const perms = (a: number[]): number[][] => (a.length < 2 ? [a] : a.flatMap((x, i) => perms(a.filter((_, j) => j !== i)).map((p) => [x, ...p])))
const even = perms([0, 1, 2, 3]).filter((p) => p.reduce((n, x, i) => n + p.slice(i + 1).filter((y) => y < x).length, 0) % 2 === 0)
const V: number[] = []
for (let i = 0; i < 8; i++) V.push(...[0, 1, 2, 3].map((j) => (j === i >> 1 ? (i & 1 ? -1 : 1) : 0)))
for (let k = 0; k < 16; k++) V.push(...[0, 1, 2, 3].map((b) => ((k >> b) & 1 ? -0.5 : 0.5)))
for (const p of even)
  for (let k = 0; k < 8; k++) {
    const v = [0, 0, 0, 0], base = [PHI / 2, 0.5, 1 / (2 * PHI)]
    base.forEach((b, j) => (v[p[j]] = (k >> j) & 1 ? -b : b))
    V.push(...v)
  }
const N = V.length / 4
const q4 = [0, 0, 0, 0], r4 = [0, 0, 0, 0], s4 = [0, 0, 0, 0], v4 = [0, 0, 0, 0], g4 = [0, 0, 0, 0]
const E: number[] = []
for (let a = 0; a < N; a++) for (let b = a + 1; b < N; b++) if (V[4 * a] * V[4 * b] + V[4 * a + 1] * V[4 * b + 1] + V[4 * a + 2] * V[4 * b + 2] + V[4 * a + 3] * V[4 * b + 3] > 0.8) E.push(a, b)
// The wheels: g = (cos 36°, sin 36° n) has order 10, and the cosets x⟨g⟩ are the great circles x e^{θn}.
const AXIS = [1, 1 / PHI, 0].map((c) => c / Math.hypot(1, 1 / PHI))
const WHEELS: number[] = [], taken = new Uint8Array(N)
for (let a = 0; a < N; a++) {
  if (taken[a]) continue
  taken[a] = 1
  WHEELS.push(a)
  for (let b = 0; b < N; b++) {
    // b is on a's wheel when a⁻¹b is a power of g: real part cos(36°k), vector part along n
    const q = mul(conj(at(a)), at(b, [0, 0, 0, 0]))
    if (Math.abs(q[1] * AXIS[1] - q[2] * AXIS[0]) + Math.abs(q[3]) < 1e-6) taken[b] = 1
  }
}

function mul(a: ArrayLike<number>, b: ArrayLike<number>, o = [0, 0, 0, 0]) {
  const [a0, a1, a2, a3] = [a[0], a[1], a[2], a[3]], [b0, b1, b2, b3] = [b[0], b[1], b[2], b[3]]
  o[0] = a0 * b0 - a1 * b1 - a2 * b2 - a3 * b3
  o[1] = a0 * b1 + a1 * b0 + a2 * b3 - a3 * b2
  o[2] = a0 * b2 - a1 * b3 + a2 * b0 + a3 * b1
  o[3] = a0 * b3 + a1 * b2 - a2 * b1 + a3 * b0
  return o
}
function conj(v: ArrayLike<number>) {
  return [v[0], -v[1], -v[2], -v[3]]
}
// Vertex i, into o.
function at(i: number, o = v4) {
  for (let j = 0; j < 4; j++) o[j] = V[4 * i + j]
  return o
}

// The rotation s ↦ L s R at time t: two turns about wandering axes, at rates in no simple ratio.
export const L = [1, 0, 0, 0], R = [1, 0, 0, 0]
const Li = [1, 0, 0, 0], Ri = [1, 0, 0, 0]
export function rotation(t: number) {
  const a = 0.21 * t, b = 0.13 * t, ax = [Math.sin(0.11 * t), 0.6, Math.cos(0.07 * t)], n = Math.hypot(...ax)
  L[0] = Math.cos(a), L[1] = (Math.sin(a) * ax[0]) / n, L[2] = (Math.sin(a) * ax[1]) / n, L[3] = (Math.sin(a) * ax[2]) / n
  R[0] = Math.cos(b), R[1] = Math.sin(b) * AXIS[0], R[2] = Math.sin(b) * AXIS[1], R[3] = 0
  Li[0] = L[0], Li[1] = -L[1], Li[2] = -L[2], Li[3] = -L[3]
  Ri[0] = R[0], Ri[1] = -R[1], Ri[2] = -R[2], Ri[3] = -R[3]
}

// Where S³'s point s shows on screen once the rotation has carried it: the raster turns its rays by
// (L, R), so the beam turns the polytope back by their inverses, and projects from the pole w = 1.
function show(p: Float32Array, s: ArrayLike<number>) {
  mul(mul(Li, s, q4), Ri, r4)
  const k = 1 / Math.max(1e-3, 1 - r4[3])
  if (k > 6) return false
  return project(p, r4[0] * k, r4[1] * k, r4[2] * k)
}

const julia: Field = { shader: JULIA4, k: 1, p: new Float32Array(24) }
const poly: Field = { shader: POLYTOPE, k: 1, p: new Float32Array(28) }
const eye = [0, 0, 0], fwd = [0, 0, 0], up = [0, 1, 0]
const cell = new Path(), wheels = new Path(), eyes = new Path()
const pt: Point4 = { x: 0, y: 0, z: 0, ex: 0, ey: 0, k: 0 }

// The waveplate at time t: a slow turn about a wandering axis.
function plate(t: number) {
  const a = 0.35 * t, ax = Math.sin(0.21 * t), ay = Math.cos(0.17 * t), az = 0.6
  const n = Math.hypot(ax, ay, az), s = Math.sin(a)
  turn(Math.cos(a), (s * ax) / n, (s * ay) / n, (s * az) / n)
}

function orbit(p: Float32Array, t: number, r: number, h: number, fov: number) {
  const a = 0.18 * t + 0.6
  eye[0] = r * Math.cos(a), eye[1] = h * Math.sin(0.3 * t), eye[2] = r * Math.sin(a)
  fwd[0] = -eye[0], fwd[1] = -eye[1], fwd[2] = -eye[2]
  aim(p, eye, fwd, up, fov)
}

export const ophanim: Scene = {
  dur: DUR,
  build(t, f) {
    const T = t + AT
    if (t < CUT) {
      const kick = jump(t, f, true, 0.5), p = julia.p
      orbit(p, 2.2 * t, mix(1.8, 1.25, smooth(0, CUT, t)), 0.5, 1.1 + kick)
      p[16] = -0.291 + 0.06 * Math.sin(0.7 * t), p[17] = -0.399 + 0.06 * Math.cos(0.5 * t), p[18] = 0.339, p[19] = 0.437 + 0.08 * Math.sin(0.4 * t)
      p[20] = 0, p[21] = 0.6 * t, p[22] = 1
      f.field = julia
      equation(f, 'q\\to q^2+c\\qquad q=(x\\cos\\theta,\\,y,\\,z,\\,x\\sin\\theta)', [0.85, 0.8, 1])
    } else {
      const tc = t - CUT, kick = jump(tc, f, true, 0.5), p = poly.p
      orbit(p, t, mix(3.8, 3, smooth(0, DUR - CUT, tc)), 0.8, 1.15 + kick)
      rotation(t)
      p[16] = L[0], p[17] = L[1], p[18] = L[2], p[19] = L[3]
      p[20] = R[0], p[21] = R[1], p[22] = R[2], p[23] = R[3]
      p[24] = 0.025, p[25] = smooth(1.2, 2.6, tc), p[26] = Math.floor(t * 6) % 2 ? 1.6 : 0.6, p[27] = 1
      f.field = poly
      beam(p, tc)
      f.ch.push({ w: 0.6, path: wheels }, { w: 1, path: cell }, { w: 0.35, path: eyes })
      equation(f, 's\\to L\\,s\\,R\\qquad x=\\frac{(s_1,s_2,s_3)}{1-s_4}', [1, 0.75, 0.45])
    }
    f.rate = 2.6e6
    place(T)

    return (tt, o) => {
      if (splice(tt, o) || splice(tt - CUT, o)) return
      sing(tt + AT, o, 1, { dread: smooth(0, 3, tt), gold: 1 - smooth(0.5, 3.5, tt) })
      // one fiber's field through the plate, E_x and E_y on a 110 Hz carrier
      plate(tt)
      fiber(0.785, 0.9 * tt, TAU * 110 * tt, pt)
      const g = 0.045 * smooth(0, 1, tt) * (1 - smooth(DUR - 1.5, DUR, tt))
      o.l += g * pt.ex, o.r += g * pt.ey
    }
  },
}

// The beam's share of the polytope phase: the twelve wheels, then the 600-cell's edges growing out from
// every vertex, and the eyes.
function beam(p: Float32Array, tc: number) {
  wheels.clear(), cell.clear(), eyes.clear()
  const wk = smooth(2.2, 3.4, tc), ek = smooth(3, 5, tc)
  if (wk > 0)
    for (const a of WHEELS) {
      let pen = false
      for (let s = 0; s <= 96; s++) {
        const th = (TAU * s) / 96
        g4[0] = Math.cos(th), g4[1] = Math.sin(th) * AXIS[0], g4[2] = Math.sin(th) * AXIS[1], g4[3] = 0
        mul(at(a), g4, s4)
        if (!show(p, s4)) {
          pen = false
          continue
        }
        wheels.color(0.7, 0.35, 1, wk * Math.min(1, 2 / seen.d) * 0.35)
        pen ? wheels.lineTo(seen.x, seen.y) : wheels.moveTo(seen.x, seen.y)
        pen = true
      }
    }
  if (ek > 0)
    for (let e = 0; e < E.length; e += 2) {
      const a = 4 * E[e], b = 4 * E[e + 1], TH = Math.PI / 5, S = Math.sin(TH)
      // from both ends toward the middle
      for (let k = 0; k < 2; k++) {
        const x = k ? b : a, y = k ? a : b
        let pen = false
        for (let s = 0; s <= 4; s++) {
          const u = (0.5 * ek * s) / 4, ka = Math.sin((1 - u) * TH) / S, kb = Math.sin(u * TH) / S
          for (let j = 0; j < 4; j++) s4[j] = ka * V[x + j] + kb * V[y + j]
          if (!show(p, s4)) {
            pen = false
            continue
          }
          cell.color(1, 0.8, 0.45, Math.min(1, 2 / seen.d) * 0.25)
          pen ? cell.lineTo(seen.x, seen.y) : cell.moveTo(seen.x, seen.y)
          pen = true
        }
      }
    }
  const blink = Math.floor(tc * 6)
  for (let v = 0; v < N; v++) {
    if ((blink + v) % 2 || (v >= 24 && ek <= 0)) continue
    if (show(p, at(v))) eyes.color(1, 0.97, 0.85, 1).dot(seen.x, seen.y, 0.01 + 0.015 / seen.d)
  }
}

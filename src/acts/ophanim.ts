// R5 · Ophanim, "their rims were full of eyes round about" (Ezekiel 1:18). The beam draws polarization as
// Hopf fibers (hopf.ts): over each circle of latitude on the Poincaré sphere the fibers fill a torus, the
// tori nest, and every circle links every other once, wheels within wheels. A turning waveplate carries
// them all. On every wheel ride eyes: symbols, strobed once a turn of the carrier. Behind them the raster
// glows with torus knots turning isoclinically in S³ (ophanim.wgsl). The choir's dread is full, its period
// back to the octave; the speakers play one fiber's field, E_x left and E_y right, through the plate.
import { Path } from '../beam/path'
import { fiber, turn, type Point4 } from '../dsp/hopf'
import { OPHANIM as SHADER } from '../gpu/fields'
import type { Field } from '../gpu/raster'
import { place, sing } from './choir'
import { aim, equation, jump, project, seen, splice } from './reality'
import { AT as R4, DUR as R4DUR } from './stutter'
import { TAU, mix, smooth, type Scene } from './scene'

export const AT = R4 + R4DUR
export const DUR = 8
const TORI = [0.4, 0.785, 1.17] // latitudes η: an inner wheel, the Clifford torus, an outer
const FIBERS = 12, STEPS = 160
const INK = [[1, 0.78, 0.3], [1, 0.25, 0.25], [0.7, 0.35, 1]]

const field: Field = { shader: SHADER, k: 1, p: new Float32Array(24) }
const eye = [0, 0, 0], fwd = [0, 0, 0], up = [0, 0, 1]
const wheels = new Path(), eyes = new Path()
const pt: Point4 = { x: 0, y: 0, z: 0, ex: 0, ey: 0, k: 0 }

// The waveplate at time t: a slow turn about a wandering axis.
function plate(t: number) {
  const a = 0.35 * t, ax = Math.sin(0.21 * t), ay = Math.cos(0.17 * t), az = 0.6
  const n = Math.hypot(ax, ay, az), s = Math.sin(a)
  turn(Math.cos(a), (s * ax) / n, (s * ay) / n, (s * az) / n)
}

export const ophanim: Scene = {
  dur: DUR,
  build(t, f) {
    const T = t + AT, kick = jump(t, f, true, 0.5), p = field.p
    const a = 0.15 * t + 0.6, r = mix(6.5, 4.2, smooth(0, 7, t))
    eye[0] = r * Math.cos(a), eye[1] = r * Math.sin(a), eye[2] = 1.6 + 0.6 * Math.sin(0.3 * t)
    fwd[0] = -eye[0], fwd[1] = -eye[1], fwd[2] = -eye[2]
    aim(p, eye, fwd, up, 1.0 + kick)
    const out = 1 - smooth(DUR - 1.2, DUR, t) // hand the dark to the singularity
    p[16] = 1.2 * smooth(0, 0.5, t) * out, p[17] = 0.6 * t, p[20] = 0.06
    f.field = field

    plate(t)
    wheels.clear(), eyes.clear()
    const strobe = Math.floor(t * 6) // the eyes blink at the symbol rate
    TORI.forEach((eta, i) => {
      const c = INK[i]
      for (let j = 0; j < FIBERS; j++) {
        const phi = (TAU * j) / FIBERS + 0.4 * i
        let pen = false
        for (let s = 0; s <= STEPS; s++) {
          fiber(eta, phi, (TAU * s) / STEPS, pt)
          if (!project(p, pt.x, pt.y, pt.z)) {
            pen = false
            continue
          }
          wheels.color(c[0], c[1], c[2], Math.min(1, 2 / seen.d) * 0.4)
          pen ? wheels.lineTo(seen.x, seen.y) : wheels.moveTo(seen.x, seen.y)
          pen = true
        }
        // three eyes on each wheel, riding the carrier round, open on alternate symbols
        for (let e = 0; e < 3; e++) {
          if ((strobe + i + j + e) % 2) continue
          fiber(eta, phi, 2.2 * t + (TAU * e) / 3 + j, pt)
          if (project(p, pt.x, pt.y, pt.z)) eyes.color(1, 0.97, 0.85, 1).dot(seen.x, seen.y, 0.012 + 0.02 / seen.d)
        }
      }
    })
    f.ch.push({ w: 1, gain: out, path: wheels })
    f.ch.push({ w: 0.35, gain: out, path: eyes })
    equation(f, '(z_1,z_2)\\to(2z_1 z_2^*,\\,|z_1|^2-|z_2|^2)', [1, 0.75, 0.45], 0.9 * out)
    f.rate = 2.6e6
    place(T)

    return (tt, o) => {
      if (splice(tt, o)) return
      sing(tt + AT, o, 1, { dread: smooth(0, 3, tt), gold: 1 - smooth(0.5, 3.5, tt) })
      // one fiber's field through the plate, E_x and E_y on a 110 Hz carrier
      plate(tt)
      fiber(0.785, 0.9 * tt, TAU * 110 * tt, pt)
      const g = 0.12 * smooth(0, 1, tt) * (1 - smooth(DUR - 1.5, DUR, tt))
      o.l += g * pt.ex, o.r += g * pt.ey
    }
  },
}

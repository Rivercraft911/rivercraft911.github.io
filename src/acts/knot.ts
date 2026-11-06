// The 3:2 figure lifts off the screen: a Lissajous knot turning in three dimensions.
import { Path } from '../beam/path'
import { text } from '../beam/font'
import { F } from './wave'
import { TAU, smooth, view, type Scene } from './scene'

const W = TAU * F
const R = 0.62
const label = new Path()

export const knot: Scene = {
  dur: 8,
  fade: 0.6,
  build(t, f) {
    const A = view.a * 0.92, depth = smooth(0, 2.5, t)
    const th = 0.35 * t + 0.07 * t * t, tilt = (0.5 + 0.3 * Math.sin(0.5 * t)) * depth
    const [ct, st, cl, sl] = [Math.cos(th), Math.sin(th), Math.cos(tilt), Math.sin(tilt)]
    const d = Math.PI / 2 + 0.9 * (t + 12)
    const p = { x: 0, y: 0, z: 0 }
    const at = (tt: number) => {
      const u = W * tt
      const x = Math.sin(3 * u + d), y = Math.sin(2 * u), z = Math.sin(7 * u + 0.6) * depth
      const x1 = x * ct + z * st, z1 = -x * st + z * ct
      const y1 = y * cl - z1 * sl, z2 = y * sl + z1 * cl
      const k = 3 / (3 - z2 * 0.6)
      p.x = R * x1 * k, p.y = R * y1 * k, p.z = z2
    }

    f.ch.push({
      w: 1,
      fn: (tt, s) => {
        at(tt)
        s.x = p.x, s.y = p.y, s.z = 0.55 + 0.45 * p.z
      },
    })

    label.clear()
    text(label, 'k(u) = (sin 3u, sin 2u, sin 7u)', -A, -0.76, 0.05)
    text(label, `u = ωt     θ = ${(th % TAU).toFixed(2)}`, -A, -0.89, 0.05)
    text(label, 'lissajous knot', A, -0.89, 0.05, 1)
    f.ch.push({ w: 0.3, gain: 0.7, path: label.reveal(smooth(0.3, 1.5, t)) })
    f.look = { tau: 0.12 }
    return (tt, o) => (at(tt), (o.l = p.x), (o.r = p.y))
  },
}

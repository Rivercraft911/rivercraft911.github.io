// The beam writes the name, then tucks it into the corner as the station ident.
import { Path } from '../beam/path'
import { measure, text } from '../beam/font'
import { HEAD, NAME } from './header'
import { mix, smooth, view, type Scene } from './scene'

const name = new Path()
const sub = new Path()

export const nameScene: Scene = {
  dur: 9,
  fade: 1.4,
  build(t, f) {
    const A = view.a * 0.92, k = smooth(6.6, 8.6, t)
    const big = Math.min(0.3, (1.5 * A) / measure(NAME, 1))
    const size = mix(big, HEAD.size, k)

    name.clear()
    text(name, NAME, mix(0, -A, k), mix(0.02, HEAD.y, k), size, mix(0.5, 0, k))
    name.reveal((t - 0.5) / 2.6)
    if (t < 3.1) name.intensity(2).dot(...name.tip(), 0.06)
    f.ch.push({ w: 1, gain: mix(1.1, 0.75, k), path: name })

    sub.clear().intensity(0.8 * (1 - smooth(5.8, 6.6, t)))
    text(sub, 'signals · silicon · light · orbit', 0, -0.2, 0.055, 0.5)
    f.ch.push({ w: 0.35, gain: 0.8, path: sub.reveal((t - 3.4) / 1.6) })
    f.look = { tau: 0.06 }
    const hz = 50 // the speakers trace the name fifty times a second; a scope on the jack draws it
    return (tt, o) => name.at(((tt * hz) % 1) * name.len, o)
  },
}

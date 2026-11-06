// Before power: a resting spot and an invitation, breathing.
import { Path } from '../beam/path'
import { text } from '../beam/font'
import type { Scene } from './scene'

const p = new Path()

export const idle: Scene = {
  dur: Infinity,
  build(t, f) {
    const breathe = 0.55 + 0.45 * Math.sin(t * 2.2)
    p.clear().intensity(breathe).dot(0, 0, 0.6)
    p.intensity(0.35 + 0.25 * breathe)
    text(p, 'POWER', 0, -0.16, 0.035, 0.5)
    f.ch.push({ w: 0.2, path: p })
  },
}

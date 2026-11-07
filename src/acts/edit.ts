// The short edit (?short): the same transmission cut down, each scene played as pieces of its own time,
// each piece at a speed. Scenes are pure functions of their time, so a piece is just a remapped clock; the
// picture and the sound both run on it, so a faster piece is also higher in pitch.
import type { Scene } from './scene'

export type Piece = readonly [from: number, to: number, speed: number]

export function edit(scene: Scene, pieces: readonly Piece[]): Scene {
  const durs = pieces.map(([a, b, k]) => (b - a) / k)
  const map = (t: number) => {
    let acc = 0
    for (let i = 0; i < pieces.length; i++) {
      const [a, , k] = pieces[i]
      if (t < acc + durs[i] || i === pieces.length - 1) return a + (t - acc) * k
      acc += durs[i]
    }
    return t
  }
  return {
    dur: durs.reduce((s, d) => s + d, 0),
    build(t, f) {
      const v = scene.build(map(t), f)
      return v && ((tt, o) => v(map(tt), o))
    },
  }
}

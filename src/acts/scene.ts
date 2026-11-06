// A scene is a pure function of time that tells the beam what to draw and the speakers what to play.
import type { Channel } from '../beam/beam'
import type { Voice } from '../audio/audio'
import type { Look } from '../gpu/phosphor'

export type Frame = { ch: Channel[]; rate?: number; look?: Partial<Look> }
// build pushes beam channels into the frame and returns what the speakers should play.
export type Scene = { dur: number; fade?: number; build(t: number, f: Frame): Voice | void }

export const view = { a: 16 / 9 } // half-width of the screen in scope units; height spans [-1, 1]

export const TAU = Math.PI * 2
export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x))
export const mix = (a: number, b: number, k: number) => a + (b - a) * k
export const smooth = (a: number, b: number, x: number) => {
  const k = clamp((x - a) / (b - a))
  return k * k * (3 - 2 * k)
}

// Deterministic white noise in [-1, 1] and a smooth band-limited version of it.
export const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453
  return (s - Math.floor(s)) * 2 - 1
}
export const noise = (x: number) => {
  const i = Math.floor(x), k = smooth(0, 1, x - i)
  return mix(hash(i), hash(i + 1), k)
}

// The choirs that sing the fall: three Shepard choirs on orbits around the listener, shared by the fall
// and the ophanim so they never stop. Two fall, the second half again as fast; the third rises against
// them, and the horror in them grows the deeper we go. Their distances change as they orbit, so reading
// each one at its retarded time t − d/c gives true Doppler. T is time since the fall began.
import type { Stereo } from '../audio/audio'
import { Shepard } from '../dsp/shepard'
import { TAU, smooth, space } from './scene'

const C = 343 // m/s
export const ANGEL = [1, 9 / 8, 5 / 4, 3 / 2, 7 / 4] // as sung in shepard.ts
export const DREAD = [7 / 5, 16 / 15, 45 / 64]

// Octaves per second of fall, and its integral, the descent: tabulated once.
export const rate = (T: number) => 0.12 + 0.42 * smooth(0, 10, T)
const DT = 1 / 1000, S = new Float64Array(120_000)
for (let i = 1; i < S.length; i++) S[i] = S[i - 1] + rate(i * DT) * DT
export const descent = (T: number) => {
  if (T <= 0) return rate(0) * T
  const f = Math.min(T / DT, S.length - 1), i = Math.floor(f)
  return S[i] + (S[Math.min(i + 1, S.length - 1)] - S[i]) * (f - i)
}
export const dread = (T: number) => 0.85 * smooth(4, 16, T)

type Choir = { k: number; dread: (T: number) => number; enter: (T: number) => number; r: number; off: number; period: number; a0: number; tilt: number }
export const CHOIRS: Choir[] = [
  { k: 1, dread, enter: (T) => smooth(0.5, 2.5, T), r: 2.2, off: 1.1, period: 7.3, a0: 0, tilt: 0 },
  { k: 1.5, dread: (T) => 0.6 * dread(T), enter: (T) => smooth(3, 8, T), r: 1.6, off: 0.9, period: -4.9, a0: 2, tilt: 0.8 },
  { k: -0.35, dread: () => 1, enter: (T) => 0.7 * smooth(7, 13, T), r: 3, off: 1.6, period: 11, a0: 4, tilt: 0.3 },
]
const voices = CHOIRS.map(() => new Shepard())
// The same choirs with a period of φ instead of an octave, for when the fall turns golden.
export const PHI = (1 + Math.sqrt(5)) / 2
const golden = CHOIRS.map(() => new Shepard(PHI))

// How a reality mutates the choirs: more dread, the ninth glided to the 11th harmonic, the period
// crossfaded toward φ (gold ∈ [0, 1]).
export type Mood = { dread?: number; prime?: number; gold?: number }
const CALM: Mood = {}

// Where choir i is at time T, in metres around the listener (−z ahead).
const at = { x: 0, y: 0, z: 0 }
function where(i: number, T: number) {
  const c = CHOIRS[i], a = c.a0 + (TAU * T) / c.period
  at.x = c.off + c.r * Math.cos(a)
  at.y = c.r * Math.sin(a) * c.tilt
  at.z = c.r * Math.sin(a) * (1 - c.tilt)
  return Math.hypot(at.x, at.y, at.z)
}

// Once a frame: tell the panners where the choirs are.
export function place(T: number) {
  for (let i = 0; i < CHOIRS.length; i++) where(i, T), (space[3 * i] = at.x), (space[3 * i + 1] = at.y), (space[3 * i + 2] = at.z)
}

// Every sample: each choir sings into its spatial voice, heard at its retarded time.
export function sing(T: number, o: Stereo, gain = 1, m = CALM) {
  const g = m.gold ?? 0, pr = m.prime ?? 0
  for (let i = 0; i < CHOIRS.length; i++) {
    const c = CHOIRS[i], e = c.enter(T) * gain
    if (e <= 0) continue
    const tr = T - where(i, T) / C, d = Math.min(1, c.dread(tr) + (m.dread ?? 0)), s = c.k * descent(tr)
    if (g < 1) (voices[i].s = s), (o.s[i] += e * (1 - g) * voices[i].sample(tr, 0, d, pr))
    if (g > 0) (golden[i].s = s / Math.log2(PHI)), (o.s[i] += e * g * golden[i].sample(tr, 0, d, pr))
  }
}

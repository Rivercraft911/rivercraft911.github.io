// The choir that sings the fall: one Shepard choir, shared by the fall and the ophanim so it never stops.
// It stands still, wide across the stage in the bed's hall (audio.ts); the motion is in the music, the
// endless fall, not in the room. It grows the deeper we go: the root comes in under it, a breath of
// noise around it, its colour deepens and the dread under it with it, and over the last realities the
// chorus swells, more singers to each part, the hall opening, the fall quickening and the breath rising
// into a shimmer, until the singularity cuts it off and only the hall rings on under the chirp. Each
// world's mood is also its room. T is time since the fall began.
import { room, type Stereo } from '../audio/audio'
import { Shepard, type Part } from '../dsp/shepard'
import { clamp, smooth } from './scene'

export const END = 62.5 // the collapse into one point on the choir's clock: singularity's AT (ophanim's AT + DUR) + 10.5
const GAIN = 1 // the choir's swing, root and all, about what the realities' bends expect
const FALL = 13.5 // the falls flattening into the plot: the choir is silent before it, then fades in

// The swell toward the singularity, ∈ [0, 1], steepest at the end.
const SWELL = 32.5 // where it starts
export const swell = (T: number) => clamp((T - SWELL) / (END - SWELL)) ** 2

// Octaves per second of fall, and its integral, the descent: tabulated once.
export const rate = (T: number) => 0.12 + 0.42 * smooth(0, 10, T) + 0.5 * smooth(END - 15, END, T)
const DT = 1 / 1000, S = new Float64Array(120_000)
for (let i = 1; i < S.length; i++) S[i] = S[i - 1] + rate(i * DT) * DT
export const descent = (T: number) => {
  if (T <= 0) return rate(0) * T
  const f = Math.min(T / DT, S.length - 1), i = Math.floor(f)
  return S[i] + (S[Math.min(i + 1, S.length - 1)] - S[i]) * (f - i)
}
// The choir's own glide, far slower than the zoom: an octave every 14 s, quickening to every 6 s at the
// climax. Faster, and the octaves stop fusing into one tone and are heard as separate sirens.
const sungRate = (T: number) => 0.07 + 0.1 * smooth(END - 27, END, T)
const SUNG = new Float64Array(S.length)
for (let i = 1; i < SUNG.length; i++) SUNG[i] = SUNG[i - 1] + sungRate(i * DT) * DT
const sung = (T: number) => (T <= 0 ? sungRate(0) * T : SUNG[Math.min(SUNG.length - 1, Math.round(T / DT))])
export const dread = (T: number) => 0.6 * smooth(4, 16, T) + 0.25 * swell(T)
// The root comes in once the choir has, and gives way as the chirp takes the low end.
const root = (T: number) => 0.7 * smooth(FALL + 3, FALL + 10, T) * (1 - 0.5 * smooth(END - 10.5, END - 7, T))
// The shimmer: the breath rising from a cloud in the choir to the air above it, for the climax only.
const shimmer = (T: number) => smooth(END - 14, END - 2, T)

const choir = new Shepard()
// The same choir with a period of φ instead of an octave, for when the fall turns golden.
export const PHI = (1 + Math.sqrt(5)) / 2
const golden = new Shepard(PHI)
const both = [choir, golden]

// How a reality mutates the choir and its room: more dread, a prime world's hard little room, the period
// crossfaded toward φ (gold ∈ [0, 1]), the descent reflected about a moment so the fall runs back up.
export type Mood = { dread?: number; prime?: number; gold?: number; mirror?: number }
const CALM: Mood = {}

// Once a frame: the hall opens and the choir grows louder with the swell.
const hall = { rt: 2.4, wet: 0.5 }
export function place(T: number) {
  const w = swell(T)
  hall.rt = 2.4 + 2.6 * w
  hall.wet = 0.5 + 0.4 * w
  room.gain = 1.2 * (1 + 2 * w)
  at = -Infinity
}

// Each world's room, from its mood, so it changes with every cut: gold opens a long bright hall, dread
// darkens it, a prime world is small and hard, and the mirrored world never lets its sound go. The
// longer the hall, the louder its tail (as √rt), so it is fed a little less.
function tune(m: Mood) {
  const g = m.gold ?? 0, d = m.dread ?? 0, p = m.prime ?? 0
  const k = (1 + g) * (1 - 0.6 * p) * (m.mirror === undefined ? 1 : 3)
  room.rt = hall.rt * k
  room.wet = hall.wet / Math.sqrt(Math.sqrt(k))
  room.tone = Math.min(16_000, 7000 * 2 ** (g + p - d))
}

// How the choir sings at T in mood m: set every millisecond and at every change of mood, as the choir
// reads it only once a block.
let at = -Infinity, was = CALM
function set(T: number, m: Mood) {
  const td = m.mirror === undefined ? T : 2 * m.mirror - T, s = sung(td), w = shimmer(T)
  for (const v of both) {
    v.s = v === golden ? s / Math.log2(PHI) : s
    v.dread = Math.min(1, dread(td) + (m.dread ?? 0))
    v.chorus = swell(T)
    v.colour = 0.25 * smooth(FALL + 8, END - 14, T)
    v.root = root(T)
    v.breath = 0.08 * smooth(FALL + 4, FALL + 12, T) + 0.3 * w
    v.air = 600 * 2 ** (2.5 * w)
  }
  tune(m)
  at = T
  was = m
}

// Every sample: the choir sings into the bed, voices 0 and 1 its left and right with the root between
// them, 2 the dread under it.
const part: Part = { l: 0, r: 0, b: 0, d: 0 }
export function sing(T: number, o: Stereo, gain = 1, m = CALM) {
  if (m !== was || Math.abs(T - at) >= 1e-3) set(T, m)
  const e = gain * GAIN * smooth(FALL, FALL + 4, T) * (1 - smooth(END - 0.3, END, T))
  if (e <= 0) return
  const g = m.gold ?? 0
  part.l = part.r = part.b = part.d = 0
  if (g < 1) choir.sample(T, part, e * (1 - g))
  if (g > 0) golden.sample(T, part, e * g)
  o.s[0] += part.l + part.b
  o.s[1] += part.r + part.b
  o.s[2] += part.d
}

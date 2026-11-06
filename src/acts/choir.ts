// The choir that sings the fall: one Shepard choir, shared by the fall and the ophanim so it never stops.
// It stands still, wide across the stage in the bed's hall (audio.ts); the motion is in the music, the
// endless fall, not in the room. It grows the deeper we go: the harmonic series fills in tone by tone,
// the dread under it deepens, and over the last realities the chorus swells, more singers to each part,
// the hall opening and the fall quickening, until the singularity cuts it off and only the hall rings on
// under the chirp. T is time since the fall began.
import { room, type Stereo } from '../audio/audio'
import { Shepard, type Part } from '../dsp/shepard'
import { clamp, smooth } from './scene'

export const END = 83.5 // the collapse into one point on the choir's clock: singularity's AT (ophanim's AT + DUR) + FALL
const GAIN = 1.1 // about the old choirs' swing, which the realities' bends expect
const FALL = 21 // the wrap, where the fall begins: the choir is silent before it

// The swell toward the singularity, ∈ [0, 1], steepest at the end.
export const swell = (T: number) => clamp((T - 44) / (END - 44)) ** 2

// Octaves per second of fall, and its integral, the descent: tabulated once.
export const rate = (T: number) => 0.12 + 0.42 * smooth(0, 10, T) + 0.5 * smooth(56, END, T)
const DT = 1 / 1000, S = new Float64Array(120_000)
for (let i = 1; i < S.length; i++) S[i] = S[i - 1] + rate(i * DT) * DT
export const descent = (T: number) => {
  if (T <= 0) return rate(0) * T
  const f = Math.min(T / DT, S.length - 1), i = Math.floor(f)
  return S[i] + (S[Math.min(i + 1, S.length - 1)] - S[i]) * (f - i)
}
// The choir's own glide, far slower than the zoom: an octave every 14 s, quickening to every 6 s at the
// climax. Faster, and the octaves stop fusing into one tone and are heard as separate sirens.
const sungRate = (T: number) => 0.07 + 0.1 * smooth(44, END, T)
const SUNG = new Float64Array(S.length)
for (let i = 1; i < SUNG.length; i++) SUNG[i] = SUNG[i - 1] + sungRate(i * DT) * DT
const sung = (T: number) => (T <= 0 ? sungRate(0) * T : SUNG[Math.min(SUNG.length - 1, Math.round(T / DT))])
export const dread = (T: number) => 0.6 * smooth(4, 16, T) + 0.25 * swell(T)
// How many chord tones sing: an open fifth at the edge, the full 7-limit chord by the wrap, 11, 13, 15 at the end.
const tones = (T: number) => 2 + 3 * smooth(2, 26, T) + 3 * smooth(50, 68, T)

const choir = new Shepard()
// The same choir with a period of φ instead of an octave, for when the fall turns golden.
export const PHI = (1 + Math.sqrt(5)) / 2
const golden = new Shepard(PHI)
const both = [choir, golden]

// How a reality mutates the choir: more dread, the ninth glided to the 11th harmonic, the period
// crossfaded toward φ (gold ∈ [0, 1]), the descent reflected about a moment so the fall runs back up.
export type Mood = { dread?: number; prime?: number; gold?: number; mirror?: number }
const CALM: Mood = {}

// Once a frame: the hall opens and the choir grows louder with the swell.
export function place(T: number) {
  const w = swell(T)
  room.rt = 2.4 + 2.6 * w
  room.wet = 0.5 + 0.4 * w
  room.gain = 1.2 * (1 + 2 * w)
}

// Every sample: the choir sings into the bed, voices 0 and 1 its left and right, 2 the dread under it.
const part: Part = { l: 0, r: 0, d: 0 }
export function sing(T: number, o: Stereo, gain = 1, m = CALM) {
  const e = gain * GAIN * smooth(FALL - 0.5, FALL + 2.5, T) * (1 - smooth(END - 0.3, END, T))
  if (e <= 0) return
  const g = m.gold ?? 0, td = m.mirror === undefined ? T : 2 * m.mirror - T, s = sung(td)
  part.l = part.r = part.d = 0
  for (let i = 0; i < 2; i++) {
    const v = both[i], k = i ? g : 1 - g
    if (k <= 0) continue
    v.s = i ? s / Math.log2(PHI) : s
    v.dread = Math.min(1, dread(td) + (m.dread ?? 0))
    v.prime = m.prime ?? 0
    v.n = tones(T)
    v.chorus = swell(T)
    v.sample(T, part, e * k)
  }
  o.s[0] += part.l
  o.s[1] += part.r
  o.s[2] += part.d
}

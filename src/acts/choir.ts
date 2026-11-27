// The choir that sings the fall, from the lip of the falls to the sky. One Shepard pad (dsp/shepard.ts), an open
// fifth falling forever, in a hall whose tail climbs an octave each time round as the spray does (dsp/hall.ts),
// and a few plucked strings that echo across the head (dsp/pluck.ts). T is time since the fall's clock began.
// - Over the lip it swells out of the held breath and falls slowly, the hall wide, wind in it.
// - In the whirlpool it turns: its singers go round the head with the water, and an arpeggio of its own chord
//   spins faster and faster down through it.
// - When the text spreads, the glide is read out in steps, as text reads out the water: the continuous fall
//   becomes Shepard's own discrete scale (1964), the major scale down in open fifths, each step struck. It runs
//   faster down the drain,
// - and in the dark of the cloud below it slows, step by step, while everything but the sub and the wind goes
//   dim, so that the last step lands on A as we come out under the cloud into the sunrise. There it resolves:
//   the filter opens, the fifth harmonics bloom (A sus2 becomes A major nine), the hall shimmers, and the light
//   is struck in high strings. Then it thins away as we climb, and the world (world/sound.ts) takes over.
import { room, type Stereo } from '../audio/audio'
import { Shepard, type Part } from '../dsp/shepard'
import { Plucks } from '../dsp/pluck'
import { ASCII, END, LEAD, WRAP } from './clock'
import { hash, mix, smooth } from './scene'

const FALL = 12.5 // over the lip of the falls: silent before it
const SPIN = LEAD // the whirlpool
const TEXT = LEAD + WRAP // the text, and the drain under it
export const LAND = TEXT + ASCII // the arrival: the dark of the cloud
export const SKY = LAND + 2.4 // out of the cloud's base into the sunrise, where the fall lands
const GAIN = 0.25

// The zoom's fall in octaves per second, and its integral, the descent: the whirlpool's printer reads it (wrap.ts).
export const rate = (T: number) => 0.12 + 0.42 * smooth(0, 10, T) + 0.5 * smooth(END - 15, END, T)
const DT = 1 / 1000, S = new Float64Array(Math.ceil((END + 10) / DT))
for (let i = 1; i < S.length; i++) S[i] = S[i - 1] + rate(i * DT) * DT
const table = (A: Float64Array, r: (T: number) => number, T: number) => {
  if (T <= 0) return r(0) * T
  const f = Math.min(T / DT, A.length - 1), i = Math.floor(f)
  return A[i] + (A[Math.min(i + 1, A.length - 1)] - A[i]) * (f - i)
}
export const descent = (T: number) => table(S, rate, T)

// The sung fall, far slower than the zoom until the drain, where the steps run, then slowing to nothing at the sky.
// It is offset so that it stops just past a whole octave: on A.
const sungRate = (T: number) => (0.07 + 0.08 * smooth(FALL, TEXT, T) + 0.75 * smooth(TEXT, LAND, T) ** 2) * (1 - smooth(LAND - 0.4, SKY, T))
const SUNG = new Float64Array(S.length)
for (let i = 1; i < SUNG.length; i++) SUNG[i] = SUNG[i - 1] + sungRate(i * DT) * DT
const OFF = (() => {
  const s = table(SUNG, sungRate, SKY)
  return Math.ceil(s) + 0.01 - s
})()
const sung = (T: number) => table(SUNG, sungRate, T) + OFF
// The scale it steps down, in semitones below A: A, G♯, F♯, E, D, C♯, B.
const STEPS = [0, 1, 3, 5, 7, 8, 10], st = { s: 0, k: 0 }
const stair = (s: number) => {
  const u = 12 * s, o = Math.floor(u / 12), x = u - 12 * o
  let i = STEPS.length - 1
  while (STEPS[i] > x) i--
  return (st.s = o + STEPS[i] / 12), (st.k = 7 * o + i), st
}
// How far round the head the singers have gone: the whirlpool's turning, faster down the drain, gone in the cloud.
const spin = (T: number) => 2.5 * smooth(SPIN - 1, SPIN + 1, T) + 4 * smooth(TEXT, LAND, T) - 6.5 * smooth(LAND, LAND + 1.5, T)
const TURN = new Float64Array(S.length)
for (let i = 1; i < TURN.length; i++) TURN[i] = TURN[i - 1] + spin(i * DT) * DT

const pad = new Shepard()
const strings = new Plucks()
const sky = (T: number) => smooth(SKY - 0.3, SKY + 2.2, T) // the bloom
const cloud = (T: number) => smooth(LAND - 0.5, LAND + 0.8, T) * (1 - smooth(SKY - 0.5, SKY + 0.5, T)) // inside it
const fade = (T: number) => smooth(FALL - 0.2, FALL + 2.8, T) * (1 - smooth(SKY + 5, END - 0.5, T)) // in over the lip, out as we climb

// The room, once a frame. A world's share w ∈ [0, 1] of it is left as the world set it.
export function place(T: number, w = 0) {
  const c = cloud(T), b = sky(T), k = 1 - w
  room.rt = mix(room.rt, 3.2 + 0.8 * smooth(SPIN, TEXT, T) + 2.5 * c + 2 * b * (1 - smooth(SKY + 4, END, T)), k)
  room.wet = mix(room.wet, 0.5 + 0.3 * c + 0.15 * b, k)
  room.tone = mix(room.tone, 6000 - 3000 * c + 3500 * b, k)
  room.shimmer = mix(room.shimmer, 0.1 + 0.08 * smooth(SPIN, LAND, T) + 0.12 * c + 0.18 * b * (1 - smooth(SKY + 3, END, T)), k)
  room.chorus = mix(room.chorus, 0.5, k)
  room.gain = mix(room.gain, 1, k)
}

// The pad, every millisecond.
let at = -Infinity, sp = 0, stepAt = 0
function set(T: number) {
  const c = cloud(T), b = sky(T), text = smooth(TEXT, TEXT + 0.6, T)
  stair(sung(T))
  const s = mix(sung(T), st.s, text)
  // a step is a glide of a few milliseconds, so it never clicks; a seek is a jump
  sp = Math.abs(s - sp) > 0.5 ? s : sp + (s - sp) * 0.06
  pad.s = sp
  pad.turn = table(TURN, spin, T)
  // the filter sweeps, slowly over the falls and with the water's turning in the whirlpool, and shuts in the cloud
  const sweep = 2 ** ((0.7 - 0.5 * c) * Math.sin(0.8 * (T - FALL) + 0.5 * pad.turn))
  pad.bright = (900 + 1600 * smooth(FALL, SPIN, T) + 1200 * smooth(SPIN, LAND, T)) * (1 - 0.82 * c) * sweep + 3200 * b * (1 - 0.4 * smooth(SKY + 3, END, T))
  pad.res = 0.9 * (1 - c) * (1 - 0.6 * b)
  pad.tone = 0.5 + 0.35 * smooth(SPIN, TEXT, T) - 0.3 * c + 0.2 * b
  pad.bloom = b
  pad.fifth = 0.7 + 0.3 * b
  pad.beat = 0.1 + 0.2 * smooth(SPIN, LAND, T) * (1 - c)
  pad.width = 0.6 + 0.25 * smooth(SPIN - 1, SPIN, T) - 0.4 * c + 0.35 * b
  pad.sub = 1.5 * smooth(FALL + 0.5, FALL + 4, T) * (1 - smooth(SKY + 4, END - 2, T))
  pad.breath = 0.1 + 0.12 * smooth(SPIN, LAND, T) + 0.35 * c * (1 - smooth(SKY - 1, SKY + 0.5, T)) * smooth(LAND, SKY - 0.3, T) ** 0.5
  pad.air = 700 + 900 * smooth(SPIN, LAND, T) + 3000 * b
  // each step down the scale is struck: the new root where the bell is fullest, and its fifth over it
  if (text > 0.5 && st.k !== stepAt && T < SKY + 0.1) {
    const f = 220 * 2 ** -(((st.s % 1) + 1) % 1), a = 0.5 * (1 - 0.6 * c) * (T >= SKY - 0.05 ? 1.6 : 1)
    strings.strike(f, a, -0.3, T >= SKY - 0.05 ? 4 : 1.1, 2.2)
    strings.strike(1.5 * f, 0.5 * a, 0.3, T >= SKY - 0.05 ? 4 : 0.9, 1.8)
  }
  stepAt = st.k
  at = T
}

// The whirlpool's arpeggio: chord tones (semitones over the bell's A) struck down and round, faster and faster,
// falling with the pad as they ring. Then the sunrise: the bloomed chord's high notes, a few at a time.
const ARP = [24, 19, 14, 12, 7, 0, 19, 12]
const LIGHT = [28, 31, 35, 36, 40, 43, 47, 38, 33, 45]
let arpAt = -1, arpN = 0, lightN = 0
function arpeggio(T: number) {
  const on = smooth(SPIN - 0.3, SPIN + 0.4, T) * (1 - smooth(TEXT + 0.2, TEXT + 0.9, T))
  if (on > 0.01) {
    const due = arpAt < 0 || T < arpAt ? T : arpAt + 1 / (3 + 7 * smooth(SPIN, TEXT + 0.5, T))
    if (T >= due) {
      arpAt = T
      const r = 220 * 2 ** -(((sung(T) % 1) + 1) % 1), n = arpN++
      strings.strike(r * 2 ** (ARP[n % ARP.length] / 12), 0.32 * on, Math.sin(pad.turn + n), 0.9, 2.6, sungRate(T))
    }
  } else arpAt = -1
  // the light: a note every so often from the sky's opening, high, soft and long
  const k = Math.floor((T - SKY) * 2.2)
  if (k >= 0 && k < 14 && k >= lightN) {
    lightN = k + 1
    if (hash(k * 7.1) > -0.4) strings.strike(110 * 2 ** (LIGHT[k % LIGHT.length] / 12), 0.12 * (1 - k / 16), hash(k * 3.3) * 0.9, 3.5, 1.2)
  }
  if (T < SKY) lightN = 0
}

// Every sample: the pad and the strings into the bed, voices 0 and 1 its left and right, 2 the sub in the middle.
// A second call at the same T (two scenes crossfading) sings the same sample.
const part: Part = { l: 0, r: 0, m: 0 }, out = { l: 0, r: 0, m: 0 }
let last = NaN
export function sing(T: number, o: Stereo, gain = 1) {
  if (T !== last) {
    last = T
    out.l = out.r = out.m = 0
    const e = fade(T)
    if (e > 0) {
      if (Math.abs(T - at) >= 1e-3) set(T), arpeggio(T)
      part.l = part.r = part.m = 0
      pad.sample(part)
      strings.sample(part)
      const g = GAIN * e
      out.l = g * part.l
      out.r = g * part.r
      out.m = g * part.m
    }
  }
  o.s[0] += gain * out.l
  o.s[1] += gain * out.r
  o.s[2] += gain * out.m
}

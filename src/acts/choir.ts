// The choir that sings the fall, from the lip of the falls to the sky. One Shepard pad (dsp/shepard.ts), an open
// fifth falling forever, in a hall whose tail climbs an octave each time round as the spray does (dsp/hall.ts),
// and a few plucked strings that echo across the head (dsp/pluck.ts). T is time since the fall's clock began.
// - It grows out of the scope. Running for the lip, the scope's bass line lands on A (110 Hz) and holds it, and the
//   choir rises from the falls ahead on that same A, its filter as open as the scope's trace is bright, so its
//   partials are the trace's own harmonics (1, 2, 4: A; 3, 6: E). Until the lip it sings only on the spatial
//   voices, from the shaft, so the scope's pair still draws the screen. Over the lip it steps into the hall around
//   us, and the held A tips over: the fall begins from rest, the scope's note falling with it as its trace fades
//   and its plates' low-pass closes with the choir's filter, into the choir's own colour (valley.ts).
// - Over the lip it falls slowly, the hall wide, wind in it.
// - In the whirlpool it turns: its singers go round the head with the water, and an arpeggio of its own chord
//   spins faster and faster down through it.
// - When the text spreads, the glide is read out in steps, as text reads out the water: the continuous fall
//   becomes Shepard's own discrete scale (1964), the major scale down in open fifths, each step struck. It runs
//   faster down the drain.
// - Down the dive, as the real world eats the text, the steps melt back into the glide, and it falls faster and
//   faster, the zoom's own acceleration, swelling, opening and widening, its singers whirling round the head with
//   the eye, into the hole. Out in the hollow the hole's disk sings with it: A, the orbit of its inner edge (disk).
// - At the horizon its fall runs on into the horizon's redshift, window and all, and it sinks out of hearing like a
//   tape stopping, while its hall's tail is drawn out long and dark. The disk, outside, sings on through the dark.
// - In the dark of the cloud below it comes back, still falling, and slows, step by step, while everything but the
//   sub and the wind goes dim, so that the last step lands on the disk's A as we come out under the cloud into the
//   sunrise, and the disk's voice is taken into it. There it resolves:
//   the filter opens, the fifth harmonics bloom (A sus2 becomes A major nine), the hall shimmers, and the light
//   is struck in high strings. Then it thins away as we climb, and the world (world/sound.ts) takes over.
import { heard, room, type Stereo } from '../audio/audio'
import { Shepard, type Part } from '../dsp/shepard'
import { Plucks } from '../dsp/pluck'
import { END, LEAD, NOTHING, RA, RD, WRAP } from './clock'
import { hash, mix, smooth } from './scene'

export const FALL = 9 // over the lip of the falls
const SPIN = LEAD // the whirlpool
const TEXT = LEAD + WRAP // the text, and the drain under it
const DIVE = RD // down the drain through the worlds,
const HOLE = RA - NOTHING // over the hole's horizon
export const LAND = RA // the arrival: the dark of the cloud
export const SKY = LAND + 2.4 // out of the cloud's base into the sunrise, where the fall lands
const GAIN = 0.25, DISK = 1

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

// The sung fall: held on A until the lip, setting off from rest over it, far slower than the zoom until the drain,
// where the steps run, then three octaves a second by the hole, then slowing to nothing at the sky. Its pace is
// trimmed (by K, a few parts in a hundred) so that from the lip's A it falls a whole number of octaves and lands on
// A again, just past it.
const shape = (T: number) =>
  (0.07 * smooth(FALL - 0.3, FALL + 2, T) + 0.08 * smooth(FALL, TEXT, T) + 0.5 * smooth(TEXT, DIVE, T) ** 2 + 2.4 * smooth(DIVE, HOLE, T) ** 2) * (1 - smooth(LAND - 0.4, SKY, T))
// Read out in steps while the text is, and again in the cloud; a glide down the dive.
const stepped = (T: number) => smooth(TEXT, TEXT + 0.6, T) * (1 - smooth(DIVE + 0.4, DIVE + 1.4, T)) + smooth(BACK - 0.3, BACK, T)
// Over the horizon. Seen from outside, as the dive's picture holds the eye there, light from what falls in is reddened
// as e^(t/4M): at the dive's 20 M a second, 7.2 octaves a second. The choir's own fall runs on into that (Shepard.red),
// coming up to it over 0.6 s, dimming as (1 + z)⁻¹, until nothing of it is left; in the cloud it sings again from BACK.
const BACK = LAND + 0.6
const ramp = (x: number) => (x < 0 ? 0 : x < 1 ? x * x * x - (x * x * x * x) / 2 : x - 0.5) // ∫ smooth
const red = (T: number) => (T < BACK ? 7.2 * 0.6 * ramp((T - HOLE + 0.35) / 0.6) : 0)
const audible = (T: number) => (T < BACK ? 2 ** -red(T) * (1 - smooth(HOLE + 0.3, BACK, T)) : smooth(BACK, BACK + 1, T))
// The dive's weight, its swell, sub, opening and hall, up into the hole and let go in the dark while nothing sings: the
// arrival begins at its own level, and the sunrise's bloom is not stacked on the fall's (it drove the limiter).
const dove = (T: number) => smooth(DIVE, HOLE, T) * (1 - smooth(HOLE, BACK, T))
// The dark, from the horizon until the choir is back: the hall's tail drawn out long and dark through it.
const dark = (T: number) => smooth(HOLE - 0.4, HOLE + 0.2, T) * (1 - smooth(LAND, BACK + 0.4, T))
const SUNG = new Float64Array(S.length)
for (let i = 1; i < SUNG.length; i++) SUNG[i] = SUNG[i - 1] + shape(i * DT) * DT
const K = (Math.round(table(SUNG, shape, SKY)) + 0.01) / table(SUNG, shape, SKY)
const sungRate = (T: number) => K * shape(T)
const sung = (T: number) => K * table(SUNG, shape, T)
// How many turns a note held from the start falls behind, sung down with the choir: ∫ (2^−sung − 1) dT. The scope's
// note follows the choir over the lip by it (valley.ts).
const LAG = new Float64Array(S.length)
for (let i = 1; i < LAG.length; i++) LAG[i] = LAG[i - 1] + (2 ** -sung(i * DT) - 1) * DT
export const lag = (T: number) => table(LAG, () => 0, T)
// How much of the choir sings from the shaft ahead (the spatial voices) rather than in the hall: all of it until the lip.
export const ahead = (T: number) => 1 - smooth(FALL - 0.2, FALL + 1.6, T)
// The scale it steps down, in semitones below A: A, G♯, F♯, E, D, C♯, B.
const STEPS = [0, 1, 3, 5, 7, 8, 10], st = { s: 0, k: 0 }
const stair = (s: number) => {
  const u = 12 * s, o = Math.floor(u / 12), x = u - 12 * o
  let i = STEPS.length - 1
  while (STEPS[i] > x) i--
  return (st.s = o + STEPS[i] / 12), (st.k = 7 * o + i), st
}
// How far round the head the singers have gone: the whirlpool's turning, faster down the drain, gone in the cloud.
const spin = (T: number) => 2.5 * smooth(SPIN - 1, SPIN + 1, T) + 2 * smooth(TEXT, DIVE, T) + 4 * smooth(DIVE, HOLE, T) - 8.5 * smooth(LAND, LAND + 1.5, T)
const TURN = new Float64Array(S.length)
for (let i = 1; i < TURN.length; i++) TURN[i] = TURN[i - 1] + spin(i * DT) * DT

const pad = new Shepard()
const strings = new Plucks()
const sky = (T: number) => smooth(SKY - 0.3, SKY + 2.2, T) // the bloom
const cloud = (T: number) => smooth(LAND - 0.5, LAND + 0.8, T) * (1 - smooth(SKY - 0.5, SKY + 0.5, T)) // inside it
const fade = (T: number) => smooth(FALL - 1.6, FALL + 2.4, T) * (1 - smooth(SKY + 5, END - 0.5, T)) // in before the lip, out as we climb
const open = (T: number) => 1 - smooth(FALL, FALL + 2.5, T) // as bright as the scope's trace, until it closes over the lip

// The room, once a frame. A world's share w ∈ [0, 1] of it is left as the world set it.
export function place(T: number, w = 0) {
  const c = cloud(T), b = sky(T), k = 1 - w, dv = dove(T), z = dark(T)
  room.rt = mix(room.rt, 3.2 + 0.8 * smooth(SPIN, TEXT, T) + 2 * dv + 2.5 * c + 2 * b * (1 - smooth(SKY + 4, END, T)) + 5 * z, k) // drawn out in the dark
  room.wet = mix(room.wet, 0.5 + 0.3 * c + 0.15 * b - 0.3 * z, k) // and quieter: the dark is a hush
  room.tone = mix(room.tone, 6000 - 3000 * c + 3500 * b - 3500 * z * (1 - c), k)
  room.shimmer = mix(room.shimmer, (0.1 + 0.08 * smooth(SPIN, LAND, T) + 0.12 * dv + 0.12 * c + 0.18 * b * (1 - smooth(SKY + 3, END, T))) * (1 - z), k) // it climbs: not as all falls
  room.chorus = mix(room.chorus, 0.5, k)
  room.gain = mix(room.gain, 1, k)
}

// The pad, every millisecond.
let at = -Infinity, sp = 0, stepAt = 0
function set(T: number) {
  const c = cloud(T), b = sky(T), text = stepped(T), dv = dove(T) ** 2
  stair(sung(T))
  const s = mix(sung(T), st.s, text)
  // a step is a glide of a few milliseconds, so it never clicks; a seek is a jump
  sp = Math.abs(s - sp) > 0.5 ? s : sp + (s - sp) * 0.06
  pad.s = sp
  pad.red = red(T)
  pad.turn = table(TURN, spin, T)
  // the filter: open as the scope until the lip, closing over it; then it sweeps, slowly over the falls and with the
  // water's turning in the whirlpool, and shuts in the cloud
  const sweep = 2 ** ((0.7 - 0.5 * c) * Math.sin(0.8 * Math.max(0, T - FALL) + 0.5 * pad.turn)), op = open(T)
  pad.bright = (900 + 1600 * smooth(FALL, SPIN, T) + 1200 * smooth(SPIN, DIVE, T) + 3000 * dv) * (1 - 0.82 * c) * sweep * (1 + 3 * op) + 3200 * b * (1 - 0.4 * smooth(SKY + 3, END, T))
  pad.res = 0.9 * (1 - c) * (1 - 0.6 * b) * (1 - 0.6 * op)
  pad.tone = 0.5 + 0.35 * smooth(SPIN, TEXT, T) - 0.3 * c + 0.2 * b + 0.5 * op
  pad.bloom = b
  pad.fifth = 0.7 + 0.3 * b
  pad.beat = 0.1 + 0.2 * smooth(SPIN, LAND, T) * (1 - c)
  pad.width = 0.6 + 0.25 * smooth(SPIN - 1, SPIN, T) + 0.3 * dv - 0.4 * c + 0.35 * b
  pad.sub = 1.5 * (1 + 0.8 * dv) * smooth(FALL + 0.5, FALL + 4, T) * (1 - smooth(SKY + 4, END - 2, T))
  pad.breath = 0.1 + 0.12 * smooth(SPIN, DIVE, T) + 0.3 * dv + 0.35 * c * (1 - smooth(SKY - 1, SKY + 0.5, T)) * smooth(LAND, SKY - 0.3, T) ** 0.5
  pad.air = 700 + 900 * smooth(SPIN, DIVE, T) + 1500 * dv + 3000 * b
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

// The disk. The hole is as heavy as Cygnus X-1's, twenty suns, so the inner edge of its disk (6M) goes round 110 times a
// second, c³ / (2π 6^{3/2} G M): an A. (The picture shows it a five-hundredth as fast: dive.ts's 20 M a second.) A hot
// spot there is seen Doppler-beamed, its brightness D³, D = 1 / γ(1 − β cos φ), β half the speed of light there and seen
// 67° off the disk's axis: it flares each time it comes round toward the eye, a pulse at the orbit's own frequency whose
// harmonics are A's chord. It comes in as the eye comes out into the hollow (dive.ts sets hollow.T), swells as the eye
// falls, and sings on through the dark (it is outside the horizon), darkening, a low A that the choir lands on.
export const hollow = { T: RD + 6 }
const ORBIT = 110, NB = 1024, BEAM = (() => {
  const b = Float64Array.from({ length: NB + 1 }, (_, i) => (1 - 0.46 * Math.cos((2 * Math.PI * i) / NB)) ** -3)
  const m = b.reduce((s, v, i) => (i < NB ? s + v / NB : s), 0), top = Math.max(...b) - m
  return b.map((v) => (v - m) / top)
})()
let dph = 0, d1 = 0, d2 = 0, dk = 0, don = 0, dAt = -Infinity
function disk(T: number) {
  if (Math.abs(T - dAt) >= 1e-3) {
    dAt = T
    don = smooth(hollow.T - 0.5, hollow.T + 2, T) * (0.4 + 0.6 * smooth(hollow.T, HOLE, T)) * (1 - smooth(SKY - 0.5, SKY + 2, T))
    dk = 1 - Math.exp((-2 * Math.PI * (2400 - 2100 * smooth(HOLE - 0.4, LAND + 0.4, T))) / heard.sr) // its light dims to a glow
  }
  if (don < 1e-4) return 0
  const u = (dph = (dph + ORBIT / heard.sr) % 1) * NB, i = u | 0, x = BEAM[i] + (BEAM[i + 1] - BEAM[i]) * (u - i)
  ;(d1 += dk * (x - d1)), (d2 += dk * (d1 - d2))
  return don * d2
}

// Every sample: the pad and the strings into the bed, voices 0 and 1 its left and right, 2 the sub in the middle; or,
// before the lip, into the spatial voices 3, 4 and 5 that the valley places on the shaft ahead.
// A second call at the same T (two scenes crossfading) sings the same sample.
const part: Part = { l: 0, r: 0, m: 0 }, out = { l: 0, r: 0, m: 0, a: 0 }
let last = NaN
export function sing(T: number, o: Stereo, gain = 1) {
  if (T !== last) {
    last = T
    out.l = out.r = out.m = 0
    const e = fade(T) * audible(T) * (1 + 0.5 * dove(T) ** 2) // swelling into the hole, reddened away, and back
    out.m = DISK * disk(T)
    if (e > 0) {
      if (Math.abs(T - at) >= 1e-3) set(T), arpeggio(T)
      part.l = part.r = part.m = 0
      pad.sample(part)
      strings.sample(part)
      const g = GAIN * e
      out.l = g * part.l
      out.r = g * part.r
      out.m += g * part.m
      out.a = ahead(T)
    }
  }
  const a = out.a, k = gain * (1 - a)
  o.s[0] += k * out.l
  o.s[1] += k * out.r
  o.s[2] += k * out.m
  if (a > 0) (o.s[3] += gain * a * out.l), (o.s[4] += gain * a * out.r), (o.s[5] += 0.5 * gain * a * out.m)
}

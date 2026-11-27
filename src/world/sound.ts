// The sound of River's planet. The fall's choir lands as we come out of the cloud (choir.ts) and the planet's own
// takes over: the same instrument, a Shepard pad (dsp/shepard.ts), held still now, an open fifth in a slow hall,
// breathing. It is in the key of wherever the eye is. Every place has a pitch of its own, a rate or a carrier of
// the thing it is (KEYS), and the pad is tuned to the places as the eye is near them: their pitch classes averaged
// on the circle of an octave, each weighted by how near it is. So flying from one place to another the whole
// chord slides from one key into the next, and being an octave stack it can slide forever without climbing.
//
// The places. Each place's module says what it sounds like (its `voice`, a mono signal of its own time, in its own
// key). The three the eye hears best are the three spatial voices (audio.ts, HRTF), each in its true direction
// from the camera, as loud as 1 / (1 + (d/reach)⁴), a place's reach its own size, so a place is there when you are
// at it and gone when you leave, a quarter of that with the planet in the way. Sound is given a speed, CS radii a
// second, as light is slowed elsewhere here: a place is heard d/CS late, so flying at one raises its pitch and
// leaving drops it, which is all Doppler is. Some of each goes to the hall.
//
// Low in the air, the wind: noise through a resonance, as loud as the root of the air's density (planet.wgsl's
// scale height) times the square of its speed, the westerlies and the storm's vortex round its eye. And in the
// storm, the lightning the beam flashes (stroke(j)): thunder, rolling in d/c_s after it, low and long.
//
// Inside the core the planet is left outside and the core's own sound fills the hall, which is its dome.
import { BED, heard, room, type Stereo, type Voice } from '../audio/audio'
import { Shepard, type Part } from '../dsp/shepard'
import { clamp, hash, noise, smooth, space } from '../acts/scene'
import { LAND, SKY, place, sing } from '../acts/choir'
import { END } from '../acts/clock'
import { CORE } from '../gpu/fields'
import { clear, ctx, len, site, type V } from './ctx'
import { PLACES } from './places'
import { C, RE } from './sites/sky'
import { voice as bench } from './sites/bench'
import { voice as core } from './sites/core'
import { voice as hearts } from './sites/hearts'
import { voice as launch } from './sites/launch'
import { voice as lighthouse } from './sites/lighthouse'
import { voice as receiver } from './sites/receiver'
import { tonic, voice as station } from './sites/station'
import { voice as valley } from './sites/valley'

// A place's sound at its own time t, dt after the sample before.
type Speak = (t: number, dt: number) => number

const CS = 12 // radii a second
const SLOTS = 3, FADE = 1 / (0.08 * 48000), EASE = 1 / (0.04 * 48000), GLIDE = 1 / (0.4 * 48000), SEND = 0.35
const SPEAK: Record<string, Speak> = { valley, launch, lighthouse, bench, hearts, receiver, station }
// Each place's pitch, Hz: esp-dvbs2's carrier as its voice brings it down; Pigeon Vision's receiver's BFO; R-01's
// lines a second; PEEP's 38 kHz slowed 25×; the hearts' lub; Ephemeris-1's despread carriers; SAMWISE's field as a
// proton precesses in it (it moves, so it is asked); and the sieve's A. Home is A.
const KEYS: Record<string, number | (() => number)> = { valley: 480, launch: 1760, lighthouse: 120, bench: 1520, hearts: 55, receiver: 1320, station: tonic, core: 55 }
const HOME = 55
type Source = { k: number; speak: Speak; flip: number; reach: number; w: V; g: number; d: number; d2: number; gT: number; dT: number; tau: number; rank: number }
const source = (k: number, speak: Speak, flip = 1): Source => ({ k, speak, flip, reach: 1.2 * PLACES[k].view[0], w: [0, 0, 1], g: 0, d: 0, d2: 0, gT: 0, dT: 0, tau: NaN, rank: 0 })
const SOURCES = PLACES.flatMap((P, k) => (SPEAK[P.id] ? [source(k, SPEAK[P.id])] : []))
// the other heart, at the antipode, beating light's time round the planet late
SOURCES.push(source(PLACES.findIndex((P) => P.id === 'hearts'), (t) => hearts(t - (Math.PI * RE) / C), -1))
type Slot = { src?: Source; want?: Source; was?: Source; fade: number; at: number }
const slots: Slot[] = Array.from({ length: SLOTS }, () => ({ fade: 0, at: -Infinity }))

// ---- the planet's choir ------------------------------------------------------------------------------------------
const hum = new Shepard(48000, 1), part: Part = { l: 0, r: 0, m: 0 }
let key = 0, goal = 0, near = 0, hl = 0 // the pad's descent (its key, in octaves) and where it is going, how near a place the eye is, the level
// Each frame: where the key is going and the colour, from where the eye is and the clock (slow drifts at rates no
// two alike, so it never repeats). Near a place the chord opens and blooms into its ninth.
function tune(t: number, level: number) {
  let x = 0, y = 0, sum = 0, w0 = 1
  for (const P of PLACES) {
    const K = KEYS[P.id], f = typeof K === 'function' ? K() : K
    if (!(f > 0)) continue
    if (P.where) P.where(q3, t)
    else site(P.lat, P.lon, q3)
    const d = Math.hypot(q3[0] - ctx.E[0], q3[1] - ctx.E[1], q3[2] - ctx.E[2]), w = 1 / (1 + (d / (2 * P.view[0])) ** 4)
    const a = -2 * Math.PI * Math.log2(f / HOME)
    ;(x += w * Math.cos(a)), (y += w * Math.sin(a)), (sum += w), (w0 = Math.max(0, w0 - w))
  }
  x += w0, near = clamp(sum)
  // the nearest way round the circle from where it is: voice() glides it there over a second or so
  const want = -Math.atan2(y, x) / (2 * Math.PI)
  goal = want - Math.round(want - key)
  hum.bright = 1500 * 2 ** (0.6 * noise(0.031 * t) + 0.5 * near)
  hum.tone = 0.45 + 0.15 * noise(0.023 * t + 5)
  hum.bloom = clamp(0.35 + 0.4 * near + 0.35 * noise(0.019 * t + 11))
  hum.fifth = 0.75
  hum.beat = 0.08 + 0.05 * noise(0.05 * t + 3)
  hum.width = 0.8
  hum.turn = 0.05 * t
  hum.sub = 1.4
  hum.breath = 0.06
  hum.air = 900
  hl = 0.14 * level
}

// ---- the weather --------------------------------------------------------------------------------------------------
// Stroke j: when, and where in the storm's arms (30° to 48° from the pole). Strokes j ≤ ⌊(t + ½)/GAP⌋ + 1 are all
// there have been by t; whoever draws the lightning may ask the same way.
export const GAP = 4.3 // seconds between strokes, about
type Stroke = { j: number; t: number; s: V }
const strokes: Stroke[] = Array.from({ length: 8 }, () => ({ j: NaN, t: 0, s: [0, 0, 0] }))
export function stroke(j: number) {
  const S = strokes[j & 7]
  if (S.j === j) return S
  S.j = j, S.t = GAP * (j + 0.45 * hash(j * 1.7))
  site(51 + 9 * hash(j * 3.1 + 5), 180 * hash(j * 7.3 + 2), S.s)
  return S
}
// The thunder heard now: the last few strokes, each arriving at the speed of sound (slowed as light is, CT radii a
// second), as loud as it is near and the eye is low. A roll is noise through a low resonance, swelling in over a
// tenth of a second and dying over two, rumbling as its own echoes come in.
const CT = 0.05, ROLL = 4, rolls = new Float64Array(2 * ROLL)
function listen(t: number, level: number, alt: number) {
  for (let n = 0, j = Math.floor((t + 0.5) / GAP) + 1; n < ROLL; n++, j--) {
    const S = stroke(j), d = Math.hypot(S.s[0] - ctx.E[0], S.s[1] - ctx.E[1], S.s[2] - ctx.E[2])
    rolls[2 * n] = S.t + d / CT
    rolls[2 * n + 1] = level * Math.exp(-d / 0.25) * Math.exp(-alt / 0.05)
  }
}
let tl = 0, tb = 0, tr = 0
function thunder(t: number, o: Stereo) {
  let env = 0
  for (let n = 0; n < ROLL; n++) {
    const a = t - rolls[2 * n], g = rolls[2 * n + 1]
    if (a > 0 && a < 4 && g > 1e-4) env += g * Math.min(1, a / 0.12) * Math.exp(-a / 0.7) * (0.6 + 0.4 * noise(9 * a + n))
  }
  if (env < 1e-5) return
  tb += 0.012 * (Math.random() - 0.5 - tl - 0.7 * tb), tl += 0.012 * tb // a resonance near 90 Hz, broad
  tr += 0.004 * (tl - tr)
  o.s[2] += THUNDER * env * (tl - 0.5 * tr)
}

// The wind: two noises, left and right, each through its own resonance (a state-variable filter's band, then a pole
// at the same pitch to darken it).
const HR = 0.008 // the air's scale height, radii
let blow = 0, pitch = 0.05
const wl = [0, 0], wb = [0, 0], wd = [0, 0]
function wind(o: Stereo) {
  for (let c = 0; c < 2; c++) {
    const f = c ? 1.13 * pitch : pitch
    ;(wb[c] += f * (Math.random() - 0.5 - wl[c] - 0.5 * wb[c])), (wl[c] += f * wb[c]), (wd[c] += 0.5 * f * (wb[c] - wd[c]))
  }
  o.l += blow * wd[0], o.r += blow * wd[1]
}

// ---- every sample ------------------------------------------------------------------------------------------------
const PLACE = 0.8, THUNDER = 3, WIND = 1.1 // the mix
let inside = 0, deep = 0, lastT = 0
function voice(t: number, o: Stereo) {
  const sr = 1 / heard.sr, dt0 = t - lastT > 0 && t - lastT < 1e-3 ? t - lastT : sr
  lastT = t
  inside += (deep - inside) * 0.1 * EASE
  for (let i = 0; i < SLOTS; i++) {
    const s = slots[i]
    if (s.src !== s.want) {
      // its voice goes to another place: this one fades out first
      if ((s.fade -= FADE) <= 0) {
        ;(s.fade = 0), (s.was = s.src), (s.at = t)
        const S = (s.src = s.want)
        if (S) (S.g = S.gT), (S.d = S.d2 = S.dT), (S.tau = NaN)
      }
    } else if (s.fade < 1) s.fade = Math.min(1, s.fade + FADE)
    const S = s.src
    if (!S || S.gT + S.g < 1e-3) continue // 60 dB down: not worth its cost
    // its distance followed smoothly, twice over, so its pitch has no steps in it
    ;(S.g += (S.gT - S.g) * EASE), (S.d += (S.dT - S.d) * EASE), (S.d2 += (S.d - S.d2) * EASE)
    const tau = t - S.d2 / CS, dt = tau - S.tau
    S.tau = tau
    const v = s.fade * S.g * S.speak(tau, dt > 0 && dt < 1e-3 ? dt : sr)
    ;(o.s[BED + i] += v), (o.s[2] += SEND * v)
  }
  if (hl > 1e-4) {
    hum.s = key += (goal - key) * GLIDE
    part.l = part.r = part.m = 0
    hum.sample(part)
    const g = hl * (1 - 0.8 * inside)
    ;(o.s[0] += g * part.l), (o.s[1] += g * part.r), (o.s[2] += g * part.m)
  }
  if (inside > 1e-3) {
    const v = 0.7 * inside * core(t, dt0)
    ;(o.s[0] += 0.5 * v), (o.s[1] += 0.5 * v), (o.s[2] += 0.5 * v)
  }
  thunder(t, o)
  if (blow > 1e-4) wind(o)
}

// ---- every frame -------------------------------------------------------------------------------------------------
const holds = (S: Source) => slots[0].want === S || slots[1].want === S || slots[2].want === S
const byRank = (a: Source, b: Source) => b.rank - a.rank
const e: V = [0, 0, 0], q3: V = [0, 0, 0]
// A free voice for S: the one it was just fading from, if it has only now lost it.
function give(S: Source) {
  let to: Slot | undefined
  for (const s of slots) if (!s.want && (s.src === S || !to)) to = s
  if (to) to.want = S
}
// The planet's voice as ctx has it now (so after planet.paint): call it once a frame, and play what it returns at
// planet time, the clock paint was given.
export function sound(level = 1): Voice {
  const t = ctx.t, E = ctx.E, p = ctx.p, r = len(E)
  ;(e[0] = E[0] / r), (e[1] = E[1] / r), (e[2] = E[2] / r)
  deep = ctx.f?.field?.shader === CORE ? level : 0 // the core has taken the picture over: we are inside
  const out = level * (1 - deep)
  room.rt = 4.5 + 3 * deep, room.wet = 0.55 + 0.2 * deep, room.gain = 1, room.tone = 7000, room.shimmer = 0.18 + 0.05 * deep, room.chorus = 0.5

  // the places: where each is and how loud; the three loudest take a voice, and whoever has one keeps it unless clearly outdone
  for (const S of SOURCES) {
    const P = PLACES[S.k], w = S.w
    if (P.where && S.flip > 0) P.where(w, t)
    else site(P.lat, P.lon, w), (w[0] *= 1.01 * S.flip), (w[1] *= 1.01 * S.flip), (w[2] *= 1.01 * S.flip)
    S.dT = Math.hypot(w[0] - E[0], w[1] - E[1], w[2] - E[2])
    S.gT = (PLACE * out * (clear(w) ? 1 : 0.25) * (S.k === ctx.focus ? 1 : 0.6)) / (1 + (S.dT / S.reach) ** 4)
    S.rank = S.gT * (holds(S) ? 1.4 : 1)
  }
  SOURCES.sort(byRank)
  for (const s of slots) if (s.want && SOURCES.indexOf(s.want) >= SLOTS) s.want = undefined
  for (let i = 0; i < SLOTS; i++) if (!holds(SOURCES[i])) give(SOURCES[i])
  for (let i = 0; i < SLOTS; i++) {
    const s = slots[i], S = t < s.at ? s.was : s.src // what is playing now was rendered a moment ago
    if (!S) continue
    const x = S.w[0] - E[0], y = S.w[1] - E[1], z = S.w[2] - E[2], d = Math.hypot(x, y, z) || 1, o = 3 * (BED + i)
    ;(space[o] = (x * p[4] + y * p[5] + z * p[6]) / d), (space[o + 1] = (x * p[8] + y * p[9] + z * p[10]) / d), (space[o + 2] = -(x * p[12] + y * p[13] + z * p[14]) / d)
  }
  tune(t, out)

  // the weather: thunder from the storm's strokes, and the wind, its speed the westerlies' and the vortex's,
  // v ∝ φ/(φ² + a²) about the eye of the storm, gusting
  const alt = Math.max(r - 1, 0)
  listen(t, out, alt)
  const phi = Math.acos(clamp(e[1], -1, 1)), a = 0.07, speed = (0.6 + (2 * a * phi) / (phi * phi + a * a)) * (1 + 0.4 * noise(0.31 * t))
  blow = WIND * out * Math.exp(-alt / (2 * HR)) * speed * speed
  pitch = 2 * Math.sin((Math.PI * 260 * speed * (1 + 0.3 * noise(0.17 * t + 9))) / heard.sr)
  return voice
}

// The arrival's voice (arrive.ts). Call it once a frame, after the planet is painted (so the world can hear where
// the eye is), with the scene's own t from 0 where the drain lets go, and play what it returns. The fall's choir
// lands and blooms as the eye comes out under the cloud, and the world comes up under it to take over as the
// planet comes whole (END).
export function arrival(t: number): Voice {
  const w = smooth(SKY - LAND, END - LAND - 1, t) ** 1.5, world = sound(w), off = ctx.t - t
  place(LAND + t, w)
  return (tt, o) => {
    sing(LAND + tt, o)
    world(tt + off, o)
  }
}

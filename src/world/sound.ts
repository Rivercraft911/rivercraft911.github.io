// The sound of River's planet. The choir ended with the reveal; what is heard here is the world itself, and every
// sound is a signal of the thing it belongs to.
//
// The places. Each place's module says what it sounds like (its `voice`, a mono signal of its own time). The three
// the eye hears best are the three spatial voices (audio.ts, HRTF), each in its true direction from the camera, as
// loud as 1 / (1 + (d/reach)²), a place's reach its own size, a quarter of that with the planet in the way, and the
// places not looked at receding as their drawing does (planet.paint). Sound is given a speed, CS radii a second, as
// light is slowed elsewhere here: a place is heard d/CS late, so flying at one raises its pitch and leaving drops
// it, which is all Doppler is. A little of each also goes to the hall.
//
// The planet. From orbit it is heard the way a VLF receiver hears one, 0.4 to 8 kHz of radio played as sound:
// - Lightning in the polar storm, a stroke every few seconds. Its sferic reaches the eye's place round the cavity
//   between ground and ionosphere, h = 90 km high, which carries nothing below f_c = c/2h, so each frequency comes
//   at its own group speed c √(1 − f_c²/f²): T = d/c after the stroke the pitch is f = f_c (T+τ)/√(τ(τ+2T)), a tweek
//   falling onto f_c, its phase 2π f_c √(τ(τ+2T)). By night it rings; by day the D layer swallows it and it is a click.
// - Whistlers. Some of the stroke leaks up and is led along the dipole's field line it stands on (station.ts's
//   field), L = 1/sin²θ radii out over the magnetic equator, to the other hemisphere and back again. In the plasma
//   there it is slow and low frequencies slower, t = D/√f (Eckersley), D = ∫ f_p / (2c √f_H) ds along the line. With
//   the density following the field (f_p² ∝ f_H, the gyrofrequency model) the integrand is constant, so
//   D = S f_p / (2c √f_H) taken at the equator, S the line's length in closed form, f_H the electron gyrofrequency
//   there and the density Carpenter and Anderson's, log₁₀ n = 3.9043 − 0.3145 L per cm³: 15 to 150 s√Hz from here.
//   Hop n has n times that, so its tone is f = (nD/τ)² and its phase −2π (nD)²/τ exactly. Odd hops come down at the
//   stroke's conjugate point and even hops back where it struck; each is heard best near where it comes down, from
//   that side, and is half as strong as the last.
// - Chorus. Where the eye is 4 to 10 radii out along its own field line, from midnight round through the morning,
//   electrons drifting in from the tail sing in rising tones between 0.1 and 0.5 of the gyrofrequency at the line's equator,
//   f_H / L³: a kilohertz or so at home. When each starts is drawn at random; the band, the place and the hour are
//   the planet's own.
// And low in the air, the wind: noise through a resonance, as loud as the root of the air's density (planet.wgsl's
// scale height) times the square of its speed, the westerlies and the storm's vortex round its eye.
//
// Inside the core the planet is left outside and the core's own sound fills the hall, which is its dome.
import { BED, heard, room, type Stereo, type Voice } from '../audio/audio'
import { TAU, clamp, hash, noise, smooth, space } from '../acts/scene'
import { CORE } from '../gpu/fields'
import { clear, ctx, dot, len, site, unit, type V } from './ctx'
import { PLACES } from './places'
import { C, DEG, RE } from './sites/sky'
import { voice as bench } from './sites/bench'
import { voice as core } from './sites/core'
import { voice as hearts } from './sites/hearts'
import { voice as launch } from './sites/launch'
import { voice as lighthouse } from './sites/lighthouse'
import { voice as receiver } from './sites/receiver'
import { voice as station } from './sites/station'
import { voice as valley } from './sites/valley'

// A place's sound at its own time t, dt after the sample before.
type Speak = (t: number, dt: number) => number

const CS = 12 // radii a second
const SLOTS = 3, FADE = 1 / (0.08 * 48000), EASE = 1 / (0.04 * 48000), SEND = 0.2
const SPEAK: Record<string, Speak> = { valley, launch, lighthouse, bench, hearts, receiver, station }
type Source = { k: number; speak: Speak; flip: number; reach: number; w: V; g: number; d: number; d2: number; gT: number; dT: number; tau: number; rank: number }
const source = (k: number, speak: Speak, flip = 1): Source => ({ k, speak, flip, reach: 1.2 * PLACES[k].view[0], w: [0, 0, 1], g: 0, d: 0, d2: 0, gT: 0, dT: 0, tau: NaN, rank: 0 })
const SOURCES = PLACES.flatMap((P, k) => (SPEAK[P.id] ? [source(k, SPEAK[P.id])] : []))
// the other heart, at the antipode, beating light's time round the planet late
SOURCES.push(source(PLACES.findIndex((P) => P.id === 'hearts'), (t) => hearts(t - (Math.PI * RE) / C), -1))
type Slot = { src?: Source; want?: Source; was?: Source; fade: number; at: number }
const slots: Slot[] = Array.from({ length: SLOTS }, () => ({ fade: 0, at: -Infinity }))

// ---- the planet's radio ------------------------------------------------------------------------------------------
const M: V = unit([Math.sin(10 * DEG) * 0.6, Math.cos(10 * DEG), Math.sin(10 * DEG) * 0.8]) // the dipole, as station.ts has it
const FH = 28.025e9 * 3.12e-5 // the electron gyrofrequency on the ground at the magnetic equator, Hz
const FC = C / (2 * 90e3) // the cavity's cutoff, Hz
export const GAP = 4.3 // seconds between strokes, about
const HI = 7500, LO = 420, HOPS = 3 // the band a whistler is heard in, Hz; the hops heard
function dispersion(L: number) {
  const x = Math.sqrt(1 - 1 / L), S = 2 * L * RE * (0.5 * x * Math.sqrt(1 + 3 * x * x) + Math.asinh(Math.sqrt(3) * x) / (2 * Math.sqrt(3)))
  return (S * 8980 * Math.sqrt(10 ** (3.9043 - 0.3145 * L))) / (2 * C * Math.sqrt(FH / L ** 3))
}
// Stroke j: when, where in the storm's arms (30° to 48° from the pole), its conjugate point, its line's dispersion.
// Strokes j ≤ ⌊(t + ½)/GAP⌋ + 1 are all there have been by t; whoever draws the lightning may ask the same way.
type Stroke = { j: number; t: number; s: V; c: V; D: number }
const strokes: Stroke[] = Array.from({ length: 8 }, () => ({ j: NaN, t: 0, s: [0, 0, 0], c: [0, 0, 0], D: 0 }))
export function stroke(j: number) {
  const S = strokes[j & 7]
  if (S.j === j) return S
  S.j = j, S.t = GAP * (j + 0.45 * hash(j * 1.7))
  site(51 + 9 * hash(j * 3.1 + 5), 180 * hash(j * 7.3 + 2), S.s)
  const m = dot(S.s, M)
  for (let i = 0; i < 3; i++) S.c[i] = S.s[i] - 2 * m * M[i]
  S.D = dispersion(clamp(1 / (1 - m * m), 1.2, 4))
  return S
}

const put = (A: Float64Array, q: number, a: number, b: number, c: number, d: number, e: number, f: number) => ((A[q] = a), (A[q + 1] = b), (A[q + 2] = c), (A[q + 3] = d), (A[q + 4] = e), (A[q + 5] = f))
const MAX = 20, tones = new Float64Array(6 * MAX), ticks = new Float64Array(6 * MAX) // this frame's whistlers and sferics
let nTones = 0, nTicks = 0
const e: V = [0, 0, 0]
const side = (w: ArrayLike<number>) => clamp(1.6 * (w[0] * ctx.p[4] + w[1] * ctx.p[5] + w[2] * ctx.p[6]), -1, 1) // left or right of the camera
function listen(t: number, level: number) {
  nTones = nTicks = 0
  const night = smooth(0.1, -0.2, dot(e, ctx.L))
  for (let j = Math.floor((t + 0.5) / GAP) + 1, n = 0; n < 6 && level > 0; n++, j--) {
    const S = stroke(j), age = t - S.t
    if (age < -0.5) continue
    const ds = Math.acos(clamp(dot(e, S.s), -1, 1)), dc = Math.acos(clamp(dot(e, S.c), -1, 1)), T = (ds * RE) / C
    if (age < 0.5) {
      const pan = 0.4 * side(S.s), g = SFERIC * level * Math.exp(-ds / 1.6)
      put(ticks, 6 * nTicks++, S.t + T, T, 0.002 + 0.03 * night, g * (1 - pan), g * (1 + pan), 0)
    }
    for (let hop = 1; hop <= HOPS; hop++) {
      const odd = hop & 1, d = odd ? dc : ds, g = WHISTLE * level * 0.5 ** (hop - 1) * (0.1 + 0.9 * Math.exp(-((d / 0.75) ** 2))), nD = hop * S.D
      if (age > nD / Math.sqrt(LO) || nTones >= MAX) continue
      const pan = 0.7 * side(odd ? S.c : S.s)
      put(tones, 6 * nTones++, S.t, nD * nD, nD / Math.sqrt(HI), nD / Math.sqrt(LO), g * (1 - pan), g * (1 + pan))
    }
  }
}
function radio(t: number, o: Stereo) {
  for (let q = 0; q < 6 * nTones; q += 6) {
    const tau = t - tones[q], a = tones[q + 2], b = tones[q + 3]
    if (tau <= a || tau >= b) continue
    // two ducts a few percent apart, as whistlers come: it swishes
    const k = tones[q + 1] / tau, env = Math.min(1, (tau - a) / (0.25 * a)) * Math.min(1, (b - tau) / (0.4 * b))
    const v = env * env * (Math.sin(TAU * k) + 0.6 * Math.sin(TAU * 1.07 * k))
    o.s[0] += tones[q + 4] * v, o.s[1] += tones[q + 5] * v
  }
  for (let q = 0; q < 6 * nTicks; q += 6) {
    const tau = t - ticks[q], T = ticks[q + 1], td = ticks[q + 2]
    if (tau < T / 60 || tau > 8 * td) continue // it starts where the pitch has fallen into hearing
    const v = Math.exp(-tau / td) * Math.sin(TAU * FC * Math.sqrt(tau * (tau + 2 * T)))
    o.l += ticks[q + 3] * v, o.r += ticks[q + 4] * v
  }
}

// The chorus: a rising tone may start every SLOT seconds; the last few are still sounding.
const SLOT = 0.09, RISERS = 6, risers = new Float64Array(6 * RISERS).fill(NaN)
let dawn = 0, fce = 4000
function chorus(t: number, o: Stereo) {
  const m = Math.floor(t / SLOT)
  for (let i = 0; i < RISERS; i++) {
    const j = m - i, q = 6 * (((j % RISERS) + RISERS) % RISERS)
    // a little over half the slots have one: when in it, how long, from what pitch, how fast up, and where across the stage
    if (risers[q] !== j) put(risers, q, j, hash(j * 5.3) < 0.1 ? (j + 0.5 * hash(j * 2.9)) * SLOT : Infinity, 0.28 + 0.14 * hash(j * 9.1), fce * (0.2 + 0.09 * hash(j * 4.7)), fce * (0.35 + 0.2 * hash(j * 6.1)), 0.5 + 0.45 * hash(j * 8.3))
    const tau = t - risers[q + 1], dur = risers[q + 2]
    if (!(tau > 0 && tau < dur)) continue
    const en = Math.sin((Math.PI * tau) / dur), v = dawn * en * en * Math.sin(TAU * tau * (risers[q + 3] + 0.5 * risers[q + 4] * tau))
    o.s[0] += v * (1 - risers[q + 5]), o.s[1] += v * risers[q + 5]
  }
}

// The wind: two noises, left and right, each through its own resonance (a state-variable filter's band, then a pole
// at the same pitch to darken it).
const HR = 0.008 // the air's scale height, radii
let blow = 0, pitch = 0.05
const wl = [0, 0], wb = [0, 0], wd = [0, 0]
function wind(o: Stereo) {
  for (let c = 0; c < 2; c++) {
    const f = c ? 1.13 * pitch : pitch
    wb[c] += f * (Math.random() - 0.5 - wl[c] - 0.4 * wb[c]), wl[c] += f * wb[c], wd[c] += f * (wb[c] - wd[c])
  }
  o.l += blow * wd[0], o.r += blow * wd[1]
}

// ---- every sample ------------------------------------------------------------------------------------------------
const PLACE = 2, WHISTLE = 0.5, SFERIC = 0.8, CHORUS = 0.2, WIND = 1.6 // the mix
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
        s.fade = 0, s.was = s.src, s.at = t
        const S = (s.src = s.want)
        if (S) (S.g = S.gT), (S.d = S.d2 = S.dT), (S.tau = NaN)
      }
    } else if (s.fade < 1) s.fade = Math.min(1, s.fade + FADE)
    const S = s.src
    if (!S || S.gT + S.g < 1e-5) continue
    // its distance followed smoothly, twice over, so its pitch has no steps in it
    S.g += (S.gT - S.g) * EASE, S.d += (S.dT - S.d) * EASE, S.d2 += (S.d - S.d2) * EASE
    const tau = t - S.d2 / CS, dt = tau - S.tau
    S.tau = tau
    const v = s.fade * S.g * S.speak(tau, dt > 0 && dt < 1e-3 ? dt : sr)
    o.s[BED + i] += v, o.s[2] += SEND * v
  }
  if (inside > 1e-3) {
    const v = 1.5 * inside * core(t, dt0)
    o.s[0] += 0.5 * v, o.s[1] += 0.5 * v, o.s[2] += 0.7 * v
  }
  if (nTones || nTicks) radio(t, o)
  if (dawn > 1e-3) chorus(t, o)
  if (blow > 1e-4) wind(o)
}

// ---- every frame -------------------------------------------------------------------------------------------------
const v3: V = [0, 0, 0]
const holds = (S: Source) => slots[0].want === S || slots[1].want === S || slots[2].want === S
const byRank = (a: Source, b: Source) => b.rank - a.rank
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
  e[0] = E[0] / r, e[1] = E[1] / r, e[2] = E[2] / r
  deep = ctx.f.field?.shader === CORE ? level : 0 // the core has taken the picture over: we are inside
  const out = level * (1 - deep)
  room.rt = 3 + 4 * deep, room.wet = 0.5 + 0.3 * deep, room.gain = 1, room.tone = 6000

  // the places: where each is and how loud; the three loudest take a voice, and whoever has one keeps it unless clearly outdone
  for (const S of SOURCES) {
    const P = PLACES[S.k], w = S.w
    if (P.where && S.flip > 0) P.where(w, t)
    else site(P.lat, P.lon, w), (w[0] *= 1.01 * S.flip), (w[1] *= 1.01 * S.flip), (w[2] *= 1.01 * S.flip)
    S.dT = Math.hypot(w[0] - E[0], w[1] - E[1], w[2] - E[2])
    S.gT = (PLACE * out * (clear(w) ? 1 : 0.25) * (S.k === ctx.focus ? 1 : ctx.focus < 0 ? 0.5 : 0.3)) / (1 + (S.dT / S.reach) ** 2)
    S.rank = S.gT * (holds(S) ? 1.4 : 1)
  }
  SOURCES.sort(byRank)
  for (const s of slots) if (s.want && SOURCES.indexOf(s.want) >= SLOTS) s.want = undefined
  for (let i = 0; i < SLOTS; i++) if (!holds(SOURCES[i])) give(SOURCES[i])
  for (let i = 0; i < SLOTS; i++) {
    const s = slots[i], S = t < s.at ? s.was : s.src // what is playing now was rendered a moment ago
    if (!S) continue
    const x = S.w[0] - E[0], y = S.w[1] - E[1], z = S.w[2] - E[2], d = Math.hypot(x, y, z) || 1, o = 3 * (BED + i)
    space[o] = (x * p[4] + y * p[5] + z * p[6]) / d, space[o + 1] = (x * p[8] + y * p[9] + z * p[10]) / d, space[o + 2] = -(x * p[12] + y * p[13] + z * p[14]) / d
  }

  // the radio: the strokes still in the air; the chorus where the eye's own field line goes
  listen(t, out)
  const m = dot(e, M), L = r / Math.max(1 - m * m, 1e-3)
  fce = FH / clamp(L, 4, 11) ** 3
  v3[0] = ctx.L[2], v3[1] = 0, v3[2] = -ctx.L[0] // the sun goes round the pole: this is the meridian it has left
  dawn = CHORUS * out * smooth(4, 5, L) * (1 - smooth(8, 11, L)) * smooth(-0.8, 0.3, -dot(e, v3) / (Math.hypot(v3[0], v3[2]) || 1))

  // the wind: its speed the westerlies' and the vortex's, v ∝ φ/(φ² + a²) about the eye of the storm, gusting
  const phi = Math.acos(clamp(e[1], -1, 1)), a = 0.07, speed = (0.6 + (2 * a * phi) / (phi * phi + a * a)) * (1 + 0.4 * noise(0.31 * t))
  blow = WIND * out * Math.exp(-Math.max(r - 1, 0) / (2 * HR)) * speed * speed
  pitch = 2 * Math.sin((Math.PI * 320 * speed * (1 + 0.3 * noise(0.17 * t + 9))) / heard.sr)
  return voice
}

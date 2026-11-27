// The sound of River's planet. The fall's choir lands as we come out of the cloud (choir.ts) and the planet's own
// takes over: the same instrument, Shepard pads (dsp/shepard.ts), held still now, open fifths in a slow hall,
// breathing. They are in the key of wherever the eye is. Every place has a pitch of its own, a rate or a carrier of
// the thing it is (KEYS), and the pads are tuned to the places as the eye is near them: their pitch classes averaged
// on the circle of an octave, each weighted by how near it is. So flying from one place to another the whole
// chord slides from one key into the next, and being an octave stack it can slide forever without climbing.
//
// Over the key a score is played that never comes round again (the score, below): chords walked as common practice
// walks them, movements chosen from what the eye is doing, a melody of bells, the places' own events answered on the
// beat from where they are, and the eye's flights strummed as it climbs and falls.
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
import { Plucks } from '../dsp/pluck'
import { clamp, hash, noise, smooth, space } from '../acts/scene'
import { LAND, SKY, place, sing } from '../acts/choir'
import { END } from '../acts/clock'
import { CORE } from '../gpu/fields'
import { clear, ctx, dot, len, site, type V } from './ctx'
import { PLACES } from './places'
import { C, RE } from './sites/sky'
import { voice as bench } from './sites/bench'
import { voice as bleps } from './sites/bleps'
import { voice as core } from './sites/core'
import { voice as glasses } from './sites/glasses'
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
const SPEAK: Record<string, Speak> = { valley, launch, lighthouse, bench, glasses, hearts, receiver, station, bleps }
// Each place's pitch, Hz: esp-dvbs2's carrier as its voice brings it down; Pigeon Vision's receiver's BFO; R-01's
// lines a second; PEEP's 38 kHz slowed 25×; the hearts' lub; Ephemeris-1's despread carriers; SAMWISE's field as a
// proton precesses in it (it moves, so it is asked); the strobe glasses' purr, the note their beat swells; BLEPS's
// 433 MHz beacon; and the sieve's A. Home is A.
const KEYS: Record<string, number | (() => number)> = { valley: 480, launch: 1760, lighthouse: 120, bench: 1520, glasses: 95, hearts: 55, receiver: 1320, station: tonic, bleps: 433, core: 55 }
const HOME = 55
type Source = { k: number; speak: Speak; flip: number; reach: number; w: V; g: number; d: number; d2: number; gT: number; dT: number; tau: number; rank: number }
const source = (k: number, speak: Speak, flip = 1): Source => ({ k, speak, flip, reach: 1.2 * PLACES[k].view[0], w: [0, 0, 1], g: 0, d: 0, d2: 0, gT: 0, dT: 0, tau: NaN, rank: 0 })
const SOURCES = PLACES.flatMap((P, k) => (SPEAK[P.id] ? [source(k, SPEAK[P.id])] : []))
// the other heart, at the antipode, beating light's time round the planet late
SOURCES.push(source(PLACES.findIndex((P) => P.id === 'hearts'), (t) => hearts(t - (Math.PI * RE) / C), -1))
// A voice also listens to its place (pk, sl: its peak and the peak's slow mean) and answers with bells of its own.
type Slot = { src?: Source; want?: Source; was?: Source; fade: number; at: number; pk: number; sl: number; quiet: number; due: number; bell: Plucks }
const slots: Slot[] = Array.from({ length: SLOTS }, () => ({ fade: 0, at: -Infinity, pk: 0, sl: 0, quiet: 0, due: -1, bell: new Plucks(48000, 30 / 64) })) // its echo an eighth

// ---- the planet's choir ------------------------------------------------------------------------------------------
// Two pads, so a chord can change by one swelling as the other fades; each sings its chord's root and fifth over the
// key (roots, in octaves), the major third in its bloom where the chord has one.
const pads = [new Shepard(1), new Shepard(1)], part: Part = { l: 0, r: 0, m: 0 }, roots = [0, 0], blooms = [0, 0]
let key = 0, goal = 0, near = 0, hl = 0, xf = 0, side = 0 // the key (a descent, in octaves) and where it is going, how near a place the eye is, the level; the crossfade and the pad it goes to
const XF = 1 / (3 * 48000)
// Each frame: where the key is going and the colour, from where the eye is and the clock (slow drifts at rates no
// two alike, so it never repeats). Near a place the chord opens and blooms.
function tune(t: number, level: number) {
  let x = 0, y = 0, sum = 0, w0 = 1
  for (const P of PLACES) {
    const K = KEYS[P.id], f = typeof K === 'function' ? K() : K
    if (!(f > 0)) continue
    if (P.where) P.where(q3, t)
    else site(P.lat, P.lon, q3)
    const d = Math.hypot(q3[0] - ctx.E[0], q3[1] - ctx.E[1], q3[2] - ctx.E[2]), w = 1 / (1 + (d / (2 * P.view[0])) ** 4)
    const a = 2 * Math.PI * Math.log2(f / HOME) // a descent: −log₂ of the pitch
    ;(x += w * Math.cos(a)), (y += w * Math.sin(a)), (sum += w), (w0 = Math.max(0, w0 - w))
  }
  x += w0, near = clamp(sum)
  // the nearest way round the circle from where it is: voice() glides it there over a second or so
  const want = -Math.atan2(y, x) / (2 * Math.PI)
  goal = want - Math.round(want - key)
  const bloom = clamp(0.35 + 0.4 * near + 0.35 * noise(0.019 * t + 11))
  for (let i = 0; i < 2; i++) {
    const P = pads[i]
    P.bright = 1500 * look.bright * 2 ** (0.6 * noise(0.031 * t) + 0.5 * near + 0.3 * day)
    P.tone = 0.45 + 0.15 * noise(0.023 * t + 5)
    P.bloom = bloom * blooms[i]
    P.fifth = 0.75
    P.beat = 0.08 + 0.05 * noise(0.05 * t + 3)
    P.width = 0.8
    P.turn = 0.05 * t
    P.sub = 1.4
    P.breath = 0.06 + 0.05 * dark
    P.air = 900
  }
  hl = 0.14 * level
}

// ---- the score ---------------------------------------------------------------------------------------------------
// Time is the hearts' (a beat of 60/64 s, which both keep across the planet), counted in eighths, sixteen to a
// phrase. The harmony is the major scale of the key, a chord to a phrase (or two, in the slow movements), and the
// next chord a step of a walk by root motion as common practice walks: up a fourth likeliest, then down a third, up a
// step, up a fifth; pulled home the longer it is away, home being the tonic while the ground under the eye is in
// daylight and its relative minor at night. Arriving at a place, it goes home on the next phrase. The form is a
// walk too: movements of three to six phrases, each a texture (MOVES), the next chosen from what the eye is doing and
// never the same twice running. Through them a melody of bells walks the key's pentatonic and the chord's tones on
// the beat, from the sun's side of the screen, its register the eye's height, as dense as the movement and the
// visitor's own restlessness ask, breathing out at each phrase's end. Whatever strikes in a place's own signal (a
// key typed, a symbol sent, a beat) is answered with a chord tone on the next eighth, from the place. And a flight
// strums the pentatonic as the eye climbs and falls, a string for every sixth of an octave of height, softer the
// more often it is asked.
const EIGHTH = 30 / 64, PHRASE = 16 * EIGHTH
const ROOTS = [0, 2, 4, 5, 7, 9], PENTA = [0, 2, 4, 7, 9]
const MOTION = [0, 0, 1.2, 0.5, 0.5, 3, 0, 1, 2, 2, 0.6, 0] // a chord's likelihood by how far its root rises, in semitones
// still, song, sky, deep: the melody's density and register (semitones), the pads' brightness, the hall's shimmer,
// the bells' echo, and phrases to a chord
const MOVES = [
  [0.12, 0, 0.75, 0.12, 0.35, 2],
  [0.5, 0, 1, 0.18, 0.4, 1],
  [0.42, 12, 1.5, 0.3, 0.55, 1],
  [0.28, -5, 0.65, 0.14, 0.3, 2],
]
const look = { dens: 0.12, reg: 0, bright: 0.75, shim: 0.12, echo: 0.35 } // the movement's, eased into
let chord = 0, third = 4, home = 0, away = 0, move = 0, until = -1, phrase = NaN, arrived = false
let dens = 0, centre = 0, mel = 0, lv = 0, sun = 0, day = 0, dark = 0, act = 0, strum = NaN, reed = 1, eighth = NaN
const bells = new Plucks(48000, 0.75 * EIGHTH), bo = { l: 0, r: 0 } // their echo a dotted sixteenth
let seed = 0x2545f491
const rand = () => ((seed ^= seed << 13), (seed ^= seed >>> 17), (seed ^= seed << 5), (seed >>> 0) / 4294967296)
const doh = () => 440 * 2 ** (Math.round(key) - key) // the key's tonic, Hz, within half an octave of A4
const mod12 = (n: number) => ((n % 12) + 12) % 12
const inChord = (n: number) => { const c = mod12(n - chord); return c === 0 || c === 7 || c === third }
const ok = (n: number) => PENTA.includes(mod12(n)) || inChord(n)
// n moved by k of the notes the melody may sing (k < 0 is down)
function walk(n: number, k: number) {
  for (let d = Math.sign(k), j = Math.abs(k), g = 0; j > 0 && g < 48; g++) if (ok((n += d))) j-- // (bounded: never a hang)
  return Number.isFinite(n) ? n : 0
}
const weigh = (to: number) => MOTION[mod12(to - chord)] * (to === home ? 1 + 0.6 * away : 1) * (to === 4 ? 0.5 : 1)
function next() {
  let sum = 0, r = rand()
  for (const d of ROOTS) sum += weigh(d)
  for (const d of ROOTS) if ((r -= weigh(d) / sum) < 0) return d
  return home
}
// To chord d: the silent pad takes it up and swells as the other fades.
function change(d: number) {
  if (d === chord || Math.abs(xf - side) > 1e-3) return
  ;(chord = d), (third = d === 2 || d === 4 || d === 9 ? 3 : 4), (away = d === home ? 0 : away + 1), (side ^= 1)
  ;(roots[side] = d / 12), (blooms[side] = third === 3 ? 0 : d === 7 ? 0.5 : 1) // V's bloom would sharpen the fourth
}
// Once a frame: the light, the visitor's restlessness, the flight's strings; at each phrase the movement and the chord.
const right: V = [0, 0, 0], W = [0, 0, 0, 0]
function score(t: number, dt: number, level: number, r: number, speed: number) {
  const p = ctx.p
  ;(right[0] = p[4]), (right[1] = p[5]), (right[2] = p[6])
  day = dot(e, ctx.L)
  dark = smooth(0.1, -0.25, day)
  sun = 0.6 * clamp(dot(ctx.L, right), -1, 1)
  home = dark > 0.5 ? 9 : 0
  act = act * Math.exp(-dt / 25) + 0.2 * level * Math.min(speed, 3) * dt // the arrival's own climb is not the visitor's
  reed = Math.min(1, reed + dt / 40)
  if (ctx.since < 0) arrived = false
  else if (!arrived) (arrived = true), (away = 99) // home on the next phrase
  const n = Math.floor(t / PHRASE)
  if (n !== phrase) {
    if (phrase !== phrase) until = n + 2 // the world begins still
    else if (n < until - 7 || n > until) until = n // a seek: choose afresh
    if (n >= until) {
      // still above the planet and at night, song at a place and when the visitor is restless, sky above it by day,
      // deep at a place and at night; never what it was
      const up = ctx.focus < 0 ? 1 : 0, a = clamp(act)
      ;(W[0] = 1 + up + dark), (W[1] = 2 - up + a), (W[2] = 1 + up * (1 - dark) + a), (W[3] = 2 + dark - up), (W[move] = 0)
      let x = rand() * (W[0] + W[1] + W[2] + W[3]), m = 0
      while (m < 3 && (x -= W[m]) >= 0) m++
      ;(move = m), (until = n + 3 + Math.floor(4 * rand()))
    }
    if (away === 99 || n % MOVES[move][5] === 0) change(away === 99 ? home : next())
    if (away === 99) away = 0
    phrase = n
  }
  const M = MOVES[move], k = 1 - Math.exp(-dt / 4)
  ;(look.dens += (M[0] - look.dens) * k), (look.reg += (M[1] - look.reg) * k), (look.bright += (M[2] - look.bright) * k)
  ;(look.shim += (M[3] - look.shim) * k), (look.echo += (M[4] - look.echo) * k)
  dens = clamp(look.dens * (0.6 + 0.8 * (0.5 + 0.5 * noise(t / 37 + 2))) * (1 - 0.4 * near) + 0.25 * clamp(act))
  centre = look.reg + 3 + 9 * clamp(Math.log2(r) / 2.4)
  bells.echo = look.echo
  lv = level
  // a string for every sixth of an octave of the eye's height, struck as the eye passes it in flight
  const s = Math.floor(6 * Math.log2(r))
  if (s !== strum && Math.abs(s - strum) < 4 && speed > 0.15 && level > 0.95) {
    const a = 0.09 * reed * Math.min(1, speed / 0.8), d = Math.sign(s - strum)
    for (let j = strum + d; j !== s + d; j += d) {
      const i = Math.max(0, j)
      bells.strike(0.5 * doh() * 2 ** ((PENTA[i % 5] + 12 * Math.floor(i / 5)) / 12), a, clamp(sun + (j & 1 ? 0.3 : -0.3), -1, 1), 1.4, 2)
      reed = Math.max(0, reed - 0.04)
    }
  }
  strum = s
}
// The melody's eighth e, if it sings: a step or two along the pentatonic and the chord's tones, toward the register,
// onto a chord tone on the strong beats.
function melody(e: number) {
  const k = ((e % 16) + 16) % 16, strong = k % 4 === 0
  if (rand() >= dens * (strong ? 1 : k % 2 ? 0.3 : 0.6) * (k >= 13 ? 0.2 : 1)) return
  const step = rand() < 0.15 ? 3 : rand() < 0.5 ? 1 : 2
  mel = walk(mel, rand() < 0.5 + (mel - centre) / 24 ? -step : step)
  // onto a chord tone, one way only (an octave at most holds one): turning back each step could pace forever between
  // two tones neither in the chord (under IV or iii there are such neighbours), and the page with it
  if (strong) for (let d = mel > centre ? -1 : 1, i = 0; i < 12 && !inChord(mel); i++) mel = walk(mel, d)
  bells.strike(doh() * 2 ** (mel / 12), (strong ? 0.15 : 0.1) * (0.7 + 0.3 * rand()), clamp(sun + 0.4 * (rand() - 0.5), -1, 1), 2.2 + rand(), 1.3)
}
// A place's answer: a tone of the chord over the key's tonic an octave up (root, fifth, third, octave, twelfth),
// going round the chord as the answers come.
let asked = 0
const ANSWER = [0, 7, 0, 12, 19]
const answer = () => {
  const j = asked++ % 5
  return 2 * doh() * 2 ** ((chord + (j === 2 ? third : ANSWER[j])) / 12)
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
  const e8 = Math.floor(t / EIGHTH)
  if (e8 !== eighth) (e8 === eighth + 1 && lv > 0.05 && melody(e8)), (eighth = e8)
  for (let i = 0; i < SLOTS; i++) {
    const s = slots[i]
    if (s.src !== s.want) {
      // its voice goes to another place: this one fades out first
      if ((s.fade -= FADE) <= 0) {
        ;(s.fade = 0), (s.was = s.src), (s.at = t), (s.pk = s.sl = 0), (s.due = -1)
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
    // what it says, listened to: a peak well over its recent mean is something struck, answered on the next eighth
    const x = S.speak(tau, dt > 0 && dt < 1e-3 ? dt : sr), ax = Math.abs(x)
    ;(s.pk = ax > s.pk ? ax : s.pk * 0.9985), (s.sl += (s.pk - s.sl) * 1e-4)
    if (s.pk > 2 * s.sl + 2e-3 && t > s.quiet) {
      s.quiet = t + 0.3
      if (s.due < 0 && S.g > 0.05 && rand() < 0.3 + 0.5 * dens) s.due = (Math.floor(t / EIGHTH) + 1) * EIGHTH
    }
    if (s.due >= 0 && t >= s.due) (s.due = -1), s.bell.strike(answer(), 0.14 * lv, 0, 1.8, 1)
    const v = s.fade * S.g * (x + s.bell.mono())
    ;(o.s[BED + i] += v), (o.s[2] += SEND * v)
  }
  if (hl > 1e-4) {
    key += (goal - key) * GLIDE
    xf += clamp(side - xf, -XF, XF)
    let l = 0, r = 0, m = 0
    for (let i = 0; i < 2; i++) {
      const g = i ? Math.sin(xf * (Math.PI / 2)) : Math.cos(xf * (Math.PI / 2))
      if (g < 1e-3) continue
      pads[i].s = key - roots[i]
      part.l = part.r = part.m = 0
      pads[i].sample(part)
      ;(l += g * part.l), (r += g * part.r), (m += g * part.m)
    }
    const g = hl * (1 - 0.8 * inside)
    ;(o.s[0] += g * l), (o.s[1] += g * r), (o.s[2] += g * m)
  }
  bo.l = bo.r = 0
  bells.sample(bo)
  ;(o.s[0] += lv * (1 - inside) * bo.l), (o.s[1] += lv * (1 - inside) * bo.r)
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
const e: V = [0, 0, 0], q3: V = [0, 0, 0], was: V = [0, 0, 0]
// A free voice for S: the one it was just fading from, if it has only now lost it.
function give(S: Source) {
  let to: Slot | undefined
  for (const s of slots) if (!s.want && (s.src === S || !to)) to = s
  if (to) to.want = S
}
// The planet's voice as ctx has it now (so after planet.paint): call it once a frame, and play what it returns at
// planet time, the clock paint was given.
export function sound(level = 1): Voice {
  const t = ctx.t, E = ctx.E, p = ctx.p, r = len(E), dt = ctx.dt
  const flown = dt > 0 ? Math.hypot(E[0] - was[0], E[1] - was[1], E[2] - was[2]) / dt : 0 // the eye's speed, radii a second
  ;(was[0] = E[0]), (was[1] = E[1]), (was[2] = E[2])
  ;(e[0] = E[0] / r), (e[1] = E[1] / r), (e[2] = E[2] / r)
  deep = ctx.f?.field?.shader === CORE ? level : 0 // the core has taken the picture over: we are inside
  const out = level * (1 - deep)
  score(t, dt, out, r, flown < 50 ? flown : 0)
  room.rt = 4.5 + 1.5 * dark + 3 * deep, room.wet = 0.55 + 0.2 * deep, room.gain = 1, room.tone = 7000, room.shimmer = look.shim + 0.05 * deep, room.chorus = 0.5

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

// The bench: PEEP and the strobe glasses. PEEP and the glasses' board stand where places.ts puts them; the glasses'
// frame stands here. What they do is kept for the sound.
//
// The glasses' firmware, at its fastest and darkest, runs 20 frames a second at 80 % dark, so each LCD valve is clear
// for 10 ms in every 50. A wheel of five blades, heard and not drawn, turns behind them at about 4 rev/s. Through a
// valve it is only where it was while the valve was last clear: five blades repeat every fifth of a turn, so it turns
// at f′ = f − f_s/5, and as the wheel's speed drifts through 4 rev/s it creeps forward, stands still and walks
// backwards.
//
// PEEP is set off the way its remote does it: three 9 ms bursts of 38 kHz infrared, 30 ms apart. The first edge starts
// the macro: a press report, a release, a gap, 10 ms each (the endpoint's own 10 ms poll); then 250 ms of quiet and it
// is armed again. Time here runs 25× slow. The macro is the README's first line.
import { TAU } from '../../acts/scene'
import { Plucks } from '../../dsp/pluck'
import { ctx, frame, site, solid, type V } from '../ctx'
import { PLACES } from '../places'

const SLOW = 25
// ---- the wheel and the glasses ------------------------------------------------------------------------------------
const FS = 20, CLEAR = 0.2, BLADES = 5, F0 = FS / BLADES, DF = 0.3, DRIFT = 24 // the strobe; the wheel: rev/s, its swing, the swing's period (s)
const angle = (t: number) => TAU * (F0 * t - ((DF * DRIFT) / TAU) * Math.cos((TAU * t) / DRIFT))
const GS = 0.13, GM = GS / 150.3 // the glasses, radii across, and radii to a millimetre of them
const n: V = [0, 0, 0], e: V = [0, 0, 0], N: V = [0, 0, 0], gc: V = [0, 0, 0], ax: V = [0, 0, 0]

// ---- PEEP --------------------------------------------------------------------------------------------------------
const MACRO = "the world's smallest (for now)", CYCLE = 1200, KEY = 20 // ms: the remote fires; a character (press, release, gap)
const BURST = 9, GAP = 30 // ms
const lit = (ms: number) => ms >= 0 && ms < 3 * BURST + 2 * GAP && ms % (BURST + GAP) < BURST
// a character as PEEP's hid_ascii sends it: modifier byte and usage, US layout
function hid(ch: string): [number, number] {
  const c = ch.charCodeAt(0)
  if (c >= 97 && c <= 122) return [0, c - 93]
  return ch === ' ' ? [0, 0x2c] : ch === "'" ? [0, 0x34] : ch === '(' ? [2, 0x26] : ch === ')' ? [2, 0x27] : [0, 0]
}
const CODES = [...MACRO].map(hid)

export function draw(k: number) {
  const P = PLACES[k]
  site(P.lat, P.lon, n)
  if (n[0] * ctx.E[0] + n[1] * ctx.E[1] + n[2] * ctx.E[2] < 0.5) return
  frame(n, e, N)
  // the glasses, at the place, looking south (their left is the east)
  for (let j = 0; j < 3; j++) (ax[j] = -e[j]), (gc[j] = n[j] * (1.002 + 23.1 * GM))
  solid('strobe-frame', gc, ax, n, N, GS)
}

// What it sounds like. PEEP at the bench's own slowing of time, 25×, which brings its 38 kHz carrier down to
// 1520 Hz, the key here: the trigger is three soft notes an octave under it. The macro is a tune: each report's
// usage code picks a note of the pentatonic over 190 Hz (the carrier three octaves down), struck as its key goes
// down. And under them, in real time as it is drawn, the wheel as a photodiode behind a valve sees it: the five
// blades passing, let through for 10 ms in every 50, so what is heard is the strobe's own beat, 5(f − 4) Hz,
// swelling a low note and letting it go, slowing, stopping and turning over as the wheel's picture does.
const PENTA = [0, 2, 4, 7, 9], NOTE = CODES.map(([, u]) => 190 * 2 ** ((PENTA[u % 5] + 12 * (Math.floor(u / 5) % 2)) / 12))
const typed = new Plucks(48000, 0.42)
let down = -1, burst = -1, valve = 0, mean = 0, purr = 0, ph = 0
export function voice(t: number, dt: number) {
  const ms = ((((t * 1000) / SLOW) % CYCLE) + CYCLE) % CYCLE, i = Math.floor(ms / KEY), fr = t * FS, b = Math.floor(ms / (BURST + GAP))
  if (i !== down) (down = i), i < MACRO.length && typed.strike(NOTE[i], 0.3, 0, 1.1, 1.8)
  if (b !== burst) (burst = b), b < 3 && lit(ms) && typed.strike(760, 0.14, 0, 0.5, 0.8)
  valve += 0.02 * (+(fr - Math.floor(fr) < CLEAR) - valve)
  const light = valve * (0.5 + 0.5 * Math.cos(BLADES * angle(t)))
  mean += 1e-4 * (light - mean)
  purr += 4e-4 * (light - mean - purr) // the beat, without the strobe's own 20 Hz
  ph += 95 * dt, ph -= Math.floor(ph)
  return typed.mono() + 3 * purr * Math.sin(TAU * ph)
}

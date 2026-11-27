// The bench: PEEP, stood where places.ts puts it. What it does is kept for the sound.
//
// PEEP is set off the way its remote does it: three 9 ms bursts of 38 kHz infrared, 30 ms apart. The first edge starts
// the macro: a press report, a release, a gap, 10 ms each (the endpoint's own 10 ms poll); then 250 ms of quiet and it
// is armed again. Time here runs 25× slow. The macro is the README's first line.
import { Plucks } from '../../dsp/pluck'

const SLOW = 25

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

// What it sounds like. PEEP at the bench's own slowing of time, 25×, which brings its 38 kHz carrier down to
// 1520 Hz, the key here: the trigger is three soft notes an octave under it. The macro is a tune: each report's
// usage code picks a note of the pentatonic over 190 Hz (the carrier three octaves down), struck as its key goes
// down.
const PENTA = [0, 2, 4, 7, 9], NOTE = CODES.map(([, u]) => 190 * 2 ** ((PENTA[u % 5] + 12 * (Math.floor(u / 5) % 2)) / 12))
const typed = new Plucks(48000, 0.42)
let down = -1, burst = -1
export function voice(t: number) {
  const ms = ((((t * 1000) / SLOW) % CYCLE) + CYCLE) % CYCLE, i = Math.floor(ms / KEY), b = Math.floor(ms / (BURST + GAP))
  if (i !== down) (down = i), i < MACRO.length && typed.strike(NOTE[i], 0.3, 0, 1.1, 1.8)
  if (b !== burst) (burst = b), b < 3 && lit(ms) && typed.strike(760, 0.14, 0, 0.5, 0.8)
  return typed.mono()
}

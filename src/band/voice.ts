// What the receiver hears. Between stations, hiss; tuned in, each project's signal as a receiver would
// demodulate it: DVB-S2 is noise-like data, PEEP's 38 kHz bursts come out as their keying, R-01 whines
// at its polygon's 1800 facets a second, the QSL keys DE KJ5SCH in CW. An orbit is too slow to hear.
import type { Voice } from '../audio/audio'
import { TAU, hash } from '../acts/scene'
import { PROJECTS } from './projects'
import { DIT, KEYING } from './demos'

let lp = 0, lp1 = 0, lp2 = 0
const PRIMES = [2, 3, 5, 7, 11, 13]

function station(slug: string, t: number, n: number) {
  switch (slug) {
    case 'esp-dvbs2':
    case 'yapogee':
      return (lp += (n - lp) * 0.35), 0.7 * lp
    case 'peep': // NEC-style frames: 67.5 ms of 562.5 µs keying, then quiet
      return t % 0.108 < 0.0675 ? ((t * 888.9) % 1 < 0.5 ? 0.25 : -0.25) : 0
    case 'autoprime': {
      let s = 0
      for (const p of PRIMES) s += Math.sin(TAU * p * 55 * t)
      return 0.09 * s
    }
    case 'r-01':
      return 0.22 * (((t * 1800) % 1) - 0.5) + 0.12 * Math.sin(TAU * 450 * t)
    case 'strobeglasses':
      return 0.5 * Math.exp(-((t * 10) % 1) * 80) * Math.sin(TAU * 1800 * t)
    case 'pigeon-vision':
      return Math.sin(TAU * 30 * t) > 0 ? 0.18 : -0.18
    case 'infiniterecon': // speech-band murmur with a syllable rate
      lp1 += (n - lp1) * 0.18, lp2 += (lp1 - lp2) * 0.02
      return 1.3 * (lp1 - lp2) * (0.5 + 0.5 * Math.sin(TAU * 4.3 * t + 2 * Math.sin(TAU * 1.1 * t)))
    case 'driftwood': // GPS C/A repeats every millisecond, under the noise
      return 0.35 * n + ((t * 1000) % 1 < 0.04 ? 0.15 : 0)
    case 'qsl':
      return KEYING[Math.floor(t / DIT) % KEYING.length] ? 0.3 * Math.sin(TAU * 700 * t) : 0
  }
  return 0
}

export function voice(k: number, lock: number, _clock: number): Voice {
  const slug = k >= 0 ? PROJECTS[k].slug : '', hiss = 0.06 * (1 - lock)
  return (t, o) => {
    const n = hash(t * 48000)
    o.l = o.r = hiss * n + lock * station(slug, t, n)
  }
}

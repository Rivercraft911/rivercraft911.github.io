// The valley: the intro's river, and at its middle the pool where esp-dvbs2 stands, a whole DVB-S2 transmitter out
// of one ESP32-S3's own Wi-Fi radio. Here is its signal, for the sound: s(t) = Σ aₖ g(t − kT), the raised-cosine
// pulses of dsp/dvbs2.ts, on real framing: normal FECFRAMEs of 8PSK 9/10 with pilots, 58 192 bits in 22 194 symbols,
// which at esp-dvbs2's 69.8 Mb/s is its 36 MHz, each led by a header (90 symbols of π/2-BPSK) and broken by pilot
// blocks (36 symbols on one point). Run at 60 symbols a second.
import { Frames, Kind, rings } from '../../dsp/dvbs2'
import { Plucks } from '../../dsp/pluck'

const PSK8 = rings('8PSK', '9/10', 17, [[8, 1, 0]])
const tx = new Frames(1, () => PSK8, 64800)
const RS = 60, T0 = 4096 // symbols a second, here; and the stream began this long before the planet's clock

// transmitted symbols by index, cached
const M = 1024, CK = new Float64Array(M).fill(-1), CI = new Float32Array(M), CQ = new Float32Array(M), CT = new Uint8Array(M), o = { i: 0, q: 0 }
function sym(k: number) {
  const j = k & (M - 1)
  if (CK[j] !== k) (CK[j] = k), (CT[j] = tx.sym(k, o)), (CI[j] = o.i), (CQ[j] = o.q)
  return j
}

// What it sounds like: the constellation as a scale. Four times a second the symbol going out is struck as a note,
// its phase, one of eight points round the circle, picking one of eight notes up the pentatonic over the carrier
// (brought down to 480 Hz, then an octave under that). So the data is a melody no one wrote, a header's π/2-BPSK
// rocks between two notes, and a pilot block, the same symbol over and over, is one note held.
const NOTE = [0, 2, 4, 7, 9, 12, 14, 16].map((s) => 240 * 2 ** (s / 12)), EVERY = 15 // symbols to a note
const notes = new Plucks(48000, 0.36)
let struck = NaN
export function voice(t: number) {
  const k = EVERY * Math.floor(((t + T0) * RS) / EVERY)
  if (k !== struck) {
    struck = k
    const j = sym(k), n = Math.round((4 * Math.atan2(CQ[j], CI[j])) / Math.PI - 0.5) & 7
    notes.strike(NOTE[n], CT[j] === Kind.Data ? 0.3 : 0.22, 0, CT[j] === Kind.Pilot ? 2.4 : 1.5, 1.6)
  }
  return notes.mono()
}

// Rava Heart: two heart-shaped boards of 144 LEDs that keep one heartbeat between them over ESP-NOW. One stands here
// and its twin at the antipode, as far apart as two things on a planet can be, each leaning back to face whoever comes
// from the west. Their LEDs are lit as the firmware lights them, the 64 bpm lub-dub b(φ), and are a light of their
// own: the mesh glows with it, the tracer sees it, and the arrival's air (arrive.wgsl) is lit red by it. A beacon of
// the beat's phase goes out every 450 ms, and light takes πR/c = 66.8 ms to the antipode, so the follower beats that
// much late.
import { ctx, frame, site, solid, type V } from '../ctx'
import { PLACES } from '../places'
import { C, RE } from './sky'

const T = 60 / 64, LAG = (Math.PI * RE) / C // the beat; light's time to the antipode
const gauss = (x: number, c: number, w: number) => Math.exp(-0.5 * ((x - c) / w) ** 2)
const beat = (ph: number) => Math.min(1, 0.98 * gauss(ph, 0.15, 0.088) + 0.62 * gauss(ph, 0.41, 0.12))
const mod = (a: number, b: number) => ((a % b) + b) % b

const SIZE = 0.06, TILT = 0.9, FACE = -1.05, MM = SIZE / 94.5 // radii across; its lean back from flat; the bearing it faces; radii a millimetre
const LIT = [1, 0.09, 0.12] // the LEDs' red, as light
const n: V = [0, 0, 0], e: V = [0, 0, 0], N: V = [0, 0, 0], m: V = [0, 0, 0], c: V = [0, 0, 0]
const ax: V = [0, 0, 0], ay: V = [0, 0, 0], az: V = [0, 0, 0]
// The heart here: the middle of its LEDs (the planet's frame) and how bright they are, for whatever it lights.
export const lamp = [0, 0, 1, 0]

// A heart stood at unit g, leaning back to face bearing FACE, its LEDs at brightness b; where its LEDs shine from, into o.
function heart(g: V, b: number, o?: number[]) {
  frame(g, e, N)
  const ct = Math.cos(TILT), st = Math.sin(TILT), cf = Math.cos(FACE), sf = Math.sin(FACE), M = ctx.models.heart
  for (let j = 0; j < 3; j++) {
    const h = cf * N[j] + sf * e[j] // the way it faces, along the ground
    ax[j] = sf * N[j] - cf * e[j], ay[j] = ct * g[j] + st * h, az[j] = ct * h - st * g[j]
    c[j] = g[j] * (1.0008 + 44 * MM * st) // on its tip, on the ground
  }
  solid('heart', c, ax, ay, az, SIZE, 1, 0, LIT, 0.018 + 0.982 * b)
  if (!o || !M) return
  const top = ((M.hi[1] - M.lo[1]) / 2) * (SIZE / Math.max(M.hi[0] - M.lo[0], M.hi[1] - M.lo[1], M.hi[2] - M.lo[2])) // its LEDs' tops, over its middle
  for (let j = 0; j < 3; j++) o[j] = c[j] + ay[j] * top
}

export function draw(k: number) {
  const P = PLACES[k], t = ctx.t
  site(P.lat, P.lon, n)
  m[0] = -n[0], m[1] = -n[1], m[2] = -n[2]
  lamp[3] = beat(mod(t, T))
  heart(n, lamp[3], lamp)
  heart(m, beat(mod(t - LAG, T)))
}

// What it sounds like, in real time. The firmware's envelope b(φ) is the loudness of a heart's two sounds: the lub,
// a low A falling a little as a struck drum's skin does, and the dub a fifth over it (a heart's second sound is the
// higher), each with its octave, so a small speaker has it too. Its other self, at the antipode, beats light's time
// round the planet behind it (world/sound.ts).
const W = 2 * Math.PI
export function voice(t: number) {
  const ph = mod(t, T), drop = 55 * (ph - 0.6 * ph * ph)
  const lub = 0.98 * gauss(ph, 0.15, 0.07) * (Math.sin(W * drop) + 0.4 * Math.sin(2 * W * drop))
  const dub = 0.62 * gauss(ph, 0.41, 0.1) * (Math.sin(W * 82.5 * ph) + 0.4 * Math.sin(W * 165 * ph))
  return 0.6 * (lub + dub)
}

// The singularity. R5's Julia set, as its last frame showed it, is still on screen when a hole opens in
// the middle of it: a black disk with a blazing ring (hole.wgsl), bending the picture round it into rings.
// Then the Julia set falls in, and behind it every world of the fall, newest first, each bent round the
// hole and swallowed, faster and faster, the ring flaring as each one goes. Then we fall too: the eye
// drops freely, the black disk grows to fill the sky, the ring sweeps past the edges, and across the
// horizon a Mandelbulb rushes at us, faster and brighter, until one white flash, silence, and the dot the
// oscilloscope powered on with.
// The ring is drawn by the beam as well, and is a signal: what a gravitational-wave detector would hear
// from what spirals in, h₊ and h× seen face-on, a circle sweeping up in frequency as (t_c − t)^−3/8 and
// in strength as f^2/3, the one rising sound of the whole piece, climbing with the choir's swell to the
// cut. The speakers play it, h₊ left and h× right, its strength squeezed 2:1 as the choir's bed is, so
// the sweep is heard all the way up.
import { HOLE, WORLDS } from '../gpu/fields'
import type { Field } from '../gpu/raster'
import { room } from '../audio/audio'
import { place, sing } from './choir'
import { indra } from './indra'
import { ophanim, AT as R5, DUR as R5DUR } from './ophanim'
import { aim, equation, jump } from './reality'
import { stutter } from './stutter'
import { TAU, clamp, hash, mix, smooth, view, type Frame, type Scene } from './scene'

export const AT = R5 + R5DUR // 50 on the choir's clock; the cut is AT + PEAK, with choir.END just past it
export const PEAK = 7.2 // the crescendo: one flash, then silence
const DOT = PEAK + 0.7 // and the dot

// The hole opens: its mass grows from nothing to M = 1, its shadow b = 3√3 M across.
const OPEN = 0.6
const mass = (t: number) => smooth(0, OPEN, t)
// The worlds fall in, newest first, n(t) of them gone, ever faster.
const N = WORLDS.length, SW0 = 0.3, SW1 = 4.6
const fallen = (t: number) => N * clamp((t - SW0) / (SW1 - SW0)) ** 1.6
// The eye falls freely from rest at D0: r^3/2 runs down linearly, to the horizon at IN.
const D0 = 30, IN = 5.3
const radius = (t: number) => (D0 ** 1.5 - (D0 ** 1.5 - 2 ** 1.5) * clamp(t / IN)) ** (2 / 3)
const when = (r: number) => (IN * (D0 ** 1.5 - r ** 1.5)) / (D0 ** 1.5 - 2 ** 1.5)
const SEE = [when(5.6), when(3.5)] // once the ring has swept past the corners, the bulb shows through the horizon
const FOV = 1
// Where the eye sees the photon ring: sin ψ = 3√3 M √(1 − 2M/r) / r, past 90° once r < 3M; on screen
// at tan ψ / tan(FOV/2), or off it.
function ring(t: number) {
  const M = mass(t), r = radius(t), s = (3 * Math.sqrt(3) * M * Math.sqrt(Math.max(0, 1 - (2 * M) / r))) / r
  return r < 3 * M ? Infinity : Math.tan(Math.asin(Math.min(1, s))) / Math.tan(FOV / 2)
}

// The chirp: f = K (t_c − t)^−3/8, 200 Hz 2.5 s before the cut and 1 kHz at it, 35 ms short of
// coalescence; its phase in closed form.
const TC = PEAK + 2.5 / (5 ** (8 / 3) - 1), K = 200 * (TC - PEAK + 2.5) ** 0.375
const freq = (t: number) => K * (TC - t) ** -0.375
const phase = (t: number) => (TAU * K * (TC ** 0.625 - (TC - t) ** 0.625)) / 0.625
const amp = (t: number) => 1.5 * (freq(t) / freq(PEAK)) ** (1 / 3)

// The worlds as their own scenes show them, for the raster to sweep into any shot it never took itself
// (when the fall was skipped).
function worlds() {
  const f: Frame = { ch: [] }, out: Field[] = []
  const has = (x?: Field) => !x || out.some((o) => o.shader === x.shader)
  const take = (s: Scene, t: number) => {
    f.ch.length = 0
    s.build(t, f)
    if (!has(f.field)) out.push({ ...f.field!, p: f.field!.p.slice() })
  }
  take(indra, 6)
  for (let t = 0; t < stutter.dur; t += 0.05) if ((stutter.build(t, f), !has(f.field))) take(stutter, t + 0.3)
  take(ophanim, 1.5) // the Julia set
  return out
}

const field: Field = { shader: HOLE, k: 1, p: new Float32Array(60) }
const eye = [0, 0, 0], fwd = [0, 0, 0], up = [0, 0, 0]
// A world in slot j: j > 1 waiting behind, filling the view; j from 1 to 0 falling, its depth past the
// hole and its size shrinking to nothing, turning ever faster as it goes (as 1/size, like water down a
// drain), and brighter, squeezed.
const L1 = 8, TAN = Math.tan(FOV / 2)
function slot(i: number, k: number, j: number, p: Float32Array) {
  const o = 40 + 4 * i, f = Math.min(1, j)
  p[o] = j < 1 ? mix(3.2, L1, j) : L1 * j, p[o + 1] = j > 0 && k < N ? (D0 + L1 * j) * TAN * f : 0
  p[o + 2] = j < 1 ? 1.2 * (1 / (j + 0.15) - 1 / 1.15) : 0
  p[o + 3] = N - 1 - Math.min(N - 1, k) // its tile: the shots are kept oldest first
  p[52 + i] = 1 + 1.5 * (1 - f)
  p[56 + i] = k ? 1 : 1 - f // the Julia set as R5 left it, the rest as bright as each other
}
// The bulb's camera closes on a point of its surface that stays rough at every scale (found by a search),
// along the ray that found it.
const AIM = [0.694737, 0.389077, 0.596482], INTO = [-0.7621, -0.1682, -0.6252], beye = [0, 0, 0], bup = [0, 0, 0]
const DREAD = { dread: 1, gold: 0 }
let gain = 1
const live = [0], crisp = { tau: 0.025 }

export const singularity: Scene = {
  dur: DOT + 0.3,
  build(t, f) {
    field.bake ??= worlds() // before anything of ours: the other scenes' builds share the equation's path
    const p = field.p, n = fallen(t), r = radius(t)
    if (t >= PEAK) jump(t - PEAK, f, true, 0) // the one flash
    else {
      // the eye, falling straight at the hole down y, looking along it
      eye[0] = 0, eye[1] = -Math.max(r, 2.02), eye[2] = 0
      fwd[0] = 0, fwd[1] = 1, fwd[2] = 0
      up[0] = 0, up[1] = 0, up[2] = 1
      aim(p, eye, fwd, up, FOV)
      const flare = n > 0 && n < N ? Math.exp(-4 * (n - Math.floor(n))) : 0
      p[16] = t, p[17] = mass(t), p[18] = 1, p[19] = 0.15 + 0.05 * n + 0.3 * flare
      p[20] = smooth(SEE[0], SEE[1], t), p[21] = +(t > IN)
      for (let i = 0, k = Math.floor(n); i < 3; i++, k++) slot(i, k, k + 1 - n, p)
      // the bulb, the zoom quickening
      const s = Math.max(0, t - SEE[0]), z = s + 1.7 * s * s, d = 3 * 2 ** -z, w = 0.3 * t + 0.4 * s * s
      for (let i = 0; i < 3; i++) beye[i] = AIM[i] - d * INTO[i]
      bup[0] = Math.cos(w), bup[1] = -Math.cos(w), bup[2] = Math.sin(w)
      aim(p.subarray(24), beye, INTO, bup, 0.95)
      p[31] = 10, p[39] = 0.6 + 2 * smooth(SEE[0], PEAK, t) ** 3
      field.res = t < SEE[0] ? 0.75 : 0.85
      f.field = field
    }

    // the chirp, h₊ and h× face-on, drawn on the photon ring; at the end the dot alone, as station
    // identification finds it
    const R = ring(t), z = mass(t) * (0.5 + 0.1 * n)
    if (t < PEAK && R < 2.2 * view.a)
      f.ch.push({
        w: 1,
        fn: (tt, s) => {
          const ph = phase(tt)
          s.x = R * Math.cos(ph), s.y = R * Math.sin(ph)
          s.r = 1, s.g = 0.85, s.b = 0.6, s.z = z
        },
      })
    if (t > DOT) f.ch.push({ w: 1, fn: (_, s) => ((s.x = 0.004 * hash(Math.random() * 1e4)), (s.y = 0.004 * hash(Math.random() * 1e4)), (s.z = 0.6)) })
    if (t < 3.6) equation(f, "u''+u=3Mu^2", [1, 0.85, 0.6], 0.9)
    else if (t < IN) (live[0] = freq(t)), equation(f, 'f=f_0\\,(1-t/t_c)^{-3/8}=\\num{0}{0000}\\,Hz', [1, 0.85, 0.6], 0.9, live)
    else if (t < PEAK) equation(f, 'z\\to z^8+c', [1, 0.8, 0.4], 0.9)
    f.rate = 2e6
    if (t > SEE[0]) f.look ??= crisp
    if (t < PEAK) place(AT + t)
    return (tt, o) => {
      const cut = 1 - smooth(PEAK - 0.005, PEAK, tt)
      if (tt < PEAK - 0.005) gain = room.gain
      room.gain = gain * cut // the choir and its hall cut dead
      if (tt >= PEAK) return
      DREAD.dread = smooth(-2.5, 0.5, tt), DREAD.gold = 1 - smooth(-2, 1, tt) // ophanim's mood, carried on
      sing(AT + tt, o, 0.75 + 0.35 * smooth(0, PEAK, tt), DREAD)
      const ph = phase(tt), A = amp(tt) * smooth(0.5, 4.7, tt) * cut
      o.l = A * Math.cos(ph), o.r = A * Math.sin(ph)
    }
  },
}

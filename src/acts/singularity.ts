// The singularity. R5's Julia set, as its last frame showed it, falls away from us into the first of two
// black holes whirling round each other in the aisle of a fractal nave (hole.wgsl), each bending the
// other's light and every arch into rings. On their horizons is written everything that fell in, every
// world of the fall, redder and slower the longer ago it fell; the choir, falling in last, slows with it,
// its pitch sinking by the same dτ/dt until time stands still.
// The two holes spiral together, and the beam draws what a gravitational-wave detector would hear: for a
// binary seen at inclination ι, h₊ ∝ (1 + cos²ι)/2 cos φ and h× ∝ cos ι sin φ, φ the wave's phase and
// twice the orbit's, so the holes on screen turn at exactly half the beam's rate, one signal. It sweeps up
// as (t_c − t)^−3/8, and merges into one spinning hole, its horizon ringing as the speakers do. We fall
// in, through its ring singularity, out into the universe on the other side of it, where r < 0 and
// gravity repels: everything streams away from the hole, and the sound is the merger played backwards,
// a white hole un-merging, its chirp falling and its circle shrinking into the dot the oscilloscope
// powered on with.
import { HOLE } from '../gpu/fields'
import type { Field } from '../gpu/raster'
import { place, sing } from './choir'
import { indra } from './indra'
import { ophanim, AT as R5, DUR as R5DUR } from './ophanim'
import { aim, equation, jump } from './reality'
import { stutter } from './stutter'
import { TAU, clamp, glide, hash, mix, smooth, view, type Frame, type Scene } from './scene'

export const AT = R5 + R5DUR // 50 on the choir's clock; its clock stops, choir.END, at the merger

// The binary, in its total mass M (G = c = 1): two equal holes, no spin. Its remnant is M_f = 0.952 M
// with a = 0.686 M_f (Buonanno, Kidder & Lehner), ringing at ω M_f = 0.529 (Berti's fit), so a ring at
// FR hertz sets the mass: M = 5.5e-4 s, 112 suns. Its chirp mass is M η^3/5, η = 1/4; as quadrupole
// radiation drains its orbit, f = (1/π) (5 / 256τ)^3/8 M_c^−5/8, and Kepler holds the two d = (πfM)^−2/3 apart.
const FR = 160
const MF = 0.952, AF = 0.686 * MF, RH = MF + Math.sqrt(MF * MF - AF * AF) // and its horizon
const MS = 0.529 / (TAU * MF * FR) // seconds per M
const TC = 5.5 // coalescence
const K = (5 * MS / 256) ** 0.375 * 0.25 ** -0.375 / (Math.PI * MS) // f = K τ^−3/8, τ in seconds: 7 Hz at t = 0
const TM = TC - (K / FR) ** (8 / 3) // the merger: the chirp reaches the ring's pitch
const DAMP = 0.25 // the ringdown's decay. A real one's Q is 3.2, 6 ms; this one is held so it can be seen
const AM = 0.7 // the strain at the merger, in scope units
const freq = (t: number) => (t < TM ? K * (TC - t) ** -0.375 : FR)
const phase = (t: number): number => (t < TM ? TAU * K * (TC ** 0.625 - (TC - t) ** 0.625) / 0.625 : phase(TM - 1e-9) + TAU * FR * (t - TM))
const amp = (t: number) => (t < TM ? AM * (freq(t) / FR) ** (2 / 3) : AM * Math.exp(-(t - TM) / DAMP))

// Through the ring at TW; the signal after the midpoint is the binary's played backwards about it.
const TW = 8
const back = (t: number) => (t < (TM + TW) / 2 ? t : TM + TW - t)
const END = 9.9 // the white hole has shrunk to a dot

// What fell in: an emitter sinking onto the horizon, r = r_s (1 + ε e^(−t/T)), seen at
// g = dτ/dt = √(1 − r_s/r), its own clock at τ = 2T (asinh √ε − asinh √(ε e^(−t/T))). The choir fell last.
const EPS = 3, TR = 0.9
const sunk = (t: number) => EPS * Math.exp(-Math.max(0, t) / TR)
const redshift = (t: number) => Math.sqrt(sunk(t) / (1 + sunk(t)))
const proper = (t: number) => 2 * TR * (Math.asinh(Math.sqrt(EPS)) - Math.asinh(Math.sqrt(sunk(t))))

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
  take(ophanim, 1.5) // the Julia set, before its cut
  return out
}

const field: Field = { shader: HOLE, k: 1, p: new Float32Array(60) }
const eye = [0, 0, 0], fwd = [0, 0, 0], up = [0, 0, 0]
const look = { tau: 0.08 }, sharp = { tau: 0.012 } // the orbit drawn crisp; the white hole's chirp with its long trail
const DREAD = { dread: 1 }
const SHUTTER = 0.25 // of a frame's interval, each pixel exposed at its own instant in it
const live = [0]
let was = 0

// The camera: in from 36 M, rising over the orbit; then down the remnant's axis, through the ring at TW,
// turning over to look back at it as it is flung away.
const D0 = 36, D1 = 13, EL0 = 0.3, EL1 = 0.75
const ZM = D1 * Math.sin(EL1), RM = D1 * Math.cos(EL1), RI = MF - Math.sqrt(MF * MF - AF * AF) // and the inner horizon
// down the axis: slowing past each horizon, longest between the inner one and the ring, then out the other side
const ZK = [[TM, ZM], [6.4, 3.4], [6.85, RH], [7.2, RI], [7.75, 0.08], [TW, 0], [8.6, -0.6], [END, -7]], zt = [0]
function fly(t: number) {
  const az = 0.1 + 0.06 * t
  let r: number, z: number
  if (t < TM) {
    const k = smooth(-1, TM, t), D = mix(D0, D1, k ** 0.8), el = mix(EL0, EL1, k)
    r = D * Math.cos(el), z = D * Math.sin(el)
  } else (r = RM * (1 - smooth(TM, 6.85, t))), (z = glide(ZK, t, zt)[0])
  eye[0] = r * Math.cos(az), eye[1] = r * Math.sin(az), eye[2] = z
  if (t < TW) {
    const el = Math.atan2(z, r), s = Math.sin(el), c = Math.cos(el)
    fwd[0] = -eye[0], fwd[1] = -eye[1], fwd[2] = -eye[2]
    up[0] = -s * Math.cos(az), up[1] = -s * Math.sin(az), up[2] = c
  } else {
    const b = Math.PI * smooth(TW, TW + 1, t), s = Math.sin(b), c = Math.cos(b)
    fwd[0] = s * Math.cos(az), fwd[1] = s * Math.sin(az), fwd[2] = -c
    up[0] = -c * Math.cos(az), up[1] = -c * Math.sin(az), up[2] = -s
  }
  return Math.hypot(eye[0], eye[1], eye[2])
}

// The eye's 4-velocity in the remnant's ingoing Kerr–Schild chart, g = η + f c c, c = (1, l). There the
// infalling light, (1, −l), is null and regular everywhere, horizons and all, so the eye rides just behind
// it: u ∝ (1, −l) + ε ∂ₜ, falling along −l at 1/(1 + ε) of light's speed, timelike wherever ε (f − 1) < 2.
// The shader's chart is this one time-reversed, so it is handed (uᵗ, −u).
function fall(sh: number, e: number, out: Float32Array) {
  const [x, y, z] = eye, a2 = AF * AF, w2 = x * x + y * y + z * z - a2
  const r = sh * Math.max(1e-6, Math.sqrt(0.5 * (w2 + Math.sqrt(w2 * w2 + 4 * a2 * z * z)))), R2 = r * r + a2
  const f = (2 * MF * r ** 3) / (r ** 4 + a2 * z * z), n = 1 / Math.sqrt(2 * e - e * e * (f - 1))
  out[0] = (1 + e) * n, out[1] = ((r * x + AF * y) / R2) * n, out[2] = ((r * y - AF * x) / R2) * n, out[3] = (z / r) * n
}


// The hand-off: R5's Julia set, its last frame as a picture filling the view 2 M ahead of the eye, falls
// into the first hole, shrinking and stretched along its fall, redshifted by √(1 − r_s/r), gone by SWALLOW.
const SWALLOW = 1.8, hole = [0, 0, 0], to = [0, 0, 0]
function swallow(t: number, p: Float32Array) {
  const e = clamp(t / SWALLOW) ** 2, h = 2 * Math.tan(0.475), ps = p[21], d = p[22] / 2
  p[51] = +(e < 1)
  if (e >= 1) return
  hole[0] = d * Math.cos(ps), hole[1] = d * Math.sin(ps), hole[2] = 0
  let n = 0
  for (let i = 0; i < 3; i++) (p[48 + i] = mix(eye[i] + 2 * p[12 + i], hole[i], e * e)), (to[i] = hole[i] - p[48 + i]), (n += to[i] ** 2)
  n = Math.sqrt(n) || 1
  const s = 1 - 0.9 * e, k = 3 * e
  for (const [o, a, w] of [[52, 4, h * view.a], [56, 8, h]]) {
    const along = (p[a] * to[0] + p[a + 1] * to[1] + p[a + 2] * to[2]) / (n * n)
    for (let i = 0; i < 3; i++) p[o + i] = w * s * (p[a + i] + k * along * to[i])
  }
  p[55] = Math.sqrt(Math.max(0, 1 - 1 / Math.max(1, n)))
  p[59] = 1 - smooth(0, 0.4, e) // its dark ground opaque at first, as R5 left it, then gone
}

export const singularity: Scene = {
  dur: 10,
  build(t, f) {
    field.bake ??= worlds() // before anything of ours: the other scenes' builds share the equation's path
    const dt = clamp(t - was, 0, 1 / 30), p = field.p
    was = t
    const kick = t < TM ? 0 : jump(t - TM, f, true, 0.25) // the merger's one flash; the Julia set flows on unbroken
    const D = fly(t), ci = eye[2] / D // cos ι: the beam's ellipse is the wave as it reaches the eye
    aim(p, eye, fwd, up, 0.95 + kick)
    const zc = Math.exp(1.6 * Math.max(0, t - (END - 0.9)) ** 1.6) // the collapse: the picture shrinks to a point
    p[16] = t, p[17] = zc, p[18] = Math.min(4, Math.sqrt(zc)) * (zc < 400 ? 1 : 0) * (t < TM ? 1 : 0.4), p[19] = +(t > TW || D < RH)
    // the binary, at the exposure's end, and how far it turns while exposed
    p[20] = +(t < TM), p[21] = phase(t) / 2, p[22] = (Math.PI * freq(t) * MS) ** (-2 / 3), p[23] = Math.PI * freq(t) * dt * SHUTTER
    p[24] = MF, p[25] = AF, p[26] = eye[2] < 0 && t > TW - 0.5 ? -1 : 1, p[27] = smooth(TW - 1.6, TW, t) * (1 - smooth(TW + 0.5, END, t)) + 0.05
    // the ringing: the l = m = 2 mode, at the ring's pitch and decay, as heard
    p[28] = t < TM ? 0 : 0.35 * Math.exp(-(t - TM) / DAMP), p[29] = phase(t), p[30] = TAU * FR * dt * SHUTTER
    p[32] = 6, p[33] = t / 2.5, p[34] = 4, p[35] = mix(1, 2.5, smooth(6.85, 7.2, t))
    if (t >= TM) fall(p[26], 1.8, p.subarray(44))
    p[39] = 1, p[40] = 1, p[41] = 0.3, p[42] = 60
    field.res = t < TM ? 0.85 : 0.6
    swallow(t, p)
    if (p[18] > 0) f.field = field

    // the wave, h₊ and h× as x and y; at the end the dot alone, as station identification finds it
    f.ch.push({
      w: 1,
      fn: (tt, s) => {
        const u = back(tt), ph = phase(u), A = amp(u) * (1 - smooth(END - 1.2, END - 0.1, tt))
        s.x = A * 0.5 * (1 + ci * ci) * Math.cos(ph) + 0.004 * hash(tt * 7919)
        s.y = A * ci * Math.sin(ph) + 0.004 * hash(tt * 6007)
        s.r = 1, s.g = 0.95, s.b = 0.85
        s.z = mix(0.35 + 1.2 * (A / AM), 0.6, smooth(END - 1, END - 0.1, tt))
      },
    })
    const q = 1 - smooth(END - 1.2, END - 0.4, t)
    if (t < 2.4) (live[0] = freq(t)), equation(f, 'f=f_0\\,(1-t/t_c)^{-3/8}=\\num{0}{00}\\,Hz', [1, 0.9, 0.75], 0.9, live)
    else if (t < TM) (live[0] = redshift(t)), equation(f, 'd\\tau/dt=(1-r_s/r)^{1/2}=\\num{0}{0.00}', [1, 0.55, 0.4], 0.9, live)
    else if (t < TM + 1) equation(f, 'h=h_0\\,e^{-t/\\tau}\\cos\\,2\\pi f_R t', [1, 0.9, 0.75], 0.9)
    else if (t < TW) equation(f, 'r=0,\\;\\theta=\\pi/2:\\;x^2+y^2=a^2', [1, 0.75, 0.4], 0.9)
    else if (q > 0) equation(f, 'r<0:\\;M\\to-M,\\;t\\to-t', [0.4, 0.75, 1], 0.9 * q)
    f.rate = 2e6
    f.look ??= t < TM ? sharp : look
    const T = AT + proper(t)
    place(T)
    return (tt, o) => {

      // the choir, as it sinks: its clock slowed by g, so its every pitch falls by g, and its sound dimmed
      if (tt < TM) sing(AT + proper(tt), o, redshift(tt), DREAD)
      const u = back(tt), ph = phase(u), A = clamp(amp(u), 0, 0.85) * (1 - smooth(END - 1.2, END - 0.1, tt))
      o.l = A * 0.5 * (1 + ci * ci) * Math.cos(ph), o.r = A * ci * Math.sin(ph)
    }
  },
}

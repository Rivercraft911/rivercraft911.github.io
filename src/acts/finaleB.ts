// The finale, take B: the fractal is the drain. R5's Julia set, as its last frame showed it, is still on
// screen when a hole opens in the middle of it and bends it into a ring, and the Julia set drains into
// it, while out of the dark round it a world of pearls condenses (holeB.wgsl): a Doyle spiral, every pearl
// tangent to six others, their sizes in geometric progression along 13 spirals one way and 21 the other,
// lifted onto funnels about the hole. A loxodromic map z ↦ λz carries the whole packing onto itself, so
// its powers spiral every pearl down into the hole, and we ride that flow in: the eye at λ^s e₀, the
// world the same at every step but the hole, which grows. The ring is drawn by the beam as well, and is a
// signal: what a gravitational-wave detector would hear from what spirals in, h₊ and h× seen face-on, a
// circle sweeping up in frequency as (t_c − t)^−3/8, the one rising sound of the whole piece, climbing
// with the choir's swell to the cut: one flash, silence, and the dot the oscilloscope powered on with.
import { room } from '../audio/audio'
import { HOLEB } from '../gpu/fields'
import type { Field } from '../gpu/raster'
import { place, sing } from './choir'
import { ophanim, AT as R5, DUR as R5DUR } from './ophanim'
import { aim, equation, jump } from './reality'
import { TAU, clamp, hash, mix, smooth, view, type Frame, type Scene } from './scene'

export const AT = R5 + R5DUR // 47.5 on the choir's clock; the cut is AT + PEAK, with choir.END just past it
export const PEAK = 7.2 // the crescendo: the horizon, one flash, then silence
const DOT = PEAK + 0.7 // and the dot

// The Doyle spiral (P, Q): log-lattice generators A, B with P A + Q B = 2πi, so a turn round the hole
// comes back to the same pearl, and the pearl at 1, radius ρ, tangent to those at a = e^A, b = e^B and
// ab: |w − 1| = ρ (1 + |w|). Solved by Newton from the hexagonal lattice it is close to.
const P = 13, Q = 21
const [AX, AY, BX, BY] = (() => {
  const L = TAU / Math.sqrt(P * P - P * Q + Q * Q), phi = Math.atan2(P - Q / 2, (Q * Math.sqrt(3)) / 2)
  const v = [L * Math.cos(phi), L * Math.sin(phi), L / 2]
  const gap = (x: number, y: number, r: number) => Math.hypot(Math.exp(x) * Math.cos(y) - 1, Math.exp(x) * Math.sin(y)) - r * (1 + Math.exp(x))
  const F = ([x, y, r]: number[]) => {
    const bx = (-P * x) / Q, by = (TAU - P * y) / Q
    return [gap(x, y, r), gap(bx, by, r), gap(x + bx, y + by, r)]
  }
  const det = (m: number[][]) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0])
  for (let it = 0; it < 30; it++) {
    const f = F(v), J = [0, 1, 2].map((i) => [0, 1, 2].map((j) => (F(v.map((x, k) => x + (k === j ? 1e-7 : 0)))[i] - f[i]) / 1e-7)), D = det(J)
    const d = [0, 1, 2].map((j) => det(J.map((row, i) => row.map((x, k) => (k === j ? -f[i] : x)))) / D)
    for (let j = 0; j < 3; j++) v[j] += d[j]
  }
  return [v[0], v[1], (-P * v[0]) / Q, (TAU - P * v[1]) / Q]
})()
// The walls: cones h = κ|z|. Lifted off the plane a pearl's neighbours move apart, so each wall's ρ is
// the largest that still touches the nearest of them.
const KAPPA = [0, 2, -2]
const touch = (k: number) =>
  Math.min(
    ...[[AX, AY], [BX, BY], [AX + BX, AY + BY]].flatMap(([x, y]) =>
      [1, -1].map((s) => {
        const R = Math.exp(s * x), t = s * y
        return Math.hypot(R * Math.cos(t) - 1, R * Math.sin(t), k * (R - 1)) / (1 + R)
      }),
    ),
  )
const RHOS = KAPPA.map(touch)
// The flow we ride: −(A + B), the pearl at ab back to 1, shrinking 0.81 and turning 29° each step. In
// e-folds of shrinking u, the eye turns TURN u.
const FX = -(AX + BX), FY = -(AY + BY), TURN = FY / -FX
// The eye falls freely from rest at infinity, dr/dt = −√(2M/r), so r^3/2 runs down linearly: from D0 to
// DEND at PEAK, where the shadow has swallowed the view. u is the e-folds fallen.
const D0 = 40, DEND = 3.2
const dist = (t: number) => (D0 ** 1.5 - (D0 ** 1.5 - DEND ** 1.5) * clamp(t / PEAK)) ** (2 / 3)
const EL = Math.atan(0.7) // the eye's elevation: over the disk, as the flow keeps it
const FOV = 1, TAN = Math.tan(FOV / 2)

// Where the eye sees the photon ring: sin ψ = 3√3 M √(1 − 2M/r) / r; on screen at tan ψ / tan(FOV/2).
const ring = (M: number, r: number) => {
  if (r < 3 * M) return Infinity
  const s = (3 * Math.sqrt(3) * M * Math.sqrt(Math.max(0, 1 - (2 * M) / r))) / r
  return Math.tan(Math.asin(Math.min(1, s))) / TAN
}

// The chirp: f = K (t_c − t)^−3/8, 200 Hz 2.5 s before the cut and 1 kHz at it; its phase in closed form.
const TC = PEAK + 2.5 / (5 ** (8 / 3) - 1), K = 200 * (TC - PEAK + 2.5) ** 0.375
const freq = (t: number) => K * (TC - t) ** -0.375
const phase = (t: number) => (TAU * K * (TC ** 0.625 - (TC - t) ** 0.625)) / 0.625
const amp = (t: number) => 1.5 * (freq(t) / freq(PEAK)) ** (1 / 3)

const field: Field = { shader: HOLEB, k: 1, p: new Float32Array(48) }
const eye = [0, 0, 0], fwd = [0, 0, 0], up = [0, 0, 1]
const DREAD = { dread: 1, gold: 0 }
let gain = 1
const live = [0], crisp = { tau: 0.025 }

export const finaleB: Scene = {
  dur: DOT + 0.3,
  build(t, f) {
    // R5's last frame, for the raster to sweep if it never took it itself (when the fall was skipped):
    // before anything of ours, as the other scenes' builds share the equation's path
    if (!field.bake) {
      const g: Frame = { ch: [] }
      ophanim.build(R5DUR - 0.05, g)
      field.bake = [{ ...g.field!, p: g.field!.p.slice() }]
    }
    const p = field.p, D = dist(t), u = Math.log(D0 / D), M = smooth(0, 0.7, t)
    if (t >= PEAK) jump(t - PEAK, f, true, 0) // the one flash
    else {
      const az = 0.4 - TURN * u
      eye[0] = D * Math.cos(EL) * Math.cos(az), eye[1] = D * Math.cos(EL) * Math.sin(az), eye[2] = D * Math.sin(EL)
      fwd[0] = -eye[0], fwd[1] = -eye[1], fwd[2] = -eye[2]
      aim(p, eye, fwd, up, FOV)
      const flare = Math.exp(-5 * ((u / -FX) % 1)) // a pulse each time the world comes round to itself
      p[16] = t, p[17] = M, p[18] = 1, p[19] = M * (0.25 + 0.25 * smooth(1, PEAK, t) + 0.25 * flare * smooth(1, 2, t))
      p[20] = AX, p[21] = AY, p[22] = BX, p[23] = BY
      const det = AX * BY - BX * AY
      p[24] = BY / det, p[25] = -BX / det, p[26] = -AY / det, p[27] = AX / det
      p[28] = KAPPA[0], p[29] = KAPPA[1], p[30] = KAPPA[2], p[31] = mix(-3.6, 0.2, smooth(0.3, 2, t)) // condensing inward
      p[32] = RHOS[0], p[33] = RHOS[1], p[34] = RHOS[2], p[35] = 0.6 * t + 3 * u
      // the Julia set on its card, filling the view, then drained into the hole down the same flow
      p[36] = 8, p[37] = (D + 8) * TAN, p[38] = 2.5 * Math.max(0, t - 0.25) ** 2, p[39] = 1 - smooth(0.6, 1.5, t)
      p[40] = Math.exp(AX) * Math.cos(AY), p[41] = Math.exp(AX) * Math.sin(AY), p[42] = Math.exp(BX) * Math.cos(BY), p[43] = Math.exp(BX) * Math.sin(BY)
      p[44] = TURN, p[45] = 0.25 * D * D * (1 + 2 * smooth(1, PEAK, t)), p[46] = P, p[47] = Q
      f.field = field
    }

    // the chirp, h₊ and h× face-on, drawn on the photon ring; at the end the dot alone, as station
    // identification finds it
    const R = ring(M, D), z = M * (0.5 + 0.5 * smooth(1, PEAK, t))
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
    const ink = [1, 0.85, 0.6]
    if (t < 2.6) (live[0] = u / -FX), equation(f, 'z\\to\\frac{az+b}{cz+d}=\\lambda^{s}z\\qquad s=\\num{0}{00.00}', ink, 0.9, live)
    else if (t < PEAK - 2.5) (live[0] = D), equation(f, "x''=-3M\\frac{h^2x}{r^5}\\qquad r=\\num{0}{00.0}M", ink, 0.9, live)
    else if (t < PEAK) (live[0] = freq(t)), equation(f, 'f=f_0\\,(1-t/t_c)^{-3/8}=\\num{0}{0000}\\,Hz', ink, 0.9, live)
    f.rate = 2e6
    f.look ??= crisp
    if (t < PEAK) place(AT + t)
    return (tt, o) => {
      const cut = 1 - smooth(PEAK - 0.005, PEAK, tt)
      if (tt < PEAK - 0.005) gain = room.gain
      room.gain = gain * cut // the choir and its hall cut dead
      if (tt >= PEAK) return
      DREAD.dread = smooth(-2.5, 0.5, tt), DREAD.gold = 1 - smooth(-2, 1, tt) // ophanim's mood, carried on
      sing(AT + tt, o, 0.75 + 0.35 * smooth(0, PEAK, tt), DREAD)
      const ph = phase(tt), A = amp(tt) * smooth(PEAK - 2.6, PEAK - 2, tt) * cut
      o.l = A * Math.cos(ph), o.r = A * Math.sin(ph)
    }
  },
}

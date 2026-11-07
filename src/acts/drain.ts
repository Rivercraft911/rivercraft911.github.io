// The drain. Below the whirlpool hangs R3's world, Indra's pearls (indra.ts), and we are pulled down into
// it. Its camera falls into the attracting fixed point of w = ab, where the group's picture repeats shrunk
// by |λ| and turned by arg λ; run backward, the same fall is the plunge down the throat, so the drain
// view and the world below are one camera and one picture. Here is the group, that fall, and the frame
// that hangs the world under the drain.
import { aim } from './reality'
import { mix, smooth } from './scene'

export const A = 1.95859, B = 0.0112 // the trace of a: a pearl necklace that spirals as it shrinks
export const MU = { re: -B, im: A } // a(z) = μ + 1/z
export const PER = 0.5 // periods of w per octave of descent
export const GROUP = 'a(z)=\\mu+\\frac{1}{z}\\quad b(z)=z+2', GROUP_INK = [0.85, 0.78, 1] // its equation, and its colour

// w = ab = [[−iμ, −i(2μ + 1)], [−i, −2i]]: its fixed points z = (p − s ± √(tr² − 4)) / 2r, and the multiplier
// λ = 1/(r z + s)² at the attracting one, z₊.
export type Z = [number, number]
export const mul = (a: Z, b: Z): Z => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]]
export const div = (a: Z, b: Z): Z => {
  const d = b[0] * b[0] + b[1] * b[1]
  return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d]
}
const root = (a: Z): Z => {
  const m = Math.hypot(a[0], a[1])
  return [Math.sqrt((m + a[0]) / 2), Math.sign(a[1] || 1) * Math.sqrt((m - a[0]) / 2)]
}
const W = { p: [MU.im, -MU.re] as Z, r: [0, -1] as Z, s: [0, -2] as Z }
const TR: Z = [W.p[0] + W.s[0], W.p[1] + W.s[1]], D = root(((x: Z): Z => [x[0] - 4, x[1]])(mul(TR, TR)))
const PS: Z = [W.p[0] - W.s[0], W.p[1] - W.s[1]], R2X: Z = [2 * W.r[0], 2 * W.r[1]]
const fixed = [div([PS[0] + D[0], PS[1] + D[1]], R2X), div([PS[0] - D[0], PS[1] - D[1]], R2X)]
const mult = (z: Z) => {
  const d = mul(W.r, z)
  return div([1, 0], mul([d[0] + W.s[0], d[1] + W.s[1]], [d[0] + W.s[0], d[1] + W.s[1]]))
}
export const [ZP, ZM] = Math.hypot(...mult(fixed[0])) < 1 ? fixed : [fixed[1], fixed[0]]
const LAMBDA = mult(ZP)
export const SHRINK = Math.hypot(LAMBDA[0], LAMBDA[1]), TURN = Math.atan2(LAMBDA[1], LAMBDA[0])

// The fall, s periods of w down (k = |λ|^s) and t seconds after the world below begins: the eye a little
// off the axis, sinking from 1.6 to 1 of the scale it falls at over its first 3 s, looking down. Before it
// begins (s, t < 0) it is the plunge down the throat.
export const H = 1.2
export const eye = [0, 0, 0], fwd = [0, 0, -1], up = [1, 0, 0]
export function fall(s: number, t: number) {
  const k = SHRINK ** s, c = Math.cos(TURN * s), sn = Math.sin(TURN * s)
  const ex = H * (0.12 + 0.06 * Math.sin(0.4 * t)), ey = H * 0.06 * Math.sin(0.3 * t), ez = H * mix(1.6, 1, smooth(0, 3, t))
  eye[0] = k * (c * ex - sn * ey), eye[1] = k * (sn * ex + c * ey), eye[2] = k * ez
  const fx = -0.12, fy = 0.08 * Math.sin(0.27 * t)
  fwd[0] = c * fx - sn * fy, fwd[1] = sn * fx + c * fy, fwd[2] = -1
  up[0] = c, up[1] = sn, up[2] = 0
  return k
}
export const LENS = 1.25

// The world hangs under the drain: a point p of the whirlpool is S R_ψ (p − O) below, O on the axis. The
// drain's mouth is at height MOUTH in the world below, over the eye where the world begins (1.6 H).
export const S = 22, PSI = 0, MOUTH = 3
// The drain's parameters for wrap.wgsl, p[32…51], with the mouth at height lid in the whirlpool; and the
// fall above, carried up into the whirlpool, as its camera.
export function hang(p: Float32Array, lid: number, k: number, t: number) {
  p[32] = S, p[33] = Math.cos(PSI), p[34] = Math.sin(PSI), p[35] = lid - MOUTH / S
  p[36] = A, p[37] = B, p[38] = 40, p[39] = 0.4 * t // as deep as indra folds, so the pearls down the drain are the same
  p[40] = ZM[0], p[41] = ZM[1], p[42] = ZM[0] - ZP[0], p[43] = ZM[1] - ZP[1]
  p[44] = k * H, p[45] = 0.06
}
const we = [0, 0, 0], wf = [0, 0, 0], wu = [0, 0, 0]
// The fall at (s, t) as the whirlpool's camera, blended in by m over its own (already in p): R_ψ⁻¹, then up.
export function plunge(p: Float32Array, s: number, t: number, m: number) {
  fall(s, t)
  const c = Math.cos(PSI), sn = Math.sin(PSI), o = p[35]
  const back = (v: number[], out: number[], w: number) => {
    out[0] = (c * v[0] + sn * v[1]) / w, out[1] = (-sn * v[0] + c * v[1]) / w, out[2] = v[2] / w
  }
  back(eye, we, S), back(fwd, wf, 1), back(up, wu, 1)
  we[2] += o
  for (let i = 0; i < 3; i++) (we[i] = mix(p[i], we[i], m)), (wf[i] = mix(p[12 + i], wf[i], m)), (wu[i] = mix(p[8 + i], wu[i], m))
  aim(p, we, wf, wu, mix(2 * Math.atan(1 / p[3]), LENS, m))
}

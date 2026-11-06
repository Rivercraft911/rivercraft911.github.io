// ζ on the critical line, computed honestly. Euler–Maclaurin: the first N − 1 terms of Σ n^−s, the integral
// of the rest, half the next term, and Bernoulli corrections, each term (s)_{2k−1} N^{−s−2k+1} B_{2k}/(2k)!.
// With N = 24 and ten corrections it holds to about 1e−6 up to t = 80. The zeros are where Hardy's
// Z(t) = e^{iθ(t)} ζ(½ + it), which is real, changes sign; θ is the Riemann–Siegel theta, by Stirling.

const N = 24
const B = [1 / 12, -1 / 720, 1 / 30240, -1 / 1209600, 1 / 47900160, -691 / 1307674368000, 1 / 74724249600,
  -3617 / 10670622842880000, 43867 / 5109094217170944000, -174611 / 802857662698291200000] // B_{2k}/(2k)!

export const z = { re: 0, im: 0 }

// ζ(½ + it) into z.
export function zeta(t: number) {
  let re = 0, im = 0
  for (let n = 1; n < N; n++) {
    const a = n ** -0.5, ph = -t * Math.log(n)
    re += a * Math.cos(ph), im += a * Math.sin(ph)
  }
  const a = N ** -0.5, ph = -t * Math.log(N), nr = a * Math.cos(ph), ni = a * Math.sin(ph) // N^−s
  const d = 0.25 + t * t // |s − 1|²
  re += (N * (-0.5 * nr + t * ni)) / d + nr / 2 // N^{1−s}/(s − 1) + N^−s/2
  im += (N * (-0.5 * ni - t * nr)) / d + ni / 2
  let pr = (0.5 * nr - t * ni) / N, pi = (0.5 * ni + t * nr) / N // s N^{−s−1}
  for (let k = 1; k <= B.length; k++) {
    re += B[k - 1] * pr, im += B[k - 1] * pi
    for (const j of [2 * k - 1, 2 * k]) [pr, pi] = [pr * (0.5 + j) - pi * t, pr * t + pi * (0.5 + j)]
    pr /= N * N, pi /= N * N
  }
  z.re = re, z.im = im
  return z
}

export const theta = (t: number) => (t / 2) * Math.log(t / (2 * Math.PI)) - t / 2 - Math.PI / 8 + 1 / (48 * t) + 7 / (5760 * t ** 3)
export const hardy = (t: number) => (zeta(t), Math.cos(theta(t)) * z.re - Math.sin(theta(t)) * z.im)

// The first twenty nontrivial zeros' heights γ_k, found by bisection: 14.1347…, 21.0220…, 25.0108…
export const ZEROS: number[] = []
for (let t = 10, prev = hardy(t); ZEROS.length < 20; t += 0.05) {
  const v = hardy(t + 0.05)
  if (Math.sign(v) !== Math.sign(prev)) {
    let lo = t, hi = t + 0.05
    for (let i = 0; i < 40; i++) {
      const m = (lo + hi) / 2
      Math.sign(hardy(m)) === Math.sign(prev) ? (lo = m) : (hi = m)
    }
    ZEROS.push((lo + hi) / 2)
  }
  prev = v
}

// ζ(½ + it) tabulated every DT for drawing: re, im interleaved.
export const DT = 0.01, TMAX = 80
export const TABLE = new Float32Array(2 * (TMAX / DT + 1))
for (let i = 0; i < TABLE.length / 2; i++) zeta(i * DT), (TABLE[2 * i] = z.re), (TABLE[2 * i + 1] = z.im)

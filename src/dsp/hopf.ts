// The polarization of a wave is a point on the Poincaré sphere S²: amplitude angle η, relative phase φ.
// Over one cycle of the carrier its field (E_x, E_y) ∈ ℂ² traces a great circle of the unit 3-sphere,
// the Hopf fiber over that point. Fibers over a circle of latitude fill a torus, nested latitudes nest
// the tori, and every circle links every other exactly once: wheels within wheels.

// A waveplate is an SU(2) matrix [[α, −β̄], [β, ᾱ]]; it commutes with the carrier's phase, so it moves
// fibers to fibers. Here α = a + ib, β = c + id from a unit quaternion.
export const plate = new Float64Array([1, 0, 0, 0])

export function turn(a: number, b: number, c: number, d: number) {
  const n = Math.hypot(a, b, c, d) || 1
  plate[0] = a / n, plate[1] = b / n, plate[2] = c / n, plate[3] = d / n
}

export type Point4 = { x: number; y: number; z: number; ex: number; ey: number; k: number }

// The field of state (η, φ) at carrier phase θ, through the waveplate, stereographically projected to
// ℝ³ from the pole of S³. ex, ey are the real fields (what the speakers play); k is the projection's scale.
export function fiber(eta: number, phi: number, theta: number, o: Point4) {
  const c = Math.cos(eta), s = Math.sin(eta)
  const x1 = c * Math.cos(theta), y1 = c * Math.sin(theta)
  const x2 = s * Math.cos(theta + phi), y2 = s * Math.sin(theta + phi)
  const [a, b, cc, d] = plate
  const u1 = a * x1 - b * y1 - (cc * x2 + d * y2), v1 = a * y1 + b * x1 - (cc * y2 - d * x2)
  const u2 = cc * x1 - d * y1 + (a * x2 + b * y2), v2 = cc * y1 + d * x1 + (a * y2 - b * x2)
  const k = 1 / Math.max(1e-3, 1 - v2)
  o.x = u1 * k, o.y = v1 * k, o.z = u2 * k
  o.ex = u1, o.ey = u2, o.k = k
}

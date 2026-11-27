// The core: the world of maths inside River's planet, reached down the eye of the polar storm. The wheel that was
// altitude goes on being altitude below the ground: down a bore through the crust, whose strata are the sieve of
// Eratosthenes read out as text; out under a dome where 2^p − 1, for the first primes p that give a hundred million
// digits, is trial factored as PrimesF does it (q = 2kp + 1, q ≡ ±1 mod 8), every candidate in view tested on the
// GPU every frame (core.wgsl) while this file runs the same hunt on its own, a row of k at a time, by different
// arithmetic, and says which exponents are dead; and down to the floor, Ulam's spiral out to 2^32, 1 at the planet's
// centre. ?core rides the wheel by the clock; ?core=<0…1> holds a depth; &look=<pitch>,<yaw> aims.
import { CORE } from '../../gpu/fields'
import type { Field } from '../../gpu/raster'
import { aim } from '../../acts/reality'
import { clamp, mix, smooth } from '../../acts/scene'
import { PLACES } from '../places'
import { ctx, dot, frame, len, site, type V } from '../ctx'

const q0 = new URLSearchParams(location.search)
const FORCE = q0.has('core'), HELD = q0.get('core') ? +q0.get('core')! : -1
const LOOK = (q0.get('look') ?? '').split(',').map(Number)
export const D0 = 0.2, D1 = 0.03 // the camera's distance from the pole where the ground gives way, and at the floor
const A = 0.045, RC = 0.6, ZC = Math.sqrt(RC * RC - A * A), ZMIN = 2e-4, CELL = RC / 32768 // as core.wgsl has them
const RIBS = 1024, KS = 512
const TURN = KS / 30 + 5 // seconds a thousand exponents are up: tested at thirty k a second, then held
const TEXT = [1, 0.62, 0.2]

// ---- the hunt: the exponents, and this file's own run at them ------------------------------------------------
// a b mod q for a, b, q below 2^39, in doubles: b three 13-bit digits at a time, so nothing passes 2^53
const mulmod = (a: number, b: number, q: number) => {
  let r = (a * Math.floor(b / 67108864)) % q
  r = (r * 8192 + a * (Math.floor(b / 8192) % 8192)) % q
  return (r * 8192 + a * (b % 8192)) % q
}
// 2^p mod q
function pow2(p: number, q: number) {
  let x = 1
  for (let b = 31 - Math.clz32(p); b >= 0; b--) {
    x = mulmod(x, x, q)
    if ((p >>> b) & 1 && (x *= 2) >= q) x -= q
  }
  return x
}
const SMALL = (() => { // the primes below √(3.4 · 10^8)
  const s = new Uint8Array(18500), out: number[] = []
  for (let i = 2; i < s.length; i++) {
    if (s[i]) continue
    out.push(i)
    for (let j = i * i; j < s.length; j += i) s[j] = 1
  }
  return out
})()
const seg = new Uint8Array(32768), exps = new Float64Array(RIBS), first = new Uint16Array(RIBS)
const bytes = new Uint8Array(RIBS * 2 * 4)
// the first p with ⌊p log10 2⌋ + 1 ≥ 10^8 digits is 332 192 807; the ribs are the primes from there on
let next = 332192807, base = 0, front = 0, age = 0, owed = 0, sent = false
const tally = { dead: 0, p: 0, k: 0, q: 0 } // this thousand's dead, and the last factor found
function batch() {
  let n = 0
  while (n < RIBS) {
    seg.fill(0)
    for (const s of SMALL) for (let j = (s - (next % s)) % s; j < seg.length; j += s) seg[j] = 1
    let i = 0
    for (; i < seg.length && n < RIBS; i++) if (!seg[i]) exps[n++] = next + i
    next += i
  }
  base = exps[0]
  first.fill(0)
  for (let i = 0; i < RIBS; i++) {
    const d = exps[i] - base
    bytes[4 * i] = d & 255, bytes[4 * i + 1] = (d >> 8) & 255, bytes[4 * i + 2] = d >> 16
  }
  bytes.fill(0, 4 * RIBS)
  front = 0, age = 0, sent = false, tally.dead = 0
}
// one more k for every exponent still alive
function row() {
  const k = ++front
  for (let i = 0; i < RIBS; i++) {
    if (first[i]) continue
    const p = exps[i], q = 2 * k * p + 1, m = q % 8
    if ((m !== 1 && m !== 7) || !(q % 3 && q % 5 && q % 7 && q % 11 && q % 13 && q % 17 && q % 19 && q % 23)) continue
    if (pow2(p, q) !== 1) continue
    first[i] = k
    bytes[4 * (RIBS + i)] = k & 255, bytes[4 * (RIBS + i) + 1] = k >> 8
    tally.dead++, tally.p = p, tally.k = k, tally.q = q
    sent = false
  }
}

// ---- the eye ---------------------------------------------------------------------------------------------------
const p = new Float32Array(60)
const F: Field = { shader: CORE, k: 1, p, res: 2, ink: TEXT, lift: 5 }
const rows = { data: bytes, at: 0, n: 2 }
const n: V = [0, 0, 0], e: V = [0, 0, 0], N: V = [0, 0, 0], v: V = [0, 0, 0]
const eye = [0, 0, 0], drift = [0, 0], fwd = [0, 0, 0], UP = [0, 0, 1]
const vals = [0] // for the sound: the largest prime sieved out at the eye's stratum, or the integer in the floor's cell below it
const PRIMES = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47]
let was = false

// Ulam's cell (x, y) holds this integer: 1 at the origin, 2 to its east, winding anticlockwise
function ulam(x: number, y: number) {
  const m = Math.max(Math.abs(x), Math.abs(y)), b = (2 * m - 1) ** 2
  return !m ? 1 : x === m && y > -m ? b + y + m : y === m ? b + 3 * m - x : x === -m ? b + 5 * m - y : b + 7 * m + x
}
export function core(k: number) {
  const P = PLACES[k], f = ctx.f, t = ctx.t, dt = ctx.dt
  site(P.lat, P.lon, n), frame(n, e, N)
  for (let i = 0; i < 3; i++) v[i] = ctx.E[i] - 1.01 * n[i]
  const u = FORCE ? (HELD >= 0 ? HELD : (t / 40) % 1) : ctx.focus === k ? clamp(Math.log(D0 / len(v)) / Math.log(D0 / D1)) : 0
  if (u <= 0) return void (was = false)
  if (!was) (was = true), (drift[0] = drift[1] = 0)
  if (!base) batch()

  // down: the planet's own eye let go of, onto the bore's axis, through the crust, then the chamber in equal ratios
  const out = FORCE ? 0 : 1 - smooth(0, 0.1, u), cham = clamp((u - 0.5) / 0.5)
  const z = u < 0.1 ? mix(FORCE ? 1.16 : 1.01 + dot(v, n), 1, smooth(0, 0.1, u)) : u < 0.5 ? mix(1, ZC, (u - 0.1) / 0.4) : ZC * (ZMIN / ZC) ** cham
  // in the chamber it drifts, slower the lower, so the floor goes by at one pace whatever the height
  if (cham > 0) {
    const sp = 0.12 * z * dt
    drift[0] += Math.cos(0.07 * t) * sp, drift[1] += Math.sin(0.07 * t) * sp
  } else (drift[0] = 0.3 * A * Math.cos(0.2 * t) * (1 - out)), (drift[1] = 0.3 * A * Math.sin(0.2 * t) * (1 - out))
  eye[0] = dot(v, e) * out + drift[0], eye[1] = dot(v, N) * out + drift[1], eye[2] = z

  // the camera keeps the planet's aim, in the pole's own frame (east, north, up)
  const c = ctx.p
  if (FORCE) {
    const pi = LOOK.length === 2 ? LOOK[0] : 1.2, ya = LOOK.length === 2 ? LOOK[1] : 0.1 * t
    fwd[0] = -Math.cos(pi) * Math.sin(ya), fwd[1] = -Math.cos(pi) * Math.cos(ya), fwd[2] = -Math.sin(pi)
    aim(p, eye, fwd, UP, 0.62)
  } else {
    p[0] = eye[0], p[1] = eye[1], p[2] = eye[2], p[3] = c[3]
    for (let r = 4; r < 16; r += 4) (p[r] = c[r] * e[0] + c[r + 1] * e[1] + c[r + 2] * e[2]), (p[r + 1] = c[r] * N[0] + c[r + 1] * N[1] + c[r + 2] * N[2]), (p[r + 2] = c[r] * n[0] + c[r + 1] * n[1] + c[r + 2] * n[2])
  }

  // the hunt goes on whether or not the dome is in sight: thirty rows a second, then the next thousand exponents
  age += dt
  for (owed = Math.min(owed + 30 * dt, 4); owed >= 1 && front < KS; owed--) row()
  if (front >= KS && age > TURN) batch()
  F.rows = sent ? undefined : rows
  sent = true
  const crust = z > ZC + 0.01
  F.cell = crust ? 14 : undefined
  p[7] = t, p[11] = front, p[15] = 1
  p[16] = Math.floor(base / 65536), p[17] = base % 65536, p[18] = smooth(0, 1.2, age) * (1 - smooth(TURN - 1.2, TURN, age)), p[19] = crust ? 1 : 0

  f.field = F
  f.ch.length = 0
  if (z > ZC) vals[0] = PRIMES[clamp(Math.floor((1 - z) / (1.6 * ((2 * Math.PI * A) / 210)) / 12), 0, 14)] // the stratum the eye is in
  else if (z <= 0.08) {
    // the winding the eye is reading (core.wgsl ground: the one whose cells are nearest 45 px), and the cell below
    const j = clamp(Math.round(6 - Math.log2((45 * z) / (CELL * p[3] * 0.25 * innerHeight * devicePixelRatio)) / 2), 0, 6), cell = CELL * 4 ** (6 - j)
    vals[0] = ulam(Math.round(eye[0] / cell), Math.round(eye[1] / cell))
  }
}

// What it sounds like, from inside.
// The bore: the sieve as a spectrum. Every prime it has taken out down to the stratum the eye is in sounds as that
// harmonic of a low A (55 Hz), as loud as 1/p^0.7: under 2 an octave, then a twelfth joins, a seventeenth (the major
// third), the seventh harmonic's flat seventh, the eleventh's sharp fourth, and down through the strata the chord
// grows richer and stranger: the primes' own timbre, with the A they all stand on never sounded.
// The dome: a bell for every row of k that kills an exponent, its pitch k's place in the harmonic series over a low
// A (folded under 1760 Hz), as loud as the root of how many died. Most factors are small, so a thousand exponents
// begin as a peal up the series and thin to single strokes.
// The floor: the integers on from the one under the eye, read at 1200 a second, and every prime among them (Miller and
// Rabin's test to the bases 2, 7 and 61, which is proof this far) plucks a string tuned to its gap from the last: the
// gap's odd part as a harmonic of A3, folded into one octave. Most gaps are multiples of six, so the strings ring
// mostly E, round A, with the sevenths and elevenths of the rarer gaps shimmering through.
const READ = 1200, BELLS = 32, SIEVED = [2, 3, 5, 7, 11, 13, 61], BASES = [2, 7, 61]
function prime(n: number) {
  if (n < 2) return false
  for (const s of SIEVED) if (n % s === 0) return n === s
  let d = n - 1, r = 0
  while (d % 2 === 0) (d /= 2), r++
  next: for (const a of BASES) {
    let x = 1
    for (let b = a, e = d; e > 0; e = Math.floor(e / 2), b = mulmod(b, b, n)) if (e % 2) x = mulmod(x, b, n)
    if (x === 1 || x === n - 1) continue
    for (let i = 1; i < r; i++) if ((x = mulmod(x, x, n)) === n - 1) continue next
    return false
  }
  return true
}
const y1 = new Float64Array(BELLS), y2 = new Float64Array(BELLS), c1 = new Float64Array(BELLS), c2 = new Float64Array(BELLS)
const organ = new Float64Array(PRIMES.length), turns = new Float64Array(PRIMES.length)
const STRINGS = 8, s1 = new Float64Array(STRINGS), s2 = new Float64Array(STRINGS), k1 = new Float64Array(STRINGS), k2 = new Float64Array(STRINGS), ks = new Float64Array(STRINGS)
let at = 0, under = 0, last = 0, owed2 = 0, rung = 0, dead = 0, bell = 0, tuned = 0
export function voice(_t: number, dt: number) {
  if (!was) return 0
  const z = p[2], bore = z > ZC, floor = z <= 0.08
  let out = 0
  for (let i = 0; i < PRIMES.length; i++) {
    const a = (organ[i] += 2e-4 * ((bore && PRIMES[i] <= vals[0] ? PRIMES[i] ** -0.7 : 0) - organ[i]))
    if (a < 1e-4) continue
    turns[i] += dt * 55 * PRIMES[i]
    turns[i] -= Math.floor(turns[i])
    out += 0.5 * a * Math.sin(2 * Math.PI * turns[i])
  }
  // the strings: string m is the harmonic 2m + 1 of A3, folded down into the octave over it, ringing a second
  if (dt !== tuned)
    for (let m = 0, r = Math.exp(-dt / 1.1); m < STRINGS; m++) {
      const h = 2 * m + 1, w = 2 * Math.PI * ((220 * h) / 2 ** Math.floor(Math.log2(h))) * (tuned = dt)
      ;(k1[m] = 2 * r * Math.cos(w)), (k2[m] = r * r), (ks[m] = Math.sin(w))
    }
  if (floor) {
    if (vals[0] !== under) at = under = last = vals[0]
    for (owed2 += READ * dt; owed2 >= 1; owed2--)
      if (prime(++at)) {
        let g = at - last
        last = at
        while (g > 0 && g % 2 === 0) g /= 2
        if (g < 2 * STRINGS) s1[(g - 1) / 2] += 0.03 * ks[(g - 1) / 2]
      }
  } else owed2 = 0
  for (let m = 0; m < STRINGS; m++) {
    const y = k1[m] * s1[m] - k2[m] * s2[m]
    ;(s2[m] = s1[m]), (out += s1[m] = y)
  }
  if (front !== rung) {
    const born = tally.dead - dead, k = front
    if (born > 0 && k > 0)
      // a bell is two decaying partials, each a resonator rung once, y ← 2r cos ω y₁ − r² y₂, in whichever two have
      // died away furthest, so none is cut off ringing
      for (let h = 0; h < 2; h++) {
        bell = 0
        for (let i = 1; i < BELLS; i++) if (Math.abs(y1[i]) + Math.abs(y2[i]) < Math.abs(y1[bell]) + Math.abs(y2[bell])) bell = i
        const w = 2 * Math.PI * ((110 * k) / 2 ** Math.max(0, Math.floor(Math.log2(k)) - 3)) * (h ? 2.76 : 1) * dt, r = Math.exp(-dt / (h ? 0.25 : 0.9))
        ;(c1[bell] = 2 * r * Math.cos(w)), (c2[bell] = r * r), (y2[bell] = 0), (y1[bell] = 0.05 * Math.sqrt(Math.min(born, 16)) * (h ? 0.4 : 1) * Math.sin(w))
      }
    ;(rung = front), (dead = tally.dead)
  }
  for (let i = 0; i < BELLS; i++) {
    const y = c1[i] * y1[i] - c2[i] * y2[i]
    ;(y2[i] = y1[i]), (out += y1[i] = y)
  }
  return out
}

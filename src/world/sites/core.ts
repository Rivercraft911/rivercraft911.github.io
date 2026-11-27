// The core: Primorial's world, inside River's planet. In the eye of the polar storm a well goes through the crust,
// and under it the planet is hollow and dark (planet.wgsl's well, core.wgsl). Across the well, the prime galaxy:
// Sacks' spiral, a star at every prime. Far under it, the rotunda of the sieve: 210 columns in a ring, the integers
// in order, round a lamp, and between them Eratosthenes' sieve built as arcades, a ring of arches to each prime from
// 2 to 13, a pier at every multiple; the lamp's light goes out through them, so the columns left in it are the primes.
// The lamp is River's search: a crystal with a cell to every bit of 2^p − 1 for a prime p from 149 500 003 on, and
// round its foot that number's trial factoring (q = 2kp + 1, q ≡ ±1 mod 8), which this file does, thirty k a second.
// Coming to the well, the camera is over its mouth and goes straight down it, through the galaxy, and out to the
// rotunda's side in three seconds; the sieve is raised; and then it goes in to the crystal (steer; the place's point
// goes down with it: where). Its parts can be clicked. ?core=<s> holds the way in at s seconds.
import { CORE } from '../../gpu/fields'
import type { Solids } from '../../gpu/mesh'
import type { Field } from '../../gpu/raster'
import { glide, smooth } from '../../acts/scene'
import { ctx, len, part } from '../ctx'
import type { About, Steer } from '../places'

const HELD = +(new URLSearchParams(location.search).get('core') ?? -1)
const WY = 0.45 // the rotunda's floor, as planet.wgsl has it
const KS = 1024, ROUND = 36 // the k tried for each exponent; the sieve's round, seconds
const SIX = [2, 3, 5, 7, 11, 13]

// ---- the search: this file's own run at one exponent at a time ---------------------------------------------------
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
const prime = (n: number) => SMALL.every((s) => s * s > n || n % s > 0)
// The field's data: the planet's noise, as fields.ts makes it (r, g), and beside it (b, a: 16 bits a texel) in its
// ninth row the exponent, the k tried so far, the k that divides, and the sieve's clock.
const tex = new Uint8Array(4 << 16), HEAD = 8 << 8
for (let i = 0, s = 1; i < 1 << 16; i++) tex[4 * i + 1] = (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) >>> 24
for (let i = 0; i < 1 << 16; i++) tex[4 * i] = tex[4 * (((((i >> 8) + 17) & 255) << 8) | ((i + 37) & 255)) + 1]
const put = (i: number, v: number) => ((tex[4 * (HEAD + i) + 2] = v & 255), (tex[4 * (HEAD + i) + 3] = v >> 8))
const whole = { data: tex, at: 0, n: 256 }, head = { data: tex, at: 0, n: 9 }
// Past the record, where Primorial's first region is: 149 500 003, then each prime after it
let p = 149500003, front = 0, first = 0, owed = 0, held = 0, sent = false
// the next k: is q = 2kp + 1 one to try, and does it divide 2^p − 1?
function tryK() {
  const k = ++front, q = 2 * k * p + 1, m = q % 8
  if ((m === 1 || m === 7) && q % 3 && q % 5 && q % 7 && q % 11 && q % 13 && q % 17 && q % 19 && q % 23 && pow2(p, q) === 1) first = k
}

// ---- the way in ------------------------------------------------------------------------------------------------
// The camera looks at a point on the planet's axis (a hair off it, so east is still east) from a distance and an
// elevation: [seconds at the place, the point's height, from how far, how steeply]. It comes to rest over the well's
// mouth (the place's own view, in places.ts) and does not wait there: down the well, through the galaxy, and out low
// beside the rotunda, to look in through the near arcades at the lit far side while the sieve is raised; then over
// them and in to the crystal. And there it is the visitor's.
// (Never straight down: the camera's up is the planet's, and looking past a page would roll it.)
const TOP = 1.004, TILT = 0.004
const WAY = [[0, TOP, 0.22, 1.4], [0.9, 0.84, 0.16, 1.42], [1.7, WY + 0.1, 0.25, 1.2], [3.4, WY + 0.03, 0.5, 0.4], [20, WY + 0.03, 0.5, 0.4], [24.5, WY + 0.032, 0.26, 0.5]]
const END = 24.5
// Its parts, where they are (the planet's frame) and how large the camera should take each to be: it comes to 4.5 of
// these from the part clicked (planet.ts). The sieve's is the far columns, from as far back as the lamp.
const PARTS: [id: string, x: number, y: number, z: number, r: number][] = [['spiral', 0, 1, 0, 0.045], ['sieve', 0, WY + 0.02, 0.3, 0.055], ['hunt', 0, WY + 0.032, 0, 0.035]]
const g = [0, 0, 0], c3 = [0, 0, 0]
let h = TOP, born = -1, lev = 0, was = false, ghost = 0, side = 0
export const where = (o: number[]) => ((o[0] = 0), (o[1] = h), (o[2] = h * TILT), o)
// The way in, and then the camera is the visitor's (while they hold it, or a part, the way in waits: planet.ts).
export function steer(since: number, _picked: string, o: Steer) {
  const s = HELD >= 0 ? HELD : since
  o.at[0] = o.at[1] = o.at[2] = 0
  return s < END && (glide(WAY, s, g), (o.d = g[1]), (o.pitch = g[2]), (o.yaw = 0.04 * s), true)
}
export const about: Record<string, About> = {
  spiral: { name: 'The prime galaxy', does: 'Sacks’ spiral: every whole number on one winding line, n at radius √n, with a star at each prime below 4096 and nothing at the rest. Gold stars are 1 more than a multiple of 4, blue 3 more; white ones are twins, two primes 2 apart. The brightest lie along one curve: n² + n + 41, Euler’s formula, which gives a prime for every n from 0 to 39.' },
  sieve: { name: 'The sieve of Eratosthenes', does: 'The columns are the numbers 1 to 210, in order round the ring. Each ring of arches inside them belongs to a prime, 2 at the middle, then 3, 5, 7, 11, 13, with a pier standing at every multiple of it. The lamp shines out through all of them, so a column behind any pier is in shadow: those are the composites. The columns still lit are the primes. Nothing else decides it. The ring is 210 long because 210 = 2 × 3 × 5 × 7, so those four arcades close on themselves.' },
  hunt: { name: 'The search', does: 'The lamp is one number my search would test: 2ᵖ − 1 for a prime p just past 149 500 000, about 45 million digits. The crystal has a cell for each of its bits, 531 to a side. The band of light climbing it stands for one squaring of the test; the real test is p of them at 4.907 ms each, 8.49 days on one M4 Pro, so it is shown slowed. The tiles round its foot are the cheap check first: each is a number that could divide it (q = 2kp + 1), lit once it has been tried here, white if it divides.' },
}

// ---- the eye ---------------------------------------------------------------------------------------------------
// What happens here, for the world's music (sound.ts): how many so far, and the last one's pitch, Hz: an arcade
// raised, its prime as a harmonic of A; a factor found, its k as one.
export const events = { n: 0, f: 0 }
const fold = (f: number, lo: number) => f / 2 ** Math.floor(Math.log2(f / lo))
const ring = (f: number) => (events.n++, (events.f = f))
const D0 = 0.34, D1 = 0.2 // how far from the well's mouth this field takes the planet's over, and where it has all of it
const F: Field = { shader: CORE, k: 1, p: ctx.p }
const solids = {} as Solids
let up = 0, found = 0, clock = 0
export function core(k: number) {
  const f = ctx.f, E = ctx.E, dt = ctx.dt, r = len(E), here = ctx.focus === k
  const s = here && ctx.since >= 0 ? (HELD >= 0 ? HELD : ctx.since) : -1
  if (s < 0) {
    if (r >= 1) (h = TOP), (born = -1) // away, or on the way here: the well's mouth
    else if (born < 0) born = ctx.t
  } else {
    if (born < 0) born = ctx.t
    h = glide(WAY, Math.min(s, END), g)[0]
    for (const [id, x, y, z, R] of PARTS) part(id, ((c3[0] = x), (c3[1] = y), (c3[2] = z), c3), R)
  }
  // This field: under the ground, and over the well's mouth when it is what we have come to. A flight away goes
  // straight out through the rock: the hollow stays in sight as it does, and fades over half a second in the open.
  const m = Math.hypot(E[0], E[1] - 1, E[2])
  if (r < 1) (ghost = 1), (side = Math.hypot(E[0], E[2]))
  else ghost = side < 0.045 ? 0 : Math.max(0, ghost - 2 * dt)
  if (r >= 1 && !(here && m < D0) && !ghost) return void (was = false)
  was = true
  // the search goes on whether or not it is in sight: thirty k a second; a factor, or a thousand without one, and
  // after a while the next prime exponent
  while (!prime(p)) p += 2
  for (owed = Math.min(owed + 30 * dt, 4); owed >= 1 && front < KS && !first; owed--) tryK()
  if ((first || front >= KS) && (held += dt) > 8) (p += 2), (front = first = held = 0)
  if (first !== found && (found = first)) ring(fold(110 * first, 440))
  // the sieve's round, from when the camera came: its arcades raised in turn, held, and let down
  clock = born < 0 ? 0 : (ctx.t - born) % ROUND
  const n = SIX.findIndex((_, i) => clock < 2.5 * i + 0.5)
  if (n !== up && (up = n) > 0) ring(fold(55 * SIX[n - 1], 220))
  put(0, p % 65536), put(1, Math.floor(p / 65536)), put(2, front), put(3, first), put(4, Math.round(clock * 100))
  F.rows = sent ? head : whole
  sent = true
  const G = f.field!
  ctx.p[26] = lev = r < 1 || ghost ? 1 : smooth(D0, D1, m)
  ctx.p[27] = r < 1 ? 0 : ghost * ghost * (3 - 2 * ghost)
  F.res = r < 1 ? 2 : G.res // under the ground every pixel its own ray: there is nothing soft there to hide a coarser one
  Object.assign(solids, G.solids).aperture = (G.solids?.aperture ?? 0) * (1 - lev) // and the lens stopped right down
  F.solids = solids
  f.field = F
  if (r < 1 && f.look) f.look.tau = 0.01 // and the phosphor's memory short: nothing here needs averaging, and a long one smears a moving edge
}

// What it sounds like, from inside: the sieve as a spectrum. Every prime whose arcade stands sounds as that harmonic
// of a low A (55 Hz), as loud as 1/p^0.7: an octave, then a twelfth joins, a seventeenth (the major third), the
// seventh harmonic's flat seventh, the eleventh's sharp fourth, the thirteenth: the primes' own chord, with the A
// they stand on never sounded; and the arcades let down, it falls silent. A factor found rings a bell, its pitch k's
// place in the harmonic series.
const LOUD = SIX.map((q) => q ** -0.7), organ = new Float64Array(6), turns = new Float64Array(6)
let y1 = 0, y2 = 0, c1 = 0, c2 = 0, rung = 0
export function voice(_t: number, dt: number) {
  if (!was) return 0
  let out = 0
  for (let i = 0; i < 6; i++) {
    const a = (organ[i] += 2e-4 * ((clock > 2.5 * i + 1.5 && clock < 31 ? LOUD[i] : 0) - organ[i]))
    if (a < 1e-4) continue
    turns[i] += dt * 55 * SIX[i]
    turns[i] -= Math.floor(turns[i])
    out += 0.5 * a * Math.sin(2 * Math.PI * turns[i])
  }
  if (first !== rung && (rung = first)) {
    // a bell: a resonator rung once, y ← 2r cos ω y₁ − r² y₂
    const w = 2 * Math.PI * fold(110 * first, 440) * dt, rr = Math.exp(-dt / 0.9)
    ;(c1 = 2 * rr * Math.cos(w)), (c2 = rr * rr), (y2 = 0), (y1 = 0.12 * Math.sin(w))
  }
  const y = c1 * y1 - c2 * y2
  ;(y2 = y1), (out += y1 = y)
  return lev * out
}

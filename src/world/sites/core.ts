// The core: Primorial's world, inside River's planet. In the eye of the polar storm a well goes through the crust,
// and under it the planet is hollow: a ball of dark air with the primes standing in it as light (planet.wgsl's well,
// core.wgsl). Across the well, Sacks' spiral as beads. Across the hall's middle the integers, on Ulam's spiral, each
// a shaft of light, and Eratosthenes' sieve run over them in waves: a prime's multiples fall through the level and
// hang under it in its colour, and what is left standing is prime, as tall as the gap to the next. The Mersenne
// primes among them stand to the roof. Over them Pritchard's wheels turn, a hoop to each primorial. And round the
// wall the search itself, 2^p − 1 for the first thousand prime exponents from 149 500 003 on, trial factored as
// PrimesF does it (q = 2kp + 1, q ≡ ±1 mod 8), a row of k at a time, here.
// From the planet the well is lit. Coming to it, the camera is over its mouth and goes straight down it, through the
// spiral, and out under the roof in three seconds (steer; the place's point goes down with it: where). Its parts can
// be clicked. ?core=<s> holds the way in at s seconds.
import { CORE } from '../../gpu/fields'
import type { Solids } from '../../gpu/mesh'
import type { Field } from '../../gpu/raster'
import { glide, smooth } from '../../acts/scene'
import { ctx, len, part } from '../ctx'
import type { About, Steer } from '../places'

const HELD = +(new URLSearchParams(location.search).get('core') ?? -1)
const WF = 0.485 // the level the integers lie on, as planet.wgsl has it
const RIBS = 1024, KS = 512
const TURN = KS / 30 + 5 // seconds a thousand exponents are up: tested at thirty k a second, then held

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
// The field's data: the planet's noise, as fields.ts makes it (r, g), and beside it (b, a: 16 bits a texel) each rib's
// exponent less the base, the k of its first factor, and in the ninth row the base, the front and the wall's light;
// and in its lower half the level's cells (below).
const tex = new Uint8Array(4 << 16)
for (let i = 0, s = 1; i < 1 << 16; i++) tex[4 * i + 1] = (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) >>> 24
for (let i = 0; i < 1 << 16; i++) tex[4 * i] = tex[4 * (((((i >> 8) + 17) & 255) << 8) | ((i + 37) & 255)) + 1]
const put = (i: number, v: number) => ((tex[4 * i + 2] = v & 255), (tex[4 * i + 3] = v >> 8))
const whole = { data: tex, at: 0, n: 256 }, head = { data: tex, at: 0, n: 9 }
// The level: Eratosthenes' sieve, run once to 130² for every integer's least prime factor, and each cell of Ulam's
// spiral told what its integer is: which of the fifteen primes to 47 strikes it (15: none), whether it is prime, a
// twin, 1 mod 4, and half the gap to the next prime. The Mersenne primes' cells go in the ninth row.
const LEAST = new Uint16Array(16900), FIFTEEN = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47]
for (let i = 2; i < LEAST.length; i++) if (!LEAST[i]) for (let j = i; j < LEAST.length; j += i) LEAST[j] ||= i
const prime = (n: number) => n > 1 && LEAST[n] === n
// Ulam's cell (x, y) holds this integer: 1 at the origin, 2 to its east, winding anticlockwise
function ulam(x: number, y: number) {
  const m = Math.max(Math.abs(x), Math.abs(y)), b = (2 * m - 1) ** 2
  return !m ? 1 : x === m && y > -m ? b + y + m : y === m ? b + 3 * m - x : x === -m ? b + 5 * m - y : b + 7 * m + x
}
for (let y = -64; y < 64; y++)
  for (let x = -64; x < 64; x++) {
    const n = ulam(x, y), j = FIFTEEN.indexOf(LEAST[n])
    let gap = 1
    while (prime(n) && !prime(n + gap)) gap++
    put(((y + 192) << 8) + x + 64, prime(n) ? 15 | 16 | (prime(n - 2) || prime(n + 2) ? 32 : 0) | ((gap >> 1) << 6) | (n % 4 === 1 ? 4096 : 0) : j < 0 ? 15 : j)
    const m = [3, 7, 31, 127, 8191].indexOf(n)
    if (m >= 0) put(2 * RIBS + 4 + m, (x + 64) | ((y + 64) << 8))
  }
const seg = new Uint8Array(32768), exps = new Float64Array(RIBS), first = new Uint16Array(RIBS)
// Past the record, where Primorial's first region is: the ribs are the primes from 149 500 003 on
let next = 149500003, base = 0, front = 0, age = 0, owed = 0, sent = false
const tally = { dead: 0 } // this thousand's dead
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
  for (let i = 0; i < RIBS; i++) put(i, exps[i] - base), put(RIBS + i, 0)
  put(2 * RIBS, base % 65536), put(2 * RIBS + 1, Math.floor(base / 65536))
  front = 0, age = 0, tally.dead = 0
}
// one more k for every exponent still alive
function row() {
  const k = ++front
  for (let i = 0; i < RIBS; i++) {
    if (first[i]) continue
    const p = exps[i], q = 2 * k * p + 1, m = q % 8
    if ((m !== 1 && m !== 7) || !(q % 3 && q % 5 && q % 7 && q % 11 && q % 13 && q % 17 && q % 19 && q % 23)) continue
    if (pow2(p, q) !== 1) continue
    put(RIBS + i, (first[i] = k))
    tally.dead++
  }
}

// ---- the way in ------------------------------------------------------------------------------------------------
// The camera looks at a point on the planet's axis (a hair off it, so east is still east) from a distance and an
// elevation: [seconds at the place, the point's height, from how far, how steeply]. It comes to rest over the well's
// mouth (the place's own view, in places.ts) and does not wait there: down the well, through the spiral, and out to
// the side over the level, and there it is the visitor's.
// (Never straight down: the camera's up is the planet's, and looking past a page would roll it.)
const TOP = 1.004, TILT = 0.004
const WAY = [[0, TOP, 0.22, 1.4], [0.9, 0.84, 0.16, 1.42], [1.5, 0.72, 0.2, 1.3], [3, WF + 0.03, 0.55, 0.56]]
const END = 3
// Its parts, where they are in the hall (the planet's frame) and how large the camera should take each to be: it comes
// to 4.5 of these from the part clicked (planet.ts). The wheels' and the wall's are a share of them, so it stays inside.
const PARTS: [id: string, x: number, y: number, z: number, r: number][] = [['spiral', 0, 1, 0, 0.045], ['wheels', 0, WF + 0.1, 0, 0.075], ['sieve', 0.07, WF + 0.01, 0.1, 0.035], ['hunt', 0, WF, 0.43, 0.07]]
const g = [0, 0, 0], c3 = [0, 0, 0]
let h = TOP, lev = 0, was = false, ghost = 0, side = 0
export const where = (o: number[]) => ((o[0] = 0), (o[1] = h), (o[2] = h * TILT), o)
// The way in, and then the camera is the visitor's (while they hold it, or a part, the way in waits: planet.ts).
export function steer(since: number, _picked: string, o: Steer) {
  const s = HELD >= 0 ? HELD : since
  o.at[0] = o.at[1] = o.at[2] = 0
  return s < END && (glide(WAY, s, g), (o.d = g[1]), (o.pitch = g[2]), (o.yaw = 0.05 * s), true)
}
export const about: Record<string, About> = {
  spiral: { name: 'Sacks’ spiral', does: 'Every whole number on one winding line, n at radius √n, so the squares lie along one ray. A bead of light at each prime below 1024: gold if it is 1 more than a multiple of 4 (a sum of two squares), blue if it is 3 more.' },
  wheels: { name: 'The wheel sieve', does: 'Pritchard’s sieve as machinery. Each hoop is the wheel of a primorial, 2, 6, 30, 210, 2310, with a bar of light hanging at every residue that shares no factor with it: 1 bar, 2, 8, 48, 480. Each hoop is the one inside it rolled out p times with p’s multiples struck, left as stubs in p’s colour. They roll along the integers together, one a second.' },
  sieve: { name: 'The sieve of Eratosthenes', does: 'The integers lie across the hall on Ulam’s spiral, 1 on the axis, each a shaft of light. Every 26 s the sieve runs: a wave for each prime, 2, 3, 5 … 47, and its multiples fall through the level and hang under it in its colour. What is left standing is prime, and grows as tall as the gap to the next prime: gold or blue by its remainder mod 4, twins white. They stand along diagonals. The five shafts that reach the roof are the Mersenne primes 3, 7, 31, 127 and 8191.' },
  hunt: { name: 'The search', does: 'Trial factoring, as PrimesF does it before the long test. Each rib of the wall is one Mersenne number 2ᵖ − 1, p a prime from 149 500 003 up, past the record (3 250 exponents there were untested on 21 Nov 2026). Up the rib are the only numbers that could divide it, q = 2kp + 1 with q ≡ ±1 mod 8, tried a row at a time: the line of light climbing the wall. A factor blazes and its rib goes dark above it; a rib that stands to the top would take 8.49 days to test in full on one M4 Pro, 149 500 003 squarings at 4.907 ms each.' },
}

// ---- the eye ---------------------------------------------------------------------------------------------------
// What happens here, for the world's music (sound.ts): how many so far, and the last one's pitch, Hz. Four a second
// at most, however busy the sieves are.
export const events = { n: 0, f: 0 }
const DEGREE = [0, 2, 4, 7, 9, 12, 14, 16], heard = [-1, -1, 0]
const fold = (f: number, lo: number) => f / 2 ** Math.floor(Math.log2(f / lo))
let rang = -9
function ring(f: number) {
  if (ctx.t - rang < 0.25) return
  ;(rang = ctx.t), events.n++, (events.f = f)
}
const D0 = 0.34, D1 = 0.2 // how far from the well's mouth this field takes the planet's over, and where it has every cell
const F: Field = { shader: CORE, k: 1, p: ctx.p }
const solids = {} as Solids
export function core(k: number) {
  const f = ctx.f, E = ctx.E, dt = ctx.dt, r = len(E), here = ctx.focus === k
  const s = here && ctx.since >= 0 ? (HELD >= 0 ? HELD : ctx.since) : -1
  if (s < 0) {
    if (r >= 1) h = TOP // away, or on the way here: the well's mouth
  } else {
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
  if (!base) batch()
  // the hunt goes on whether or not the dome is in sight: thirty rows a second, then the next thousand exponents
  age += dt
  for (owed = Math.min(owed + 30 * dt, 4); owed >= 1 && front < KS; owed--) row()
  if (front >= KS && age > TURN) batch()
  // and for the world's music: a prime the wheels roll to, its place on the wheel of 30 a degree of A's
  // pentatonic; a wave leaving the level's middle, its prime as a harmonic of A; a factor found, its k as one
  const N = Math.floor((ctx.t / 2310 - Math.floor(ctx.t / 2310)) * 2310), wave = Math.floor(((ctx.t / 26 - Math.floor(ctx.t / 26)) * 26) / 0.9)
  if (N !== heard[0] && prime((heard[0] = N))) ring(220 * 2 ** (DEGREE[Math.floor(((N % 30) * 8) / 30)] / 12))
  if (wave !== heard[1] && (heard[1] = wave) >= 1 && wave <= 15) ring(fold(55 * PRIMES[wave - 1], 220))
  if (tally.dead !== heard[2] && (heard[2] = tally.dead)) ring(fold(110 * front, 440))
  put(2 * RIBS + 2, front), put(2 * RIBS + 3, Math.round(255 * smooth(0, 1.2, age) * (1 - smooth(TURN - 1.2, TURN, age))))
  F.rows = sent ? head : whole
  sent = true
  const G = f.field!
  ctx.p[26] = lev = r < 1 || ghost ? 1 : smooth(D0, D1, m)
  ctx.p[27] = r < 1 ? 0 : ghost * ghost * (3 - 2 * ghost)
  F.res = G.res
  Object.assign(solids, G.solids).aperture = (G.solids?.aperture ?? 0) * (1 - 0.7 * lev) // in the well the lens is stopped down
  F.solids = solids
  f.field = F
}

// What it sounds like, from inside.
// The sieve, as a spectrum: every prime whose wave has gone out over the level sounds as that harmonic of a low A
// (55 Hz), as loud as 1/p^0.7: an octave, then a twelfth joins, a seventeenth (the major third), the seventh
// harmonic's flat seventh, the eleventh's sharp fourth, and wave by wave the chord grows richer and stranger, the
// primes' own timbre, with the A they all stand on never sounded; and the level made new, it falls silent.
// The wall: a bell for every row of k that kills an exponent, its pitch k's place in the harmonic series over a low
// A (folded under 1760 Hz), as loud as the root of how many died. Most factors are small, so a thousand exponents
// begin as a peal up the series and thin to single strokes.
// The wheels: when the integer they have rolled to is prime it plucks a string tuned
// to its gap from the last: the gap's odd part as a harmonic of A3, folded into one octave.
const BELLS = 32
const PRIMES = FIFTEEN, LOUD = PRIMES.map((p) => p ** -0.7)
const y1 = new Float64Array(BELLS), y2 = new Float64Array(BELLS), c1 = new Float64Array(BELLS), c2 = new Float64Array(BELLS)
const organ = new Float64Array(PRIMES.length), turns = new Float64Array(PRIMES.length)
const STRINGS = 8, s1 = new Float64Array(STRINGS), s2 = new Float64Array(STRINGS), k1 = new Float64Array(STRINGS), k2 = new Float64Array(STRINGS), ks = new Float64Array(STRINGS)
let under = -1, last = 0, rung = 0, dead = 0, bell = 0, tuned = 0
export function voice(t: number, dt: number) {
  if (!was) return 0
  const waves = (t / 26 - Math.floor(t / 26)) * (26 / 0.9) // how many have left the floor's middle (planet.wgsl's waves)
  let out = 0
  for (let i = 0; i < PRIMES.length; i++) {
    const a = (organ[i] += 2e-4 * ((waves >= 1 + i ? LOUD[i] : 0) - organ[i]))
    if (a < 1e-4) continue
    turns[i] += dt * 55 * PRIMES[i]
    turns[i] -= Math.floor(turns[i])
    out += 0.5 * a * Math.sin(2 * Math.PI * turns[i])
  }
  // the strings: string m is the harmonic 2m + 1 of A3, folded down into the octave over it, ringing a second
  if (dt !== tuned)
    for (let m = 0, r = Math.exp(-dt / 1.1); m < STRINGS; m++) {
      const hm = 2 * m + 1, w = 2 * Math.PI * ((220 * hm) / 2 ** Math.floor(Math.log2(hm))) * (tuned = dt)
      ;(k1[m] = 2 * r * Math.cos(w)), (k2[m] = r * r), (ks[m] = Math.sin(w))
    }
  const N = Math.floor((t / 2310 - Math.floor(t / 2310)) * 2310) // the integer the wheels have rolled to
  if (N !== under) {
    if (prime((under = N))) {
      let gap = N - last
      while (gap > 0 && gap % 2 === 0) gap /= 2
      if (last && gap > 0 && gap < 2 * STRINGS) s1[(gap - 1) / 2] += 0.03 * ks[(gap - 1) / 2]
      last = N
    }
  }
  for (let m = 0; m < STRINGS; m++) {
    const y = k1[m] * s1[m] - k2[m] * s2[m]
    ;(s2[m] = s1[m]), (out += s1[m] = y)
  }
  if (front !== rung) {
    const born = tally.dead - dead, k = front
    if (born > 0 && k > 0)
      // a bell is two decaying partials, each a resonator rung once, y ← 2r cos ω y₁ − r² y₂, in whichever two have
      // died away furthest, so none is cut off ringing
      for (let hh = 0; hh < 2; hh++) {
        bell = 0
        for (let i = 1; i < BELLS; i++) if (Math.abs(y1[i]) + Math.abs(y2[i]) < Math.abs(y1[bell]) + Math.abs(y2[bell])) bell = i
        const w = 2 * Math.PI * ((110 * k) / 2 ** Math.max(0, Math.floor(Math.log2(k)) - 3)) * (hh ? 2.76 : 1) * dt, r = Math.exp(-dt / (hh ? 0.25 : 0.9))
        ;(c1[bell] = 2 * r * Math.cos(w)), (c2[bell] = r * r), (y2[bell] = 0), (y1[bell] = 0.05 * Math.sqrt(Math.min(born, 16)) * (hh ? 0.4 : 1) * Math.sin(w))
      }
    ;(rung = front), (dead = tally.dead)
  }
  for (let i = 0; i < BELLS; i++) {
    const y = c1[i] * y1[i] - c2[i] * y2[i]
    ;(y2[i] = y1[i]), (out += y1[i] = y)
  }
  return lev * out
}

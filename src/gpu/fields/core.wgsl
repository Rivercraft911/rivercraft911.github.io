// The core (src/world/sites/core.ts): inside River's planet, the integers. Units are the planet's radius, z up the
// bore from the centre, the eye wherever the wheel has let it down.
//
// The bore, through the crust: the sieve of Eratosthenes as strata. The integers are wound round the wall 210 to a
// ring; each stratum down strikes the multiples of one more prime, so stratum j is what is coprime to p_j#, the
// freshly struck glow as embers, and the survivors thin as Mertens says, Π(1 − 1/p) ~ e^−γ / ln p.
// The dome: trial factoring, as PrimesF does it. Each rib is one exponent p, a prime, 2^p − 1 a number of a hundred
// million digits; up the rib, k = 1, 2, …, the candidates q = 2kp + 1. Any factor of 2^p − 1 is such a q, with
// q ≡ ±1 (mod 8), so the rest are holes, with those a small prime divides. What is left is tested, here, in this
// pixel, this frame: 2^p mod q by Montgomery squaring, 48 bits in 16-bit limbs; a factor blazes, and its rib, now
// known composite, goes dark above it. The front (how far up the CPU's own, independent run has got) gates it.
// The floor: Ulam's spiral, 1 at the planet's centre, wound at seven sizes, the finest out to 2^32; every lit cell
// is a prime, proven this frame by Miller–Rabin to bases 2, 7 and 61, which is a proof below 4 759 123 141. Gold is p ≡ 1 (mod 4), a sum of two
// squares; blue is p ≡ 3.
//
// p[0] eye, 1/tan(fov/2)   p[1] right, t   p[2] up, the front (k tested to)   p[3] forward, gain
// p[4] the ribs' base exponent (high 16 bits, low 16), the dome's light (it dims while the ribs change), the bore read as text
// data: 1024 × 2 rgba8; row 0 a rib's exponent less the base, row 1 the k of its first factor (0: none yet)

const TAU = 6.2831853;
const A = 0.045;     // the bore's radius
const RC = 0.6;      // the chamber's
const W = 210.0;     // integers to a ring of the bore
const RPS = 12u;     // rings to a stratum
const NR = 1024.0;   // ribs
const KS = 512.0;    // candidates up a rib
const CELL = 1.8310547e-5; // RC / 32768: the floor holds every integer below 2^32
const PR = array<u32, 15>(2u, 3u, 5u, 7u, 11u, 13u, 17u, 19u, 23u, 29u, 31u, 37u, 41u, 43u, 47u);

const GOLD = vec3f(1.0, 0.72, 0.22);
const EMBER = vec3f(1.0, 0.16, 0.03);
const BLUE = vec3f(0.2, 0.62, 1.0);
const HOT = vec3f(1.0, 0.9, 0.7);

// ---- 48-bit numbers in 16-bit limbs, low first: a product of two limbs is exact in a u32 --------------------
struct N3 { a: u32, b: u32, c: u32 }
const M = 0xffffu;

fn geq(x: N3, q: N3) -> bool {
  if (x.c != q.c) { return x.c > q.c; }
  if (x.b != q.b) { return x.b > q.b; }
  return x.a >= q.a;
}
fn sub(x: N3, q: N3) -> N3 {
  let a = x.a + 0x10000u - q.a;
  let b = x.b + 0xffffu + (a >> 16u) - q.b;
  let c = x.c + 0xffffu + (b >> 16u) - q.c;
  return N3(a & M, b & M, c & M);
}
fn dbl(x: N3, q: N3) -> N3 { // 2x mod q, q below 2^47
  let a = x.a << 1u;
  let b = (x.b << 1u) | (a >> 16u);
  let y = N3(a & M, b & M, (x.c << 1u) | (b >> 16u));
  if (geq(y, q)) { return sub(y, q); }
  return y;
}
fn add(x: N3, y: N3, q: N3) -> N3 {
  let a = x.a + y.a;
  let b = x.b + y.b + (a >> 16u);
  let s = N3(a & M, b & M, x.c + y.c + (b >> 16u));
  if (geq(s, q)) { return sub(s, q); }
  return s;
}
fn same(x: N3, y: N3) -> bool { return x.a == y.a && x.b == y.b && x.c == y.c; }
// −1/q mod 2^16, by Newton: an odd q is its own inverse to three bits, and each step doubles them
fn ninv(q0: u32) -> u32 {
  var v = q0;
  v *= 2u - q0 * v;
  v *= 2u - q0 * v;
  v *= 2u - q0 * v;
  return (0u - v) & M;
}
// Montgomery's product x y / 2^48 mod q, a limb of y at a time (CIOS): no division anywhere.
fn mont(x: N3, y: N3, q: N3, ni: u32) -> N3 {
  var t0 = 0u;
  var t1 = 0u;
  var t2 = 0u;
  var t3 = 0u;
  for (var i = 0; i < 3; i++) {
    let yi = select(select(y.c, y.b, i == 1), y.a, i == 0);
    var s = t0 + x.a * yi;
    let u0 = s & M;
    var c = s >> 16u;
    s = t1 + x.b * yi + c;
    let u1 = s & M;
    c = s >> 16u;
    s = t2 + x.c * yi + c;
    let u2 = s & M;
    c = s >> 16u;
    s = t3 + c;
    let u3 = s & M;
    let u4 = s >> 16u;
    let m = (u0 * ni) & M;
    s = u0 + m * q.a;
    c = s >> 16u;
    s = u1 + m * q.b + c;
    t0 = s & M;
    c = s >> 16u;
    s = u2 + m * q.c + c;
    t1 = s & M;
    c = s >> 16u;
    s = u3 + c;
    t2 = s & M;
    t3 = u4 + (s >> 16u);
  }
  let r = N3(t0, t1, t2 | (t3 << 16u));
  if (geq(r, q)) { return sub(r, q); }
  return r;
}
// x 2^n mod q: from 1, 2^48 mod q, which is 1 as Montgomery keeps it
fn shl(x0: N3, n: i32, q: N3) -> N3 {
  var x = x0;
  for (var i = 0; i < n; i++) { x = dbl(x, q); }
  return x;
}

// ---- trial factoring: is q = 2kp + 1 a factor of 2^p − 1? 0 a hole (sieved), 1 tested and not, 2 a factor ----
fn candidate(p: u32, k: u32) -> N3 {
  let lo = 2u * k * (p & M);
  let hi = 2u * k * (p >> 16u) + (lo >> 16u);
  return N3((lo & M) | 1u, hi & M, hi >> 16u);
}
fn sieved(q: N3) -> bool {
  let m8 = q.a & 7u;
  if (m8 != 1u && m8 != 7u) { return true; }
  for (var i = 1; i < 9; i++) { // 3 … 23: 2^16 and 2^32 mod each, so the sum stays small
    let m = PR[i];
    let r = 65536u % m;
    if ((q.a + q.b * r + q.c * ((r * r) % m)) % m == 0u) { return true; }
  }
  return false;
}
fn divides(p: u32, q: N3) -> bool {
  let ni = ninv(q.a);
  let one = shl(N3(0u, 0x2000u, 0u), 19, q); // q > 2p > 2^29, so 2^29 is already reduced
  var x = one;
  for (var b = 31 - i32(countLeadingZeros(p)); b >= 0; b--) {
    x = mont(x, x, q, ni);
    if (((p >> u32(b)) & 1u) == 1u) { x = dbl(x, q); }
  }
  return same(x, one);
}

// ---- Miller–Rabin, bases 2, 7, 61: a proof for every n below 2^32 ---------------------------------------------
fn prime(n: u32) -> bool {
  if (n < 2u) { return false; }
  for (var i = 0; i < 6; i++) {
    if (n % PR[i] == 0u) { return n == PR[i]; }
  }
  if (n < 289u) { return true; }
  let q = N3(n & M, n >> 16u, 0u);
  let ni = ninv(q.a);
  let one = shl(N3(1u, 0u, 0u), 48, q);
  let neg = sub(q, one);
  let s = countTrailingZeros(n - 1u);
  let d = (n - 1u) >> s;
  let top = 31 - i32(countLeadingZeros(d));
  for (var j = 0; j < 3; j++) {
    let a = select(select(61u, 7u, j == 1), 2u, j == 0);
    var am = N3(0u, 0u, 0u); // a, as Montgomery keeps it
    for (var b = 5; b >= 0; b--) {
      am = dbl(am, q);
      if (((a >> u32(b)) & 1u) == 1u) { am = add(am, one, q); }
    }
    var x = one;
    for (var b = top; b >= 0; b--) {
      x = mont(x, x, q, ni);
      if (((d >> u32(b)) & 1u) == 1u) { x = mont(x, am, q, ni); }
    }
    if (same(x, one) || same(x, neg)) { continue; }
    var witness = true;
    for (var r = 1u; r < s; r++) {
      x = mont(x, x, q, ni);
      if (same(x, neg)) { witness = false; break; }
    }
    if (witness) { return false; }
  }
  return true;
}

// Ulam's spiral: 1 at the origin, 2 to its east, winding anticlockwise; ring m ends at (2m + 1)².
fn ulam(c: vec2i) -> u32 {
  let m = max(abs(c.x), abs(c.y));
  if (m == 0) { return 1u; }
  let base = u32((2 * m - 1) * (2 * m - 1));
  if (c.x == m && c.y > -m) { return base + u32(c.y + m); }
  if (c.y == m) { return base + u32(2 * m + m - c.x); }
  if (c.x == -m) { return base + u32(4 * m + m - c.y); }
  return base + u32(6 * m + c.x + m);
}

// a cell's face: a soft-cornered tile, its edge a pixel's footprint wide
fn tile(f: vec2f, w: vec2f, inset: f32) -> f32 {
  let d = 0.5 - inset - abs(f - 0.5);
  let e = clamp(d / max(w, vec2f(1e-4)) + 0.5, vec2f(0.0), vec2f(1.0));
  return e.x * e.y;
}

// ---- the bore's wall: the sieve, a stratum a prime -------------------------------------------------------------
fn wall(P: vec3f, t: f32) -> vec3f {
  let cw = TAU * A / W;
  let th = atan2(P.y, P.x) / TAU + 0.5;
  let dz = max(1.0 - P.z, 0.0) / (1.6 * cw);
  let ring = u32(dz);
  let j = min(ring / RPS, 14u);
  let n = ring * 210u + u32(th * W) + 2u;
  var fate = 0; // 0 survives, 1 struck by this stratum's prime, 2 struck above
  var alive = 1.0;
  for (var i = 0u; i <= j; i++) {
    alive *= 1.0 - 1.0 / f32(PR[i]);
    if (fate == 0 && n % PR[i] == 0u && n != PR[i]) { fate = select(2, 1, i == j); }
  }
  let w = t * cone() / cw * vec2f(1.0, 0.625); // a pixel, in cells
  let seam = smoothstep(0.0, 0.25, fract(dz / f32(RPS)) * f32(RPS)); // a dark bed between strata
  var c = vec3f(0.006, 0.004, 0.003);
  if (fate == 0) { c = GOLD * 1.1; }
  if (fate == 1) { c = EMBER * 0.3; }
  let lit = c * tile(vec2f(fract(th * W), fract(dz)), w, 0.12);
  let mean = GOLD * 1.1 * alive * 0.58 + EMBER * 0.3 * alive / f32(PR[j]) * 0.58;
  let far = exp(-0.7 * max(w.x, w.y));
  return mix(mean, lit, far) * seam * exp(-2.2 * t);
}

// ---- the dome: a rib an exponent, a cell a candidate -----------------------------------------------------------
fn dome(P: vec3f, t: f32) -> vec3f {
  let lat = asin(clamp(P.z / RC, 0.0, 1.0)) / (0.25 * TAU);
  let az = fract(atan2(P.y, P.x) / TAU + 1.0);
  let rib = i32(az * NR) & 1023;
  let kf = lat * KS;
  let k = u32(kf) + 1u;
  let front = u.p[2].w;
  let e = textureLoad(data, vec2i(rib, 0), 0);
  let g = textureLoad(data, vec2i(rib, 1), 0);
  let p = (u32(u.p[4].x) << 16u) + u32(u.p[4].y) + (u32(e.b * 255.0 + 0.5) << 16u) + (u32(e.g * 255.0 + 0.5) << 8u) + u32(e.r * 255.0 + 0.5);
  let first = (u32(g.g * 255.0 + 0.5) << 8u) + u32(g.r * 255.0 + 0.5);
  // a pixel, in cells, across the rib and up it
  let w = t * cone() / RC * vec2f(NR / (TAU * max(cos(lat * 0.25 * TAU), 1e-3)), KS / (0.25 * TAU));
  let far = exp(-0.6 * max(w.x, w.y));
  let face = tile(vec2f(fract(az * NR), fract(kf)), w, 0.14);
  let dead = first > 0u && k > first;
  let tested = f32(k) <= front;
  var c = vec3f(0.0);
  let q = candidate(p, k);
  if (!sieved(q)) {
    c = select(vec3f(0.05, 0.075, 0.13), select(GOLD * 0.2, EMBER * 0.012, dead), tested);
    if (tested && far > 0.02 && divides(p, q)) { c = HOT * select(26.0, 5.0, dead && k != first); }
  }
  // the front itself: the row being tested now
  let line = exp(-pow((kf + 1.0 - front) / max(1.0, w.y), 2.0)) * step(front, KS);
  let mean = select(vec3f(0.05, 0.075, 0.13), select(GOLD * 0.2, vec3f(0.0), dead), tested) * 0.1;
  return (mix(mean, c * face, far) + GOLD * 0.25 * line) * u.p[4].z;
}

// ---- the floor: every integer below 2^32, wound from the centre -------------------------------------------------
// a cell's integer written on it: a 3 × 5 digit a nibble and a half, top row first
const DIGIT = array<u32, 10>(0x7b6fu, 0x2c97u, 0x73e7u, 0x73cfu, 0x5bc9u, 0x79cfu, 0x79efu, 0x7249u, 0x7befu, 0x7bcfu);
fn digits(n: u32, f: vec2f) -> f32 {
  var D = 1;
  for (var m = n / 10u; m > 0u; m /= 10u) { D++; }
  let cols = f32(4 * D - 1);
  let unit = min(0.8 / cols, 0.07);
  let x = (f.x - 0.5) / unit + 0.5 * cols;
  let y = 2.5 - (f.y - 0.5) / unit;
  if (x < 0.0 || y < 0.0 || y >= 5.0 || x >= cols) { return 0.0; }
  let cx = i32(x) % 4;
  if (cx == 3) { return 0.0; }
  var m = n;
  for (var i = D - 1 - i32(x) / 4; i > 0; i--) { m /= 10u; }
  return f32((DIGIT[m % 10u] >> u32(14 - (i32(y) * 3 + cx))) & 1u);
}
// One winding of the floor, its cells `cell` across: the integer under P, its number on it, lit if it is prime.
fn winding(P: vec3f, cell: f32, w: vec2f) -> vec3f {
  let g = P.xy / cell;
  let at = vec2i(floor(g + 0.5));
  if (max(abs(at.x), abs(at.y)) > 32767) { return vec3f(0.0); }
  let n = ulam(at);
  let f = fract(g + 0.5);
  let ink = digits(n, 1.0 - f) * smoothstep(0.05, 0.015, w.x);
  var c = vec3f(0.006, 0.005, 0.012) + vec3f(0.05, 0.045, 0.1) * ink;
  if (prime(n)) { c = select(select(BLUE, GOLD, n % 4u == 1u), HOT, n == 2u) * 2.4 * (1.0 - 0.92 * ink); }
  return c * tile(f, w, 0.07);
}
// The floor is the spiral seven times over, each winding a quarter the last one's size, all about the one centre:
// 16 cells across the chamber, then 64, … then 65 536, which is every integer below 2^32. The eye is shown the
// windings whose cells are a size it can read (about 45 px, a Gaussian in octaves round that), so falling to the
// floor is falling through them: the Shepard tone of the fall, in integers.
fn ground(P: vec3f, t: f32, rd: vec3f) -> vec3f {
  let px = t * cone();
  let sl = max(abs(rd.z), 0.04); // grazing, a pixel covers a long run of cells
  var c = vec3f(0.0);
  var cell = RC / 8.0;
  for (var j = 0; j < 7; j++) {
    let l = log2(cell * sqrt(sl) / px) - 5.5;
    var w = exp(-l * l / 2.0);
    if ((j == 6 && l > 0.0) || (j == 0 && l < 0.0)) { w = 1.0; }
    if (w > 0.02) { c += w * winding(P, cell, vec2f(px / cell, px / (cell * sl))); }
    cell *= 0.25;
  }
  return c * exp(-1.6 * t) * smoothstep(1.0, 0.985, length(P.xy) / RC);
}

fn field(sq: vec2f) -> vec3f {
  let ro = eye();
  let rd = ray(sq);
  let gain = u.p[3].w;
  text = 0.0;
  // where this ray leaves the bore's cylinder, the chamber's sphere, and where it meets the floor
  let ca = max(dot(rd.xy, rd.xy), 1e-9);
  let cb = dot(ro.xy, rd.xy);
  let tc = (-cb + sqrt(max(cb * cb - ca * (dot(ro.xy, ro.xy) - A * A), 0.0))) / ca;
  let Pc = ro + rd * tc;
  let sb = dot(ro, rd);
  let ts = -sb + sqrt(max(sb * sb - dot(ro, ro) + RC * RC, 0.0));
  let Ps = ro + rd * ts;
  let rim = GOLD * 0.02;

  var bore = dot(ro, ro) > RC * RC; // not in the chamber: in the bore, or above the ground
  if (ro.z > 1.0) {
    if (rd.z >= 0.0) { return vec3f(0.0); }
    let P1 = ro + rd * ((1.0 - ro.z) / rd.z);
    let rr = length(P1.xy);
    if (rr > A) { return gain * rim * exp(-(rr - A) / 0.02); } // the ground, lit only by what comes up the bore
  }
  if (!bore) {
    let tf = -ro.z / min(rd.z, -1e-6);
    let Pf = ro + rd * tf;
    if (rd.z < 0.0 && dot(Pf.xy, Pf.xy) < RC * RC) { return gain * ground(Pf, tf, rd); }
    if (length(Ps.xy) > A || Ps.z < 0.0) { return gain * dome(Ps, ts); }
    bore = true; // up through the oculus
  }
  if (Pc.z > 1.0) { return gain * vec3f(0.004, 0.008, 0.02); } // out of the bore's mouth: the sky
  if (dot(Pc, Pc) > RC * RC && Pc.z > 0.0) {
    text = u.p[4].w * smoothstep(0.0, 0.06, Pc.z - sqrt(RC * RC - A * A));
    return gain * wall(Pc, tc);
  }
  // down the bore and out into the chamber
  let tf = -ro.z / min(rd.z, -1e-6);
  let Pf = ro + rd * tf;
  if (rd.z < 0.0 && dot(Pf.xy, Pf.xy) < RC * RC) { return gain * ground(Pf, tf, rd); }
  return gain * dome(Ps, ts);
}

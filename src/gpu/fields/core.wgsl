// The core (src/world/sites/core.ts): Primorial's world, inside River's planet. It is the planet's own field
// (planet.wgsl) with the hollow under the well in full: where that has the floor and the dome as their mean light,
// this has every cell of them, and it goes on when the eye is under the ground, where the planet's field cannot.
//
// The floor: Ulam's spiral, 1 at its middle, wound at seven sizes, the finest out to 2^32, and Eratosthenes' sieve
// run over it (planet.wgsl's waves): a wave to each prime to 47, striking its multiples in its colour, and a last
// one that is the proof of what is left, in each pixel, each frame, by Miller–Rabin to bases 2, 7 and 61, which is a
// proof below 4 759 123 141. Gold is p ≡ 1 (mod 4), a sum of two squares; blue is p ≡ 3; a twin burns white.
// The dome: trial factoring, as PrimesF does it. Each rib is one exponent p past the record, a prime, 2^p − 1 a number
// of forty-five million digits; up the rib, k = 1, 2, …, the candidates q = 2kp + 1. Any factor of 2^p − 1 is such a
// q, with q ≡ ±1 (mod 8), so the rest are holes, with those a small prime divides. What is left is tested, here, in
// this pixel, this frame: 2^p mod q by Montgomery squaring, 48 bits in 16-bit limbs; a factor blazes, and its rib, now
// known composite, goes dark above it. The front (how far up the CPU's own, independent run has got) gates it.
//
// p[6].z how near the eye is (0: the mean light, as the planet's own field; 1: every cell)   p[6].w how much of the
// hollow an eye over the ground still sees through it
// data: the planet's noise in r and g; in b and a, 16 bits a texel, low byte first: rows 0–3 each rib's exponent less
// the base, rows 4–7 the k of its first factor (0: none yet), row 8 the base (two texels), the front, the dome's light

const NR = 1024.0;   // ribs
const KR = 512.0;    // candidates up a rib

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

// ---- trial factoring: is q = 2kp + 1 a factor of 2^p − 1? ----------------------------------------------------------
fn candidate(p: u32, k: u32) -> N3 {
  let lo = 2u * k * (p & M);
  let hi = 2u * k * (p >> 16u) + (lo >> 16u);
  return N3((lo & M) | 1u, hi & M, hi >> 16u);
}
fn sieved(q: N3) -> bool {
  let m8 = q.a & 7u;
  if (m8 != 1u && m8 != 7u) { return true; }
  for (var i = 1; i < 9; i++) { // 3 … 23: 2^16 and 2^32 mod each, so the sum stays small
    let m = PRIMES[i];
    let r = 65536u % m;
    if ((q.a + q.b * r + q.c * ((r * r) % m)) % m == 0u) { return true; }
  }
  return false;
}
fn divides(p: u32, q: N3) -> bool {
  let ni = ninv(q.a);
  let one = shl(N3(0u, 0x1000u, 0u), 20, q); // q > 2p > 2^28, so 2^28 is already reduced
  var x = one;
  for (var b = 31 - i32(countLeadingZeros(p)); b >= 0; b--) {
    x = mont(x, x, q, ni);
    if (((p >> u32(b)) & 1u) == 1u) { x = dbl(x, q); }
  }
  return same(x, one);
}

// ---- Miller–Rabin: to bases 2 and 3 a proof for every n below 1 373 653, to 2, 7 and 61 for every n below 2^32 ----
fn prime(n: u32) -> bool {
  if (n < 2u) { return false; }
  for (var i = 0; i < 6; i++) {
    if (n % PRIMES[i] == 0u) { return n == PRIMES[i]; }
  }
  if (n < 289u) { return true; }
  let q = N3(n & M, n >> 16u, 0u);
  let ni = ninv(q.a);
  let one = shl(N3(1u, 0u, 0u), 48, q);
  let neg = sub(q, one);
  let s = countTrailingZeros(n - 1u);
  let d = (n - 1u) >> s;
  let top = 31 - i32(countLeadingZeros(d));
  let small = n < 1373653u;
  for (var j = 0; j < select(3, 2, small); j++) {
    let a = select(select(61u, select(7u, 3u, small), j == 1), 2u, j == 0);
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

// ---- the dome: a rib an exponent, a cell a candidate -----------------------------------------------------------
fn word(x: i32, y: i32) -> u32 {
  let v = textureLoad(data, vec2i(x, y), 0);
  return (u32(v.a * 255.0 + 0.5) << 8u) + u32(v.b * 255.0 + 0.5);
}
fn vault(P: vec3f, t: f32) -> vec3f {
  let mean = vault0(P, t);
  let near = u.p[6].z;
  if (near <= 0.0) { return mean; }
  let lat = asin(clamp((P.y - WF) / WC, 0.0, 1.0)) / (0.25 * TAU);
  let az = fract(atan2(P.z, P.x) / TAU + 1.0);
  let rib = i32(az * NR) & 1023;
  let kf = lat * KR;
  let k = u32(kf) + 1u;
  let front = f32(word(2, 8));
  let p = (word(1, 8) << 16u) + word(0, 8) + word(rib & 255, rib >> 8u);
  let first = word(rib & 255, 4 + (rib >> 8u));
  // a pixel, in cells, across the rib and up it
  let w = t * cone() / WC * vec2f(NR / (TAU * max(cos(lat * 0.25 * TAU), 1e-3)), KR / (0.25 * TAU));
  let far = exp(-0.6 * max(w.x, w.y));
  let dead = first > 0u && k > first;
  let tested = f32(k) <= front;
  var c = vec3f(0.0);
  let q = candidate(p, k);
  let fc = face(vec2f(fract(az * NR), fract(kf)), w, 0.14);
  if (fc > 0.0 && !sieved(q)) { // (between the cells nothing is asked)
    let hue = select(AZ, AU, (q.a & 7u) == 1u); // as on the floor: gold is 1 mod 4
    c = select(mix(vec3f(0.1, 0.12, 0.34), hue, 0.25) * 0.5, select(hue * 0.9, vec3f(0.3, 0.02, 0.06) * 0.2, dead), tested);
    if (tested && far > 0.02 && divides(p, q)) { c = WHITE * select(30.0, 5.0, dead && k != first); }
  }
  // the front itself: the row being tested now
  let line = exp(-pow((kf + 1.0 - front) / max(1.0, w.y), 2.0)) * step(front, KR - 1.0);
  let dim = select(vec3f(0.1, 0.12, 0.34) * 0.5, select(0.45 * (AU + AZ), vec3f(0.0), dead), tested) * 0.12;
  let light = f32(word(3, 8) & 255u) / 255.0;
  return mix(mean, (mix(dim, c * fc, far) + vec3f(0.5, 0.9, 1.0) * 0.5 * line) * light * exp(-0.7 * t), near);
}

// ---- the floor: every integer below 2^32, wound from the middle -------------------------------------------------
// One winding of the floor, its cells `cell` across: the integer under P, its number on it, as the sieve has left it;
// where a pixel w covers cells of it, their mean light.
fn winding(P: vec3f, cell: f32, w: vec2f, mean: vec3f) -> vec3f {
  let far = exp(-0.7 * max(w.x, w.y));
  let g = plan(P) / cell;
  let at = vec2i(floor(g + 0.5));
  if (far < 0.02 || max(abs(at.x), abs(at.y)) > 32767) { return mean; }
  let n = ulam(at);
  let f = fract(g + 0.5);
  let fc = face(f, w, 0.07);
  if (fc <= 0.0) { return mean * (1.0 - far); }
  let a = waves(length(vec2f(at)) * cell);
  var ink = 0.0;
  if (w.x < 0.05) { ink = numeral(n, f - 0.5, 1.0, 0.07) * smoothstep(0.05, 0.015, w.x); }
  var j = 15; // which of the first fifteen primes strikes it, if any does
  for (var i = 14; i >= 0; i--) { if (n % PRIMES[i] == 0u && n != PRIMES[i]) { j = i; } }
  var c = ALIVE * (1.0 - 0.8 * ink);
  if (j < 15) { c = struck(j, a - 1.0 - f32(j)) * (1.0 + 2.0 * ink); }
  else if (a > 16.0) {
    // what no wave struck, proven: prime, or made of primes past 47
    var is = vec3f(0.03, 0.025, 0.06) * (1.0 + 2.0 * ink);
    if (prime(n)) {
      is = select(select(AZ, AU, n % 4u == 1u), WHITE, n == 2u) * 2.4;
      if (n > 2u && (prime(n + 2u) || prime(n - 2u))) { is = mix(is, WHITE * 3.4, 0.7); }
      is *= 1.0 - 0.92 * ink;
    }
    c = mix(c, is, sat((a - 16.0) / 0.12));
  }
  return mix(mean, c * fc, far);
}
// The floor is the spiral seven times over, each winding a quarter the last one's size, all about the one middle:
// 16 cells across the hollow, then 64, … then 65 536, which is every integer below 2^32. The eye is shown the one
// whose cells, where it looks, are a size it can read (six pixels from high up, where it is the pattern that is read;
// forty-five from close over them, where it is the numbers), each dissolving into the next, so coming down to the
// floor is falling through them.
fn lower(P: vec3f, t: f32, rd: vec3f) -> vec3f {
  let mean = lower0(P, t, rd);
  let near = u.p[6].z;
  if (near <= 0.0) { return mean; }
  let fog = exp(-0.7 * t);
  let px = t * cone();
  let sl = max(abs(rd.y), 0.04); // grazing, a pixel covers a long run of cells
  let H = abs(u.p[4].y + WF);
  let lv = clamp(0.5 * log2(WC / 8.0 / (H / max(abs(u.p[3].y), 0.3) * cone())) - 0.5 * mix(2.7, 5.5, smoothstep(0.2, 0.02, H)), 0.0, 6.0);
  let k = smoothstep(0.44, 0.56, fract(lv)) * step(lv, 5.999);
  let cell = WC / 8.0 * pow(0.25, floor(lv));
  var c = vec3f(0.0);
  if (k < 1.0) { c = (1.0 - k) * winding(P, cell, vec2f(px / cell, px / (cell * sl)), mean / fog); }
  if (k > 0.0) { c += k * winding(P, 0.25 * cell, vec2f(px / cell, px / (cell * sl)) * 4.0, mean / fog); }
  return mix(mean, c * fog * smoothstep(1.0, 0.985, length(P.xz) / WC), near);
}

fn field(sq: vec2f) -> vec3f {
  let ro = -u.p[4].xyz;
  let r = length(ro);
  if (r >= 1.0) {
    // over the ground it is the planet's own field. An eye that has left through the rock, not up the well, sees
    // what it left fade into the ground (and one going in that way, the ground give way to it).
    let c = planet(sq);
    let glass = max(u.p[6].w, smoothstep(0.03, 0.0, r - 1.0) * smoothstep(1.0, 1.6, length(ro.xz) / WA));
    if (glass <= 0.0) { return c; }
    return mix(c, within(ro, ray(sq), 0.0), glass);
  }
  text = 0.0;
  let c = within(ro, ray(sq), 0.0);
  dist = deep;
  return c;
}

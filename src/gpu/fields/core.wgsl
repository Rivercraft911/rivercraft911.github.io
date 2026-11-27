// The core (src/world/sites/core.ts): Primorial's world, inside River's planet. It is the planet's own field
// (planet.wgsl) with the hollow under the well in full: where that has a glow in the hall's air and on its wall, this
// has what stands there, and it goes on when the eye is under the ground, where the planet's field cannot.
//
// The hall is a ball of dark air. Across its middle lie the integers, Ulam's spiral, 1 on the axis, 128 a side, each
// a shaft of light: nothing is drawn but light in air, summed along the ray where it passes each shaft.
//   The sieve of Eratosthenes runs over them every 26 s. Every integer stands, short and pale; a wave goes out from
//   the middle for each prime to 47, and its multiples fall through the level and hang under it in that prime's
//   colour, the later the prime the deeper; a sixteenth wave is the proof: what still stands is prime and grows to
//   its height, the gap to the next prime, gold for 1 mod 4, blue for 3, a twin white. So the level sorts itself:
//   primes over it along Ulam's diagonals, the composites a hanging country under it, coloured by least factor.
//   2^p − 1 is prime for p = 2, 3, 5, 7, 13: the Mersenne primes 3, 7, 31, 127 and 8191 stand to the roof.
//   Over them turn Pritchard's wheels, a hoop to each primorial, 2, 6, 30, 210, 2310, a bar hanging at every residue
//   coprime to it (1, 2, 8, 48, 480 of them) and a stub in p's colour where p struck: each hoop the one inside it
//   rolled out p times. They roll along the integers together, one a second.
//   The wall is the search: trial factoring, as PrimesF does it. Each rib is one exponent p past the record, a prime;
//   up the rib from the pit, k = 1, 2, …, the candidates q = 2kp + 1. Any factor of 2^p − 1 is such a q, with
//   q ≡ ±1 (mod 8), so the rest are holes, with those a small prime divides. The scene tries them, 2^p mod q, a row
//   of k at a time (core.ts): the row it is on is a line of light climbing the wall, a factor blazes, and its rib,
//   now known composite, goes dark above it.
// The arithmetic that is cheap is done here, in the pixel (residues, the wheels' coprimes, the candidates' sieve);
// the rest the scene does once and sends (the level's sieve, its gaps, the search's powers).
//
// p[6].z how near the eye is (0: a glow, as the planet's own field has it; 1: all of it)   p[6].w how much of the
// hollow an eye over the ground still sees through it
// data: the planet's noise in r and g; in b and a, 16 bits a texel, low byte first: rows 0–3 each rib's exponent less
// the base, rows 4–7 the k of its first factor (0: none yet), row 8 the base (two texels), the front, the wall's
// light, and the five Mersenne primes' cells; rows 128–255, the first 128 columns, the level's cells: which of the
// fifteen primes strikes it (15: none), then a bit each for prime, twin and 1 mod 4, and six for half the gap after it

const NR = 1024.0;   // ribs
const KR = 512.0;    // candidates up a rib
const FC = 0.0066;   // a cell of the level
const FR = 0.42;     // the level's radius
const FUP = 0.062;    // how far over the level anything stands, and how far under it anything hangs
const FDN = 0.031;
const ALIVE = vec3f(0.16, 0.17, 0.28); // an integer nothing has struck yet
// The i-th prime's colour, wherever it strikes: 2 blue, 3 vermilion, 5 green, 7 magenta, 11 yellow, on round the wheel
// by the golden angle, so no two near each other are alike: ½ + ½ cos 2π(0.618 i + (0.33, 0.66, 0)).
const STRUCK = array<vec3f, 15>(
  vec3f(0.26, 0.23, 1.00), vec3f(0.97, 0.41, 0.13), vec3f(0.04, 0.90, 0.54), vec3f(0.70, 0.00, 0.80), vec3f(0.66, 0.84, 0.01),
  vec3f(0.06, 0.50, 0.92), vec3f(0.99, 0.16, 0.37), vec3f(0.22, 1.00, 0.27), vec3f(0.42, 0.10, 0.97), vec3f(0.89, 0.59, 0.04),
  vec3f(0.00, 0.77, 0.71), vec3f(0.85, 0.02, 0.65), vec3f(0.49, 0.94, 0.07), vec3f(0.17, 0.33, 0.99), vec3f(1.00, 0.31, 0.21));

fn word(x: i32, y: i32) -> u32 {
  let v = textureLoad(data, vec2i(x, y), 0);
  return (u32(v.a * 255.0 + 0.5) << 8u) + u32(v.b * 255.0 + 0.5);
}

// ---- the level: the sieve, standing ----------------------------------------------------------------------------
// How many of the sieve's waves have passed radius rho: under 1, none yet, and every integer stands again.
fn waves(rho: f32) -> f32 {
  let a = (fract(u.p[5].w / 26.0) * 26.0 - rho / 0.11) / 0.9;
  return select(a, 99.0, a < 0.0); // (before the level is made new, it is as the last round left it)
}
// The shaft of the integer at `cell`, y over the level: its light there.
fn column(cell: vec2f, y: f32) -> vec3f {
  let ix = vec2i(cell) + 64;
  if (any(ix < vec2i(0)) || any(ix > vec2i(127))) { return vec3f(0.0); }
  let v = word(ix.x, ix.y + 128);
  let j = i32(v & 15u);
  let s = waves(length(cell) * FC) - 1.0 - f32(j); // waves since its own: its prime's, or the proof (the sixteenth)
  var lo = 0.0;
  var hi = 0.008;
  var c = ALIVE;
  if ((v & 16u) != 0u) {
    let k = sat(s / 0.5);
    hi = mix(hi, min(0.014 + 0.004 * f32((v >> 6u) & 63u), FUP - 0.004), k);
    let lit = select(select(AZ, AU, (v & 4096u) != 0u), WHITE * 1.4, (v & 32u) != 0u) * 1.9;
    c = mix(c, lit * (1.0 + 3.0 * exp(-pow((y - hi) / 0.0025, 2.0))), k); // (a flame at its head)
  } else {
    let k = sat(s / 0.3);
    lo = -(0.007 + 0.0015 * f32(j)) * k;
    hi *= 1.0 - k;
    c = mix(c, select(STRUCK[min(j, 14)] * (0.2 + 2.5 * exp(-2.5 * max(s, 0.0))), vec3f(0.05, 0.04, 0.09), j == 15), k);
  }
  return c * smoothstep(lo - 0.0015, lo + 0.0015, y) * smoothstep(hi + 0.0015, hi - 0.0015, y);
}
// The light of every shaft the ray passes, from ro to tEnd along rd: the cells its track crosses, one at a time.
fn shafts(ro: vec3f, rd: vec3f, t0: f32, tEnd: f32) -> vec3f {
  let iy = 1.0 / select(rd.y, select(-1e-6, 1e-6, rd.y > 0.0), abs(rd.y) < 1e-6);
  let y1 = (WF - FDN - ro.y) * iy;
  let y2 = (WF + FUP - ro.y) * iy;
  let a = max(dot(rd.xz, rd.xz), 1e-9);
  let b = dot(ro.xz, rd.xz);
  let h = b * b - a * (dot(ro.xz, ro.xz) - FR * FR);
  if (h <= 0.0) { return vec3f(0.0); }
  let ta = max(max(min(y1, y2), (-b - sqrt(h)) / a), 0.0);
  let tb = min(min(max(y1, y2), (-b + sqrt(h)) / a), tEnd);
  if (tb <= ta) { return vec3f(0.0); }
  let o = plan(ro) / FC;
  let d = vec2f(-rd.x, rd.z) / FC;
  let g = o + d * ta + 0.5;
  var cell = floor(g);
  let sg = select(vec2f(-1.0), vec2f(1.0), d >= vec2f(0.0));
  let inv = 1.0 / max(abs(d), vec2f(1e-6));
  var tm = (cell + max(sg, vec2f(0.0)) - g) * sg * inv;
  var c = vec3f(0.0);
  for (var i = 0; i < 36; i++) {
    let k = shaft(o, d, cell, 0.17);
    if (k.x > 0.0 && k.y > 0.0 && k.y < tEnd) { c += k.x * column(cell, ro.y + rd.y * k.y - WF) * murk(t0 + k.y); }
    if (min(tm.x, tm.y) > tb - ta) { break; }
    if (tm.x < tm.y) { tm.x += inv.x; cell.x += sg.x; } else { tm.y += inv.y; cell.y += sg.y; }
  }
  // (a shaft looked down is looked through for longer)
  return c * min(1.0 / sqrt(a), 2.5) * smoothstep(FR, FR - 0.03, length((ro + rd * 0.5 * (ta + tb)).xz));
}
// A mist lies on the level, thinning as e^(−|y| / 0.012) either side, and the waves go out through it as rings of
// their primes' colours: its light along the ray, the mist's column times what the ray crosses the level in.
fn mist(ro: vec3f, rd: vec3f, t0: f32, tEnd: f32) -> vec3f {
  let ts = clamp((WF - ro.y) / select(rd.y, 1e-4, abs(rd.y) < 1e-4), 0.0, tEnd);
  let P = ro + rd * ts;
  let rho = length(P.xz);
  let a = waves(rho);
  let j = i32(clamp(a - 1.0, 0.0, 14.0));
  let s = a - 1.0 - f32(j);
  let ring = select(STRUCK[j] * exp(-4.5 * max(s, 0.0)), vec3f(0.0), a < 1.0 || a > 30.0);
  let col = 0.012 * min(1.0 / max(abs(rd.y), 0.05), 12.0) * exp(-abs(P.y - WF) / 0.012);
  return (vec3f(0.05, 0.06, 0.14) + 0.8 * ring) * col * smoothstep(FR + 0.04, FR - 0.04, rho) * murk(t0 + ts) * 8.0;
}
// The Mersenne primes on the level: each a shaft to the roof.
fn mersennes(ro: vec3f, rd: vec3f, t0: f32, tEnd: f32) -> vec3f {
  let o = plan(ro) / FC;
  let d = vec2f(-rd.x, rd.z) / FC;
  var c = 0.0;
  for (var i = 0; i < 5; i++) {
    let at = word(4 + i, 8);
    let k = shaft(o, d, vec2f(f32(at & 255u), f32(at >> 8u)) - 64.0, 0.6);
    if (k.x > 0.0 && k.y > 0.0 && k.y < tEnd) { c += k.x * k.x * smoothstep(0.0, 0.02, ro.y + rd.y * k.y - WF) * smoothstep(0.0, 0.1, k.y) * murk(t0 + k.y); }
  }
  return vec3f(0.8, 0.72, 1.0) * 1.4 * c * min(1.0 / max(length(rd.xz), 1e-3), 1.3);
}

// ---- the wheels ------------------------------------------------------------------------------------------------
// Hoop k is the wheel of the k-th primorial, a place round it for each residue; where the residue is coprime to the
// wheel a bar of light hangs, and where this wheel's own prime struck, a stub in its colour. All five roll along the
// integers together, so the integer N they have come to is at the same bearing on every one.
const WHEEL = array<f32, 5>(2.0, 6.0, 30.0, 210.0, 2310.0);
const HOOP = array<f32, 5>(0.06, 0.1, 0.15, 0.21, 0.28);
const BAND = 0.06; // a bar's length
fn wheels(ro: vec3f, rd: vec3f, t0: f32, tEnd: f32) -> vec3f {
  let a = max(dot(rd.xz, rd.xz), 1e-9);
  let b = dot(ro.xz, rd.xz);
  let cc = dot(ro.xz, ro.xz);
  let N = fract(u.p[5].w / 2310.0) * 2310.0;
  var c = vec3f(0.0);
  for (var k = 0; k < 5; k++) {
    let R = HOOP[k];
    let h = b * b - a * (cc - R * R);
    if (h <= 0.0) { continue; }
    for (var e = -1.0; e < 2.0; e += 2.0) {
      let t = (-b + e * sqrt(h)) / a;
      let y = (ro.y + rd.y * t - WF - 0.05 - 0.02 * f32(k)) / BAND; // up the bar, from its foot
      if (t <= 0.0 || t >= tEnd || y < -0.1 || y > 1.1) { continue; }
      let size = WHEEL[k];
      let arc = TAU * R / size;
      let pix = (t0 + t) * cone();
      let pos = fract(atan2(ro.z + rd.z * t, -ro.x - rd.x * t) / TAU + N / size) * size;
      let res = u32(pos);
      var j = -1; // which of the wheel's primes strikes this residue, if any
      for (var i = k; i >= 0; i--) { if (res % PRIMES[i] == 0u) { j = i; } }
      let wide = max(min(0.25 * arc, 7e-4), pix); // a bar: a line of light this wide
      let half = 0.886 * min(0.25 * arc, 7e-4) / arc; // (the share of a place it lights)
      let bar = exp(-pow((fract(pos) - 0.5) * arc / wide, 2.0)) * min(0.25 * arc, 7e-4) / wide * step(0.0, y) * step(y, 1.0);
      var lit = vec3f(0.0);
      if (j < 0) { lit = vec3f(1.0, 0.93, 0.8) * (0.6 + 2.4 * y * y) * bar; }
      else if (j == k) { lit = STRUCK[k] * 3.0 * bar * step(0.7, y); }
      // from far a wheel is its mean: its bars are Π(1 − 1/p) of its places
      var share = 2.0 * half;
      for (var i = 0; i <= k; i++) { share *= 1.0 - 1.0 / f32(PRIMES[i]); }
      lit = mix(vec3f(1.0, 0.93, 0.8) * share * step(0.0, y) * step(y, 1.0), lit, exp(-0.5 * pix / arc));
      // the hoop itself, a rim of light the bars hang from
      let rim = max(8e-4, pix);
      lit += vec3f(0.6, 0.7, 1.0) * 0.6 * (exp(-pow((y - 1.0) * BAND / rim, 2.0)) + 0.4 * exp(-pow(y * BAND / rim, 2.0))) * 8e-4 / rim;
      c += lit * murk(t0 + t);
    }
  }
  return c;
}

// What the hall's air holds, in full.
fn hall(ro: vec3f, rd: vec3f, t0: f32, t: f32) -> vec3f {
  let glow = hall0(ro, rd, t0, t);
  let near = u.p[6].z;
  if (near <= 0.0) { return glow; }
  return glow + near * (shafts(ro, rd, t0, t) + mist(ro, rd, t0, t) + mersennes(ro, rd, t0, t) + wheels(ro, rd, t0, t));
}

// ---- the wall: a rib an exponent, a cell a candidate -----------------------------------------------------------
// Is q = 2kp + 1 one that need not be tried? Not ±1 mod 8, or a multiple of a prime from 3 to 23: q's three 16-bit
// limbs, summed with 2^16 and 2^32 mod each.
const POW16 = array<vec2u, 8>(vec2u(1u, 1u), vec2u(1u, 1u), vec2u(2u, 4u), vec2u(9u, 4u), vec2u(3u, 9u), vec2u(1u, 1u), vec2u(5u, 6u), vec2u(9u, 12u));
fn sieved(p: u32, k: u32) -> bool {
  let lo = 2u * k * (p & 0xffffu);
  let hi = 2u * k * (p >> 16u) + (lo >> 16u);
  let q = vec3u((lo & 0xffffu) | 1u, hi & 0xffffu, hi >> 16u);
  let m8 = q.x & 7u;
  if (m8 != 1u && m8 != 7u) { return true; }
  for (var i = 0; i < 8; i++) {
    if ((q.x + q.y * POW16[i].x + q.z * POW16[i].y) % PRIMES[i + 1] == 0u) { return true; }
  }
  return false;
}
fn vault(P: vec3f, t: f32) -> vec3f {
  let mean = vault0(P, t);
  let near = u.p[6].z;
  if (near <= 0.0) { return mean; }
  let lat = asin(clamp((P.y - WF) / WC, -1.0, 1.0)) / (0.5 * TAU) + 0.5; // 0 at the pit, 1 at the crown
  let az = fract(atan2(P.z, P.x) / TAU + 1.0);
  let rib = i32(az * NR) & 1023;
  let kf = (lat - 0.1) / 0.9 * KR;
  if (kf < 0.0) { return mean * (1.0 - near); }
  let k = u32(kf) + 1u;
  let front = f32(word(2, 8));
  let p = (word(1, 8) << 16u) + word(0, 8) + word(rib & 255, rib >> 8u);
  let first = word(rib & 255, 4 + (rib >> 8u));
  // a pixel, in cells, across the rib and up it
  let w = t * cone() / WC * vec2f(NR / (TAU * max(sin(lat * 0.5 * TAU), 1e-3)), KR / (0.45 * TAU));
  let far = exp(-0.6 * max(w.x, w.y));
  let dead = first > 0u && k > first;
  let tested = f32(k) <= front;
  let f = vec2f(fract(az * NR), fract(kf));
  let d = 0.36 - abs(f - 0.5);
  let e = clamp(d / max(w, vec2f(1e-4)) + 0.5, vec2f(0.0), vec2f(1.0));
  var c = vec3f(0.0);
  if (e.x * e.y > 0.0 && far > 0.02 && !sieved(p, k)) {
    let hue = select(AZ, AU, ((2u * k * (p & 7u) + 1u) & 7u) == 1u); // as on the level: gold is 1 mod 4
    c = select(mix(vec3f(0.1, 0.12, 0.34), hue, 0.25) * 0.5, select(hue * 0.9, vec3f(0.3, 0.02, 0.06) * 0.2, dead), tested);
    if (tested && k == first) { c = WHITE * 30.0; }
  }
  // the front itself: the row being tried now
  let line = exp(-pow((kf + 1.0 - front) / max(1.0, w.y), 2.0)) * step(front, KR - 1.0);
  let dim = select(vec3f(0.1, 0.12, 0.34) * 0.5, select(0.45 * (AU + AZ), vec3f(0.0), dead), tested) * 0.12;
  let light = f32(word(3, 8) & 255u) / 255.0;
  return mix(mean, (mix(dim, c * e.x * e.y, far) + vec3f(0.5, 0.9, 1.0) * 0.5 * line) * light * murk(t), near);
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

// The core (src/world/sites/core.ts): Primorial's world, inside River's planet. It is the planet's own field
// (planet.wgsl) with what stands in the hollow under the well in full, and it goes on when the eye is under the
// ground, where the planet's field cannot. Everything here is exact surfaces met by the ray, each edge a pixel wide:
// no air, no glow, black where nothing is.
//
// The rotunda of the sieve. 210 columns stand in a ring, the integers 1 to 210 in order (210 = 2·3·5·7, so the ring
// closes on every one of those). At its middle a lamp. Between lamp and columns the sieve of Eratosthenes is built,
// a ring of arches to each prime, 2 innermost, then 3, 5, 7, 11 and 13: an arch springs from every multiple of p to
// the next, on a pier at each multiple but p itself. The lamp's light goes out along the radius, so a pier's shadow
// lies on its own multiple and no other: the columns in shadow are the composites, the columns still lit are the
// primes (and 1), and nothing decides that but the light. Every 36 s the arcades sink and are raised again in turn.
// The lamp is the search: a crystal of 531³ cells, one to each bit of 2^p − 1 for p near 149 500 003 (531³ is the
// first cube to hold them; its last layer holds only 60 673, 114 rows and 139, and is drawn so), a pass of light going up it
// for a squaring of the probable-prime test (there are p of them, 4.907 ms each: shown some five hundred times
// slower). Round its foot, the trial factoring: a tile to each k from 1 to 1024, the candidate q = 2kp + 1; dark if
// q is not ±1 (mod 8) or has a small factor, lit once the scene has tried it (core.ts), white if it divides.
//
// p[6].z how near the eye is (0: the lamp alone, as the planet's own field has it; 1: all of it)   p[6].w how much of
// the hollow an eye over the ground still sees through it
// data: the planet's noise in r and g; in b and a, 16 bits a texel, low byte first, in row 8: the exponent (two
// texels), the k tried so far, the k that divides (0: none yet), and the sieve's clock in hundredths of a second

const PW = array<f32, 6>(2.0, 3.0, 5.0, 7.0, 11.0, 13.0);
const RW = array<f32, 6>(0.105, 0.135, 0.165, 0.195, 0.225, 0.255); // each arcade's radius
const TH = 0.004;     // half a wall's thickness
const RC = 0.3;       // the columns' ring
const CR = 0.0018;    // a column's radius: a fifth of the way to the next
const CH = 0.05;      // and its height
const HL = 0.032;     // the lamp's height over the floor
const HS = 0.018;     // half the crystal
const STONE = 0.5;
const AMB = vec3f(0.0016, 0.0016, 0.002); // what the dark is not quite
var<private> RISE: array<f32, 6>; // how far up each arcade is

fn word(x: i32, y: i32) -> u32 {
  let v = textureLoad(data, vec2i(x, y), 0);
  return (u32(v.a * 255.0 + 0.5) << 8u) + u32(v.b * 255.0 + 0.5);
}
// Where round the ring a point is, in integers: 0 (which is 210) along the plan's x, counting anticlockwise.
fn place(P: vec3f) -> f32 { return fract(atan2(P.z, -P.x) / TAU) * 210.0; }
// The lamp's light at radius rho: a line of light's, falling off as 1/ρ.
fn lamplight(rho: f32) -> vec3f { return AU * min(0.045 / max(rho, 0.02), 1.8); }

// Arcade i at place a round the ring and height y: how far into its stone (over 0) or out in the air (under).
fn pier(i: i32, a: f32, y: f32) -> f32 {
  let p = PW[i];
  let l = TAU * RW[i] / 210.0; // a place's length on this ring
  let hs = 0.012 + 0.004 * f32(i); // where its arches spring
  let hw = 0.5 * p - 0.3; // half an opening, in places
  if (i > 3 && (a < p - 0.3 || a > floor(210.0 / p) * p + 0.3)) { return -1.0; } // 11 and 13 do not close the ring
  let la = (fract(a / p) - 0.5) * p; // from the middle of its bay
  var o = min(abs(la) - hw, abs(a - p) - 0.3); // (the prime's own pier is not there)
  if (y > hs) { o = length(vec2f(la, (y - hs) / l)) - hw; }
  return min(min(o * l, (hs + hw * l + 0.006) * RISE[i] - y), y);
}
// How much of the lamp a point at place a, height y, radius rho sees past the arcades inside it (px: a pixel there).
fn lit(a: f32, y: f32, rho: f32, px: f32) -> f32 {
  var s = 1.0;
  for (var i = 0; i < 6 && RW[i] < rho - 0.008; i++) {
    let k = RW[i] / rho;
    s *= 1.0 - sat(pier(i, a, HL + (y - HL) * k) / max(px * k, 1e-5) + 0.5);
  }
  return s;
}

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

// The column whose axis the ray (o, d: from the floor's middle) passes nearest at t: its light, how much of the
// pixel it covers, and how far along the ray it is met.
fn column(o: vec3f, d: vec3f, t: f32, px0: f32, tmax: f32) -> vec4f {
  let n = round(place(o + d * t));
  let th = TAU * n / 210.0;
  let A = RC * vec2f(cos(th), sin(th));
  let oh = vec2f(-o.x, o.z);
  let dh = vec2f(-d.x, d.z);
  let qa = max(dot(dh, dh), 1e-9);
  let ts = dot(A - oh, dh) / qa;
  let v = oh + dh * ts - A;
  let tc = ts - sqrt(max(CR * CR - dot(v, v), 0.0) / qa);
  let px = px0 * max(tc, 1e-4);
  let y = o.y + d.y * tc;
  let k = sat((CR - length(v)) / px + 0.5) * sat((CH - y) / px + 0.5) * step(0.0, y) * step(0.0, tc) * step(tc, tmax);
  if (k <= 0.0) { return vec4f(0.0); }
  let N = (oh + dh * tc - A) / CR;
  let s = lit(n, y, RC, px);
  // a column the lamp reaches is lit stone on the lamp's side, and stands lit from every side
  return vec4f((STONE * lamplight(RC) * max(dot(N, -A / RC), 0.0) + AU * 0.5) * s + AMB, 1.0) * k;
}

// The crystal: light, cover and distance of the ray's meeting with it.
fn crystal(o: vec3f, d: vec3f, px0: f32, tmax: f32) -> vec4f {
  // it stands on a corner and turns about that diagonal: its three axes, 120° apart round the upright
  let w = 0.12 * u.p[5].w + vec3f(0.0, 2.0943951, 4.1887902);
  let ax = vec3f(0.8164966 * cos(w.x), 0.5773503, 0.8164966 * sin(w.x));
  let ay = vec3f(0.8164966 * cos(w.y), 0.5773503, 0.8164966 * sin(w.y));
  let az = vec3f(0.8164966 * cos(w.z), 0.5773503, 0.8164966 * sin(w.z));
  let oc = o - vec3f(0.0, HL, 0.0);
  let ol = vec3f(dot(oc, ax), dot(oc, ay), dot(oc, az));
  let dl = vec3f(dot(d, ax), dot(d, ay), dot(d, az));
  let inv = 1.0 / select(dl, vec3f(1e-6), abs(dl) < vec3f(1e-6));
  let t1 = (-HS - ol) * inv;
  let t2 = (HS - ol) * inv;
  let tn = min(t1, t2);
  let t = max(max(tn.x, tn.y), tn.z);
  if (t <= 0.0 || t > tmax || t > min(min(max(t1.x, t2.x), max(t1.y, t2.y)), max(t1.z, t2.z))) { return vec4f(0.0); }
  deep = min(deep, t);
  let P = (ol + dl * t) / HS;
  let px = px0 * t;
  var uv = P.xz;
  var tone = 1.0;
  var side = true;
  if (tn.x >= tn.y && tn.x >= tn.z) { uv = P.zy; tone = 0.62; }
  else if (tn.z >= tn.y) { uv = P.xy; tone = 0.8; }
  else { side = false; }
  uv = uv * 0.5 + 0.5;
  let cell = 2.0 * HS / 531.0 / px; // a cell, in pixels
  let c = uv * 531.0;
  // its cells, where they can be told apart; its blocks of 59 (531 = 9 · 59) always
  var m = mix(1.0, sat((0.36 - max(abs(fract(c.x) - 0.5), abs(fract(c.y) - 0.5))) * cell + 0.5) * 1.5, smoothstep(2.0, 4.0, cell));
  let b = abs(fract(uv * 9.0 + 0.5) - 0.5) * 59.0; // cells from the nearest block's edge
  m *= 1.0 - 0.8 * sat(max(0.6 * cell, 0.75) - min(b.x, b.y) * cell + 0.5);
  // the pass of light, a squaring, going up it; and on one face the last layer, where it has no cells
  m *= 1.0 + 3.0 * exp(-pow(((oc.y + d.y * t) / (3.4641 * HS) + 0.5 - fract(u.p[5].w / 2.4)) / max(0.004, px / HS), 2.0));
  if (!side && (c.y > 115.0 || (c.y > 114.0 && c.x > 139.0))) { m *= 0.4; }
  let edge = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y)) * 2.0 * HS;
  return vec4f(mix(AU, WHITE, 0.4) * 1.3 * tone * m, 1.0) * sat(edge / px + 0.5);
}

// The floor at P (from its middle), t along a ray that meets it at slope sl: stone under the lamp, the arcades'
// shadows on it; and round the crystal's foot the candidates, a tile each.
fn floorAt(P: vec3f, px: f32, sl: f32) -> vec3f {
  let rho = length(P.xz);
  let a = place(P);
  if (rho > 0.046 && rho < 0.072) {
    let turn = a / 210.0 * 1024.0;
    let k = u32(turn) + 1u;
    let p = (word(1, 8) << 16u) + word(0, 8);
    let f = vec2f(fract(turn), (rho - 0.046) / 0.026);
    let w = vec2f(px / (TAU * rho / 1024.0), px / sl / 0.026);
    let e = clamp((0.5 - vec2f(0.2, 0.08) - abs(f - 0.5)) / max(w, vec2f(1e-4)) + 0.5, vec2f(0.0), vec2f(1.0));
    var c = vec3f(0.0);
    if (e.x * e.y > 0.0 && !sieved(p, k)) {
      c = select(AU * 0.05, AU * 1.1, k <= word(2, 8));
      if (k == word(3, 8)) { c = WHITE * 8.0; }
    }
    return c * e.x * e.y * exp(-0.3 * max(w.x - 1.0, 0.0)) + AMB;
  }
  // paved a slab to each integer, the joints between them cut fine; and a kerb the columns stand on
  let w = max(px / sl, 1.5e-4);
  let joint = sat(1.0 - abs(fract(a) - 0.5) * TAU * rho / 210.0 / w) * step(0.085, rho) + sat(1.0 - abs(abs(rho - RC) - 0.006) / w);
  return (STONE * lamplight(rho) * 0.3 * lit(a, 0.0, rho, px / sl) * (1.0 - 0.6 * min(joint, 1.0)) + AMB) * sat((0.36 - rho) / px + 0.5);
}

// The rotunda, along d from o (from the floor's middle): its light and how much it hides. The ray meets the near
// columns, then each arcade's near side from the outermost in, the crystal, each far side from the innermost out,
// the far columns, the floor: taken in that order, each edge given its share of the pixel, until nothing shows past.
fn rotunda(o: vec3f, d: vec3f) -> vec4f {
  let tau = f32(word(4, 8)) / 100.0;
  for (var i = 0; i < 6; i++) { RISE[i] = smoothstep(2.5 * f32(i) + 0.5, 2.5 * f32(i) + 2.5, tau) * (1.0 - smoothstep(30.0, 33.0, tau)); }
  let px0 = cone();
  let oh = vec2f(-o.x, o.z);
  let dh = vec2f(-d.x, d.z);
  let qa = max(dot(dh, dh), 1e-9);
  let qb = dot(oh, dh);
  let qc = dot(oh, oh);
  let tf = select(1e9, -o.y / d.y, d.y < 0.0 && o.y > 0.0);
  var C = vec3f(0.0);
  var A = 0.0;
  deep = 1e9;
  // the columns' ring
  let hc = qb * qb - qa * (qc - RC * RC);
  let cn = (-qb - sqrt(max(hc, 0.0))) / qa;
  let cf = (-qb + sqrt(max(hc, 0.0))) / qa;
  if (hc > 0.0 && cn > 0.0) {
    let k = column(o, d, cn, px0, tf);
    C = k.rgb;
    A = k.a;
    if (A > 0.5) { deep = cn; }
  }
  // the arcades' near sides
  for (var i = 5; i >= 0 && A < 0.995; i--) {
    let ho = qb * qb - qa * (qc - (RW[i] + TH) * (RW[i] + TH));
    let ta = (-qb - sqrt(max(ho, 0.0))) / qa;
    if (ho <= 0.0 || ta <= 0.0 || ta > tf) { continue; }
    let px = px0 * ta;
    let Pa = o + d * ta;
    let top = (0.012 + 0.004 * f32(i) + (0.5 * PW[i] - 0.3) * TAU * RW[i] / 210.0 + 0.006) * RISE[i];
    let ka = sat(pier(i, place(Pa), Pa.y) / px + 0.5);
    if (ka > 0.0) { // its outer face, turned from the lamp
      C += (1.0 - A) * ka * AMB;
      A += (1.0 - A) * ka;
      deep = min(deep, ta);
    }
    let hi = qb * qb - qa * (qc - (RW[i] - TH) * (RW[i] - TH));
    let Pb = o + d * select(-qb / qa, (-qb - sqrt(max(hi, 0.0))) / qa, hi > 0.0);
    let kb = sat(pier(i, place(Pb), Pb.y) / px + 0.5);
    if (kb > 0.0 && A < 0.995) { // through an opening and into its side; or down onto its top
      C += (1.0 - A) * kb * select(STONE * lamplight(RW[i]) * 0.3, AU * 0.06, Pa.y > top) ;
      A += (1.0 - A) * kb;
      deep = min(deep, ta);
    }
  }
  // the crystal
  if (A < 0.995) {
    let k = crystal(o, d, px0, tf);
    C += (1.0 - A) * k.rgb;
    A += (1.0 - A) * k.a;
  }
  // the arcades' far sides, their faces to the lamp
  for (var i = 0; i < 6 && A < 0.995; i++) {
    let hi = qb * qb - qa * (qc - (RW[i] - TH) * (RW[i] - TH));
    let tc = (-qb + sqrt(max(hi, 0.0))) / qa;
    if (hi <= 0.0 || tc <= 0.0 || tc > tf) { continue; }
    let px = px0 * tc;
    let Pc = o + d * tc;
    let a = place(Pc);
    let kc = sat(pier(i, a, Pc.y) / px + 0.5);
    if (kc > 0.0) {
      // its face to the lamp, a course cut along it where the arches spring and another under its top
      let hs = 0.012 + 0.004 * f32(i);
      let top = hs + (0.5 * PW[i] - 0.3) * TAU * RW[i] / 210.0 + 0.006;
      let cut = max(sat(1.0 - abs(Pc.y - hs) / max(2.5e-4, px)), sat(1.0 - abs(Pc.y - top + 0.002) / max(2.5e-4, px)));
      C += (1.0 - A) * kc * (STONE * lamplight(RW[i]) * lit(a, Pc.y, RW[i] - TH, px) * (1.0 - 0.7 * cut) + AMB);
      A += (1.0 - A) * kc;
      deep = min(deep, tc);
    }
    let ho = qb * qb - qa * (qc - (RW[i] + TH) * (RW[i] + TH));
    let Pd = o + d * ((-qb + sqrt(max(ho, 0.0))) / qa);
    let kd = sat(pier(i, place(Pd), Pd.y) / px + 0.5);
    if (kd > 0.0 && A < 0.995) {
      C += (1.0 - A) * kd * STONE * lamplight(RW[i]) * 0.3;
      A += (1.0 - A) * kd;
      deep = min(deep, tc);
    }
  }
  if (hc > 0.0 && cf > 0.0 && A < 0.995) {
    let k = column(o, d, cf, px0, tf);
    C += (1.0 - A) * k.rgb;
    A += (1.0 - A) * k.a;
    if (k.a > 0.5) { deep = min(deep, cf); }
  }
  if (tf < 1e8 && A < 0.995) {
    C += (1.0 - A) * floorAt(o + d * tf, px0 * tf, -d.y);
    A = 1.0;
    deep = min(deep, tf);
  }
  return vec4f(C, A);
}

// What is in the hollow, in full.
fn hollow(ro: vec3f, rd: vec3f, t0: f32) -> vec4f {
  let far = lamp(ro, rd, t0);
  let near = u.p[6].z;
  if (near <= 0.0) { return far; }
  return mix(far, rotunda(ro - vec3f(0.0, WY, 0.0), rd), near);
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

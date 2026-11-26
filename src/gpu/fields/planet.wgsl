// River's planet (src/world/planet.ts), in units of its radius and in its own frame: the pole is +y, the eye at the
// origin. dist is the ray's length to the ground, or to cloud once cloud hides it.
//
// The air: single scattering, Rayleigh and Mie, with Earth's optical depths over a scale height of 0.008 R, the sun's
//   path through it Chapman's function in closed form, so twilight, the terminator and the lit rim need no ground test.
// The crust: continents of value noise with its gradient, ridges worn where the slope is steep, octaves down to the
//   pixel's footprint. On it, what is River's: the valley's meander θ(s) cut as a terraced canyon under the beam's own
//   river; an archipelago with an island for every point of 32APSK; land raised under every place the scene names.
// The sea: Cox and Munk's wind-roughened glint, Monahan's whitecaps, Beer–Lambert over the shelves.
// The sky's water: a deck of convection cells, marched as a height field, lit by Lambert on its own relief and shadowed by
//   itself; and round the pole the plunge pool's vortex (acts/wrap.ts) as a storm: log-spiral arms, a clear eye, its wall.
// The night: the places' own light, and the auroral ovals as cones about the dipole.
//
// p[4] centre (from the eye), radius   p[5] toward the sun, t   p[6] the spin axis, the spin angle
// p[7] the storm, its eye's radius (rad), cloud cover, aurora
// p[8] exposure, the night side's own light, how many places (up to 10), -
// p[9] how much is read out as text, the river's place (lat, lon; rad), its radii per unit of s (0: no river)
// p[10..14] the places, two a slot (lat, lon, lat, lon; rad): each stands on land and is lit at night
//
// data: a 256² tile of white noise (fields.ts), r the same as g but 37, 17 texels on, so one bilinear tap reads a
// lattice of 3D value noise at two depths.

const PI = 3.14159265;
const TAU = 6.2831853;
const BR = vec3f(5.8, 13.5, 33.1);   // Rayleigh, per radius, at sea level: Earth's zenith depth over H = 0.008
const BM = 21.0;                      // Mie
const HR = 0.008;
const HM = 0.0012;
const TOP = 1.05;
const SUN = vec3f(22.0, 21.1, 19.8);  // the sun's irradiance
const CB = 0.0035;                    // the cloud base
const HC = 0.006;                     // how deep a fair-weather cloud grows; and the storm's wall
const HW = 0.025;
const SIG = 1400.0;                   // a cloud's extinction, per radius
const SOFT = 0.0012;                  // and how far in from its face it thickens
const KS = 4.0;                       // the storm's arms: radians turned per e-fold drawn in, K = Γ/Q, pitch atan(1/K)
const ZS = 0.09;                      // relief, as the light sees it; and as shadows fall from it
const ZP = 0.03;
// the lows, where the westerlies shed them
const LOWS = array<vec3f, 6>(vec3f(0.33, 0.7, 0.63), vec3f(-0.6, 0.62, 0.5), vec3f(-0.39, 0.78, -0.49), vec3f(0.53, -0.66, 0.53), vec3f(-0.66, -0.7, 0.27), vec3f(0.1, -0.64, -0.76));
const ROT = mat3x3f(0.0, 0.8, 0.6, -0.8, 0.36, -0.48, -0.6, -0.48, 0.64);

fn sat(x: f32) -> f32 { return clamp(x, 0.0, 1.0); }

// ---- noise: the tile, read as a lattice --------------------------------------------------------------------------
fn tile(i: vec3f) -> vec2f {
  let k = fract(i / 256.0) * 256.0;
  return k.xy + vec2f(37.0, 17.0) * k.z;
}
fn noise(x: vec3f) -> f32 {
  let i = floor(x);
  let f = x - i;
  let w = f * f * (3.0 - 2.0 * f);
  let s = textureSampleLevel(data, smp, (tile(i) + w.xy + 0.5) / 256.0, 0.0).gr;
  return mix(s.x, s.y, w.z);
}
// The same lattice with its gradient, quintic, from its eight corners: two gathers.
fn noised(x: vec3f) -> vec4f {
  let i = floor(x);
  let w = x - i;
  let s = w * w * w * (w * (w * 6.0 - 15.0) + 10.0);
  let ds = 30.0 * w * w * (w * (w - 2.0) + 1.0);
  let uv = (tile(i) + 1.0) / 256.0;
  let lo = textureGather(1, data, smp, uv);
  let hi = textureGather(0, data, smp, uv);
  let a = lo.w;
  let k1 = lo.z - a;
  let k2 = lo.x - a;
  let k3 = hi.w - a;
  let k4 = a - lo.z - lo.x + lo.y;
  let k5 = a - lo.x - hi.w + hi.x;
  let k6 = a - lo.z - hi.w + hi.z;
  let k7 = -a + lo.z + lo.x - lo.y + hi.w - hi.z - hi.x + hi.y;
  return vec4f(
    a + k1 * s.x + k2 * s.y + k3 * s.z + k4 * s.x * s.y + k5 * s.y * s.z + k6 * s.z * s.x + k7 * s.x * s.y * s.z,
    ds * vec3f(k1 + k4 * s.y + k6 * s.z + k7 * s.y * s.z, k2 + k5 * s.z + k4 * s.x + k7 * s.z * s.x, k3 + k6 * s.x + k5 * s.y + k7 * s.x * s.y));
}
// A smooth maximum of two heights that carry their gradients (.yzw), exact for both.
fn smax(a: vec4f, b: vec4f, k: f32) -> vec4f {
  let t = sat(0.5 + 0.5 * (a.x - b.x) / k);
  return mix(b, a, t) + vec4f(k * t * (1.0 - t), 0.0, 0.0, 0.0);
}

// The planet's own frame: the world turned back by the spin.
fn local(v: vec3f) -> vec3f {
  let a = u.p[6].xyz;
  let c = cos(u.p[6].w);
  let s = -sin(u.p[6].w);
  return v * c + cross(a, v) * s + a * dot(a, v) * (1.0 - c);
}
fn site(ll: vec2f) -> vec3f { return vec3f(cos(ll.x) * sin(ll.y), sin(ll.x), cos(ll.x) * cos(ll.y)); }
var<private> PL: array<vec3f, 10>; // River's places
var<private> NP: i32;

// Where ro + t rd meets the sphere of radius r about the origin: near and far t, or none (−1).
fn ball(ro: vec3f, rd: vec3f, r: f32) -> vec2f {
  let b = dot(ro, rd);
  let h = b * b - dot(ro, ro) + r * r;
  if (h < 0.0) { return vec2f(-1.0); }
  let s = sqrt(h);
  return vec2f(-b - s, -b + s);
}

// ---- the air -------------------------------------------------------------------------------------------------------
// The column above radius r along a ray at cosine mu to the zenith, in sea-level scale heights H: Chapman's function
// in Schüler's closed form. Past the horizon it is twice the tangent column less the column behind, and the ground
// needs no test: under it the air is simply too thick to see through.
fn chapman(r: f32, mu: f32, H: f32) -> f32 {
  let x = r / H;
  let c = sqrt(0.5 * PI * x);
  let up = c / ((c - 1.0) * abs(mu) + 1.0) * exp((1.0 - r) / H);
  if (mu >= 0.0) { return up; }
  let x0 = x * sqrt(max(1.0 - mu * mu, 0.0));
  return 2.0 * sqrt(0.5 * PI * x0) * exp(min(1.0 / H - x0, 40.0)) - up;
}
// Optical depth from p to the sun.
fn sunward(p: vec3f, L: vec3f) -> vec3f {
  let r = length(p);
  let mu = dot(p, L) / r;
  return BR * HR * chapman(r, mu, HR) + 1.1 * BM * HM * chapman(r, mu, HM);
}

struct Air { light: vec3f, through: vec3f, front: vec3f }

// Single scattering along ro + t rd, t in [a, b], n steps crowded toward the ray's lowest point. Something stands in
// the way at `cut` and lets `thr` through: `front` is what the air before it passes, and the light from behind it is dimmed.
fn air(ro: vec3f, rd: vec3f, a: f32, b: f32, L: vec3f, cut: f32, thr: f32, n: i32) -> Air {
  let mu = dot(rd, L);
  let pr = 3.0 / (16.0 * PI) * (1.0 + mu * mu);
  let g = 0.76;
  let pm = 3.0 / (8.0 * PI) * (1.0 - g * g) * (1.0 + mu * mu) / ((2.0 + g * g) * pow(1.0 + g * g - 2.0 * g * mu, 1.5));
  let tm = clamp(-dot(ro, rd), a, b);
  let f = (tm - a) / (b - a);
  var od = vec2f(0.0);
  var A = Air(vec3f(0.0), vec3f(1.0), vec3f(1.0));
  var seen = 1.0;
  for (var i = 0; i < n; i++) {
    let s = (f32(i) + 0.5) / f32(n);
    let k = select((s - f) / (1.0 - f), 1.0 - s / f, s < f);
    let t = select(tm + (b - tm) * k * k, tm - (tm - a) * k * k, s < f);
    let p = ro + rd * t;
    let d = exp((1.0 - length(p)) / vec2f(HR, HM)) * 2.0 * k * (b - a) / f32(n);
    od += 0.5 * d;
    let tr = exp(-(BR * od.x + 1.1 * BM * od.y));
    od += 0.5 * d;
    if (t > cut && seen == 1.0) { seen = thr; A.front = tr; }
    A.light += seen * tr * exp(-sunward(p, L)) * (d.x * BR * pr + d.y * BM * pm);
  }
  A.light *= SUN;
  A.through = exp(-(BR * od.x + 1.1 * BM * od.y));
  if (seen == 1.0) { A.front = A.through; }
  return A;
}

// ---- the crust -----------------------------------------------------------------------------------------------------
// The river: the valley's meander (acts/valley.ts), its heading θ(s), laid out as z = ∫ e^{iθ} ds over s in [0, 120]
// the way places.ts lays it. Two-point Gauss steps of 2; then the nearest node, and the curve's own Taylor series
// about it. Returns the distance from q, in units of s, and the unit vector away from the water.
fn theta(s: f32) -> vec3f {
  let a = TAU * s / 13.0;
  let b = TAU * s / 41.0 + 1.1;
  let w = vec2f(0.85 * TAU / 13.0, 0.55 * TAU / 41.0);
  return vec3f(0.85 * sin(a) + 0.55 * sin(b), w.x * cos(a) + w.y * cos(b), -w.x * w.x / 0.85 * sin(a) - w.y * w.y / 0.55 * sin(b));
}
fn river(q: vec2f) -> vec3f {
  var z = vec2f(0.0);
  var near = vec4f(1e9, 0.0, 0.0, 0.0); // distance², s, z
  for (var i = 0; i <= 60; i++) {
    let s = 2.0 * f32(i);
    let d = q - z;
    if (dot(d, d) < near.x) { near = vec4f(dot(d, d), s, z); }
    let t = vec2f(theta(s + 0.42265).x, theta(s + 1.57735).x);
    z += vec2f(cos(t.x) + cos(t.y), sin(t.x) + sin(t.y));
  }
  let th = theta(near.y);
  let T = vec2f(cos(th.x), sin(th.x));
  let N = vec2f(-T.y, T.x);
  let r = q - near.zw;
  let d = clamp(dot(r, T) / (1.0 - th.y * dot(r, N)), -1.2, 1.2);
  let v = r - T * (d - th.y * th.y * d * d * d / 6.0) - N * (th.y * d * d / 2.0 + th.z * d * d * d / 6.0);
  let l = max(length(v), 1e-6);
  return vec3f(l, v / l);
}

// The nearest point of DVB-S2's 32APSK (9/10: γ1 = 2.53, γ2 = 4.30), its outer ring at radius 1.
fn stone(v: vec2f) -> vec2f {
  let a = atan2(v.y, v.x);
  var best = vec3f(1e9, 0.0, 0.0);
  for (var k = 0; k < 3; k++) {
    let ring = array<vec3f, 3>(vec3f(4.0, 1.0 / 4.3, PI / 4.0), vec3f(12.0, 2.53 / 4.3, PI / 12.0), vec3f(16.0, 1.0, 0.0))[k];
    let b = ring.z + round((a - ring.z) * ring.x / TAU) * TAU / ring.x;
    let c = ring.y * vec2f(cos(b), sin(b));
    let d = dot(v - c, v - c);
    if (d < best.x) { best = vec3f(d, c); }
  }
  return best.yz;
}

var<private> geo: vec3f; // what crust() last found besides height: mountains, how far into the canyon, -

// The crust at unit m: its height (sea level 0) and that height's gradient, down to detail the size of fp (rad).
fn crust(m: vec3f, fp: f32, fine: bool) -> vec4f {
  // continents
  var p = m * 1.7 + vec3f(3.1, 1.7, 5.3);
  var J = mat3x3f(1.7, 0.0, 0.0, 0.0, 1.7, 0.0, 0.0, 0.0, 1.7);
  var a = 0.5;
  var h = vec4f(-0.45, 0.0, 0.0, 0.0);
  for (var k = 0; k < 3; k++) {
    let n = noised(p);
    h += a * vec4f(n.x, n.yzw * J);
    p = ROT * p * 2.0 + 11.3;
    J = ROT * J * 2.0;
    a *= 0.5;
  }
  // the pole is open sea: the pool the storm turns over
  h = -smax(-h, vec4f(3.0 * m.y - 2.28, 0.0, 3.0, 0.0), 0.15);
  // the archipelago: an ocean basin, and in it one island for every point of 32APSK
  let A = site(vec2f(-0.49, -0.1));
  if (dot(m, A) > 0.85) {
    h = -smax(-h, vec4f(0.3 - 4.0 * (0.946 - dot(m, A)), 4.0 * A), 0.15);
    let E = normalize(vec3f(A.z, 0.0, -A.x));
    let N = cross(A, E);
    let c = 0.26 * stone(vec2f(dot(m, E), dot(m, N)) / 0.26);
    let d = m - (E * c.x + N * c.y + A * sqrt(1.0 - dot(c, c)));
    let l = length(d) * (0.6 + 0.8 * noise(m * 45.0)); // no two the same shape
    let away = d / max(length(d), 1e-5);
    h = smax(h, vec4f(-0.012 - 40.0 * max(l - 0.022, 0.0), -40.0 * step(0.022, l) * away), 0.02); // its reef
    h = smax(h, vec4f(0.1 - 7.0 * l, -7.0 * away), 0.04);
  }
  // River's places stand on land
  for (var k = 0; k < NP; k++) { h = smax(h, vec4f(0.14 - (1.0 - dot(m, PL[k])) / 0.2, PL[k] / 0.2), 0.1); }
  // the river's plateau
  let rk = u.p[9].w;
  let S = site(u.p[9].yz);
  let RE = normalize(vec3f(S.z, 0.0, -S.x));
  let RN = cross(S, RE);
  let rq = vec2f(dot(m, RE), dot(m, RN)) / max(dot(m, S), 0.1); // gnomonic, as places.ts lays the river
  let canyon = rk > 0.0 && dot(m, S) > 0.9;
  if (canyon) {
    let e = rq / vec2f(0.17, 0.08);
    h = smax(h, vec4f(0.2 * (1.0 - dot(e, e)), -0.4 * (RE * e.x / 0.17 + RN * e.y / 0.08)), 0.1);
  }
  // mountains where the plates meet; everywhere, ridges worn down where the slope above them is already steep. The sea
  // bed lies smooth under its silt.
  var mtn = 0.0;
  var det = vec4f(0.0);
  var tex = 0.0; // the same ridges, weighted toward the small: what the ground is made of
  if (h.x > -0.15) {
    mtn = smoothstep(0.45, 0.75, noise(m * 3.3 + 20.0)) * smoothstep(-0.02, 0.2, h.x);
    var D = vec3f(0.0);
    var f = 13.6;
    var ta = 0.2;
    a = 0.5;
    for (var k = 0; k < 13; k++) {
      let fade = sat(2.0 - 6.0 * f * fp);
      if (fade <= 0.0) { break; }
      let n = noised(p);
      let r = 1.0 - abs(2.0 * n.x - 1.0);
      let dr = -2.0 * sign(2.0 * n.x - 1.0) * (n.yzw * J);
      D += 2.0 * a * dr / f;
      det += a * fade / (1.0 + 0.25 * dot(D, D)) * vec4f(r * r - 0.33, 2.0 * r * dr);
      tex += ta * fade * (r * r * r * r - 0.2);
      ta *= 0.88;
      p = ROT * p * 2.0 + 11.3;
      J = ROT * J * 2.0;
      f *= 2.0;
      a *= 0.5;
    }
  }
  h += (0.09 + 0.36 * mtn) * smoothstep(-0.15, 0.0, h.x) * det;
  geo = vec3f(mtn, 0.0, tex);
  // the canyon the river cut, its floor under the water; 45.55 is half the river's run, 2.6 the middle of its wander
  if (canyon && fine && rq.x > -0.012 - 45.55 * rk && rq.x < 0.012 + 45.55 * rk && abs(rq.y - 2.6 * rk) < 9.0 * rk) {
    let c = river(rq / rk + vec2f(45.55, 0.0));
    let x = max(c.x - 0.3 + 2.5 * det.x * sat(c.x - 0.3), 0.0) / 1.2; // its banks, in terraces
    let st = sat((fract(x) - 0.4) / 0.6);
    let wall = vec4f(-0.03 + 0.076 * (floor(x) + st * st * (3.0 - 2.0 * st)), 0.076 * 6.0 * st * (1.0 - st) / (0.72 * rk) * step(0.3, c.x) * (RE * c.y + RN * c.z));
    h = -smax(-h, -wall, 0.01);
    geo.y = sat(1.5 - 0.5 * x);
  }
  return h;
}

// ---- the sky's water ---------------------------------------------------------------------------------------------
// How overcast it is over unit n: the planet's three bands of rising air, and the lows.
fn weather(n: vec3f) -> f32 {
  let y2 = n.y * n.y;
  // the lows: each winds the weather round itself by the pool's law, Φ = (K/2) ln(1 + r_c²/r²), its hemisphere's way
  var q = n;
  var low = 0.0;
  for (var k = 0; k < 6; k++) {
    let c = LOWS[k];
    let d2 = 2.0 - 2.0 * dot(n, c);
    let w = sign(c.y) * 1.3 * log(1.0 + 0.02 / (d2 + 0.002));
    q = q * cos(w) + cross(c, q) * sin(w) + c * dot(c, q) * (1.0 - cos(w));
    low += exp(-d2 / 0.04);
  }
  q = q * 2.3 + vec3f(0.0, 0.0, 0.004 * u.p[5].w);
  return (0.6 * noise(q) + 0.3 * noise(q * 2.3 + 5.0) - 0.45) * 4.0 + 0.4 + 0.6 * low + 0.4 * (1.0 - 18.0 * y2 + 48.0 * y2 * y2 - 32.0 * y2 * y2 * y2) + 2.0 * (u.p[7].z - 1.0);
}
var<private> wx: f32; // the weather where this pixel looks: it changes too slowly to ask again at every step

// The deck over unit n: the altitudes of its base and its top (no cloud where the top is not above the base), in
// detail down to fp. Fair weather is cells of convection, as many as the weather allows. Round the pole the deck is the
// storm, the plunge pool's vortex at the size of a world. Its air is drawn in along log spirals, θ + K ln φ constant,
// and its cells are noise on the cylinder (θ, ln φ), where that inflow is a slide and a turn: so they fall in along the
// arms whole, however far they wind, and are finer the nearer the eye. A clear eye; round it the wall, the tallest
// cloud there is; the overcast sloping away from it in spiral ridges; then the arms.
fn deck(n: vec3f, fp: f32) -> vec2f {
  let t = u.p[5].w;
  var cov = wx;
  let s = u.p[7].x;
  let x = acos(clamp(n.y, -1.0, 1.0)) / u.p[7].y; // from the pole, in eye radii
  let m = s * (1.0 - smoothstep(7.0, 12.0, x));
  var c = 0.0;
  var a = 0.5;
  var H = HC;
  var open = 1.0;
  if (m < 1.0) {
    var f = 12.0;
    var w = n;
    for (var k = 0; k < 4 && f * fp < 0.25; k++) {
      let v = noise(w * f + vec3f(0.0, 0.01 * t, 0.0));
      c += a * select(1.0 - abs(2.0 * v - 1.0), v, k < 2);
      w = ROT * w;
      f *= 2.8;
      a *= 0.5;
    }
    c += a;
  }
  if (m > 0.0) {
    let lx = log(max(x, 0.2));
    let th = atan2(n.z, n.x);
    let psi = th + KS * lx;
    let v = vec3f(cos(th - KS * 0.02 * t), sin(th - KS * 0.02 * t), lx + 0.02 * t); // falling in along the arms
    let big = noise(v * 1.1 + 9.0); // what bends the arms
    var cs = 0.0;
    var f = 3.0;
    var vr = ROT * v;
    a = 0.5;
    for (var k = 0; k < 4 && f * fp < 0.25 * x * u.p[7].y; k++) {
      let w = noise(vr * f + 3.7);
      cs += a * select(1.0 - abs(2.0 * w - 1.0), w, k < 2);
      vr = ROT * vr;
      f *= 2.6;
      a *= 0.5;
    }
    cs += a;
    let arms = 0.5 + 0.5 * cos(2.0 * psi + 5.0 * big);
    let cdo = 1.0 - smoothstep(2.2, 4.5, x);
    cov = mix(cov, max(2.0 * cdo, (1.2 * arms * arms + 0.15) * (1.0 - 0.4 * smoothstep(4.0, 11.0, x)) + cdo), m);
    c = mix(c, cs, m);
    H = mix(HC, (0.0045 + 0.0075 * exp(-max(x - 1.4, 0.0) / 2.5) + 0.012 * exp(-(x - 1.4) * (x - 1.4) / 0.15)) * (0.85 + 0.3 * cos(4.0 * psi + 9.0 * big)), m);
    open = mix(1.0, smoothstep(0.92, 1.3, x + 0.25 * (cs - 0.5)), s);
  }
  c = 1.7 * c - 0.35;
  return vec2f(CB, CB + H * sat(1.0 - (1.0 - c) / max(cov, 1e-3)) * (0.35 + 0.65 * sat(cov)) * open);
}

fn hg(mu: f32, g: f32) -> f32 { return (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * mu, 1.5); }

struct Sky { light: vec3f, through: f32, t: f32 }

// The deck along ro + t rd, t in [t0, t1]: stepped down onto its top the way a height field is, lit where it is met,
// then passed through.
fn clouds(ro: vec3f, rd: vec3f, t0: f32, t1: f32, L: vec3f) -> Sky {
  var s = Sky(vec3f(0.0), 1.0, t1);
  var t = t0;
  var shade = vec3f(0.0);
  var lod = 0.0;
  let mu = dot(rd, L);
  let ph = 0.4 + 0.6 * mix(hg(mu, -0.2), hg(mu, 0.75), 0.5); // forward: the silver lining
  for (var i = 0; i < 28 && t < t1 && s.through > 0.03; i++) {
    let p = ro + rd * t;
    let r = length(p);
    let n = p / r;
    let fall = -dot(rd, n);
    if (r - 1.0 < CB && fall > 0.0) { break; }
    let fp = cone() * t;
    let d = deck(n, max(fp, lod));
    let gap = max(r - 1.0 - d.y, d.x - r + 1.0);
    if (gap > 0.0) {
      // down onto its top, or, where a close look finds this column has none, past its base; and never far sideways
      // in one stride. From far off its broad shape will do.
      let down = select(0.85 * gap, r - 1.0 - CB + 1e-4, d.y <= d.x && lod <= fp) / max(abs(fall), 0.05);
      lod = 0.25 * gap;
      t += max(min(down, 0.004 / sqrt(max(1.0 - fall * fall, 1e-6))), 2.0 * fp) + 1e-5;
      continue;
    }
    lod = 0.0;
    if (s.t == t1) {
      s.t = t;
      // the sun on it: Lambert on the slope its top turns to the sun, dimmed by whatever cloud the ray meets on its way
      // out: a look close by, for the slope and the cell next door, and one far off, for the towers
      let ms = dot(n, L);
      let sz = sqrt(max(1.0 - ms * ms, 0.0));
      let near = max(0.0012, 3.0 * fp);
      let d1 = deck(normalize(n + normalize(L - n * ms + 1e-5) * near), 2.0 * fp);
      let g = 2.5 * (d1.y - d.y) / near; // relief, as the light sees it
      let lam = (ms - g * sz) / sqrt(1.0 + g * g);
      let far = p + L * 0.5 * min((CB + HW - r + 1.0) / max(ms, 0.2), 0.12);
      let d2 = deck(normalize(far), 0.004);
      let od = SIG * (sat((d1.y - (r - 1.0 + near * ms / max(sz, 0.05))) / SOFT) * near / max(sz, 0.3)
             + sat(min(d2.y - length(far) + 1.0, length(far) - 1.0 - d2.x) / SOFT) * length(far - p));
      shade = SUN * (exp(-sunward(p, L)) * (0.1 * ph * exp(-od) + 0.4 * (d.y - d.x) / (d.y - d.x + 0.0025) * sat(lam) * exp(-0.2 * od)) + vec3f(0.035, 0.055, 0.09) * smoothstep(-0.2, 0.3, ms));
    }
    // through it, as one column: thickening in from its faces
    let ds = max(0.0007, 2.0 * fp);
    for (var j = 0; j < 6; j++) {
      let alt = length(ro + rd * t) - 1.0;
      let k = 1.0 - exp(-SIG * sat(min(d.y - alt, alt - d.x) / SOFT) * ds);
      s.light += s.through * k * shade * (0.75 + 0.25 * sat((alt - CB) / HC));
      s.through *= 1.0 - k;
      t += ds;
    }
  }
  return s;
}

// ---- the ground ----------------------------------------------------------------------------------------------------
fn ground(m: vec3f, rd: vec3f, L: vec3f, t: f32) -> vec3f {
  let mu = dot(m, L);
  let cv = max(dot(-rd, m), 0.04);
  let fp = cone() * t / sqrt(cv);
  let c = crust(m, fp, true);
  let G = geo;
  let gt = c.yzw - m * dot(m, c.yzw);
  var sun = SUN * exp(-sunward(m, L));
  let sky = SUN * vec3f(0.035, 0.055, 0.09) * smoothstep(-0.2, 0.3, mu);
  // the deck's shadow, where the sun's ray leaves the low cloud and the high
  let storm = m.y > cos(14.0 * u.p[7].y); // only there does the deck stand that high
  if (mu > -0.05 && (wx > 0.1 || storm)) {
    for (var j = 0; j < select(1, 2, storm); j++) {
      let alt = select(0.012, CB, j == 0);
      let d = deck(normalize(m + L * (sqrt(mu * mu + 2.0 * alt) - mu)), 2.0 * fp + 0.001);
      sun *= exp(-SIG * 0.5 * max(d.y - alt, 0.0));
    }
  }
  var col: vec3f;
  if (c.x < 0.0) {
    // the sea. Wind roughens it: Cox and Munk's slopes, σ² = 0.003 + 0.00512 U, so the glint is a small hard sun on calm
    // water and a wide soft one where it blows; whitecaps as Monahan counted them. Under the surface, Beer–Lambert: sand
    // through twice the depth of water, red gone first.
    let x = acos(clamp(m.y, -1.0, 1.0)) / u.p[7].y;
    let U = max(1.0 + 12.0 * pow(noise(m * 5.0 + 9.0), 2.0), u.p[7].x * 30.0 * select(pow(x, -0.6), x * x * x, x < 1.0));
    let s2 = 0.003 + 0.00512 * U;
    let H = normalize(L - rd);
    let c2 = dot(m, H) * dot(m, H);
    let F = 0.02 + 0.98 * pow(1.0 - max(dot(-rd, H), 0.0), 5.0);
    let glint = F * exp(-(1.0 - c2) / (c2 * s2)) / (PI * s2 * 4.0 * cv * c2 * c2) * step(0.0, mu);
    var alb = mix(vec3f(0.004, 0.02, 0.05), vec3f(0.42, 0.38, 0.27), exp(c.x * vec3f(500.0, 70.0, 25.0)));
    alb = mix(alb, vec3f(0.6), min(2.95e-6 * pow(U, 3.52), 0.4));
    let Fv = 0.02 + 0.98 * pow(1.0 - cv, 5.0);
    col = alb * (sun * max(mu, 0.0) + sky) / PI + sun * glint + Fv * sky / PI;
  } else {
    let N = normalize(m - ZS * gt);
    var lit = max(dot(N, L), 0.0);
    // long shadows near the terminator: the sun's ray, followed out over the relief
    if (mu < 0.3 && mu > -0.05) {
      let Lt = normalize(L - m * mu);
      var sh = 1.0;
      for (var j = 0; j < 3; j++) {
        let s = 0.008 * exp2(1.5 * f32(j));
        let hj = crust(normalize(m + Lt * s), 0.006, false).x;
        sh = min(sh, sat(0.5 + ((c.x - hj) * ZP + s * mu / sqrt(1.0 - mu * mu) + 0.5 * s * s) / (0.15 * s)));
      }
      lit *= sh;
    }
    let slope = ZS * length(gt);
    let y2 = m.y * m.y;
    let wet = 0.5 * noise(m * 2.7 + 40.0) + 0.3 * noise(m * 9.0 + 3.0) + 0.2 * (1.0 - 18.0 * y2 + 48.0 * y2 * y2 - 32.0 * y2 * y2 * y2) + 0.25 - 0.6 * c.x + 0.3 * smoothstep(0.12, 0.0, c.x) - 0.6 * G.z; // water gathers in the valleys
    let cold = y2 + 1.3 * c.x + 0.15 * G.z;
    var alb = mix(mix(vec3f(0.4, 0.29, 0.16), vec3f(0.3, 0.16, 0.08), smoothstep(0.3, 0.7, noise(m * 6.0 + 60.0))), mix(vec3f(0.13, 0.13, 0.05), vec3f(0.02, 0.06, 0.015), smoothstep(0.5, 0.65, wet)), smoothstep(0.3, 0.45, wet));
    alb = mix(alb, vec3f(0.13, 0.11, 0.08), smoothstep(0.45, 0.7, cold));
    alb = mix(alb, vec3f(0.17, 0.145, 0.125), smoothstep(0.4, 1.0, slope));
    alb = mix(alb, vec3f(0.42, 0.37, 0.26), smoothstep(0.006, 0.0, c.x + 0.01 * G.z));
    alb = mix(alb, mix(vec3f(0.42, 0.2, 0.1), vec3f(0.6, 0.45, 0.3), 0.5 + 0.5 * sin(c.x * 260.0)), G.y);
    alb = mix(alb, vec3f(0.85, 0.88, 0.93), smoothstep(0.7, 0.78, cold + 0.12 * G.x) * (1.0 - 0.6 * smoothstep(0.7, 1.4, slope)));
    alb *= 1.0 + 0.8 * G.z;
    col = alb * (sun * lit + sky * (0.6 + 0.4 * dot(N, m))) / PI;
    // the night side's own light: River's places, and the roads between towns
    let night = smoothstep(0.02, -0.12, mu) * u.p[8].y;
    if (night > 0.0) {
      var pop = 0.6 * smoothstep(0.3, 0.5, noise(m * 17.0 + 80.0) * noise(m * 41.0)) * smoothstep(0.25, 0.05, c.x); // towns, in the lowlands
      for (var k = 0; k < NP; k++) { pop += exp((dot(m, PL[k]) - 1.0) / 0.003); }
      let roads = pow(1.0 - abs(2.0 * noise(m * 110.0) - 1.0), 8.0);
      col += night * pop * pop * (0.4 * roads + 4.0 * pow(noise(m * 420.0), 5.0)) * vec3f(1.0, 0.6, 0.27) * 9.0;
    }
  }
  return col;
}

// ---- the aurora ----------------------------------------------------------------------------------------------------
// The ovals are cones about the dipole, so the ray meets each curtain where a quadratic says; a fold moves that
// meeting along the ray. Oxygen's green (557.7 nm) low in the curtain, its red (630 nm) above, nitrogen's violet at the hem.
fn aurora(ro: vec3f, rd: vec3f, b: f32, L: vec3f) -> vec3f {
  let lvl = u.p[7].w;
  if (lvl <= 0.0) { return vec3f(0.0); }
  let g = normalize(vec3f(0.14, 1.0, 0.09));
  let e1 = normalize(cross(g, vec3f(1.0, 0.0, 0.0)));
  let e2 = cross(g, e1);
  let time = u.p[5].w;
  var c = vec3f(0.0);
  for (var j = 0; j < 2; j++) {
    let c0 = cos(0.36 + 0.05 * f32(j));
    let A = dot(rd, g) * dot(rd, g) - c0 * c0;
    let B = dot(ro, g) * dot(rd, g) - c0 * c0 * dot(ro, rd);
    let C = dot(ro, g) * dot(ro, g) - c0 * c0 * dot(ro, ro);
    let h = B * B - A * C;
    if (h < 0.0) { continue; }
    for (var k = 0; k < 2; k++) {
      var t = (-B + select(-1.0, 1.0, k == 0) * sqrt(h)) / A;
      var p = ro + rd * t;
      let ct = dot(p, g) / length(p);
      let az = atan2(dot(p, e2), dot(p, e1)) * sign(ct) + 3.0 * f32(j);
      let w = (dot(rd, g) - ct * dot(p, rd) / length(p)) / (length(p) * sqrt(1.0 - ct * ct)); // the colatitude's rate along the ray
      t += clamp((0.025 * sin(5.0 * az + 0.3 * time) + 0.01 * sin(17.0 * az - 0.7 * time)) / w, -0.08, 0.08) * sign(ct);
      p = ro + rd * t;
      let x = (length(p) - 1.012) / 0.03;
      if (t < 0.0 || t > b || x < 0.0) { continue; }
      let rays = (0.3 + noise(vec3f(az * 3.0, 0.2 * time, 4.0))) * (0.5 + noise(vec3f(az * 30.0, 0.5 * time, 9.0)));
      let glow = vec3f(0.1, 1.0, 0.3) * exp(-2.5 * x) * sat(12.0 * x) + vec3f(1.0, 0.08, 0.12) * 0.2 * smoothstep(0.1, 0.6, x) * exp(-1.5 * x) + vec3f(0.45, 0.15, 1.0) * exp(-30.0 * x);
      c += glow * rays * smoothstep(0.12, -0.12, dot(normalize(p), L)) * min(0.004 / abs(w), 0.06);
    }
  }
  // and the diffuse glow the curtains hang in
  let sh = ball(ro, rd, 1.02);
  let t = select(sh.x, sh.y, sh.x < 0.0);
  if (t > 0.0 && t < b) {
    let p = (ro + rd * t) / 1.02;
    let w = (acos(abs(dot(p, g))) - 0.385) / 0.06;
    c += vec3f(0.1, 1.0, 0.3) * 0.0025 * exp(-w * w) * smoothstep(0.12, -0.12, dot(p, L));
  }
  return c * lvl * 150.0;
}

fn field(q: vec2f) -> vec3f {
  text = sat(u.p[9].x);
  let R = u.p[4].w;
  let ro = local(-u.p[4].xyz / R);
  let rd = local(ray(q));
  let L = local(u.p[5].xyz);
  NP = i32(u.p[8].z);
  for (var k = 0; k < NP; k++) {
    let v = u.p[10 + k / 2];
    PL[k] = site(select(v.xy, v.zw, k % 2 == 1));
  }
  let top = ball(ro, rd, TOP);
  let g = ball(ro, rd, 1.0);
  let hit = g.x > 0.0;
  // the sun's disc, limb-darkened
  let sd = 1.0 - (1.0 - dot(rd, L)) / 1.08e-5;
  var col = select(vec3f(0.0), SUN / 6.8e-5 * (0.4 + 0.6 * sqrt(max(sd, 0.0))), sd > 0.0 && !hit);
  if (top.y > 0.0) {
    let a = max(top.x, 0.0);
    let b = select(top.y, g.x, hit);
    var sky = Sky(vec3f(0.0), 1.0, b);
    // the deck's shell, as tall as the storm's wall only where the ray passes the storm
    var sh = ball(ro, rd, 1.0 + CB + HW + 0.002);
    let t0 = max(sh.x, 0.0);
    let t1 = min(sh.y, b);
    let calm = max(max(normalize(ro + rd * t0).y, normalize(ro + rd * t1).y), normalize(ro + rd * 0.5 * (t0 + t1)).y) < cos(14.0 * u.p[7].y);
    if (calm) { sh = ball(ro, rd, 1.0 + CB + HC + 0.0005); }
    if (sh.y > 0.0) {
      wx = weather(normalize(ro + rd * max(sh.x, 0.0)));
      if (wx > 0.1 || !calm) { sky = clouds(ro, rd, max(sh.x, 0.0), min(sh.y, b), L); } // a clear sky needs no search
    }
    if (hit) {
      dist = g.x * R;
      if (sky.through > 0.03) { col = ground(normalize(ro + rd * g.x), rd, L, g.x); }
    }
    if (sky.through < 0.5) { dist = sky.t * R; }
    let A = air(ro, rd, a, b, L, sky.t, sky.through, select(12, 8, hit));
    col = A.light + A.front * sky.light + sky.through * A.through * col;
    if (min(dot(ro + rd * a, L), dot(ro + rd * b, L)) < 0.2) { col += aurora(ro, rd, b, L); } // a night thing, above the weather
  }
  return min(col * u.p[8].x, vec3f(4e3));
}

// River's planet (src/world/planet.ts), in units of its radius and in its own frame: the pole is +y, the eye at the
// origin. dist is the ray's length to the ground, or to cloud once cloud hides it.
//
// The air: single scattering, Rayleigh and Mie, with Earth's optical depths over a scale height of 0.008 R, the sun's
//   path through it Chapman's function in closed form, so twilight, the terminator and the lit rim need no ground test.
// The crust: continents of value noise with its gradient, ridges worn where the slope is steep, octaves down to the
//   pixel's footprint. Seen from near it stands: the ray is marched against the crust's own height, so ranges hide what
//   is behind them and the low sun lays their shadows out. On it, what is River's: the valley's meander θ(s) cut as a
//   canyon under the beam's own river, its banks cut steep outside each bend and laid down gently inside, the pool at
//   its middle a lake; an archipelago with an island for every point of 32APSK; land raised under every place the
//   scene names, and levelled there, since what stands on it (mesh.ts) stands at r = 1.
// The sea: Cox and Munk's wind-roughened glint, Monahan's whitecaps, Beer–Lambert over the shelves.
// The sky's water: a deck of convection cells, marched as a height field, lit by Lambert on its own relief and shadowed by
//   itself; and round the pole the plunge pool's vortex (acts/wrap.ts) as a storm: log-spiral arms, a clear eye, its wall,
//   the wall's anvil spread under the stratosphere and blown out the other way round. Over River's places it is kept
//   clear. From low down its shadow is followed through the air as well, so the sun comes between the clouds in shafts.
// The night: the places' own light, and the auroral ovals as cones about the dipole.
// Beyond: the fixed stars, which keep their places by the sun; the galaxy; the dust of the planets' plane, lit: the
//   zodiacal light, and the gegenschein opposite the sun.
//
// p[4] centre (from the eye), radius   p[5] toward the sun, t   p[6] the place marked (which, how much), -, -
// p[7] the storm, its eye's radius (rad), cloud cover, aurora
// p[8] exposure, the night side's own light, how many places (up to 8), the arrival's (its tower's fade: arrive.wgsl)
// p[9] the lens's blur at infinity (px; 0 a pinhole), the river's place (lat, lon; rad), its radii per unit of s (0: no river)
// p[10..13] the places, two a slot (lat, lon, lat, lon; rad): each stands on land and is lit at night
// p[14] (the world's only) BLEPS's main camera's footprint: where it falls (lat, lon), its picture's up (rad east of
//   north), and −its half-width (radii; 0 or more, none)
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
const KS = 4.0;                       // the storm's arms: radians turned per e-fold drawn in, K = Γ/Q, pitch atan(1/K)
const ZS = 0.09;                      // relief, as the light sees it from orbit
const ZD = 0.025;                     // how the land stands: at ZD h (0.4 + 1.5 h) radii, plains under the cloud, ranges through it
const ZT = 0.022;                     // nothing stands taller
const FAR = vec2f(0.7, 1.5);          // it stands in full nearer than this, and not at all past that
const HA = 0.021;                     // how far over the cloud base the wall's towers meet the stratosphere, and spread
const TALL = 7.0;                     // past this many eye radii from the pole the storm stands no taller than fair weather
const POOL = vec3f(45.88, 5.74, 15.0); // the river's middle (places.ts), where the valley's pool lies, and the lake's radius, in s
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
// Its value alone, in one tap (the filter's own weights, 8 bits of them, bent to the same quintic).
fn noise5(x: vec3f) -> f32 {
  let i = floor(x);
  let f = x - i;
  let w = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  let s = textureSampleLevel(data, smp, (tile(i) + w.xy + 0.5) / 256.0, 0.0).gr;
  return mix(s.x, s.y, w.z);
}
// A smooth maximum of two heights that carry their gradients (.yzw), exact for both.
fn smax(a: vec4f, b: vec4f, k: f32) -> vec4f {
  let t = sat(0.5 + 0.5 * (a.x - b.x) / k);
  return mix(b, a, t) + vec4f(k * t * (1.0 - t), 0.0, 0.0, 0.0);
}

// The planet's own frame: it holds still, and its sun goes round it (planet.ts), so the world's is the planet's.
fn local(v: vec3f) -> vec3f { return v; }
fn site(ll: vec2f) -> vec3f { return vec3f(cos(ll.x) * sin(ll.y), sin(ll.x), cos(ll.x) * cos(ll.y)); }
var<private> PL: array<vec3f, 10>; // River's places
var<private> NP: i32;
var<private> RV: i32;     // which of them is the river's
var<private> RS: vec3f;   // the river's place, its east and its north
var<private> RE: vec3f;
var<private> RN: vec3f;
// The place nearest unit m: 1 − the cosine of the angle to it, and which it is.
fn nearest(m: vec3f) -> vec2f {
  var d = vec2f(-1.0);
  for (var k = 0; k < NP; k++) {
    let c = dot(m, PL[k]);
    if (c > d.x) { d = vec2f(c, f32(k)); }
  }
  return vec2f(1.0 - d.x, d.y);
}

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
var<private> wx: f32;     // the weather where this pixel looks: it changes too slowly to ask again at every step
var<private> clear = 1.0; // and how much of it is left there (cleared)
var<private> jit = 0.5;   // where in its step each sample of the air is taken: the same for a pixel, different for its neighbour

// Single scattering along ro + t rd, t in [a, b], n steps crowded toward the ray's lowest point. Something stands in
// the way at `cut` and lets `thr` through: `front` is what the air before it passes, and the light from behind it is dimmed.
// `rays`: how much the deck's shadow counts in the air under it. Seen from low down, that is the sun in shafts.
fn air(ro: vec3f, rd: vec3f, a: f32, b: f32, L: vec3f, cut: f32, thr: f32, n: i32, rays: f32) -> Air {
  let mu = dot(rd, L);
  let pr = 3.0 / (16.0 * PI) * (1.0 + mu * mu);
  let g = 0.76;
  let pm = 3.0 / (8.0 * PI) * (1.0 - g * g) * (1.0 + mu * mu) / ((2.0 + g * g) * pow(1.0 + g * g - 2.0 * g * mu, 1.5));
  let tm = clamp(-dot(ro, rd), a, b);
  let f = clamp((tm - a) / max(b - a, 1e-9), 1e-4, 1.0 - 1e-4); // (where the ray is lowest, as a share of the way: never quite an end, or a step divides by zero)
  var od = vec2f(0.0);
  var A = Air(vec3f(0.0), vec3f(1.0), vec3f(1.0));
  var seen = 1.0;
  for (var i = 0; i < n; i++) {
    let s = (f32(i) + jit) / f32(n);
    let k = select((s - f) / (1.0 - f), 1.0 - s / f, s < f);
    let t = select(tm + (b - tm) * k * k, tm - (tm - a) * k * k, s < f);
    let p = ro + rd * t;
    let d = exp((1.0 - length(p)) / vec2f(HR, HM)) * 2.0 * k * (b - a) / f32(n);
    od += 0.5 * d;
    let tr = exp(-(BR * od.x + 1.1 * BM * od.y));
    od += 0.5 * d;
    if (t > cut && seen == 1.0) { seen = thr; A.front = tr; }
    var lit = seen;
    if (rays > 0.0 && dot(p, p) < 1.019) { lit *= mix(1.0, veil(p, L, 0.007), rays); }
    A.light += lit * tr * exp(-sunward(p, L)) * (d.x * BR * pr + d.y * BM * pm);
  }
  A.light *= SUN;
  A.through = exp(-(BR * od.x + 1.1 * BM * od.y));
  if (seen == 1.0) { A.front = A.through; }
  return A;
}

// ---- the crust -----------------------------------------------------------------------------------------------------
// The river: the valley's meander (acts/valley.ts), its heading θ(s), laid out as z = ∫ e^{iθ} ds over s in [0, 120]
// the way places.ts lays it: by Euler's rule a quarter at a time, which is the true curve half a step late. Two-point
// Gauss steps of 2, kept for the pixel; then the nearest node, and the curve's own Taylor series about it. Returns the
// distance from q, in units of s, the unit vector away from the water, and s there.
fn theta(s: f32) -> vec3f {
  let a = TAU * (s - 0.125) / 13.0;
  let b = TAU * (s - 0.125) / 41.0 + 1.1;
  let w = vec2f(0.85 * TAU / 13.0, 0.55 * TAU / 41.0);
  return vec3f(0.85 * sin(a) + 0.55 * sin(b), w.x * cos(a) + w.y * cos(b), -w.x * w.x / 0.85 * sin(a) - w.y * w.y / 0.55 * sin(b));
}
const RZ = array<vec2f, 61>(
  vec2f(0.000, 0.000), vec2f(1.282, 1.466), vec2f(1.717, 3.416), vec2f(2.601, 5.175), vec2f(4.443, 5.765), vec2f(6.269, 4.993),
  vec2f(8.020, 4.040), vec2f(9.986, 4.016), vec2f(11.719, 4.995), vec2f(13.467, 5.942), vec2f(15.374, 5.617), vec2f(16.423, 3.962),
  vec2f(16.841, 2.007), vec2f(17.963, 0.405), vec2f(19.887, 0.126), vec2f(21.702, 0.952), vec2f(23.575, 1.611), vec2f(25.491, 1.170),
  vec2f(27.073, -0.051), vec2f(28.848, -0.913), vec2f(30.670, -0.281), vec2f(31.517, 1.500), vec2f(32.015, 3.433), vec2f(33.390, 4.812),
  vec2f(35.348, 4.801), vec2f(37.183, 4.004), vec2f(39.136, 3.716), vec2f(40.907, 4.584), vec2f(42.361, 5.958), vec2f(44.185, 6.663),
  vec2f(45.878, 5.740), vec2f(46.584, 3.884), vec2f(47.251, 2.011), vec2f(48.860, 0.919), vec2f(50.817, 1.173), vec2f(52.696, 1.853),
  vec2f(54.658, 1.719), vec2f(56.217, 0.496), vec2f(57.592, -0.951), vec2f(59.469, -1.437), vec2f(61.006, -0.259), vec2f(61.650, 1.629),
  vec2f(62.556, 3.387), vec2f(64.350, 4.146), vec2f(66.291, 3.716), vec2f(68.224, 3.239), vec2f(70.101, 3.811), vec2f(71.423, 5.298),
  vec2f(72.782, 6.747), vec2f(74.696, 6.966), vec2f(76.071, 5.585), vec2f(76.744, 3.702), vec2f(77.929, 2.131), vec2f(79.843, 1.725),
  vec2f(81.770, 2.251), vec2f(83.740, 2.446), vec2f(85.439, 1.464), vec2f(86.544, -0.199), vec2f(87.948, -1.583), vec2f(89.868, -1.509),
  vec2f(91.104, 0.018));
var<private> RT: vec3f; // the river's tangent and its curvature, where river() last found it nearest
fn river(q: vec2f) -> vec4f {
  // x runs on with s (|θ| < π/2), 1.518 a node and never 2 from that: so the nearest node is one of these
  let i0 = clamp(i32(q.x / 1.518) - 7, 0, 46);
  var near = vec2f(1e9, 0.0); // distance², node
  for (var i = i0; i <= i0 + 14; i++) {
    let d = q - RZ[i];
    if (dot(d, d) < near.x) { near = vec2f(dot(d, d), f32(i)); }
  }
  let th = theta(2.0 * near.y);
  let T = vec2f(cos(th.x), sin(th.x));
  let N = vec2f(-T.y, T.x);
  let r = q - RZ[i32(near.y)];
  let d = clamp(dot(r, T) / (1.0 - th.y * dot(r, N)), -1.2, 1.2);
  let v = r - T * (d - th.y * th.y * d * d * d / 6.0) - N * (th.y * d * d / 2.0 + th.z * d * d * d / 6.0);
  let l = max(length(v), 1e-6);
  RT = vec3f(normalize(T + N * (th.y * d + 0.5 * th.z * d * d)), th.y + th.z * d);
  return vec4f(l, v / l, 2.0 * near.y + d);
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

var<private> geo: vec3f;  // what crust() last found besides height: mountains, how far the river has cut in, what the ground is made of
var<private> rise: vec4f; // how high the ground stands there, in radii, with that height's gradient
var<private> by: vec2f;   // and the place nearest it (nearest)

// The archipelago: an ocean basin 28° south, 6° west, and in it one island for every point of 32APSK.
const ISLES = vec3f(-0.0881, -0.4706, 0.8779);
fn isles(m: vec3f, h0: vec4f) -> vec4f {
  let E = vec3f(0.995, 0.0, 0.0998); // its east and north
  let N = vec3f(-0.047, 0.8823, 0.4682);
  var h = -smax(-h0, vec4f(0.3 - 4.0 * (0.946 - dot(m, ISLES)), 4.0 * ISLES), 0.15);
  let c = 0.26 * stone(vec2f(dot(m, E), dot(m, N)) / 0.26);
  let d = m - (E * c.x + N * c.y + ISLES * sqrt(1.0 - dot(c, c)));
  let l = length(d) * (0.6 + 0.8 * noise(m * 45.0)); // no two the same shape
  let away = d / max(length(d), 1e-5);
  h = smax(h, vec4f(-0.012 - 40.0 * max(l - 0.022, 0.0), -40.0 * step(0.022, l) * away), 0.02); // its reef
  return smax(h, vec4f(0.1 - 7.0 * l, -7.0 * away), 0.04);
}

// The canyon the river cut, and the pool at its middle, a lake: how high the rock still stands at q (in s, from the
// river's start), and that height's gradient in q. How far a point is from the water says it, in benches: a soft bed
// worn back to a shelf, the hard one over it left a cliff, no two alike. Water runs fastest round the outside of a
// bend and undercuts it, and slows inside and lays its sand down: so the cliff stands close over one bank and far
// back from the other. Side streams have cut their ravines back from it.
fn gorge(q: vec2f) -> vec3f {
  let dq = q - POOL.xy;
  var x = length(dq) - POOL.z; // how far from the water
  var off = dq / max(length(dq), 1e-4); // which way that is, and which way is along the shore
  var tang = vec2f(-off.y, off.x);
  var along = 0.0;
  var bend = 0.0;
  if (abs(x) < 13.0) {
    let ang = atan2(dq.y, dq.x);
    x -= 0.9 * sin(3.0 * ang + 1.0) + 0.5 * sin(7.0 * ang);
    along = ang * POOL.z;
  }
  if (q.x > -12.0 && q.x < 103.0 && abs(q.y - 2.6) < 15.0) {
    let c = river(q);
    if (c.x - 0.3 < x) {
      tang = RT.xy;
      x = c.x - 0.3;
      off = c.yz;
      along = c.w;
      bend = RT.z * (off.y * tang.x - off.x * tang.y); // the curvature, signed: + on the inside of the bend
    }
  }
  if (x <= 0.0) { return vec3f(max(0.001 + 0.03 * x, -0.1), 0.03 * off * step(-3.3, x)); } // the bed
  if (x > 12.0) { return vec3f(1.0, 0.0, 0.0); }
  let wide = clamp(1.0 + 2.2 * bend, 0.6, 1.6);
  let n = noised(vec3f(0.8 * along, 0.15 * x, 5.0));
  let g = 1.0 - abs(2.0 * n.x - 1.0); // a ravine where this is 1
  let dg = -2.0 * sign(2.0 * n.x - 1.0) * vec2f(0.8 * n.y, 0.15 * n.z);
  let k = 1.6 * sat(x / 2.5);
  let xx = x / wide - k * g * g;
  let dx = off * (1.0 / wide - 0.64 * step(x, 2.5) * g * g - 2.0 * k * g * dg.y) - tang * 2.0 * k * g * dg.x;
  let y0 = max(xx, 0.0) / 1.25;
  let y = y0 + 0.22 * sin(2.4 * y0 + 1.3);
  let f = fract(y);
  let st = sat((f - 0.42) / 0.26);
  let dT = (0.15 + 0.85 * 6.0 * st * (1.0 - st) / 0.26) * (1.0 + 0.528 * cos(2.4 * y0 + 1.3)) / 1.25;
  return vec3f(0.001 + 0.085 * (floor(y) + 0.15 * f + 0.85 * st * st * (3.0 - 2.0 * st)), 0.085 * dT * step(0.0, xx) * dx);
}

// How far round each place the land is levelled for what stands there, and how far the sky is kept clear over it (rad),
// in the order planet.ts sends the places (places.ts's, those on land): the launch, the valley, the receiver, the
// lighthouse, the bench, the glasses, the hearts, the station. The hearts stand in the weather, their tops through the cloud.
const FLAT = array<vec2f, 8>(vec2f(0.12, 0.16), vec2f(0.0, 0.2), vec2f(0.09, 0.13), vec2f(0.11, 0.16), vec2f(0.08, 0.13), vec2f(0.12, 0.16), vec2f(0.04, 0.0), vec2f(0.1, 0.14));
fn flat(pl: vec2f) -> vec2f { return FLAT[min(u32(max(pl.y, 0.0)), 7u)]; }

// How high land of height h stands, in radii: plains under the cloud, ranges through it. Near a place (nearest) it
// is level as far out as it needs, the hills standing back from it, since what stands there (mesh.ts) stands at
// r = 1; all but the river's own, which is its canyon. (pl.x is 1 − cos of the angle, near enough half its square.)
fn level(pl: vec2f) -> f32 {
  let r = flat(pl).x;
  return select(smoothstep(0.5 * r * r, 0.5 * (1.5 * r + 0.04) * (1.5 * r + 0.04), pl.x), 1.0, i32(pl.y) == RV);
}
fn stand(h: f32, pl: vec2f) -> f32 {
  let up = max(h, 0.0);
  return min(level(pl) * ZD * up * (0.4 + 1.5 * up), ZT);
}

// The crust at unit m: its height (sea level 0) and that height's gradient, down to detail the size of fp (rad).
fn crust(m: vec3f, fp: f32) -> vec4f {
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
  if (dot(m, ISLES) > 0.85) { h = isles(m, h); }
  // River's places stand on land
  let pl = nearest(m);
  h = smax(h, vec4f(0.14 - pl.x / 0.2, PL[i32(max(pl.y, 0.0))] / 0.2), 0.1); // (no places: pl.x is 2, and nothing is raised)
  // the river's plateau
  let rk = u.p[9].w;
  let rq = vec2f(dot(m, RE), dot(m, RN)) / max(dot(m, RS), 0.1); // gnomonic, as places.ts lays the river
  let canyon = rk > 0.0 && dot(m, RS) > 0.9;
  if (canyon) {
    let e = rq / vec2f(0.17, 0.08);
    h = smax(h, vec4f(0.34 * (1.0 - dot(e, e)), -0.68 * (RE * e.x / 0.17 + RN * e.y / 0.08)), 0.1);
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
  if (canyon) {
    let w = gorge(rq / rk + vec2f(45.55, 0.0)); // 45.55: half the river's run
    let was = h.x;
    h = -smax(-h, -vec4f(w.x, (RE * w.y + RN * w.z) / rk), 0.008);
    geo.y = smoothstep(0.0, 0.04, was - h.x);
  }
  rise = vec4f(stand(h.x, pl), level(pl) * ZD * (0.4 + 3.0 * max(h.x, 0.0)) * step(0.0, h.x) * h.yzw);
  by = pl;
  return h;
}

var<private> crust0: f32; // the crust's own height where lay() last looked: under 0, the sea
// The same, bare: how high the ground stands at m and nothing else (rise.x, no gradient, nothing for the painter), for
// the march and the shadows, which ask many times a pixel. Line for line crust(): change them together. The slope the
// ridges are worn by is kept in each octave's own frame, so no Jacobian is carried; `cut`: the canyon as well, which
// only lowers the land, so from well above it need not be asked.
fn lay(m: vec3f, fp: f32, cut: bool) -> f32 {
  var p = m * 1.7 + vec3f(3.1, 1.7, 5.3);
  var a = 0.5;
  var h = -0.45;
  for (var k = 0; k < 3; k++) {
    h += a * noise5(p);
    p = ROT * p * 2.0 + 11.3;
    a *= 0.5;
  }
  h = -smax(vec4f(-h, 0.0, 0.0, 0.0), vec4f(3.0 * m.y - 2.28, 0.0, 0.0, 0.0), 0.15).x;
  if (dot(m, ISLES) > 0.85) { h = isles(m, vec4f(h, 0.0, 0.0, 0.0)).x; }
  let pl = nearest(m);
  h = smax(vec4f(h, 0.0, 0.0, 0.0), vec4f(0.14 - pl.x / 0.2, 0.0, 0.0, 0.0), 0.1).x;
  let rk = u.p[9].w;
  let rq = vec2f(dot(m, RE), dot(m, RN)) / max(dot(m, RS), 0.1);
  let canyon = rk > 0.0 && dot(m, RS) > 0.9;
  if (canyon) {
    let e = rq / vec2f(0.17, 0.08);
    h = smax(vec4f(h, 0.0, 0.0, 0.0), vec4f(0.34 * (1.0 - dot(e, e)), 0.0, 0.0, 0.0), 0.1).x;
  }
  var det = 0.0;
  var mtn = 0.0;
  if (h > -0.15) {
    mtn = smoothstep(0.45, 0.75, noise(m * 3.3 + 20.0)) * smoothstep(-0.02, 0.2, h);
    var D = vec3f(0.0);
    var f = 13.6;
    a = 0.5;
    for (var k = 0; k < 13; k++) {
      let fade = sat(2.0 - 6.0 * f * fp);
      if (fade <= 0.0) { break; }
      let n = noised(p);
      let r = 1.0 - abs(2.0 * n.x - 1.0);
      D += -4.0 * a * sign(2.0 * n.x - 1.0) * n.yzw;
      det += a * fade / (1.0 + 0.25 * dot(D, D)) * (r * r - 0.33);
      p = ROT * p * 2.0 + 11.3;
      D = ROT * D;
      f *= 2.0;
      a *= 0.5;
    }
  }
  h += (0.09 + 0.36 * mtn) * smoothstep(-0.15, 0.0, h) * det;
  if (canyon && cut) { h = -smax(vec4f(-h, 0.0, 0.0, 0.0), vec4f(-gorge(rq / rk + vec2f(45.55, 0.0)).x, 0.0, 0.0, 0.0), 0.008).x; }
  crust0 = h;
  return stand(h, pl);
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
// Over each of River's places the sky is kept clear, so what stands there is seen: as far out as FLAT says, less or
// more by the bearing, then the weather coming back. How much of it there is over unit n, whose nearest place is pl.
fn cleared(n: vec3f, pl: vec2f) -> f32 {
  let c = 0.5 * flat(pl).y * flat(pl).y;
  if (pl.x > 2.0 * c || pl.y < 0.0) { return 1.0; }
  let P = PL[i32(pl.y)];
  let e = normalize(vec3f(P.z, 0.0, -P.x));
  let uv = vec2f(dot(n, e), dot(n, cross(P, e)));
  let r2 = dot(uv, uv);
  return smoothstep(0.25 * c, c, pl.x * (1.0 + 0.45 * uv.x * (uv.x * uv.x - 3.0 * uv.y * uv.y) / (r2 * sqrt(r2) + 1e-6)));
}
// The deck over unit n: the altitudes of its base and its top (no cloud where the top is not above the base), in
// detail down to fp, each finer octave fading in as the pixel shrinks past it, so nothing pops as the eye comes and
// goes. Fair weather is cells of convection, as many as the weather allows, their tops heaped in billows. Round the
// pole the deck is the storm, the plunge pool's vortex at the size of a world. Its air is drawn in along log spirals,
// θ + K ln φ constant, and its cells are noise on the cylinder (θ, ln φ), where that inflow is a slide and a turn: so
// they fall in along the arms whole, however far they wind, and are finer the nearer the eye. A clear eye; round it
// the wall, the tallest cloud there is; the overcast sloping away from it in spiral ridges; then the arms.
fn deck(n: vec3f, fp: f32) -> vec2f {
  let t = u.p[5].w;
  let s = u.p[7].x;
  let x = acos(clamp(n.y, -1.0, 1.0)) / u.p[7].y; // from the pole, in eye radii
  var cov = wx;
  let m = s * (1.0 - smoothstep(7.0, 12.0, x));
  var c = 0.0;
  var a = 0.5;
  var H = HC;
  var open = 1.0;
  var an = 0.0;
  if (m < 1.0) {
    var f = 12.0;
    var w = n;
    var v = 0.5;
    for (var k = 0; k < 6; k++) {
      let fade = sat(2.0 - 4.0 * f * fp);
      if (fade <= 0.0) { break; }
      v = noise5(w * f + vec3f(0.9, 0.7, -0.8) * (v - 0.5) + vec3f(0.0, 0.01 * t, 0.0)); // each octave pushed about by the last, so no lattice shows
      c += a * mix(0.5, select(sqrt((2.0 * v - 1.0) * (2.0 * v - 1.0) + 0.01), v, k < 2), fade); // the cells, then billows heaped on them
      w = ROT * w;
      f *= 2.8;
      a *= 0.5;
    }
    c += a; // what is finer than the pixel, as its mean
  }
  if (m > 0.0) {
    let lx = log(max(x, 0.2));
    let th = atan2(n.z, n.x);
    let psi = th + KS * lx;
    let v = vec3f(cos(th - KS * 0.02 * t), sin(th - KS * 0.02 * t), lx + 0.02 * t); // falling in along the arms
    let big = noise5(v * 1.1 + 9.0); // what bends the arms
    let fs = fp / max(x * u.p[7].y, 1e-4); // the pixel, on the cylinder
    var cs = 0.0;
    var f = 3.0;
    var vr = ROT * v;
    a = 0.5;
    for (var k = 0; k < 5; k++) {
      let fade = sat(2.0 - 4.0 * f * fs);
      if (fade <= 0.0) { break; }
      let w = noise5(vr * f + 3.7);
      cs += a * mix(0.5, select(1.0 - abs(2.0 * w - 1.0), w, k < 2), fade);
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
    // The anvil. Where the wall's tallest towers meet the stratosphere they can rise no further, and spread; and what
    // was drawn in turning one way below is thrown out above turning the other: plumes, in fibres along that outflow.
    if (big > 0.33 && x > 1.05 && x < 1.5 + 2.8 * big) {
      let pa = th - 0.6 * KS * lx + 0.012 * t; // constant along the outflow
      let fib = 0.5 + 0.3 * sin(31.0 * pa + 7.0 * big) + 0.2 * sin(74.0 * pa - 5.0 * lx);
      an = s * smoothstep(0.43, 0.58, big + 0.1 * fib) * smoothstep(1.05, 1.25, x) * (1.0 - smoothstep(1.3, 1.5 + 2.8 * big, x + 0.35 * fib)) * (HA + 0.0012 * fib);
    }
  }
  c = 1.7 * c - 0.35;
  cov *= clear;
  return vec2f(CB, CB + max(H * sat(1.0 - (1.0 - c) / max(cov, 1e-3)) * (0.35 + 0.65 * sat(cov)) * open, an));
}

// The light a cloud's water takes out. As air rises from the base it cools and condenses, so the water in it grows
// with the height over the base, and the extinction as that to the 2/3 (an adiabatic cloud): a column's optical depth
// grows as its thickness to the 5/3, and a cloud thins out softly to nothing at its edges. Depth between heights a and
// b over the base, radii; a full fair-weather cell (HC) is TAUC deep, a cumulus's.
const TAUC = 40.0;
fn depth(a: f32, b: f32) -> f32 { return TAUC * (pow(max(max(a, b), 0.0) / HC, 5.0 / 3.0) - pow(max(a, 0.0) / HC, 5.0 / 3.0)); }
// What a layer that deep sends back: two streams, no absorption, its scattering forward as water's is (g = 0.85).
fn albedo(tau: f32) -> f32 { let k = 0.15 * tau; return k / (2.0 + k); }

// How much of the sun reaches p through the deck over it, met where the sun's ray leaves the low cloud and (round the
// storm, the only place the deck stands that high) the high: the sun's own beam, and the light the cloud lets through
// scattered, half of which comes down this way.
fn veil(p: vec3f, L: vec3f, fp: f32) -> f32 {
  let r = length(p);
  let b = dot(p, L);
  if (b < -0.05 * r) { return 1.0; }
  let storm = p.y > r * cos(14.0 * u.p[7].y);
  let tall = p.y > r * cos(TALL * u.p[7].y); // (over 0.012 the deck stands only inside 4.3, met at most 2.2 sunward)
  let mu = max(b / r, 0.08);
  var v = 1.0;
  if (wx > 0.1 || storm) {
    for (var j = 0; j < select(1, 2, tall); j++) {
      let alt = max(select(0.012, CB, j == 0), r - 0.9995 + 0.008 * f32(j));
      if (alt > CB + select(HC, HW, storm)) { break; }
      let d = deck(normalize(p + L * (sqrt(b * b - r * r + (1.0 + alt) * (1.0 + alt)) - b)), fp);
      let tau = depth(alt - CB, d.y - CB) / mu;
      let beam = exp(-tau);
      v *= beam + 0.5 * max(1.0 - albedo(tau) - beam, 0.0);
    }
  }
  return v;
}

fn hg(mu: f32, g: f32) -> f32 { return (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * mu, 1.5); }

struct Sky { light: vec3f, through: f32, t: f32 }

// The deck along ro + t rd, t in [t0, t1]: the ray's part of the layer between the deck's base and its tallest top,
// walked in even steps against the deck's broad shape until it first passes under a top, then found exactly, in full
// detail, by false position (and if the fine detail has a dip there, on). There it is lit as a layer as deep as its
// column: the sun on the slope of its top, shadowed by the cells toward the sun; what the layer sends back, by its
// depth; the sky; and, toward the sun, its thin edges silvered. What it sends back it does not let through.
fn aloft(ro: vec3f, rd: vec3f, t: f32, fp: f32) -> vec2f { // how far over the deck's top, and the top
  let p = ro + rd * t;
  let r = length(p);
  let d = deck(p / r, fp);
  return vec2f(r - 1.0 - d.y, d.y);
}
fn clouds(ro: vec3f, rd: vec3f, t0: f32, t1: f32, L: vec3f) -> Sky {
  var s = Sky(vec3f(0.0), 1.0, t1);
  let bs = ball(ro, rd, 1.0 + CB);
  var ta = t0;
  var tb = t1;
  if (dot(ro, ro) < (1.0 + CB) * (1.0 + CB)) { ta = max(ta, bs.y); } // from under it: from its base up
  else if (bs.x > 0.0) { tb = min(tb, bs.x); } // from over it: down to its base
  if (tb <= ta) { return s; }
  let fp = cone() * ta;
  let broad = max(fp, 0.004);
  let n = clamp(i32((tb - ta) / 0.003) + 2, 4, 11);
  let dt = (tb - ta) / f32(n);
  let ofs = fract(sin(dot(rd, vec3f(127.1, 311.7, 74.7))) * 43758.5) * dt; // each pixel's steps a little apart from its neighbours', so a cloud's edge between them frays, not steps
  var a = vec2f(ta, 1.0); // the last place the ray was over the deck, and by how much
  var hit = false;
  var d = vec2f(0.0);
  var t = ta;
  for (var i = 0; i <= n && !hit; i++) {
    t = min(ta + dt * f32(i) + select(ofs, 0.0, i == 0), tb);
    let g = aloft(ro, rd, t, broad).x;
    if (g >= 0.0) { a = vec2f(t, g); continue; }
    // under its broad top: where the ray crosses the top in full detail, twice by false position
    var b = aloft(ro, rd, t, fp);
    if (b.x >= 0.0) { a = vec2f(t, b.x); continue; } // a dip in the detail: on
    var tb2 = t;
    for (var j = 0; j < 2 && i > 0; j++) {
      let c = a.x + (tb2 - a.x) * a.y / (a.y - b.x);
      let o = aloft(ro, rd, c, fp);
      if (o.x < 0.0) { b = o; tb2 = c; } else { a = vec2f(c, o.x); }
    }
    t = tb2;
    d = vec2f(CB, b.y);
    hit = true;
  }
  if (!hit) { return s; }
  let p = ro + rd * t;
  let r = length(p);
  let nn = p / r;
  let alt = r - 1.0;
  let ms = dot(nn, L);
  let mv = max(abs(dot(rd, nn)), 0.12);
  let m0 = max(ms, 0.12);
  // the column under the top here, as the eye and the sun cross it
  let tau = depth(0.0, d.y - CB);
  let back = albedo(tau * (0.5 / mv + 0.5 / m0));
  s.t = t;
  s.through = 1.0 - back;
  // the sun on its top: Lambert on the slope its top turns toward the sun, and the shadow of the cells toward it, the
  // one beside and (for the towers) one farther off; light scatters on into the shadows, so they are never black
  let sz = sqrt(max(1.0 - ms * ms, 0.0));
  let toward = normalize(L - nn * ms + 1e-5);
  let near = max(0.0012, 3.0 * fp);
  let d1 = deck(normalize(nn + toward * near), fp);
  let g = 2.5 * (d1.y - d.y) / near; // relief, as the light sees it
  let lam = (ms - g * sz) / sqrt(1.0 + g * g);
  let rise = ms / max(sz, 0.05);
  var od = 6.0 * sat((d1.y - alt - near * rise) / (0.15 * HC));
  let fd = min((CB + HW - alt) / max(ms, 0.2), 0.06);
  if (fd > 2.0 * near && (ms < 0.45 || d.y > CB + HC)) { // (only a low sun, or a tower, throws a long shadow)
    let d2 = deck(normalize(nn + toward * fd), max(fp, 0.002));
    od += 6.0 * sat((d2.y - alt - fd * rise) / (0.15 * HC));
  }
  let shade = 0.7 * exp(-od) + 0.3 * exp(-0.2 * od);
  let mu = dot(rd, L);
  let silver = 0.06 * hg(mu, 0.8) * tau / mv * exp(-tau / mv); // forward through its thin edges
  let lit = SUN * exp(-sunward(p, L)) * (1.3 / PI * back * sat(lam) * shade + silver * sat(4.0 * ms + 0.2));
  let sky = SUN * vec3f(0.035, 0.055, 0.09) * smoothstep(-0.2, 0.3, ms) * (0.35 + 0.65 * back);
  s.light = lit + sky * back;
  return s;
}

// ---- the ground ----------------------------------------------------------------------------------------------------
// The land, stood up: where ro + t rd, t in [t0, t1], first passes under it, or t1. First down to the height nothing
// there stands above. Then by strides: what is safe over steep ground, or what the ground's rise so far would allow,
// never long enough to step through a range; from far above, the land's broad shape will do. Then the crossing
// itself, by false position. It stands only where it is near, and where the pixels are few enough to afford it:
// under the lens, on this Mac.
fn stood(t: f32) -> f32 { return (1.0 - smoothstep(FAR.x, FAR.y, t)) * smoothstep(4.5e6, 2.5e6, u.res.x * u.res.y); }
fn over(ro: vec3f, rd: vec3f, t: f32, fp: f32) -> f32 {
  let p = ro + rd * t;
  let r = length(p);
  return r - 1.0 - stood(t) * lay(p / r, max(4.0 * cone() * t, fp), fp < 0.002);
}
fn relief(ro: vec3f, rd: vec3f, t0: f32, t1: f32) -> f32 {
  var t = t0;
  for (var i = 0; i < 8; i++) {
    let p = ro + rd * t;
    let r = length(p);
    let top = level(nearest(p / r)) * step(p.y, 0.76 * r); // (and past 50° north all is sea)
    let gap = r - 1.0 - stood(t) * ZT * top;
    if (gap < cone() * t) {
      if (top == 0.0) { return t + gap / max(-dot(rd, p) / r, 0.03); } // the level ground of a place
      break;
    }
    let fall = -dot(rd, p) / r;
    t += gap / max(fall + 0.3 * sqrt(max(1.0 - fall * fall, 0.0)), 0.03);
    if (t >= t1) { return t1; }
  }
  let least = (t1 - t) / 8.0;
  var a = vec2f(t, 1.0); // the last place the ray was clear of the ground, and by how much
  var lod = 0.004;
  for (var i = 0; i < 8; i++) {
    let gap = over(ro, rd, t, lod);
    let fall = -dot(rd, normalize(ro + rd * t));
    let flat = sqrt(max(1.0 - fall * fall, 0.0));
    let closing = max(select(0.0, (a.y - gap) / (t - a.x), i > 0), fall + 0.2 * flat); // as the ground has been rising to meet it, or gently
    if (gap < 2.5 * cone() * t) {
      if (lod > 2.5 * cone() * t) { // near, by a far look: look again closely
        lod = 0.0;
        continue;
      }
      if (gap > 0.0 || i == 0) { return t + gap / max(closing, 0.03); } // near enough: the rest by its slope
      let c = a.x + (t - a.x) * a.y / max(a.y - gap, 1e-9); // through it: back by false position, twice
      let gc = over(ro, rd, c, 0.0);
      return select(c + (t - c) * gc / max(gc - gap, 1e-9), a.x + (c - a.x) * a.y / max(a.y - gc, 1e-9), gc < 0.0);
    }
    a = vec2f(t, gap);
    lod = 0.5 * gap;
    t += max(max(gap / max(fall + 0.7 * flat, 0.03), min(gap / max(closing, 0.03), 0.012)), least);
    if (t >= t1) { break; }
  }
  return t1;
}

// ---- the well ------------------------------------------------------------------------------------------------------
// At the pole, in the storm's eye, a well through the crust, and under it the planet is hollow: Primorial's world
// (sites/core.ts), the primes at work, seen from anywhere down the well and, from inside, everywhere at once.
//   Across the well, Sacks' spiral: every integer on one winding line, n at radius √n; a bead of light at each prime.
//   Under it, the wheels: Pritchard's sieve as clockwork, a ring to each primorial, rolling along the integers.
//   The floor: Ulam's spiral, 1 at its middle, and Eratosthenes' sieve run over it as waves, a colour to a prime.
//   The dome: the search itself, 2^p − 1 for exponents past the record, trial factored.
// The floor and the dome are their mean light here (lower, vault): the scene inside has them in full (core.wgsl, which
// takes those two names over). Rock is seen through from outside the hollow, never from in it, so an eye that leaves
// through the crust sees what it is leaving all the way out.
const WA = 0.045;               // the well's radius
const WF = 0.485;               // the floor's height over the planet's middle
const WC = 0.5;                 // the dome's radius, about the floor's middle
const WN = 0.981;               // the well's foot, in the dome's apex
const WS = 0.996;               // Sacks' spiral, just under the water
const WW = 0.62;                // the wheels
const AU = vec3f(1.0, 0.72, 0.22);   // a prime that is 1 mod 4, a sum of two squares
const AZ = vec3f(0.2, 0.62, 1.0);    // one that is 3 mod 4, and never is
const WHITE = vec3f(1.0, 0.9, 0.7);
const ALIVE = vec3f(0.2, 0.21, 0.3); // an integer nothing has struck yet
const PRIMES = array<u32, 18>(2u, 3u, 5u, 7u, 11u, 13u, 17u, 19u, 23u, 29u, 31u, 37u, 41u, 43u, 47u, 53u, 59u, 61u);
var<private> deep = 0.0;        // how far along its ray within() found its light

// The i-th prime's colour, wherever it strikes: 2 blue, 3 vermilion, 5 green, 7 magenta, 11 yellow, on round the wheel
// by the golden angle, so no two near each other are alike: ½ + ½ cos 2π(0.618 i + (0.33, 0.66, 0)), for the fifteen
// primes to 47.
const STRUCK = array<vec3f, 15>(
  vec3f(0.26, 0.23, 1.00), vec3f(0.97, 0.41, 0.13), vec3f(0.04, 0.90, 0.54), vec3f(0.70, 0.00, 0.80), vec3f(0.66, 0.84, 0.01),
  vec3f(0.06, 0.50, 0.92), vec3f(0.99, 0.16, 0.37), vec3f(0.22, 1.00, 0.27), vec3f(0.42, 0.10, 0.97), vec3f(0.89, 0.59, 0.04),
  vec3f(0.00, 0.77, 0.71), vec3f(0.85, 0.02, 0.65), vec3f(0.49, 0.94, 0.07), vec3f(0.17, 0.33, 0.99), vec3f(1.00, 0.31, 0.21));
fn strike(i: i32) -> vec3f { return STRUCK[i]; }
// Is n prime? By trial division, good below 67².
fn trial(n: u32) -> bool {
  if (n < 2u) { return false; }
  for (var i = 0; i < 18 && PRIMES[i] * PRIMES[i] <= n; i++) {
    if (n % PRIMES[i] == 0u) { return false; }
  }
  return true;
}
// A level of the hollow as the eye has it at rest: x to the right, y away.
fn plan(P: vec3f) -> vec2f { return vec2f(-P.x, P.z); }
// A cell's face: a soft-cornered tile, its edge a pixel's footprint wide (f across the cell, w a pixel in cells).
fn face(f: vec2f, w: vec2f, inset: f32) -> f32 {
  let d = 0.5 - inset - abs(f - 0.5);
  let e = clamp(d / max(w, vec2f(1e-4)) + 0.5, vec2f(0.0), vec2f(1.0));
  return e.x * e.y;
}
// An integer written on its cell: 3 × 5 digits, a nibble and a half each, top row first. c: from the cell's middle, its
// short side 1 and its long side (along x) L; cap: the largest a digit's dot may be.
const DIGIT = array<u32, 10>(0x7b6fu, 0x2c97u, 0x73e7u, 0x73cfu, 0x5bc9u, 0x79cfu, 0x79efu, 0x7249u, 0x7befu, 0x7bcfu);
fn numeral(n: u32, c: vec2f, L: f32, cap: f32) -> f32 {
  var D = 1;
  for (var m = n / 10u; m > 0u; m /= 10u) { D++; }
  let cols = f32(4 * D - 1);
  let unit = min(0.8 * L / cols, cap);
  let x = c.x / unit + 0.5 * cols;
  let y = 2.5 - c.y / unit;
  if (x < 0.0 || y < 0.0 || y >= 5.0 || x >= cols) { return 0.0; }
  let cx = i32(x) % 4;
  if (cx == 3) { return 0.0; }
  var m = n;
  for (var i = D - 1 - i32(x) / 4; i > 0; i--) { m /= 10u; }
  return f32((DIGIT[m % 10u] >> u32(14 - (i32(y) * 3 + cx))) & 1u);
}

// Sacks' spiral: n at radius √n and √n turns round, so the squares lie along one ray; a bead on the winding at every
// prime, out to `rim` turns. x in its own units, w a pixel's width in them. Light, and how much it hides.
fn winds(x: vec2f, w: f32, rim: f32) -> vec4f {
  let r = length(x);
  if (r > rim) { return vec4f(0.0); }
  let a = fract(atan2(x.y, x.x) / TAU);
  let s = max(round(r - a), 0.0) + a; // √n where the winding passes nearest
  var c = vec4f(0.0);
  for (var d = 0.0; d < 2.0; d += 1.0) {
    let n = floor(s * s) + d;
    if (!trial(u32(n))) { continue; }
    let q = sqrt(n);
    let k = sat((0.46 - length(vec2f(q - r, (q - s) * TAU * r))) / max(2.0 * w, 1e-3) + 0.5);
    c = max(c, vec4f(select(select(AZ, AU, u32(n) % 4u == 1u), WHITE, n == 2.0) * 5.0, 1.0) * k);
  }
  // the winding itself, a thread; and from far the beads' mean: a prime to every ln n integers, each integer π of the plane
  let th = max(0.05, 0.7 * w);
  c += (1.0 - c.a) * vec4f(WHITE * 0.02 / th * exp(-pow((r - s) / th, 2.0)), 0.0);
  return mix(vec4f(2.5 * (AU + AZ), 1.0) * 0.2116 / log(max(r * r, 3.0)), c, exp(-1.5 * w));
}
// Across the well it is wound 32 turns, to 1024, turning once in under three minutes; from too far to tell those
// beads apart, 8 turns, to 64, the same spiral four times the size. x in the finer's units.
fn sacks(x0: vec2f, w: f32) -> vec4f {
  let turn = 0.006 * TAU * u.p[5].w;
  let x = vec2f(x0.x * cos(turn) + x0.y * sin(turn), x0.y * cos(turn) - x0.x * sin(turn));
  let far = smoothstep(0.45, 0.9, w);
  var c = vec4f(0.0);
  if (far < 1.0) { c = (1.0 - far) * winds(x, w, 32.0); }
  if (far > 0.0) { c += far * winds(0.25 * x, 0.25 * w, 8.0); }
  return c;
}

// The wheels: Pritchard's sieve as clockwork. Ring k is the wheel of the k-th primorial (2, 6, 30, 210, 2310), a cell
// to each residue, lit where the residue is coprime to it: 1 spoke, 2, 8, 48, 480. Each is the one inside it rolled out
// p times, less p's multiples, which are struck in p's colour. They roll along the integers together, two a second, so
// along the pointer every ring reads the same integer N, each mod its own size; N's own light is on the pointer when it
// is prime. x in radii from the hub, w a pixel's width.
const WHEEL = array<f32, 5>(2.0, 6.0, 30.0, 210.0, 2310.0);
const RIM = array<f32, 6>(0.01, 0.023, 0.039, 0.058, 0.078, 0.1);
// Ring k's cell at `pos` residues round and fy across: its light, and how much it hides.
fn spoke(k: i32, pos: f32, fy: f32, wide: vec2f, pix: vec2f, out: vec2f) -> vec4f {
  let res = u32(pos);
  var j = -1; // which of the wheel's primes strikes this residue, if any
  for (var i = k; i >= 0; i--) { if (res % PRIMES[i] == 0u) { j = i; } }
  // its number, along whichever way the cell is longer, and whichever way up the eye reads it (out: outward, as the eye's right and up have it)
  let f = vec2f(fract(pos), fy);
  let g = select(vec2f(f.y - 0.5, f.x - 0.5) * vec2f(wide.y / wide.x, 1.0) * sign(out.x), vec2f(0.5 - f.x, f.y - 0.5) * vec2f(wide.x / wide.y, 1.0) * sign(out.y), wide.x > wide.y);
  var ink = 0.0;
  if (max(pix.x, pix.y) < 0.12) { ink = numeral(res, g, max(wide.x, wide.y) / min(wide.x, wide.y), 0.13) * smoothstep(0.12, 0.04, max(pix.x, pix.y)); }
  var cell = vec4f(WHITE * (1.0 - 0.9 * ink), 1.0);
  if (j >= 0) { cell = select(vec4f(strike(j) * (0.1 + 0.3 * ink), 0.3), vec4f(strike(j) * (0.8 + ink), 0.85), j == k); }
  return cell * face(f, pix, select(0.035, 0.1, k > 3));
}
fn wheels(x: vec2f, w: f32) -> vec4f {
  let r = length(x);
  if (r < RIM[0] || r > RIM[5] + 0.03) { return vec4f(0.0); }
  let N = fract(u.p[5].w / 1155.0) * 2310.0;
  let n = u32(N);
  // the pointer, and the integer under it written past its tip
  var c = vec4f(0.0);
  if (x.x > 0.0) {
    let lit = select(vec3f(0.5, 0.55, 0.7), 4.0 * AU, trial(n));
    let line = exp(-pow(x.y / max(4e-4, w), 2.0)) * step(r, RIM[5] + 0.006) * min(1.0, 4e-4 / max(w, 1e-6));
    var ink = 0.0;
    if (w < 8e-4 && r > RIM[5]) { ink = numeral(n, (x - vec2f(RIM[5] + 0.018, 0.0)) / 0.009, 2.2, 0.16) * smoothstep(8e-4, 2.5e-4, w); }
    c = vec4f(lit * (line + ink), 0.0);
  }
  if (r >= RIM[5]) { return c; }
  var k = 0;
  for (var i = 1; i < 5; i++) { if (r >= RIM[i]) { k = i; } }
  let size = WHEEL[k];
  let wide = vec2f(TAU * r / size, RIM[k + 1] - RIM[k]); // a cell: along the rim, and across it
  let pix = w / wide;
  let fy = (r - RIM[k]) / wide.y;
  let out = vec2f(dot(x, vec2f(-u.p[1].x, u.p[1].z)), dot(x, vec2f(-u.p[2].x, u.p[2].z)));
  let turn = atan2(x.y, x.x) / TAU + N / size;
  // where a pixel covers several cells it is their mean, six of them; and from far, a ring's own: its spokes are Π(1 − 1/p) of it
  let taps = select(1.0, 6.0, pix.x > 0.3);
  var cells = vec4f(0.0);
  for (var i = 0.5; i < taps; i += 1.0) { cells += spoke(k, fract(turn + (i / taps - 0.5) * pix.x / size) * size, fy, wide, pix / vec2f(taps, 1.0), out); }
  var spokes = 1.0;
  for (var i = 0; i <= k; i++) { spokes *= 1.0 - 1.0 / f32(PRIMES[i]); }
  return c + mix(vec4f(WHITE, 1.0) * spokes * 0.7, cells / taps, exp(-0.15 * pix.x));
}

// Eratosthenes' sieve as the floor runs it: every 26 s the floor is every integer again, and a wave goes out from its
// middle for each prime in turn, 2, 3, 5 … 47, striking that prime's multiples; a sixteenth is the proof of what is left
// (within 47², nothing is: past it, Miller and Rabin's test). How many waves have passed radius rho: under 1, none yet.
fn waves(rho: f32) -> f32 {
  let a = (fract(u.p[5].w / 26.0) * 26.0 - rho / 0.11) / 0.9;
  return select(a, 99.0, a < 0.0); // (before the floor is made new, it is as the last round left it)
}
// A cell the j-th prime strikes, s waves after it did: its colour, hot, then cooling to an ember of it.
fn struck(j: i32, s: f32) -> vec3f { return mix(ALIVE, strike(j) * (0.1 + 1.6 * exp(-2.5 * max(s, 0.0))), sat(s / 0.12)); }
// The floor's mean light at P, t along the ray: each prime's share of the integers, struck or not yet.
fn lower(P: vec3f, t: f32, rd: vec3f) -> vec3f {
  let a = waves(length(P.xz));
  var c = vec3f(0.0);
  var left = 1.0;
  for (var j = 0; j < 15; j++) {
    c += left / f32(PRIMES[j]) * struck(j, a - 1.0 - f32(j));
    left *= 1.0 - 1.0 / f32(PRIMES[j]);
  }
  c += left * mix(ALIVE, 0.6 * (AU + AZ), sat((a - 16.0) / 0.12));
  return c * 0.74 * exp(-0.7 * t);
}
// The dome's: candidates not yet tried, thinly.
fn vault(P: vec3f, t: f32) -> vec3f { return vec3f(0.1, 0.12, 0.34) * 0.12 * exp(-0.7 * t); }

// What a ray sees of the hollow, from ro (in the well's mouth, or anywhere under the ground) along rd, t0 after it
// left the eye. The hollow is the dome's half ball and the well's cylinder; the ray's light is where it leaves them.
fn within(ro: vec3f, rd: vec3f, t0: f32) -> vec3f {
  let up = rd.y > 0.0;
  let iy = 1.0 / select(rd.y, select(-1e-6, 1e-6, up), abs(rd.y) < 1e-6);
  let oc = ro - vec3f(0.0, WF, 0.0);
  let sb = dot(oc, rd);
  let sh = sb * sb - dot(oc, oc) + WC * WC;
  let far = -sb + sqrt(max(sh, 0.0));
  let tf = -oc.y * iy; // the floor
  let h0 = max(select(-1e9, tf, up), -sb - sqrt(max(sh, 0.0)));
  let h1 = min(select(tf, 1e9, up), far);
  let inH = sh > 0.0 && h1 > max(h0, 0.0);
  let ca = max(dot(rd.xz, rd.xz), 1e-9);
  let cb = dot(ro.xz, rd.xz);
  let ch = cb * cb - ca * (dot(ro.xz, ro.xz) - WA * WA);
  let ya = (WN - 0.004 - ro.y) * iy; // the well's foot, and its mouth
  let yb = (1.0 - ro.y) * iy;
  let c1 = (-cb + sqrt(max(ch, 0.0))) / ca;
  let out = max(ya, yb);
  let n1 = min(c1, out);
  let inN = ch > 0.0 && n1 > max(max((-cb - sqrt(max(ch, 0.0))) / ca, min(ya, yb)), 0.0);
  var kind = 0; // 1 the dome, 2 the floor, 3 the well's wall, 4 the sky up it; 0 rock
  var t = 0.0;
  let PH = ro + rd * h1;
  if (!up && inN && c1 < out) { kind = 3; t = n1; }
  else if (inH && !(up && dot(PH.xz, PH.xz) < WA * WA)) { kind = select(1, 2, !up && tf < far); t = h1; }
  else if (up && inN) { kind = select(4, 3, c1 < out); t = n1; }
  deep = t;
  let px = cone() / max(abs(rd.y), 0.15);
  // the spiral and the wheels, each a level the ray crosses once
  let ts = (WS - ro.y) * iy;
  let tw = (WW - ro.y) * iy;
  var S = vec4f(0.0);
  var Wh = vec4f(0.0);
  if (ts > 0.0 && ts < t) {
    let x = plan(ro + rd * ts) * (32.0 / WA);
    S = sacks(x, (t0 + ts) * px * 32.0 / WA);
    // and the light that comes up the well, thinning as the eye goes down into it
    S += (1.0 - S.a) * vec4f(AU * 0.5 * smoothstep(0.6, 2.5, t0 + ts), 0.9 * smoothstep(0.1, 0.4, t0 + ts)) * sat(6.0 - dot(x, x) / 171.0) * step(rd.y, 0.0);
    if (S.a > 0.5) { deep = ts; }
  }
  if (tw > 0.0 && tw < t) {
    Wh = wheels(plan(ro + rd * tw), (t0 + tw) * px);
    if (Wh.a > 0.5 && (S.a <= 0.5 || tw < ts)) { deep = tw; }
  }
  var c = vec3f(0.0);
  let P = ro + rd * t;
  if (kind == 1) { c = vault(P, t0 + t); }
  if (kind == 2) { c = lower(P, t0 + t, rd); }
  if (kind == 3) { let f = sat((1.0 - P.y) / (1.0 - WN)); c = vec3f(1.0, 0.6, 0.22) * (0.03 + 0.4 * f * f) + WHITE * 0.5 * exp(-f * 60.0); } // rock, lit from under; the waterline
  if (kind == 4) { c = vec3f(0.2, 0.34, 0.6) * sat(0.3 + 4.0 * u.p[5].y); } // day, from down a well
  let first = select(Wh, S, ts < tw);
  let then = select(S, Wh, ts < tw);
  return first.rgb + (1.0 - first.a) * (then.rgb + (1.0 - then.a) * c);
}

// The ground at p, where the ray rd met it t along; `near`: how much of its relief stands there (stood).
fn ground(p: vec3f, rd: vec3f, L: vec3f, t: f32, near: f32) -> vec3f {
  let m = normalize(p);
  let mu = dot(m, L);
  let cv = max(dot(-rd, m), 0.04);
  let fp = cone() * t / sqrt(cv);
  let c = crust(m, fp);
  let G = geo;
  let Z = rise;
  let gt = c.yzw - m * dot(m, c.yzw);
  let o = m * (1.0 + Z.x);
  var sun = SUN * exp(-sunward(m, L)) * veil(o, L, 2.0 * fp + 0.001);
  let sky = SUN * vec3f(0.035, 0.055, 0.09) * smoothstep(-0.2, 0.3, mu);
  let zt = Z.yzw - m * dot(m, Z.yzw);
  let pl = by;
  let N = normalize(m - mix(ZS * gt, zt, near * level(pl)) * step(0.0, c.x)); // from orbit, and where it is levelled, relief as the light likes it; from near, as it stands
  let lit = max(dot(N, L), 0.0);
  // the land's own shadow, long when the sun is low: the sun's ray, followed out over it (over a place's level ground
  // there is nothing to follow it over)
  if (mu > -0.05 && mu < mix(0.3, 0.8, near) && lit > 0.0 && (c.x >= 0.0 || near > 0.0)) {
    var s = max(0.002, 2.0 * fp);
    var sh = sat(0.5 + (mu + 0.5 * s) / 0.25);
    for (var j = 0; j < 4 && (near == 0.0 || pl.x > 0.012 || i32(pl.y) == RV); j++) {
      let q = o + L * s;
      sh = min(sh, sat(0.5 + (length(q) - 1.0 - lay(normalize(q), max(0.25 * s, 2.0 * fp), true)) / (0.25 * s)));
      s *= 3.0;
    }
    sun *= sh;
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
    let c2 = max(dot(m, H) * dot(m, H), 1e-4);
    let F = 0.02 + 0.98 * pow(1.0 - max(dot(-rd, H), 0.0), 5.0);
    let glint = F * exp(-(1.0 - c2) / (c2 * s2)) / (PI * s2 * 4.0 * cv * c2 * c2) * step(0.0, mu);
    var alb = mix(vec3f(0.004, 0.02, 0.05), vec3f(0.42, 0.38, 0.27), exp(c.x * vec3f(500.0, 70.0, 25.0)));
    alb = mix(alb, vec3f(0.6), min(2.95e-6 * pow(U, 3.52), 0.4));
    let Fv = 0.02 + 0.98 * pow(1.0 - cv, 5.0);
    col = alb * (sun * max(mu, 0.0) + sky) / PI + sun * glint + Fv * sky / PI;
    // at the pole, in the storm's eye, the well (above): what is down it, and its light lying on the water round its mouth
    let bore = length(p.xz) / WA;
    if (bore < 3.0) {
      if (bore < 1.03) { col = mix(col, within(p, rd, t) / u.p[8].x, smoothstep(1.03, 0.97, bore)); }
      col += vec3f(1.0, 0.6, 0.2) * 2.2 * exp(-max(bore - 1.0, 0.0) * 5.0) * step(1.0, bore);
    }
  } else {
    let slope = ZS * length(gt);
    let y2 = m.y * m.y;
    let wet = 0.5 * noise(m * 2.7 + 40.0) + 0.3 * noise(m * 9.0 + 3.0) + 0.2 * (1.0 - 18.0 * y2 + 48.0 * y2 * y2 - 32.0 * y2 * y2 * y2) + 0.25 - 0.6 * c.x + 0.3 * smoothstep(0.12, 0.0, c.x) - 0.6 * G.z; // water gathers in the valleys
    let cold = y2 + 1.3 * c.x + 0.15 * G.z;
    var alb = mix(mix(vec3f(0.4, 0.29, 0.16), vec3f(0.3, 0.16, 0.08), smoothstep(0.3, 0.7, noise(m * 6.0 + 60.0))), mix(vec3f(0.13, 0.13, 0.05), vec3f(0.02, 0.06, 0.015), smoothstep(0.5, 0.65, wet)), smoothstep(0.3, 0.45, wet));
    alb = mix(alb, vec3f(0.13, 0.11, 0.08), smoothstep(0.45, 0.7, cold));
    alb = mix(alb, vec3f(0.17, 0.145, 0.125), smoothstep(0.4, 1.0, slope));
    alb = mix(alb, vec3f(0.42, 0.37, 0.26), smoothstep(0.006, 0.0, c.x + 0.01 * G.z));
    // the canyon's walls: the beds the river cut down through, lying level, each its own rock, and dust on the benches
    let bed = c.x * 59.0 + 0.5 * noise(m * 40.0);
    let kind = noise(vec3f(floor(bed) * 0.37, 0.5, 9.5));
    let rock = mix(mix(vec3f(0.4, 0.15, 0.07), vec3f(0.62, 0.36, 0.2), smoothstep(0.3, 0.6, kind)), vec3f(0.66, 0.6, 0.5), smoothstep(0.75, 0.85, kind)) * (0.75 + 0.25 * smoothstep(0.0, 0.2, fract(bed)));
    alb = mix(alb, mix(vec3f(0.5, 0.38, 0.26), rock, smoothstep(0.3, 1.0, length(zt))), G.y);
    alb = mix(alb, vec3f(0.85, 0.88, 0.93), smoothstep(0.7, 0.78, cold + 0.12 * G.x) * (1.0 - 0.6 * smoothstep(0.7, 1.4, slope)));
    alb *= 1.0 + 0.8 * G.z;
    col = alb * (sun * lit + sky * (0.6 + 0.4 * dot(N, m))) / PI;
    // the night side's own light: River's places, and the roads between towns
    let night = smoothstep(0.02, -0.12, mu) * u.p[8].y;
    if (night > 0.0) {
      var pop = 0.6 * smoothstep(0.3, 0.5, noise(m * 17.0 + 80.0) * noise(m * 41.0)) * smoothstep(0.25, 0.05, c.x); // towns, in the lowlands
      for (var k = 0; k < NP; k++) { pop += exp((dot(m, PL[k]) - 1.0) / 0.003); }
      let roads = pow(1.0 - abs(2.0 * noise(m * 110.0) - 1.0), 8.0);
      // (through an open lens each light is a wide faint disc: they are given as their mean, so its taps find no sparks)
      let sharp = 1.0 / (1.0 + u.p[9].x * u.p[9].x / 4.0);
      col += night * pop * pop * mix(0.25, 0.4 * roads + 4.0 * pow(noise(m * 420.0), 5.0), sharp) * vec3f(1.0, 0.6, 0.27) * 9.0;
    }
  }
  // the place the reader points at (in the index, or on the planet), marked on the ground: a soft ring of light round
  // what stands there, just outside its level ground
  let mk = u.p[6].xy;
  if (mk.y > 0.003) {
    let d = acos(clamp(dot(m, PL[i32(mk.x)]), -1.0, 1.0)) - flat(vec2f(0.0, mk.x)).x - 0.02;
    col += mk.y * vec3f(1.0, 0.86, 0.66) * (2.0 * exp(-d * d / 2e-5) + 0.12 * exp(-max(-d, 0.0) / 0.03) * step(d, 0.0));
  }
  // what BLEPS's main camera sees: its square on the ground, a little brighter, its edge a fine line of cool light
  let sq = u.p[14];
  if (sq.w < 0.0) {
    let c = site(sq.xy);
    let e = normalize(vec3f(c.z, 0.0, -c.x));
    let n = cross(c, e);
    let up = n * cos(sq.z) + e * sin(sq.z);
    let xy = vec2f(dot(m, cross(up, c)), dot(m, up)) / -sq.w;
    let edge = max(abs(xy.x), abs(xy.y));
    if (dot(m, c) > 0.9 && edge < 1.1) {
      let line = exp(-pow((edge - 1.0) * -sq.w / 3e-4, 2.0));
      col = col * (1.0 + 0.3 * step(edge, 1.0) + 1.2 * line) + vec3f(0.4, 0.6, 0.8) * 0.15 * line;
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
      let w = (dot(rd, g) - ct * dot(p, rd) / length(p)) / (length(p) * sqrt(max(1.0 - ct * ct, 0.0))); // the colatitude's rate along the ray
      t += clamp((0.025 * sin(5.0 * az + 0.3 * time) + 0.01 * sin(17.0 * az - 0.7 * time)) / w, -0.08, 0.08) * sign(ct);
      p = ro + rd * t;
      let x = (length(p) - 1.012) / 0.03;
      if (t < 0.0 || t > b || x < 0.0) { continue; }
      let rays = (0.3 + noise(vec3f(az * 3.0, 0.2 * time, 4.0))) * (0.5 + noise(vec3f(az * 30.0, 0.5 * time, 9.0)));
      let glow = vec3f(0.3, 1.0, 0.5) * exp(-2.5 * x) * sat(12.0 * x) + vec3f(1.0, 0.08, 0.12) * 0.2 * smoothstep(0.1, 0.6, x) * exp(-1.5 * x) + vec3f(0.45, 0.15, 1.0) * exp(-30.0 * x);
      c += glow * rays * smoothstep(0.12, -0.12, dot(normalize(p), L)) * min(0.004 / abs(w), 0.06);
    }
  }
  // and the diffuse glow the curtains hang in
  let sh = ball(ro, rd, 1.02);
  let t = select(sh.x, sh.y, sh.x < 0.0);
  if (t > 0.0 && t < b) {
    let p = (ro + rd * t) / 1.02;
    let w = (acos(abs(dot(p, g))) - 0.385) / 0.06;
    c += vec3f(0.3, 1.0, 0.5) * 0.0012 * exp(-w * w) * smoothstep(0.12, -0.12, dot(p, L));
  }
  return c * lvl * 70.0; // faint, as from orbit it is: a veil over the night, not a lamp
}

// ---- beyond ---------------------------------------------------------------------------------------------------------
// The fixed stars keep their places by the sun, which goes round this planet once a day: d is the ray in their frame,
// where the sun stands still at sl. Stars: one, perhaps, to each cell of a cube's faces, in two sizes of cell, bright
// ones few (N(>F) ∝ 1/F), more of them toward the galaxy's plane; each a spot a pixel wide, the same light whatever
// the pixel. The galaxy: its disc edge-on, the bulge, the dust lanes across them. And the dust of this sun's own
// planets, in their plane, lit by it: the zodiacal light, brightening toward the sun without end (near it, it is the
// corona), and opposite the sun the gegenschein, where every grain is seen full.
const GAL = vec3f(0.47, 0.395, -0.789);  // the galaxy's pole, and its middle
const GC = vec3f(0.696, 0.383, 0.607);
fn hash(v: vec3u) -> vec3f {
  var x = v * vec3u(1664525u) + vec3u(1013904223u);
  x.x += x.y * x.z; x.y += x.z * x.x; x.z += x.x * x.y;
  x ^= x >> vec3u(16u);
  x.x += x.y * x.z; x.y += x.z * x.x; x.z += x.x * x.y;
  return vec3f(x >> vec3u(8u)) / 16777216.0;
}
fn beyond(rd: vec3f, L: vec3f) -> vec3f {
  let ax = vec3f(0.0, 1.0, 0.0); // the pole: the planet holds still and the sky turns with its sun
  let e1 = normalize(L - ax * dot(ax, L));
  let d = vec3f(dot(rd, e1), dot(rd, ax), dot(rd, cross(ax, e1)));
  let sl = vec2f(dot(L, e1), dot(L, ax));
  // the galaxy
  let gb = dot(d, GAL);
  let gl = dot(d, GC);
  var lane = 0.0;
  var c = vec3f(0.0);
  if (abs(gb) < 0.45) {
    let bulge = exp(-(1.0 - gl) / 0.05 - gb * gb / 0.02);
    lane = smoothstep(0.35, 0.75, 0.6 * noise(d * 7.0 + 3.0) + 0.4 * noise(d * 19.0)) * exp(-gb * gb / 0.006);
    let disc = (0.3 * exp(-gb * gb / 0.06) + exp(-gb * gb / 0.012) * (0.5 + noise(d * 11.0 + 20.0))) * (0.6 + 0.4 * gl);
    _ = disc; _ = bulge; // the galaxy's glow is the cosmos's now (cosmos.wgsl); only its dust lanes still thin the stars
  }
  // the stars
  let ad = abs(d);
  var f = vec3f(d.yz / d.x, select(0.0, 1.0, d.x < 0.0));
  if (ad.y >= ad.x && ad.y >= ad.z) { f = vec3f(d.zx / d.y, select(2.0, 3.0, d.y < 0.0)); }
  else if (ad.z >= ad.x) { f = vec3f(d.xy / d.z, select(4.0, 5.0, d.z < 0.0)); }
  let w = max(cone(), 2e-4);
  for (var j = 0; j < 2; j++) {
    let n = select(44.0, 150.0, j == 1);
    let id = floor(f.xy * n);
    let key = vec3u(vec2u(vec2i(id) + 512), u32(f.z) + 6u * u32(j));
    let at = hash(key);
    let is = hash(key + vec3u(0u, 0u, 12u));
    let sp = (id + 0.15 + 0.7 * at.xy) / n;
    let v = normalize(vec3f(1.0, f.xy)) - normalize(vec3f(1.0, sp));
    let many = pow(1.0 + dot(sp, sp), -1.5) * (0.25 + 0.75 * exp(-gb * gb / 0.05)) * (1.0 - 0.8 * cosmosDust(d)); // the cell's share of sky; the plane; the dust
    if (is.x < many) {
      // (a star through an open lens is a disc of its light, too faint to see: it is not left a point for the lens's
      // taps to catch and scatter as sparks)
      let flux = select(1.0, 0.09, j == 1) * 0.04 / (is.y + 0.04) / (1.0 + u.p[9].x * u.p[9].x / 4.0);
      c += mix(vec3f(1.0, 0.7, 0.45), vec3f(0.7, 0.82, 1.0), smoothstep(0.1, 0.8, is.z + 0.3 * at.z)) * flux * exp(-dot(v, v) / (0.9 * w * w)) * 3.8e-4 / w;
    }
  }
  // the zodiacal light
  let el = acos(clamp(dot(rd, L), -1.0, 1.0));
  let lat = abs(dot(d.xy, vec2f(-sl.y, sl.x)));
  c += vec3f(1.0, 0.93, 0.82) * (0.012 * pow(max(el, 0.02), -2.2) * exp(-lat / (0.06 + 0.22 * el)) + 0.012 * exp(-(PI - el) * (PI - el) / 0.03));
  return (c + cosmos(d)) / 0.11; // and the fractal cosmos beyond (cosmos.wgsl), at the exposure the world is seen at (planet.ts EXPOSE)
}

// What is beyond the planet and its air, along rd: the sun's disc, limb-darkened, over the sky behind it (beyond), as
// much of that sky as is `seen`. Everything past the air comes from here and nowhere else.
fn backdrop(rd: vec3f, L: vec3f, seen: f32) -> vec3f {
  let sd = 1.0 - (1.0 - dot(rd, L)) / 1.08e-5;
  return beyond(rd, L) * seen + select(vec3f(0.0), SUN / 6.8e-5 * (0.4 + 0.6 * sqrt(max(sd, 0.0))), sd > 0.0);
}

// River's places, from the scene's slots: where each is, and which is the river's.
fn places() {
  NP = i32(u.p[8].z);
  RV = -1;
  for (var k = 0; k < NP; k++) {
    let v = u.p[10 + k / 2];
    let ll = select(v.xy, v.zw, k % 2 == 1);
    PL[k] = site(ll);
    if (u.p[9].w > 0.0 && all(abs(ll - u.p[9].yz) < vec2f(1e-4))) { RV = k; }
  }
  if (RV < 0) { RS = site(u.p[9].yz); } else { RS = PL[RV]; }
  RE = normalize(vec3f(RS.z, 0.0, -RS.x));
  RN = cross(RS, RE);
}

fn planet(q: vec2f) -> vec3f {
  text = 0.0;
  let R = u.p[4].w;
  let ro = local(-u.p[4].xyz / R);
  let rd = local(ray(q));
  let L = local(u.p[5].xyz);
  places();
  let top = ball(ro, rd, TOP);
  let g = ball(ro, rd, 1.0);
  var hit = g.x > 0.0;
  var tg = g.x;
  var sh = ball(ro, rd, 1.0 + CB + HW + 0.002); // the deck's shell, at its tallest
  let look = normalize(ro + rd * select(max(sh.x, 0.0), g.x, hit)); // where this pixel looks, and the place nearest that
  let pl = nearest(look);
  var col = vec3f(0.0);
  if (top.y > 0.0) {
    let a = max(top.x, 0.0);
    var sky = Sky(vec3f(0.0), 1.0, select(top.y, g.x, hit));
    // the deck's shell, as tall as the storm's wall only where the ray passes the storm
    let t0 = max(sh.x, 0.0);
    let t1 = min(sh.y, sky.t);
    let e0 = normalize(ro + rd * t0);
    let e1 = normalize(ro + rd * t1);
    let em = normalize(ro + rd * 0.5 * (t0 + t1));
    let calm = max(max(e0.y, e1.y), em.y) < cos(14.0 * u.p[7].y);
    if (calm) { sh = ball(ro, rd, 1.0 + CB + HC + 0.0005); }
    if (sh.y > 0.0) {
      wx = weather(normalize(ro + rd * max(sh.x, 0.0)));
      clear = cleared(look, pl);
      // and only as tall as fair weather's where the ray comes no nearer the pole than TALL: no nearer than the middle
      // of its arc, less the arc's longer half
      if (!calm && acos(clamp(em.y, -1.0, 1.0)) - acos(clamp(min(dot(em, e0), dot(em, e1)), -1.0, 1.0)) > TALL * u.p[7].y) { sh = ball(ro, rd, 1.0 + CB + HC + 0.0005); }
      if (sh.y > 0.0 && clear > 0.0 && (wx * clear > 0.1 || !calm)) { sky = clouds(ro, rd, max(sh.x, 0.0), min(sh.y, sky.t), L); } // a clear sky needs no search
    }
    // the land, stood up, as far as it can be seen: to the sea, or to the cloud that hides it
    let zt = ball(ro, rd, 1.0 + ZT);
    if (u.res.x * u.res.y < 4.5e6 && zt.y > 0.0 && zt.x < FAR.y) {
      let far = min(select(zt.y, g.x, g.x > 0.0), select(1e9, sky.t, sky.through < 0.03));
      let t = relief(ro, rd, max(zt.x, 0.0), far);
      if (sky.through >= 0.03 || t < far) {
        hit = t < far || g.x > 0.0;
        tg = t;
        if (hit && t < sky.t) { sky = Sky(vec3f(0.0), 1.0, t); } // and a range hides the cloud behind it
      }
    }
    let b = select(top.y, tg, hit);
    if (hit) {
      dist = tg * R;
      if (sky.through > 0.03) { col = ground(ro + rd * tg, rd, L, tg, stood(tg)); }
    } else {
      col = backdrop(rd, L, 1.0);
    }
    if (sky.through < 0.5) { dist = sky.t * R; }
    // from low down, the deck's shadow in the air: each pixel samples it at its own depths (interleaved gradient noise)
    let rays = smoothstep(0.16, 0.08, length(ro) - 1.0);
    let px = (q * vec2f(1.0 / u.aspect, -1.0) * 0.5 + 0.5) * u.res;
    if (rays > 0.0) { jit = fract(52.9829189 * fract(dot(px, vec2f(0.06711056, 0.00583715)))); }
    // (behind a cloud that lets nothing through there is no air to sum, and in front of it a few steps will do)
    let shut = sky.through < 0.03;
    let A = air(ro, rd, a, select(b, sky.t, shut), L, sky.t, sky.through, select(select(12, 8, hit), 5, shut), rays);
    col = A.light + A.front * sky.light + sky.through * A.through * col;
    if (min(dot(ro + rd * a, L), dot(ro + rd * b, L)) < 0.2) { col += aurora(ro, rd, b, L); } // a night thing, above the weather
  } else {
    col = backdrop(rd, L, 1.0);
  }
  return min(col * u.p[8].x, vec3f(4e3));
}

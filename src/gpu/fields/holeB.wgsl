// The finale, take B · the fractal is the drain. A Doyle spiral: circles each tangent to six others, their
// centres e^w for w on a lattice A ℤ + B ℤ of the log plane that holds 2πi, so the whole packing is carried
// onto itself by z ↦ az and z ↦ bz, loxodromic maps whose attracting fixed point is 0. Each circle is the
// equator of a pearl, and the pearls are lifted onto cones h = κ|z| about the axis, which the same maps
// (their Poincaré extensions: z ↦ λz, h ↦ |λ|h) carry onto themselves: a funnel of pearls spiralling down
// into a point, self-similar forever. At that point sits a Schwarzschild hole, G = c = M = 1. Every ray is
// a null geodesic traced back from the eye, as hole.wgsl traces them: the flat path pushed by
// x'' = −3M h² x / r⁵, h = |x × x'|, by Runge–Kutta–Nyström, and sphere-traced against the pearls along
// every step of it, so the funnel's walls are seen where the bent light finds them, wrapped into rings
// round the shadow and piled up at the photon ring. The pearls are lit by the ring, as (3M / r)², each a
// soap film whose thickness winds with its spiral arm, so the colours run down the spirals as we fall.
//
// p[0..3] camera   p[4] time, M, gain, ring light   p[5] A, B   p[6] the lattice's inverse basis
// p[7] κ of the three walls, bloom   p[8] ρ of the three walls, film drift   p[9] the card: depth past the
// hole, half-height, σ, light   p[10] a = e^A, b = e^B   p[11] the flow's turn per e-fold, exposure, P, Q

const RV = 60.0; // past this, rays run straight
const FAR = 4000.0;

var<private> M: f32;
var<private> H2: f32; // the ray's h²
fn pull(x: vec3f) -> vec3f {
  let r2 = dot(x, x);
  return -3.0 * M * H2 * x / (r2 * r2 * sqrt(r2));
}

fn cmul(a: vec2f, b: vec2f) -> vec2f { return vec2f(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x); }

// One wall: the pearls whose centres lie on the cone h = κ|z|, the lattice shifted by o. The four lattice
// points round the cell the point falls in, reached from the first by a, b and ab.
var<private> id: vec4f; // the nearest pearl: its lattice m, n, its wall, its size
fn wall(x: vec3f, r: f32, th: f32, k: f32, rho: f32, o: vec2f, j: f32, best: f32) -> f32 {
  let rp = max((r + k * x.z) / (1.0 + k * k), 1e-4); // the nearest point of the cone, its |z|
  let w = vec2f(log(rp), th);
  let c = vec2f(dot(u.p[6].xy, w), dot(u.p[6].zw, w)) - o;
  let f = floor(c) + o;
  let wl = u.p[5].xy * f.x + u.p[5].zw * f.y;
  let z0 = exp(wl.x) * vec2f(cos(wl.y), sin(wl.y));
  var d = best;
  for (var i = 0; i < 4; i++) {
    var z = z0;
    if ((i & 1) != 0) { z = cmul(z, u.p[10].xy); }
    if ((i & 2) != 0) { z = cmul(z, u.p[10].zw); }
    let R = length(z);
    // the bloom, inward from far out; and inside the innermost stable orbit, r = 6M, nothing stays
    let s = rho * R * clamp(u.p[7].w + 0.6 * log(R), 0.0, 1.0) * smoothstep(6.0 * M, 8.0 * M, R * sqrt(1.0 + k * k));
    if (s <= 0.0) { continue; }
    let e = distance(x, vec3f(z, k * R)) - s;
    if (e < d) { d = e; id = vec4f(f + vec2f(f32(i & 1), f32(i >> 1)), j, s); }
  }
  return d;
}

fn de(x: vec3f) -> f32 {
  let r = length(x.xy);
  let th = atan2(x.y, x.x);
  var d = wall(x, r, th, u.p[7].x, u.p[8].x, vec2f(0.0), 0.0, 1e9);
  d = wall(x, r, th, u.p[7].y, u.p[8].y, vec2f(0.5, 0.5), 1.0, d);
  d = wall(x, r, th, u.p[7].z, u.p[8].z, vec2f(0.25, 0.6), 2.0, d);
  return d;
}

// The Julia set as R5 left it, on a card square to the eye past the hole, filling the view at first:
// where the segment from x along v meets it, (s, its uv), or s = 2. It drains down the same flow, σ
// e-folds: shrunk by e^−σ and turned, the nearer its middle the faster, as water down a drain.
fn card(x: vec3f, v: vec3f) -> vec3f {
  let w = u.p[9];
  let F = u.p[3].xyz;
  let av = dot(v, F);
  if (abs(av) < 1e-6) { return vec3f(2.0); }
  let s = (w.x - dot(x, F)) / av;
  if (s < 0.0 || s > 1.0) { return vec3f(2.0); }
  let P = x + s * v - w.x * F;
  let p = vec2f(dot(P, u.p[1].xyz), dot(P, u.p[2].xyz)) / w.y * exp(w.z);
  let a = w.z * u.p[11].x * (1.0 + 0.5 / (length(p) + 0.1));
  let q = vec2f(cos(a) * p.x + sin(a) * p.y, cos(a) * p.y - sin(a) * p.x) / vec2f(u.aspect, 1.0);
  if (max(abs(q.x), abs(q.y)) > 1.0) { return vec3f(2.0); }
  return vec3f(s, q);
}

// A pearl at P, the light arriving along d: lit by the ring at the hole, a soap film over a pearl body.
fn pearl(P: vec3f, d: vec3f, len: f32, px: f32) -> vec3f {
  let e = max(0.5 * px * len, 1e-4);
  let k = vec2f(1.0, -1.0);
  let n = normalize(k.xyy * de(P + k.xyy * e) + k.yyx * de(P + k.yyx * e) + k.yxy * de(P + k.yxy * e) + k.xxx * de(P + k.xxx * e));
  de(P);
  let me = id;
  let a = 0.25 * me.w;
  let ao = clamp(de(P + n * a) / a, 0.0, 1.0) * clamp(0.5 + 0.5 * de(P + n * 3.0 * a) / (3.0 * a), 0.0, 1.0);
  let r2 = dot(P, P);
  let L = -P / sqrt(r2);
  let lit = u.p[11].y / r2; // the ring's light, as the eye's exposure sees it
  let ci = abs(dot(n, d));
  let ct = sqrt(1.0 - (1.0 - ci * ci) / (1.33 * 1.33));
  // the film: thicker along some arms than others, and draining as we fall
  let arm = 6.2831853 * (me.x / u.p[11].z + me.y / u.p[11].w); // whole turns round the hole: the same pearl
  let thick = 280.0 + 200.0 * sin(arm + u.p[8].w + 0.7 * me.z) - 120.0 * dot(n, L);
  let fres = 0.08 + 0.92 * pow(1.0 - ci, 3.0);
  let rf = reflect(d, n);
  let glint = pow(max(dot(rf, L), 0.0), 40.0);
  let dif = max(dot(n, L), 0.0);
  let tint = film(thick, 0.8);
  let body = (vec3f(0.08, 0.06, 0.16) + 6.0 * tint) * (0.05 + dif) * lit;
  let skin = 12.0 * film(thick, ct) * fres * (0.2 + lit);
  return (body + skin + vec3f(1.0, 0.85, 0.6) * glint * lit * 3.0) * ao;
}

fn field(q: vec2f) -> vec3f {
  M = u.p[4].y;
  var x = eye();
  let n = ray(q);
  let px = cone();
  // the eye hovers: a pixel's direction is in its own frame, the flat path's tangent stretched along r
  let er = normalize(x);
  let al = sqrt(max(1.0 - 2.0 * M / length(x), 1e-4));
  var v = normalize(n + (al - 1.0) * dot(n, er) * er);
  let hv = cross(x, v);
  H2 = dot(hv, hv);
  // the ray's impact parameter b = r sin ψ / √(1 − 2M/r), and how fast it changes across the screen
  let b = length(x) * length(cross(n, er)) / al;
  let db = fwidth(b);
  var rmin = 1e9;
  let rh = 2.0 * M + 0.01;
  var glow = 0.0;
  var fell = false;
  var hit = false;
  var cd = vec3f(2.0);
  var len = 0.0;
  for (var i = 0; i < 150; i++) {
    let r = length(x);
    rmin = min(rmin, r);
    if (r < rh) { fell = true; break; }
    let dd = de(x);
    if (dd < px * len + 1e-4) { hit = true; break; }
    let sp = length(v);
    var h = 0.85 * dd / sp;
    if (r < RV && M > 0.0) { h = min(h, clamp(0.3 * (r - 2.0 * M), 0.01, 0.5 * r) / sp); }
    var xn: vec3f;
    if (r < RV && M > 0.0) {
      let a1 = pull(x);
      let a2 = pull(x + 0.5 * h * v + 0.125 * h * h * a1);
      let a3 = pull(x + 0.5 * h * v + 0.125 * h * h * a2);
      let a4 = pull(x + h * v + 0.5 * h * h * a3);
      xn = x + h * v + h * h / 6.0 * (a1 + a2 + a3);
      // the light orbiting at the photon sphere, beamed along its orbit
      let c = dot(x, v) / (r * sp);
      let s2 = 1.0 - c * c;
      let s4 = s2 * s2;
      let s16 = s4 * s4 * s4 * s4;
      let g = (r - 3.0 * M) / (0.15 * M);
      glow += exp(-g * g) * s16 * s16 * h * sp;
      v += h / 6.0 * (a1 + 2.0 * a2 + 2.0 * a3 + a4);
    } else {
      xn = x + h * v;
    }
    if (u.p[9].w > 0.0) {
      cd = card(x, xn - x);
      if (cd.x <= 1.0) { break; }
    }
    len += distance(x, xn);
    x = xn;
    if (len > FAR) { break; }
  }
  var col = vec3f(1.0, 0.8, 0.55) * glow * u.p[4].w * M * select(1.0, 0.25, fell);
  let d = normalize(v);
  let uv = 0.5 + vec2f(0.5, -0.5) * cd.yz;
  let lod = clamp(log2(max(length(fwidth(uv)) * 400.0, 1e-3)), 0.0, 6.0);
  if (hit) { col += pearl(x, d, len, px); }
  else if (cd.x <= 1.0) {
    let at = vec2f(3.0, 2.0); // R5's tile, the last of the worlds
    let e = exp2(lod) * vec2f(0.5 / 512.0, 0.5 / 320.0);
    col += textureSampleLevel(data, smp, (at + clamp(uv, e, 1.0 - e)) / vec2f(4.0, 3.0), lod).rgb * u.p[9].w;
  }
  else if (!fell) { col += vec3f(0.002, 0.002, 0.008); }
  // the photon ring: rays with b near 3√3 M wind round the photon sphere, more often the nearer, and
  // every image of the world is piled up there, finer than a pixel: the ring covers them with their light
  let bc = 5.196152 * M;
  let ring = M * exp(-abs(b - bc) / (0.012 * bc + 1.5 * db)) * select(0.0, 1.0, rmin < 4.0 * M);
  col = col * (1.0 - min(ring, 1.0)) + vec3f(1.0, 0.85, 0.65) * ring * 6.0 * u.p[4].w;
  return col * u.p[4].z;
}

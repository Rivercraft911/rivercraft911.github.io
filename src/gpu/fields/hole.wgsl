// The singularity · G = c = 1, lengths in the binary's total mass M, hanging in the aisle of a fractal nave.
//
// The binary: two equal holes, r_s = 1 each, orbiting in the xy plane. No metric of a binary is known in
// closed form, so each ray is bent by the sum of what each hole alone would do to it. Alone, a hole bends
// light along u'' + u = 3Mu², exactly Schwarzschild's photon orbits, which is the force
// x'' = −(3/2) r_s |x × x'|² x / |x|⁵; two of them are summed, the holes held still while a ray crosses
// (it takes a few M; an orbit takes hundreds) and their own frame dragging ignored. Each lenses the other
// and the nave: the arches wrapped into Einstein rings round two shadows, a third ring round both. A frame
// is exposed over a fraction of its interval, each pixel at its own instant in it, so a fast orbit smears.
//
// The remnant: one Kerr hole, M_f = 0.952, a = 0.653, every ray an exact null geodesic in Kerr–Schild
// coordinates, g = η + f c c, f = 2Mr³ / (r⁴ + a²z²), c = (1, −l), H = ½ (|p|² − E² − f (E − l·p)²) = 0,
// by RK4. The chart is the hole's own time-reversed, so a ray traced forward in it is one traced back in
// time in the hole: from outside, rays into the shadow pile up against r₊; from inside, they cross it
// cleanly. The eye falls (its 4-velocity from singularity.ts), so a pixel's photon is built in its own
// frame, aberrated and shifted by g as the eye sees it, and inside the horizon its energy E can be
// negative. Past the inner horizon a ray can reach the ring singularity, r = 0 at x² + y² = a², z = 0, or
// pass through the disk inside it to r < 0: a second universe where f < 0 and gravity repels, drawn in
// complementary colours. The ring glows (a singularity emits nothing: this light is the curvature,
// drawn). As the hole rings down, its mass is rippled by the l = m = 2 quasinormal mode,
// sin²θ cos(2φ − ωt), its gradient neglected, so the shadow's edge wobbles with the ringdown heard.
//
// The horizon remembers: a ray that falls in finds a dodecahedron of tiles, each a world of the fall, in
// the order they fell. Each is a static emitter lowered toward the horizon, r = r_s (1 + ε 2^((k−11)/2)
// e^(−t/T)): from outside it is seen redshifted by g = dτ/dt = √(1 − r_s/r), its light shifted and dimmed
// by g³ and its picture slowed by the same g, frozen the deeper it lies. From inside, the light piled up
// against the horizon is blueshifted; and seen back through the ring from the other universe, it pours out.
//
// p[0..3] camera   p[4] time, collapse, gain, open   p[5] binary, orbit angle, separation, angle swept exposed
// p[6] M, a, the eye's sheet, ring light   p[7] ripple, its phase, its sweep   p[8] ε, t/T, memory light, blue
// p[9].w nave light   p[10] sky, edges, nave scale   p[11] the eye's 4-velocity   p[12..14] the falling Julia

const RV = 80.0; // past this, rays run straight

fn hash3(p: vec3f) -> f32 { return fract(sin(dot(p, vec3f(127.1, 311.7, 74.7))) * 43758.5453); }

fn hashu(p: vec3i) -> f32 {
  var n = (u32(p.x) * 73856093u) ^ (u32(p.y) * 19349663u) ^ (u32(p.z) * 83492791u);
  n = (n ^ (n >> 13u)) * 1274126177u;
  return f32(n ^ (n >> 16u)) * 2.3283064e-10;
}
fn noise(x: vec3f) -> f32 {
  let i = vec3i(floor(x));
  let f = fract(x);
  let w = f * f * (3.0 - 2.0 * f);
  let a = mix(mix(hashu(i), hashu(i + vec3i(1, 0, 0)), w.x), mix(hashu(i + vec3i(0, 1, 0)), hashu(i + vec3i(1, 1, 0)), w.x), w.y);
  let b = mix(mix(hashu(i + vec3i(0, 0, 1)), hashu(i + vec3i(1, 0, 1)), w.x), mix(hashu(i + vec3i(0, 1, 1)), hashu(i + vec3i(1, 1, 1)), w.x), w.y);
  return mix(a, b, w.z);
}

// Complementary colour, as bright: the other universe.
fn other(c: vec3f) -> vec3f { return max(c.r, max(c.g, c.b)) + min(c.r, min(c.g, c.b)) - c; }

// The binary: each hole's pull on a ray at x heading v, summed. C is the first hole; the second is at −C.
var<private> C: vec3f;
fn pull(x: vec3f, v: vec3f) -> vec3f {
  let y1 = x - C;
  let y2 = x + C;
  let h1 = cross(y1, v);
  let h2 = cross(y2, v);
  let r1 = dot(y1, y1);
  let r2 = dot(y2, y2);
  return -1.5 * (dot(h1, h1) * y1 / (r1 * r1 * sqrt(r1)) + dot(h2, h2) * y2 / (r2 * r2 * sqrt(r2)));
}

// Kerr. The metric's r at x: the root of r⁴ − (|x|² − a²) r² − a²z² = 0, on the ray's sheet: SH < 0 past the ring.
var<private> A: f32;
var<private> M: f32;
var<private> SH: f32;
var<private> E: f32; // the photon's energy at infinity, ±1: inside the horizon it can be negative
var<private> W: vec3f; // the ripple: amplitude, cos and sin of its phase
fn rad(x: vec3f) -> f32 {
  let w = dot(x, x) - A * A;
  return SH * sqrt(max(0.5 * (w + sqrt(w * w + 4.0 * A * A * x.z * x.z)), 1e-12));
}

// g(a, b) = η(a, b) + f (c·a)(c·b), for 4-vectors (t, x, y, z).
fn gm(a: vec4f, b: vec4f, f: f32, c: vec4f) -> f32 { return -a.x * b.x + dot(a.yzw, b.yzw) + f * dot(c, a) * dot(c, b); }

// Hamilton's equations: returns dp/dλ = −∂H/∂x and writes dx/dλ = ∂H/∂p. ∇r = r (r²x, r²y, (r² + a²) z) / D.
var<private> R: f32;
fn flow(x: vec3f, p: vec3f, dx: ptr<function, vec3f>) -> vec3f {
  let a = A;
  let a2 = a * a;
  let r = rad(x);
  let r2 = r * r;
  let R2 = r2 + a2;
  let D = r2 * r2 + a2 * x.z * x.z + 1e-12;
  let s2 = dot(x.xy, x.xy);
  let m = M * (1.0 + W.x * ((x.x * x.x - x.y * x.y) * W.y + 2.0 * x.x * x.y * W.z) / (s2 + x.z * x.z + 1e-6));
  let f = 2.0 * m * r2 * r / D;
  let l = vec3f((r * x.x + a * x.y) / R2, (r * x.y - a * x.x) / R2, x.z / r);
  let k = E - dot(l, p);
  *dx = p + f * k * l;
  let gr = r * vec3f(r2 * x.x, r2 * x.y, R2 * x.z) / D;
  let gf = 2.0 * m * r2 * ((3.0 * a2 * x.z * x.z - r2 * r2) * gr - vec3f(0.0, 0.0, 2.0 * a2 * r * x.z)) / (D * D);
  let S = x.x * p.x + x.y * p.y;
  let T = x.y * p.x - x.x * p.y;
  let dL = S / R2 - 2.0 * r * (r * S + a * T) / (R2 * R2) - x.z * p.z / r2;
  let gL = vec3f((r * p.x - a * p.y) / R2, (r * p.y + a * p.x) / R2, p.z / r) + dL * gr;
  R = r;
  return 0.5 * k * k * gf - f * k * gL;
}

// One law for both: the binary's rays carry their velocity as p.
var<private> BIN: bool;
fn deriv(x: vec3f, p: vec3f, dx: ptr<function, vec3f>) -> vec3f {
  if (BIN) { *dx = p; return pull(x, p); }
  return flow(x, p, dx);
}

// A blackbody at T kelvin, at 630, 532 and 465 nm, white-balanced so that 6500 K is white.
fn planck(T: f32) -> vec3f {
  let l = vec3f(0.63, 0.532, 0.465);
  return vec3f(1.198, 1.0, 0.936) / (l * l * l * l * l * (exp(min(14388.0 / (l * max(T, 300.0)), vec3f(80.0))) - 1.0));
}

// Light shifted by g: what is seen at λ left at gλ, as I_ν/ν³ is conserved, so it is g³ as bright. The
// spectrum between the three samples is taken as linear, out to nothing at 100 nm and 1.2 μm.
fn spec(c: vec3f, l: f32) -> f32 {
  if (l < 465.0) { return c.b * clamp((l - 100.0) / 365.0, 0.0, 1.0); }
  if (l < 532.0) { return mix(c.b, c.g, (l - 465.0) / 67.0); }
  if (l < 630.0) { return mix(c.g, c.r, (l - 532.0) / 98.0); }
  return c.r * clamp((1200.0 - l) / 570.0, 0.0, 1.0);
}
fn shift(c: vec3f, g: f32) -> vec3f { return g * g * g * vec3f(spec(c, 630.0 * g), spec(c, 532.0 * g), spec(c, 465.0 * g)); }

// The nave: R4's kaleidoscopic IFS, a Menger sponge turned about its aisle at every fold, S to a unit,
// laid along x so the holes hang in the aisle, one cell thick and three long, open to the sky beyond.
var<private> trap: f32;
fn turn(v: vec2f, a: f32) -> vec2f { return vec2f(cos(a) * v.x - sin(a) * v.y, sin(a) * v.x + cos(a) * v.y); }
fn hall(x: vec3f) -> f32 {
  let S = u.p[10].z;
  var p = x.yzx / S;
  p -= 2.0 * round(0.5 * p);
  var s = 1.0;
  trap = 1e9;
  for (var i = 0; i < 6; i++) {
    p = abs(p);
    if (p.x < p.y) { p = p.yxz; }
    if (p.x < p.z) { p = p.zyx; }
    if (p.y < p.z) { p = p.xzy; }
    p = vec3f(turn(p.xy, 0.12), p.z);
    p = 3.0 * p - vec3f(2.0, 2.0, 0.0);
    if (p.z > 1.0) { p.z -= 2.0; }
    s *= 3.0;
    trap = min(trap, dot(p, p));
  }
  let e = abs(p) - 1.0;
  return max(S * (length(max(e, vec3f(0.0))) + min(max(e.x, max(e.y, e.z)), 0.0)) / s, max(abs(x.x) - 3.0 * S, max(abs(x.y), abs(x.z)) - S));
}

// Where the chord from x to x + v meets the nave, as a fraction of it, or −1; t0 is how far the ray had run.
fn meet(x: vec3f, v: vec3f, t0: f32) -> f32 {
  let L = length(v);
  var t = 0.0;
  for (var i = 0; i < 48; i++) {
    let h = hall(x + v * (t / L));
    if (h < cone() * (t0 + t) + 1e-3) { return t / L; }
    t += h;
    if (t > L) { break; }
  }
  return -1.0;
}

// The nave at P, seen from along d, lit from the crossing where the holes hang: bone where the light falls,
// verdigris in the shade.
fn stone(P: vec3f, d: vec3f, t: f32) -> vec3f {
  let e = 0.5 * cone() * t;
  let k = vec2f(1.0, -1.0);
  let n = normalize(k.xyy * hall(P + k.xyy * e) + k.yyx * hall(P + k.yyx * e) + k.yxy * hall(P + k.yxy * e) + k.xxx * hall(P + k.xxx * e));
  let w = 0.02 * u.p[10].z;
  let ao = clamp(hall(P + n * w) / w, 0.0, 1.0) * clamp(0.5 + 0.5 * hall(P + n * 4.0 * w) / (4.0 * w), 0.0, 1.0);
  hall(P);
  let L = -normalize(P);
  let fire = vec3f(1.0, 0.7, 0.42) * pow(max(dot(n, L), 0.0), 1.5) * 600.0 / dot(P, P);
  let rim = pow(1.0 - abs(dot(n, d)), 4.0);
  let bone = vec3f(1.0, 0.82, 0.55);
  let verdigris = vec3f(0.02, 0.45, 0.38);
  let c = (mix(verdigris, bone, smoothstep(0.5, 3.0, trap)) * (0.03 + fire) + 0.2 * rim * verdigris) * ao;
  return mix(vec3f(0.0, 0.002, 0.003), c, exp(-0.004 * t)) * u.p[9].w;
}

// The worlds, a tile each in the shots, as bright as each other.
fn world(i: i32, uv: vec2f, lod: f32) -> vec3f {
  let l = clamp(lod, 0.0, 5.0);
  let e = exp2(l) * vec2f(0.5 / 512.0, 0.5 / 320.0);
  let at = vec2f(f32(i % 4), f32(i / 4));
  let mean = textureSampleLevel(data, smp, (at + 0.5) / vec2f(4.0, 3.0), 6.0).rgb;
  let c = textureSampleLevel(data, smp, (at + clamp(uv, e, 1.0 - e)) / vec2f(4.0, 3.0), l).rgb;
  return c * 0.35 / (0.03 + dot(mean, vec3f(0.3, 0.6, 0.1)));
}

// The dodecahedron's face toward d (the icosahedron's vertex it faces): its index, where in it, and how
// near its edge.
var<private> AX: array<vec3f, 6> = array<vec3f, 6>(
  vec3f(0.0, 0.5257, 0.8507), vec3f(0.0, 0.5257, -0.8507), vec3f(0.5257, 0.8507, 0.0),
  vec3f(-0.5257, 0.8507, 0.0), vec3f(0.8507, 0.0, 0.5257), vec3f(0.8507, 0.0, -0.5257));
var<private> FACE: i32;
var<private> EDGE: f32;
fn face(d: vec3f) -> vec2f {
  var b = -1.0;
  var b2 = -1.0;
  var n = vec3f(0.0);
  for (var k = 0; k < 6; k++) {
    let s = dot(d, AX[k]);
    let m = abs(s);
    if (m > b) { b2 = b; b = m; FACE = 2 * k + select(0, 1, s < 0.0); n = AX[k] * sign(s); }
    else if (m > b2) { b2 = m; }
  }
  let g = d / b - n;
  let e1 = normalize(cross(n, vec3f(0.36, 0.48, 0.8)));
  EDGE = b - b2;
  return vec2f(0.5 + dot(g, e1) / 2.24, 0.5 - dot(g, cross(n, e1)) / 1.4);
}

// The sky toward d: a world in every face, starlight between.
fn sky(d: vec3f, lod: f32) -> vec3f {
  let uv = face(d);
  var c = world(FACE, uv, lod) * u.p[10].x;
  c += vec3f(1.2, 0.85, 0.5) * exp(-EDGE * EDGE / 1e-5) * u.p[10].y;
  let star = hash3(floor(d * 300.0));
  return c + vec3f(0.8, 0.85, 1.0) * step(0.996, star) * 3.0 * smoothstep(0.35, 0.0, length(fract(d * 300.0) - 0.5));
}

// The memory on a horizon, toward n from its centre. Tile k (the k-th world we fell through) is an emitter
// at r = r_s (1 + e), e = ε 2^(k−11) e^(−t/T), seen at g = √(e / (1 + e)) or, from inside, blue; its own
// clock has run τ = 2T (asinh √e₀ − asinh √e), and its picture zooms on as that clock runs.
fn memory(n: vec3f, lod: f32, blue: f32) -> vec3f {
  let uv = face(n);
  let e0 = u.p[8].x * exp2(0.5 * (f32(FACE) - 11.0));
  let e = e0 * exp(-u.p[8].y);
  var g = sqrt(e / (1.0 + e));
  var tau = 2.0 * (asinh(sqrt(e0)) - asinh(sqrt(e)));
  if (blue > 0.0) { g = blue; tau = blue * u.p[8].y; }
  let z = exp2(-0.6 * tau);
  let c = world(FACE, 0.5 + (uv - 0.5) * z, lod) + vec3f(1.2, 0.85, 0.5) * exp(-EDGE * EDGE / 4e-5) * 0.3;
  return shift(c, g) * u.p[8].z * select(1.0, 0.25, blue > 0.0);
}

// The last world, the Julia set, as the raster last showed it: a picture at c spanning ±U, ±V, falling into
// the first hole, stretched along its fall and redshifted by g as it goes. Where the chord x to x + v meets it: its
// light, and how much it hides, its dark ground opaque only at first.
fn card(x: vec3f, v: vec3f) -> vec4f {
  let U = u.p[13].xyz;
  let V = u.p[14].xyz;
  let n = cross(U, V);
  let s = dot(u.p[12].xyz - x, n) / dot(v, n);
  if (!(s >= 0.0 && s <= 1.0)) { return vec4f(0.0); }
  let P = x + s * v - u.p[12].xyz;
  let uu = dot(U, U);
  let uv = dot(U, V);
  let vv = dot(V, V);
  let pu = dot(P, U);
  let pv = dot(P, V);
  let w = vec2f(pu * vv - pv * uv, pv * uu - pu * uv) / (uu * vv - uv * uv);
  if (max(abs(w.x), abs(w.y)) > 1.0) { return vec4f(0.0); }
  let at = (vec2f(3.0, 2.0) + clamp(0.5 + vec2f(0.5, -0.5) * w, vec2f(0.001), vec2f(0.999))) / vec2f(4.0, 3.0);
  let c = textureSampleLevel(data, smp, at, 0.0).rgb;
  return vec4f(shift(c, u.p[13].w) * u.p[12].w, max(smoothstep(0.01, 0.06, dot(c, vec3f(0.3, 0.6, 0.1))), u.p[14].w));
}

fn field(q0: vec2f) -> vec3f {
  let z = u.p[4].y;
  let q = q0 * z;
  let rim = smoothstep(1.7 + 1.0 / z, 1.2 + 1.0 / z, length(q)); // the collapse: the picture shrinks to a point
  let jt = hash3(vec3f(q0 * 331.0, u.p[4].x + 7.0)); // the instant this pixel is exposed at
  BIN = u.p[5].x > 0.5;
  let psi = u.p[5].y - jt * u.p[5].w;
  C = 0.5 * u.p[5].z * vec3f(cos(psi), sin(psi), 0.0);
  M = u.p[6].x;
  A = u.p[6].y;
  SH = u.p[6].z;
  let chi = u.p[7].y - jt * u.p[7].z;
  W = vec3f(u.p[7].x, cos(chi), sin(chi));
  let rh = M + sqrt(max(M * M - A * A, 0.0));
  let open = u.p[4].w > 0.5;
  var x = eye();
  let n = ray(q);
  let lodn = log2(length(fwidth(n)) / 0.0044);
  var p = n;
  var g = 1.0; // the light's shift, from where it set out at rest to the eye
  if (!BIN) {
    // The eye falls, with 4-velocity U (time-reversed, as the chart is): its frame is U and the camera's
    // axes made orthonormal to it in the metric, and a pixel's photon is U + its direction in that frame.
    let r0 = rad(x);
    let l0 = vec3f((r0 * x.x + A * x.y) / (r0 * r0 + A * A), (r0 * x.y - A * x.x) / (r0 * r0 + A * A), x.z / r0);
    let f0 = 2.0 * M * r0 * r0 * r0 / (r0 * r0 * r0 * r0 + A * A * x.z * x.z + 1e-12);
    let c = vec4f(1.0, -l0); // the chart's null covector
    let e0 = u.p[11];
    var e = array<vec4f, 3>(vec4f(0.0, u.p[1].xyz), vec4f(0.0, u.p[2].xyz), vec4f(0.0, u.p[3].xyz));
    for (var i = 0; i < 3; i++) {
      var v = e[i] + gm(e[i], e0, f0, c) * e0;
      for (var k = 0; k < i; k++) { v -= gm(v, e[k], f0, c) * e[k]; }
      e[i] = v / sqrt(max(gm(v, v, f0, c), 1e-9));
    }
    let o = normalize(vec3f(q, u.p[0].w));
    let k = e0 + o.x * e[0] + o.y * e[1] + o.z * e[2];
    let ck = dot(c, k);
    let pt = -k.x + f0 * ck;
    E = sign(-pt);
    p = (k.yzw - f0 * l0 * ck) / abs(pt);
    g = 1.0 / abs(pt);
  }
  var c = vec3f(0.0); // the light gathered on the way
  var tr = 1.0; // and how much of what lies beyond still shows
  var end = 0; // 0 lost, 1 escaped, 2 the nave, 3 fell in, 4 the ring, 5 piled against a horizon from inside
  var len = 0.0;
  var dx = p;
  var at = vec3f(0.0); // where it fell, from the centre of the hole it fell into
  var free = vec4f(x, hall(x)); // a ball the nave is known to keep clear of
  for (var i = 0; i < 90; i++) {
    let dp1 = deriv(x, p, &dx);
    var h: f32;
    var far: f32;
    if (BIN) {
      let y1 = x - C;
      let y2 = x + C;
      let d1 = length(y1);
      let d2 = length(y2);
      if (min(d1, d2) < 1.01) { end = 3; at = select(y2, y1, d1 < d2); break; }
      far = length(x);
      h = 0.35 * (min(d1, d2) - 0.85);
    } else {
      let ring = length(vec2f(length(x.xy) - A, x.z));
      if (ring < 0.004) { end = 4; break; }
      // past the ring it glows: the curvature, M r / Σ³, drawn
      if (ring < 0.4) { c += vec3f(1.0, 0.75, 0.4) * u.p[6].w * 0.03 / (ring * ring) * min(0.25 * ring, 0.1); }
      // against a horizon its momentum diverges: from outside it has fallen in, from inside it piles up
      if (dot(p, p) > 400.0 || (!open && R < rh + 0.02)) { end = select(3, 5, open); at = x; break; }
      far = abs(R);
      h = min(0.3 * max(abs(R - rh), select(0.0, 0.25 * ring, open)), 0.5 * far);
      h = max(h, 2e-3) / max(length(dx), 1.0);
    }
    if (far > RV && dot(x, dx) > 0.0) { end = 1; break; }
    let dx1 = dx;
    var dx2: vec3f;
    var dx3: vec3f;
    var dx4: vec3f;
    let dp2 = deriv(x + 0.5 * h * dx1, p + 0.5 * h * dp1, &dx2);
    let dp3 = deriv(x + 0.5 * h * dx2, p + 0.5 * h * dp2, &dx3);
    let dp4 = deriv(x + h * dx3, p + h * dp3, &dx4);
    let xn = x + h / 6.0 * (dx1 + 2.0 * dx2 + 2.0 * dx3 + dx4);
    p += h / 6.0 * (dp1 + 2.0 * dp2 + 2.0 * dp3 + dp4);
    // through the disk inside the ring, to the other sheet
    if (!BIN && x.z * xn.z < 0.0) {
      let c = mix(x, xn, x.z / (x.z - xn.z));
      if (dot(c.xy, c.xy) < A * A) { SH = -SH; }
    }
    if (u.p[12].w > 0.0) {
      let k = card(x, xn - x);
      c += tr * k.w * k.rgb;
      tr *= 1.0 - k.w;
      if (tr < 0.01) { end = 6; break; }
    }
    // the nave, wherever this step of the ray might reach it
    let v = xn - x;
    if (distance(xn, free.xyz) > free.w) {
      free = vec4f(x, hall(x));
      if (free.w < length(v)) {
        let m = meet(x, v, len);
        if (m >= 0.0) { x += m * v; len += m * length(v); end = 2; break; }
      }
    }
    len += length(v);
    x = xn;
  }
  let d = normalize(dx);
  let lod = log2(length(fwidth(d)) / 0.0044); // a sky texel is 0.0044 rad
  var e = vec3f(0.0);
  if (end == 2) { e = stone(x, d, len); }
  else if (end == 1) {
    // past r = RV the rays run straight
    let m = meet(x, 200.0 * d, len);
    if (m >= 0.0) { e = stone(x + 200.0 * m * d, d, len + 200.0 * m); }
    else { e = sky(d, lod); }
  }
  else if (end == 3) {
    var t = at;
    if (BIN) { t = vec3f(turn(at.xy, -psi), at.z); } // the memory turns with its hole
    e = memory(normalize(t), lod - 2.0, 0.0);
  }
  else if (end == 5) { e = memory(n, lodn, u.p[8].w); } // piled up against a horizon: from inside, all one glow, so drawn on the sky
  else if (end == 4) { e = vec3f(1.0, 0.75, 0.4) * u.p[6].w * 40.0; }
  if (end < 3 && !BIN) { e = shift(e, g); }
  if (SH < 0.0) { e = other(e); }
  else if (u.p[6].z < 0.0 && end < 4) { e = memory(d, lod, 1.5); } // seen back through the ring: all that fell in, pouring out, time-reversed
  c += tr * e;
  return c * rim * u.p[4].z;
}

// R4 · {4,3,5}: hyperbolic space filled with cubes, five around every edge, in the Poincaré ball. A cube's
// faces are spheres orthogonal to the ball, centred on the axes at c with radius r; five fit round an edge
// when the dihedral angle is 2π/5, which makes r² = 1/cos(2π/5) = 2φ and c² = 1 + r². A point is folded by
// the cube's 48 mirrors and inverted in a face until it lies in the central cube's chamber; there the nearest
// edge is where the x- and y-faces meet, a circle in the plane x = y. We sphere-trace in hyperbolic
// distance itself, along geodesics from the eye, and fall face to face through the cubes, a period of
// 2 atanh(c − r) at a time. Violet, the corners crimson.
//
// p[1..3] the eye's turn (as the camera)   p[4] how far we have fallen, gain

const C = 2.0581710;
const R2 = 3.2360680;
const RHO = 1.0574; // the edge circle's radius: √(r² − c²/2)
const S = 0.70710678;

var<private> corner: f32;

// Hyperbolic distance from p to the nearest edge.
fn edges(p0: vec3f) -> f32 {
  var p = p0;
  for (var i = 0; i < 12; i++) {
    p = abs(p);
    if (p.x < p.y) { p = p.yxz; }
    if (p.x < p.z) { p = p.zyx; }
    if (p.y < p.z) { p = p.xzy; }
    let v = p - vec3f(C, 0.0, 0.0);
    let d2 = dot(v, v);
    if (d2 >= R2) { break; }
    p = vec3f(C, 0.0, 0.0) + v * (R2 / d2);
  }
  corner = length(p - vec3f(0.3155));
  let w = (p.x - p.y) * S;
  let e = length(vec2f(w, length(vec2f((p.x + p.y - C) * S, p.z)) - RHO));
  return e * 2.0 / max(1.0 - dot(p, p), 1e-4);
}

// The hyperbolic translation along x that takes the centre to a·x̂.
fn carry(p: vec3f, a: f32) -> vec3f {
  let d = 1.0 + 2.0 * a * p.x + a * a * dot(p, p);
  return ((1.0 + 2.0 * a * p.x + dot(p, p)) * vec3f(a, 0.0, 0.0) + (1.0 - a * a) * p) / d;
}

fn field(q: vec2f) -> vec3f {
  let rd = ray(q);
  let a = tanh(0.5 * u.p[4].x);
  var s = 0.02;
  var glow = 0.0;
  var hit = false;
  for (var i = 0; i < 72; i++) {
    let d = edges(carry(tanh(0.5 * s) * rd, a)) - 0.03;
    glow += exp(-12.0 * max(d, 0.0)) * exp(-0.45 * s) * 0.05;
    if (d < 0.002 * s) { hit = true; break; }
    s += 0.9 * d;
    if (s > 9.0) { break; }
  }
  var col = vec3f(0.35, 0.12, 1.0) * glow;
  if (hit) {
    let hot = smoothstep(0.25, 0.0, corner);
    col += mix(vec3f(0.6, 0.25, 1.6), vec3f(1.8, 0.15, 0.3), hot) * exp(-0.42 * s);
  }
  return col * u.p[4].y;
}

// R5 · Ophanim: three torus knots on nested tori of S³, (cos η e^{ipθ}, sin η e^{iqθ}), turning isoclinically
// (both coordinates by the same phase, so every point slides along its Hopf fiber), seen in ℝ³ through the
// same stereographic projection the beam's fibers use. Each ray is traced through ℝ³; every point is lifted
// back to S³, where its distance to a knot is found in closed form: the knot's p branches through arg z₁,
// the miss in arg z₂ split between the two windings, and the moduli's miss from (cos η, sin η); the projection's
// conformal factor (1 + r²)/2 brings it back. Gold, crimson, violet, and their glow.
//
// p[0..3] camera   p[4] gain, phase   p[5] tube radius

const TAU = 6.2831853;

var<private> which: i32;
var<private> glowc: vec3f;

fn wrap(a: f32) -> f32 { return a - TAU * round(a / TAU); }

fn knot(z1: vec2f, z2: vec2f, p: f32, q: f32, ph: f32, eta: f32) -> f32 {
  let m1 = length(z1);
  let m2 = length(z2);
  let c = cos(eta);
  let s = sin(eta);
  let a1 = atan2(z1.y, z1.x) - ph;
  let a2 = atan2(z2.y, z2.x) - ph;
  var e = 1e9;
  for (var j = 0.0; j < p; j += 1.0) {
    let th = (a1 + TAU * j) / p;
    e = min(e, abs(wrap(a2 - q * th)));
  }
  let ang = e * c * s * p / sqrt(p * p * s * s + q * q * c * c);
  return sqrt((m1 - c) * (m1 - c) + (m2 - s) * (m2 - s) + ang * ang);
}

fn de(P: vec3f) -> f32 {
  let r2 = dot(P, P);
  let k = 2.0 / (1.0 + r2);
  let z1 = k * P.xy;
  let z2 = vec2f(k * P.z, (r2 - 1.0) / (r2 + 1.0));
  let ph = u.p[4].y;
  let back = 0.5 * (1.0 + r2);
  let d0 = knot(z1, z2, 2.0, 3.0, ph, 0.785) * back;
  let d1 = knot(z1, z2, 3.0, 5.0, -0.7 * ph + 1.0, 0.45) * back;
  let d2 = knot(z1, z2, 2.0, 5.0, 1.3 * ph + 2.0, 1.12) * back;
  which = 0;
  var d = d0;
  if (d1 < d) { d = d1; which = 1; }
  if (d2 < d) { d = d2; which = 2; }
  return d - u.p[5].x;
}

fn colour(i: i32) -> vec3f {
  if (i == 0) { return vec3f(1.5, 0.95, 0.3); }
  if (i == 1) { return vec3f(1.4, 0.12, 0.18); }
  return vec3f(0.55, 0.25, 1.5);
}

fn field(q: vec2f) -> vec3f {
  let ro = eye();
  let rd = ray(q);
  var t = 0.0;
  var glow = vec3f(0.0);
  for (var i = 0; i < 80; i++) {
    let d = de(ro + rd * t);
    glow += colour(which) * exp(-10.0 * max(d, 0.0)) * 0.03;
    if (d < 0.002 * t) {
      let n = normalize(vec3f(de(ro + rd * t + vec3f(0.01, 0.0, 0.0)), de(ro + rd * t + vec3f(0.0, 0.01, 0.0)), de(ro + rd * t + vec3f(0.0, 0.0, 0.01))) - d);
      de(ro + rd * t);
      let rim = pow(1.0 - abs(dot(n, rd)), 2.0);
      return (colour(which) * (0.35 + 0.9 * rim) + glow) * u.p[4].x;
    }
    t += 0.85 * d;
    if (t > 14.0) { break; }
  }
  return glow * u.p[4].x;
}

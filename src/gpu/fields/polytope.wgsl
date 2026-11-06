// R5 · The tesseract and the 24-cell, inscribed in the 3-sphere and turned through 4D, seen in ℝ³ through
// the stereographic projection the beam's 600-cell uses, so their edges bow into arcs of circles and swell
// toward the pole. A ray is traced through ℝ³; every point on it is lifted to S³ and turned by the pair of
// unit quaternions (L, R), s ↦ L s R, which is every rotation of four dimensions. The tesseract's 384
// symmetries fold it into one chamber (|s|, sorted), where the nearest tesseract edge runs from
// (½, ½, ½, ½) across its smallest coordinate, the nearest edge the 24-cell adds runs from (1, 0, 0, 0) to
// (½, ½, ½, ½), and the nearest vertices are those two. Distances on S³ come back to ℝ³ by the projection's
// conformal factor (1 + r²)/2. Gold, crimson, and eyes on every vertex, open on alternate symbols.
//
// p[0..3] camera   p[4] L   p[5] R   p[6] tube, growth of the 24-cell, eyes, gain

var<private> part: i32;

fn qmul(a: vec4f, b: vec4f) -> vec4f {
  return vec4f(a.x * b.x - dot(a.yzw, b.yzw), a.x * b.yzw + b.x * a.yzw + cross(a.yzw, b.yzw));
}

// Angle on S³ from s to the great-circle arc a → b.
fn arc(s: vec4f, a: vec4f, b: vec4f) -> f32 {
  let c = dot(a, b);
  let e = normalize(b - c * a);
  let x = dot(s, a);
  let y = dot(s, e);
  let th = atan2(y, x);
  if (th > 0.0 && th < acos(c)) { return acos(min(1.0, length(vec2f(x, y)))); }
  return acos(min(1.0, max(x, dot(s, b))));
}

// |s| sorted, largest first: the chamber of the tesseract's symmetries.
fn chamber(v: vec4f) -> vec4f {
  let s = abs(v);
  let a = max(s.xz, s.yw);
  let b = min(s.xz, s.yw);
  return vec4f(max(a.x, a.y), max(min(a.x, a.y), max(b.x, b.y)), min(min(a.x, a.y), max(b.x, b.y)), min(b.x, b.y));
}

fn de(P: vec3f) -> f32 {
  let r2 = dot(P, P);
  let s = chamber(qmul(qmul(u.p[4], vec4f(2.0 * P, r2 - 1.0) / (1.0 + r2)), u.p[5]));
  let h = vec4f(0.5);
  let tube = u.p[6].x;
  let grow = u.p[6].y;
  let cube = arc(s, h, vec4f(0.5, 0.5, 0.5, -0.5)) - tube;
  let cell = select(1e9, arc(s, vec4f(1.0, 0.0, 0.0, 0.0), h) - tube * grow, grow > 0.0);
  let ball = min(acos(min(1.0, dot(s, h))), select(1e9, acos(min(1.0, s.x)), grow > 0.0)) - u.p[6].z * tube;
  part = 0;
  var d = cube;
  if (cell < d) { d = cell; part = 1; }
  if (ball < d) { d = ball; part = 2; }
  return d * 0.5 * (1.0 + r2);
}

fn colour(i: i32) -> vec3f {
  if (i == 0) { return vec3f(1.5, 0.95, 0.3); }
  if (i == 1) { return vec3f(1.4, 0.12, 0.2); }
  return vec3f(3.0, 2.8, 2.4);
}

fn field(q: vec2f) -> vec3f {
  let ro = eye();
  let rd = ray(q);
  var t = 0.0;
  var glow = vec3f(0.0);
  for (var i = 0; i < 90; i++) {
    let P = ro + rd * t;
    let d = de(P);
    glow += colour(part) * exp(-20.0 * max(d, 0.0)) * 0.006;
    if (d < 0.002 * t + 1e-4) {
      let e = vec2f(0.002 * t + 1e-4, 0.0);
      let n = normalize(vec3f(de(P + e.xyy) - de(P - e.xyy), de(P + e.yxy) - de(P - e.yxy), de(P + e.yyx) - de(P - e.yyx)));
      de(P);
      let key = normalize(vec3f(0.4, 0.8, 0.3));
      let dif = max(dot(n, key), 0.0);
      let spec = pow(max(dot(reflect(rd, n), key), 0.0), 50.0);
      let rim = pow(1.0 - abs(dot(n, rd)), 2.0);
      let col = colour(part) * (0.08 + 0.7 * dif + 0.6 * rim) + spec;
      return (mix(glow, col, exp(-0.05 * t))) * u.p[6].w;
    }
    t += 0.7 * d;
    if (t > 30.0) { break; }
  }
  return glow * u.p[6].w;
}

// R5 · A quaternion Julia set: q ↦ q² + c over the quaternions, whose bounded orbits fill a body in four
// dimensions. We can only see a slice of it: the point x of our space is the quaternion (x, w) turned by
// an angle in the plane of the real and the k axes, and as the angle turns the slice sweeps through the
// fourth dimension, and the body grows and splits around us. Its distance bound is the Julia's own,
// ½ |q| ln |q| / |q′| with q′ ↦ 2 q q′; its skin is a soap film, its thickness the orbit's trap.
//
// p[0..3] camera   p[4] c   p[5] w, turn, gain

var<private> trap: f32;

fn de(x: vec3f) -> f32 {
  let a = u.p[5].y;
  let w = u.p[5].x;
  var q = vec4f(x.x * cos(a) - w * sin(a), x.y, x.z, x.x * sin(a) + w * cos(a));
  var dq = 1.0;
  var m = dot(q, q);
  trap = 1e9;
  for (var i = 0; i < 11; i++) {
    dq *= 2.0 * sqrt(m);
    q = vec4f(q.x * q.x - dot(q.yzw, q.yzw), 2.0 * q.x * q.yzw) + u.p[4];
    m = dot(q, q);
    trap = min(trap, m);
    if (m > 16.0) { break; }
  }
  let r = sqrt(m);
  return 0.5 * r * log(r) / dq;
}

fn field(q: vec2f) -> vec3f {
  let ro = eye();
  let rd = ray(q);
  let h = march(ro, rd, 8.0, 120);
  let deep = vec3f(0.004, 0.002, 0.01);
  if (h.x < 0.0) { return deep * u.p[5].z; }
  let P = ro + rd * h.x;
  let n = normal(P, 0.5 * cone() * h.x);
  de(P);
  let ao = pow(1.0 - h.y / 120.0, 2.0);
  let c = abs(dot(n, rd));
  let key = normalize(vec3f(0.3, 0.9, 0.4));
  let dif = max(dot(n, key), 0.0);
  let skin = film(120.0 + 300.0 * sqrt(trap), c) * 9.0 + vec3f(0.08, 0.07, 0.1);
  let col = (skin * (0.2 + dif) + vec3f(0.3, 0.15, 0.6) * pow(1.0 - c, 3.0)) * ao;
  return mix(deep, col, exp(-0.2 * h.x)) * u.p[5].z;
}

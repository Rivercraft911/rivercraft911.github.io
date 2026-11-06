// R4 · A pseudo-Kleinian (Knighty): a true Kleinian group's limit set is what is left when space is folded by
// its mirrors and inverted in its spheres until nothing moves. Here a box fold stands in for the mirrors and
// one sphere for the inversions, and the set left over is cut by a thin cylinder, so it reads as a
// cathedral of arches without end. Slate, lit from within by gold at the trap.
//
// p[0..3] camera   p[4] box (x = y, z), sphere, gain

var<private> trap: vec4f;

fn de(q: vec3f) -> f32 {
  let box = u.p[4].xxy;
  var p = q;
  var s = 1.0;
  trap = vec4f(1e9);
  for (var i = 0; i < 7; i++) {
    p = 2.0 * clamp(p, -box, box) - p;
    let r2 = dot(p, p);
    trap = min(trap, vec4f(abs(p), r2));
    let k = max(u.p[4].z / r2, 1.0);
    p *= k;
    s *= k;
  }
  let rxy = length(p.xy);
  return max(rxy - 0.92784, abs(rxy * p.z) / length(p)) / s;
}

fn field(q: vec2f) -> vec3f {
  let ro = eye();
  let rd = ray(q);
  let h = march(ro, rd, 12.0, 110);
  let haze = vec3f(0.03, 0.02, 0.012);
  if (h.x < 0.0) { return haze * u.p[4].w; }
  let P = ro + rd * h.x;
  let n = normal(P, 0.5 * cone() * h.x);
  de(P);
  let ao = pow(1.0 - h.y / 110.0, 2.0);
  let key = normalize(vec3f(-0.3, 0.8, 0.5));
  let dif = 0.5 + 0.5 * dot(n, key);
  let slate = vec3f(0.22, 0.3, 0.42);
  let gold = vec3f(2.0, 1.2, 0.35);
  let glow = gold * exp(-30.0 * trap.w) + vec3f(0.05, 0.3, 0.5) * exp(-400.0 * trap.z);
  let col = (slate * dif * dif + glow) * ao * 0.7;
  return mix(haze, col, exp(-0.25 * h.x)) * u.p[4].w;
}

// R4 · A Sierpinski tetrahedron, kaleidoscopic (Knighty): fold space by the tetrahedron's three mirror
// planes x = y, x = z, y = z (after |p| has folded it into the tetrahedral octant), turn it, and scale it 2×
// about a vertex, again and again. What never escapes is the tetrahedron with its middle removed at every
// scale; the turns between folds twist it into coral. Jade, tipped with gold.
//
// p[0..3] camera   p[4] turn about z, turn about x, gain

fn turn(v: vec2f, a: f32) -> vec2f { return vec2f(cos(a) * v.x - sin(a) * v.y, sin(a) * v.x + cos(a) * v.y); }

var<private> trap: f32;

fn de(q: vec3f) -> f32 {
  var p = q;
  var s = 1.0;
  trap = 1e9;
  for (var i = 0; i < 12; i++) {
    if (p.x + p.y < 0.0) { p = vec3f(-p.y, -p.x, p.z); }
    if (p.x + p.z < 0.0) { p = vec3f(-p.z, p.y, -p.x); }
    if (p.y + p.z < 0.0) { p = vec3f(p.x, -p.z, -p.y); }
    p = vec3f(turn(p.xy, u.p[4].x), p.z);
    p = vec3f(p.x, turn(p.yz, u.p[4].y));
    p = 2.0 * p - vec3f(1.0);
    s *= 2.0;
    trap = min(trap, dot(p, p));
  }
  return (length(p) - 1.5) / s;
}

fn field(q: vec2f) -> vec3f {
  let ro = eye();
  let rd = ray(q);
  let h = march(ro, rd, 8.0, 100);
  let sky = vec3f(0.0, 0.002, 0.004);
  if (h.x < 0.0) { return sky * u.p[4].z; }
  let P = ro + rd * h.x;
  let n = normal(P, 0.5 * cone() * h.x);
  de(P);
  let ao = pow(1.0 - h.y / 100.0, 3.0);
  let key = normalize(vec3f(0.4, 0.9, -0.3));
  let dif = max(dot(n, key), 0.0);
  let spec = pow(max(dot(reflect(rd, n), key), 0.0), 30.0);
  let jade = vec3f(0.1, 0.8, 0.45);
  let gold = vec3f(1.4, 0.95, 0.3);
  let col = (mix(jade, gold, smoothstep(0.2, 0.8, dif * ao) * smoothstep(0.5, 2.0, trap)) * (0.05 + dif) + 0.5 * spec) * ao;
  return mix(sky, col, exp(-0.25 * h.x)) * u.p[4].z;
}

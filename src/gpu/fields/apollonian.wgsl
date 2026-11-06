// R4 · An Apollonian sphere packing (as Quilez folds it): fold space into the unit cell of a lattice of
// spheres, invert in the sphere at its centre, and again, scaled by s/r² each time. Every sphere the
// inversions make is tangent to its neighbours, packed into the gaps between them without end. Ivory
// shells, the gaps between them rose and shadowed blue.
//
// p[0..3] camera   p[4] s, gain

var<private> trap: vec4f;

fn de(q: vec3f) -> f32 {
  var p = q;
  var s = 1.0;
  trap = vec4f(1e9);
  for (var i = 0; i < 8; i++) {
    p = 2.0 * fract(0.5 * p + 0.5) - 1.0;
    let r2 = dot(p, p);
    trap = min(trap, vec4f(abs(p), r2));
    let k = u.p[4].x / r2;
    p *= k;
    s *= k;
  }
  return 0.25 * abs(p.y) / s;
}

fn field(q: vec2f) -> vec3f {
  let ro = eye();
  let rd = ray(q);
  let h = march(ro, rd, 10.0, 110);
  let fog = vec3f(0.012, 0.016, 0.04);
  if (h.x < 0.0) { return fog * u.p[4].y; }
  let P = ro + rd * h.x;
  let n = normal(P, 0.5 * cone() * h.x);
  de(P);
  let ao = pow(1.0 - h.y / 110.0, 2.0);
  let key = normalize(vec3f(0.5, 0.8, 0.2));
  let dif = max(dot(n, key), 0.0);
  let sky = 0.5 + 0.5 * n.y;
  let ivory = vec3f(1.0, 0.86, 0.66);
  let rose = vec3f(1.2, 0.3, 0.35);
  var col = mix(rose, ivory, clamp(6.0 * trap.y, 0.0, 1.0));
  col = mix(col, vec3f(0.25, 0.45, 1.0), clamp(trap.w * trap.w, 0.0, 1.0) * 0.6);
  col = col * (0.9 * dif + 0.25 * sky * vec3f(0.4, 0.55, 1.0)) * ao;
  return mix(fog, col, exp(-0.3 * h.x)) * u.p[4].y;
}

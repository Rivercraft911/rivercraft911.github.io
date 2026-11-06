// R4 · Inside a Mandelbox (Lowe): fold the box back on itself, fold the sphere inside out (scaled up inside
// r = ½, inverted inside r = 1), scale by −1.5, add the point back, again and again. What stays bounded is a
// hall of vaults and filigree; we drift through it in brass and soot.
//
// p[0..3] camera   p[4] scale, gain

var<private> trap: f32;

fn de(q: vec3f) -> f32 {
  var p = q;
  var dr = 1.0;
  let S = u.p[4].x;
  trap = 1e9;
  for (var i = 0; i < 9; i++) {
    p = clamp(p, vec3f(-1.0), vec3f(1.0)) * 2.0 - p;
    let r2 = dot(p, p);
    let k = clamp(1.0 / r2, 1.0, 4.0);
    p *= k;
    dr *= k;
    p = p * S + q;
    dr = dr * abs(S) + 1.0;
    trap = min(trap, r2);
  }
  return (length(p) - 2.0) / abs(dr);
}

fn field(q: vec2f) -> vec3f {
  let ro = eye();
  let rd = ray(q);
  let h = march(ro, rd, 20.0, 100);
  let sky = vec3f(0.012, 0.007, 0.002);
  if (h.x < 0.0) { return sky * u.p[4].y; }
  let P = ro + rd * h.x;
  let n = normal(P, 0.5 * cone() * h.x);
  de(P);
  let ao = pow(1.0 - h.y / 100.0, 3.0);
  let light = normalize(vec3f(-0.4, 0.9, 0.2));
  let dif = max(dot(n, light), 0.0);
  let spec = pow(max(dot(reflect(rd, n), light), 0.0), 24.0);
  let brass = vec3f(1.2, 0.72, 0.22);
  let soot = vec3f(0.08, 0.04, 0.03);
  let col = (mix(brass, soot, smoothstep(0.05, 0.6, trap)) * (0.15 + dif) + 0.8 * spec * brass) * ao;
  return mix(sky, col, exp(-0.15 * h.x)) * u.p[4].y;
}

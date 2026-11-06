// R4 · The Mandelbulb (White, Nylander). ℝ³ has no multiplication, so z ↦ zⁿ + c is taken in spherical
// coordinates: the radius to the n, both angles times n. The power drifts between 6 and 9, so the bulb
// grows and sheds its lobes as we skim it. Pearl, the crevices ultramarine, their rims ember.
//
// p[0..3] camera   p[4] power, gain

var<private> trap: vec4f;

fn de(c: vec3f) -> f32 {
  let n = u.p[4].x;
  var z = c;
  var dr = 1.0;
  var r = length(z);
  trap = vec4f(abs(z), r * r);
  for (var i = 0; i < 7; i++) {
    if (r > 2.0) { break; }
    dr = n * pow(r, n - 1.0) * dr + 1.0;
    let th = n * acos(clamp(z.z / r, -1.0, 1.0));
    let ph = n * atan2(z.y, z.x);
    z = pow(r, n) * vec3f(sin(th) * cos(ph), sin(th) * sin(ph), cos(th)) + c;
    r = length(z);
    trap = min(trap, vec4f(abs(z), r * r));
  }
  return 0.5 * log(r) * r / dr;
}

fn field(q: vec2f) -> vec3f {
  let ro = eye();
  let rd = ray(q);
  let h = march(ro, rd, 8.0, 110);
  let sky = vec3f(0.002, 0.003, 0.012) * (1.0 + 2.0 * pow(max(0.0, 1.0 - abs(q.y)), 3.0));
  if (h.x < 0.0) { return sky * u.p[4].y; }
  let P = ro + rd * h.x;
  let n = normal(P, 0.5 * cone() * h.x);
  de(P);
  let ao = pow(1.0 - h.y / 110.0, 2.0);
  let key = normalize(vec3f(0.6, 0.7, -0.4));
  let dif = max(dot(n, key), 0.0);
  let spec = pow(max(dot(reflect(rd, n), key), 0.0), 40.0);
  let rim = pow(1.0 - abs(dot(n, rd)), 3.0);
  let pearl = vec3f(1.0, 0.92, 0.86);
  let deep = vec3f(0.03, 0.08, 0.7);
  let ember = vec3f(1.8, 0.4, 0.06);
  let col = mix(deep, pearl, ao * smoothstep(0.2, 1.0, trap.w)) * (0.05 + dif) * ao + 0.5 * spec * ao + ember * rim * (1.0 - ao);
  return mix(sky, col, exp(-0.2 * h.x)) * u.p[4].y;
}

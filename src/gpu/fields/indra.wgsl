// R3 · Indra's pearls (pearls.wgsl), falling into the attracting fixed point of w = ab.
//
// p[0..3] camera    p[4] a, b, iterations, gain    p[5] film drift, fog, H    p[6] z₋, z₋ − z₊

fn field(q: vec2f) -> vec3f {
  return dive(eye(), ray(q), 0.0, cone(), u.p[5].z, u.p[5].y, u.p[5].x, u.p[4].x, u.p[4].y, i32(u.p[4].z), u.p[6]) * u.p[4].w;
}

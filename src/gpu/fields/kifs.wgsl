// R4 · A kaleidoscopic IFS (Knighty): fold space into one of the cube's 48 mirror chambers, turn it, and
// scale it 3× about a corner, again and again; what never escapes is a Menger sponge the turns have bent into
// a nave. Space is tiled with it, so we fall down an endless aisle. Bone and verdigris.
//
// p[0..3] camera   p[4] turn about z, turn about x, gain, tile

fn turn(v: vec2f, a: f32) -> vec2f { return vec2f(cos(a) * v.x - sin(a) * v.y, sin(a) * v.x + cos(a) * v.y); }

var<private> trap: f32;

fn de(q: vec3f) -> f32 {
  let L = u.p[4].w;
  var p = q - L * round(q / L);
  var s = 1.0;
  trap = 1e9;
  for (var i = 0; i < 7; i++) {
    p = abs(p);
    if (p.x < p.y) { p = p.yxz; }
    if (p.x < p.z) { p = p.zyx; }
    if (p.y < p.z) { p = p.xzy; }
    p = vec3f(turn(p.xy, u.p[4].x), p.z);
    p = vec3f(p.x, turn(p.yz, u.p[4].y));
    p = 3.0 * p - vec3f(2.0, 2.0, 0.0);
    if (p.z > 1.0) { p.z -= 2.0; }
    s *= 3.0;
    trap = min(trap, dot(p, p));
  }
  let b = abs(p) - 1.0;
  return (length(max(b, vec3f(0.0))) + min(max(b.x, max(b.y, b.z)), 0.0)) / s;
}

fn field(q: vec2f) -> vec3f {
  let ro = eye();
  let rd = ray(q);
  let h = march(ro, rd, 30.0, 96);
  let sky = vec3f(0.0, 0.002, 0.003);
  if (h.x < 0.0) { return sky * u.p[4].z; }
  let P = ro + rd * h.x;
  let n = normal(P, 0.5 * cone() * h.x);
  de(P);
  let ao = pow(1.0 - h.y / 96.0, 4.0);
  let light = normalize(vec3f(0.3, 0.8, -0.4));
  let dif = pow(max(dot(n, light), 0.0), 1.5);
  let rim = pow(1.0 - abs(dot(n, rd)), 4.0);
  let bone = vec3f(1.0, 0.82, 0.55);
  let verdigris = vec3f(0.02, 0.45, 0.38);
  let col = (mix(verdigris, bone, smoothstep(0.5, 3.0, trap)) * (0.04 + dif) + 0.3 * rim * verdigris) * ao;
  return mix(sky, col, exp(-0.22 * h.x)) * u.p[4].z;
}

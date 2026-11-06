// R4 · Newton's method on the polynomial whose roots are the 32APSK constellation (DVB-S2: rings of 4, 12
// and 16 at radii 1/4.30, 2.53/4.30 and 1). z ↦ z − p(z)/p′(z) = z − 1 / Σ 1/(z − r_k): every start runs to a
// root, and between the basins the boundary is fractal, every point of it touching all 32. The constellation
// turns as a carrier offset turns it. Each ring its colour (ember, jade, ice), each root its shade; the
// fewer the steps, the brighter.
//
// p[4] centre, half-height, gain   p[5] carrier phase

const TAU = 6.2831853;

fn root(k: i32, ph: f32) -> vec2f {
  var n = 16.0;
  var r = 1.0;
  var a = 0.0;
  var j = f32(k - 16);
  if (k < 4) { n = 4.0; r = 1.0 / 4.3; a = TAU / 8.0; j = f32(k); }
  else if (k < 16) { n = 12.0; r = 2.53 / 4.3; a = TAU / 24.0; j = f32(k - 4); }
  let t = a + TAU * j / n + ph;
  return r * vec2f(cos(t), sin(t));
}

fn field(q: vec2f) -> vec3f {
  let ph = u.p[5].x;
  var r: array<vec2f, 32>;
  for (var k = 0; k < 32; k++) { r[k] = root(k, ph); }
  var z = u.p[4].xy + u.p[4].z * q;
  var steps = 0.0;
  for (var i = 0; i < 28; i++) {
    var s = vec2f(0.0);
    for (var k = 0; k < 32; k++) {
      let d = z - r[k];
      s += vec2f(d.x, -d.y) / max(dot(d, d), 1e-12); // 1/(z − r)
    }
    let dz = vec2f(s.x, -s.y) / max(dot(s, s), 1e-12); // 1/s
    z -= dz;
    steps += 1.0;
    if (dot(dz, dz) < 1e-8) { break; }
  }
  // which root it ran to
  var best = 0;
  var bd = 1e9;
  for (var k = 0; k < 32; k++) {
    let d = distance(z, r[k]);
    if (d < bd) { bd = d; best = k; }
  }
  var col = vec3f(0.25, 0.75, 1.0); // the outer ring: ice
  if (best < 4) { col = vec3f(1.3, 0.35, 0.08); } // ember
  else if (best < 16) { col = vec3f(0.15, 1.0, 0.45); } // jade
  let shade = 0.55 + 0.45 * fract(f32(best) * 0.618034);
  let k = exp(-0.11 * steps);
  return col * shade * (0.06 + 1.4 * k * k) * u.p[4].w;
}

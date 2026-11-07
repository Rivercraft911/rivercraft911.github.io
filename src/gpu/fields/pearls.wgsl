// Indra's pearls. The Maskit group: a(z) = μ + 1/z and b(z) = z + 2, μ = −b + ia, acting on the
// upper half-space by Poincaré's extension, where 1/z is an inversion in the unit sphere. Its limit set
// lies in the plane, in the band 0 ≤ Im z ≤ a; above it, the images of the two half-spaces outside the band
// are balls, every one tangent to its neighbours, shrinking toward the limit set: the pearls. A point is
// folded into the fundamental domain (wrapped into one period of b, turned a half-turn if it is above the
// separation line, sent through a) until it settles; its distance from the band's edges, over the
// derivative it gathered, is its distance to the pearls (Jos Leys, Knighty); the half-spaces themselves are
// cut away. Each pearl is a soap film.

fn kleinian(p: vec3f, a: f32, b: f32, n: i32) -> vec3f {
  var z = p;
  var df = 1.0;
  var trap = 1e9;
  let f = sign(b);
  let c = vec3f(-0.5 * b, 0.5 * a, 0.0);
  var last = z + 1.0;
  for (var i = 0; i < n; i++) {
    z.x += f * b / a * z.y;
    z.x -= 2.0 * floor(0.5 * (z.x + 1.0));
    z.x -= f * b / a * z.y;
    let s = z.x + 0.5 * b;
    if (z.y >= 0.5 * a + f * (2.0 * a - 1.95) / 4.0 * sign(s) * (1.0 - exp(-(7.2 - (1.95 - a) * 15.0) * abs(s)))) {
      z = vec3f(-b, a, 0.0) - z;
    }
    let ir = 1.0 / dot(z, z);
    z *= -ir;
    z.x = -b - z.x;
    z.y = a + z.y;
    df *= ir;
    trap = min(trap, length(z - c));
    if (dot(z - last, z - last) < 1e-6) { break; } // settled into a cycle
    last = z;
  }
  let y = min(z.y, a - z.y);
  // the pearls only: the walls outside the band are cut away, so we see down the net between them
  return vec3f(max(min(y, 0.3) / max(df, 2.0), -min(p.y, a - p.y)), trap, df);
}

// The pearls at ζ: back through the map to z = z₋ + (z₋ − z₊)/(ζ − 1), extended to upper half-space, where
// 1/ζ is (x, −y, h)/|ζ|²; distances shrink by the map's conformal factor |z₋ − z₊|/|ζ − 1|².
// .z is the pearl's size: a over the derivative the fold gathered, brought back through the map. m holds z₋ and
// z₋ − z₊.
fn pearls(p: vec3f, a: f32, b: f32, n: i32, m: vec4f) -> vec3f {
  let v = p - vec3f(1.0, 0.0, 0.0);
  let r2 = dot(v, v);
  let w = vec3f(v.x, -v.y, v.z) / r2;
  let c = m.zw;
  let z = vec3f(c.x * w.x - c.y * w.y + m.x, c.x * w.y + c.y * w.x + m.y, length(c) * w.z);
  let k = kleinian(z, a, b, n);
  let back = r2 / length(c);
  return vec3f(k.x * back, k.y, a / k.z * back);
}

// The pearls seen along a ray from ro, marched from t: soap films lit by one key light, fogged with distance
// in units of H, the scale we are falling at. px is a pixel's width per unit of distance.
fn dive(ro: vec3f, rd: vec3f, t0: f32, px: f32, H: f32, fog: f32, drift: f32, a: f32, b: f32, n: i32, m: vec4f) -> vec3f {
  var t = max(t0, 0.002 * H);
  var hit = false;
  var steps = 0.0;
  for (var i = 0; i < 72; i++) {
    let d = pearls(ro + rd * t, a, b, n, m).x;
    if (d < px * t) { hit = true; break; }
    t += d * 0.9;
    steps += 1.0;
    if (t > 40.0 * H) { break; }
  }
  let deep = vec3f(0.003, 0.004, 0.014);
  if (!hit) { return deep; }
  let P = ro + rd * t;
  let e = 0.5 * px * t;
  let k = vec2f(1.0, -1.0);
  let nrm = normalize(k.xyy * pearls(P + k.xyy * e, a, b, n, m).x + k.yyx * pearls(P + k.yyx * e, a, b, n, m).x +
                      k.yxy * pearls(P + k.yxy * e, a, b, n, m).x + k.xxx * pearls(P + k.xxx * e, a, b, n, m).x);
  let pearl = pearls(P, a, b, n, m);
  let small = mix(0.45, 1.0, smoothstep(0.6, 0.12, pearl.z / H)); // the giants are dark glass
  let ci = abs(dot(nrm, rd));
  let ct = sqrt(1.0 - (1.0 - ci * ci) / (1.33 * 1.33));
  // a film drains: thinner toward the top of each pearl, and thinner with time
  let thick = 220.0 + 380.0 * (0.5 + 0.5 * sin(2.2 * pearl.y + drift)) - 140.0 * nrm.z;
  let ao = 1.0 - steps / 72.0;
  let key = normalize(vec3f(0.4, 0.3, 1.0));
  let spec = pow(max(dot(reflect(rd, nrm), key), 0.0), 300.0);
  let fres = 0.06 + 0.94 * pow(1.0 - ci, 2.5);
  let col = (8.0 * film(thick, ct) * fres * small + 0.6 * spec + vec3f(0.003, 0.004, 0.01)) * ao * ao;
  return mix(deep, col, exp(-t / H * fog));
}

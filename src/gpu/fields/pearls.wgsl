// Indra's pearls. The Maskit group: a(z) = μ + 1/z and b(z) = z + 2, μ = −b + ia, acting on the
// upper half-space by Poincaré's extension, where 1/z is an inversion in the unit sphere. Its limit set
// lies in the plane, in the band 0 ≤ Im z ≤ a; above it, the images of the two half-spaces outside the band
// are balls, every one tangent to its neighbours, shrinking toward the limit set: the pearls. A point is
// folded into the fundamental domain (wrapped into one period of b, turned a half-turn if it is above the
// separation line, sent through a) until it settles; its distance from the band's edges, over the
// derivative it gathered, is its distance to the pearls (Jos Leys, Knighty); the half-spaces themselves are
// cut away. Each pearl is a soap film.

// It folds deep (40) so the packing is as complete at every depth the endless zoom brings up to full size:
// too few folds and whole clusters of pearls exist only nearer the camera, popping in as the zoom loops.
fn kleinian(p: vec3f, a: f32, b: f32, n: i32) -> vec3f {
  var z = p;
  var df = 1.0;
  var trap = 1e9;
  let f = sign(b);
  let c = vec3f(-0.5 * b, 0.5 * a, 0.0);
  var last = z + 1.0;
  var before = z + 2.0; // two folds back: a settled point bounces between two places
  // the same every fold, so worked out once
  let shear = f * b / a;
  let bend = f * (2.0 * a - 1.95) / 4.0;
  let sharp = -(7.2 - (1.95 - a) * 15.0);
  for (var i = 0; i < n; i++) {
    z.x += shear * z.y;
    z.x -= 2.0 * floor(0.5 * (z.x + 1.0));
    z.x -= shear * z.y;
    let s = z.x + 0.5 * b;
    if (z.y >= 0.5 * a + bend * sign(s) * (1.0 - exp(sharp * abs(s)))) {
      z = vec3f(-b, a, 0.0) - z;
    }
    let ir = 1.0 / dot(z, z);
    z *= -ir;
    z.x = -b - z.x;
    z.y = a + z.y;
    df *= ir;
    trap = min(trap, length(z - c));
    // settled into a cycle: a settled point alternates, so compare two folds back (as Jos Leys does), not
    // before a few folds, when a point can pass near its old place by chance and stop on a false surface
    if (i > 5 && (dot(z - before, z - before) < 1e-8 || dot(z - last, z - last) < 1e-8)) { break; }
    before = last;
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
  let back = r2 / length(c);
  let k = kleinian(z, a, b, n);
  return vec3f(k.x * back, k.y, a / k.z * back);
}

// The space the pearls hang in: a dim nebula, violet toward the key light, teal below, so a film has
// something to mirror and the gaps are never dead black.
fn nebula(r: vec3f) -> vec3f {
  let k = normalize(vec3f(0.4, 0.3, 1.0));
  return vec3f(0.008, 0.006, 0.024) + vec3f(0.06, 0.03, 0.14) * pow(max(dot(r, k), 0.0), 3.0) + vec3f(0.01, 0.05, 0.06) * pow(max(-r.z, 0.0), 2.0);
}

// The pearls seen along a ray from ro, marched from t: soap films lit by a key light and a coloured rim
// light, mirroring the nebula, fogged with distance in units of H, the scale we are falling at. px is a
// pixel's width per unit of distance.
fn dive(ro: vec3f, rd: vec3f, t0: f32, px: f32, H: f32, fog: f32, drift: f32, a: f32, b: f32, n: i32, m: vec4f) -> vec3f {
  var t = max(t0, 0.002 * H);
  var hit = false;
  // Plain sphere tracing, steady from frame to frame. Thin chains of tiny pearls sit right at the edge of
  // what a pixel resolves: a pixel and a quarter counts as a hit, so a chain is found on every frame.
  for (var i = 0; i < 96; i++) {
    let d = pearls(ro + rd * t, a, b, n, m).x;
    if (d < 1.25 * px * t) { hit = true; break; }
    t += d * 0.85;
    if (t > 34.0 * H) { break; }
    // a ray that grazes the packing runs out of steps a hair from a surface: that surface is what it sees
    if (i == 95 && d < 8.0 * px * t) { hit = true; }
  }
  let deep = nebula(rd);
  if (!hit) { return deep; }
  let P = ro + rd * t;
  let e = 0.5 * px * t;
  let k = vec2f(1.0, -1.0);
  let nrm = normalize(k.xyy * pearls(P + k.xyy * e, a, b, n, m).x + k.yyx * pearls(P + k.yyx * e, a, b, n, m).x +
                      k.yxy * pearls(P + k.yxy * e, a, b, n, m).x + k.xxx * pearls(P + k.xxx * e, a, b, n, m).x);
  let pearl = pearls(P, a, b, n, m);
  let small = mix(0.75, 1.0, smoothstep(0.6, 0.12, pearl.z / H)); // the giants a little darker glass
  let ci = abs(dot(nrm, rd));
  let ct = sqrt(1.0 - (1.0 - ci * ci) / (1.33 * 1.33));
  // a film drains: thinner toward the top of each pearl, and thinner with time
  // and its colour comes from the pearl's size at the scale we're falling at, which the zoom's loop leaves
  // unchanged, so a pearl one loop deeper is coloured exactly as it was (an orbit trap is not, and the loop
  // showed as a cut)
  let thick = 220.0 + 380.0 * (0.5 + 0.5 * sin(2.2 * log2(pearl.z / H) + drift)) - 140.0 * nrm.z;
  // a pearl a few pixels across can't show its film's bands without shimmering: it shows their average
  let sharp = smoothstep(1.5, 6.0, pearl.z / (px * t));
  // occlusion from one probe out along the normal, a pearl's own size away: how crowded it is there. A
  // count of march steps would do it cheaper, but steps jump from frame to frame and the shading flickers.
  let probe = 0.25 * pearl.z;
  let ao = mix(0.35, 1.0, clamp(pearls(P + nrm * probe, a, b, n, m).x / probe, 0.0, 1.0));
  let key = normalize(vec3f(0.4, 0.3, 1.0));
  let rim = normalize(vec3f(-0.5, -0.4, -0.6));
  let r = reflect(rd, nrm);
  let spec = pow(max(dot(r, key), 0.0), 300.0) + 0.4 * vec3f(1.0, 0.45, 0.8) * pow(max(dot(r, rim), 0.0), 40.0);
  let fres = 0.06 + 0.94 * pow(1.0 - ci, 2.5);
  let col = (11.0 * mix(vec3f(0.035), film(thick, ct), sharp) * fres * small + 0.8 * spec + 1.8 * nebula(r) * fres + vec3f(0.004, 0.005, 0.012)) * ao;
  // gone into the haze before the march gives up on it, so far pearls never pop in
  return mix(deep, col, exp(-t / H * fog) * smoothstep(34.0 * H, 24.0 * H, t));
}

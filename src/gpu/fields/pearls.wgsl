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

// The space the pearls hang in: a dim nebula, violet toward the key light, teal below, so a film has
// something to mirror and the gaps are never dead black.
fn nebula(r: vec3f) -> vec3f {
  let k = normalize(vec3f(0.4, 0.3, 1.0));
  return vec3f(0.008, 0.006, 0.024) + vec3f(0.06, 0.03, 0.14) * pow(max(dot(r, k), 0.0), 3.0) + vec3f(0.01, 0.05, 0.06) * pow(max(-r.z, 0.0), 2.0);
}

// The pearls seen along a ray from ro, marched from t: soap films lit by a key light and a coloured rim
// light, mirroring the nebula, fogged with distance in units of H, the scale we are falling at. Where the
// ray grazes the packing it gathers glow, so the limit set, where the pearls kiss, shines. px is a pixel's
// width per unit of distance.
fn dive(ro: vec3f, rd: vec3f, t0: f32, px: f32, H: f32, fog: f32, drift: f32, a: f32, b: f32, n: i32, m: vec4f) -> vec3f {
  var t = max(t0, 0.002 * H);
  var hit = false;
  var steps = 0.0;
  var glow = 0.0;
  // Over-relaxed sphere tracing (Keinert et al. 2014): stride ω times the distance bound through open
  // space, and when two successive bounds no longer overlap the stride overshot, so step back and go
  // carefully from there on. Thin chains of tiny pearls sit right at the edge of what a pixel resolves:
  // a pixel and a quarter counts as a hit, so a chain is found on every frame, not stepped over on some.
  var w = 1.5;
  var last = 0.0;
  var stride = 0.0;
  for (var i = 0; i < 72; i++) {
    let d = pearls(ro + rd * t, a, b, n, m).x;
    if (w > 1.0 && d + last < stride) {
      t -= stride - last; // the bound spheres don't touch: back to where the last one ended
      stride = last;
      w = 1.0;
      continue;
    }
    if (d < 1.25 * px * t) { hit = true; break; }
    glow += exp(-d / (0.012 * t + 1e-4)) * 0.012;
    stride = d * select(0.75, w, w > 1.0);
    last = d;
    t += stride;
    steps += 1.0;
    if (t > 34.0 * H) { break; }
    // a ray that grazes the packing runs out of steps a hair from a surface: that surface is what it sees,
    // or it would flicker to the background from frame to frame
    if (i == 71 && d < 8.0 * px * t) { hit = true; }
  }
  let halo = vec3f(0.35, 0.5, 1.0) * glow;
  let deep = nebula(rd);
  if (!hit) { return deep + halo; }
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
  let thick = 220.0 + 380.0 * (0.5 + 0.5 * sin(2.2 * pearl.y + drift)) - 140.0 * nrm.z;
  let ao = 1.0 - 0.7 * steps / 72.0;
  let key = normalize(vec3f(0.4, 0.3, 1.0));
  let rim = normalize(vec3f(-0.5, -0.4, -0.6));
  let r = reflect(rd, nrm);
  let spec = pow(max(dot(r, key), 0.0), 300.0) + 0.4 * vec3f(1.0, 0.45, 0.8) * pow(max(dot(r, rim), 0.0), 40.0);
  let fres = 0.06 + 0.94 * pow(1.0 - ci, 2.5);
  let col = (11.0 * film(thick, ct) * fres * small + 0.8 * spec + 1.8 * nebula(r) * fres + vec3f(0.004, 0.005, 0.012)) * ao;
  // gone into the haze before the march gives up on it, so far pearls never pop in
  return mix(deep, col, exp(-t / H * fog) * smoothstep(34.0 * H, 24.0 * H, t)) + halo;
}

// The singularity · A Schwarzschild black hole (G = c = M = 1: the horizon at r = 2, the photon sphere at
// r = 3) lensing what is left of the fall. Every ray is a null geodesic, traced back from the eye in flat
// coordinates, where its orbit obeys x″ = −(3/2) h² x / r⁵, h = |x × x′| its angular momentum: Binet's
// u″ + u = 3u², exactly. A ray that falls inside r = 2 never comes back; that is the shadow, √27 across. A
// ray that grazes r = 3 winds round and comes back as the photon ring.
//
// The disk lies in y = 0 from the innermost stable orbit, r = 6, out to r = 18: thin, Keplerian (Ω = r^−3/2),
// its temperature Shakura–Sunyaev's, T ∝ r^−3/4 (1 − √(6/r))^1/4, and every radius glows at its own Wien
// peak, λ = b/T: the disk is the spectrum, violet near its hottest ring, red at its rim and invisible
// infrared at its inner edge. Each colour is shifted by gravity and by the disk's motion,
// g = √(1 − 3/r) / (1 − Ω b) with b the photon's angular momentum about the disk's axis, so the side
// coming toward us is bluer and far brighter: its flux goes as (g T)⁴. Its light is streaked by shear: gas at radius r has
// turned Ω t.
//
// Beyond is the sky: the last world, the tesseract and the 24-cell, met on a 2-sphere of S³ and still turning.
//
// p[0..3] camera   p[4] L   p[5] R   p[6] time, collapse, gain

fn qmul(a: vec4f, b: vec4f) -> vec4f {
  return vec4f(a.x * b.x - dot(a.yzw, b.yzw), a.x * b.yzw + b.x * a.yzw + cross(a.yzw, b.yzw));
}

fn hash3(p: vec3f) -> f32 { return fract(sin(dot(p, vec3f(127.1, 311.7, 74.7))) * 43758.5453); }

// The CIE 1931 observer, as Wyman, Sloan and Shirley fit it with piecewise Gaussians, into linear sRGB.
fn lobe(l: f32, m: f32, a: f32, b: f32) -> f32 {
  let s = select(b, a, l < m);
  let x = (l - m) / s;
  return exp(-0.5 * x * x);
}
fn spectral(l: f32) -> vec3f {
  let X = 1.056 * lobe(l, 599.8, 37.9, 31.0) + 0.362 * lobe(l, 442.0, 16.0, 26.7) - 0.065 * lobe(l, 501.1, 20.4, 26.2);
  let Y = 0.821 * lobe(l, 568.8, 46.9, 40.5) + 0.286 * lobe(l, 530.9, 16.3, 31.1);
  let Z = 1.217 * lobe(l, 437.0, 11.8, 36.0) + 0.681 * lobe(l, 459.0, 26.0, 13.8);
  return max(vec3f(3.2406 * X - 1.5372 * Y - 0.4986 * Z, -0.9689 * X + 1.8758 * Y + 0.0415 * Z, 0.0557 * X - 0.2040 * Y + 1.0570 * Z), vec3f(0.0));
}

fn disk(P: vec3f, k: vec3f) -> vec3f {
  let r = length(P.xz);
  let om = pow(r, -1.5);
  let b = cross(P, k).y;
  let g = sqrt(1.0 - 3.0 / r) / (1.0 - om * b);
  let T = pow(r, -0.75) * pow(1.0 - sqrt(6.0 / r), 0.25) / 0.1275; // 1 at the hottest ring
  let lam = 420.0 / max(T * g, 1e-3);
  let phi = atan2(P.z, P.x) + om * u.p[6].x;
  let lr = log(r);
  let shear = pow((0.6 + 0.4 * sin(7.0 * phi + 40.0 * lr)) * (0.55 + 0.45 * sin(19.0 * phi - 90.0 * lr + 1.7)) * (0.6 + 0.4 * sin(150.0 * lr + sin(3.0 * phi))), 2.0);
  let edge = smoothstep(18.0, 11.0, r);
  let c = spectral(lam);
  return mix(c, vec3f(dot(c, vec3f(0.3, 0.5, 0.2))), 0.3) * pow(g * T, 4.0) * shear * edge * 5.0;
}

// The sky: S³'s 2-sphere w = 0.6, turned by (L, R) and folded into the tesseract's chamber (|s|, sorted).
// Where it crosses the tesseract's cell walls the two largest coordinates are equal, and where it crosses
// the 24-cell's the middle two are: curves on the sky, a lattice of cells for the lens to bend. Each cell
// is faintly tinted by its axis, and there are stars.
fn sky(d: vec3f) -> vec3f {
  let v = qmul(qmul(u.p[4], vec4f(0.8 * d, 0.6)), u.p[5]);
  let w = abs(v);
  let a = max(w.xz, w.yw);
  let b = min(w.xz, w.yw);
  let s = vec4f(max(a.x, a.y), max(min(a.x, a.y), max(b.x, b.y)), min(min(a.x, a.y), max(b.x, b.y)), min(b.x, b.y));
  let e1 = (s.x - s.y) * 0.7071;
  let e2 = (s.y - s.z) * 0.7071;
  var col = vec3f(1.5, 0.95, 0.3) * exp(-e1 * e1 / 4e-5) + vec3f(1.4, 0.12, 0.2) * exp(-e2 * e2 / 4e-5) * 0.7;
  let big = select(select(select(v.w, v.z, w.z == s.x), v.y, w.y == s.x), v.x, w.x == s.x);
  let axis = select(select(select(3.0, 2.0, w.z == s.x), 1.0, w.y == s.x), 0.0, w.x == s.x) + step(big, 0.0) * 4.0;
  col += (0.5 + 0.5 * cos(vec3f(0.0, 2.1, 4.2) + axis * 0.785)) * 0.015;
  let star = hash3(floor(d * 300.0));
  col += vec3f(0.8, 0.85, 1.0) * step(0.996, star) * 4.0 * smoothstep(0.35, 0.0, length(fract(d * 300.0) - 0.5));
  return col * 0.6;
}

fn field(q0: vec2f) -> vec3f {
  let q = q0 * u.p[6].y;
  let rim = smoothstep(1.7, 1.2, length(q));
  if (rim <= 0.0) { return vec3f(0.0); }
  var x = eye();
  var v = ray(q);
  let h2 = dot(cross(x, v), cross(x, v));
  var col = vec3f(0.0);
  var through = 1.0;
  var a = -1.5 * h2 * x / pow(dot(x, x), 2.5);
  for (var i = 0; i < 200; i++) {
    let r = length(x);
    if (r < 2.0) { return col * rim * u.p[6].z; }
    if (r > 60.0 && dot(x, v) > 0.0) { break; }
    let dt = clamp(0.05 * r * r / 3.0, 0.03, 3.0);
    v += 0.5 * dt * a;
    let xn = x + dt * v;
    if (x.y * xn.y < 0.0) {
      let P = mix(x, xn, x.y / (x.y - xn.y));
      let rp = length(P.xz);
      if (rp > 6.0 && rp < 18.0) {
        col += through * disk(P, normalize(-v));
        through *= 0.15;
      }
    }
    x = xn;
    a = -1.5 * h2 * x / pow(dot(x, x), 2.5);
    v += 0.5 * dt * a;
  }
  col += through * sky(normalize(v));
  return col * rim * u.p[6].z;
}

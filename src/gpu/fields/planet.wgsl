// River's planet (src/world/planet.ts), in units of its radius, the eye at the origin.
//
// The air is single scattering, marched: Rayleigh with Earth's zenith optical depth (0.046, 0.108, 0.265 at 680, 550
// and 440 nm) over a scale height of 0.008 R, so a small world has Earth's blue and Earth's sunsets; Mie haze with
// the Cornette–Shanks phase. The ground is a spectral crust with oceans that mirror the sun through Fresnel. The cloud
// deck turns, round the north pole, into the same vortex the plunge pool turned (wrap.ts): log-spiral arms, an eye,
// an eyewall, the whirlpool at the size of a world. Over both magnetic poles the auroral oval burns: oxygen's green
// (557.7 nm) low in the curtains and its red (630 nm) above them.
//
// p[4] centre (from the eye), radius   p[5] toward the sun, t   p[6] the spin axis, the spin angle
// p[7] the storm, its eye's radius (rad), cloud cover, aurora   p[8] exposure, the night side's own light, -, -

const BR = vec3f(5.8, 13.5, 33.1); // Rayleigh, per radius, at sea level
const BM = 21.0;                    // Mie
const HR = 0.008;
const HM = 0.0012;
const TOP = 1.04;
const CLOUD = 1.007;
const PI = 3.14159265;

fn h31(p: vec3f) -> f32 {
  var q = fract(p * vec3f(0.1031, 0.1030, 0.0973));
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
fn noise(p: vec3f) -> f32 {
  let i = floor(p);
  let f = p - i;
  let u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(h31(i), h31(i + vec3f(1, 0, 0)), u.x), mix(h31(i + vec3f(0, 1, 0)), h31(i + vec3f(1, 1, 0)), u.x), u.y),
    mix(mix(h31(i + vec3f(0, 0, 1)), h31(i + vec3f(1, 0, 1)), u.x), mix(h31(i + vec3f(0, 1, 1)), h31(i + vec3f(1, 1, 1)), u.x), u.y),
    u.z);
}
// A spectral field: octaves at 2.03× the frequency and 0.5× the amplitude, each turned off the last's grid.
fn fbm(p0: vec3f, n: i32) -> f32 {
  var p = p0;
  var a = 0.5;
  var s = 0.0;
  for (var i = 0; i < n; i++) {
    s += a * noise(p);
    p = vec3f(p.y * 1.6 + p.z * 1.2, p.z * 1.6 - p.x * 1.2, p.x * 1.6 + p.y * 1.2) * 1.015 + 7.31;
    a *= 0.5;
  }
  return s;
}

// The planet's own frame: the world turned back by the spin.
fn local(v: vec3f) -> vec3f {
  let a = u.p[6].xyz;
  let c = cos(-u.p[6].w);
  let s = sin(-u.p[6].w);
  return v * c + cross(a, v) * s + a * dot(a, v) * (1.0 - c);
}
fn world(v: vec3f) -> vec3f {
  let a = u.p[6].xyz;
  let c = cos(u.p[6].w);
  let s = sin(u.p[6].w);
  return v * c + cross(a, v) * s + a * dot(a, v) * (1.0 - c);
}

// Where ro + t rd meets the sphere of radius r about the origin: near and far t, or none (−1).
fn ball(ro: vec3f, rd: vec3f, r: f32) -> vec2f {
  let b = dot(ro, rd);
  let c = dot(ro, ro) - r * r;
  let h = b * b - c;
  if (h < 0.0) { return vec2f(-1.0); }
  let s = sqrt(h);
  return vec2f(-b - s, -b + s);
}

// The crust: continents where the spectral field clears the sea.
fn land(n: vec3f) -> f32 { return fbm(n * 2.2, 7) + 0.18 * fbm(n * 9.0, 4) - 0.55; }

// The cloud deck: a field warped by itself, then wound round the north pole as the pool wound its water:
// θ → θ + k ln φ, so every arm is a log spiral; inside the eye, clear sky; at its wall, the densest cloud of all.
fn clouds(n: vec3f) -> f32 {
  let t = u.p[5].w;
  let pole = vec3f(0.0, 1.0, 0.0);
  let phi = acos(clamp(dot(n, pole), -1.0, 1.0)); // from the pole, rad
  let storm = u.p[7].x;
  var q = n;
  let reach = 0.75;
  if (phi < reach && storm > 0.0) {
    let w = (1.0 - smoothstep(0.0, reach, phi)) * storm;
    let ang = w * (2.6 * log(max(phi, 1e-3) / reach) - 1.4 * t); // the arms' pitch, and their turning
    let c = cos(ang);
    let s = sin(ang);
    q = vec3f(n.x * c - n.z * s, n.y, n.x * s + n.z * c);
  }
  let warp = vec3f(fbm(q * 3.0 + vec3f(0.0, 0.0, 0.05 * t), 4), fbm(q * 3.0 + 4.3, 4), fbm(q * 3.0 + 8.1, 4));
  var c = smoothstep(0.42, 0.72, fbm(q * 4.0 + 1.8 * warp, 6)) * u.p[7].z;
  // bands where the trades and westerlies shear it, thinner over the subtropical highs
  let lat = asin(clamp(n.y, -1.0, 1.0));
  c *= 0.55 + 0.45 * smoothstep(0.15, 0.5, abs(cos(3.0 * lat)));
  if (storm > 0.0) {
    let e = u.p[7].y;
    let arms = 0.5 + 0.5 * sin(5.0 * (atan2(q.z, q.x)) + 2.6 * 5.0 * log(max(phi, 1e-3)));
    let spiral = smoothstep(0.0, 0.08, phi - e) * (1.0 - smoothstep(reach * 0.6, reach, phi));
    c = max(c, storm * spiral * mix(0.35, 1.0, arms) * (0.75 + 0.5 * fbm(q * 14.0, 3)));
    c = mix(c, 0.0, storm * (1.0 - smoothstep(e * 0.7, e, phi))); // the eye
    c += storm * 0.8 * exp(-pow((phi - e) / (0.25 * e), 2.0)); // the eyewall
  }
  return clamp(c, 0.0, 1.0);
}

fn dens(r: f32) -> vec2f { return exp(-max(r - 1.0, 0.0) / vec2f(HR, HM)); }

// Optical depth from p toward the sun, to the top of the air; a ray that hits the ground first never sees the sun.
fn sunward(p: vec3f, L: vec3f) -> vec3f {
  let g = ball(p, L, 0.999);
  if (g.x > 0.0) { return vec3f(1e9); }
  let len = ball(p, L, TOP).y;
  let n = 6;
  let dt = len / f32(n);
  var od = vec2f(0.0);
  for (var i = 0; i < n; i++) { od += dens(length(p + L * (f32(i) + 0.5) * dt)) * dt; }
  return BR * od.x + BM * 1.1 * od.y;
}

struct Air { light: vec3f, through: vec3f }

// The light the air scatters toward the eye along ro + t rd, t in [a, b], and how much of what is behind it gets through.
fn air(ro: vec3f, rd: vec3f, a: f32, b: f32, L: vec3f) -> Air {
  let n = 20;
  let dt = (b - a) / f32(n);
  let mu = dot(rd, L);
  let pr = 3.0 / (16.0 * PI) * (1.0 + mu * mu);
  let g = 0.76;
  let pm = 3.0 / (8.0 * PI) * (1.0 - g * g) * (1.0 + mu * mu) / ((2.0 + g * g) * pow(1.0 + g * g - 2.0 * g * mu, 1.5));
  var od = vec2f(0.0);
  var sr = vec3f(0.0);
  var sm = vec3f(0.0);
  for (var i = 0; i < n; i++) {
    let p = ro + rd * (a + (f32(i) + 0.5) * dt);
    let d = dens(length(p)) * dt;
    od += d;
    let tr = exp(-(BR * od.x + BM * 1.1 * od.y + sunward(p, L)));
    sr += tr * d.x;
    sm += tr * d.y;
  }
  return Air(22.0 * (sr * BR * pr + sm * BM * pm), exp(-(BR * od.x + BM * 1.1 * od.y)));
}

// The auroral oval: curtains standing on the field lines about 23° from each magnetic pole, folded and flickering.
fn aurora(ro: vec3f, rd: vec3f, a: f32, b: f32, L: vec3f) -> vec3f {
  let k = u.p[7].w;
  if (k <= 0.0) { return vec3f(0.0); }
  var c = vec3f(0.0);
  let n = 14;
  let dt = (b - a) / f32(n);
  let t = u.p[5].w;
  let mag = normalize(vec3f(0.08, 1.0, 0.05)); // the dipole, a little off the spin
  for (var i = 0; i < n; i++) {
    let p = ro + rd * (a + (f32(i) + 0.5) * dt);
    let r = length(p);
    let h = (r - 1.0) / 0.03; // 0 at the ground, 1 at the curtain tops
    if (h < 0.12 || h > 1.0) { continue; }
    let q = local(p / r);
    let ml = abs(dot(q, mag)); // |sin| of the magnetic latitude
    let fold = 0.04 * sin(9.0 * atan2(q.z, q.x) + 0.7 * t) + 0.02 * sin(23.0 * atan2(q.z, q.x) - 1.3 * t);
    let band = exp(-pow((ml - 0.92 - fold) / 0.018, 2.0));
    let rays = 0.4 + 0.6 * noise(vec3f(atan2(q.z, q.x) * 40.0, h * 2.0, 0.5 * t));
    let night = smoothstep(0.1, -0.25, dot(p / r, L));
    c += band * rays * night * dt * (vec3f(0.12, 1.0, 0.35) * exp(-pow((h - 0.3) / 0.18, 2.0)) + vec3f(0.9, 0.12, 0.2) * smoothstep(0.45, 0.95, h) * 0.6);
  }
  return c * k * 60.0;
}

fn field(q: vec2f) -> vec3f {
  let R = u.p[4].w;
  let ro = -u.p[4].xyz / R; // the eye, from the centre, in radii
  let rd = ray(q);
  let L = u.p[5].xyz;
  let sun = vec3f(1.0, 0.96, 0.9) * 22.0;
  let top = ball(ro, rd, TOP);
  if (top.y < 0.0) { return vec3f(0.0); }
  let a = max(top.x, 0.0);
  let g = ball(ro, rd, 1.0);
  let hit = g.x > 0.0;
  let b = select(top.y, g.x, hit);
  var col = vec3f(0.0);
  var cut = b; // where the cloud deck stops the eye, if it does
  if (hit) {
    let p = ro + rd * g.x;
    let n = normalize(p);
    let m = local(n);
    let h = land(m);
    let e = 0.004;
    let dh = vec3f(land(normalize(m + vec3f(e, 0, 0))), land(normalize(m + vec3f(0, e, 0))), land(normalize(m + vec3f(0, 0, e)))) - h;
    let lat = abs(m.y);
    let tr = exp(-sunward(p, L));
    var alb: vec3f;
    var N = n;
    var spec = vec3f(0.0);
    if (h < 0.0) {
      // the sea: deeper, darker; and the sun, mirrored, through Fresnel at a sea's roughness
      alb = mix(vec3f(0.004, 0.03, 0.06), vec3f(0.01, 0.07, 0.09), smoothstep(-0.12, 0.0, h));
      let H = normalize(L - rd);
      let f = 0.02 + 0.98 * pow(1.0 - max(dot(-rd, n), 0.0), 5.0);
      spec = sun * tr * f * pow(max(dot(n, H), 0.0), 900.0) * 60.0;
      spec += tr * sun * f * 0.02 * max(dot(n, L), 0.0);
    } else {
      N = normalize(n - world(dh) * 18.0);
      let green = vec3f(0.06, 0.11, 0.04);
      let dry = vec3f(0.28, 0.22, 0.14);
      let rock = vec3f(0.22, 0.2, 0.19);
      alb = mix(green, dry, smoothstep(0.15, 0.45, fbm(m * 6.0, 3) + 0.4 * (1.0 - lat) - 0.3));
      alb = mix(alb, rock, smoothstep(0.1, 0.25, h));
      alb = mix(alb, vec3f(0.85, 0.9, 0.95), smoothstep(0.75, 0.85, lat + 0.6 * h)); // ice
    }
    let shade = 1.0 - 0.75 * clouds(local(normalize(p + L * 0.012))); // the deck's shadow
    col = alb * sun * tr * max(dot(N, L), 0.0) * shade / PI + spec * shade;
    col += alb * vec3f(0.02, 0.035, 0.06) * smoothstep(-0.3, 0.2, dot(n, L)); // the sky's own light
    // the night side's lights: where River's places are, the scene turns these up
    col += u.p[8].y * vec3f(1.0, 0.6, 0.3) * smoothstep(0.0, -0.15, dot(n, L)) * smoothstep(0.82, 0.9, noise(m * 60.0)) * step(0.0, h) * 0.15;
    dist = g.x * R;
  }
  // the deck, where the ray crosses it in front of the ground
  let cd = ball(ro, rd, CLOUD);
  var cl = 0.0;
  var cc = vec3f(0.0);
  if (cd.y > 0.0) {
    let t = select(cd.x, cd.y, cd.x < 0.0);
    if (t > 0.0 && t < b + 1e-4) {
      let p = ro + rd * t;
      let n = normalize(p);
      cl = clouds(local(n));
      let tr = exp(-sunward(p, L));
      let lit = 0.25 + 0.75 * smoothstep(-0.1, 0.35, dot(n, L)); // light through the deck's own depth
      cc = vec3f(0.95, 0.97, 1.0) * sun * tr * lit * 0.11 + vec3f(0.02, 0.03, 0.05);
      if (cl > 0.5) { cut = t; dist = t * R; }
    }
  }
  let A = air(ro, rd, a, cut, L);
  col = mix(col, cc, cl) * A.through + A.light + aurora(ro, rd, a, b, L);
  return col * u.p[8].x;
}

// World 01 · R-01, the raster. A dark room: on a plinth, R-01's optics on its aluminium plate. Three
// lasers combine through two dichroics onto the galvo, which tilts the beam to the line's elevation ε;
// a 4-facet polygon mirror sweeps it across the far wall, the reflection turning at twice the mirror's
// rate. Only the middle 30 % of each facet's sweep lands on the wall: azimuth α within ±27°.
//
// The wall is exact for rays from the polygon: a ray at (α, ε) lands at x = D tan α, y = D tan ε / cos α,
// so each scanline bows up at its ends (a flat wall, no f-θ lens). Inverting that, every point of the
// wall knows its line and pixel, when the scan last painted it, and the 4-bit levels it was painted with.
// The polygon and galvo mirrors reflect the wall; the floor reflects it dimly; the plate catches it.
//
// p[0..3] camera   p[4] the scan: facets since the frame's top (0..120), frames done, lines a second
// seen, gain   p[5] the facet's azimuth, its blur, the galvo's ε, its blur   p[6] the wall's mean light,
// time   p[7] each laser's power, and where the scan began

const D = 3.0;         // the wall, from the polygon's axis
const AW = 0.47123890;  // the window's half sweep: 30 % of 180°, halved
const ET = 0.27;        // the galvo's elevation for the top line
const EB = -0.105;      // and the bottom
const FY = -0.75;       // the floor
const PY = -0.06;       // the plate's top
const PA = 0.06;        // the polygon's half side
const GX = 0.22;        // the galvo mirror, on the x axis
const LAMP = vec3f(0.4, 1.3, -0.2); // the one lamp, over the bench
const WARM = vec3f(1.0, 0.86, 0.7);

var<private> mat: i32;
var<private> facet: f32;
var<private> gn: vec3f; // the galvo mirror's frame: normal, and the axis it turns on
var<private> ga: vec3f;

fn hash(p: vec3f) -> f32 { return fract(sin(dot(p, vec3f(12.9898, 78.233, 37.719))) * 43758.5453); }

fn rot(p: vec3f, a: f32) -> vec3f {
  let c = cos(a);
  let s = sin(a);
  return vec3f(c * p.x - s * p.z, p.y, s * p.x + c * p.z);
}
fn box(p: vec3f, b: vec3f) -> f32 {
  let q = abs(p) - b;
  return length(max(q, vec3f(0.0))) + min(max(q.x, max(q.y, q.z)), 0.0);
}
fn cyl(p: vec3f, r: f32, h: f32) -> f32 { // axis y
  let d = vec2f(length(p.xz) - r, abs(p.y) - h);
  return min(max(d.x, d.y), 0.0) + length(max(d, vec2f(0.0)));
}

// One pixel's levels, 0..15 a laser, as linear power.
fn level(L: i32, i: i32) -> vec3f {
  let t = floor(textureLoad(data, vec2i(i, L), 0).rg * 255.0 + 0.5);
  let r = floor(t.x / 16.0);
  return vec3f(r, t.x - 16.0 * r, floor(t.y / 16.0)) / 15.0;
}

// The light on the wall at (x, y). foot: a screen pixel's size there, so scanlines average once unresolved.
fn wall(x: f32, y: f32, foot: f32) -> vec3f {
  let a = atan(x / D);
  let e = atan(y * cos(a) / D);
  let h = (AW - a) / (2.0 * AW);
  let v = (ET - e) / (ET - EB);
  if (h < 0.0 || h >= 1.0 || v < 0.0 || v >= 1.0) { return vec3f(0.0); }
  let row = v * 120.0;
  let L = i32(row);
  // its slot in the frame: odd lines down first, then the even lines back up
  let sl = select(119.0 - f32(L / 2), f32((L - 1) / 2), (L & 1) == 1) + 0.35 + 0.3 * h;
  var age = u.p[4].x - sl;
  if (u.p[4].y < 0.5 && sl < u.p[7].w) { return vec3f(0.0); } // before we tuned in
  if (age < 0.0) {
    if (u.p[4].y < 0.5) { return vec3f(0.0); }
    age += 120.0;
  }
  let s = age / u.p[4].z;
  let lit = 0.35 + 0.65 * exp(-s / 5.0) + 2.0 * exp(-s / 0.04);
  let d = fract(row) - 0.5;
  let prof = mix(exp(-d * d / 0.06), 0.43, clamp(foot / 0.0096 - 0.3, 0.0, 1.0));
  return level(L, i32(h * 320.0)) * lit * prof * u.p[4].w;
}

fn de(p: vec3f) -> f32 {
  // the polygon, its hub and motor
  var d = box(rot(p - vec3f(0.0, 0.012, 0.0), facet), vec3f(PA, 0.034, PA)) - 0.002;
  mat = 0;
  var k = min(cyl(p - vec3f(0.0, -0.03, 0.0), 0.028, 0.008), cyl(p - vec3f(0.0, PY + 0.012, 0.0), 0.1, 0.012));
  if (k < d) { d = k; mat = 2; }
  // the galvo: its mirror, its motor, its mount
  let g = p - vec3f(GX, 0.0, 0.0);
  let gm = box(vec3f(dot(g, ga), dot(g, cross(gn, ga)), dot(g, gn)), vec3f(0.022, 0.016, 0.0015));
  if (gm < d) { d = gm; mat = 3; }
  let gb = rot(g - 0.06 * vec3f(0.7071, 0.0, -0.7071), 0.7853982);
  k = min(cyl(vec3f(gb.y, gb.x, gb.z), 0.02, 0.035), box(gb - vec3f(0.0, -0.035, 0.0), vec3f(0.03, 0.025, 0.022)));
  if (k < d) { d = k; mat = 2; }
  // the lasers: red down the axis, green and blue from the side
  k = box(p - vec3f(GX, -0.015, -0.93), vec3f(0.035, 0.045, 0.07));
  k = min(k, box(p - vec3f(GX + 0.2, -0.015, -0.62), vec3f(0.07, 0.045, 0.035)));
  k = min(k, box(p - vec3f(GX + 0.2, -0.015, -0.42), vec3f(0.07, 0.045, 0.035)));
  let groove = abs(fract(p.y * 60.0) - 0.5) / 60.0 - 0.003; // the heatsinks' fins
  k = max(k, -max(groove, -k - 0.012));
  if (k < d) { d = k; mat = 2; }
  k = cyl(vec3f(p.x - GX, p.z + 0.85, p.y), 0.014, 0.012);
  k = min(k, cyl(vec3f(p.y, p.x - GX - 0.12, p.z + 0.62), 0.014, 0.012));
  k = min(k, cyl(vec3f(p.y, p.x - GX - 0.12, p.z + 0.42), 0.014, 0.012));
  if (k < d) { d = k; mat = 6; }
  // the dichroics, at 45°, on posts
  let q1 = rot(p - vec3f(GX, 0.0, -0.62), 0.7853982);
  let q2 = rot(p - vec3f(GX, 0.0, -0.42), 0.7853982);
  k = min(box(q1, vec3f(0.026, 0.026, 0.0015)), box(q2, vec3f(0.026, 0.026, 0.0015)));
  if (k < d) { d = k; mat = 4; }
  k = min(cyl(p - vec3f(GX, -0.045, -0.62), 0.006, 0.02), cyl(p - vec3f(GX, -0.045, -0.42), 0.006, 0.02));
  // the plate, and the plinth under it
  k = min(k, box(p - vec3f(0.25, PY - 0.006, -0.45), vec3f(0.42, 0.006, 0.68)) - 0.001);
  if (k < d) { d = k; mat = 1; }
  k = box(p - vec3f(0.25, 0.5 * (FY + PY - 0.012), -0.45), vec3f(0.36, 0.5 * (PY - 0.012 - FY), 0.6));
  if (k < d) { d = k; mat = 5; }
  return d;
}

// How much of the lamp p sees past the machine: a soft shadow, marched.
fn shadow(p: vec3f, l: vec3f) -> f32 {
  var k = 1.0;
  var s = 0.004;
  for (var i = 0; i < 24; i++) {
    let d = de(p + l * s);
    k = min(k, 14.0 * d / s);
    s += clamp(d, 0.004, 0.08);
    if (k < 0.01 || s > 0.5) { break; }
  }
  return clamp(k, 0.0, 1.0);
}

fn normal(p: vec3f, e: f32) -> vec3f {
  let k = vec2f(1.0, -1.0);
  return normalize(k.xyy * de(p + k.xyy * e) + k.yyx * de(p + k.yyx * e) + k.yxy * de(p + k.yxy * e) + k.xxx * de(p + k.xxx * e));
}

// What a ray from p sees of the room: the wall's light, and the one dim lamp over the bench.
fn env(p: vec3f, r: vec3f, foot: f32) -> vec3f {
  let lamp = vec3f(0.3, 0.27, 0.24) * smoothstep(0.55, 0.95, dot(r, normalize(vec3f(0.3, 1.0, -0.5)))) + vec3f(0.01, 0.014, 0.02) * (1.0 + r.y);
  if (r.z <= 0.0) { return lamp + 0.002; }
  let t = (D - p.z) / r.z;
  let w = p + r * t;
  if (w.y < FY) { return lamp + 0.002; }
  return wall(w.x, w.y, foot + 0.002 * t) + lamp + 0.004;
}

var<private> steps: f32;
// The machine along a ray, marched inside its box: how far, or −1.
fn machine(ro: vec3f, rd: vec3f, far: f32, n: i32) -> f32 {
  let ia = (vec3f(-0.18, FY, -1.14) - ro) / rd;
  let ib = (vec3f(0.68, 0.08, 0.24) - ro) / rd;
  let t1 = min(min(min(max(ia.x, ib.x), max(ia.y, ib.y)), max(ia.z, ib.z)), far);
  var s = max(max(max(min(ia.x, ib.x), min(ia.y, ib.y)), min(ia.z, ib.z)), 0.0);
  let px = cone() * 0.7;
  for (var i = 0; i < n && s < t1; i++) {
    let d = de(ro + rd * s);
    if (d < px * s + 1e-5) { steps = f32(i) / f32(n); return s; }
    s += d;
  }
  return -1.0;
}

// The light a surface of the machine sends back along rd, but for what its mirrors see.
fn shade(P: vec3f, rd: vec3f, n: vec3f, m: i32, foot: f32, first: bool) -> vec3f {
  let ao = 1.0 - steps;
  let r = reflect(rd, n);
  // the lamp: a spot whose pool falls on the plate, with soft shadows
  let lv = LAMP - P;
  let ld = length(lv);
  let l = lv / ld;
  let pool = smoothstep(0.86, 0.97, dot(l, normalize(LAMP - vec3f(0.25, PY, -0.4)))) / (ld * ld);
  var dif = max(dot(n, l), 0.0) * pool;
  if (first && dif > 0.0) { dif *= shadow(P + n * 0.002, l); }
  let spec = pow(max(dot(r, l), 0.0), 60.0) * pool;
  let bounce = u.p[6].xyz * 0.12 * max(n.z, 0.0);
  let fr = 0.04 + 0.96 * pow(1.0 - abs(dot(n, rd)), 5.0);
  if (m == 0 || m == 3) { return 0.5 * spec * WARM + select(0.92 * env(P, r, foot), vec3f(0.0), first); } // mirrors
  if (m == 4) { return film(380.0 + 120.0 * hash(floor(P * 40.0)), abs(dot(n, rd))) * (0.15 + dif) + fr * env(P, r, foot); } // dichroic glass
  if (m == 6) { // a laser's aperture, glowing with its power
    let c = select(select(vec3f(0.0, 0.0, u.p[7].z), vec3f(0.0, u.p[7].y, 0.0), P.z < -0.52), vec3f(u.p[7].x, 0.0, 0.0), P.z < -0.75);
    let core = select(length(P.yz - vec2f(0.0, select(-0.42, -0.62, P.z < -0.52))), length(P.xy - vec2f(GX, 0.0)), P.z < -0.75);
    return ao * 0.03 * dif * WARM + c * (0.1 + 4.0 * smoothstep(0.009, 0.003, core));
  }
  if (m == 1) { // brushed aluminium: the lamp and the wall, smeared along the grain
    let j = vec3f(0.12 * (hash(P * 997.0) - 0.5), 0.0, 0.0);
    return ao * (0.08 * dif * WARM + 0.25 * bounce + 0.4 * (0.2 + fr) * env(P, normalize(r + j), foot) + 0.3 * spec * WARM);
  }
  if (m == 5) { return ao * (0.012 * dif * WARM + 0.4 * bounce * vec3f(0.6)); } // the plinth
  return ao * (0.03 * dif * WARM + 0.3 * bounce + 0.2 * spec * WARM + 0.2 * fr * env(P, r, foot));
}

fn field(q: vec2f) -> vec3f {
  let ro = eye();
  let rd = ray(q);
  let n0 = hash(vec3f(q * 913.0, u.p[6].w));
  facet = u.p[5].x + u.p[5].y * (n0 - 0.5);
  let e = u.p[5].z + u.p[5].w * (fract(n0 * 7.31) - 0.5);
  gn = normalize(vec3f(-cos(e), sin(e), -1.0));
  ga = normalize(cross(vec3f(0.0, 1.0, 0.0), gn));

  // the room's two planes, and the machine
  let tf = select(1e9, (FY - ro.y) / rd.y, rd.y < 0.0);
  let tw = select(1e9, (D - ro.z) / rd.z, rd.z > 0.0);
  let tm = machine(ro, rd, min(tf, tw), 90);
  if (tm > 0.0) {
    let P = ro + rd * tm;
    let foot = cone() * tm;
    let m = mat;
    let n = normal(P, max(0.0005, 0.5 * foot));
    var c = shade(P, rd, n, m, foot, true);
    if (m == 0 || m == 3) { // a mirror: what it sees, the machine included
      let r = reflect(rd, n);
      let t2 = machine(P + n * 0.003, r, 2.0, 40);
      if (t2 > 0.0) {
        let Q = P + n * 0.003 + r * t2;
        let m2 = mat;
        c += 0.92 * shade(Q, r, normal(Q, 0.001), m2, foot, false);
      } else { c += 0.92 * env(P, r, foot); }
    }
    return c;
  }
  let t = min(tf, tw);
  if (t >= 1e8) { return vec3f(0.0); }
  let P = ro + rd * t;
  let foot = cone() * t;
  if (tw < tf) { // the wall: what the lasers paint, and a little spill
    return wall(P.x, P.y, foot / max(rd.z, 0.2)) + 0.004 * u.p[6].xyz + vec3f(0.0015);
  }
  // the floor: lit by the image, and holding a rough reflection of it
  let near = exp(-(D - P.z) * 0.9) * exp(-abs(P.x) * 0.4);
  let j = vec3f(0.08 * (fract(n0 * 3.1) - 0.5), 0.0, 0.08 * (fract(n0 * 5.7) - 0.5));
  let r = normalize(reflect(rd, vec3f(0.0, 1.0, 0.0)) + j);
  let fr = 0.04 + 0.96 * pow(1.0 - abs(rd.y), 5.0);
  return vec3f(0.0015) + 0.05 * u.p[6].xyz * near + 0.5 * fr * env(P, r, foot);
}

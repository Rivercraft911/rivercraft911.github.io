// The cosmos, baked (cosmos.ts): each texel the light along its ray, in the phosphor's units, as planet.wgsl's are. A cube
// face's texel holds the sky; a marvel's, its patch of sky, seen from far off, and how much of the sky behind it it hides.
// What lies beyond is the farther off the fainter, and is hidden by what lies in front of it.

struct Bake { size: f32, layer: f32, kind: f32, ss: f32 }
struct Marvel { x: vec4f, y: vec4f, z: vec4f }
@group(0) @binding(0) var<uniform> B: Bake;
@group(0) @binding(1) var<uniform> MARVEL: array<Marvel, 8>;
@group(0) @binding(2) var smp: sampler;
@group(0) @binding(3) var finer: texture_2d<f32>;

const COSMOS = 0.12; // the scale it is stored at (fields/cosmos.wgsl)
const TAU = 6.2831853;

@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  return vec4f(f32((i << 1u) & 2u) * 2.0 - 1.0, f32(i & 2u) * 2.0 - 1.0, 0.0, 1.0);
}

fn sat(x: f32) -> f32 { return clamp(x, 0.0, 1.0); }

// ---- noise ---------------------------------------------------------------------------------------------------------
fn hash3(p: vec3i) -> f32 {
  var v = vec3u(p) * vec3u(1664525u) + vec3u(1013904223u);
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  v ^= v >> vec3u(16u);
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  return f32(v.x >> 8u) / 16777216.0;
}
fn noise(x: vec3f) -> f32 {
  let i = vec3i(floor(x));
  let f = fract(x);
  let w = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  return mix(mix(mix(hash3(i), hash3(i + vec3i(1, 0, 0)), w.x), mix(hash3(i + vec3i(0, 1, 0)), hash3(i + vec3i(1, 1, 0)), w.x), w.y),
             mix(mix(hash3(i + vec3i(0, 0, 1)), hash3(i + vec3i(1, 0, 1)), w.x), mix(hash3(i + vec3i(0, 1, 1)), hash3(i + vec3i(1, 1, 1)), w.x), w.y), w.z);
}
const ROT = mat3x3f(0.0, 0.8, 0.6, -0.8, 0.36, -0.48, -0.6, -0.48, 0.64);
fn fbm(x: vec3f, n: i32) -> f32 {
  var p = x;
  var a = 0.5;
  var s = 0.0;
  for (var i = 0; i < n; i++) {
    s += a * noise(p);
    p = ROT * p * 2.03 + 7.1;
    a *= 0.5;
  }
  return s;
}

// ---- the galaxy we are in, seen from inside ------------------------------------------------------------------------
// A barred spiral like ours, in kpc: an old disc, a young one in four logarithmic arms with its glowing hydrogen, the
// bar, and dust in a thinner layer still, clumped, lying along the arms' inner edges. Along each ray, emission and
// extinction summed out to 40 kpc in steps that grow with distance, the dust reddening what it lets through (∝ 1/λ),
// so the band is cut by the rift where it is brightest and the light beyond it is redder.
const GC = vec3f(0.696, 0.383, 0.607); // toward its middle, and its pole, as planet.wgsl's stars have them
const GP = vec3f(0.47, 0.395, -0.789);
const R0 = 8.2;
fn arms(R: f32, th: f32, lag: f32) -> f32 {
  let ph = th - log(max(R, 0.3)) / 0.21 + lag; // pitch 12°
  return pow(0.5 + 0.5 * cos(4.0 * ph), 6.0);
}
fn galaxy(rd: vec3f) -> vec4f {
  let d = vec3f(dot(rd, GC), dot(rd, cross(GP, GC)), dot(rd, GP));
  var T = vec3f(1.0);
  var L = vec3f(0.0);
  let n = 128;
  let g = pow(40.0 / 0.004, 1.0 / f32(n));
  var s = 0.004;
  for (var i = 0; i < n; i++) {
    let ds = s * (g - 1.0);
    let p = vec3f(-R0, 0.0, 0.015) + d * (s + 0.5 * ds);
    s *= g;
    let z = abs(p.z);
    if (z > 2.5 && p.z * d.z > 0.0) { break; } // out of it for good
    let R = length(p.xy);
    let disc = exp(-(R - R0) / 2.6);
    // the bar, 25° from the line to us, and the bulge round it
    let b = vec3f(p.x * 0.906 + p.y * 0.423, -p.x * 0.423 + p.y * 0.906, p.z);
    let bar = exp(-length(b / vec3f(1.5, 0.75, 0.75)) * 2.0);
    if (disc * exp(-z / 0.3) + bar < 1e-3) { continue; } // nothing here to see or to hide it
    let th = atan2(p.y, p.x);
    let ring = smoothstep(2.0, 4.5, R); // the arms and the dust begin past the bar
    let arm = arms(R, th, 0.0) * ring;
    let lane = arms(R, th, 0.35) * ring;
    let clump = fbm(p * 3.0 + 4.0, 5);
    let cloud = smoothstep(0.3, 0.75, fbm(p * 7.0 + 1.0, 4)); // star clouds
    var j = vec3f(0.95, 0.94, 0.95) * disc * exp(-z / 0.3) * (0.1 + 2.4 * cloud * cloud)
          + vec3f(1.0, 0.85, 0.66) * bar * 1.6 * (0.6 + 0.8 * cloud)
          + vec3f(0.62, 0.76, 1.0) * disc * arm * exp(-z / 0.1) * (0.3 + 2.0 * cloud * clump) * 1.5;
    let young = disc * arm * exp(-z / 0.05);
    if (young > 0.01) { j += vec3f(1.0, 0.2, 0.35) * young * pow(fbm(p * 9.0, 3), 5.0) * 40.0; } // hydrogen, glowing round the young
    var dust = disc * exp(-z / 0.12) * (0.2 + 1.6 * lane) * (0.3 + 0.7 * ring) * 1.6;
    if (dust > 1e-3) { dust *= pow(smoothstep(0.3, 0.72, clump + 0.3 * fbm(p * 22.0, 3)), 1.5); }
    let od = 2.2 * dust * ds;
    // (the stars within a few hundred parsecs are not a glow but each its own point: planet.wgsl's)
    L += T * j * ds * exp(-0.5 * od * vec3f(0.8, 1.0, 1.25)) * smoothstep(0.25, 1.0, s);
    T *= exp(-od * vec3f(0.8, 1.0, 1.25));
  }
  return vec4f(L, T.g);
}

// The sky's light, and how much of whatever lies beyond the galaxy its dust hides.
fn sky(rd: vec3f) -> vec4f {
  let g = galaxy(rd);
  return vec4f(g.rgb * 0.014, 1.0 - g.a);
}

// ---- the marvels ---------------------------------------------------------------------------------------------------
// Each is an object in its own frame, a distance D off, its middle along +z of the patch's ray v. The eye's place and
// the ray, in that frame: turned down by `tilt` (rad) and about the line of sight by `spin`.
struct Ray { o: vec3f, d: vec3f }
fn look(v: vec3f, D: f32, tilt: f32, spin: f32) -> Ray {
  let c = cos(spin);
  let s = sin(spin);
  let w = vec3f(c * v.x - s * v.y, s * v.x + c * v.y, v.z);
  // looking down at the plane z = 0 from above it, tilted: forward is −z turned toward +y by tilt
  let ct = cos(tilt);
  let st = sin(tilt);
  let f = vec3f(0.0, st, -ct);
  let up = vec3f(0.0, ct, st);
  return Ray(-f * D, normalize(vec3f(1.0, 0.0, 0.0) * w.x + up * w.y + f * w.z));
}
fn ball(o: vec3f, d: vec3f, r: f32) -> vec2f {
  let b = dot(o, d);
  let h = b * b - dot(o, o) + r * r;
  if (h < 0.0) { return vec2f(-1.0); }
  return vec2f(-b - sqrt(h), -b + sqrt(h));
}

// Thin-film interference (film.wgsl): a soap film d nm thick, seen at cos c inside it.
fn film(d: f32, c: f32) -> vec3f {
  let F = 0.0837;
  let s = sin(TAU * 1.33 * d * c / vec3f(630.0, 532.0, 465.0));
  return F * s * s / (1.0 + F * s * s);
}

// · Indra's pearls (the fall's pearls.wgsl): the Maskit group a(z) = μ + 1/z, b(z) = z + 2 on upper half-space, folded
// until it settles; its pearls are balls, tangent each to the next, shrinking toward the limit set. Here each pearl is a
// bubble of gas, the way the Bubble Nebula is one, and like any shell it is brightest at its limb, where the line of
// sight runs longest through it; its skin is a soap film, its colour the film's thickness, which goes with the pearl's
// size. The gas they were blown in is thickest along the limit set, where every pearl has shrunk to nothing.
const MA = 1.95859;
const MB = 0.0112;
const ZM = vec4f(-2.2770036, 0.2133612, -2.5428072, -1.5318675); // z₋, z₋ − z₊
fn kleinian(p: vec3f) -> vec3f {
  var z = p;
  var df = 1.0;
  let f = sign(MB);
  var last = z + 1.0;
  var before = z + 2.0;
  let shear = f * MB / MA;
  let bend = f * (2.0 * MA - 1.95) / 4.0;
  let sharp = -(7.2 - (1.95 - MA) * 15.0);
  for (var i = 0; i < 28; i++) {
    z.x += shear * z.y;
    z.x -= 2.0 * floor(0.5 * (z.x + 1.0));
    z.x -= shear * z.y;
    let s = z.x + 0.5 * MB;
    if (z.y >= 0.5 * MA + bend * sign(s) * (1.0 - exp(sharp * abs(s)))) { z = vec3f(-MB, MA, 0.0) - z; }
    let ir = 1.0 / dot(z, z);
    z *= -ir;
    z.x = -MB - z.x;
    z.y = MA + z.y;
    df *= ir;
    if (i > 5 && (dot(z - before, z - before) < 1e-8 || dot(z - last, z - last) < 1e-8)) { break; }
    before = last;
    last = z;
  }
  // the distance to the pearls, how far outside the band of the strip, and the derivative gathered
  let y = min(z.y, MA - z.y);
  return vec3f(min(y, 0.3) / max(df, 2.0), -min(p.y, MA - p.y), df);
}
// The pearls at ζ: the strip sent into a crescent by z = z₀ + 1/ζ (z₀ = x₀ − ih, below it), recentred so the crescent
// fills the unit disc, the cusp at its top where every period of b runs up both horns, smaller and smaller. The half-
// planes either side are the disc's outside and the disc inside it at the top; both are cut away. Returns the distance,
// shrunk by the map's conformal factor, the pearl's size, and how far inside the crescent ζ is (> 0 inside).
const H0 = 0.8;
fn pearls(q: vec3f) -> vec3f {
  let p = vec3f(q.x, q.y - 1.0, q.z) / (2.0 * H0); // back to ζ, the cusp at 0
  let r2 = dot(p, p);
  let z = vec3f(p.x, -p.y, p.z) / r2 + vec3f(0.35, -H0, 0.0);
  let back = r2 * 2.0 * H0;
  let k = kleinian(z);
  return vec3f(k.x * back, MA / k.z * back, -k.y * back);
}
fn indra(v: vec3f) -> vec4f {
  let D = 1.08 / MARVEL[0].x.w;
  let r = look(v, D, 0.7, 0.0);
  let hit = ball(r.o, r.d, 1.08);
  if (hit.y < 0.0) { return vec4f(0.0); }
  var t = max(hit.x, 0.0);
  var L = vec3f(0.0);
  var prev = pearls(r.o + r.d * t).x;
  var dt = 0.0;
  for (var i = 0; i < 200 && t < hit.y; i++) {
    let p = r.o + r.d * t;
    let k = pearls(p);
    let foot = px * t;
    let w = max(0.05 * k.y, foot); // the shell's half-thickness, never under the texel's footprint
    let ad = abs(k.x);
    let inside = sat((k.z - ad) / w - 1.0); // (the crescent's own edges are no pearl's)
    if (ad < 3.0 * w && inside > 0.0) {
      let cs = sat(abs(k.x - prev) / max(dt, 1e-6)); // how square the ray crosses the shell
      let thick = 250.0 + 330.0 * (0.5 + 0.5 * sin(2.2 * log2(k.y) + 1.0));
      L += (film(thick, mix(0.55, 1.0, cs)) * 12.0 + vec3f(0.03, 0.04, 0.09)) * exp(-(ad / w) * (ad / w)) * sqrt(k.y / w) * 0.05 * inside;
    }
    dt = max(max(ad - 2.0 * w, 0.6 * w), 0.7 * foot);
    // the gas, a film too, far thicker, its colours drifting across the whole cloud
    let gas = (exp(-ad / 0.02) * 2.5 + exp(-ad / 0.12) * 0.12 + exp(-ad / max(0.0015, foot)) * 4.0) * 30.0 * inside;
    L += (film(700.0 + 500.0 * fbm(p * 2.5 + 3.0, 4), 1.0) * 9.0 + vec3f(0.04, 0.05, 0.1)) * gas * dt;
    prev = k.x;
    t += dt;
  }
  return vec4f(L * 0.004, 0.0);
}

// · A spiral galaxy whose heart is a Mandelbulb (White, Nylander: z ↦ zⁿ + c in spherical coordinates, n = 8): its old
// stars gold on the bulb's skin, its cracks hot, its rims blue; round it the disc, two arms of young blue stars with
// hydrogen glowing pink among them and dust along their inner edges, seen 60° from face on, so the near arm's dust lies
// across the heart.
fn bulbDE(c: vec3f) -> vec2f {
  var z = c;
  var dr = 1.0;
  var r = length(z);
  var trap = r * r;
  for (var i = 0; i < 8; i++) {
    if (r > 2.0) { break; }
    dr = 8.0 * pow(r, 7.0) * dr + 1.0;
    let th = 8.0 * acos(clamp(z.z / r, -1.0, 1.0));
    let ph = 8.0 * atan2(z.y, z.x);
    z = pow(r, 8.0) * vec3f(sin(th) * cos(ph), sin(th) * sin(ph), cos(th)) + c;
    r = length(z);
    trap = min(trap, r * r);
  }
  return vec2f(0.5 * log(r) * r / dr, trap);
}
fn bulbGalaxy(v: vec3f) -> vec4f {
  let D = 4.8 / MARVEL[1].x.w;
  let r = look(v, D, 1.05, 0.35);
  // the heart, sphere-traced, its own glow gathered on the way past
  var tb = 1e9;
  var glow = 0.0;
  let hb = ball(r.o, r.d, 1.25);
  if (hb.y > 0.0) {
    var t = hb.x;
    for (var i = 0; i < 200; i++) {
      let d = bulbDE(r.o + r.d * t).x;
      glow += exp(-d * 40.0);
      if (d < 0.5 * px * t) { tb = t; break; }
      t += d;
      if (t > hb.y) { break; }
    }
  }
  var heart = vec3f(0.0);
  if (tb < 1e8) {
    let P = r.o + r.d * tb;
    let e = 0.5 * px * tb;
    let k = vec2f(1.0, -1.0);
    let nrm = normalize(k.xyy * bulbDE(P + k.xyy * e).x + k.yyx * bulbDE(P + k.yyx * e).x + k.yxy * bulbDE(P + k.yxy * e).x + k.xxx * bulbDE(P + k.xxx * e).x);
    let trap = bulbDE(P).y;
    // how open the surface is: a probe out along the normal
    let ao = sat(bulbDE(P + nrm * 0.04).x / 0.04);
    let ao2 = sat(bulbDE(P + nrm * 0.15).x / 0.15);
    let key = normalize(vec3f(-0.5, -0.45, 0.75));
    let dif = max(dot(nrm, key), 0.0);
    let rim = pow(1.0 - abs(dot(nrm, r.d)), 3.0);
    // paler where the orbit ran farthest out
    let skin = mix(vec3f(1.0, 0.68, 0.36), vec3f(1.0, 0.93, 0.82), smoothstep(0.2, 0.9, trap));
    heart = skin * (0.45 + 0.9 * dif) * ao * ao2 + vec3f(1.6, 0.4, 0.08) * (1.0 - ao) * ao2 * 0.4 + vec3f(0.45, 0.65, 1.3) * rim * ao2;
  }
  // the disc, z = 0, scale length 2.2, as far as the heart that hides the rest
  let tz = vec2f((-0.5 - r.o.z) / r.d.z, (0.5 - r.o.z) / r.d.z);
  let t0 = max(min(tz.x, tz.y), 0.0);
  let t1 = min(max(tz.x, tz.y), tb);
  var L = vec3f(0.0);
  var T = vec3f(1.0);
  let n = 72;
  let dt = (t1 - t0) / f32(n);
  for (var i = 0; i < n && t1 > t0; i++) {
    let p = r.o + r.d * (t0 + (f32(i) + 0.5) * dt);
    let R = length(p.xy);
    let ph = atan2(p.y, p.x) - log(max(R, 0.2)) / 0.42; // pitch 23°
    let cl = fbm(p * vec3f(5.0, 5.0, 9.0), 4);
    let arm = pow(0.5 + 0.5 * cos(2.0 * ph + 0.7 * cl), 6.0) * smoothstep(1.0, 1.8, R);
    let lane = pow(0.5 + 0.5 * cos(2.0 * ph + 0.55 + 0.7 * cl), 14.0) * smoothstep(1.0, 1.6, R);
    let disc = exp(-R / 2.2) * exp(-abs(p.z) / 0.07) * smoothstep(4.7, 3.2, R);
    let j = (vec3f(1.0, 0.82, 0.65) * 0.15 + vec3f(0.55, 0.72, 1.0) * arm * (1.0 + 6.0 * cl * cl) + vec3f(1.0, 0.22, 0.45) * arm * pow(cl, 6.0) * 25.0) * disc
          + vec3f(1.0, 0.8, 0.62) * exp(-length(p * vec3f(1.0, 1.0, 1.6)) / 0.5) * 1.5;
    let od = 60.0 * disc * (0.15 + 2.5 * lane) * smoothstep(0.35, 0.65, cl) * dt;
    L += T * j * dt;
    T *= exp(-od * vec3f(0.7, 1.0, 1.4));
  }
  let c = L * 0.25 + T * heart * 0.3 + glow * vec3f(1.0, 0.78, 0.55) * 0.003 * T;
  return vec4f(c, select(1.0 - T.g, 1.0, tb < 1e8));
}

// · A Kleinian cathedral (Knighty's pseudo-Kleinian): space folded by a box and inverted in a sphere until nothing
// moves, cut by a thin cylinder, so it stands as floor over floor of tracery on threads, without end. One floor of it,
// a rose window light-years across, is dust: dark against the glowing gas behind it, its edges silvered where that
// light falls on them, ragged where the cloud thins out.
fn cathedral(q: vec3f) -> f32 {
  let box = vec3f(0.808, 0.808, 1.167);
  var p = q;
  var s = 1.0;
  for (var i = 0; i < 7; i++) {
    p = 2.0 * clamp(p, -box, box) - p;
    let k = max(0.70968 / dot(p, p), 1.0);
    p *= k;
    s *= k;
  }
  let rxy = length(p.xy);
  return max(rxy - 0.92784, abs(rxy * p.z) / length(p)) / s;
}
// the light behind the window: hydrogen's red round a hot blue heart, in clouds
fn backlight(p: vec3f) -> vec3f {
  let n = fbm(p * 0.9 + vec3f(3.0, 1.0, 0.0), 5);
  let m = fbm(p * 0.6 + vec3f(9.0, 4.0, 2.0), 4);
  let r = length(p.xy + 0.3 * vec2f(fbm(p * 0.5, 3) - 0.5));
  let core = exp(-r * r / 2.6);
  let cloud = smoothstep(0.25, 0.75, n) * exp(-r * r / 4.0) * smoothstep(2.9, 2.1, r);
  // oxygen's teal nearer the hot heart, hydrogen's red farther out, sulphur's deeper red in the thickest
  let gas = mix(vec3f(0.15, 0.85, 0.8), vec3f(1.0, 0.2, 0.3), smoothstep(0.6, 1.6, r + 0.8 * (m - 0.5)));
  return vec3f(0.55, 0.75, 1.0) * core * (0.5 + n) * 1.5 + gas * cloud * 2.5 + vec3f(0.8, 0.1, 0.05) * cloud * smoothstep(0.55, 0.8, n) * 2.0;
}
fn kleinianNebula(v: vec3f) -> vec4f {
  let D = 3.0 / MARVEL[2].x.w;
  let r = look(v, D, 0.45, 0.4);
  // the floor of tracery lies in |z| < 0.62, the gas below it to z = −3. Where the ray crosses the floor's middle:
  // how far the cloud reaches there, ragged, and the light that falls on it from behind
  let tz = vec2f((0.62 - r.o.z) / r.d.z, (-3.0 - r.o.z) / r.d.z);
  let pm = r.o - r.d * r.o.z / r.d.z;
  let window = smoothstep(2.9, 2.0, length(pm.xy) + 0.8 * fbm(pm * 1.5, 3));
  let rim = backlight(pm - vec3f(0.0, 0.0, 1.5)) * 0.35;
  var t = tz.x;
  var L = vec3f(0.0);
  var T = 1.0;
  for (var i = 0; i < 128 && T > 0.004 && window > 0.0; i++) {
    let p = r.o + r.d * t;
    if (p.z < -0.62) { break; }
    let d = cathedral(p);
    let w = max(0.004, px * t); // its sheets have no thickness of their own: as thick as a texel sees, and opaque
    let dt = clamp(d - w, 0.7 * w, 0.06);
    let sheet = exp(-d / w) / w * window;
    // dark, but for the light from behind that the dust scatters back toward us: its silver lining
    L += T * rim * sheet * dt;
    T *= exp(-2.0 * sheet * dt);
    t += dt;
  }
  // and the gas, seen through what the tracery lets by
  let tg = max(t, (-0.62 - r.o.z) / r.d.z);
  let dg = (tz.y - tg) / 12.0;
  for (var i = 0; i < 12 && T > 0.004; i++) {
    let p = r.o + r.d * (tg + (f32(i) + 0.5) * dg);
    L += T * backlight(p) * exp(-(p.z + 1.6) * (p.z + 1.6) / 0.8) * dg;
  }
  return vec4f(L * 0.04, 0.0);
}

fn marvel(k: i32, v: vec3f) -> vec4f {
  switch k {
    case 0: { return indra(v); }
    case 1: { return bulbGalaxy(v); }
    default: { return kleinianNebula(v); }
  }
}

// ---- the bake ---------------------------------------------------------------------------------------------------
// A cube face's texel (u, v in [−1, 1], v down) as the ray it holds: +x, −x, +y, −y, +z, −z.
fn face(f: i32, u: f32, v: f32) -> vec3f {
  switch f {
    case 0: { return vec3f(1.0, -v, -u); }
    case 1: { return vec3f(-1.0, -v, u); }
    case 2: { return vec3f(u, 1.0, v); }
    case 3: { return vec3f(u, -1.0, -v); }
    case 4: { return vec3f(u, -v, 1.0); }
    default: { return vec3f(-u, -v, -1.0); }
  }
}

fn hash2(p: vec2u) -> f32 {
  var x = p.x * 1664525u + p.y * 1013904223u;
  x ^= x >> 16u; x *= 0x7feb352du; x ^= x >> 15u; x *= 0x846ca68bu; x ^= x >> 16u;
  return f32(x >> 8u) / 16777216.0;
}

// sRGB's own curve, to dither by half a step of what is stored
fn enc(c: vec3f) -> vec3f { return select(12.92 * c, 1.055 * pow(c, vec3f(1.0 / 2.4)) - 0.055, c > vec3f(0.0031308)); }
fn dec(c: vec3f) -> vec3f { return select(c / 12.92, pow((c + 0.055) / 1.055, vec3f(2.4)), c > vec3f(0.04045)); }

var<private> px: f32; // a texel's width, in radians

@fragment fn bakeFS(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let n = i32(B.ss);
  let k = i32(B.layer);
  px = select(2.0, 2.0 * MARVEL[k].x.w, B.kind > 0.0) / B.size;
  var acc = vec4f(0.0);
  for (var i = 0; i < n; i++) {
    // a rotated grid of four samples (its first two a pair), or the middle
    let o = select(vec2f(0.0), vec2f(array<vec2f, 4>(vec2f(-0.125, -0.375), vec2f(0.125, 0.375), vec2f(0.375, -0.125), vec2f(-0.375, 0.125))[i & 3]), n > 1);
    let uv = (pos.xy + o) / B.size * 2.0 - 1.0;
    if (B.kind == 0.0) {
      acc += sky(normalize(face(k, uv.x, uv.y)));
    } else {
      // (and whatever a marvel has left at its patch's edge fades before it, so no edge is ever seen)
      acc += marvel(k, normalize(vec3f(uv.x * MARVEL[k].x.w, -uv.y * MARVEL[k].x.w, 1.0))) * smoothstep(1.0, 0.8, max(abs(uv.x), abs(uv.y)));
    }
  }
  acc /= f32(n);
  // stored as 1 − e^(−light / COSMOS): light itself where it is faint, and no ceiling to clip at (fields/cosmos.wgsl)
  let c = enc(1.0 - exp(-max(acc.rgb, vec3f(0.0)) / COSMOS)) + (hash2(vec2u(pos.xy) + vec2u(u32(k) * 4099u)) - 0.5) / 255.0;
  return vec4f(dec(clamp(c, vec3f(0.0), vec3f(1.0))), sat(acc.a));
}

// A coarser level from the finer: one bilinear tap where four of its texels meet.
@fragment fn downFS(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  return textureSampleLevel(finer, smp, pos.xy / vec2f(textureDimensions(finer) / 2u), 0.0);
}

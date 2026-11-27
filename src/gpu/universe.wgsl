// The cosmos, baked (cosmos.ts): each texel the light along its ray, in the phosphor's units, as planet.wgsl's are. A cube
// face's texel holds the sky; a marvel's, its patch of sky, seen from far off, and how much of the sky behind it it hides.
// What lies beyond is the farther off the fainter, and is hidden by what lies in front of it.

struct Bake { size: f32, layer: f32, kind: f32, ss: f32 }
struct Marvel { x: vec4f, y: vec4f, z: vec4f }
@group(0) @binding(0) var<uniform> B: Bake;
@group(0) @binding(1) var<uniform> MARVEL: array<Marvel, 16>;
@group(0) @binding(2) var smp: sampler;
@group(0) @binding(3) var finer: texture_2d<f32>;

const COSMOS = 0.3; // the scale it is stored at (fields/cosmos.wgsl)
const TAU = 6.2831853;
const PI = 3.14159265;

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
// Between the marvels, so space is nowhere flat: nebulosity far beyond our galaxy, clouds of glowing gas stirred by
// their own turbulence (domain-warped noise), coloured by what glows in them (oxygen's teal, hydrogen's red, sulphur's
// amber), and threads of dust across them, finer the farther in, hiding the stars behind. Faint: the sky's, not the eye's.
fn nebulosity(rd: vec3f) -> vec4f {
  let w = rd + 0.4 * (vec3f(fbm(rd * 2.0 + 1.0, 3), fbm(rd * 2.0 + 5.0, 3), fbm(rd * 2.0 + 9.0, 3)) - 0.5);
  let n = fbm(w * 3.0, 6);
  let gas = smoothstep(0.4, 0.8, n);
  let hue = fbm(w * 1.3 + 13.0, 3);
  let col = mix(mix(vec3f(0.15, 0.75, 0.8), vec3f(1.0, 0.2, 0.35), smoothstep(0.35, 0.6, hue)), vec3f(1.0, 0.6, 0.2), smoothstep(0.62, 0.75, hue));
  let thread = pow(1.0 - abs(2.0 * fbm(w * 7.0 + 3.0, 4) - 1.0), 10.0) * smoothstep(0.4, 0.6, fbm(w * 1.7 + 21.0, 3));
  return vec4f(col * gas * gas * (1.0 - 0.8 * thread) * 0.016 + vec3f(0.3, 0.35, 0.6) * n * n * 0.0015, 0.85 * thread);
}
fn sky(rd: vec3f) -> vec4f {
  let g = galaxy(rd);
  let n = nebulosity(rd);
  return vec4f(g.rgb * 0.014 + n.rgb * g.a, 1.0 - g.a * (1.0 - n.a));
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
  // a cloud, not a ball: it thins out raggedly toward the crescent's rim, as the ray passes nearer it
  let pc = r.o - r.d * dot(r.o, r.d);
  let edge = smoothstep(1.06, 0.5, length(pc) + 0.4 * (fbm(pc * 2.5 + 7.0, 4) - 0.5));
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
    let gas = ((exp(-ad / 0.02) * 2.5 + exp(-ad / 0.12) * 0.12 + exp(-ad / max(0.0015, foot)) * 4.0) * inside + 0.07) * 30.0; // (and a little everywhere: no pearl, nor the crescent's hollow, is a hole)
    L += (film(700.0 + 500.0 * fbm(p * 2.5 + 3.0, 4), 1.0) * 9.0 + vec3f(0.04, 0.05, 0.1)) * gas * dt;
    prev = k.x;
    t += dt;
  }
  let y = dot(L, vec3f(0.3, 0.5, 0.2));
  return vec4f(max(mix(vec3f(y), L, 1.35), vec3f(0.0)) * 0.008 * edge, 0.0); // its films' colours, a little deeper
}

// · A spiral galaxy whose heart is a Mandelbulb (White, Nylander: z ↦ zⁿ + c in spherical coordinates, n = 8), as a
// galaxy's bulge is: light, not a surface. Its old stars crowd where the orbit lingers near the set, so the bulb's
// folds glow, white-gold deep in and amber where the orbit ran out, its inside a dimmer haze, and its creases hold
// dust that reddens and dims what lies behind them; it fades out into the bulge's glow, and that into the disc: two
// arms of young blue stars with hydrogen glowing pink among them and dust along their inner edges, seen 50° from face
// on, so the near arm's dust lies across the heart.
const BULB = 0.55; // the bulb's size, in the disc's units (its scale length is 2.2)
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
struct Glow { L: vec3f, T: vec3f }
// The disc's light and dust along r from a to b, in n steps.
fn starlight(r: Ray, a: f32, b: f32, n: i32) -> Glow {
  var g = Glow(vec3f(0.0), vec3f(1.0));
  let dt = (b - a) / f32(n);
  for (var i = 0; i < n && b > a; i++) {
    let p = r.o + r.d * (a + (f32(i) + 0.5) * dt);
    let R = length(p.xy);
    let ph = atan2(p.y, p.x) - log(max(R, 0.2)) / 0.42; // pitch 23°
    let cl = fbm(p * vec3f(5.0, 5.0, 9.0), 4);
    let arm = pow(0.5 + 0.5 * cos(2.0 * ph + 0.7 * cl), 6.0) * smoothstep(1.0, 1.8, R);
    let lane = pow(0.5 + 0.5 * cos(2.0 * ph + 0.55 + 0.7 * cl), 14.0) * smoothstep(1.0, 1.6, R);
    let disc = exp(-R / 2.2) * exp(-abs(p.z) / 0.07) * smoothstep(4.7, 3.2, R);
    let j = (vec3f(1.0, 0.82, 0.65) * 0.09 + vec3f(0.55, 0.72, 1.0) * arm * (1.0 + 6.0 * cl * cl) * 1.8 + vec3f(1.0, 0.22, 0.45) * arm * pow(cl, 6.0) * 45.0) * disc
          + vec3f(1.0, 0.86, 0.66) * exp(-length(p * vec3f(1.0, 1.0, 1.6)) / 0.4) * 1.0; // the bulge
    let od = 60.0 * disc * (0.15 + 2.5 * lane) * smoothstep(0.35, 0.65, cl) * dt;
    g.L += g.T * j * dt;
    g.T *= exp(-od * vec3f(0.7, 1.0, 1.4));
  }
  return g;
}
// The heart along r from a to b: light gathered as the ray passes near the bulb's folds and through it.
fn heart(r: Ray, a: f32, b: f32) -> Glow {
  var g = Glow(vec3f(0.0), vec3f(1.0));
  var t = a;
  for (var i = 0; i < 96 && t < b; i++) {
    let p = r.o + r.d * t;
    let e = bulbDE(p / BULB);
    let d = e.x * BULB;
    let inside = d <= 0.0;
    let prof = exp(-dot(p, p) / (0.64 * BULB * BULB)); // a bulge's light falls off from its middle: no edge to it
    let fold = prof * select(exp(-d / 0.012) + 0.3 * exp(-d / 0.08), 0.25 + 2.0 * exp(-dot(p, p) / (0.09 * BULB * BULB)), inside); // the stars, thickest on the set's folds and in its heart
    let hot = mix(vec3f(1.0, 0.96, 0.9), vec3f(1.0, 0.8, 0.52), smoothstep(0.1, 0.7, e.y) * smoothstep(0.0, 0.03, d));
    let dust = prof * select(5.0 * exp(-d / 0.02) * smoothstep(0.5, 0.15, e.y), 5.0, inside); // in its creases, and through it
    let dt = select(clamp(0.6 * d, 0.003, 0.05), 0.01, inside);
    g.L += g.T * hot * fold * dt;
    g.T *= exp(-dust * dt * vec3f(0.75, 1.0, 1.35));
    t += dt;
  }
  return g;
}
fn bulbGalaxy(v: vec3f) -> vec4f {
  let D = 4.4 / MARVEL[1].x.w;
  let r = look(v, D, 0.9, 0.35);
  // the disc, z = 0, in front of the heart and behind it, and the heart between
  let tz = vec2f((-0.5 - r.o.z) / r.d.z, (0.5 - r.o.z) / r.d.z);
  let t0 = max(min(tz.x, tz.y), 0.0);
  let t1 = max(tz.x, tz.y);
  let hb = ball(r.o, r.d, 1.3 * BULB);
  let tm = select(t1, clamp(0.5 * (hb.x + hb.y), t0, t1), hb.y > 0.0);
  let nf = clamp(i32(72.0 * (tm - t0) / max(t1 - t0, 1e-6)), 1, 71);
  let front = starlight(r, t0, tm, nf);
  let back = starlight(r, tm, t1, 72 - nf);
  var mid = Glow(vec3f(0.0), vec3f(1.0));
  if (hb.y > 0.0) { mid = heart(r, max(hb.x, 0.0), hb.y); }
  let L = front.L * 0.75 + front.T * (mid.L * 2.6 + mid.T * back.L * 0.75);
  return vec4f(L, 1.0 - front.T.g * mid.T.g * back.T.g);
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
  let gas = mix(vec3f(0.1, 0.9, 0.75), vec3f(1.0, 0.12, 0.18), smoothstep(0.8, 1.8, r + 0.8 * (m - 0.5)));
  return vec3f(0.6, 0.85, 1.0) * core * core * (0.5 + n) * 3.0 + gas * cloud * 3.5 + vec3f(0.8, 0.05, 0.03) * cloud * smoothstep(0.55, 0.8, n) * 3.0;
}
fn kleinianNebula(v: vec3f) -> vec4f {
  let D = 3.0 / MARVEL[2].x.w;
  let r = look(v, D, 0.45, 0.4);
  // the floor of tracery lies in |z| < 0.62, the gas below it to z = −3. Where the ray crosses the floor's middle:
  // how far the cloud reaches there, ragged, and the light that falls on it from behind
  let tz = vec2f((0.62 - r.o.z) / r.d.z, (-3.0 - r.o.z) / r.d.z);
  let pm = r.o - r.d * r.o.z / r.d.z;
  let window = smoothstep(2.9, 2.0, length(pm.xy) + 0.8 * fbm(pm * 1.5, 3));
  let rim = backlight(pm - vec3f(0.0, 0.0, 1.5)) * 0.45;
  var t = tz.x;
  var L = vec3f(0.0);
  var T = vec3f(1.0);
  for (var i = 0; i < 128 && T.g > 0.004 && window > 0.0; i++) {
    let p = r.o + r.d * t;
    if (p.z < -0.62) { break; }
    let d = cathedral(p);
    let w = max(0.004, px * t); // its sheets have no thickness of their own: as thick as a texel sees
    let dt = clamp(d - w, 0.7 * w, 0.06);
    let sheet = exp(-d / w) / w * window;
    // dark, but for the light from behind that the dust scatters back toward us: its silver lining. Dust, not stone:
    // it dims what is behind it and reddens it, blue first, and a little gets through
    L += T * rim * sheet * dt;
    T *= exp(-1.1 * sheet * dt * vec3f(0.7, 1.0, 1.4));
    t += dt;
  }
  // and the gas, seen through what the tracery lets by
  let tg = max(t, (-0.62 - r.o.z) / r.d.z);
  let dg = (tz.y - tg) / 12.0;
  for (var i = 0; i < 12 && T.g > 0.004; i++) {
    let p = r.o + r.d * (tg + (f32(i) + 0.5) * dg);
    L += T * backlight(p) * exp(-(p.z + 1.6) * (p.z + 1.6) / 0.8) * dg;
  }
  return vec4f(L * 0.12, 0.0);
}

// ---- the strange ones ----------------------------------------------------------------------------------------------
// Smaller and weirder, round the whole sky (cosmos.ts STRANGE), each its own patch of it, uv in [−1, 1]², and like the
// rest only light and dust: nothing in this sky is solid. pu: a texel's width in uv.
var<private> pu: f32;
// the patch's own uv for ray v of marvel k
fn onPatch(v: vec3f, k: i32) -> vec2f { return v.xy / (v.z * MARVEL[k].x.w); }
// no patch of sky has a frame: each thins out raggedly toward its rim
fn ragged(q: vec2f, r: f32, s: f32) -> f32 { return smoothstep(r, 0.5 * r, length(q) + 0.3 * (fbm(vec3f(q * 2.5, s), 4) - 0.5)); }
fn cmul(a: vec2f, b: vec2f) -> vec2f { return vec2f(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x); }

// · A Julia set's filaments as gas. z ↦ z² + c with c on the Mandelbrot set's edge, where the set is all filament; the
// gas glows by the set's own distance estimate, |z| ln|z| / |z′|, coloured by the angle its orbit is caught at; a second
// set, c a hair off, lies behind it redder, and both are stirred a little, as gas is.
fn juliaDE(z0: vec2f, c: vec2f) -> vec2f {
  var z = z0;
  var dz = vec2f(1.0, 0.0);
  var trap = 1e9;
  var ang = 0.0;
  for (var i = 0; i < 96; i++) {
    dz = 2.0 * cmul(z, dz);
    z = cmul(z, z) + c;
    let r = dot(z, z);
    if (r < trap) { trap = r; ang = atan2(z.y, z.x); }
    if (r > 1e4) { break; }
  }
  let r = length(z);
  return vec2f(select(1e9, 0.5 * r * log(r) / max(length(dz), 1e-9), r > 2.0), ang); // (nothing stays: a dendrite has no inside)
}
fn filaments(q: vec2f) -> vec4f {
  let w = q + 0.06 * vec2f(fbm(vec3f(q * 3.0, 1.0), 4) - 0.5, fbm(vec3f(q * 3.0, 7.0), 4) - 0.5);
  var L = vec3f(0.0);
  for (var j = 0; j < 2; j++) {
    let c = select(vec2f(-0.1011, 0.9563), vec2f(0.0, 1.0), j == 1); // two Misiurewicz points: their sets are dendrites
    let e = juliaDE(cmul(w, vec2f(1.05, 0.3)) * select(1.0, 1.1, j == 1) + select(vec2f(0.0), vec2f(0.08, -0.05), j == 1), c);
    let col = select(0.55 + 0.45 * cos(vec3f(0.0, 2.1, 4.2) + e.y + 2.6), vec3f(1.0, 0.3, 0.35), j == 1);
    L += col * (exp(-e.x / (1.5 * pu)) + 0.35 * exp(-e.x / (10.0 * pu))) * select(1.0, 0.45, j == 1);
  }
  return vec4f(L * 0.05 * ragged(q, 1.0, 9.0), 0.0);
}

// · The hyperbolic plane, {7, 3}, as a veil like an aurora's. Every point of the Poincaré disc reflected into one
// triangle (π/7, π/3, π/2) by its three mirrors, counting; the heptagons' edges are the circle's, measured back out by
// how much the inversions shrank the way, so each is as thin on the sky as the next however near the rim. Lit as an
// aurora is: oxygen's green low, its red above, in rays.
fn veil(q: vec2f) -> vec4f {
  let a = PI / 7.0;
  let b = PI / 3.0;
  let k = 1.0 / sqrt(cos(b) * cos(b) - sin(a) * sin(a));
  let cd = cos(b) * k; // the third mirror: the circle about (cd, 0), radius cr, square to the disc's rim
  let cr = sin(a) * k;
  let n = vec2f(-sin(a), cos(a));
  var z = q / 0.96;
  var s = 1.0;
  var flips = 0.0;
  if (dot(z, z) >= 1.0) { return vec4f(0.0); }
  for (var i = 0; i < 48; i++) {
    var done = true;
    let ang = atan2(z.y, z.x);
    // turn by whole sevenths, then the two straight mirrors
    let m = floor(ang / (2.0 * a));
    if (m != 0.0) { let t = -2.0 * a * m; z = vec2f(z.x * cos(t) - z.y * sin(t), z.x * sin(t) + z.y * cos(t)); }
    if (dot(z, n) > 0.0) { z -= 2.0 * dot(z, n) * n; flips += 1.0; done = false; }
    let w = z - vec2f(cd, 0.0);
    let l2 = dot(w, w);
    if (l2 < cr * cr) { z = vec2f(cd, 0.0) + w * (cr * cr / l2); s *= cr * cr / l2; flips += 1.0; done = false; }
    if (done) { break; }
  }
  let d = abs(length(z - vec2f(cd, 0.0)) - cr) / s * 0.96; // the edge, in uv
  let r = length(q);
  let rays = 0.45 + 0.55 * fbm(vec3f(q.x * 40.0, 0.0, 2.0), 3); // drawn down the sky, as an aurora's are
  let low = smoothstep(0.6, -0.6, q.y);
  let col = mix(vec3f(0.85, 0.15, 0.45), vec3f(0.25, 1.0, 0.45), low);
  let edge = exp(-d * d / (3.0 * pu * pu)) + 0.25 * exp(-d / (12.0 * pu));
  let fill = 0.025 * (0.5 + 0.5 * cos(PI * flips)) * smoothstep(1.0, 0.7, r); // its tiles faintly, one in two
  return vec4f(col * (edge + fill) * rays * 0.05 * smoothstep(0.96, 0.75, r * (0.9 + 0.2 * fbm(vec3f(q * 2.0, 4.0), 3))), 0.0);
}

// · Star streams on strange attractors: one long orbit, its stars strung along it, thickest where it lingers and
// coloured by its speed, slow and gold, fast and blue. Lorenz's (σ 10, ρ 28, β 8/3), its two wings; and Aizawa's
// (a .95, b .7, c .6, d 3.5, e .25, f .1), an apple of orbits with a spout through its core.
fn flow(p: vec3f, kind: i32) -> vec3f {
  if (kind == 0) { return vec3f(10.0 * (p.y - p.x), p.x * (28.0 - p.z) - p.y, p.x * p.y - 8.0 / 3.0 * p.z); }
  return vec3f((p.z - 0.7) * p.x - 3.5 * p.y, 3.5 * p.x + (p.z - 0.7) * p.y, 0.6 + 0.95 * p.z - p.z * p.z * p.z / 3.0 - (p.x * p.x + p.y * p.y) * (1.0 + 0.25 * p.z) + 0.1 * p.z * p.x * p.x * p.x);
}
fn streams(q: vec2f, kind: i32) -> vec4f {
  if (dot(q, q) > 1.3) { return vec4f(0.0); }
  let lz = kind == 0;
  var p = select(vec3f(0.1, 0.0, 0.0), vec3f(1.0, 1.0, 20.0), lz);
  let h = select(0.016, 0.006, lz);
  for (var i = 0; i < 300; i++) { p += h * flow(p + 0.5 * h * flow(p, kind), kind); } // (by the midpoint rule: Euler's flings Aizawa's off)
  let a = select(0.35, 0.6, lz);
  let c = cos(a);
  let sn = sin(a);
  var last = vec2f(0.0);
  var L = vec3f(0.0);
  let w = 1.3 * pu;
  let fast = select(vec2f(0.6, 3.0), vec2f(40.0, 160.0), lz);
  for (var i = 0; i < 2200; i++) {
    let v = flow(p + 0.5 * h * flow(p, kind), kind);
    p += h * v;
    // seen from a little off its axis
    let y = select(vec2f(c * p.x - sn * p.y, p.z - 0.6) / 1.75, vec2f(c * p.x - sn * p.y, p.z - 25.0) / 27.0, lz);
    if (i > 0) {
      let e = y - last;
      let t = clamp(dot(q - last, e) / max(dot(e, e), 1e-12), 0.0, 1.0);
      let d2 = dot(q - last - e * t, q - last - e * t);
      let star = 0.3 + 3.0 * pow(fract(sin(f32(i) * 12.9898) * 43758.5453), 12.0);
      let col = mix(vec3f(1.0, 0.75, 0.4), vec3f(0.5, 0.7, 1.0), smoothstep(fast.x, fast.y, length(v)));
      L += col * (exp(-d2 / (w * w)) * star + 0.04 * exp(-sqrt(d2) / (8.0 * w))) * length(e) / w;
    }
    last = y;
  }
  return vec4f(L * select(0.006, 0.0035, lz) * ragged(q, 1.15, 5.0), 0.0);
}

// · A galaxy seen through a Menger sponge of dust: cube within cube with every middle taken out, its tunnels lined up
// with the eye but for a breath, standing in front of a spiral galaxy, gold in its heart and blue in its arms, whose
// light comes through the sponge's holes, square within square, and reddens through its dust; its edges silvered where
// that light grazes them.
fn sponge(p: vec3f) -> f32 {
  let b = abs(p) - vec3f(1.0);
  var d = min(max(b.x, max(b.y, b.z)), 0.0) + length(max(b, vec3f(0.0)));
  var s = 1.0;
  for (var m = 0; m < 4; m++) {
    let a = (p * s - 2.0 * floor(p * s * 0.5)) - 1.0;
    s *= 3.0;
    let r = abs(1.0 - 3.0 * abs(a));
    let c = (min(max(r.x, r.y), min(max(r.y, r.z), max(r.z, r.x))) - 1.0) / s;
    d = max(d, c);
  }
  return d;
}
fn mengerGalaxy(v: vec3f) -> vec4f {
  let D = 2.6 / MARVEL[7].x.w;
  let r = look(v, D, 0.3, 0.25);
  // the galaxy, a disc in the plane z = −2.2 behind the sponge, where the ray meets it
  let g = r.o + r.d * (-2.2 - r.o.z) / r.d.z;
  let R = length(g.xy);
  let ph = atan2(g.y, g.x) - log(max(R, 0.15)) / 0.35;
  let cl = fbm(vec3f(g.xy * 3.0, 1.0), 4);
  let arm = pow(0.5 + 0.5 * cos(2.0 * ph + 0.8 * cl), 5.0) * smoothstep(0.3, 0.8, R);
  let back = (vec3f(1.0, 0.85, 0.62) * exp(-R / 0.35) * 2.5 + vec3f(0.5, 0.7, 1.0) * arm * exp(-R / 1.4) * (0.6 + cl) + vec3f(1.0, 0.25, 0.45) * arm * pow(cl, 5.0) * 6.0) * smoothstep(2.6, 1.6, R);
  // the sponge, a box ±1, its axis along the eye's (the tilt undone), turned about it, and a breath off it
  let ct = cos(0.3);
  let st = sin(0.3);
  let ca = cos(0.4);
  let sa = sin(0.4);
  let cb = cos(0.05);
  let sb = sin(0.05);
  var L = vec3f(0.0);
  var T = vec3f(1.0);
  let hb = ball(r.o, r.d, 1.75);
  if (hb.y > 0.0) {
    var t = max(hb.x, 0.0);
    for (var i = 0; i < 160 && t < hb.y && T.g > 0.01; i++) {
      let p = r.o + r.d * t;
      let p0 = vec3f(p.x, ct * p.y + st * p.z, ct * p.z - st * p.y);
      let p1 = vec3f(ca * p0.x - sa * p0.y, sa * p0.x + ca * p0.y, p0.z);
      let d = sponge(vec3f(cb * p1.x - sb * p1.z, p1.y, sb * p1.x + cb * p1.z));
      let w = max(0.004, px * t);
      let dt = select(clamp(d, w, 0.08), 0.012, d < 0.0);
      L += T * back * 0.6 * exp(-abs(d) / w) * w / max(dt, w); // its edges, silvered by the light behind
      T *= exp(-select(0.0, 30.0, d < 0.0) * dt * vec3f(0.7, 1.0, 1.4));
      t += dt;
    }
  }
  return vec4f((L + T * back) * 0.05, 1.0 - T.g);
}

// · A ring nebula strung on a Kleinian limit set: the Apollonian gasket, every gap between three touching circles
// filled with the one circle that touches all three (Descartes' theorem gives its curvature, its complex form its
// centre), without end; the limit set of the group of inversions that makes it. Each circle a shell of gas round the hot
// star at the middle: teal near it, hydrogen red outside, the outermost rim brightest, as a ring nebula's is.
fn csqrt(z: vec2f) -> vec2f {
  let r = length(z);
  return vec2f(sqrt(max(0.5 * (r + z.x), 0.0)), sign(z.y + 1e-12) * sqrt(max(0.5 * (r - z.x), 0.0)));
}
// the circle (centre, curvature) in the gap between three touching ones, curvatures signed (the outer one's negative)
fn soddy(a: vec3f, b: vec3f, c: vec3f) -> vec3f {
  let k = a.z + b.z + c.z + 2.0 * sqrt(max(a.z * b.z + b.z * c.z + c.z * a.z, 0.0));
  let s = a.xy * a.z + b.xy * b.z + c.xy * c.z;
  let w = 2.0 * csqrt(cmul(a.xy, b.xy) * a.z * b.z + cmul(b.xy, c.xy) * b.z * c.z + cmul(c.xy, a.xy) * c.z * a.z);
  // of the two roots, the one touching all three
  let e = vec2f(
    abs(length((s + w) / k - a.xy) - abs(1.0 / k + 1.0 / a.z)) + abs(length((s + w) / k - b.xy) - abs(1.0 / k + 1.0 / b.z)) + abs(length((s + w) / k - c.xy) - abs(1.0 / k + 1.0 / c.z)),
    abs(length((s - w) / k - a.xy) - abs(1.0 / k + 1.0 / a.z)) + abs(length((s - w) / k - b.xy) - abs(1.0 / k + 1.0 / b.z)) + abs(length((s - w) / k - c.xy) - abs(1.0 / k + 1.0 / c.z)));
  return vec3f(select((s - w) / k, (s + w) / k, e.x < e.y), k);
}
fn ringNebula(q: vec2f) -> vec4f {
  let p = q / 0.92;
  if (dot(p, p) > 1.1) { return vec4f(0.0); }
  // the outer circle, and three inside it, each touching the other two and it
  let ri = 2.0 * sqrt(3.0) - 3.0;
  var C = array<vec3f, 4>(vec3f(0.0, 0.0, -1.0), vec3f(0.0, 1.0 - ri, 1.0 / ri), vec3f(-0.866 * (1.0 - ri), -0.5 * (1.0 - ri), 1.0 / ri), vec3f(0.866 * (1.0 - ri), -0.5 * (1.0 - ri), 1.0 / ri));
  var near = vec2f(abs(length(p) - 1.0), 1.0); // the nearest rim, and its circle's radius
  for (var j = 1; j < 4; j++) {
    let d = abs(length(p - C[j].xy) - 1.0 / C[j].z);
    if (d < near.x) { near = vec2f(d, 1.0 / C[j].z); }
  }
  // the gap p is in: bounded by the three circles nearest it
  var inGap = true;
  for (var j = 1; j < 4; j++) { if (length(p - C[j].xy) < 1.0 / C[j].z) { inGap = false; } }
  var g = array<vec3f, 3>(C[0], C[1], C[2]);
  if (inGap) {
    var far = 0;
    var fd = -1.0;
    for (var j = 0; j < 4; j++) {
      let d = abs(length(p - C[j].xy) - abs(1.0 / C[j].z));
      if (d > fd) { fd = d; far = j; }
    }
    var n = 0;
    for (var j = 0; j < 4; j++) { if (j != far) { g[n] = C[j]; n++; } }
    for (var i = 0; i < 14; i++) {
      let D = soddy(g[0], g[1], g[2]);
      let rD = 1.0 / D.z;
      let dD = length(p - D.xy) - rD;
      if (abs(dD) < near.x) { near = vec2f(abs(dD), rD); }
      if (dD < 0.0 || rD < 0.5 * pu) { break; }
      // on into the smaller gap p is in: D takes the place of whichever of the three is farthest
      var fj = 0;
      var fdd = -1.0;
      for (var j = 0; j < 3; j++) {
        let d = abs(length(p - g[j].xy) - abs(1.0 / g[j].z));
        if (d > fdd) { fdd = d; fj = j; }
      }
      g[fj] = D;
    }
  }
  let d = near.x * 0.92;
  let col = mix(vec3f(0.2, 0.95, 0.9), vec3f(1.0, 0.25, 0.3), smoothstep(0.2, 0.85, length(p)));
  let shell = (exp(-d * d / (2.0 * pu * pu)) + 0.25 * exp(-d / (10.0 * pu))) * smoothstep(0.3 * pu, 2.0 * pu, near.y) * (0.4 + 0.6 * smoothstep(0.0, 0.3, near.y));
  let star = vec3f(0.7, 0.85, 1.0) * 0.004 / (dot(p, p) + 0.0015);
  return vec4f((col * shell * (0.5 + 1.5 * smoothstep(0.85, 1.0, length(p))) + star) * 0.05, 0.0);
}

fn marvel(k: i32, v: vec3f) -> vec4f {
  switch k {
    case 0: { return indra(v); }
    case 1: { return bulbGalaxy(v); }
    case 2: { return kleinianNebula(v); }
    case 3: { return streams(onPatch(v, k), 1); }
    case 4: { return filaments(onPatch(v, k)); }
    case 5: { return veil(onPatch(v, k)); }
    case 6: { return streams(onPatch(v, k), 0); }
    case 7: { return mengerGalaxy(v); }
    default: { return ringNebula(onPatch(v, k)); }
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
  let k = i32(B.layer) + select(0, 3, B.kind > 1.5); // (the strange ones follow the three in MARVEL)
  px = select(2.0, 2.0 * MARVEL[k].x.w, B.kind > 0.0) / B.size;
  pu = 2.0 / B.size;
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

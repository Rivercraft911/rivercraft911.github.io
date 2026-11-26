// The light on River's hardware, path traced (trace.ts). The mesh pass (mesh.wgsl) still draws every edge at the
// screen's own resolution; what is traced here, at a quarter of it, is what a rasteriser cannot know: how much of the
// sun's disc each point sees, the light that reaches it from everywhere else (the sky, the ground, its neighbours,
// whatever glows), and what a metal reflects. In its turn, one frame in four, each texel fires one ray through its
// centre, then one path from where that lands, and keeps a running mean of what came back, carried from frame to frame
// by where the point was the frame before; an edge-stopping wavelet smooths what noise is left. The eye is the origin,
// as in mesh.wgsl.

struct U {
  right: vec4f,  // the camera's; .w = 1/tan(fov/2)
  up: vec4f,     // .w = aspect
  fwd: vec4f,    // .w = the frame's number
  pright: vec4f, // the camera of the last frame traced, the same
  pup: vec4f,
  pfwd: vec4f,   // .w = 1: there is no history
  sun: vec4f,    // toward the sun; .w its irradiance
  sunc: vec4f,   // its colour; .w exposure
  sky: vec4f,    // the sky overhead; .w the sun's angular radius
  hor: vec4f,    // the sky at the horizon
  gnd: vec4f,    // and below it, where there is no ground
  zen: vec4f,    // which way is up, here
  ball: vec4f,   // the ground: a sphere's centre and radius (0: none)
  pball: vec4f,  // where it was then
  size: vec4f,   // the traced image, px; how many instances; which texel of each four takes a sample this frame
  roi: vec4f,    // the sphere round everything traced: past it the ground is in nothing's shadow; .w its radius
}

struct Node { lo0: vec3f, c0: u32, hi0: vec3f, n0: u32, lo1: vec3f, c1: u32, hi1: vec3f, n1: u32 } // bvh.worker.ts
struct Tri { p: vec3f, n0: u32, e1: vec3f, n1: u32, e2: vec3f, n2: u32 }
struct Inst {
  m0: vec4f, m1: vec4f, m2: vec4f, // model → world, rows
  w0: vec4f, w1: vec4f, w2: vec4f, // world → model
  p0: vec4f, p1: vec4f, p2: vec4f, // model → world when last a frame was traced
  lo: vec4f,                       // its box in the world; .w where its nodes start
  hi: vec4f,                       // .w where its triangles start
  k: vec4f,                        // brightness, glow, which of the scene's things it is (from 1)
}

@group(0) @binding(0) var<uniform> u: U;
@group(1) @binding(0) var<storage, read> nodes: array<Node>;
@group(1) @binding(1) var<storage, read> tris: array<Tri>;
@group(1) @binding(2) var<storage, read> mats: array<vec2u>; // colour (rgb its square root, a); metal, rough, translucent
@group(1) @binding(3) var<storage, read> inst: array<Inst>;
@group(1) @binding(4) var field: texture_2d<f32>;  // what the field shows this frame: the ground's colour
@group(1) @binding(5) var pacc: texture_2d<f32>;   // the history: light, the sun's share
@group(1) @binding(6) var pgeo: texture_2d<f32>;   // and what it was the light of
@group(1) @binding(7) var acc: texture_storage_2d<rgba16float, write>;
@group(1) @binding(8) var geo: texture_storage_2d<rgba32float, write>; // normal, distance, what (instance, kind, rough), samples

const PI = 3.14159265;
const TAU = 6.2831853;
const FAR = 1e30;
const DEPTH = 24.0; // samples a texel's mean remembers
const MATTE = 0.0; // a texel's kind: lit by everything it faces; a metal, lit by what it reflects; the ground; nothing
const METAL = 1.0;
const GROUND = 2.0;
const NONE = 3.0;

// ---- chance -------------------------------------------------------------------------------------------------
var<private> seed: u32;
fn rnd() -> f32 {
  seed = seed * 747796405u + 2891336453u;
  let w = ((seed >> ((seed >> 28u) + 4u)) ^ seed) * 277803737u;
  return f32((w >> 22u) ^ w) / 4294967296.0;
}
// Two vectors square to n (Duff et al.)
fn frame(n: vec3f) -> mat3x3f {
  let s = select(-1.0, 1.0, n.z >= 0.0);
  let a = -1.0 / (s + n.z);
  let b = n.x * n.y * a;
  return mat3x3f(vec3f(1.0 + s * n.x * n.x * a, s * b, -s * n.x), vec3f(b, s + n.y * n.y * a, -n.y), n);
}
// Lambert's cosine about n
fn cosine(n: vec3f) -> vec3f {
  let a = TAU * rnd();
  let z = 2.0 * rnd() - 1.0;
  let r = sqrt(max(1.0 - z * z, 0.0));
  let d = n + vec3f(r * cos(a), r * sin(a), z);
  return select(n, normalize(d), dot(d, d) > 1e-8);
}
// A point of the sun's disc
fn toSun() -> vec3f {
  let a = TAU * rnd();
  let r = sqrt(rnd()) * tan(u.sky.w);
  let f = frame(u.sun.xyz);
  return normalize(u.sun.xyz + (f[0] * cos(a) + f[1] * sin(a)) * r);
}
// A microfacet of a GGX surface (alpha a) as seen from v, which is in the surface's frame: the visible normals (Heitz 2018).
fn facet(v: vec3f, a: f32) -> vec3f {
  let h = normalize(vec3f(a * v.x, a * v.y, v.z));
  let l = h.x * h.x + h.y * h.y;
  let t1 = select(vec3f(1.0, 0.0, 0.0), vec3f(-h.y, h.x, 0.0) / sqrt(max(l, 1e-12)), l > 1e-12);
  let t2 = cross(h, t1);
  let r = sqrt(rnd());
  let ph = TAU * rnd();
  let x = r * cos(ph);
  let s = 0.5 * (1.0 + h.z);
  let y = (1.0 - s) * sqrt(max(1.0 - x * x, 0.0)) + s * r * sin(ph);
  let n = x * t1 + y * t2 + sqrt(max(1.0 - x * x - y * y, 0.0)) * h;
  return normalize(vec3f(a * n.x, a * n.y, max(n.z, 1e-6)));
}
// Off a surface with normal n, seen from v: a mirror's direction, spread by its roughness.
fn glance(n: vec3f, v: vec3f, rough: f32) -> vec3f {
  let f = frame(n);
  let h = facet(vec3f(dot(v, f[0]), dot(v, f[1]), dot(v, f[2])), rough * rough);
  return reflect(-v, f[0] * h.x + f[1] * h.y + f[2] * h.z);
}

// ---- rays ---------------------------------------------------------------------------------------------------
fn unoct(e: u32) -> vec3f {
  let f = vec2f(f32(e >> 16u), f32(e & 0xffffu)) / 32767.5 - 1.0;
  var n = vec3f(f, 1.0 - abs(f.x) - abs(f.y));
  let t = max(-n.z, 0.0);
  n = vec3f(n.x + select(t, -t, n.x >= 0.0), n.y + select(t, -t, n.y >= 0.0), n.z);
  return normalize(n);
}
fn turn(m: Inst, v: vec3f) -> vec3f { return vec3f(dot(m.m0.xyz, v), dot(m.m1.xyz, v), dot(m.m2.xyz, v)); }

// Where a ray enters a box, or FAR if it does not before tmax.
fn slab(lo: vec3f, hi: vec3f, o: vec3f, inv: vec3f, tmax: f32) -> f32 {
  let a = (lo - o) * inv;
  let b = (hi - o) * inv;
  let n = min(a, b);
  let f = max(a, b);
  let tn = max(max(n.x, n.y), max(n.z, 0.0));
  let tf = min(min(f.x, f.y), min(f.z, tmax));
  return select(FAR, tn, tn <= tf);
}

struct Hit { t: f32, i: i32, tri: u32, uv: vec2f }

// The nearest thing along o + t d, t < tmax; or, for a ray toward a light, whether anything opaque is in the way at
// all (t = 0 if so). Each instance's ray is taken into its model's frame, unnormalised, so t is the world's.
fn hit(o: vec3f, d0: vec3f, tmax: f32, shadow: bool) -> Hit {
  var h = Hit(tmax, -1, 0u, vec2f(0.0));
  let d = select(d0, vec3f(1e-12), abs(d0) < vec3f(1e-12));
  let inv = 1.0 / d;
  let n = i32(u.size.z);
  var stack: array<u32, 40>;
  for (var i = 0; i < n; i++) {
    let m = inst[i];
    if (slab(m.lo.xyz, m.hi.xyz, o, inv, h.t) >= FAR) { continue; }
    let mo = vec3f(dot(m.w0, vec4f(o, 1.0)), dot(m.w1, vec4f(o, 1.0)), dot(m.w2, vec4f(o, 1.0)));
    var md = vec3f(dot(m.w0.xyz, d), dot(m.w1.xyz, d), dot(m.w2.xyz, d));
    md = select(md, vec3f(1e-12), abs(md) < vec3f(1e-12));
    let mi = 1.0 / md;
    let nb = u32(m.lo.w);
    let tb = u32(m.hi.w);
    var sp = 0;
    var at = 0u;
    loop {
      let N = nodes[nb + at];
      var t0 = slab(N.lo0, N.hi0, mo, mi, h.t);
      var t1 = slab(N.lo1, N.hi1, mo, mi, h.t);
      for (var c = 0; c < 2; c++) {
        let leaf = select(N.n0, N.n1, c == 1);
        if (leaf == 0u || select(t0, t1, c == 1) >= FAR) { continue; }
        let first = tb + select(N.c0, N.c1, c == 1);
        for (var k = first; k < first + leaf; k++) {
          let T = tris[k];
          let pv = cross(md, T.e2);
          let id = 1.0 / dot(T.e1, pv);
          let s = mo - T.p;
          let a = dot(s, pv) * id;
          let q = cross(s, T.e1);
          let b = dot(md, q) * id;
          let t = dot(T.e2, q) * id;
          if (a >= 0.0 && b >= 0.0 && a + b <= 1.0 && t > 0.0 && t < h.t) {
            if (!shadow) { h = Hit(t, i, k, vec2f(a, b)); }
            else if ((mats[k].y & 0x10000u) == 0u) { return Hit(0.0, i, k, vec2f(a, b)); } // solder mask lets the light by
          }
        }
      }
      t0 = select(t0, FAR, N.n0 > 0u);
      t1 = select(t1, FAR, N.n1 > 0u);
      if (t0 < FAR || t1 < FAR) { // the nearer child now, the farther one later
        let zero = t0 <= t1;
        at = select(N.c1, N.c0, zero);
        if (max(t0, t1) < FAR && sp < 40) { stack[sp] = select(N.c0, N.c1, zero); sp++; }
        continue;
      }
      if (sp == 0) { break; }
      sp--;
      at = stack[sp];
    }
  }
  return h;
}
fn dark(o: vec3f, d: vec3f) -> bool { return ball(o, d) > 0.0 || hit(o, d, FAR, true).t == 0.0; }

// Where a ray meets the ground, or −1.
fn ball(o: vec3f, d: vec3f) -> f32 {
  if (u.ball.w <= 0.0) { return -1.0; }
  let c = o - u.ball.xyz;
  let b = dot(c, d);
  let q = b * b - dot(c, c) + u.ball.w * u.ball.w;
  if (q < 0.0) { return -1.0; }
  let t = -b - sqrt(q);
  return select(-1.0, t, t > 0.0);
}

// ---- what a ray lands on ------------------------------------------------------------------------------------
struct Surf { x: vec3f, n: vec3f, ng: vec3f, base: vec3f, metal: f32, rough: f32, k: f32, glow: f32 }

fn surf(h: Hit, o: vec3f, d: vec3f) -> Surf {
  let m = inst[h.i];
  let T = tris[h.tri];
  let mt = mats[h.tri];
  var ng = normalize(turn(m, cross(T.e1, T.e2)));
  if (dot(ng, d) > 0.0) { ng = -ng; } // CAD is not always wound one way: both faces are surfaces
  var n = normalize(turn(m, unoct(T.n0) * (1.0 - h.uv.x - h.uv.y) + unoct(T.n1) * h.uv.x + unoct(T.n2) * h.uv.y));
  if (dot(n, ng) < 0.0) { n = -n; }
  let c = unpack4x8unorm(mt.x);
  return Surf(o + d * h.t, n, ng, c.rgb * c.rgb, f32(mt.y & 0xffu) / 255.0, max(f32((mt.y >> 8u) & 0xffu) / 255.0, 0.045), m.k.x, m.k.y);
}
// Off the surface, so a ray leaving does not meet it again: by a few of the floats' own steps at that distance.
fn lift(s: Surf) -> vec3f { return s.x + s.ng * (3e-5 * max(length(s.x), 0.01)); }

fn sky(d: vec3f) -> vec3f {
  let y = dot(d, u.zen.xyz);
  return mix(u.gnd.rgb, mix(u.hor.rgb, u.sky.rgb, sqrt(clamp(y, 0.0, 1.0))), smoothstep(-0.08, 0.08, y));
}
// The sky's light on a face that sees all of it, as a mean radiance: the cosine's share of √cos is 4/5.
fn open() -> vec3f { return mix(u.hor.rgb, u.sky.rgb, 0.8); }
fn sunlight() -> vec3f { return u.sunc.rgb * u.sun.w; }

// Cook–Torrance, as mesh.wgsl has it: what of the light from l a surface sends toward v, per unit irradiance.
fn brdf(s: Surf, v: vec3f, l: vec3f) -> vec3f {
  let a = s.rough * s.rough;
  let H = normalize(l + v);
  let nl = max(dot(s.n, l), 0.0);
  let nv = max(dot(s.n, v), 1e-4);
  let nh = max(dot(s.n, H), 0.0);
  let F0 = mix(vec3f(0.04), s.base, s.metal);
  let D = a * a / (PI * pow(nh * nh * (a * a - 1.0) + 1.0, 2.0));
  let k = (s.rough + 1.0) * (s.rough + 1.0) / 8.0;
  let G = nl / (nl * (1.0 - k) + k) * nv / (nv * (1.0 - k) + k);
  let F = F0 + (1.0 - F0) * pow(1.0 - max(dot(v, H), 0.0), 5.0);
  return (1.0 - F) * (1.0 - s.metal) * s.base / PI + D * G * F / max(4.0 * nl * nv, 1e-4);
}

// The ground where a ray lands on it: what the field shows there (or, off the screen, at the screen's nearest edge),
// which is its colour under the open sun, less the sun where something stands in its way.
fn ground(x: vec3f) -> vec3f {
  let n = normalize(x - u.ball.xyz);
  let z = max(dot(x, u.fwd.xyz), 1e-6);
  let s = vec2f(dot(x, u.right.xyz) / u.up.w, dot(x, u.up.xyz)) * u.right.w / z;
  let D = vec2f(textureDimensions(field));
  let c = textureLoad(field, vec2i(clamp(s * vec2f(0.5, -0.5) + 0.5, vec2f(0.02), vec2f(0.98)) * D), 0).rgb / u.sunc.w;
  let l = toSun();
  let E = sunlight() * max(dot(n, l), 0.0);
  let A = PI * open();
  if (u.sun.w <= 0.0 || dot(n, l) <= 0.0 || distance(x, u.roi.xyz) > u.roi.w || !dark(x + n * 1e-5, l)) { return c; }
  return c * A / (E + A);
}

// The light arriving along −d at o: a path followed off up to three surfaces, each adding its own glow and the sun's
// light on it (a ray toward the sun's disc says whether it sees it), going on diffusely off a dielectric and as a
// rough mirror off a metal. Roulette ends most paths early; one that lives to the last surface takes the sky's mean
// for whatever it would have found next.
fn radiance(o0: vec3f, d0: vec3f) -> vec3f {
  var o = o0;
  var d = d0;
  var thr = vec3f(1.0);
  var L = vec3f(0.0);
  for (var b = 0; b < 3; b++) {
    let h = hit(o, d, FAR, false);
    let tg = ball(o, d);
    if (h.i < 0 || (tg > 0.0 && tg < h.t)) {
      if (tg > 0.0) { L += thr * ground(o + d * tg); } else { L += thr * sky(d); }
      break;
    }
    let s = surf(h, o, d);
    let x = lift(s);
    var e = s.base * s.glow;
    let l = toSun();
    if (u.sun.w > 0.0 && dot(s.n, l) > 0.0 && dot(s.ng, l) > 0.0 && !dark(x, l)) { e += brdf(s, -d, l) * sunlight() * dot(s.n, l) * s.k; }
    L += thr * e;
    let p = clamp(max(s.base.r, max(s.base.g, s.base.b)), 0.1, 0.9);
    if (b == 2) { L += thr * s.base * s.k * mix(u.gnd.rgb, open(), 0.5 + 0.5 * dot(s.n, u.zen.xyz)) * 0.5; break; }
    if (rnd() > p) { break; }
    thr *= s.base * s.k / p;
    if (s.metal > 0.5) { d = glance(s.n, -d, s.rough); } else { d = cosine(s.n); }
    if (dot(d, s.ng) <= 0.0) { break; }
    o = x;
  }
  return min(L, vec3f(64.0)); // one glint must not outweigh a history
}

// ---- the image ----------------------------------------------------------------------------------------------
// The ray through traced texel p (its centre at p + 0.5), for this camera or the last.
fn ray(p: vec2f) -> vec3f {
  let s = vec2f((p.x / u.size.x * 2.0 - 1.0) * u.up.w, 1.0 - p.y / u.size.y * 2.0);
  return normalize(u.fwd.xyz * u.right.w + u.right.xyz * s.x + u.up.xyz * s.y);
}
fn pray(p: vec2f) -> vec3f {
  let s = vec2f((p.x / u.size.x * 2.0 - 1.0) * u.pup.w, 1.0 - p.y / u.size.y * 2.0);
  return normalize(u.pfwd.xyz * u.pright.w + u.pright.xyz * s.x + u.pup.xyz * s.y);
}
// A normal in a float: the octahedron's map, 12 bits a side.
fn pack(n: vec3f) -> f32 {
  var e = n.xy / (abs(n.x) + abs(n.y) + abs(n.z));
  if (n.z < 0.0) { e = (1.0 - abs(e.yx)) * select(vec2f(-1.0), vec2f(1.0), e >= vec2f(0.0)); }
  let q = round((e * 0.5 + 0.5) * 4095.0);
  return q.x * 4096.0 + q.y;
}
fn unpack(v: f32) -> vec3f {
  let x = floor(v / 4096.0);
  let f = vec2f(x, v - x * 4096.0) / 2047.5 - 1.0;
  var n = vec3f(f, 1.0 - abs(f.x) - abs(f.y));
  let t = max(-n.z, 0.0);
  n = vec3f(n.x + select(t, -t, n.x >= 0.0), n.y + select(t, -t, n.y >= 0.0), n.z);
  return normalize(n);
}

// What the point that was at `was` when last a frame was traced (from where the eye was then) had gathered: the texels
// round where it was on the screen, each only if it was this surface (the same thing, in the same plane). Where all
// sixteen are, they are weighed as Catmull and Rom's spline, which passes through its points, so a history carried
// across the screen a little every frame is not blurred a little every frame; else the nearest four, linearly.
// .xyz the light, .w the sun's share; and how many samples that is the mean of (0: there is none).
struct Old { v: vec4f, n: f32 }
fn history(was: vec3f, n: vec3f, key: f32) -> Old {
  let z = dot(was, u.pfwd.xyz);
  if (u.pfwd.w != 0.0 || z <= 0.0) { return Old(vec4f(0.0), 0.0); }
  let sc = vec2f(dot(was, u.pright.xyz) / u.pup.w, dot(was, u.pup.xyz)) * u.pright.w / z;
  let q = (sc * vec2f(0.5, -0.5) + 0.5) * u.size.xy - 0.5;
  let b = floor(q);
  let f = q - b;
  let wx = array<f32, 4>(((-0.5 * f.x + 1.0) * f.x - 0.5) * f.x, (1.5 * f.x - 2.5) * f.x * f.x + 1.0, ((-1.5 * f.x + 2.0) * f.x + 0.5) * f.x, (0.5 * f.x - 0.5) * f.x * f.x);
  let wy = array<f32, 4>(((-0.5 * f.y + 1.0) * f.y - 0.5) * f.y, (1.5 * f.y - 2.5) * f.y * f.y + 1.0, ((-1.5 * f.y + 2.0) * f.y + 0.5) * f.y, (0.5 * f.y - 0.5) * f.y * f.y);
  var cub = vec4f(0.0); // the spline's sum
  var lin = vec4f(0.0); // the nearest four's
  var ws = 0.0;
  var count = 0.0;
  var whole = true;
  for (var k = 0; k < 16; k++) {
    let e = vec2i(k & 3, k >> 2);
    let t = b + vec2f(e) - 1.0;
    let near = all(e >= vec2i(1)) && all(e <= vec2i(2));
    var ok = all(t >= vec2f(0.0)) && all(t < u.size.xy);
    if (ok && (whole || near)) {
      let g = textureLoad(pgeo, vec2i(t), 0);
      ok = floor(g.z) == key && g.w > 0.0 && dot(unpack(g.x), n) > 0.9 && abs(dot(n, pray(t + 0.5) * g.y - was)) < 0.004 * g.y;
      if (ok) {
        let c = textureLoad(pacc, vec2i(t), 0);
        cub += c * wx[e.x] * wy[e.y];
        if (near) {
          let w = (1.0 - abs(f32(e.x - 1) - f.x)) * (1.0 - abs(f32(e.y - 1) - f.y));
          lin += c * w;
          count += g.w * w;
          ws += w;
        }
      }
    }
    whole = whole && ok;
  }
  if (ws <= 1e-4) { return Old(vec4f(0.0), 0.0); }
  if (whole) { return Old(vec4f(max(cub.rgb, vec3f(0.0)), clamp(cub.a, 0.0, 1.0)), count / ws); }
  return Old(lin / ws, count / ws);
}

@compute @workgroup_size(8, 8) fn trace(@builtin(global_invocation_id) id: vec3u) {
  if (f32(id.x) >= u.size.x || f32(id.y) >= u.size.y) { return; }
  let px = vec2i(id.xy);
  // One texel of each four takes a sample this frame, each in its turn: a quarter of the rays. The rest keep what
  // they have, and no ray says what they show now: taking it for the surface they showed before, as far off as it was,
  // they fetch its history from where that was, so that under a slow camera the light stays on what it is the light of.
  if ((id.x & 1u) + 2u * (id.y & 1u) != u32(u.size.w)) {
    let g = textureLoad(pgeo, px, 0);
    let key = floor(g.z);
    let kind = key - 4.0 * floor(key / 4.0);
    var here = -1;
    for (var i = 0; i < i32(u.size.z) && kind < GROUND; i++) { if (inst[i].k.z == floor(key / 4.0)) { here = i; } }
    if (u.pfwd.w != 0.0 || kind == NONE || (kind < GROUND && here < 0)) {
      textureStore(acc, px, vec4f(0.0));
      textureStore(geo, px, vec4f(0.0, 0.0, NONE, 0.0));
      return;
    }
    let x = ray(vec2f(id.xy) + 0.5) * g.y;
    var was = x - u.ball.xyz + u.pball.xyz;
    if (here >= 0) {
      let m = inst[here];
      let q = vec4f(dot(m.w0, vec4f(x, 1.0)), dot(m.w1, vec4f(x, 1.0)), dot(m.w2, vec4f(x, 1.0)), 1.0);
      was = vec3f(dot(m.p0, q), dot(m.p1, q), dot(m.p2, q));
    }
    let o = history(was, unpack(g.x), key);
    textureStore(acc, px, select(textureLoad(pacc, px, 0), o.v, o.n > 0.0));
    textureStore(geo, px, vec4f(g.xyz, select(g.w, o.n, o.n > 0.0)));
    return;
  }
  seed = (id.x * 1973u + id.y * 9277u + u32(u.fwd.w) * 26699u) | 1u;
  seed = seed * 747796405u + 2891336453u;
  rnd();
  let rd = ray(vec2f(id.xy) + 0.5);
  let h = hit(vec3f(0.0), rd, FAR, false);
  let tg = ball(vec3f(0.0), rd);
  var kind = NONE;
  var who = 0.0;
  var x = vec3f(0.0);
  var was = vec3f(0.0); // where x was when last a frame was traced, from where the eye was then
  var s: Surf;
  if (h.i >= 0 && !(tg > 0.0 && tg < h.t)) {
    s = surf(h, vec3f(0.0), rd);
    let m = inst[h.i];
    x = s.x;
    who = m.k.z;
    kind = select(MATTE, METAL, s.metal > 0.5);
    let q = vec4f(dot(m.w0, vec4f(x, 1.0)), dot(m.w1, vec4f(x, 1.0)), dot(m.w2, vec4f(x, 1.0)), 1.0);
    was = vec3f(dot(m.p0, q), dot(m.p1, q), dot(m.p2, q));
  } else if (tg > 0.0) {
    kind = GROUND;
    x = rd * tg;
    s.n = normalize(x - u.ball.xyz);
    s.ng = s.n;
    was = x - u.ball.xyz + u.pball.xyz;
  }
  let n = s.n;
  let key = who * 4.0 + kind;
  let far = distance(x, u.roi.xyz) / u.roi.w; // from everything traced, in the reach of its shadows
  if (kind == NONE || (kind == GROUND && far > 1.0)) {
    // nothing, or ground too far from anything to be in its shadow, which is as the field drew it: nothing to do
    textureStore(acc, px, vec4f(0.0));
    textureStore(geo, px, vec4f(0.0, 0.0, NONE, 0.0));
    return;
  }

  let past = history(was, n, key);
  let old = past.v;
  var count = past.n;
  let rough = select(0.0, s.rough, kind != GROUND);

  var L = vec3f(0.0);
  var V = 1.0;
  let l = toSun();
  if (kind != GROUND) {
    let o = lift(s);
    V = select(0.0, 1.0, dot(s.ng, l) > 0.0);
    if (u.sun.w > 0.0 && dot(n, l) > 0.0 && V > 0.0 && dark(o, l)) { V = 0.0; }
    var d = cosine(n);
    if (kind == METAL) { d = glance(n, -rd, s.rough); }
    if (dot(d, s.ng) > 0.0) { L = radiance(o, d); }
  } else {
    // the ground: how its light here compares with its light were nothing standing on it, which is what the field
    // drew; near what stands on it, with the sky they hide and the light they throw back
    let o = x + n * 1e-5;
    let E = sunlight() * max(dot(n, l), 0.0);
    if (u.sun.w > 0.0 && dot(n, l) > 0.0 && dark(o, l)) { V = 0.0; }
    var A = open();
    if (far < 0.5) { A = radiance(o, cosine(n)); }
    L = mix((E * V + PI * A) / (E + PI * open()), vec3f(1.0), smoothstep(0.7, 1.0, far)); // a long shadow fades out before the reach ends
  }
  count = min(count + 1.0, DEPTH);
  textureStore(acc, px, mix(old, vec4f(L, V), 1.0 / count));
  textureStore(geo, px, vec4f(pack(n), length(x), key + 0.5 * rough, count));
}

// ---- the wavelet --------------------------------------------------------------------------------------------
// À trous: a 3 × 3 tent whose taps stand `step` apart, run at steps 1, 2, 4, and at 8 where the history is still
// short. A tap counts only if it is the same
// thing, in the same plane, facing the same way, and about as bright, so no light crosses an edge. The sun's share
// is smoothed on the first pass alone, and only among its like: a shadow's edge is the sun's disc, not the filter's.
@group(1) @binding(0) var<uniform> dn: vec4f; // step; how much of the ground's share the composite takes
@group(1) @binding(1) var src: texture_2d<f32>;
@group(1) @binding(2) var gin: texture_2d<f32>;
@group(1) @binding(3) var dst: texture_storage_2d<rgba16float, write>;

const Y = vec3f(0.2290, 0.6917, 0.0793);

@compute @workgroup_size(8, 8) fn smoothen(@builtin(global_invocation_id) id: vec3u) {
  if (f32(id.x) >= u.size.x || f32(id.y) >= u.size.y) { return; }
  let px = vec2i(id.xy);
  let g = textureLoad(gin, px, 0);
  let key = floor(g.z);
  let kind = key - 4.0 * floor(key / 4.0);
  if (kind == NONE) { textureStore(dst, px, vec4f(0.0)); return; }
  let c = textureLoad(src, px, 0);
  let rough = 2.0 * (g.z - key);
  let st = i32(dn.x);
  // a sharp mirror's image is not noise; nor, at the widest step, is a mean of many samples
  if ((kind == METAL && f32(st) > 1.0 + 12.0 * rough) || (st == 8 && g.w >= 10.0)) { textureStore(dst, px, c); return; }
  let n = unpack(g.x);
  let p = ray(vec2f(id.xy) + 0.5) * g.y;
  let lum = dot(c.rgb, Y);
  let tol = (0.35 + 6.0 / max(g.w, 1.0)) * (lum + 0.02); // surer of an edge the more samples say so
  var sum = c.rgb;
  var ws = 1.0;
  var v = c.a;
  var vs = 1.0;
  for (var k = 0; k < 9; k++) {
    let e = vec2i(k % 3, k / 3) - 1;
    let q = px + e * st;
    if (k == 4 || any(q < vec2i(0)) || any(vec2f(q) >= u.size.xy)) { continue; }
    let gq = textureLoad(gin, q, 0);
    if (floor(gq.z) != key || gq.w == 0.0) { continue; }
    let cq = textureLoad(src, q, 0);
    var w = select(0.5, 0.25, e.x != 0 && e.y != 0) * pow(max(dot(n, unpack(gq.x)), 0.0), 32.0);
    w *= exp(-abs(dot(n, ray(vec2f(q) + 0.5) * gq.y - p)) / (0.002 * g.y));
    let wl = w * exp(-abs(dot(cq.rgb, Y) - lum) / tol);
    sum += cq.rgb * wl;
    ws += wl;
    if (st == 1) {
      let wv = w * exp(-abs(cq.a - c.a) * (2.0 + 0.4 * g.w));
      v += cq.a * wv;
      vs += wv;
    }
  }
  textureStore(dst, px, vec4f(sum / ws, v / vs));
}

// What the raster's composite lays the field under (raster.wgsl): the ground's light against its light in the open,
// premultiplied by whether a texel is ground at all, so a linear tap never mixes in what stands on it.
@compute @workgroup_size(8, 8) fn shade(@builtin(global_invocation_id) id: vec3u) {
  if (f32(id.x) >= u.size.x || f32(id.y) >= u.size.y) { return; }
  let px = vec2i(id.xy);
  let g = textureLoad(gin, px, 0);
  let key = floor(g.z);
  if (key - 4.0 * floor(key / 4.0) != GROUND) { textureStore(dst, px, vec4f(0.0)); return; }
  let sure = clamp(g.w / 10.0, 0.0, 1.0) * dn.y;
  textureStore(dst, px, vec4f(mix(vec3f(1.0), textureLoad(src, px, 0).rgb, sure), 1.0));
}

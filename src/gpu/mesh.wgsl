// Solid things, lit (mesh.ts). Everything here is relative to the eye, which sits at the origin: the scene does its
// sums in doubles and hands over only what is near enough to see, so a 12 mm board and a planet share one frame.
// Depth is reversed (near / z), so float precision is spent close to the eye where the detail is.

struct Cam {
  right: vec4f, // .w = 1/tan(fov/2), the field camera's (camera.wgsl)
  up: vec4f,    // .w = aspect
  fwd: vec4f,   // .w = near
  jit: vec4f,   // .xy this frame's subpixel offset in clip units; .zw the phosphor's size, px
  sun: vec4f,   // toward the sun; .w its irradiance
  sunc: vec4f,  // its colour; .w exposure
  sky: vec4f,   // the sky overhead
  hor: vec4f,   // the sky at the horizon
  gnd: vec4f,   // the ground's bounce
  zen: vec4f,   // which way is up, here
  fog: vec4f,   // the air's colour; .w how thick, per unit
  sh0: vec4f,   // world → the sun's view: x, y in [−1, 1] across what casts shadow, z its depth in [0, 1]
  sh1: vec4f,
  sh2: vec4f,
  shk: vec4f,   // .x shadows on, .y a shadow texel in sun-view units
  tr: vec4f,    // the traced light (trace.ts): its size, px; .z how much of it to take (0: there is none)
}

struct Inst { r0: vec4f, r1: vec4f, r2: vec4f, k: vec4f, lamp: vec4f } // model → world rows; k: brightness, glow, how much of its light is traced, -; its lamps' light

@group(0) @binding(0) var<uniform> c: Cam;
@group(0) @binding(1) var<storage, read> inst: array<Inst>;
@group(1) @binding(0) var shadow: texture_depth_2d;
@group(1) @binding(1) var cmp: sampler_comparison;
@group(1) @binding(2) var dist: texture_2d<f32>; // the field's ray lengths (field.wgsl), at the raster's size
@group(1) @binding(3) var traced: texture_2d<f32>; // the path tracer's light (trace.wgsl): what arrives, and the sun's share
@group(1) @binding(4) var geo: texture_2d<f32>;    // and what each of its texels is the light of

struct V { @location(0) p: vec3f, @location(1) n: vec3f, @location(2) col: vec4f, @location(3) pbr: vec4f }
struct O {
  @builtin(position) pos: vec4f,
  @location(0) w: vec3f,
  @location(1) n: vec3f,
  @location(2) col: vec4f,
  @location(3) pbr: vec4f,
  @location(4) @interpolate(flat) k: vec4f,
  @location(5) @interpolate(flat) lamp: vec4f,
}

fn place(m: Inst, p: vec3f) -> vec3f { return vec3f(dot(m.r0, vec4f(p, 1.0)), dot(m.r1, vec4f(p, 1.0)), dot(m.r2, vec4f(p, 1.0))); }

// The pinhole: screen x across ±aspect, y across ±1, as the fields' rays leave it; the jitter lets the phosphor's
// own persistence average a few frames' offsets into antialiasing for nothing.
fn project(w: vec3f) -> vec4f {
  let z = dot(w, c.fwd.xyz);
  return vec4f(dot(w, c.right.xyz) * c.right.w / c.up.w + c.jit.x * z, dot(w, c.up.xyz) * c.right.w + c.jit.y * z, c.fwd.w, z);
}

@vertex fn vs(v: V, @builtin(instance_index) i: u32) -> O {
  let m = inst[i];
  let w = place(m, v.p);
  let n = vec3f(dot(m.r0.xyz, v.n), dot(m.r1.xyz, v.n), dot(m.r2.xyz, v.n));
  return O(project(w), w, n, v.col, v.pbr, m.k, m.lamp);
}

@vertex fn shadowVS(v: V, @builtin(instance_index) i: u32) -> @builtin(position) vec4f {
  let w = place(inst[i], v.p);
  return vec4f(dot(c.sh0, vec4f(w, 1.0)), dot(c.sh1, vec4f(w, 1.0)), dot(c.sh2, vec4f(w, 1.0)), 1.0);
}

// The field's depth, laid down first so the meshes pass behind whatever the field has nearer: its ray length
// to the plane the camera looks along, then reversed as the meshes' is.
struct Q { @builtin(position) pos: vec4f }
@vertex fn fullVS(@builtin(vertex_index) i: u32) -> Q {
  return Q(vec4f(f32((i << 1u) & 2u) * 2.0 - 1.0, f32(i & 2u) * 2.0 - 1.0, 0.0, 1.0));
}
@fragment fn primeFS(q: Q) -> @builtin(frag_depth) f32 {
  let D = vec2f(textureDimensions(dist));
  let t = textureLoad(dist, vec2i(min(q.pos.xy * D / c.jit.zw, D - 1.0)), 0).r;
  let s = vec2f((q.pos.x / c.jit.z * 2.0 - 1.0) * c.up.w, 1.0 - q.pos.y / c.jit.w * 2.0);
  let rd = normalize(c.fwd.xyz * c.right.w + c.right.xyz * s.x + c.up.xyz * s.y);
  return clamp(c.fwd.w / max(t * dot(rd, c.fwd.xyz), 1e-30), 0.0, 1.0);
}

const PI = 3.14159265;

// The sky as a mirror sees it: the ground below the horizon, the horizon's band, the zenith over it. A rough
// surface sees a wide patch of it, which is near enough to its mean.
fn env(d: vec3f, rough: f32) -> vec3f {
  let y = dot(d, c.zen.xyz);
  let s = mix(c.hor.rgb, c.sky.rgb, sqrt(clamp(y, 0.0, 1.0)));
  let e = mix(c.gnd.rgb, s, smoothstep(-0.08, 0.08, y));
  let mean = 0.5 * (c.sky.rgb + c.hor.rgb) * 0.6 + c.gnd.rgb * 0.4;
  return mix(e, mean, rough * rough);
}

// How much of the sun reaches w: a 4 × 4 percentage-closer kernel over the sun's depth map.
fn lit(w: vec3f, n: vec3f) -> f32 {
  if (c.shk.x == 0.0) { return 1.0; }
  let b = w + n * c.shk.y * 1.5; // off the surface by a texel, so it does not shadow itself
  let s = vec3f(dot(c.sh0, vec4f(b, 1.0)), dot(c.sh1, vec4f(b, 1.0)), dot(c.sh2, vec4f(b, 1.0)));
  let uv = vec2f(s.x, -s.y) * 0.5 + 0.5;
  if (any(uv < vec2f(0.0)) || any(uv > vec2f(1.0)) || s.z > 1.0) { return 1.0; }
  let px = 1.0 / vec2f(textureDimensions(shadow));
  var a = 0.0;
  for (var i = 0; i < 16; i++) {
    let o = vec2f(f32(i & 3), f32(i >> 2)) - 1.5;
    a += textureSampleCompareLevel(shadow, cmp, uv + o * px, s.z - 0.0015);
  }
  return a / 16.0;
}

// The path tracer's light at this fragment. It is traced a quarter as fine as this (tr.z: at all), so of the four texels round the
// fragment each counts only as far as it is the same surface (in the fragment's plane, facing its way), and the light
// arriving only from a texel of the fragment's kind (a metal's is what it mirrors, anything else's what it faces).
// .l the light, .v how much of the sun's disc is seen, .cl and .cv how far to trust each: nothing while the history
// is short or no texel is this surface, and then the rasteriser's own guesses stand.
struct Lit { l: vec3f, v: f32, cl: f32, cv: f32 }
fn unpack(v: f32) -> vec3f {
  let x = floor(v / 4096.0);
  let f = vec2f(x, v - x * 4096.0) / 2047.5 - 1.0;
  var n = vec3f(f, 1.0 - abs(f.x) - abs(f.y));
  let t = max(-n.z, 0.0);
  n = vec3f(n.x + select(t, -t, n.x >= 0.0), n.y + select(t, -t, n.y >= 0.0), n.z);
  return normalize(n);
}
fn light(pos: vec2f, w: vec3f, N: vec3f, metal: f32, fade: f32) -> Lit {
  if (c.tr.z * fade <= 0.0) { return Lit(vec3f(0.0), 1.0, 0.0, 0.0); }
  let q = pos / c.jit.zw * c.tr.xy - 0.5;
  let b = floor(q);
  let f = q - b;
  let mine = select(0.0, 1.0, metal > 0.5);
  var l = vec4f(0.0);
  var v = vec2f(0.0);
  var n = vec2f(0.0);
  for (var i = 0; i < 4; i++) {
    let e = vec2f(f32(i & 1), f32(i >> 1));
    let t = clamp(b + e, vec2f(0.0), c.tr.xy - 1.0);
    let g = textureLoad(geo, vec2i(t), 0);
    let key = floor(g.z);
    let kind = key - 4.0 * floor(key / 4.0);
    if (kind > 1.5) { continue; } // the ground, or nothing
    let s = vec2f(((t.x + 0.5) / c.tr.x * 2.0 - 1.0) * c.up.w, 1.0 - (t.y + 0.5) / c.tr.y * 2.0);
    let p = normalize(c.fwd.xyz * c.right.w + c.right.xyz * s.x + c.up.xyz * s.y) * g.y;
    let k = ((1.0 - abs(e.x - f.x)) * (1.0 - abs(e.y - f.y)) + 0.02) * pow(max(dot(N, unpack(g.x)), 0.0), 16.0) * exp(-abs(dot(N, p - w)) / (0.003 * g.y));
    let a = textureLoad(traced, vec2i(t), 0);
    v += vec2f(a.a, 1.0) * k;
    n.y += g.w * k;
    if (kind == mine) { l += vec4f(a.rgb, 1.0) * k; n.x += g.w * k; }
  }
  let sure = vec2f(clamp(3.0 * l.a, 0.0, 1.0) * clamp(n.x / max(l.a, 1e-6) / 10.0, 0.0, 1.0), clamp(3.0 * v.y, 0.0, 1.0) * clamp(n.y / max(v.y, 1e-6) / 10.0, 0.0, 1.0)) * fade;
  return Lit(l.rgb / max(l.a, 1e-6), v.x / max(v.y, 1e-6), sure.x, sure.y);
}

// Cook–Torrance: GGX's microfacets, Smith's shadowing, Schlick's Fresnel; Lambert under it for what is not metal.
fn shade(i: O) -> vec4f {
  let V = normalize(-i.w);
  var N = normalize(i.n);
  if (dot(N, V) < 0.0) { N = -N; } // CAD is not always wound one way: both faces are surfaces
  let base = i.col.rgb * i.col.rgb; // stored as its square root, so eight bits are spent where the eye looks
  let metal = i.pbr.x;
  let rough = max(i.pbr.y, 0.045);
  let a = rough * rough;
  let F0 = mix(vec3f(0.04), base, metal);
  let L = c.sun.xyz;
  let H = normalize(L + V);
  let nl = max(dot(N, L), 0.0);
  let nv = max(dot(N, V), 1e-4);
  let nh = max(dot(N, H), 0.0);
  let vh = max(dot(V, H), 0.0);
  let D = a * a / (PI * pow(nh * nh * (a * a - 1.0) + 1.0, 2.0));
  let k = (rough + 1.0) * (rough + 1.0) / 8.0;
  let G = nl / (nl * (1.0 - k) + k) * nv / (nv * (1.0 - k) + k);
  let F = F0 + (1.0 - F0) * pow(1.0 - vh, 5.0);
  let spec = D * G * F / max(4.0 * nl * nv, 1e-4);
  let diff = (1.0 - F) * (1.0 - metal) * base / PI;
  let t = light(i.pos.xy, i.w, N, metal, i.k.z);
  var seen = t.v; // of the sun: traced, or while that is unsure, the sun's map
  if (t.cv < 0.99) { seen = mix(lit(i.w, N), t.v, t.cv); }
  let sun = (diff + spec) * c.sunc.rgb * c.sun.w * nl * seen;
  let Fa = F0 + (max(vec3f(1.0 - rough), F0) - F0) * pow(1.0 - nv, 5.0); // Fresnel, for the whole sky
  let up = dot(N, c.zen.xyz) * 0.5 + 0.5;
  // What arrives from everywhere else. Untraced: the sky's mean over the half it faces, and the sky a mirror would
  // show. Traced: for a metal, what it does mirror; for the rest, what it does face, and of the sky's sheen on it as
  // much as of the sky it still sees.
  let open = mix(c.gnd.rgb, 0.5 * (c.sky.rgb + c.hor.rgb), up);
  var all = open;
  var glint = env(reflect(-V, N), rough);
  if (metal > 0.5) { glint = mix(glint, t.l, t.cl); }
  else {
    all = mix(open, t.l, t.cl);
    glint *= mix(1.0, clamp(dot(t.l, vec3f(1.0)) / max(dot(open, vec3f(1.0)), 1e-6), 0.0, 1.0), t.cl);
  }
  let sky = base * (1.0 - metal) * all + glint * Fa;
  var col = (sun + sky) * i.k.x + base * i.k.y + i.lamp.rgb * i.pbr.z; // and what is a lamp, lit
  let T = exp(-c.fog.w * length(i.w)); // the air between
  col = col * T + c.fog.rgb * (1.0 - T);
  return vec4f(col * c.sunc.w, i.col.a);
}

// and how far along its ray it is, for the lens's depth of field (raster.wgsl)
struct S { @location(0) c: vec4f, @location(1) d: f32 }
@fragment fn solidFS(i: O) -> S { return S(vec4f(shade(i).rgb, 1.0), length(i.w)); }
@fragment fn clearFS(i: O) -> @location(0) vec4f {
  let s = shade(i);
  return vec4f(s.rgb * s.a, s.a);
}

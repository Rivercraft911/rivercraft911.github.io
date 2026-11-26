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
}

struct Inst { r0: vec4f, r1: vec4f, r2: vec4f, k: vec4f } // model → world rows; k: brightness, glow, -, -

@group(0) @binding(0) var<uniform> c: Cam;
@group(0) @binding(1) var<storage, read> inst: array<Inst>;
@group(1) @binding(0) var shadow: texture_depth_2d;
@group(1) @binding(1) var cmp: sampler_comparison;
@group(1) @binding(2) var dist: texture_2d<f32>; // the field's ray lengths (field.wgsl), at the raster's size

struct V { @location(0) p: vec3f, @location(1) n: vec3f, @location(2) col: vec4f, @location(3) pbr: vec4f }
struct O {
  @builtin(position) pos: vec4f,
  @location(0) w: vec3f,
  @location(1) n: vec3f,
  @location(2) col: vec4f,
  @location(3) pbr: vec4f,
  @location(4) @interpolate(flat) k: vec4f,
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
  return O(project(w), w, n, v.col, v.pbr, m.k);
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
  let sun = (diff + spec) * c.sunc.rgb * c.sun.w * nl * lit(i.w, N);
  let Fa = F0 + (max(vec3f(1.0 - rough), F0) - F0) * pow(1.0 - nv, 5.0); // Fresnel, for the whole sky
  let up = dot(N, c.zen.xyz) * 0.5 + 0.5;
  let sky = base * (1.0 - metal) * mix(c.gnd.rgb, 0.5 * (c.sky.rgb + c.hor.rgb), up) + env(reflect(-V, N), rough) * Fa;
  var col = (sun + sky) * i.k.x + base * i.k.y;
  let T = exp(-c.fog.w * length(i.w)); // the air between
  col = col * T + c.fog.rgb * (1.0 - T);
  return vec4f(col * c.sunc.w, i.col.a);
}

@fragment fn solidFS(i: O) -> @location(0) vec4f { return vec4f(shade(i).rgb, 1.0); }
@fragment fn clearFS(i: O) -> @location(0) vec4f {
  let s = shade(i);
  return vec4f(s.rgb * s.a, s.a);
}

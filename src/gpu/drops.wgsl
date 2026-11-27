// The droplets. The river goes over the rim of a shaft all the way round and falls as a curtain of drops,
// each one born at the rim at an angle that is a frequency (80 Hz to 8 kHz of log-frequency round half the
// rim, mirrored on the other half) and carrying, for life, the soundtrack's spectrum at the moment it went
// over. It falls ballistically, z = H − ½gτ², the sheet thinning into ligaments and the ligaments into beads
// (Rayleigh–Plateau); lands on a ring of radius R; and is drawn in by a Burgers vortex, r = R e^(−∫β dt),
// turned Φ(r) as the water there has turned, riding the free surface down the funnel. A droplet is a pure
// function of its number and the time, like every scene: nothing is remembered, so the clock may jump.
// Each is deposited as the beam deposits a stroke, its light swept from where it was on the screen a frame
// ago to where it is now, as the lens moved but not as it turned: riding down with the water the drops hang
// still, and a pan does not smear them. Each is lit by the moon where its light gets down past the rim
// (wrap.wgsl lit), glinting as it wobbles; the band it went over in is the water's weight, and at the moonbow's
// angle a drop sends back the colour of its own band.
//
// p[0..3] the camera (reality.ts aim)        p[4] R, the rim's radius, its height, the fall's seconds
// p[5] T, the shutter in frames, -, brightness
// p[6] head row (ring), rows an e-fold in, rows the falls take, reference offset
// p[7] the funnel's depth H, r_c², winding K, the drain's radius
// p[8] -, -, 80 Hz's angle, a droplet's mean seconds in the pool
// p[9] the sheet's area a droplet stands for, least spot radius (px) and most (thousandths of the screen's height), how near the lens it fades
// p[10] spray, the pool's flecks, rows printed, -     p[11] toward the moon, its light
// p[12..27] rows the water has run in over the last s seconds

struct U {
  res: vec2f,  // the phosphor's size, px
  aspect: f32,
  gain: f32,   // light a frame into the phosphor
  n: f32,      // droplets in play
  dT: f32,     // the clock's step since the last frame
  x1: f32,
  x2: f32,
  p: array<vec4f, 28>,
  was: array<vec4f, 4>, // the camera a frame ago
}
struct Splat { a: vec2f, b: vec2f, c: vec3f, s: f32 } // from, to (px), light, spot radius (px)

@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var smp: sampler;
@group(0) @binding(2) var data: texture_2d<f32>; // the spectrum's rows, 256 lanes each: every lane's loudest bin
@group(0) @binding(3) var<storage, read_write> splats: array<Splat>;
@group(1) @binding(0) var<storage, read> drawn: array<Splat>;

const TAU = 6.2831853;
const ROWS = 4096.0;
const SMAX = 15.0; // the longest a droplet lives in the pool, s: the table's span
const LIGAMENTS = 420.0; // round the rim: a sheet's fastest-growing ripple is about nine of its thicknesses

fn pcg(v: u32) -> u32 {
  let s = v * 747796405u + 2891336453u;
  let w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}
fn unit(h: u32) -> f32 { return f32(h >> 8u) / 16777216.0; }
fn vnoise(x: vec2f) -> f32 { // smooth noise, 0..1
  let i = vec2u(vec2i(floor(x)) + 4096);
  let f = fract(x);
  let w = f * f * (3.0 - 2.0 * f);
  let a = unit(pcg(i.x + 7919u * i.y));
  let b = unit(pcg(i.x + 1u + 7919u * i.y));
  let c = unit(pcg(i.x + 7919u * (i.y + 1u)));
  let d = unit(pcg(i.x + 1u + 7919u * (i.y + 1u)));
  return mix(mix(a, b, w.x), mix(c, d, w.x), w.y);
}
fn tab(i: u32) -> f32 { return u.p[12u + i / 4u][i % 4u]; }
fn flowed(s: f32) -> f32 {
  let x = clamp(s / SMAX, 0.0, 1.0) * 63.0;
  let i = u32(min(x, 62.0));
  return mix(tab(i), tab(i + 1u), x - f32(i));
}
fn at(b: f32, row: f32) -> f32 { return textureSampleLevel(data, smp, vec2f((b * 255.0 + 0.5) / 256.0, row), 0.0).r; }
// A display's contrast: the loudest just under full, 10 dB under it a third of that, 20 dB a tenth.
fn hot(lv: f32) -> f32 { return pow(min(lv / 0.8, 1.25), 4.0); }

// Frequency as colour, the way a prism lays the band out (wrap.wgsl has the same): 80 Hz red, through gold and
// green, to 8 kHz violet. Linear light.
fn hue(b: f32) -> vec3f {
  var c = array(vec3f(1.0, 0.08, 0.04), vec3f(1.0, 0.35, 0.05), vec3f(1.0, 0.75, 0.15), vec3f(0.3, 1.0, 0.35),
                vec3f(0.1, 0.75, 1.0), vec3f(0.2, 0.3, 1.0), vec3f(0.55, 0.2, 1.0));
  let x = clamp(b, 0.0, 1.0) * 6.0;
  let i = min(u32(x), 5u);
  return mix(c[i], c[i + 1u], x - f32(i));
}

// Whether the moon reaches P: under the rim, only if the way up toward it comes out through the mouth.
fn lit(P: vec3f) -> f32 {
  let L = u.p[11].xyz;
  let Q = P.xy + L.xy * (u.p[4].z - P.z) / L.z;
  return select(smoothstep(u.p[4].y + 0.03, u.p[4].y - 0.03, length(Q)), 1.0, P.z >= u.p[4].z);
}

struct Drop { p: vec3f, rows: f32, b: f32, x: f32, k: f32, born: f32, w: f32 } // where; rows behind the head; lane; e-folds in (< 0 falling); weight; cycle; the water's streaks

fn drop(id: u32, T: f32) -> Drop {
  let R = u.p[4].x;
  let RIM = u.p[4].y;
  let HF = u.p[4].z;
  let FALL = u.p[4].w;
  let h0 = pcg(id);
  let h1 = pcg(h0);
  let h2 = pcg(h1);
  let h3 = pcg(h2);
  // round the rim and through its life evenly (a Weyl lattice, jittered), so the sheet has no holes
  var a01 = fract(f32((id * 3242174889u) >> 8u) / 16777216.0 + 0.6 * (unit(h0) - 0.5) / sqrt(u.n));
  let ph = f32((id * 2447445414u) >> 8u) / 16777216.0;
  let b0 = 2.0 * a01;
  var o: Drop;
  o.b = select(b0, 2.0 - b0, b0 > 1.0);
  let g = 2.0 * HF / (FALL * FALL);

  if (unit(h3) < u.p[10].x) {
    // spray: thrown up from where the falls land, on its own parabola, and gone when it comes down
    let vz = sqrt(g * HF) * (0.12 + 0.5 * unit(h1) * unit(h1));
    let P = 2.0 * vz / g;
    let c = T / P - ph;
    let age = fract(c) * P;
    let vr = 0.35 * (unit(h2) - 0.62);
    let th = u.p[8].z + a01 * TAU + 0.5 * (unit(h0) - 0.5) * age;
    let r = R + 0.08 * (unit(pcg(h3)) - 0.5) + vr * age;
    o.p = vec3f(r * sin(th), r * cos(th), max(vz * age - 0.5 * g * age * age, 0.0) - u.p[7].x * u.p[7].y / (r * r + u.p[7].y));
    o.rows = u.p[6].z + flowed(age);
    o.x = -2.0;
    o.k = 1.0 - age / P;
    o.born = floor(c);
    return o;
  }

  let life = -u.p[8].w * log(1.0 - unit(h1) * (1.0 - exp(-(SMAX - 0.5) / u.p[8].w)));
  let P = FALL + life;
  let c = T / P - ph;
  let age = fract(c) * P;
  o.born = floor(c);
  // the sheet gathers into ligaments, and each ligament into beads that fall together
  let f0 = min(age / FALL, 1.0);
  let l = a01 * LIGAMENTS;
  a01 -= 0.6 * smoothstep(0.08, 0.6, f0) * sin(TAU * (l + 0.3 * sin(0.37 * l) + 0.2 * sin(1.7 * l))) / (TAU * LIGAMENTS);
  let lig = floor(l + 0.5);
  let tb = (o.born + ph) * P; // when it went over
  let hz = 5.0 + 6.0 * unit(pcg(u32(lig) + 77u)); // each ligament beads at its own pace
  let bead = 0.6 * smoothstep(0.3, 0.9, f0) * sin(TAU * (hz * tb + unit(pcg(u32(lig))))) / (TAU * hz);
  let scatter = (unit(h2) - 0.5) * 0.16;
  let th = u.p[8].z + a01 * TAU;
  if (age < FALL) {
    let f = clamp((age - bead) / FALL, 0.0, 1.0);
    let r = RIM - (RIM - R) * f + scatter * f * f;
    o.p = vec3f(r * sin(th), r * cos(th), HF * (1.0 - f * f) + 0.012 * (unit(h0) - 0.5));
    o.rows = u.p[6].z * f0;
    o.x = f0 - 1.0;
    o.k = 1.0;
    // streaks that fall with it; and over the rim it is glass, whitening as it breaks up
    let st = vnoise(vec2f(0.3 * l, 2.5 * tb)) * vnoise(vec2f(0.045 * l + 9.0, 0.8 * tb));
    o.w = (0.25 + 5.0 * st * st) * smoothstep(0.3, 0.8, f0); // drops only where the sheet has broken into them
    return o;
  }
  let X = flowed(age - FALL) / u.p[6].y;
  let r = (R + scatter) * exp(-X);
  let k = u.p[7].y;
  let turn = th + 0.5 * u.p[7].z * log((1.0 + k / (r * r)) / (1.0 + k / (R * R)));
  o.p = vec3f(r * sin(turn), r * cos(turn), -u.p[7].x * k / (r * r + k) + 0.004);
  o.rows = u.p[6].z + X * u.p[6].y;
  o.x = X;
  o.k = smoothstep(0.6 * u.p[7].w, 1.2 * u.p[7].w + 1e-4, r); // gone over the drain's edge
  return o;
}

fn project(P: vec3f, e: vec4f, r: vec3f, up: vec3f, f: vec3f) -> vec3f { // px, and depth
  let d = P - e.xyz;
  let z = dot(d, f);
  let q = vec2f(dot(d, r), dot(d, up)) * e.w / max(z, 1e-4);
  return vec3f((q.x / u.aspect * 0.5 + 0.5) * u.res.x, (0.5 - 0.5 * q.y) * u.res.y, z);
}

@compute @workgroup_size(256) fn advect(@builtin(global_invocation_id) gid: vec3u) {
  let id = gid.x;
  if (id >= u32(u.n)) { return; }
  var o: Splat;
  o.s = 0.0;
  let T = u.p[5].x;
  let d = drop(id, T);
  let a = project(d.p, u.p[0], u.p[1].xyz, u.p[2].xyz, u.p[3].xyz);
  let near = u.p[9].w;
  let m = 60.0; // a margin round the screen, px
  // from over the rim the shaft is seen only through its mouth: the land hides the rest
  let e = u.p[0].xyz;
  let over = e.z > u.p[4].z && length(mix(e.xy, d.p.xy, (e.z - u.p[4].z) / max(e.z - d.p.z, 1e-4))) > u.p[4].y;
  // and down in the funnel the water itself hides what is past its brow
  var under = false;
  if (d.x >= 0.0) {
    for (var i = 1; i < 7; i++) {
      let Q = mix(e, d.p, f32(i) / 7.0);
      under = under || Q.z < -u.p[7].x * u.p[7].y / (dot(Q.xy, Q.xy) + u.p[7].y) - 0.004;
    }
  }
  // a drop that would land no light still costs its fill: the sheet's drops before it breaks up, and the pool's
  // tracers but where the water carries foam
  let dark = (d.x < 0.0 && d.x >= -1.5 && d.w <= 0.0) || (d.x >= 0.0 && unit(pcg(id * 5u + 1u)) > 0.25);
  if (dark || over || under || d.k <= 0.0 || a.z < near * 0.5 || any(a.xy < vec2f(-m)) || any(a.xy > u.res + m)) { splats[id] = o; return; }
  let was = drop(id, T - u.dT);
  var b = project(was.p, vec4f(u.was[0].xyz, u.p[0].w), u.p[1].xyz, u.p[2].xyz, u.p[3].xyz); // from where the lens was, the way it looks now
  if (was.born != d.born || (was.x < 0.0) != (d.x < 0.0) || b.z < near * 0.5) { b = a; }
  let v = (b.xy - a.xy) * 1.6 * u.p[5].y; // water is seen through a long shutter: silk
  let len = length(v);
  b = vec3f(a.xy + v * min(1.0, 0.02 * u.res.y / max(len, 1e-3)), b.z);

  // the spectrum it carries: the band it went over in is its water's weight
  let lv = clamp(at(d.b, (u.p[6].x - d.rows + 0.5) / ROWS) - u.p[6].w, 0.0, 1.0) * smoothstep(0.0, 60.0, u.p[10].z - d.rows); // older than the rows hold: clear water
  let loud = hot(lv);

  // moonlight, where it gets down to it: each drop a lens sending the moon back from a point of it, brighter some
  // moments than others as it wobbles; and at the bow's angle from the antisolar point, the colour of its band
  let L = u.p[11].xyz;
  let moon = vec3f(0.62, 0.8, 1.0) * u.p[11].w * lit(d.p);
  let air = vec3f(0.0008, 0.0016, 0.0032);
  let spark = 0.3 + 2.2 * pow(unit(pcg(id * 13u + u32(T * 20.0 + 9.0 * unit(pcg(id + 5u))))), 8.0);
  let psi = degrees(acos(clamp(dot(normalize(d.p - e), -L), -1.0, 1.0)));
  let bb = (42.4 - psi) / 1.8;
  let bow = hue(bb) * smoothstep(-0.3, 0.1, bb) * smoothstep(1.3, 0.9, bb) * (0.3 + 1.6 * hot(clamp(at(clamp(bb, 0.0, 1.0), (u.p[6].x - u.p[6].z + 0.5) / ROWS) - u.p[6].w, 0.0, 1.0)));
  var c = (moon * (0.1 * spark + 0.4 * bow) + air * 3.0) * (0.45 + 0.9 * loud) * d.w;
  var area = u.p[9].x / u.n;
  if (d.x >= 0.0) {
    // in the pool, flecks of foam riding the surface in, drawn together as r²
    c = (moon * (0.008 + 0.2 * loud) + air) * u.p[10].y; // a quarter of them, so four times the light
    area *= exp(-1.1 * d.x);
  } else if (d.x < -1.5) {
    // spray, thrown up where it lands
    c = (moon * (0.5 * spark + 1.2 * bow) + air * 2.0) * (0.3 + 0.9 * loud) * d.k;
    area *= 0.6;
  }
  let fpx = u.p[0].w * 0.5 * u.res.y / a.z;
  let apx = area * fpx * fpx;
  let thin = sqrt(1048576.0 / u.n); // fewer drops (a lower tier) are each larger and brighter, so the sheet holds
  let most = max(u.p[9].z * 1e-3 * u.res.y * sqrt(thin), u.p[9].y);
  o.s = clamp(0.5 * sqrt(apx), u.p[9].y, most);
  o.a = b.xy;
  o.b = a.xy;
  o.c = c * (min(apx, 14.0 * most * most * sqrt(thin)) * d.k * smoothstep(near * 0.5, near, a.z) * u.gain * u.p[5].w);
  splats[id] = o;
}

struct V {
  @builtin(position) pos: vec4f,
  @location(0) q: vec2f, // px along the stroke from its start, px across it
  @location(1) @interpolate(flat) len: f32,
  @location(2) @interpolate(flat) c: vec3f,
  @location(3) @interpolate(flat) r: f32,
}

// A stroke from a to b, its light spread over a bump of radius r = 2σ round it: (1 − d²/r²)², which like the
// beam's Gaussian has no edge, and unlike it ends, so a million of them cost a third of the fill.
@vertex fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) i: u32) -> V {
  let d = drawn[i];
  var o: V;
  if (d.s <= 0.0) { o.pos = vec4f(2.0, 2.0, 0.0, 1.0); return o; }
  let v = d.b - d.a;
  let len = length(v);
  let dir = select(vec2f(1.0, 0.0), v / len, len > 1e-3);
  let r = 2.0 * d.s;
  o.q = vec2f(select(-r, len + r, (vi & 1u) == 1u), select(-r, r, vi > 1u));
  let w = d.a + dir * o.q.x + vec2f(-dir.y, dir.x) * o.q.y;
  o.pos = vec4f(w.x / u.res.x * 2.0 - 1.0, 1.0 - w.y / u.res.y * 2.0, 0.0, 1.0);
  o.len = len;
  o.c = d.c / (r * (1.0471976 * r + 1.0666667 * len)); // the bump's integral: πr²/3 round the ends, 16r/15 a px along
  o.r = r;
  return o;
}

@fragment fn fs(i: V) -> @location(0) vec4f {
  let d = vec2f(i.q.x - clamp(i.q.x, 0.0, i.len), i.q.y);
  let w = max(1.0 - dot(d, d) / (i.r * i.r), 0.0);
  return vec4f(i.c * (w * w), 0.0);
}

// The singularity · A Schwarzschild black hole (G = c = M = 1: the horizon at r = 2, the photon sphere at
// r = 3) with every world of the fall around it. Every ray is a null geodesic, traced back from the eye in
// flat coordinates, where its orbit obeys x″ = −(3/2) h² x / r⁵, h = |x × x′| its angular momentum: Binet's
// u″ + u = 3u², exactly. A ray that falls inside r = 2 never comes back; that is the shadow, √27 across. A
// ray that grazes r = 3 winds round and comes back as the photon ring, where the images of everything pile
// up, each turn e^−π thinner than the last.
//
// The worlds orbit it as twelve rings, each in its own plane (an orbit here keeps its plane), each the
// raster's own last frame of that world (raster.ts keeps them) round its rim twelve times, mirrored so it
// closes. Each turns at Kepler's Ω = r^−3/2, and its light is shifted by g = √(1 − 3/r) / (1 − Ω b), b the
// photon's angular momentum about the ring's axis: I_ν/ν³ is conserved along a ray, so the side coming
// toward us is brighter, as g³, and bluer, red, green and blue going as g², g³, g⁴. The sky is the twelve
// worlds again, one in each face of a dodecahedron, seen gnomonically from its centre, edged in gold, with
// stars. Every shot is read at the mip that a pixel's footprint covers: on a ring, the cone of the ray
// times the length it has run; on the sky, how fast the escaping direction turns across the screen, which
// is the lens's own magnification.
//
// The horizon: inside the shadow the whole picture repeats, shrunk by K and turned by ψ, and inside that
// one's shadow again, without end: z ↦ (K e^{iψ})ⁿ z, n the levels down, each in a moat of the shadow's
// black. The zoom runs through it, so that one level later the picture is itself again.
//
// p[0..3] camera   p[4] time, collapse, gain, horizon   p[5] zoom, ln K, ψ, shadow   p[6..8] ring radii
// p[9..11] ring light   p[12] sky, edges

fn hash3(p: vec3f) -> f32 { return fract(sin(dot(p, vec3f(127.1, 311.7, 74.7))) * 43758.5453); }

// World i's shot, at uv across it and mip lod. Each world is brought to one level, by its mean light
// from its smallest mip, 8 × 5, so that no one world drowns the rest and each keeps its own contrast.
fn world(i: i32, uv: vec2f, lod: f32) -> vec3f {
  let l = clamp(lod, 0.0, 5.0);
  let e = exp2(l) * vec2f(0.5 / 512.0, 0.5 / 320.0);
  let at = vec2f(f32(i % 4), f32(i / 4));
  let mean = textureSampleLevel(data, smp, (at + 0.5) / vec2f(4.0, 3.0), 6.0).rgb;
  let c = textureSampleLevel(data, smp, (at + clamp(uv, e, 1.0 - e)) / vec2f(4.0, 3.0), l).rgb;
  return c * 0.35 / (0.03 + dot(mean, vec3f(0.3, 0.6, 0.1)));
}

// Ring i's axis: tipped from the pole by up to 80°, the nodes a golden angle apart. The axes are kept
// as columns, so one point's side of all twelve planes is three dot products of vec4s.
fn axis(i: i32) -> vec3f {
  let th = 0.15 + 1.25 * fract(f32(i) * 0.618034);
  let ph = f32(i) * 2.399963;
  return vec3f(sin(th) * cos(ph), cos(th), sin(th) * sin(ph));
}
var<private> NX: array<vec4f, 3>;
var<private> NY: array<vec4f, 3>;
var<private> NZ: array<vec4f, 3>;
fn sides(x: vec3f) -> array<vec4f, 3> {
  return array<vec4f, 3>(x.x * NX[0] + x.y * NY[0] + x.z * NZ[0], x.x * NX[1] + x.y * NY[1] + x.z * NZ[1], x.x * NX[2] + x.y * NY[2] + x.z * NZ[2]);
}

// The light and opacity where a photon going k, after running len, crosses ring i's plane at P. The ring is
// 0.16 r wide, a shot's height; a copy of the shot runs 2πr/12 round it.
fn ring(i: i32, P: vec3f, k: vec3f, len: f32) -> vec4f {
  let R = u.p[6 + i / 4][i % 4];
  let A = u.p[9 + i / 4][i % 4];
  let r = length(P);
  let e = (r - R) / (0.08 * R);
  if (A <= 0.0 || abs(e) >= 1.0) { return vec4f(0.0); }
  let n = axis(i);
  let e1 = normalize(cross(n, vec3f(0.36, 0.48, 0.8)));
  let om = pow(r, -1.5);
  let m = (atan2(dot(P, cross(n, e1)), dot(P, e1)) - om * u.p[4].x) * 1.9098593;
  let h = fract(0.5 * m) * 2.0;
  let g = sqrt(max(1.0 - 3.0 / r, 0.0)) / (1.0 - om * dot(cross(P, k), n));
  let s = smoothstep(1.0, 0.8, abs(e));
  // a texel is about 0.0007 r on the ring; a slanting ray's footprint stretches across it as 1/cos
  let lod = log2(spread * cone() * len / (0.0007 * R * sqrt(max(abs(dot(n, k)), 0.06))));
  let c = world(i, vec2f(min(h, 2.0 - h), 0.5 - 0.5 * e), lod) * vec3f(g * g, g * g * g, g * g * g * g);
  return vec4f(c * A * s, 0.85 * A * s);
}

// The sky toward d: the dodecahedron's faces, each the world on the icosahedron's vertex it faces.
var<private> AX: array<vec3f, 6> = array<vec3f, 6>(
  vec3f(0.0, 0.5257, 0.8507), vec3f(0.0, 0.5257, -0.8507), vec3f(0.5257, 0.8507, 0.0),
  vec3f(-0.5257, 0.8507, 0.0), vec3f(0.8507, 0.0, 0.5257), vec3f(0.8507, 0.0, -0.5257));
fn sky(d: vec3f, lod: f32) -> vec3f {
  var b = -1.0;
  var b2 = -1.0;
  var f = 0;
  var n = vec3f(0.0);
  for (var k = 0; k < 6; k++) {
    let s = dot(d, AX[k]);
    let m = abs(s);
    if (m > b) { b2 = b; b = m; f = 2 * k + select(0, 1, s < 0.0); n = AX[k] * sign(s); }
    else if (m > b2) { b2 = m; }
  }
  let g = d / b - n;
  let e1 = normalize(cross(n, vec3f(0.36, 0.48, 0.8)));
  let e = b - b2;
  var col = world(f, vec2f(0.5 + dot(g, e1) / 2.24, 0.5 - dot(g, cross(n, e1)) / 1.4), lod) * u.p[12].x;
  col += vec3f(1.2, 0.85, 0.5) * exp(-e * e / 1e-5) * u.p[12].y;
  let star = hash3(floor(d * 300.0));
  return col + vec3f(0.8, 0.85, 1.0) * step(0.996, star) * 3.0 * smoothstep(0.35, 0.0, length(fract(d * 300.0) - 0.5));
}

// What a ray collects on its way out: the rings' light, how much of the sky still shows through, and
// where it goes.
var<private> through: f32;
var<private> gone: vec3f;
var<private> spread: f32; // how much the collapse and the horizon have magnified a pixel
fn trace(q: vec2f) -> vec3f {
  var x = eye();
  var v = ray(q);
  let h2 = dot(cross(x, v), cross(x, v));
  var col = vec3f(0.0);
  var len = 0.0;
  var a = -1.5 * h2 * x / pow(dot(x, x), 2.5);
  var s0 = sides(x);
  through = 1.0;
  for (var i = 0; i < 200; i++) {
    let r = length(x);
    if (r < 2.0 || through < 0.02) { through = 0.0; break; }
    if (r > 60.0 && dot(x, v) > 0.0) { break; }
    let dt = clamp(0.05 * r * r / 3.0, 0.03, 3.0);
    v += 0.5 * dt * a;
    let xn = x + dt * v;
    let s1 = sides(xn);
    len += dt;
    for (var j = 0; j < 3; j++) {
      let c = s0[j] * s1[j];
      if (any(c < vec4f(0.0))) {
        for (var l = 0; l < 4; l++) {
          if (c[l] < 0.0) {
            let w = ring(4 * j + l, mix(x, xn, s0[j][l] / (s0[j][l] - s1[j][l])), normalize(-v), len);
            col += through * w.rgb;
            through *= 1.0 - w.a;
          }
        }
      }
    }
    s0 = s1;
    x = xn;
    a = -1.5 * h2 * x / pow(dot(x, x), 2.5);
    v += 0.5 * dt * a;
  }
  gone = normalize(v);
  return col;
}

fn field(q0: vec2f) -> vec3f {
  for (var i = 0; i < 12; i++) {
    let n = axis(i);
    NX[i / 4][i % 4] = n.x;
    NY[i / 4][i % 4] = n.y;
    NZ[i / 4][i % 4] = n.z;
  }
  let z = u.p[4].y;
  var q = q0 * z;
  let rim = smoothstep(1.7 + 1.0 / z, 1.2 + 1.0 / z, length(q)); // the collapse: the picture shrinks to a point
  // the horizon: climb back out of the shadow a level at a time, the zoom already taken
  var deep = 1.0;
  if (u.p[4].w > 0.0) {
    let H = u.p[5];
    var lr = log(max(length(q), 1e-9)) - H.x * H.y;
    var a = atan2(q.y, q.x) - H.x * H.z;
    let n = clamp(ceil((log(H.w) - lr) / H.y), 0.0, 40.0);
    lr += n * H.y;
    a += n * H.z;
    q = exp(lr) * vec2f(cos(a), sin(a));
    deep = pow(u.p[4].w, n);
  }
  spread = length(q) / max(length(q0), 1e-9);
  let col = trace(q);
  let lod = log2(length(fwidth(gone)) / 0.0044); // a sky texel is 0.0044 rad
  return (col + through * sky(gone, lod)) * rim * deep * u.p[4].z;
}

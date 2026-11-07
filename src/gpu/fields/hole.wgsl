// The singularity · A spinning black hole, G = c = M = 1, spin a = 0.94 along z, hanging in the aisle of a
// fractal nave. Every ray is a null geodesic of the Kerr metric traced back from the eye, in Kerr–Schild
// coordinates: g = η + f l l, f = 2r³ / (r⁴ + a²z²), l = ((rx + ay) / (r² + a²), (ry − ax) / (r² + a²), z/r),
// so the Hamiltonian is H = ½ (|p|² − 1 − f (1 + l·p)²) = 0, integrated by RK4 in steps 0.3 (r − r₊). No
// approximation is made: the chart is the outgoing one, where a ray traced back into the hole crosses r₊
// cleanly, and that is the shadow, flattened like a D on the side whose light orbits with the spin, since
// that light can wind in closer before it is lost (to b = 2.6, against the spin 6.9). Everything near the
// hole is turned with it, frame dragging; past r = 80 the bend still to come is under 2M/r and rays run
// straight. Each step of the ray is a chord, and the nave is sphere-traced along every chord it might
// reach, so its arches are seen where the bent light finds them: wrapped into Einstein rings round the
// shadow and piled up in the photon ring.
//
// The gas: a disk from the innermost stable orbit out to r = 14, flaring as it goes, in Kepler's orbits
// Ω = 1 / (r^3/2 + a), whose shear winds domain-warped turbulence into spirals. It is marched as a volume
// along every chord that crosses it, over the top of the hole and under it and in the photon ring. Each
// parcel is a blackbody at Novikov–Thorne's T ∝ r^−3/4 (1 − √(r_in / r))^1/4, and since I_ν/ν³ is
// conserved along a ray it is seen as a blackbody at gT, g = 1 / (uᵗ (1 − Ω b)), b the photon's angular
// momentum about the spin: bluer and far brighter where it comes toward us, dull red where it goes away
// and deep in the well. The nave is lit by it. It is one cell of R4's Menger nave thick, and through the
// holes in its walls shine the worlds of the fall, one in each face of a dodecahedral sky (the raster
// keeps their shots), seen only as the hole bends them into view.
//
// The horizon: once it opens, the rays that fall in find a lit Mandelbulb on the other side, and the zoom
// into it runs as fast as the choir falls.
//
// p[0..3] camera   p[4] time, collapse, gain, horizon   p[5] a, r_in, disk light, nave light
// p[6..9] the bulb's camera; .w its iterations, -, light   p[10] sky, edges, nave scale

const RV = 80.0; // past this, rays run straight
const ROUT = 14.0; // the disk's outer edge

fn hash3(p: vec3f) -> f32 { return fract(sin(dot(p, vec3f(127.1, 311.7, 74.7))) * 43758.5453); }

fn hashu(p: vec3i) -> f32 {
  var n = (u32(p.x) * 73856093u) ^ (u32(p.y) * 19349663u) ^ (u32(p.z) * 83492791u);
  n = (n ^ (n >> 13u)) * 1274126177u;
  return f32(n ^ (n >> 16u)) * 2.3283064e-10;
}
fn noise(x: vec3f) -> f32 {
  let i = vec3i(floor(x));
  let f = fract(x);
  let w = f * f * (3.0 - 2.0 * f);
  let a = mix(mix(hashu(i), hashu(i + vec3i(1, 0, 0)), w.x), mix(hashu(i + vec3i(0, 1, 0)), hashu(i + vec3i(1, 1, 0)), w.x), w.y);
  let b = mix(mix(hashu(i + vec3i(0, 0, 1)), hashu(i + vec3i(1, 0, 1)), w.x), mix(hashu(i + vec3i(0, 1, 1)), hashu(i + vec3i(1, 1, 1)), w.x), w.y);
  return mix(a, b, w.z);
}

// The metric's r at x: the root of r⁴ − (|x|² − a²) r² − a²z² = 0.
var<private> A: f32;
fn rad(x: vec3f) -> f32 {
  let w = dot(x, x) - A * A;
  return sqrt(0.5 * (w + sqrt(w * w + 4.0 * A * A * x.z * x.z)));
}

// Hamilton's equations: returns dp/dλ = −∂H/∂x and writes dx/dλ = ∂H/∂p. ∇r = r (r²x, r²y, (r² + a²) z) / D.
var<private> R: f32;
fn flow(x: vec3f, p: vec3f, dx: ptr<function, vec3f>) -> vec3f {
  let a = A;
  let a2 = a * a;
  let r = rad(x);
  let r2 = r * r;
  let R2 = r2 + a2;
  let D = r2 * r2 + a2 * x.z * x.z;
  let f = 2.0 * r2 * r / D;
  let l = vec3f((r * x.x + a * x.y) / R2, (r * x.y - a * x.x) / R2, x.z / r);
  let k = 1.0 + dot(l, p);
  *dx = p - f * k * l;
  let gr = r * vec3f(r2 * x.x, r2 * x.y, R2 * x.z) / D;
  let gf = 2.0 * r2 * ((3.0 * a2 * x.z * x.z - r2 * r2) * gr - vec3f(0.0, 0.0, 2.0 * a2 * r * x.z)) / (D * D);
  let S = x.x * p.x + x.y * p.y;
  let T = x.y * p.x - x.x * p.y;
  let dL = S / R2 - 2.0 * r * (r * S + a * T) / (R2 * R2) - x.z * p.z / r2;
  let gL = vec3f((r * p.x - a * p.y) / R2, (r * p.y + a * p.x) / R2, p.z / r) + dL * gr;
  R = r;
  return 0.5 * k * k * gf + f * k * gL;
}

// A blackbody at T kelvin, at 630, 532 and 465 nm, white-balanced so that 6500 K is white.
fn planck(T: f32) -> vec3f {
  let l = vec3f(0.63, 0.532, 0.465);
  return vec3f(1.198, 1.0, 0.936) / (l * l * l * l * l * (exp(min(14388.0 / (l * max(T, 300.0)), vec3f(80.0))) - 1.0));
}

// The gas along the chord from x0 to x1, marched as a volume: its light into col, what it hides from
// through. b is the photon's angular momentum about the spin, x py − y px, of the ray traced back.
var<private> col: vec3f;
var<private> through: f32;
fn gas(x0: vec3f, x1: vec3f, b: f32, j: f32) {
  let H = 0.1 + 0.12 * max(length(x0.xy), length(x1.xy)); // three scale heights, at the chord's far end
  let dz = x1.z - x0.z;
  var s0 = 0.0;
  var s1 = 1.0;
  if (abs(dz) > 1e-5) {
    let sa = (-H - x0.z) / dz;
    let sb = (H - x0.z) / dz;
    s0 = max(0.0, min(sa, sb));
    s1 = min(1.0, max(sa, sb));
  } else if (abs(x0.z) > H) { return; }
  if (s1 <= s0) { return; }
  let rin = u.p[5].y;
  let ds = (s1 - s0) * length(x1 - x0) / 4.0;
  for (var i = 0; i < 4; i++) {
    let P = mix(x0, x1, s0 + (s1 - s0) * (f32(i) + j) / 4.0);
    let r = rad(P);
    if (r > ROUT || r < 0.8 * rin) { continue; }
    let h = 0.02 + 0.04 * r;
    let shape = exp(-0.5 * P.z * P.z / (h * h)) * smoothstep(0.85 * rin, 1.1 * rin, r) * smoothstep(ROUT, 0.5 * ROUT, r);
    if (shape < 0.01) { continue; }
    let rr = max(r, rin);
    let s = sqrt(rr);
    let om = 1.0 / (rr * s + A);
    // the gas in its own orbit: each radius turned back by its own Ω t, so the shear winds it
    let th = -om * u.p[4].x;
    var q = vec3f(cos(th) * P.x - sin(th) * P.y, sin(th) * P.x + cos(th) * P.y, 2.5 * P.z) * 1.3;
    q += 1.4 * vec3f(noise(0.5 * q), noise(0.5 * q + 7.1), 0.0) - 0.7; // domain warp
    let n = 0.55 * noise(q) + 0.3 * noise(2.1 * q + 3.3) + 0.15 * noise(4.3 * q + 9.7);
    let rho = shape * smoothstep(0.42, 0.72, n) * 3.0;
    if (rho < 0.01) { continue; }
    let ut = (rr * s + A) / (pow(rr, 0.75) * sqrt(max(rr * s - 3.0 * s + 2.0 * A, 1e-3)));
    let g = 1.0 / (ut * max(1.0 + om * b, 0.05));
    let x = rin / rr;
    let T = 7000.0 * 2.05 * pow(x, 0.75) * pow(max(1.0 - sqrt(x), 0.0), 0.25) + 1200.0;
    let o = 1.0 - exp(-0.8 * rho * ds); // what this sample hides, and so, being in equilibrium, emits
    col += through * o * planck(g * T) * u.p[5].z;
    through *= 1.0 - o;
  }
}

// The nave: R4's kaleidoscopic IFS, a Menger sponge bent by a turn at every fold, tiled through space, S
// to a unit and laid along x, so the hole hangs in its aisle.
var<private> trap: f32;
fn turn(v: vec2f, a: f32) -> vec2f { return vec2f(cos(a) * v.x - sin(a) * v.y, sin(a) * v.x + cos(a) * v.y); }
fn hall(x: vec3f) -> f32 {
  let S = u.p[10].z;
  var p = x.yzx / S;
  p -= 2.0 * round(0.5 * p);
  var s = 1.0;
  trap = 1e9;
  for (var i = 0; i < 6; i++) {
    p = abs(p);
    if (p.x < p.y) { p = p.yxz; }
    if (p.x < p.z) { p = p.zyx; }
    if (p.y < p.z) { p = p.xzy; }
    p = vec3f(turn(p.xy, 0.12), p.z);
    p = 3.0 * p - vec3f(2.0, 2.0, 0.0);
    if (p.z > 1.0) { p.z -= 2.0; }
    s *= 3.0;
    trap = min(trap, dot(p, p));
  }
  let e = abs(p) - 1.0;
  return max(S * (length(max(e, vec3f(0.0))) + min(max(e.x, max(e.y, e.z)), 0.0)) / s, max(abs(x.x) - 3.0 * S, max(abs(x.y), abs(x.z)) - S)); // one cell thick
}

// Where the chord from x to x + v meets the nave, as a fraction of it, or −1; t0 is how far the ray had run.
fn meet(x: vec3f, v: vec3f, t0: f32) -> f32 {
  let L = length(v);
  var t = 0.0;
  for (var i = 0; i < 48; i++) {
    let h = hall(x + v * (t / L));
    if (h < cone() * (t0 + t) + 1e-3) { return t / L; }
    t += h;
    if (t > L) { break; }
  }
  return -1.0;
}

// The nave at P, seen from along d, lit by the disk at the centre: bone where the disk's light falls,
// verdigris in the shade.
fn stone(P: vec3f, d: vec3f, t: f32) -> vec3f {
  let e = 0.5 * cone() * t;
  let k = vec2f(1.0, -1.0);
  let n = normalize(k.xyy * hall(P + k.xyy * e) + k.yyx * hall(P + k.yyx * e) + k.yxy * hall(P + k.yxy * e) + k.xxx * hall(P + k.xxx * e));
  let w = 0.02 * u.p[10].z;
  let ao = clamp(hall(P + n * w) / w, 0.0, 1.0) * clamp(0.5 + 0.5 * hall(P + n * 4.0 * w) / (4.0 * w), 0.0, 1.0);
  hall(P);
  let L = -normalize(P);
  let fire = vec3f(1.0, 0.7, 0.42) * pow(max(dot(n, L), 0.0), 1.5) * 300.0 / dot(P, P); // the disk's light
  let rim = pow(1.0 - abs(dot(n, d)), 4.0);
  let bone = vec3f(1.0, 0.82, 0.55);
  let verdigris = vec3f(0.02, 0.45, 0.38);
  let c = (mix(verdigris, bone, smoothstep(0.5, 3.0, trap)) * (0.03 + fire) + 0.2 * rim * verdigris) * ao;
  return mix(vec3f(0.0, 0.002, 0.003), c, exp(-0.004 * t)) * u.p[5].w;
}

// The sky toward d: the dodecahedron's faces, each the world on the icosahedron's vertex it faces.
fn world(i: i32, uv: vec2f, lod: f32) -> vec3f {
  let l = clamp(lod, 0.0, 5.0);
  let e = exp2(l) * vec2f(0.5 / 512.0, 0.5 / 320.0);
  let at = vec2f(f32(i % 4), f32(i / 4));
  let mean = textureSampleLevel(data, smp, (at + 0.5) / vec2f(4.0, 3.0), 6.0).rgb;
  let c = textureSampleLevel(data, smp, (at + clamp(uv, e, 1.0 - e)) / vec2f(4.0, 3.0), l).rgb;
  return c * 0.35 / (0.03 + dot(mean, vec3f(0.3, 0.6, 0.1)));
}
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
  var c = world(f, vec2f(0.5 + dot(g, e1) / 2.24, 0.5 - dot(g, cross(n, e1)) / 1.4), lod) * u.p[10].x;
  c += vec3f(1.2, 0.85, 0.5) * exp(-e * e / 1e-5) * u.p[10].y;
  let star = hash3(floor(d * 300.0));
  return c + vec3f(0.8, 0.85, 1.0) * step(0.996, star) * 3.0 * smoothstep(0.35, 0.0, length(fract(d * 300.0) - 0.5));
}

// The Mandelbulb on the other side of the horizon, z ↦ z⁸ + c, through its own camera.
var<private> btrap: vec4f;
fn bulb(c: vec3f) -> f32 {
  var z = c;
  var dr = 1.0;
  var r = length(z);
  btrap = vec4f(abs(z), r * r);
  let N = i32(u.p[7].w);
  for (var i = 0; i < N; i++) {
    if (r > 2.0) { break; }
    let r7 = r * r * r * r * r * r * r;
    dr = 8.0 * r7 * dr + 1.0;
    let th = 8.0 * acos(clamp(z.z / r, -1.0, 1.0));
    let ph = 8.0 * atan2(z.y, z.x);
    z = r7 * r * vec3f(sin(th) * cos(ph), sin(th) * sin(ph), cos(th)) + c;
    r = length(z);
    btrap = min(btrap, vec4f(abs(z), r * r));
  }
  return 0.5 * log(r) * r / dr;
}
fn inside(q: vec2f) -> vec3f {
  let ro = u.p[6].xyz;
  let rd = normalize(u.p[9].xyz * u.p[6].w + u.p[7].xyz * q.x + u.p[8].xyz * q.y);
  let px = u.px / u.p[6].w;
  var t = 0.0;
  var i = 0;
  var hit = false;
  for (; i < 96; i++) {
    let d = bulb(ro + rd * t);
    if (d < px * t + 1e-6) { hit = true; break; }
    t += d;
    if (t > 6.0) { break; }
  }
  let deep = vec3f(0.02, 0.0, 0.05);
  if (!hit) { return deep; }
  let P = ro + rd * t;
  let e = 0.5 * px * t;
  let k = vec2f(1.0, -1.0);
  let n = normalize(k.xyy * bulb(P + k.xyy * e) + k.yyx * bulb(P + k.yyx * e) + k.yxy * bulb(P + k.yxy * e) + k.xxx * bulb(P + k.xxx * e));
  bulb(P);
  let ao = pow(1.0 - f32(i) / 96.0, 2.0);
  let key = normalize(vec3f(0.5, 0.7, 0.4));
  let dif = max(dot(n, key), 0.0);
  let spec = pow(max(dot(reflect(rd, n), key), 0.0), 30.0);
  let rim = pow(1.0 - abs(dot(n, rd)), 3.0);
  let gold = vec3f(1.6, 0.9, 0.3);
  let violet = vec3f(0.25, 0.08, 0.9);
  let c = mix(violet, gold, ao * smoothstep(0.1, 0.9, btrap.w)) * (0.05 + dif) * ao + 0.6 * spec * ao + vec3f(1.0, 0.3, 0.1) * rim * (1.0 - ao);
  return c * u.p[9].w;
}

fn field(q0: vec2f) -> vec3f {
  let z = u.p[4].y;
  let q = q0 * z;
  let rim = smoothstep(1.7 + 1.0 / z, 1.2 + 1.0 / z, length(q)); // the collapse: the picture shrinks to a point
  A = u.p[5].x;
  let rh = 1.0 + sqrt(1.0 - A * A);
  var x = eye();
  let n = ray(q);
  // p = k n, on the light cone: k² (1 − f L²) − 2 f L k − (1 + f) = 0, L = l·n
  let r0 = rad(x);
  let l0 = vec3f((r0 * x.x + A * x.y) / (r0 * r0 + A * A), (r0 * x.y - A * x.x) / (r0 * r0 + A * A), x.z / r0);
  let f0 = 2.0 * r0 * r0 * r0 / (r0 * r0 * r0 * r0 + A * A * x.z * x.z);
  let L = dot(l0, n);
  let qa = 1.0 - f0 * L * L;
  var p = n * (f0 * L + sqrt(f0 * f0 * L * L + qa * (1.0 + f0))) / qa;
  let b = x.x * p.y - x.y * p.x;
  let j = hash3(vec3f(q0 * 517.0, u.p[4].x)); // the gas's samples, dithered
  col = vec3f(0.0);
  through = 1.0;
  var fell = false;
  var hit = false;
  var len = 0.0;
  var dx = vec3f(0.0);
  var free = vec4f(x, hall(x)); // a ball the nave is known to keep clear of
  for (var i = 0; i < 110; i++) {
    let dp1 = flow(x, p, &dx);
    if (R < rh + 0.02) { fell = true; break; }
    if (R > RV && dot(x, dx) > 0.0) { break; }
    let h = min(0.3 * (R - rh), 0.5 * R);
    let dx1 = dx;
    var dx2: vec3f;
    var dx3: vec3f;
    var dx4: vec3f;
    let dp2 = flow(x + 0.5 * h * dx1, p + 0.5 * h * dp1, &dx2);
    let dp3 = flow(x + 0.5 * h * dx2, p + 0.5 * h * dp2, &dx3);
    let dp4 = flow(x + h * dx3, p + h * dp3, &dx4);
    let xn = x + h / 6.0 * (dx1 + 2.0 * dx2 + 2.0 * dx3 + dx4);
    p += h / 6.0 * (dp1 + 2.0 * dp2 + 2.0 * dp3 + dp4);
    gas(x, xn, b, j);
    // the nave, wherever this step of the ray might reach it
    let v = xn - x;
    if (distance(xn, free.xyz) > free.w) {
      free = vec4f(x, hall(x));
      if (free.w < length(v)) {
        let m = meet(x, v, len);
        if (m >= 0.0) { x += m * v; len += m * length(v); hit = true; break; }
      }
    }
    len += length(v);
    x = xn;
    if (through < 0.02) { break; }
  }
  let d = normalize(dx);
  let lod = log2(length(fwidth(d)) / 0.0044); // a sky texel is 0.0044 rad
  var c = col;
  if (through >= 0.02) {
    if (hit) { c += through * stone(x, d, len); }
    else if (!fell) {
      // past the hall's far end the rays run straight
      let m = meet(x, 200.0 * d, len);
      c += through * select(sky(d, lod), stone(x + 200.0 * m * d, d, len + 200.0 * m), m >= 0.0);
    }
    else if (u.p[4].w > 0.0) { c += through * u.p[4].w * inside(q); }
  }
  return c * rim * u.p[4].z;
}

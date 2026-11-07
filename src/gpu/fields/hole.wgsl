// The singularity · one Schwarzschild hole at the origin, G = c = 1, its mass M (p[4].y) grown from nothing
// to 1 as it opens. Every ray is a null geodesic traced back from the eye. Light keeps to a plane through
// the hole, and its orbit there obeys u'' + u = 3Mu², u = 1/r: exactly the path of a particle in flat space
// pushed by x'' = −3M h² x / r⁵, h = |x × x'| the ray's angular momentum, held fixed. So each ray is that,
// by Runge–Kutta–Nyström in steps of 0.3 (r − 2M): it falls in at r = 2M, the shadow, or runs out straight past RV.
//
// The eye hovers (a static observer), so a pixel's direction is in its own frame: it sees a ray leave at
// ψ from the hole where tan ψ = √(1 − 2M/r) r dφ/dr, so the flat path starts with its tangent stretched
// by 1/√(1 − 2M/r) against what the eye measures. That is why, low over the hole, its shadow fills most
// of the sky: sin ψ = 3√3 M √(1 − 2M/r) / r, past 90° once r < 3M.
//
// The photon sphere glows: gas orbiting there at nearly c, its light beamed along its orbit, so only rays
// that run along the sphere gather it, and those that wind round it most gather most. That is the ring,
// blazing at the shadow's edge, with the shadow black inside it.
//
// The worlds fall in behind the hole, three at a time: each the raster's last shot of it (raster.ts), a
// card square to the eye's line through the hole, at depth L past it, turning as it shrinks into it.
//
// Once the shadow fills the view, the rays that fall in find a lit Mandelbulb, z ↦ z⁸ + c, through its own
// camera; past the horizon it is all there is.
//
// p[0..3] camera   p[4] time, M, gain, ring light   p[5] the bulb seen through the horizon, past it
// p[6..9] the bulb's camera, p[7].w its iterations, p[9].w its light
// p[10..12] the falling worlds: depth past the hole, half-height, turn, tile   p[13] their light

const RV = 80.0; // past this, rays run straight

var<private> M: f32;
var<private> H2: f32; // the ray's h²
fn pull(x: vec3f) -> vec3f {
  let r2 = dot(x, x);
  return -3.0 * M * H2 * x / (r2 * r2 * sqrt(r2));
}

// The card of world k where the segment from x along v (s ∈ [0, 1]) meets its plane: (s, its uv), or s = 2.
fn card(k: i32, x: vec3f, v: vec3f) -> vec3f {
  let w = u.p[10 + k];
  let A = u.p[3].xyz;
  let a0 = dot(x, A) - w.x;
  let av = dot(v, A);
  if (w.y <= 0.0 || abs(av) < 1e-6) { return vec3f(2.0); }
  let s = -a0 / av;
  if (s < 0.0 || s > 1.0) { return vec3f(2.0); }
  let P = x + s * v - w.x * A;
  let c = cos(w.z);
  let sn = sin(w.z);
  let p = vec2f(dot(P, u.p[1].xyz), dot(P, u.p[2].xyz));
  let q = vec2f(c * p.x + sn * p.y, c * p.y - sn * p.x) / (w.y * vec2f(u.aspect, 1.0));
  if (max(abs(q.x), abs(q.y)) > 1.0) { return vec3f(2.0); }
  return vec3f(s, q);
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
  let deep = vec3f(0.004, 0.0, 0.01);
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
  let c = mix(violet, gold, ao * smoothstep(0.1, 0.9, btrap.w)) * (0.02 + 1.3 * dif * dif) * ao + 0.8 * spec * ao + vec3f(1.0, 0.3, 0.1) * 1.5 * rim * (1.0 - ao);
  return c * u.p[9].w;
}

fn field(q: vec2f) -> vec3f {
  if (u.p[5].y > 0.0) { return inside(q) * u.p[4].z; } // past the horizon: only the bulb
  M = u.p[4].y;
  var x = eye();
  let n = ray(q);
  let er = normalize(x);
  let al = sqrt(max(1.0 - 2.0 * M / length(x), 1e-4));
  var v = normalize(n + (al - 1.0) * dot(n, er) * er);
  let hv = cross(x, v);
  H2 = dot(hv, hv);
  let rh = 2.0 * M + 0.01;
  var glow = 0.0;
  var fell = false;
  var hit = vec3f(2.0); // the nearest card met: s, uv
  var k = -1;
  for (var i = 0; i < 110; i++) {
    let r = length(x);
    if (r < rh) { fell = true; break; }
    if (r > RV && dot(x, v) > 0.0) { break; }
    let sp = length(v);
    let h = clamp(0.3 * (r - 2.0 * M), 0.01, 0.5 * r) / sp;
    let a1 = pull(x);
    let a2 = pull(x + 0.5 * h * v + 0.125 * h * h * a1);
    let a3 = pull(x + 0.5 * h * v + 0.125 * h * h * a2);
    let a4 = pull(x + h * v + 0.5 * h * h * a3);
    let xn = x + h * v + h * h / 6.0 * (a1 + a2 + a3);
    let vn = v + h / 6.0 * (a1 + 2.0 * a2 + 2.0 * a3 + a4);
    // the light orbiting at the photon sphere, beamed along its orbit
    let c = dot(x, v) / (r * sp);
    let s2 = 1.0 - c * c;
    let s4 = s2 * s2;
    let s16 = s4 * s4 * s4 * s4;
    let d = (r - 3.0 * M) / (0.3 * M + 1e-4);
    glow += exp(-d * d) * s16 * s16 * h * sp;
    for (var j = 0; j < 3; j++) {
      let m = card(j, x, xn - x);
      if (m.x < hit.x) { hit = m; k = j; }
    }
    if (k >= 0) { break; }
    x = xn;
    v = vn;
  }
  if (!fell && k < 0) {
    // past RV, straight on
    let d = 1e3 * normalize(v);
    for (var j = 0; j < 3; j++) {
      let m = card(j, x, d);
      if (m.x < hit.x) { hit = m; k = j; }
    }
  }
  let uv = 0.5 + vec2f(0.5, -0.5) * hit.yz;
  let lod = clamp(log2(max(length(fwidth(uv)) * 400.0, 1e-3)), 0.0, 6.0);
  var col = vec3f(1.0, 0.8, 0.55) * glow * u.p[4].w * M;
  if (k >= 0) {
    let w = u.p[10 + k];
    let t = i32(w.w);
    let at = vec2f(f32(t % 4), f32(t / 4));
    let e = exp2(lod) * vec2f(0.5 / 512.0, 0.5 / 320.0);
    col += textureSampleLevel(data, smp, (at + clamp(uv, e, 1.0 - e)) / vec2f(4.0, 3.0), lod).rgb * u.p[13][k];
  }
  if (fell && u.p[5].x > 0.0) { col += inside(q) * u.p[5].x; }
  return col * u.p[4].z;
}

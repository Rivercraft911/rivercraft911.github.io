// The finale · a cathedral falls into a black hole. One Schwarzschild hole, G = c = M = 1 (M is p[4].y,
// grown from nothing as it opens), hangs in the crossing of an endless fractal cathedral: a pseudo-Kleinian
// (Knighty), a box fold and a sphere inversion again and again, arches without end. Every ray is a null
// geodesic traced back from the eye. Light keeps to a plane through the hole, and its orbit there obeys
// u'' + u = 3Mu², u = 1/r: the path of a particle in flat space pushed by x'' = −3M h² x / r⁵, h = |x × x'|
// held fixed. So each ray is that, by leapfrog, and the cathedral is sphere-traced along it: a step no
// longer than the distance to the stone keeps the curved step inside the empty ball, so the bent ray finds
// the arches where the bent light does, wrapped into Einstein rings round the shadow.
//
// The eye falls (p[6] its velocity in the static frame): a pixel's direction is aberrated into the static
// frame, cos θ = (cos θ′ − β) / (1 − β cos θ′), and there the flat path starts with its radial part
// squeezed by √(1 − 2M/r). That is why, falling through the horizon, the shadow still fills only 42° of
// the sky ahead.
//
// Then the world is torn in. Stone at r is drawn from where it fell from at rest: r₀^3/2 = r^3/2 + K, so it
// is stretched along r as r^1/2 / r₀^1/2 and squeezed across it as r / r₀, spaghettified, and the shear
// of its orbits winds it round the hole, the nearer the faster, into the plane of the spin. The step is
// divided by the warp's stretch, so the trace stays inside the empty ball. What has fallen far is hot: it
// is gas, marched as a volume, a blackbody at T ∝ r^−3/4 seen at gT, g the Doppler factor of its orbit
// and the well's redshift, bluer and far brighter where it comes toward us.
//
// p[0..3] camera   p[4] time, M, gain, ring light
// p[5] infall K, wind, gas, gas light   p[6] the eye's velocity, the flash
// p[7] the card (R5's last frame) centre, half-height   p[8] its right, turn   p[9] its up, how far its sky has cleared
// p[10] tile, nave scale, hole light, key light   p[11] the crossing's radius, the nave's

const FAR = 120.0;
const STEPS = 128;

fn turn(v: vec2f, a: f32) -> vec2f { return vec2f(cos(a) * v.x - sin(a) * v.y, sin(a) * v.x + cos(a) * v.y); }

var<private> M: f32;
var<private> H2: f32; // the ray's h²
fn pull(x: vec3f) -> vec3f {
  let r2 = dot(x, x);
  return -3.0 * M * H2 * x / (r2 * r2 * sqrt(r2));
}
// How far one step may go at r, for the bend still to come to be followed.
// Near the photon sphere, short enough that its glow is gathered smoothly.
fn bend(r: f32) -> f32 { return clamp(min(0.3 * (r - 2.0 * M), 0.04 + 0.5 * abs(r - 3.0 * M)) + 0.02, 0.01, 0.5 * r + 0.5); }

// The cathedral: Knighty's pseudo-Kleinian, its aisle along y.
var<private> trap: vec4f;
fn kleinian(q: vec3f) -> f32 {
  let box = vec3f(0.808, 0.808, 1.167);
  var p = q;
  var s = 1.0;
  trap = vec4f(1e9);
  for (var i = 0; i < 6; i++) {
    p = 2.0 * clamp(p, -box, box) - p;
    let r2 = dot(p, p);
    trap = min(trap, vec4f(abs(p), r2));
    let k = max(0.70968 / r2, 1.0);
    p *= k;
    s *= k;
  }
  let rxy = length(p.xy);
  return max(rxy - 0.92784, abs(rxy * p.z) / length(p)) / s;
}

// The world as it is torn in: the stone at x, drawn from where it fell from; and how much of it is gas.
// What has fallen far is worn away above the plane of the spin, the more the higher, into a disk walled by
// the stone still standing round it: a funnel, as water goes down a drain.
var<private> gas: f32;
var<private> fallen: f32; // r₀ / r
var<private> stone: f32; // the distance to the stone where it fell from, there
var<private> above: f32; // how far above the disk
var<private> sight: f32; // and into the eye's clear line to the shadow
fn de(x: vec3f) -> f32 {
  let r = max(length(x), 1e-3);
  let r0 = pow(r * sqrt(r) + u.p[5].x, 2.0 / 3.0);
  let s = r0 / r;
  let k = 2.0 * M / max(r, 2.0);
  let w = u.p[5].y * k * sqrt(k);
  let y = vec3f(turn(x.xy * s, w), x.z * s);
  let c = smoothstep(1.1, 2.0, s) * u.p[5].z;
  fallen = s;
  gas = smoothstep(1.5, 4.0, s) * u.p[5].z;
  let S = u.p[10].y;
  let hollow = min(length(y) - u.p[11].x, length(y.xz) - u.p[11].y); // the crossing and the nave, kept clear
  above = abs(x.z) - r * (0.08 + 2.0 * (1.0 - c)) - 0.05;
  stone = max(S * kleinian(y / S + vec3f(0.0, 0.5, 0.0)), -hollow);
  // and nothing comes between the eye and the shadow: a cone from the eye a little wider than it is cleared
  let e = eye();
  let D = length(e);
  let along = dot(x - e, -e) / D;
  sight = 7.0 * along / D * smoothstep(D - 1.0, D - 4.0, along) - length(x - e + e * along / D);
  return max((stone / (s * (1.0 + 1.5 * w)) + max(above, 0.0) / 3.0) / 1.5, 0.9 * sight);
}

// R5's last frame, on a card square to the eye's first line of sight: (s along the segment, uv), or s = 2.
fn card(x: vec3f, v: vec3f) -> vec3f {
  let R = u.p[8].xyz;
  let U = u.p[9].xyz;
  let N = cross(R, U);
  let a0 = dot(x - u.p[7].xyz, N);
  let av = dot(v, N);
  if (abs(av) < 1e-6) { return vec3f(2.0); }
  let s = -a0 / av;
  if (s < 0.0 || s > 1.0) { return vec3f(2.0); }
  let P = x + s * v - u.p[7].xyz;
  let p = turn(vec2f(dot(P, R), dot(P, U)), u.p[8].w) / (u.p[7].w * vec2f(u.aspect, 1.0));
  if (max(abs(p.x), abs(p.y)) > 1.0) { return vec3f(2.0); }
  return vec3f(s, p);
}

// A blackbody at T kelvin, at 630, 532 and 465 nm, white-balanced so that 6500 K is white.
fn planck(T: f32) -> vec3f {
  let l = vec3f(0.63, 0.532, 0.465);
  return vec3f(1.198, 1.0, 0.936) / (l * l * l * l * l * (exp(min(14388.0 / (l * max(T, 500.0)), vec3f(60.0))) - 1.0));
}

// What has fallen to r is as hot as a thin disk there: T ∝ r^−3/4, cold inside the last stable orbit.
fn temp(r: f32) -> f32 { return 3600.0 * pow(6.0 / max(r, 3.0), 0.75); }
// The light of what has fallen to x, seen along v: the blackbody's colour at gT, and its strength, which
// a thin disk gives as r^−3 (eased to r^−3/2, or the outer stone would be lost), beamed as g³.
fn burn(x: vec3f, v: vec3f) -> vec3f {
  let r = length(x);
  let g = doppler(x, v);
  let c = planck(g * temp(r));
  return c / dot(c, vec3f(0.3, 0.6, 0.1)) * pow(6.0 / max(r, 3.0), 1.5) * g * g * g * smoothstep(2.1, 3.0, r) * u.p[5].w;
}

// How much bluer what orbits at x looks, seen along v: g = √(1 − 2M/r) / (γ (1 + β·v)), β = √(M/r) round
// the spin, the way the wind turns it.
fn doppler(x: vec3f, v: vec3f) -> f32 {
  let r = length(x);
  let b = vec3f(x.y, -x.x, 0.0) * min(1.0 / (r * sqrt(r)), 0.7 / max(length(x.xy), 1e-3));
  return sqrt(max(1.0 - 2.0 * M / r, 0.0) * (1.0 - dot(b, b))) / max(1.0 + dot(b, normalize(v)), 0.1);
}

// The light orbiting at the photon sphere, beamed along its orbit: only rays running along the sphere
// gather it, and those that wind round it most gather most.
fn ring(x: vec3f, v: vec3f, s: f32) -> f32 {
  let r = length(x);
  let c = dot(x, v) / (r * length(v));
  let s2 = 1.0 - c * c;
  let s4 = s2 * s2;
  let s16 = s4 * s4 * s4 * s4;
  let e = (r - 3.0 * M) / (0.3 * M + 1e-4);
  return exp(-e * e) * s16 * s16 * s;
}

fn field(q: vec2f) -> vec3f {
  if (u.p[6].w > 0.0) { return vec3f(u.p[6].w); } // the flash: the whole screen burnt white
  M = u.p[4].y;
  let x0 = eye();
  var d = ray(q);
  // aberration: what the falling eye sees at d, the static frame sees at
  let bv = u.p[6].xyz;
  let b = length(bv);
  if (b > 1e-4) {
    let bh = bv / b;
    let c = dot(d, bh);
    let cs = (c - b) / (1.0 - b * c);
    let side = d - c * bh;
    d = cs * bh + side * sqrt(max(1.0 - cs * cs, 0.0)) / max(length(side), 1e-6);
  }
  let er = normalize(x0);
  let al = sqrt(max(1.0 - 2.0 * M / length(x0), 1e-4));
  let v0 = d + (al - 1.0) * dot(d, er) * er;
  let hv = cross(x0, v0);
  H2 = dot(hv, hv);
  let rh = 2.0 * M + 0.02;
  var glow = 0.0;

  // R5's last frame, in front of everything while it lasts: the ray traced past the stone to it
  var cd = vec3f(2.0);
  var over = vec4f(0.0); // the card, over what is behind it
  if (u.p[7].w > 0.0) {
    var x = x0;
    var v = v0;
    var a = pull(x);
    for (var i = 0; i < 40; i++) {
      let r = length(x);
      if (r < rh) { break; }
      let s = bend(r) + 1.0;
      glow += ring(x, v, s);
      let dt = s / length(v);
      let vh = v + 0.5 * dt * a;
      let st = dt * vh;
      cd = card(x, st);
      if (cd.x < 1.0) { break; }
      x += st;
      a = pull(x);
      v = vh + 0.5 * dt * a;
    }
  }
  let uv = 0.5 + vec2f(0.5, -0.5) * cd.yz;
  let lod = clamp(log2(max(length(fwidth(uv)) * 400.0, 1e-3)), 0.0, 6.0);
  if (cd.x < 1.0) {
    let t = i32(u.p[10].x);
    let at = vec2f(f32(t % 4), f32(t / 4));
    let e = exp2(lod) * vec2f(0.5 / 512.0, 0.5 / 320.0);
    let c = textureSampleLevel(data, smp, (at + clamp(uv, e, 1.0 - e)) / vec2f(4.0, 3.0), lod).rgb;
    // as it falls, its empty sky lets the cathedral through
    let o = mix(1.0, smoothstep(0.01, 0.08, dot(c, vec3f(0.3, 0.6, 0.1))), u.p[9].w);
    if (o > 0.99) { return (c + vec3f(1.0, 0.8, 0.55) * glow * u.p[4].w * M) * u.p[4].z; }
    over = vec4f(c * o, o);
  }

  var x = x0;
  var v = v0;
  var a = pull(x);
  let px = cone();
  var len = 0.0;
  var hit = false;
  var fell = false;
  var hot = vec3f(0.0); // the gas's light
  var through = 1.0;
  glow = 0.0;
  var i = 0;
  for (; i < STEPS; i++) {
    let r = length(x);
    if (r < rh) { fell = true; break; }
    let dd = de(x);
    let g = gas;
    if (dd < px * len + 1e-4 && g < 0.5) { hit = true; break; }
    var s = min(abs(dd), bend(r));
    if (g > 0.0) {
      // the gas: as dense as the stone it was is near, glowing at its orbit's blackbody
      s = clamp(abs(dd), 0.02 * r, 0.06 * r);
      let rho = g * smoothstep(1.0, 0.0, stone) * smoothstep(0.02 * r, -0.02 * r, above) * smoothstep(2.0, -2.0, sight);
      if (rho > 0.0) {
        hot += through * rho * s * burn(x, v);
        through *= exp(-rho * s * 0.4);
        if (through < 0.02) { break; }
      }
    }
    glow += ring(x, v, s);
    let dt = s / length(v);
    let vh = v + 0.5 * dt * a;
    x += dt * vh;
    a = pull(x);
    v = vh + 0.5 * dt * a;
    len += s;
    if (len > FAR) { break; }
  }
  if (i == STEPS) { fell = length(x) < 3.5 * M; hit = !fell; } // out of steps: among the stone, or wound into the hole
  var col = vec3f(0.0);
  let haze = vec3f(0.004, 0.003, 0.012);
  if (hit) {
    let P = x;
    let e = max(0.5 * px * len, 1e-3);
    let k = vec2f(1.0, -1.0);
    let n = normalize(k.xyy * de(P + k.xyy * e) + k.yyx * de(P + k.yyx * e) + k.yxy * de(P + k.yxy * e) + k.xxx * de(P + k.xxx * e));
    let w = 0.03 * u.p[10].y;
    let ao = clamp(de(P + n * w) / w, 0.0, 1.0) * clamp(0.5 + 0.5 * de(P + n * 4.0 * w) / (4.0 * w), 0.0, 1.0);
    de(P);
    let rP = length(P);
    let toward = -P / rP;
    let fire = vec3f(1.0, 0.55, 0.25) * pow(max(dot(n, toward), 0.0), 1.5) * u.p[10].z * 150.0 / (dot(P, P) + 9.0);
    let key = vec3f(0.3, 0.45, 1.0) * (0.5 + 0.5 * dot(n, normalize(vec3f(-0.3, 0.2, 0.9)))) * u.p[10].w;
    let rim = pow(1.0 - abs(dot(n, normalize(v))), 3.0);
    let ivory = vec3f(1.0, 0.84, 0.62);
    let lapis = vec3f(0.03, 0.07, 0.4);
    let gold = vec3f(1.8, 0.95, 0.25);
    let base = mix(lapis, ivory, smoothstep(0.15, 0.9, trap.w));
    let glowing = burn(P, v) * smoothstep(1.2, 2.5, fallen) * 0.4 * (0.2 + smoothstep(0.6, 0.05, trap.w)); // stone heating as it falls
    let c = glowing + base * (0.01 + fire + key) * ao + gold * exp(-30.0 * trap.w) * (0.15 + fire) * (1.0 - smoothstep(1.0, 1.6, fallen)) + 0.1 * rim * vec3f(0.2, 0.3, 1.0) * ao;
    col = mix(haze, c, exp(-0.012 * len));
  } else if (!fell) {
    col = haze;
  }
  col = col * through + hot + vec3f(1.0, 0.8, 0.55) * glow * u.p[4].w * M;
  return (over.rgb + col * (1.0 - over.a)) * u.p[4].z;
}

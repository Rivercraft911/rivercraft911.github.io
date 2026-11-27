// The dive (acts/dive.ts). The drain's throat is the top of a shaft bored down through a mountain of worlds to a black
// hole at its foot, and we fall down it.
//
// The mountain is built in the hole's own log-polar coordinates: across the shaft's axis A by stereographic projection
// of the direction from the hole, along it by ln r. Near the axis that map is conformal, so a world built there keeps
// its shapes, and it scales them all with r: the shaft is a cone with its apex in the hole, and a fall at a steady rate
// in ln r is a zoom without end, every e-fold a copy of the one before, the picture's own Shepard tone. It takes a
// cylinder round the axis to a cylinder too, so the shaft's top is the whirlpool's drain itself, its throat lit as
// wrap.wgsl lights it, flaring into a nave. Down the shaft the worlds are bands of ln r, each morphing into the next by
// mixing their distance fields: the drain's water, a cathedral (Knighty's pseudo-Kleinian, whose own aisle is the
// shaft), a Menger sponge, a Mandelbox, and a foam of bubbles in bubbles; deeper is smaller, so each is found inside the
// one before. The walls are lit by the fire at the bottom, which falls off as r⁻², so an eye that adapts as r² sees the
// same light at every depth.
//
// The bottom is a hollow round the hole, under a dome of the last world, open below to the sky. The hole is
// Schwarzschild, G = c = M = 1. Light keeps to a plane through it, and its orbit there obeys u'' + u = 3u², u = 1/r,
// ' = d/dφ: traced back from the eye in even steps of φ by leapfrog, so the winding round the photon sphere is followed
// as finely as the rest. A pixel's direction in the static frame starts it, the radial part of its flat-space velocity
// squeezed by √(1 − 2/r). The disk is thin, from the last stable orbit at 6 out to RO, each ring a blackbody at Shakura
// and Sunyaev's T ∝ r^−3/4 (1 − √(6/r))^1/4 on a Keplerian orbit; seen at g = √(1 − 3/r) / (1 + Ω b_z) (its orbit's
// Doppler and the well's redshift; b_z the photon's angular momentum about the spin), and a blackbody seen g times
// bluer is a blackbody at gT, which is all of beaming. The ray meets the disk's plane at its nodes, twice a turn, and
// each crossing adds what it shows, so the far side of the disk is seen over the shadow and under it, and nearer the
// shadow again and again, thinner each time: the photon ring. What gets out of the hollow finds the dome (the worlds we
// fell through, lensed round the shadow) or the sky.
//
// p[0..3] camera; p[1].w how far the world has eaten through the glyphs, p[2].w the drain's clock at our 0, p[3].w time (s)
// p[4] the spin axis N, the disk's clock (in M)          p[5] the shaft's axis A, ln r at the drain's mouth
// p[6] across it (X), ln r at the hollow's wall        p[7] the eye's velocity β (static frame), 1/√(1 − 2/r) there
// p[8] a world's width in ln r, the shaft's half-width (stereographic), the walls' twist (rad per e-fold), wildness
// p[9] the disk's peak temperature (K), its inner and outer radius, its light on the walls
// p[10] gain, the dome's edge (rad from A), the sky's light, the drain's throat's half-width (stereographic)
// p[11] the disk's brightness, the camera's white (K), the throat's depth in pool units an e-fold, the pool's yaw
// p[12..14] the sky's frame: a world direction d is cosmos(d.x p12 + d.y p13 + d.z p14); p[12].w, p[13].w where the
//           throat flares into the nave, in ln r

const TAU = 6.2831853;

var<private> A: vec3f;
var<private> B1: vec3f;
var<private> B2: vec3f;
var<private> N: vec3f;
var<private> TOP: f32;
var<private> UW: f32;
var<private> RW: f32;
var<private> BAND: f32;
var<private> HALF: f32;
var<private> TWIST: f32;
var<private> TIME: f32;
var<private> WILD: f32;

fn turn(v: vec2f, a: f32) -> vec2f { return vec2f(cos(a) * v.x - sin(a) * v.y, sin(a) * v.x + cos(a) * v.y); }

// ---- noise ---------------------------------------------------------------------------------------------------------
fn pcg(v: u32) -> u32 {
  let s = v * 747796405u + 2891336453u;
  let w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}
fn hash(i: vec2i) -> f32 { return f32(pcg(u32(i.x) + pcg(u32(i.y))) >> 8u) / 16777216.0; }
// Value noise whose lattice tiles every n cells across x, so it closes round a circle.
fn noise(x: vec2f, n: i32) -> f32 {
  let i = vec2i(floor(x));
  let f = fract(x);
  let w = f * f * (3.0 - 2.0 * f);
  let a = ((i.x % n) + n) % n;
  let b = (a + 1) % n;
  return mix(mix(hash(vec2i(a, i.y)), hash(vec2i(b, i.y)), w.x), mix(hash(vec2i(a, i.y + 1)), hash(vec2i(b, i.y + 1)), w.x), w.y);
}

// ---- the mountain's coordinates ------------------------------------------------------------------------------------
// x as (X, Y, ln r): across the axis, stereographically from A and twisted with depth, and along it; .w is how many
// world units one of these is, here (the projection's conformal factor).
fn lp(x: vec3f) -> vec4f {
  let r = length(x);
  let a = dot(x, A);
  let s = 2.0 / max(r + a, 1e-3 * r);
  let u = log(r);
  let X = turn(vec2f(dot(x, B1), dot(x, B2)) * s, TWIST * (TOP - u));
  return vec4f(X, u, r / (1.0 + 0.25 * dot(X, X)));
}

// ---- the worlds, each in its own units, each leaving its orbit trap -----------------------------------------------
var<private> trap: vec4f;

// The cathedral: Knighty's pseudo-Kleinian, a box fold for a Kleinian group's mirrors and one sphere for its
// inversions, cut by a thin cylinder; its aisle runs along z, which is the shaft.
fn kleinian(q: vec3f) -> f32 {
  let box = vec3f(0.808, 0.808, 1.167);
  var p = vec3f(q.xy, q.z - 4.668 * round(q.z / 4.668));
  var s = 1.0;
  trap = vec4f(1e9);
  let k0 = 0.70968 + 0.04 * sin(0.7 * TIME);
  for (var i = 0; i < 6; i++) {
    p = 2.0 * clamp(p, -box, box) - p;
    let r2 = dot(p, p);
    trap = min(trap, vec4f(abs(p), r2));
    let k = max(k0 / r2, 1.0);
    p *= k;
    s *= k;
  }
  let rxy = length(p.xy);
  return max(rxy - 0.92784, abs(rxy * p.z) / length(p)) / s;
}

// A kaleidoscopic IFS: fold into one of the cube's 48 mirror chambers, turn, scale 3× about a corner; a Menger sponge
// bent by the turns. It tiles space.
fn kifs(q: vec3f) -> f32 {
  var p = q - 2.0 * round(q / 2.0);
  var s = 1.0;
  trap = vec4f(1e9);
  let a = vec2f(0.05 * sin(0.31 * TIME) + 0.12 * WILD, 0.04 * sin(0.23 * TIME + 1.0) + 0.08 * WILD);
  for (var i = 0; i < 6; i++) {
    p = abs(p);
    if (p.x < p.y) { p = p.yxz; }
    if (p.x < p.z) { p = p.zyx; }
    if (p.y < p.z) { p = p.xzy; }
    p = vec3f(turn(p.xy, a.x), p.z);
    p = vec3f(p.x, turn(p.yz, a.y));
    p = 3.0 * p - vec3f(2.0, 2.0, 0.0);
    if (p.z > 1.0) { p.z -= 2.0; }
    s *= 3.0;
    trap = min(trap, vec4f(abs(p), dot(p, p)));
  }
  let b = abs(p) - 1.0;
  return (length(max(b, vec3f(0.0))) + min(max(b.x, max(b.y, b.z)), 0.0)) / s;
}

// A Mandelbox (Lowe): fold the box back on itself, fold the sphere inside out, scale, add the point back. Its vaults,
// mirrored along the shaft every 4.
fn mandelbox(q0: vec3f) -> f32 {
  let q = vec3f(q0.xy, abs(q0.z - 4.0 * round(q0.z / 4.0)));
  var p = q;
  var dr = 1.0;
  let S = -1.6 - 0.15 * sin(0.4 * TIME) - 0.2 * WILD;
  trap = vec4f(1e9);
  for (var i = 0; i < 8; i++) {
    p = clamp(p, vec3f(-1.0), vec3f(1.0)) * 2.0 - p;
    let r2 = dot(p, p);
    trap = min(trap, vec4f(abs(p), r2));
    let k = clamp(1.0 / r2, 1.0, 4.0);
    p = p * k * S + q;
    dr = dr * k * abs(S) + 1.0;
  }
  return (length(p) - 2.0) / abs(dr);
}

// Another of Knighty's pseudo-Kleinians, its box nearly a cube and its sphere wider: not arches now but foam, bubbles in
// bubbles, each found inside the last.
fn foam(q: vec3f) -> f32 {
  let box = vec3f(0.924, 0.908, 0.924);
  var p = vec3f(q.xy, q.z - 3.696 * round(q.z / 3.696));
  var s = 1.0;
  trap = vec4f(1e9);
  let k0 = 1.0 + 0.06 * sin(0.9 * TIME) + 0.08 * WILD;
  for (var i = 0; i < 7; i++) {
    p = 2.0 * clamp(p, -box, box) - p;
    let r2 = dot(p, p);
    trap = min(trap, vec4f(abs(p), r2));
    let k = max(k0 / r2, 1.0);
    p *= k;
    s *= k;
  }
  let rxy = length(p.xy);
  return max(rxy - 0.92784, abs(rxy * p.z) / length(p)) / s;
}

// The shaft's half-width at ln r = z: at its top the drain's own throat (p[10].w), flaring between p[12].w and p[13].w
// into the nave.
fn half(z: f32) -> f32 { return mix(u.p[10].w, HALF, 1.0 - smoothstep(u.p[13].w, u.p[12].w, z)); }

const WORLDS = 5;
const SCALE = array(1.0, 3.2, 1.0, 2.6, 3.6); // each world's units to a unit of the mountain's
// World i's distance in the mountain's units (the shaft kept clear), at Q.
fn world(i: i32, Q: vec3f) -> f32 {
  let k = SCALE[i];
  let P = Q * k;
  var d = -1e3; // the drain's water: solid all round the throat
  switch (i) {
    case 1: { d = kleinian(P); }
    case 2: { d = kifs(P); }
    case 3: { d = mandelbox(P); }
    case 4: { d = foam(P); }
    default: { trap = vec4f(1.0); }
  }
  let rho = length(Q.xy);
  let h = half(Q.z);
  return min(max(d / k, h - rho), 2.4 * h - rho); // the shaft kept clear, and solid rock a little way behind its walls
}
// Which worlds are at ln r = u: the band's world, and how far it has morphed into the next.
fn bands(u: f32) -> vec2f {
  let f = max((TOP - u) / BAND - 0.5, 0.0);
  let i = min(floor(f), f32(WORLDS - 1));
  return vec2f(i, select(smoothstep(0.25, 0.75, f - i), 0.0, i >= f32(WORLDS - 1)));
}

// The mountain at x: a lower bound on the distance to its stone, world units. The hollow, the open sky beside the dome
// and the drain over the mouth bound it cheaply before any world is asked.
fn cap(x: vec3f) -> f32 {
  let r = length(x);
  let th = acos(clamp(dot(x, A) / r, -1.0, 1.0));
  let open = max(RW - r, r * sin(clamp(th - u.p[10].y, -1.5, 1.5)));
  if (open > 0.02 * r) { return open; }
  let L = lp(x);
  let b = bands(L.z);
  let i = i32(b.x);
  var d = world(i, L.xyz);
  if (b.y > 0.0) { d = mix(d, world(i + 1, L.xyz), b.y); }
  d += 0.5 * max(th - u.p[10].y + 0.3, 0.0) + 0.5 * max(UW + 0.3 - L.z, 0.0); // worn away toward its rim and over the hollow
  return max(0.8 * L.w * (1.0 - exp(-max(d, 0.0))) + 0.8 * L.w * min(d, 0.0), open); // r shrinks e-fold for e-fold within the ball
}

// A blackbody at T kelvin, at 630, 532 and 465 nm, as a camera white-balanced to p[11].y sees it.
fn raw(T: f32) -> vec3f {
  let l = vec3f(0.63, 0.532, 0.465);
  return 1.0 / (l * l * l * l * l * (exp(min(14388.0 / (l * max(T, 500.0)), vec3f(60.0))) - 1.0));
}
fn planck(T: f32) -> vec3f { return raw(T) / raw(u.p[11].y); }
const Y = vec3f(0.2290, 0.6917, 0.0793);

// Each world's stone at x (its orbit trap fresh from world()), the light on it, and its glow.
fn paint(i: i32, Q: vec3f) -> vec3f {
  world(i, Q);
  switch (i) {
    case 1: { // slate, gold where the orbit came nearest the inversion's centre
      return mix(vec3f(0.22, 0.3, 0.42), vec3f(2.0, 1.2, 0.35), exp(-30.0 * trap.w)) + vec3f(0.05, 0.3, 0.5) * exp(-300.0 * trap.z);
    }
    case 2: { return mix(vec3f(0.02, 0.45, 0.38), vec3f(1.0, 0.82, 0.55), smoothstep(0.5, 3.0, trap.w)); } // verdigris and bone
    case 3: { return mix(vec3f(1.2, 0.72, 0.22), vec3f(0.08, 0.04, 0.03), smoothstep(0.05, 0.6, trap.w)); } // brass and soot
    case 4: { // ivory shells, rose and blue between
      let c = mix(vec3f(1.2, 0.3, 0.35), vec3f(1.0, 0.86, 0.66), smoothstep(0.0, 0.3, trap.y));
      return mix(c, vec3f(0.25, 0.45, 1.0), smoothstep(0.3, 1.0, trap.w) * 0.6);
    }
    default: { // the drain's water, its foam wound on down the throat, turning faster the further down
      let w = atan2(Q.y, Q.x) / TAU;
      let below = TOP - Q.z;
      let ft = 1.0 - abs(2.0 * noise(vec2f(w * 96.0 - 12.0 * below - 2.0 * TIME, below * 5.0 + TIME * 3.0), 96) - 1.0);
      return vec3f(0.02, 0.03, 0.05) + vec3f(0.6, 0.8, 1.0) * smoothstep(0.8, 0.98, ft);
    }
  }
}

// The drain's throat as wrap.wgsl lights it, carried on down: the pool's threads of foam wound on down its wall, lit
// from the mouth, less the further down. The log-polar map takes the throat's cylinder onto the shaft's top, so its
// depth under the mouth is (TOP − ln r) × hole / half-width (p[11].z), and its angle round, as the pool measures it,
// is the stereographic angle (clockwise, untwisted) plus the pool's yaw as it handed over (p[11].w). Its clock is the
// drain's, p[2].w on from ours.
const AIR = vec3f(0.0008, 0.0016, 0.0032);
fn throat(L: vec4f) -> vec3f {
  let below = (TOP - L.z) * u.p[11].z;
  if (below > 2.5) { return vec3f(0.0); }
  let T = u.p[2].w + TIME;
  let wt = fract((atan2(-L.y, L.x) + TWIST * (TOP - L.z) + u.p[11].w - 14.0 * below - T * 4.0) / TAU);
  let ft = 1.0 - abs(2.0 * noise(vec2f(wt * 160.0, below * 40.0 + T * 10.0), 160) - 1.0);
  let rush = smoothstep(0.75, 0.97, ft) * noise(vec2f(wt * 24.0, below * 6.0 + T * 3.0), 24);
  return (vec3f(0.62, 0.8, 1.0) * 1.1 * 0.05 * rush + AIR * 0.3) * exp(-below / 0.3);
}

fn shade(P: vec3f, rd: vec3f, t: f32, steps: f32) -> vec3f {
  let r = length(P);
  let e = max(0.5 * cone() * t, 1e-4 * r);
  let k = vec2f(1.0, -1.0);
  let n = normalize(k.xyy * cap(P + k.xyy * e) + k.yyx * cap(P + k.yyx * e) + k.yxy * cap(P + k.yxy * e) + k.xxx * cap(P + k.xxx * e));
  let L = lp(P);
  let b = bands(L.z);
  let i = i32(b.x);
  var c = paint(i, L.xyz);
  if (b.y > 0.0) { c = mix(c, paint(i + 1, L.xyz), b.y); }
  let fire = planck(1.15 * u.p[9].x); // the disk's light seen whole, its hot middle brightest
  let lit = u.p[9].w * fire / dot(fire, Y) * (0.15 + 0.85 * abs(dot(P, N)) / r) / (r * r); // as much of it as faces this way
  let toward = -P / r;
  let ao = pow(1.0 - steps / 90.0, 2.0);
  let rim = pow(1.0 - abs(dot(n, rd)), 3.0);
  return c * lit * (max(dot(n, toward), 0.0) + 0.12 * (0.6 + 0.4 * dot(n, toward)) + 0.25 * rim) * ao;
}

// ---- the hole ------------------------------------------------------------------------------------------------------
var<private> OBS: f32; // how much bluer the eye sees what reaches it from far off, along this pixel
// The disk where the backward ray crosses it at x, the photon's angular momentum about N being bz: its light, and how
// much of what is behind it it hides. Its turbulence goes round with its orbits, so their shear winds it into rings.
fn disk(x: vec3f, bz: f32) -> vec4f {
  let r = length(x);
  let RI = u.p[9].y;
  let RO = u.p[9].z;
  if (r < RI || r > RO) { return vec4f(0.0); }
  let om = pow(r, -1.5);
  let g = OBS * sqrt(1.0 - 3.0 / r) / (1.0 + om * bz);
  let T = u.p[9].x / 0.488 * pow(RI / r, 0.75) * pow(1.0 - sqrt(RI / r), 0.25);
  let e1 = normalize(cross(N, A));
  let ph = atan2(dot(x, cross(N, e1)), dot(x, e1)) - om * u.p[4].w;
  let lr = log(r);
  let f = 0.55 * noise(vec2f(ph / TAU * 24.0, lr * 9.0), 24) + 0.3 * noise(vec2f(ph / TAU * 64.0, lr * 31.0), 64) + 0.15 * noise(vec2f(ph / TAU * 160.0, lr * 90.0), 160);
  let edge = smoothstep(RI, RI * 1.12, r) * smoothstep(RO, mix(RI, RO, 0.6), r);
  let a = (1.0 - exp(-7.0 * f * f * edge)) * edge;
  let c = u.p[11].x * planck(g * T) / dot(planck(u.p[9].x), Y);
  return vec4f(c * a, a);
}

// What reached the eye g times bluer than it left: I_ν / ν³ is invariant, so each of the three bands reads what left at
// λg, the spectrum taken as linear in ln λ between them and flat past them, times g³.
fn band(c: vec3f, l: f32) -> f32 {
  if (l <= 6.1420) { return c.b; }
  if (l >= 6.4457) { return c.r; }
  if (l < 6.2766) { return mix(c.b, c.g, (l - 6.1420) / 0.1346); }
  return mix(c.g, c.r, (l - 6.2766) / 0.1691);
}
fn shift(c: vec3f, g: f32) -> vec3f {
  if (abs(g - 1.0) < 0.02) { return c; }
  let l = log(g) + vec3f(6.4457, 6.2766, 6.1420);
  return g * g * g * vec3f(band(c, l.x), band(c, l.y), band(c, l.z));
}

// The sky: the cosmos, and its stars, one to a cell of a cube's grid at a random place in it, as bright as a random
// magnitude, the colour of its own blackbody, a point the width of a pixel.
fn sky(d0: vec3f) -> vec3f {
  let d = normalize(d0.x * u.p[12].xyz + d0.y * u.p[13].xyz + d0.z * u.p[14].xyz);
  let a = abs(d);
  var f = vec3f(d.yz / a.x, select(0.0, 1.0, d.x > 0.0));
  if (a.y > a.x && a.y > a.z) { f = vec3f(d.xz / a.y, select(2.0, 3.0, d.y > 0.0)); }
  else if (a.z > a.x) { f = vec3f(d.xy / a.z, select(4.0, 5.0, d.z > 0.0)); }
  let G = 128.0;
  let g = (f.xy * 0.5 + 0.5) * G;
  let c = vec2i(floor(g));
  let id = vec2i(c.x + i32(f.z) * 1024, c.y);
  let h = hash(id);
  let at = vec2f(c) + 0.25 + 0.5 * vec2f(hash(id + vec2i(7, 3)), hash(id + vec2i(1, 9)));
  let w = cone() * G * 0.6; // a pixel, in cells
  let e = length(g - at) / w;
  let star = 0.5 * pow(h, 60.0) * exp(-2.0 * e * e) / max(w * w, 1.0);
  return u.p[10].z * (cosmos(d) + star * planck(3000.0 + 9000.0 * hash(id + vec2i(5, 5))) / dot(planck(6500.0), Y));
}

// ---- the frame -----------------------------------------------------------------------------------------------------
fn field(q: vec2f) -> vec3f {
  A = u.p[5].xyz;
  B1 = u.p[6].xyz;
  B2 = cross(A, B1);
  N = u.p[4].xyz;
  TOP = u.p[5].w;
  UW = u.p[6].w;
  RW = exp(UW);
  BAND = u.p[8].x;
  HALF = u.p[8].y;
  TWIST = u.p[8].z;
  WILD = u.p[8].w;
  TIME = u.p[3].w;
  // the glyphs, eaten from the middle out
  text = smoothstep(-0.2, 0.2, length(q) - u.p[1].w + 0.25 * noise(q * 5.0 + vec2f(0.0, 3.0 * TIME), 1024));

  let ro = eye();
  var rd = ray(q);
  let px = cone();
  // the eye's own motion: what it sees along rd, the static frame sees along the aberrated d, and bluer by OBS
  let bv = u.p[7].xyz;
  let b = length(bv);
  OBS = u.p[7].w;
  if (b > 1e-4) {
    let bh = bv / b;
    let c = dot(rd, bh);
    let cs = (c - b) / (1.0 - b * c);
    let side = rd - c * bh;
    rd = cs * bh + side * sqrt(max(1.0 - cs * cs, 0.0)) / max(length(side), 1e-6);
    OBS *= (1.0 + b * cs) / sqrt(max(1.0 - b * b, 1e-4));
  }

  var x = ro;
  var t = 0.0;
  var steps = 0.0;
  var col = vec3f(0.0);
  var through = 1.0;
  var inside = length(ro) < RW;
  // Down the shaft, in a straight line: the walls, or the hollow's sphere.
  if (!inside) {
    for (var i = 0; i < 90; i++) {
      let d = cap(x);
      if (d < 1.5 * px * t + 1e-5 * length(x)) { return min(shade(x, rd, t, steps) * u.p[10].x + throat(lp(x)), vec3f(40.0)); }
      let xn = x + rd * d;
      if (length(xn) < RW) {
        let bb = dot(x, rd);
        let s = -bb - sqrt(max(bb * bb - dot(x, x) + RW * RW, 0.0));
        x += rd * s;
        t += s;
        inside = true;
        break;
      }
      x = xn;
      t += d;
      steps += 1.0;
      if (log(length(x)) > TOP + 0.5) { return vec3f(0.0); } // back up the drain
    }
    if (!inside) { return min(shade(x, rd, t, steps) * u.p[10].x, vec3f(40.0)); } // out of steps among the stone
  }

  // In the hollow: the null geodesic, back from the eye. It keeps to the plane of x and v, and there obeys
  // u'' + u = 3u² (u = 1/r, ' = d/dφ), stepped in φ by leapfrog, so the winding round the photon sphere is followed
  // evenly; and it crosses the disk's plane where cos φ (e1·N) + sin φ (e2·N) changes sign, twice a turn.
  let r0 = length(x);
  let e1 = x / r0;
  let al = sqrt(max(1.0 - 2.0 / r0, 1e-4));
  let v0 = rd + (al - 1.0) * dot(rd, e1) * e1;
  let Lv = cross(x, v0);
  let bz = dot(Lv, N) / al;
  let hl = length(Lv);
  var out = dot(v0, e1) > 0.0; // straight in or out: radial
  var d = rd;
  if (hl > 1e-4 * r0) {
    out = false;
    let e2 = cross(Lv / hl, e1);
    var w = 1.0 / r0;
    var wp = -dot(v0, e1) / (r0 * dot(v0, e2));
    let na = dot(e1, N);
    let nb = dot(e2, N);
    let node = atan2(-na, nb);
    var ph = 0.0;
    for (var i = 0; i < 160; i++) {
      if (w > 0.5) { break; }
      if (w < 1.0 / RW && wp < 0.0) { out = true; break; }
      let h = min(0.08, 0.1 * w / max(abs(wp), 1e-6));
      let wh = wp + 0.5 * h * (3.0 * w * w - w);
      let wn = w + h * wh;
      let pc = node + 3.1415927 * ceil((ph - node) / 3.1415927); // the next node at or past φ
      if (pc < ph + h) {
        let uc = mix(w, wn, (pc - ph) / h);
        let e = disk((cos(pc) * e1 + sin(pc) * e2) / uc, bz);
        col += through * e.rgb;
        through *= 1.0 - e.a;
        if (through < 0.02) { break; }
      }
      t += length(vec2f(1.0 / wn - 1.0 / w, h / w));
      w = wn;
      wp = wh + 0.5 * h * (3.0 * w * w - w);
      ph += h;
    }
    let er = cos(ph) * e1 + sin(ph) * e2;
    x = er / w;
    // the way it leaves: dx/dφ, its radial part back in the static frame
    d = normalize(-wp / (w * w * sqrt(max(1.0 - 2.0 * w, 1e-4))) * er + (cos(ph) * e2 - sin(ph) * e1) / w);
  }
  if (out && through >= 0.02) {
    // out of the hollow, in a straight line again: the dome, or the sky
    steps = 0.0;
    var behind = vec3f(0.0);
    var gone = false;
    for (var i = 0; i < 32; i++) { // seen bent round the hole, it is small: coarsely
      let dd = cap(x);
      if (dd < 3.0 * px * t + 1e-5 * length(x)) { break; }
      x += d * dd;
      t += dd;
      steps += 1.0;
      if (length(x) > 8.0 * RW) { gone = true; break; }
    }
    if (!gone) { behind = shift(shade(x, d, t, steps), OBS * sqrt(1.0 - 2.0 / length(x))); }
    else if (dot(d, A) < cos(u.p[10].y)) { behind = shift(sky(d), OBS); }
    col += through * behind;
  }
  return min(col * u.p[10].x, vec3f(40.0)); // a sensor saturates (and a NaN would read as saturated: none may reach here)
}

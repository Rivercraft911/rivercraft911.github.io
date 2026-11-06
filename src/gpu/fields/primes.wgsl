// R2 · The integers wound on a helix inside a tube: integer n sits w = (n/C)^β turns along, at angle 2πw.
// With β = 1 that is C to a turn, and seen end-on every residue class mod C is a spoke; the primes keep
// to the classes prime to C (Dirichlet), so at C = 30 they ride the φ(30) = 8 spokes. As C slides off a
// whole number the spokes wind into spiral arms. At β = ½, C = 1 it is Sacks' winding, turn k holding
// k² to (k + 1)², and the primes fall on the curves of prime-rich quadratics (Euler's n² + n + 41). They
// are read from a sieve packed on the wheel of 30: a byte for every 30 integers, a bit for each residue
// prime to 30.
//
// p[0] eye, 1/tan(fov/2)   p[1] right, tube radius   p[2] up, C   p[3] forward, turn length
// p[4] gain, how far the primes have inflated into bubbles, C/φ(C) near a whole C (else 0), that whole C
// p[5] β

const TAU = 6.2831853;
const WHEEL = 0x208A2882u; // bits 1 7 11 13 17 19 23 29: the residues prime to 30

fn prime(n: i32) -> bool {
  if (n < 7) { return n == 2 || n == 3 || n == 5; }
  let r = u32(n % 30);
  if (((WHEEL >> r) & 1u) == 0u) { return false; }
  let k = n / 30;
  let size = vec2i(textureDimensions(data));
  if (k >= size.x * size.y) { return false; }
  let byte = u32(textureLoad(data, vec2i(k % size.x, k / size.x), 0).r * 255.0 + 0.5);
  return ((byte >> countOneBits(WHEEL & ((1u << r) - 1u))) & 1u) == 1u;
}

fn gcd(a0: i32, b0: i32) -> i32 {
  var a = a0;
  var b = b0;
  for (var i = 0; i < 16 && b != 0; i++) { let t = a % b; a = b; b = t; }
  return a;
}

fn hash1(n: f32) -> f32 { return fract(sin(n * 12.9898) * 43758.547); }

const INDIGO = vec3f(0.0025, 0.0012, 0.014);
const COMPOSITE = vec3f(0.035, 0.018, 0.17);
const HOT = vec3f(2.6, 2.1, 1.6);
const TWIN = vec3f(0.25, 1.5, 2.4);

fn field(q: vec2f) -> vec3f {
  let eye = u.p[0].xyz;
  let dir = u.p[3].xyz * u.p[0].w + u.p[1].xyz * q.x + u.p[2].xyz * q.y;
  let R = u.p[1].w;
  let C = u.p[2].w;
  let L = u.p[3].w;
  // where the ray meets the tube's wall x² + y² = R², from inside: the far root, in its stable form
  let a = max(dot(dir.xy, dir.xy), 1e-12);
  let b = dot(eye.xy, dir.xy);
  let c = dot(eye.xy, eye.xy) - R * R;
  let disc = sqrt(max(b * b - a * c, 0.0));
  let P = eye + dir * select((-b + disc) / a, -c / (b + disc), b > 0.0);
  let th = atan2(P.y, P.x);
  // a pixel's footprint on the wall: across (arc) and along (z)
  let fa = length(fwidth(P.xy)) + 1e-5;
  let fz = abs(fwidth(P.z)) + 1e-5;

  // How far apart neighbours lie along the winding here: dw/dn = β (n/C)^(β−1) / C, as arc.
  let beta = u.p[5].x;
  let turns = P.z / L - th / TAU;
  let wp = max(P.z / L, 0.05);
  let arc = TAU * R * beta * pow(wp, 1.0 - 1.0 / beta) / C;
  let rd = 0.3 * min(arc, L);
  let s0 = 0.42 * rd;
  let sa = sqrt(s0 * s0 + fa * fa);
  let sz = sqrt(s0 * s0 + fz * fz);
  let norm = s0 * s0 / (sa * sz); // a dot smeared over the footprint keeps its light
  let dim = clamp(arc / 0.2, 0.15, 1.0); // the composites recede as the turns fill
  // inflated, a prime swells toward the next turn and is a bubble
  let rb = mix(rd, 0.42 * L, u.p[4].y);
  let reach = i32(clamp(ceil(rb / arc - 0.5), 0.0, 6.0));

  let k0 = round(turns);
  var light = vec3f(0.0);
  var bubble = vec3f(0.0);
  var near = 0;
  for (var j = -1; j <= 1; j++) {
    let k = k0 + f32(j);
    let w = th / TAU + k;
    let nr = C * pow(max(w, 0.0), 1.0 / beta);
    if (w <= 0.0 || nr > 1.9e6) { continue; }
    for (var i = -reach; i <= 1 + reach; i++) {
      let m = floor(nr) + f32(i);
      if (m < 1.0) { continue; }
      let wm = pow(m / C, beta);
      var dth = TAU * (w - wm);
      dth -= TAU * round(dth / TAU);
      let dx = R * dth;
      let dz = P.z - L * wm;
      let n = i32(m);
      if (j == 0 && abs(m - nr) < 1.0) { near = n; }
      var col = COMPOSITE * dim;
      if (prime(n)) {
        col = select(HOT, TWIN, prime(n - 2) || prime(n + 2));
        // thin-film colour over a sphere's face, thickness its own
        let r = length(vec2f(dx, dz)) / rb;
        if (r < 1.0) {
          let cz = sqrt(1.0 - r * r);
          let edge = smoothstep(1.0, 1.0 - max(fa, fz) / rb - 0.03, r);
          bubble = max(bubble, edge * (9.0 * film(200.0 + 800.0 * hash1(m), cz) + 0.25 * pow(1.0 - cz, 3.0) * vec3f(0.5, 0.6, 1.0)));
        }
      }
      light += col * norm * exp(-0.5 * (dx * dx / (sa * sa) + dz * dz / (sz * sz)));
    }
  }
  // Past what a pixel resolves, the mean: primes thin out as 1/ln n, and keep to the classes prime to C.
  var spoke = 1.0;
  let Ci = i32(u.p[4].w);
  if (Ci > 0) {
    let on = select(0.0, u.p[4].z, gcd(near % Ci, Ci) == 1);
    spoke = mix(on, 1.0, smoothstep(0.3 * arc, arc, fa));
  }
  let mean = HOT * (TAU * s0 * s0 / (arc * L)) * spoke / log(max(C * pow(wp, 1.0 / beta), 3.0));
  light = mix(mean, light, exp(-0.5 * max(fz / L, fa / arc)));
  // the helix itself, faint, so the winding shows
  let strand = (turns - k0) * L;
  let w = max(0.0035, fz);
  light += INDIGO * (1.0 + 4.0 * exp(-0.5 * strand * strand / (w * w)) * 0.0035 / w);
  light = mix(light, bubble + 0.2 * light, u.p[4].y);
  // nothing before 1: the tube's mouth
  return light * u.p[4].x * smoothstep(-0.2, 0.3, P.z);
}

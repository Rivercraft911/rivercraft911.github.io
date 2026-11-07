// The whirlpool. The waterfall plot is a sheet: nine octaves of log-frequency across, the soundtrack's
// history along it, newest at the lip. It curls conformally, z ↦ (e^{cz} − 1)/c: c → 0 is the flat plot,
// and at c = 2π / (nine octaves) the sheet closes into a disc, the lip its rim, angle for log-frequency and
// log-radius for age, so the rows run inward at the rate the choir falls. Then it spins up into a Scully
// vortex: u_θ = Γr / 2π(r² + r_c²), which ties its free surface to z = −Γ² / 8π²g(r² + r_c²) (the Rankine
// −Γ²/8π²gr² outside the core, a bowl within), and with the Burgers inflow u_r = −βr each parcel has turned
// Φ(r) = (K/2) ln((1 + r_c²/r²) / (1 + r_c²/R²)) since it crossed the rim at R, K = Γ / 2πβr_c². Inside the
// core that is K radians every e-fold: a log spiral, the same at every scale, an endless zoom.
//
// p[0..3] camera, and p[1].w how far the water has spun up        p[4] curl, lip y, 80 Hz's angle, 80 Hz to 8 kHz's angle
// p[5] head row (ring), rows per unit of sheet, rows printed, gain   p[6] black lift, reference offset, depth H, core r_c
// p[7] winding K, rim R, 80 Hz and 8 kHz's span on the rows

const TAU = 6.2831853;
const DB = 56.0 * 0.33219281; // the rows' range, 56 dB, in doublings of power
const ROWS = 4096.0;

// A row's level is dB over the floor, in 16 bits as two bytes (filtering is linear, so it filters them
// apart and they add back exactly); power and back again, with the floor as zero.
fn at(t: vec2f) -> f32 { return dot(textureSampleLevel(data, smp, t, 0.0).rg, vec2f(65280.0, 255.0) / 65535.0); }
fn power(s: f32) -> f32 { return exp2(DB * clamp(s - u.p[6].y, 0.0, 1.0)) - 1.0; }
fn level(p: f32) -> f32 { return log2(1.0 + p) / DB; }

// Black through blue and cyan to gold and white: the waterfall's palette, in linear light.
fn palette(s: f32) -> vec3f {
  var c = array(vec3f(0.0), vec3f(0.0, 0.004, 0.03), vec3f(0.0, 0.03, 0.16), vec3f(0.0, 0.22, 0.34),
                vec3f(0.85, 0.45, 0.04), vec3f(2.0, 1.75, 1.4));
  let x = clamp(s, 0.0, 1.0) * 5.0;
  let i = min(u32(x), 4u);
  return mix(c[i], c[i + 1u], x - f32(i));
}

fn wrap(i: vec2f, n: vec2f) -> vec2f { return i - n * floor(i / n); }
fn hash(p: vec2f) -> f32 { return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.547); }
// Value noise on a lattice that tiles every n cells, so it is seamless round the disc and round the ring.
fn noise(x: vec2f, n: vec2f) -> f32 {
  let i = floor(x);
  let f = x - i;
  let w = f * f * (3.0 - 2.0 * f);
  let a = hash(wrap(i, n));
  let b = hash(wrap(i + vec2f(1.0, 0.0), n));
  let c = hash(wrap(i + vec2f(0.0, 1.0), n));
  let d = hash(wrap(i + 1.0, n));
  return mix(mix(a, b, w.x), mix(c, d, w.x), w.y);
}

// The night the water mirrors: a low moon, and a sky only just lighter than black, palest at the horizon.
const MOON = vec3f(-0.42, 0.55, 0.72);
fn sky(r: vec3f) -> vec3f {
  let m = max(dot(r, normalize(MOON)), 0.0);
  return mix(vec3f(0.02, 0.05, 0.07), vec3f(0.002, 0.004, 0.012), sqrt(max(r.z, 0.0))) + vec3f(1.0, 0.86, 0.66) * (12.0 * pow(m, 3000.0) + 0.02 * pow(m, 30.0));
}

fn field(q: vec2f) -> vec3f {
  let ro = eye();
  let rd = ray(q);
  let c = u.p[4].x;
  let C = vec2f(0.0, u.p[4].y - 1.0 / c); // the drain
  let H = u.p[6].z;
  let k = u.p[6].w * u.p[6].w;

  // Down to the surface: Newton on the height above it, with the step shortened by the wall's slope, so
  // it slides down the funnel without passing through. Never breaking off keeps the derivatives below.
  var t = select(0.0, ro.z / -rd.z, ro.z > 0.0 && rd.z < 0.0);
  for (var i = 0; i < 40; i++) {
    let p = ro + rd * t;
    let d = p.xy - C;
    let r2 = dot(d, d);
    let g = p.z + H * k / (r2 + k);
    let slope = 2.0 * H * k * sqrt(r2) / ((r2 + k) * (r2 + k));
    t = clamp(t + 0.9 * g / (abs(rd.z) + 1.5 * slope * length(rd.xy) + 1e-3), 0.0, 60.0);
  }
  let P = ro + rd * t;
  let d = P.xy - C;
  let r2 = max(dot(d, d), 1e-12);
  let rho = sqrt(r2);
  let depth = H * k / (r2 + k);
  let miss = P.z + depth > 1e-3 * (1.0 + t);

  // Where on the sheet: angle round the drain, less the turn the water has made since the rim, is
  // frequency; log-radius is age, in rows behind the head.
  let K = u.p[7].x;
  let R = u.p[7].y;
  let A = u.p[4].w;
  let a = atan2(d.x, d.y) - 0.5 * K * log((1.0 + k / r2) / (1.0 + k / (R * R))) - u.p[4].z;
  let b = (a - TAU * floor(a / TAU)) / A; // across the nine octaves, 0..1; beyond 1 the sheet is not there
  // Water older than the sheet carries the oldest row on down to the drain.
  let oldest = min(u.p[5].z, ROWS - 8.0);
  let rows = log(c * rho) / c * u.p[5].y; // ≤ 0 behind the lip
  let ring = u.p[5].x + rows;
  let row = u.p[5].x + max(rows, -oldest);

  // A pixel's footprint, in bins and rows: how far it reaches across the spiral and down it.
  let dPx = dpdx(P);
  let dPy = dpdy(P);
  let turn = -K * k / (rho * (r2 + k)); // dΦ/dr
  let fa = vec2f(d.y * dPx.x - d.x * dPx.y, d.y * dPy.x - d.x * dPy.y) / r2 - turn * vec2f(dot(d, dPx.xy), dot(d, dPy.xy)) / rho;
  let fr = vec2f(dot(d, dPx.xy), dot(d, dPy.xy)) / (rho * c * rho) * u.p[5].y;
  let size = vec2f(textureDimensions(data));
  let fx = min(max(abs(fa.x), abs(fa.y)) / A * u.p[7].w * size.x, 64.0);
  let fy = min(max(abs(fr.x), abs(fr.y)), 256.0);

  // The rows' power over that footprint, taps dithered per pixel so a few of them read as grain.
  let e = fract(52.9829189 * fract(dot(q / u.px, vec2f(0.06711056, 0.00583715))));
  let ny = i32(clamp(ceil(fy * 0.5), 1.0, 4.0));
  let nx = i32(clamp(ceil(fx * 0.5), 1.0, 3.0));
  var pw = 0.0;
  for (var j = 0; j < ny; j++) {
    let v = (row + 0.5 + ((f32(j) + e) / f32(ny) - 0.5) * fy) / size.y;
    for (var i = 0; i < nx; i++) {
      pw += power(at(vec2f(u.p[7].z + b * u.p[7].w + ((f32(i) + e) / f32(nx) - 0.5) * fx / size.x, v)));
    }
  }
  pw /= f32(nx * ny);
  let sheet = select(0.0, 1.0, b < 1.0 && rows <= 0.0 && !miss);
  let lv = (level(pw) * (1.0 - u.p[6].x) + u.p[6].x) * sheet;

  // Foam and ripples in the water's own coordinates (the angle it entered at, the row it entered with), so
  // they ride the spiral in and wind up with it. Lace where the spectrum is loud, ripples everywhere, each
  // let go where it would be finer than a pixel.
  let wet = u.p[1].w;
  let fine = vec2f(fx, fy);
  let lace = 1.0 - abs(2.0 * noise(vec2f(b * 384.0, ring / 192.0), vec2f(384.0, ROWS / 192.0)) - 1.0);
  let clump = noise(vec2f(b * 48.0, ring / 192.0), vec2f(48.0, ROWS / 192.0));
  let foam = smoothstep(0.93, 0.995, lace) * smoothstep(0.35, 0.75, clump + 0.5 * lv) * (0.2 + 0.8 * smoothstep(0.1, 0.6, lv)) * wet * (1.0 - smoothstep(-20.0, 20.0, rows)) * (1.0 - smoothstep(4.0, 24.0, fine.x + fine.y / 4.0));
  let ripple = noise(vec2f(b * 768.0, ring / 6.0), vec2f(768.0, ROWS / 6.0)) * (1.0 - smoothstep(1.0, 6.0, fine.x + fine.y));

  // The surface's normal from the vortex, roughened by the ripples and the foam.
  let gh = 2.0 * H * k / ((r2 + k) * (r2 + k)) * d;
  let n0 = normalize(vec3f(-gh, 1.0));
  let bump = 0.003 * wet * (ripple + foam);
  let bx = dpdx(bump);
  let by = dpdy(bump);
  let s1 = cross(dPy, n0);
  let s2 = cross(n0, dPx);
  let det = dot(dPx, s1);
  let n = normalize(abs(det) * n0 - sign(det) * (bx * s1 + by * s2) + 1e-9);

  // Water: the night mirrored at grazing angles (Schlick, n = 1.33), the dyed water seen into elsewhere,
  // and the light failing with depth toward the eye.
  let cosi = clamp(dot(-rd, n), 0.0, 1.0);
  let fres = 0.02 + 0.98 * pow(1.0 - cosi, 5.0);
  let dark = exp(-1.8 * depth);
  let hot = 1.0 + 0.3 * exp(rows / 40.0);
  let dye = palette(lv * hot) * (1.0 - wet * fres) * mix(1.0, dark, wet);
  let body = vec3f(0.0, 0.004, 0.008) * wet * dark * (1.0 - fres);
  let lit = vec3f(0.3, 0.4, 0.5) * foam * (0.15 + 0.85 * max(dot(n, normalize(MOON)), 0.0)) * dark;
  let mirror = sky(reflect(rd, n)) * fres * wet * (0.3 + 0.7 * dark);
  return select(dye + body + lit + mirror, sky(rd) * wet, miss) * u.p[5].w;
}

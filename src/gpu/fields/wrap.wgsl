// The whirlpool. The falls land in a plunge pool on a ring of radius R round the drain, their lanes, 80 Hz
// to 8 kHz of log-frequency, on the half of it under the curtain, and the other half mirrors them, so the
// spectrum meets itself at both ends and the water carries it all the way round. It turns as a Scully
// vortex: u_θ = Γr / 2π(r² + r_c²), which ties its free surface to z = −Γ² / 8π²g(r² + r_c²) (the Rankine
// −Γ²/8π²gr² outside the core, a bowl within), and with the Burgers inflow u_r = −βr each parcel has turned
// Φ(r) = (K/2) ln((1 + r_c²/r²) / (1 + r_c²/R²)) since it landed at R, K = Γ / 2πβr_c², and has aged
// ln(R/r)/β: log-radius is age. Inside the core that is K radians every e-fold: a log spiral, the same at
// every scale, an endless zoom. At its bottom the drain opens onto Indra's pearls (pearls.wgsl), a world
// below the water at another scale, and read out as text the water gives way to glyphs and back again.
//
// p[0..3] camera; p[1].w how far the water has spun up, p[3].w the drain's radius
// p[4] R, 80 Hz's angle, the lanes' arc, gain     p[5] head row (ring), rows an e-fold in, rows printed, rows the falls take
// p[6] the landing's foam, reference offset, depth H, core r_c      p[7] winding K, -, 80 Hz and 8 kHz's span on the rows
// p[8] the pearls' world: scale, cos and sin of its turn, the height it hangs from    p[9] its a, b, iterations, film drift
// p[10] its z₋, z₋ − z₊      p[11] its H and fog; how far the text has spread (0..1.3), and how far the world has eaten it back (0..1.1)

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

// The funnel's slope at r: the free surface's dz/dr.
fn wall(r: f32, H: f32, k: f32) -> f32 { return 2.0 * H * k * r / ((r * r + k) * (r * r + k)); }

fn wrap(i: vec2f, n: vec2f) -> vec2f { return i - n * floor(i / n); }
fn hash(p: vec2f) -> f32 { return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.547); }
// Value noise on a lattice that tiles every n cells, so it is seamless round the pool and round the ring.
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
  return mix(vec3f(0.005, 0.012, 0.018), vec3f(0.001, 0.002, 0.006), sqrt(max(r.z, 0.0))) + vec3f(1.0, 0.86, 0.66) * (12.0 * pow(m, 3000.0) + 0.004 * pow(m, 30.0));
}

// Down the drain: the ray goes on into the pearls' world, which hangs below it scaled up and turned, from
// where it crossed the drain (t) on.
fn drain(ro: vec3f, rd: vec3f, t: f32) -> vec3f {
  let s = u.p[8];
  let o = ro - vec3f(0.0, 0.0, s.w);
  let turn = mat2x2f(s.y, s.z, -s.z, s.y);
  return dive(vec3f(turn * o.xy, o.z) * s.x, vec3f(turn * rd.xy, rd.z), t * s.x, cone(), u.p[11].x, u.p[11].y, u.p[9].w,
              u.p[9].x, u.p[9].y, i32(u.p[9].z), u.p[10]);
}

// Read out as text, the glyphs spread like an infection: from a few seeds, fingering along the water's own
// grain (flow: where on the water, in its coordinates) so the tendrils wind in with the spiral; then the
// world below eats back through them, brightest first. A cell turns when its time comes, and the front burns.
fn fbm(x: vec2f) -> f32 {
  var s = 0.0;
  var y = x;
  for (var i = 0; i < 4; i++) { s += exp2(-f32(i + 1)) * noise(y, vec2f(65536.0)); y = 2.03 * y + 17.0; }
  return s;
}
fn vein(x: vec2f) -> f32 { return abs(2.0 * fbm(x) - 1.0); } // 0 along branching curves
fn infect(q: vec2f, flow: vec2f, c: vec3f) -> vec3f {
  let near = min(min(length(q - vec2f(-1.1, 0.6)), length(q - vec2f(1.3, -0.5))), length(q - vec2f(0.2, 0.9)));
  let come = 0.4 * near / 1.6 + 0.6 * vein(flow);
  let go = 0.3 * length(q) / 1.8 + 0.5 * vein(4.0 * q + 3.0) + 0.2 * exp(-12.0 * dot(c, vec3f(0.23, 0.69, 0.08)));
  let pi = u.p[11].z - come; // how long ago it was taken, and given back
  let po = u.p[11].w - go;
  text = step(0.0, pi) * step(po, 0.0);
  // the fronts burn: the newest glyphs, and the world just broken through
  let edge = select(0.0, exp(-pi / 0.05), pi >= 0.0 && u.p[11].z < 1.3) + select(0.0, exp(-po / 0.05), po >= 0.0 && u.p[11].w < 1.1);
  return c + edge * (3.0 * c + vec3f(0.25, 0.1, 0.02));
}

fn field(q: vec2f) -> vec3f {
  let ro = eye();
  let rd = ray(q);
  let H = u.p[6].z;
  let k = u.p[6].w * u.p[6].w;
  let hole = u.p[3].w;
  let lid = -H * k / (hole * hole + k); // the drain's mouth
  if (ro.z < lid) { return infect(q, 4.0 * q, drain(ro, rd, 0.0)) * u.p[4].w; } // through it

  // Down to the surface: Newton on the height above it, each step shortened by the steepest the wall gets
  // along it (the slope 2Hk r / (r² + k)² falls off outside its peak at r_c/√3, so that is where the step
  // comes nearest the axis), so it slides down the funnel and across its throat without passing through,
  // and never creeps along a lip it grazes. Never breaking off keeps the derivatives below.
  var t = select(0.0, ro.z / -rd.z, ro.z > 0.0 && rd.z < 0.0);
  let lat = max(length(rd.xy), 1e-6);
  let peak = u.p[6].w * 0.57735;
  for (var i = 0; i < 48; i++) {
    let p = ro + rd * t;
    let r2 = dot(p.xy, p.xy);
    let g = p.z + H * k / (r2 + k);
    var dt = 0.9 * g / (abs(rd.z) + wall(max(sqrt(r2), peak), H, k) * lat + 1e-3);
    if (g > 0.0) {
      let near = length(p.xy + rd.xy * clamp(-dot(p.xy, rd.xy) / (lat * lat), 0.0, dt));
      dt = max(0.9 * g / (abs(rd.z) + wall(max(near, peak), H, k) * lat + 1e-3), 2e-3 * (1.0 + t));
    }
    t = clamp(t + dt, 0.0, 60.0);
  }
  let P = ro + rd * t;
  let d = P.xy;
  let r2 = max(dot(d, d), 1e-12);
  let rho = sqrt(r2);
  let depth = H * k / (r2 + k);
  let miss = P.z + depth > 1e-3 * (1.0 + t);
  let down = !miss && rho < hole && rd.z < 0.0; // into the drain's mouth (decided here, drawn last: the derivatives below need every pixel)

  // Where on the spectrum: angle round the drain, less the turn the water has made since it landed, is
  // frequency, mirrored on the far half; log-radius is age, in rows behind the head.
  let K = u.p[7].x;
  let R = u.p[4].x;
  let a = atan2(d.x, d.y) - 0.5 * K * log((1.0 + k / r2) / (1.0 + k / (R * R))) - u.p[4].y;
  let w = (a - TAU * floor(a / TAU)) / TAU; // round the pool, 0..1, for the water's own texture
  let b0 = w * TAU / u.p[4].z;
  let b = select(b0, 2.0 - b0, b0 > 1.0);
  let oldest = min(u.p[5].z, ROWS - 8.0);
  let rows = log(rho / R) * u.p[5].y - u.p[5].w; // behind the head; outside the ring, as it lands
  let ring = u.p[5].x + rows;
  let row = u.p[5].x + clamp(rows, -oldest, 0.0);

  // A pixel's footprint, in bins and rows: how far it reaches across the spiral and down it.
  let dPx = dpdx(P);
  let dPy = dpdy(P);
  let turn = -K * k / (rho * (r2 + k)); // dΦ/dr
  let fa = vec2f(d.y * dPx.x - d.x * dPx.y, d.y * dPy.x - d.x * dPy.y) / r2 - turn * vec2f(dot(d, dPx.xy), dot(d, dPy.xy)) / rho;
  let fr = vec2f(dot(d, dPx.xy), dot(d, dPy.xy)) / r2 * u.p[5].y;
  let size = vec2f(textureDimensions(data));
  let fx = min(max(abs(fa.x), abs(fa.y)) / u.p[4].z * u.p[7].w * size.x, 64.0);
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
  let lv = select(level(pw), 0.0, miss);

  // Foam and ripples in the water's own coordinates (the angle it landed at, the row it landed with), so
  // they ride the spiral in and wind up with it. Lace where the spectrum is loud, ripples everywhere, each
  // let go where it would be finer than a pixel; and white water where the falls land.
  let wet = u.p[1].w;
  let fine = vec2f(fx, fy);
  let lace = 1.0 - abs(2.0 * noise(vec2f(w * 768.0, ring / 192.0), vec2f(768.0, ROWS / 192.0)) - 1.0);
  let clump = noise(vec2f(w * 96.0, ring / 192.0), vec2f(96.0, ROWS / 192.0));
  let land = u.p[6].x * exp(-pow((rows + u.p[5].w) / 12.0, 2.0)) * step(b0, 1.0); // the ring the falls land on
  let foam = (smoothstep(0.96, 0.998, lace) * smoothstep(0.5, 0.9, clump + 0.5 * lv) * smoothstep(0.15, 0.6, lv) * wet + land * smoothstep(0.5, 0.9, lace + 0.4 * clump)) * (1.0 - smoothstep(4.0, 24.0, fine.x + fine.y / 4.0));
  let ripple = noise(vec2f(w * 1536.0, ring / 6.0), vec2f(1536.0, ROWS / 6.0)) * (1.0 - smoothstep(1.0, 6.0, fine.x + fine.y));

  // The surface's normal from the vortex, roughened by the ripples and the foam.
  let gh = 2.0 * H * k / ((r2 + k) * (r2 + k)) * d;
  let n0 = normalize(vec3f(-gh, 1.0));
  let bump = 0.001 * (0.3 + 0.7 * wet) * (ripple + foam);
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
  let dye = palette(lv) * (1.0 - fres) * dark;
  let body = vec3f(0.0, 0.004, 0.008) * dark * (1.0 - fres);
  let lit = vec3f(0.3, 0.4, 0.5) * foam * (0.15 + 0.85 * max(dot(n, normalize(MOON)), 0.0)) * dark;
  let mirror = sky(reflect(rd, n)) * fres * (0.3 + 0.7 * dark);
  var c = select(dye + body + lit + mirror, sky(rd), miss);
  if (down) { c = drain(ro, rd, (lid - ro.z) / rd.z); }
  return infect(q, select(vec2f(w * 48.0, ring / 96.0), 4.0 * q, down || miss), c) * u.p[4].w;
}

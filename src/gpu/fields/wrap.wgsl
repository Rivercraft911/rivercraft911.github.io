// The shaft and its whirlpool. The river goes over the rim of a round shaft (radius RIM, HF deep) all the
// way round, and lands in the pool at its foot on a ring of radius R round the drain: 80 Hz to 8 kHz of
// log-frequency round one half of it, mirrored on the other, so the spectrum meets itself at both ends. The
// pool turns as a Scully vortex: u_θ = Γr / 2π(r² + r_c²), which ties its free surface to
// z = −Γ² / 8π²g(r² + r_c²) (the Rankine −Γ²/8π²gr² outside the core, a bowl within), and with the Burgers
// inflow u_r = −βr each parcel has turned Φ(r) = (K/2) ln((1 + r_c²/r²) / (1 + r_c²/R²)) since it landed at
// R, K = Γ / 2πβr_c², and has aged ln(R/r)/β: log-radius is age. Inside the core that is K radians every
// e-fold: a log spiral, the same at every scale. The water is dyed with the spectrum it fell with, frequency
// its hue; it mirrors the curtain falling round it (drops.wgsl draws the drops themselves), mist stands
// where that lands, and the rock behind is lit by it. At the bottom the drain opens, dark. Read out as text
// the water gives way to glyphs.
//
// p[0..3] camera; p[1].w how far the water has spun up, p[3].w the drain's radius
// p[4] R, 80 Hz's angle, the lanes' arc, gain     p[5] head row (ring), rows an e-fold in, rows printed, rows the falls take
// p[6] the landing's foam, reference offset, depth H, core r_c      p[7] winding K, water to plot, 80 Hz and 8 kHz's span on the rows
// p[8] the rim's radius and height, the rock's light, the mist      p[11] -, -, how far the text has spread (0..1.3), how dark the drain has drawn all (0..1)

const TAU = 6.2831853;
const DB = 56.0 * 0.33219281; // the rows' range, 56 dB, in doublings of power
const ROWS = 4096.0;

// A row's level is dB over the floor, in 16 bits as two bytes (filtering is linear, so it filters them
// apart and they add back exactly); power and back again, with the floor as zero.
fn at(t: vec2f) -> f32 { return dot(textureSampleLevel(data, smp, t, 0.0).rg, vec2f(65280.0, 255.0) / 65535.0); }
fn power(s: f32) -> f32 { return exp2(DB * clamp(s - u.p[6].y, 0.0, 1.0)) - 1.0; }
fn level(p: f32) -> f32 { return log2(1.0 + p) / DB; }

// Frequency as colour, the way a prism would lay the band out (drops.wgsl has the same): 80 Hz ember red,
// through gold and green, to 8 kHz violet.
fn hue(b: f32) -> vec3f {
  var c = array(vec3f(1.0, 0.05, 0.02), vec3f(1.0, 0.28, 0.02), vec3f(1.0, 0.7, 0.08), vec3f(0.2, 1.0, 0.3),
                vec3f(0.03, 0.75, 1.0), vec3f(0.12, 0.25, 1.0), vec3f(0.55, 0.12, 1.0));
  let x = clamp(b, 0.0, 1.0) * 6.0;
  let i = min(u32(x), 5u);
  return mix(c[i], c[i + 1u], x - f32(i));
}
// What water carrying level lv in lane b sends out: blue-white and foaming while it is water, its own hue once it is the plot.
fn hot(lv: f32) -> f32 { return pow(min(lv / 0.8, 1.25), 4.0); } // a display's contrast: 10 dB under the loudest is a third of it
fn glow(b: f32, lv: f32) -> vec3f {
  let l3 = hot(lv);
  let water = vec3f(0.5, 0.74, 1.0) * 0.06 + vec3f(0.9, 0.97, 1.0) * 0.12 * l3;
  let dye = hue(b) * (0.012 + 2.6 * l3) + vec3f(1.0, 0.95, 0.9) * 1.5 * pow(max(lv - 0.8, 0.0) / 0.2, 2.0);
  return mix(water, dye, u.p[7].y);
}

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

// The lane at angle th round the shaft (from downstream toward +x), 0..1, mirrored on the far half.
fn lane(th: f32) -> f32 {
  let b0 = fract((th - u.p[4].y) / TAU) * TAU / u.p[4].z;
  return select(b0, 2.0 - b0, b0 > 1.0);
}
// The curtain's light at angle th, height z: the water that went over √(1 − z/HF) of the fall ago.
fn curtain(th: f32, z: f32) -> vec3f {
  let b = lane(th);
  let f = sqrt(clamp(1.0 - z / u.p[8].y, 0.0, 1.0));
  let v = (u.p[5].x - u.p[5].w * f + 0.5) / ROWS;
  let x = u.p[7].z + b * u.p[7].w;
  let s = 0.5 * at(vec2f(x, v)) + 0.25 * (at(vec2f(x - 0.004, v)) + at(vec2f(x + 0.004, v)));
  return glow(b, clamp(s - u.p[6].y, 0.0, 1.0));
}

// The night over the shaft: a low moon, and a sky only just lighter than black.
const MOON = vec3f(-0.42, 0.55, 0.72);
fn sky(r: vec3f) -> vec3f {
  let m = max(dot(r, normalize(MOON)), 0.0);
  return mix(vec3f(0.006, 0.012, 0.02), vec3f(0.001, 0.002, 0.007), sqrt(max(r.z, 0.0))) + vec3f(1.0, 0.9, 0.75) * (6.0 * pow(m, 4000.0) + 0.0015 * pow(m, 40.0));
}
// How far along (o, d) the shaft's wall of radius r is, from inside it.
fn shaft(o: vec3f, d: vec3f, r: f32) -> f32 {
  let a = max(dot(d.xy, d.xy), 1e-9);
  let b = dot(o.xy, d.xy);
  return (-b + sqrt(max(b * b - a * (dot(o.xy, o.xy) - r * r), 0.0))) / a;
}
// The rock behind the falls: strata, wet, lit by the water falling in front of it.
fn rock(P: vec3f) -> vec3f {
  let th = atan2(P.x, P.y);
  let w = fract(th / TAU);
  let bed = noise(vec2f(w * 24.0, P.z * 9.0 + 3.0 * noise(vec2f(w * 96.0, P.z * 3.0), vec2f(96.0, 64.0))), vec2f(24.0, 64.0));
  let joint = smoothstep(0.75, 1.0, noise(vec2f(w * 320.0, P.z * 2.0), vec2f(320.0, 64.0)));
  let ledge = smoothstep(0.5, 0.56, fract(P.z * 5.0 + 2.0 * bed));
  let stone = (0.25 + 0.75 * bed) * (1.0 - 0.6 * joint) * (0.7 + 0.3 * ledge);
  return stone * (vec3f(0.004, 0.006, 0.009) + 0.11 * curtain(th, P.z)) * u.p[8].z;
}
// What the water mirrors along r from P: the curtain round it, the rock above that, the sky over the rim.
fn mirrored(P: vec3f, r: vec3f) -> vec3f {
  let HF = u.p[8].y;
  let t1 = shaft(P, r, u.p[8].x);
  let z1 = P.z + r.z * t1;
  if (z1 > HF) { return sky(r); }
  let f = sqrt(clamp(1.0 - z1 / HF, 0.0, 1.0));
  let Q = P + r * shaft(P, r, mix(u.p[8].x, u.p[4].x, f)); // where the curtain hangs at that height
  return 0.7 * curtain(atan2(Q.x, Q.y), Q.z) + rock(P + r * t1);
}

// Read out as text, the glyphs spread like an infection: from a few seeds, fingering along the water's own
// grain (flow: where on the water, in its coordinates) so the tendrils wind in with the spiral. A cell
// turns when its time comes, and the front burns.
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
  let pi = u.p[11].z - come; // how long ago it was taken
  text = step(0.0, pi);
  let edge = select(0.0, exp(-pi / 0.05), pi >= 0.0 && u.p[11].z < 1.3); // the front burns: the newest glyphs
  return c * (1.0 + 3.0 * edge);
}

fn field(q: vec2f) -> vec3f {
  let ro = eye();
  let rd = ray(q);
  let H = u.p[6].z;
  let k = u.p[6].w * u.p[6].w;
  let hole = u.p[3].w;
  let RIM = u.p[8].x;
  let HF = u.p[8].y;
  let lid = -H * k / (hole * hole + k); // the drain's mouth
  if (ro.z < lid && length(ro.xy) < hole) { return vec3f(0.0); } // through it

  // In through the shaft's mouth, if we are over the rim; outside it is the land, which the beam draws.
  // (Decided here, drawn last: the derivatives below need every pixel.)
  let over = ro.z > HF;
  let t0 = select(0.0, max((HF - ro.z) / min(rd.z, -1e-5), 0.0), over);
  let open = over && rd.z >= 0.0; // the sky
  let land = over && !open && length(ro.xy + rd.xy * t0) > RIM;
  let S = ro + rd * t0;
  let tw = t0 + shaft(S, rd, RIM);

  // Down to the surface: Newton on the height above it, each step shortened by the steepest the wall gets
  // along it (the slope 2Hk r / (r² + k)² falls off outside its peak at r_c/√3, so that is where the step
  // comes nearest the axis), so it slides down the funnel and across its throat without passing through,
  // and never creeps along a lip it grazes. Never breaking off keeps the derivatives below.
  var t = max(t0, select(0.0, ro.z / -rd.z, ro.z > 0.0 && rd.z < 0.0));
  let lat = max(length(rd.xy), 1e-6);
  let peak = u.p[6].w * 0.57735;
  for (var i = 0; i < 48; i++) {
    let p = ro + rd * t;
    let r2 = dot(p.xy, p.xy);
    let g = p.z + H * k / (r2 + k);
    let sl = 2.0 * H * k * max(sqrt(r2), peak) / ((max(r2, peak * peak) + k) * (max(r2, peak * peak) + k));
    var dt = 0.9 * g / (abs(rd.z) + sl * lat + 1e-3);
    if (g > 0.0) {
      let near = max(length(p.xy + rd.xy * clamp(-dot(p.xy, rd.xy) / (lat * lat), 0.0, dt)), peak);
      dt = max(0.9 * g / (abs(rd.z) + 2.0 * H * k * near / ((near * near + k) * (near * near + k)) * lat + 1e-3), 2e-3 * (1.0 + t));
    }
    t = clamp(t + dt, 0.0, 60.0);
  }
  let P = ro + rd * t;
  let d = P.xy;
  let r2 = max(dot(d, d), 1e-12);
  let rho = sqrt(r2);
  let depth = H * k / (r2 + k);
  let miss = P.z + depth > 1e-3 * (1.0 + t) || t > tw;
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
  let lv = select(level(pw), 0.0, miss) * smoothstep(-oldest, 60.0 - oldest, rows); // older than the rows hold: clear water

  // Foam and ripples in the water's own coordinates (the angle it landed at, the row it landed with), so
  // they ride the spiral in and wind up with it. Lace where the spectrum is loud, ripples everywhere, each
  // let go where it would be finer than a pixel; and white water where the falls land, churned.
  let wet = u.p[1].w;
  let fine = vec2f(fx, fy);
  let lace = 1.0 - abs(2.0 * noise(vec2f(w * 768.0, ring / 192.0), vec2f(768.0, ROWS / 192.0)) - 1.0);
  let clump = noise(vec2f(w * 96.0, ring / 192.0), vec2f(96.0, ROWS / 192.0));
  let churn = 0.6 * noise(vec2f(w * 384.0, ring / 4.0), vec2f(384.0, ROWS / 4.0)) + 0.4 * noise(vec2f(w * 1024.0, ring / 2.0), vec2f(1024.0, ROWS / 2.0)); // froth, as fine one way as the other
  let fell = rows + u.p[5].w; // rows since it landed: < 0 inside the ring
  let white = u.p[6].x * (exp(-pow(fell / 40.0, 2.0)) + 0.6 * exp(min(fell, 0.0) / 110.0) * step(fell, 0.0)) * (0.03 + 0.97 * min(hot(lv), 1.0));
  let far = 1.0 - smoothstep(4.0, 24.0, fine.x + fine.y / 4.0);
  let foam = (smoothstep(0.93, 0.998, lace) * smoothstep(0.4, 0.9, clump + 0.5 * lv) * smoothstep(0.35, 0.95, hot(lv)) * (0.4 + 0.6 * wet)) * far + white * smoothstep(0.5, 0.8, churn + 0.15 * lace);
  let ripple = noise(vec2f(w * 1536.0, ring / 6.0), vec2f(1536.0, ROWS / 6.0)) * (1.0 - smoothstep(1.0, 6.0, fine.x + fine.y));

  // The surface's normal from the vortex, roughened by the ripples and the foam.
  let gh = 2.0 * H * k / ((r2 + k) * (r2 + k)) * d;
  let n0 = normalize(vec3f(-gh, 1.0));
  let bump = 0.0012 * (0.4 + 0.6 * wet) * (ripple + foam);
  let bx = dpdx(bump);
  let by = dpdy(bump);
  let s1 = cross(dPy, n0);
  let s2 = cross(n0, dPx);
  let det = dot(dPx, s1);
  let n = normalize(abs(det) * n0 - sign(det) * (bx * s1 + by * s2) + 1e-9);

  // Water: what it mirrors at grazing angles (Schlick, n = 1.33); seen into elsewhere, where the dye it
  // carries glows in its own hue, brighter as the funnel draws the surface together, over the teal the
  // depth scatters back (Beer–Lambert: 1 − e^(−κd) of it, d the water's depth under the surface).
  let cosi = clamp(dot(-rd, n), 0.0, 1.0);
  let fres = 0.02 + 0.98 * pow(1.0 - cosi, 5.0);
  let deep = 1.0 - exp(-2.2 * (0.35 + depth));
  let body = vec3f(0.0, 0.045, 0.05) * deep * (0.35 + 0.65 * max(n.z, 0.0));
  let l3 = hot(lv);
  let dye = (mix(vec3f(0.35, 0.6, 0.9) * (0.03 + l3), hue(b) * (0.012 + 2.4 * l3), u.p[7].y) + vec3f(1.0, 0.95, 0.9) * 1.5 * pow(max(lv - 0.8, 0.0) / 0.2, 2.0)) * (1.0 + 2.5 * depth / max(H, 1e-3));
  let lit = vec3f(0.55, 0.68, 0.8) * foam * (0.5 + 0.5 * max(dot(n, normalize(MOON)), 0.0));
  let mirror = mirrored(P, reflect(rd, n)) * fres;
  var c = (dye + body) * (1.0 - fres) + lit + mirror;
  if (miss) {
    let W = ro + rd * tw;
    c = select(rock(W), sky(rd), W.z > HF);
    t = tw;
  }
  // Mist where the falls land, lit by them: a few steps along the ray through it.
  var fog = vec3f(0.0);
  for (var i = 0; i < 4; i++) {
    let M = ro + rd * mix(t0, t, (f32(i) + e) / 4.0);
    fog += exp(-max(M.z, 0.0) / 0.3) * exp(-pow((length(M.xy) - R) / 0.3, 2.0)) * curtain(atan2(M.x, M.y), 0.0);
  }
  c += fog * (t - t0) * 0.15 * u.p[8].w;
  if (down) { c = vec3f(0.0); } // the drain: dark
  if (open) { c = sky(rd); }
  if (land) { c = vec3f(0.0); }
  c *= 1.0 - u.p[11].w;
  let seen = infect(q, select(vec2f(w * 48.0, ring / 96.0), 4.0 * q, down || miss || open || land), c) * u.p[4].w;
  if (land) { text = 0.0; }
  return seen;
}

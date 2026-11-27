// The shaft and its whirlpool, by moonlight. The river goes over the rim of a round shaft (radius RIM, HF deep)
// all the way round and falls: a glassy sheet at the lip that aerates as it falls, tears into ligaments and the
// ligaments into beads (Rayleigh–Plateau: drops.wgsl draws the beads), landing on a ring of radius R round the
// drain. The pool turns as a Scully vortex, u_θ = Γr / 2π(r² + r_c²), which ties its free surface to
// z = −Γ² / 8π²g(r² + r_c²); with the Burgers inflow u_r = −βr each parcel has turned
// Φ(r) = (K/2) ln((1 + r_c²/r²) / (1 + r_c²/R²)) since it landed at R, and has aged ln(R/r)/β: log-radius is age.
// The moon stands high over the mouth. Its light comes in as a slanted shaft the rim cuts (lit: exact, for any
// point), and the mist in it shows it as god rays. Under it all is the soundtrack: each angle round the rim is a
// frequency (80 Hz to 8 kHz of log-frequency round half of it, mirrored on the other), and the water going over
// there is as heavy as that band is loud; the foam the pool winds in is the spectrum it fell with; and the
// moonbow in the spray, each colour at its own angle from the antisolar point, is as bright as its band. And the pool
// is the soundtrack's waterfall plot: the spectrum each parcel of it fell with is a dye in it, frequency its hue and
// power its light, white water where the falls land, blossoming as it winds in, so rows of time wind in as rings and
// the choir's partials are its spiral arms. At the bottom the drain opens, a throat of water turning down into the
// dark. Read out as text, the water's light is glyphs: its foam the dense ones, winding in.
//
// p[0..3] camera; p[1].w how far the water has spun up, p[2].w the mist curling over the lip, p[3].w the drain's radius
// p[4] R, 80 Hz's angle, the lanes' arc, gain     p[5] head row (ring), rows an e-fold in, rows printed, rows the falls take
// p[6] the landing's foam, reference offset, depth H, core r_c      p[7] winding K, T (s), 80 Hz and 8 kHz's span on the rows
// p[8] the rim's radius and height, the fall's seconds, the plume   p[9] toward the moon, its light
// p[10] how far the pool has blossomed into the plot, how far the curtain's foot has
// p[11] -, -, how far the text has spread (0..1.3), how dark it has all gone (0..1)

const TAU = 6.2831853;
const DB = 56.0 * 0.33219281; // the rows' range, 56 dB, in doublings of power
const ROWS = 4096.0;
const LIG = 420.0; // ligaments round the rim (drops.wgsl)
const AIR = vec3f(0.0008, 0.0016, 0.0032); // what light there is in the shaft besides the moon's: the sky through its mouth
// The plot's tilt, as an audio analyser's display has one: 22 dB across the band (3.4 dB an octave), level at 400 Hz,
// so the soundtrack's falling slope (the roar and the bass under it) does not drown the partials over it.
const TILT = 0.4;

// A row's level is dB over the floor, in 16 bits as two bytes (filtering is linear, so it filters them
// apart and they add back exactly); power and back again, with the floor as zero.
fn at(t: vec2f) -> f32 { return dot(textureSampleLevel(data, smp, t, 0.0).rg, vec2f(65280.0, 255.0) / 65535.0); }
fn power(s: f32) -> f32 { return exp2(DB * clamp(s - u.p[6].y, 0.0, 1.0)) - 1.0; }
fn level(p: f32) -> f32 { return log2(1.0 + p) / DB; }
fn hot(lv: f32) -> f32 { return pow(min(lv / 0.8, 1.25), 4.0); } // a display's contrast: 10 dB under the loudest is a third of it

// Frequency as colour, the way a prism lays the band out: 80 Hz red, through gold and green, to 8 kHz violet.
fn hue(b: f32) -> vec3f {
  var c = array(vec3f(1.0, 0.08, 0.04), vec3f(1.0, 0.35, 0.05), vec3f(1.0, 0.75, 0.15), vec3f(0.3, 1.0, 0.35),
                vec3f(0.1, 0.75, 1.0), vec3f(0.2, 0.3, 1.0), vec3f(0.55, 0.2, 1.0));
  let x = clamp(b, 0.0, 1.0) * 6.0;
  let i = min(u32(x), 5u);
  return mix(c[i], c[i + 1u], x - f32(i));
}

fn wrap(i: vec2f, n: vec2f) -> vec2f { return i - n * floor(i / n); }
// A lattice point's random value: an integer hash (PCG), which unlike a sine's holds up however far out it is.
fn pcg(v: u32) -> u32 {
  let s = v * 747796405u + 2891336453u;
  let w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  return (w >> 22u) ^ w;
}
fn hash(p: vec2f) -> f32 { return f32(pcg(u32(i32(p.x)) + pcg(u32(i32(p.y)))) >> 8u) / 16777216.0; }
fn hash3(p: vec3f) -> f32 { return f32(pcg(u32(i32(p.x)) + pcg(u32(i32(p.y)) + pcg(u32(i32(p.z))))) >> 8u) / 16777216.0; }
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
fn noise3(x: vec3f) -> f32 {
  let i = floor(x);
  let f = x - i;
  let w = f * f * (3.0 - 2.0 * f);
  let e = vec2f(1.0, 0.0);
  let a = mix(mix(hash3(i), hash3(i + e.xyy), w.x), mix(hash3(i + e.yxy), hash3(i + e.xxy), w.x), w.y);
  let b = mix(mix(hash3(i + e.yyx), hash3(i + e.xyx), w.x), mix(hash3(i + e.yxx), hash3(i + e.xxx), w.x), w.y);
  return mix(a, b, w.z);
}

// Foam's own cells, bubbles packed together (a cellular noise tiling every n cells): how far from the wall
// between two of them, 0 on it.
fn bubbles(x: vec2f, n: vec2f) -> f32 {
  let i = floor(x);
  let f = x - i;
  var d1 = 9.0;
  var d2 = 9.0;
  for (var k = 0; k < 9; k++) {
    let o = vec2f(f32(k % 3) - 1.0, f32(k / 3) - 1.0);
    let c = wrap(i + o, n);
    let p = o + vec2f(hash(c), hash(c + vec2f(1031.0, 67.0))) - f;
    let d = dot(p, p);
    d2 = min(d2, max(d1, d));
    d1 = min(d1, d);
  }
  return sqrt(d2) - sqrt(d1);
}

// The lane at angle th round the shaft (from downstream toward +x), 0..1, mirrored on the far half.
fn lane(th: f32) -> f32 {
  let b0 = fract((th - u.p[4].y) / TAU) * TAU / u.p[4].z;
  return select(b0, 2.0 - b0, b0 > 1.0);
}
// How loud lane b was `back` rows behind the head, over the reference: 0..1.
fn band(b: f32, back: f32) -> f32 {
  let v = (u.p[5].x - back + 0.5) / ROWS;
  let x = u.p[7].z + b * u.p[7].w;
  let s = 0.5 * at(vec2f(x, v)) + 0.25 * (at(vec2f(x - 0.004, v)) + at(vec2f(x + 0.004, v)));
  return clamp(s - u.p[6].y, 0.0, 1.0);
}

fn moon() -> vec3f { return u.p[9].xyz; }
fn moonlight() -> vec3f { return vec3f(0.62, 0.8, 1.0) * u.p[9].w; } // cool: the valley's own water, in light
// Whether the moon reaches P: under the rim, only if the way up toward it comes out through the mouth.
fn lit(P: vec3f) -> f32 {
  let L = moon();
  let Q = P.xy + L.xy * (u.p[8].y - P.z) / L.z;
  return select(smoothstep(u.p[8].x + 0.03, u.p[8].x - 0.03, length(Q)), 1.0, P.z >= u.p[8].y);
}

// The night over the shaft: the moon, its aureole in the air, a sky only just lighter than black, and stars.
// Mirrored in the water (direct = 0) it has no disk and no stars: the moon's light on the water is its glitter (field's
// spec), and a star's image on ripples would be a sub-pixel glint, twinkling.
fn sky(r: vec3f, direct: f32) -> vec3f {
  let L = moon();
  let m = dot(r, L);
  let s = length(cross(r, L)); // the sine of the angle from the moon
  var c = mix(vec3f(0.006, 0.010, 0.018), vec3f(0.0015, 0.0028, 0.0065), sqrt(max(r.z, 0.0)));
  c += moonlight() * (0.012 * pow(max(m, 0.0), 24.0) + 0.06 * exp(-s / 0.02) * step(0.0, m));
  let disk = smoothstep(0.0072, 0.0062, s) * step(0.0, m);
  c += vec3f(1.0, 0.96, 0.88) * 26.0 * direct * disk * (0.75 + 0.25 * sqrt(max(1.0 - s * s / 0.0000518, 0.0))); // limb-darkened
  let g = vec2f(atan2(r.x, r.y), asin(clamp(r.z, -1.0, 1.0))) * 70.0;
  let cell = floor(g);
  let h = hash(cell);
  let o = vec2f(hash(cell + 7.7), hash(cell + 3.1));
  c += vec3f(0.85, 0.9, 1.0) * 1.5 * direct * pow(h, 40.0) * smoothstep(0.18, 0.02, length(g - cell - o)) * step(0.0, r.z);
  return c;
}

// How far along (o, d) the wall of a vertical cylinder of radius r is, from inside it.
fn shaft(o: vec3f, d: vec3f, r: f32) -> f32 {
  let a = max(dot(d.xy, d.xy), 1e-9);
  let b = dot(o.xy, d.xy);
  return (-b + sqrt(max(b * b - a * (dot(o.xy, o.xy) - r * r), 0.0))) / a;
}

// The rock behind the falls: strata, wet, lit where the moon gets down to it.
fn rock(P: vec3f) -> vec3f {
  let th = atan2(P.x, P.y);
  let w = fract(th / TAU);
  let bed = noise(vec2f(w * 24.0, P.z * 9.0 + 3.0 * noise(vec2f(w * 96.0, P.z * 3.0), vec2f(96.0, 64.0))), vec2f(24.0, 64.0));
  let joint = smoothstep(0.75, 1.0, noise(vec2f(w * 320.0, P.z * 2.0), vec2f(320.0, 64.0)));
  let ledge = smoothstep(0.5, 0.56, fract(P.z * 5.0 + 2.0 * bed));
  let stone = (0.25 + 0.75 * bed) * (1.0 - 0.6 * joint) * (0.7 + 0.3 * ledge);
  let n = vec3f(-P.xy / max(length(P.xy), 1e-4), 0.0);
  let sun = lit(P) * max(dot(n, moon()), 0.0);
  return stone * (moonlight() * 0.01 * sun + AIR * 0.5);
}

// The curtain's radius at height z: it leaves the rim at RIM and lands at R, a parabola in time.
fn rc(z: f32) -> f32 { return u.p[8].x - (u.p[8].x - u.p[4].x) * sqrt(clamp(1.0 - z / u.p[8].y, 0.0, 1.0)); }

// One layer of the curtain's jets, s ligaments to a jet: at ligament coordinate l, f through the fall, gone over
// at tb. Each jet keeps its place round the rim as it falls, its flow swelling and thinning; whole at the lip,
// where they are one sheet, they part as it falls, and lower down each pinches into beads (Rayleigh–Plateau).
// How much of the point it covers, how full its flow is, where across the jet the point is (−1..1), and its width in px.
fn jets(l: f32, s: f32, f: f32, tb: f32, heavy: f32, fp: f32, seed: f32) -> vec4f {
  let x = l / s;
  let cell = floor(x);
  let n = LIG / s;
  let id = cell - n * floor(cell / n);
  let h0 = hash(vec2f(id, seed));
  let slow = noise(vec2f(id * 0.71 + seed, tb * 0.9), vec2f(65536.0));
  let bead = 0.5 + 0.5 * sin(TAU * ((3.0 + 4.0 * hash(vec2f(id, seed + 1.0))) * tb + h0));
  let pinch = 0.7 * smoothstep(0.55, 1.0, f) * (1.0 - smoothstep(0.4, 1.0, fp / s));
  let w = mix(0.62, (0.06 + 0.3 * slow * slow + 0.15 * heavy) * mix(1.0, 0.25 + 0.75 * bead, pinch), smoothstep(0.03, 0.45, f)); // half-width, in cells
  let c = 0.5 + (h0 - 0.5) * max(1.0 - 2.0 * w, 0.0);
  let d = x - cell - c;
  let aa = 0.6 * fp / s + 0.02;
  return vec4f(smoothstep(w + aa, w - aa, abs(d)), slow * (0.25 + 1.5 * h0 * h0), clamp(d / max(w, 1e-3), -1.0, 1.0), 2.0 * w * s / max(fp, 1e-4)); // and how many pixels wide the rope is
}

// The curtain where a ray crosses it at C: its light, and how much of what is behind it it hides. fp is a pixel's
// width in ligaments: detail finer than that is let go, so it never shimmers. Each jet is a rope of water: glass
// where it is still whole, white where air is in it, catching the moon along one side.
fn curtain(C: vec3f, rd: vec3f, fp: f32) -> vec4f {
  let HF = u.p[8].y;
  let f = sqrt(clamp(1.0 - C.z / HF, 0.0, 1.0)); // how far through its fall it is, in time
  let tb = u.p[7].y - f * u.p[8].z; // when it went over
  let th = atan2(C.x, C.y);
  let l = fract(th / TAU) * LIG;
  let heavy = hot(band(lane(th), u.p[5].w * f)); // as heavy as its band was loud when it went over
  let a = jets(l, 2.0, f, tb, heavy, fp, 0.0);
  let b = jets(l + 0.9, 7.0, f, tb, heavy, fp, 5.0);
  let j = select(a, b, b.x > a.x);
  let cov = max(a.x, b.x);
  let streak = mix(noise(vec2f(l * 4.0, tb * 5.0), vec2f(LIG * 4.0, 65536.0)), 0.5, smoothstep(0.15, 0.4, fp));
  let core = sqrt(max(1.0 - j.z * j.z, 0.0));
  let white = smoothstep(0.02, 0.5, f) * core * core * pow(0.15 + 0.6 * j.y + 0.5 * streak, 2.0) * (0.6 + 0.6 * heavy); // aerating as it falls
  let L = moon();
  let n = vec3f(-C.xy / max(length(C.xy), 1e-4), 0.0); // its face toward the axis
  let side = vec3f(n.y, -n.x, 0.0);
  let nj = normalize(mix(vec3f(0.0, 0.0, 1.0), n * core + side * j.z, smoothstep(0.0, 0.1, f))); // the rope's own normal; at the lip it curls over
  let sun = lit(C);
  // the moon's glint off the rope, where the rope is wide enough to show it: on a rope narrower than a few pixels its
  // normal turns across a pixel, and the glint would twinkle; there it is its mean
  let glint = mix(0.012, pow(max(dot(reflect(rd, nj), L), 0.0), 80.0), smoothstep(1.5, 4.0, j.w)) * (1.5 + 3.0 * (1.0 - smoothstep(0.0, 0.25, f)));
  // over the lip the sheet is glass, and its flow lines catch the moon: the ink's streamlines, in the water's own light
  let lines = pow(1.0 - abs(2.0 * noise(vec2f(l * 3.0, tb * 0.7), vec2f(LIG * 3.0, 65536.0)) - 1.0), 5.0);
  let lip = mix(lines, 0.03, smoothstep(0.1, 0.4, fp * 3.0)) * (1.0 - smoothstep(0.05, 0.45, f)) * 1.2;
  // at its foot the white water takes its band's colour: the plot it is about to become
  let dyed = mix(vec3f(1.0), hue(lane(th)) * 1.4, u.p[10].y * smoothstep(0.5, 1.0, f) * (0.35 + 0.4 * min(heavy, 1.0)));
  let col = moonlight() * sun * (white * 0.3 * (0.4 + 0.6 * abs(dot(n, L))) * dyed + glint * (0.3 + 0.7 * streak) + lip) + white * AIR * 2.0 * dyed;
  return vec4f(col * cov, cov * (0.08 + 0.9 * min(white, 1.0)));
}

// What the water mirrors along r from P: the sky through the mouth, else the curtain round it and the rock behind.
fn mirrored(P: vec3f, r: vec3f) -> vec3f {
  let HF = u.p[8].y;
  let t1 = shaft(P, r, u.p[8].x);
  let z1 = P.z + r.z * t1;
  if (z1 > HF) { return sky(r, 0.0); }
  let f = sqrt(clamp(1.0 - z1 / HF, 0.0, 1.0));
  let Q = P + r * shaft(P, r, mix(u.p[8].x, u.p[4].x, f)); // where the curtain hangs at that height
  let c = moonlight() * lit(Q) * 0.05 * smoothstep(0.0, 0.5, f) + AIR; // the curtain's mean light: the ripples blur the rest
  return c + rock(P + r * t1) * 0.3;
}

// The mist: spray standing round where the falls land, a haze filling the shaft, and the plume it breathes out of
// its mouth into the night. Density per unit of length.
fn mist(P: vec3f) -> f32 {
  let R = u.p[4].x;
  let RIM = u.p[8].x;
  let HF = u.p[8].y;
  let r = length(P.xy);
  let z = max(P.z, 0.0);
  let n = noise3(vec3f(P.xy * 2.5, z * 1.8 - u.p[7].y * 0.5));
  let dr = (r - R) / 0.35;
  let foot = exp(-z / 0.5 - dr * dr);
  let haze = 0.05 * exp(-z / 1.5);
  let cr = vec2f(r - RIM + 0.15, P.z - HF) / 0.3;
  let curl = u.p[2].w * 1.2 * exp(-dot(cr, cr)); // over the lip, where we go over
  let rise = max(P.z - HF + 0.3, 0.0);
  let plume = u.p[8].w * 0.06 * smoothstep(HF - 0.5, HF, P.z) * exp(-rise / 0.8) * smoothstep(RIM * (1.0 + 0.5 * rise), RIM * (0.3 + 0.5 * rise), r + 0.35 * (n - 0.5));
  return (foot + select(haze, 0.0, P.z > HF) + plume + curl) * (0.2 + 1.6 * n * n) * step(-u.p[6].z * u.p[6].w * u.p[6].w / (r * r + u.p[6].w * u.p[6].w), P.z);
}
// The moonbow: each colour's own angle from the antisolar point (42.3° red, 40.6° violet), as bright as its band
// in what is landing now; within it the sky's light is brighter, all the colours overlapping there.
fn bow(rd: vec3f) -> vec3f {
  let psi = degrees(acos(clamp(-dot(rd, moon()), -1.0, 1.0)));
  let b = (42.4 - psi) / 1.8;
  let lv = hot(band(clamp(b, 0.0, 1.0), u.p[5].w));
  let ring = smoothstep(-0.3, 0.1, b) * smoothstep(1.3, 0.9, b);
  return (mix(vec3f(1.0), hue(b), 0.8) * (0.35 + 1.6 * lv) * ring + vec3f(0.25) * smoothstep(41.0, 25.0, psi)) * 0.8;
}
// The phase of the mist's scattering: forward, mostly (Henyey–Greenstein, g = 0.6), and isotropic.
fn phase(c: f32) -> f32 { return 0.5 * 0.0509 / pow(1.36 - 1.2 * c, 1.5) + 0.5 * 0.0796; }

// Read out as text, the glyphs spread like an infection: from a few seeds, fingering along the water's own grain
// (flow: where on the water, in its coordinates) so the tendrils wind in with the spiral. A cell turns when its
// time comes.
fn fbm(x: vec2f) -> f32 {
  var s = 0.0;
  var y = x;
  for (var i = 0; i < 4; i++) { s += exp2(-f32(i + 1)) * noise(y, vec2f(65536.0)); y = 2.03 * y + 17.0; }
  return s;
}
fn infected(q: vec2f, flow: vec2f) -> f32 {
  let near = min(min(length(q - vec2f(-1.1, 0.6)), length(q - vec2f(1.3, -0.5))), length(q - vec2f(0.2, 0.9)));
  return step(0.0, u.p[11].z - 0.4 * near / 1.6 - 0.6 * abs(2.0 * fbm(flow) - 1.0));
}

fn field(q: vec2f) -> vec3f {
  let ro = eye();
  let rd = ray(q);
  let H = u.p[6].z;
  let k = u.p[6].w * u.p[6].w;
  let hole = u.p[3].w;
  let R = u.p[4].x;
  let RIM = u.p[8].x;
  let HF = u.p[8].y;
  let T = u.p[7].y;
  let L = moon();
  let e = fract(52.9829189 * fract(dot(q / u.px, vec2f(0.06711056, 0.00583715)))); // a per-pixel dither
  let lid = -H * k / (hole * hole + k); // the drain's mouth
  let throat = ro.z < lid && length(ro.xy) < hole; // down it

  // Over the rim: in through the mouth, onto the land, or the sky. (Decided here, drawn last: the derivatives
  // below need every pixel.)
  let over = ro.z > HF;
  let tm = select(0.0, max((HF - ro.z) / min(rd.z, -1e-5), 0.0), over);
  let mouth = !over || (rd.z < 0.0 && length(ro.xy + rd.xy * tm) < RIM);
  let land = over && rd.z < 0.0 && !mouth;
  let S = ro + rd * tm;
  let tw = tm + shaft(S, rd, RIM);
  let ttop = select(1e9, (HF - ro.z) / max(rd.z, 1e-6), !over && rd.z > 0.0);

  // Down to the surface: Newton on the height above it, each step shortened by the steepest the wall gets
  // along it (the slope 2Hk r / (r² + k)² falls off outside its peak at r_c/√3, so that is where the step
  // comes nearest the axis), so it slides down the funnel and across its throat without passing through,
  // and never creeps along a lip it grazes. Never breaking off keeps the derivatives below.
  var t = max(tm, select(0.0, ro.z / -rd.z, ro.z > 0.0 && rd.z < 0.0));
  let lat = max(length(rd.xy), 1e-6);
  let peak = u.p[6].w * 0.57735;
  for (var i = 0; i < 40; i++) {
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
  // and Newton's own steps onto it, so the hit is exact to well under a pixel: what is left of the march's last
  // stride would jitter from pixel to pixel, and every derivative below (the footprint, the normal) with it
  for (var i = 0; i < 3; i++) {
    let p = ro + rd * t;
    let s2 = dot(p.xy, p.xy) + k;
    let g = p.z + H * k / s2;
    let dg = rd.z - 2.0 * H * k * dot(p.xy, rd.xy) / (s2 * s2);
    t -= select(0.0, clamp(g / dg, -0.02, 0.02), abs(dg) > 1e-3 && abs(g) < 0.03);
  }
  var P = ro + rd * t;
  let d = P.xy;
  let r2 = max(dot(d, d), 1e-12);
  let rho = sqrt(r2);
  let depth = H * k / (r2 + k);
  let pool = !(P.z + depth > 1e-3 * (1.0 + t) || t > tw || t > ttop) && mouth && !throat;
  let down = pool && rho < hole && rd.z < 0.0; // into the drain's mouth

  // Where on the spectrum: angle round the drain, less the turn the water has made since it landed, is
  // frequency, mirrored on the far half; log-radius is age, in rows behind the head.
  let K = u.p[7].x;
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

  // The rows' power over that footprint, a tap every three bins or so (each filtered over two), evenly spread. Fewer,
  // or dithered, and where a pixel spans dozens of bins (down the funnel) or a partial's edge falls in it, one pixel
  // catches it and the next misses it: the spiral's arms would glitter as it turns.
  let ny = i32(clamp(ceil(fy / 3.0), 1.0, 6.0));
  let nx = i32(clamp(ceil(fx / 3.0), 1.0, 8.0));
  var pw = 0.0;
  for (var j = 0; j < ny; j++) {
    let v = (row + 0.5 + ((f32(j) + 0.5) / f32(ny) - 0.5) * fy) / size.y;
    for (var i = 0; i < nx; i++) {
      pw += power(at(vec2f(u.p[7].z + b * u.p[7].w + ((f32(i) + 0.5) / f32(nx) - 0.5) * fx / size.x, v)));
    }
  }
  pw /= f32(nx * ny);
  let lv0 = select(0.0, level(pw), pool) * smoothstep(-oldest, 60.0 - oldest, rows); // older than the rows hold: clear water
  let lv = clamp(lv0 + TILT * (b - 0.35) * step(1e-4, lv0), 0.0, 1.0);

  // Foam in the water's own coordinates (the angle it landed at, the row it landed with), so it rides the spiral
  // in and winds up with it: lace where the spectrum it fell with is loud, white water churned where the falls
  // land and all the way out under them; each let go where it would be finer than a pixel.
  let wet = u.p[1].w;
  let fine = vec2f(fx, fy);
  let fell = rows + u.p[5].w; // rows since it landed: < 0 inside the ring
  let age = max(-fell, 0.0) / u.p[5].y; // e-folds since
  let warp = noise(vec2f(w * 64.0, ring / 80.0), vec2f(64.0, ROWS / 80.0)) - 0.5; // marbling: the filaments wander
  let fil = 1.0 - abs(2.0 * noise(vec2f(w * 512.0 + 30.0 * warp, ring / 90.0), vec2f(512.0, ROWS / 90.0)) - 1.0);
  let fil2 = 1.0 - abs(2.0 * noise(vec2f(w * 1400.0 + 70.0 * warp, ring / 36.0), vec2f(1400.0, ROWS / 36.0)) - 1.0);
  let clump = noise(vec2f(w * 40.0 + 3.0 * warp, ring / 150.0), vec2f(40.0, ROWS / 150.0));
  // How many cells of a lattice (n of them round the pool, one every rr rows) a pixel spans: each texture is let go,
  // to its mean, before its lines get finer than a pixel and would alias, crawling and twinkling as the water turns.
  // The marbling's wander stretches the filaments' lattices too, by as much as it turns across the pixel.
  let cpx = vec2f(fine.x / 3402.0, fine.y); // the lanes span half the pool
  let wf = fwidth(warp);
  let f1 = 1.0 - smoothstep(0.1, 0.35, max(cpx.x * 512.0 + 30.0 * wf, cpx.y / 90.0));
  let f2 = 1.0 - smoothstep(0.15, 0.5, max(cpx.x * 1400.0 + 70.0 * wf, cpx.y / 36.0));
  let dens = clamp(1.6 * hot(lv) + 0.9 * clump - 0.35, 0.0, 1.0) * exp(-(0.2 + 0.8 * u.p[10].x) * age) * (0.4 + 0.6 * wet); // thinning, once it blossoms, so the plot shows through its lace
  let threads = dens * mix(0.3, 0.06 + 1.1 * pow(fil, 6.0), f1) * mix(0.8, 0.4 + 0.9 * fil2 * fil2, f2);
  let boil = noise(vec2f(w * 160.0 + 8.0 * warp, ring / 12.0 - T * 3.0), vec2f(160.0, ROWS / 12.0));
  var froths = 0.6; // bubbles, where the falls land and they are big enough to see
  let big = 1.0 - smoothstep(0.25, 0.7, max(cpx.x * 900.0 + 40.0 * wf, cpx.y / 3.0));
  if (pool && rho > R - 0.35 && big > 0.0) {
    froths = mix(0.6, smoothstep(0.35, 0.0, bubbles(vec2f(w * 900.0 + 40.0 * warp, ring / 3.0 - T * 4.0), vec2f(900.0, ROWS / 3.0))), big);
  }
  let plunge = smoothstep(R - 0.3, R + 0.02, rho + 0.1 * fil) * smoothstep(0.35, 0.75, boil + 0.3 * fil - 0.6 * smoothstep(R, R - 0.25, rho)) * froths * u.p[6].x * 0.6;
  let foam = clamp(max(threads, plunge), 0.0, 1.0);
  let ripple = noise(vec2f(w * 1536.0, ring / 6.0 - T * 3.0), vec2f(1536.0, ROWS / 6.0)) * (1.0 - smoothstep(0.15, 0.5, max(cpx.x * 1536.0, cpx.y / 6.0)));

  // The surface's normal from the vortex, roughened by the ripples and the foam.
  let gh = 2.0 * H * k / ((r2 + k) * (r2 + k)) * d;
  let n0 = normalize(vec3f(-gh, 1.0));
  let bump = 0.0014 * (ripple + 0.6 * foam);
  let bx = dpdx(bump);
  let by = dpdy(bump);
  let s1 = cross(dPy, n0);
  let s2 = cross(n0, dPx);
  let det = dot(dPx, s1);
  let n = normalize(abs(det) * n0 - sign(det) * (bx * s1 + by * s2) + 1e-9);

  // Water: what it mirrors (Schlick, n = 1.33), the moon's glitter on its ripples, and seen into, dark, but for
  // the bubbles the falls drive down glowing under where they land; and its foam. The moon gets down to it past
  // the rim and, deep in the funnel, past the funnel's own wall: a few steps toward the moon.
  var sun = lit(P);
  for (var i = 1; i < 4; i++) {
    let Q = P + L * (0.06 * f32(i * i));
    sun *= smoothstep(-0.01, 0.02, Q.z + H * k / (dot(Q.xy, Q.xy) + k));
  }
  let cosi = clamp(dot(-rd, n), 0.0, 1.0);
  let fres = 0.02 + 0.98 * pow(1.0 - cosi, 5.0);
  let h = normalize(L - rd + vec3f(0.0, 0.0, 1e-5));
  // the glitter: the moon on each facet of the ripples that happens to face it, so a lobe as wide as the ripples
  // are steep, broken into glints that ride the water and flicker as it moves. Each glint is shown only where it
  // spans a few pixels, its mean where it is finer; and the lobe is widened by how far the normal turns across the
  // pixel (Kaplanyan and Hoffmann's specular antialiasing), so no lone pixel catches the moon and twinkles.
  let dnx = dpdx(n);
  let dny = dpdy(n);
  let a2 = min(pow(0.13 + 0.05 * wet, 2.0) + min(0.5 * (dot(dnx, dnx) + dot(dny, dny)), 0.18), 1.0);
  let nh = max(dot(n, h), 0.0);
  let dd = nh * nh * (a2 - 1.0) + 1.0;
  let D = a2 / (3.14159 * dd * dd);
  let cells = max(cpx.x * 2400.0, cpx.y / 1.5); // a pixel's width in the glints' cells
  let glints = mix(0.8, 12.0 * pow(smoothstep(0.6, 0.97, noise(vec2f(w * 2400.0, ring / 1.5 - T * 9.0), vec2f(2400.0, ROWS / 1.5))), 2.0), 1.0 - smoothstep(0.08, 0.3, cells));
  let spec = min(moonlight() * 3.0 * sun * D * glints * (0.02 + 0.98 * pow(1.0 - max(dot(h, -rd), 0.0), 5.0)) * max(dot(n, L), 0.0) / (4.0 * max(cosi, 0.08)), vec3f(3.0));
  let dz = (rho - R) / 0.22;
  let fizz = exp(-dz * dz) * (0.5 + boil) + 0.3 * plunge; // the bubbles under the water
  let body = vec3f(0.0, 0.0012, 0.0018) * (0.3 + sun) + vec3f(0.18, 0.5, 0.46) * 0.03 * fizz * (0.2 + 0.8 * sun);
  // The plot, in the water: the spectrum each parcel fell with is a dye in it, frequency its hue and power its light,
  // the loudest burning through to white, held most in its foam, which takes the colour it carries. Where the falls
  // land it is white water; the colour blossoms as it winds in, and the funnel drawing the water together makes it glow
  // brighter down it, until deep in the eye, where a pixel spans more rows and bins than its taps can tell apart, it
  // gives way to the throat's own dark rather than glittering.
  let bloom = u.p[10].x * smoothstep(0.02, 0.45, age) * (1.0 - smoothstep(1.0, 2.5, max(fx / 24.0, fy / 18.0)));
  let l3 = hot(lv);
  let dye = (hue(b) * (0.004 + 0.5 * l3) + vec3f(1.0, 0.96, 0.9) * 0.6 * pow(max(lv - 0.8, 0.0) / 0.2, 2.0)) * (1.0 + 1.5 * depth / max(H, 1e-3)) * bloom;
  let tint = mix(vec3f(1.0), hue(b) * 1.4, bloom * (0.6 + 0.4 * min(l3, 1.0)));
  let froth = (moonlight() * sun * (0.14 + 0.26 * max(dot(n, L), 0.0)) + AIR * 3.0) * (1.0 + 0.3 * plunge) * tint;
  var c = mix(((body + dye) * (1.0 - fres) + mirrored(P, reflect(rd, n)) * fres + spec * (1.0 - foam)), froth + dye, foam);
  var text_ = 1.0; // what is read out as text: the water's light, not the curtain's

  // Behind: the rock, or the sky through the mouth.
  let W = ro + rd * tw;
  c = select(select(select(rock(W), sky(rd, 1.0), ttop <= tw || !mouth), vec3f(0.0), land), c, pool); // the land is the beam's
  var tEnd = select(min(tw, ttop), t, pool);
  // The curtain in front of it, if the ray goes out through it: where, found by halving.
  let hit = ro + rd * tEnd;
  if (mouth && !throat && length(hit.xy) > rc(hit.z) + 1e-4) {
    var lo = tm;
    var hi = tEnd;
    for (var i = 0; i < 12; i++) {
      let m = 0.5 * (lo + hi);
      let p = ro + rd * m;
      let o = length(p.xy) > rc(p.z);
      lo = select(m, lo, o);
      hi = select(hi, m, o);
    }
    let C = ro + rd * hi;
    let rC = max(length(C.xy), 1e-3);
    let fp = hi * cone() * LIG / (TAU * rC) / max(abs(dot(rd.xy, C.xy)) / rC, 0.2);
    let cc = curtain(C, rd, fp);
    c = c * (1.0 - cc.a) + cc.rgb;
    text_ *= 1.0 - cc.a;
    tEnd = hi;
  }

  // Down the drain: a throat of water turning down into the dark, its wall streaked with the spiral, lit less and
  // less the further down from the light above.
  let O = select(P, ro, throat);
  let tt = shaft(O, rd, hole);
  let Wt = O + rd * tt;
  let below = lid - Wt.z;
  // its foam the pool's threads wound on down, turning faster the further down
  let wt = fract((atan2(Wt.x, Wt.y) - 14.0 * below - T * 4.0) / TAU);
  let ft = 1.0 - abs(2.0 * noise(vec2f(wt * 160.0, below * 40.0 + T * 10.0), vec2f(160.0, 65536.0)) - 1.0);
  let rush = smoothstep(0.75, 0.97, ft) * noise(vec2f(wt * 24.0, below * 6.0 + T * 3.0), vec2f(24.0, 65536.0));
  let tube = (moonlight() * 0.05 * rush + AIR * 0.3) * exp(-below / 0.3) * select(1.0, 0.0, rd.z > 0.0 && throat);
  c = select(c, tube, down || throat);
  tEnd = select(tEnd, tt + select(t, 0.0, throat), down || throat);

  // The mist along the way, lit where the moon gets down to it, the moonbow in it where it is lit; and the plume
  // over the mouth. Its samples sit in a cylinder round the shaft, stratified and dithered.
  let Rb = RIM * 2.2;
  let ab = max(dot(rd.xy, rd.xy), 1e-9);
  let bb = dot(ro.xy, rd.xy);
  let disc = bb * bb - ab * (dot(ro.xy, ro.xy) - Rb * Rb);
  let t1 = select(0.0, (-bb + sqrt(max(disc, 0.0))) / ab, disc > 0.0);
  let t0m = select(0.0, max((-bb - sqrt(max(disc, 0.0))) / ab, 0.0), disc > 0.0);
  let tMax = min(min(t1, select(tEnd, tm, land)), select(60.0, (HF + 3.0 - ro.z) / rd.z, rd.z > 1e-4));
  var tau = 0.0;
  var inLit = 0.0;
  var inAll = 0.0;
  let N = 6;
  let span = max(tMax - t0m, 0.0);
  for (var i = 0; i < N; i++) {
    let s = t0m + span * (f32(i) + e) / f32(N);
    let M = ro + rd * s;
    let dd = mist(M) * span / f32(N);
    let tr = exp(-0.7 * tau);
    inLit += dd * lit(M) * tr;
    inAll += dd * tr;
    tau += dd;
  }
  c = c * exp(-0.7 * tau) + moonlight() * inLit * (phase(dot(rd, L)) + bow(rd) * 0.05) + AIR * inAll;
  c *= 1.0 - u.p[11].w;

  // Read out as text where the text has spread to.
  text = text_ * infected(q, select(vec2f(w * 48.0, ring / 96.0), 4.0 * q, !pool || down || throat));
  return c * u.p[4].w;
}

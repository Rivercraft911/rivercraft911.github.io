// The waterfall as a sheet: nine octaves of log-frequency across, the soundtrack's history along y, newest
// at the head. The sheet is rolled about an axis parallel to y: curvature 0 is the flat SDR display, and at
// full curl one octave is exactly once around, so the nine octaves lie on top of each other and their power
// adds: the wall is the chromagram. The choir's partials are octaves apart, so as the circumference closes
// on an octave they fall into register and become barber-pole helices: angle is pitch class, depth is time.
//
// p[0] eye, 1/tan(fov/2)     p[1] right, radius of the roll    p[2] up, z of the roll's axis
// p[3] forward, an octave's width on the sheet                  p[4] head y, y per row, head's ring row, rows
// p[5] gain, rows printed so far, sheet per second, spot      p[6] brightness: the black level's lift,
//                                                             the reference level's offset

const TAU = 6.2831853;
const PI = 3.1415927;
const OCT = 9.0;
const DB = 56.0 * 0.33219281; // the rows' range, 56 dB, in doublings of power

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

// Magnified, the four bins around x at sheet height v (rows between are linear) are read twice over.
// As a glow: Catmull-Rom on dB. A reassigned line is a Gaussian, a parabola in dB, and the cubic
// reproduces parabolas exactly, so a partial stays the curve it was, not a string of tents. As lines,
// drawn as the beam draws one, with a spot sized in pixels: each local peak is fitted with its parabola,
// which gives where the partial truly is, how loud, and how wide the estimate made it, and it is drawn
// there at that width, but never wider than the spot (p[5].w raster pixels), and as bright as its energy,
// narrowed, makes it (up to 4 times). Crests wider than 8 bins are too flat to place; they stay glow.
const NEPER = 0.07755; // a Gaussian's curvature in row units: 10 log10(e) / 56 dB
fn ridge(x: f32, v: f32, w: f32, fx: f32) -> f32 {
  let c = floor(x - 0.5);
  var s: array<f32, 4>;
  for (var j = 0; j < 4; j++) { s[j] = at(vec2f((c + f32(j) - 0.5) / w, v)); }
  let f = x - 0.5 - c;
  let cubic = s[0] * f * (-0.5 + f * (1.0 - 0.5 * f)) + s[1] * (1.0 + f * f * (-2.5 + 1.5 * f))
            + s[2] * f * (0.5 + f * (2.0 - 1.5 * f)) + s[3] * f * f * (-0.5 + 0.5 * f);
  var p = power(cubic) * fx;
  for (var j = 1; j < 3; j++) {
    let a = s[j - 1];
    let b = s[j];
    let d = s[j + 1];
    let k = a - 2.0 * b + d;
    if (b >= a && b >= d && k < -NEPER / 64.0) {
      let at = 0.5 * (a - d) / k;
      let wide = sqrt(NEPER / -k) / fx;
      let sig = min(wide, u.p[5].w);
      let dx = (x - (c + f32(j) - 0.5 + at)) / (fx * sig);
      p = max(p, power(b - 0.25 * (a - d) * at) * min(wide / sig, 4.0) * exp(-0.5 * dx * dx));
    }
  }
  return p;
}

// The sheet's power at bin x, ring row r, over a footprint of fx bins by fy rows: lines drawn sharp where
// a bin spans pixels, with the field's own glow beneath, and averaged as power where pixels span bins.
// The taps along the rows start at e, a per-pixel dither, so a few of them read as grain, not as copies.
fn sheet(x: f32, r: f32, fx: f32, fy: f32, e: f32) -> f32 {
  let size = vec2f(textureDimensions(data));
  let ny = i32(clamp(ceil(fy * 0.25), 1.0, 4.0));
  let nx = i32(clamp(ceil(fx), 1.0, 3.0));
  var p = 0.0;
  for (var j = 0; j < ny; j++) {
    let v = (r + 0.5 + ((f32(j) + e) / f32(ny) - 0.5) * fy) / size.y;
    if (fx < 1.0) { p += ridge(x, v, size.x, fx); continue; }
    for (var i = 0; i < nx; i++) {
      p += power(at(vec2f((x + ((f32(i) + 0.5) / f32(nx) - 0.5) * fx) / size.x, v)));
    }
  }
  return p / f32(ny * select(nx, 1, fx < 1.0));
}

fn field(q: vec2f) -> vec3f {
  let eye = u.p[0].xyz;
  let s = u.p[0].w;
  let R = u.p[1].xyz;
  let U = u.p[2].xyz;
  let dir = u.p[3].xyz * s + R * q.x + U * q.y;
  let rho = u.p[1].w;
  let cz = u.p[2].w;
  let W = u.p[3].w;
  // Where the ray leaves the roll (we are always inside it): the far root, in its stable form.
  let o = vec2f(eye.x, eye.z - cz);
  let d = dir.xz;
  let a = dot(d, d);
  let b = dot(o, d);
  let c = dot(o, o) - rho * rho;
  if (a < 1e-10) { return vec3f(0.0); }
  let disc = sqrt(max(b * b - a * c, 0.0));
  let t = select((-b + disc) / a, -c / (b + disc), b > 0.0);
  let P = eye + dir * t;
  let back = u.p[4].x - P.y; // behind the head: older
  let dy = u.p[4].y;
  let ring = u.p[4].w;
  let oldest = min(u.p[5].y, ring - 8.0) * dy;
  if (back < 0.0 || back > oldest) { return vec3f(0.0); }
  let r = u.p[4].z - back / dy;
  // A pixel's footprint on the wall (ray differentials: the hit slides along the wall as the ray turns),
  // in bins around the roll and rows along it.
  let n = vec3f(P.x, 0.0, P.z - cz) / rho;
  let tc = vec3f(-n.z, 0.0, n.x);
  let nd = dot(n, dir);
  let dx = (R - dir * (dot(n, R) / nd)) * (t * u.px);
  let dz = (U - dir * (dot(n, U) / nd)) * (t * u.px);
  let per = f32(textureDimensions(data).x) / (OCT * W);
  let fx = max(abs(dot(dx, tc)), abs(dot(dz, tc))) * per;
  // and the camera's shutter, open a 60th of a second as we fall, sweeps it along the tube.
  let fy = (max(abs(dx.y), abs(dz.y)) + u.p[5].z / 60.0) / dy;
  // Every turn of the sheet that passes through this point adds its power.
  let phi = atan2(P.x, cz - P.z);
  let span = 0.5 * OCT * W;
  let m = ceil((span / rho + PI) / TAU);
  let e = fract(52.9829189 * fract(dot(q / u.px, vec2f(0.06711056, 0.00583715)))); // interleaved gradient noise
  var pw = 0.0;
  for (var k = -m; k <= m; k += 1.0) {
    let x = rho * (phi + TAU * k);
    if (abs(x) <= span) { pw += sheet((x + span) * per, r, fx, fy, e); }
  }
  // The newest rows are still hot from the printing, and the rows fade as they age, the way a long
  // persistence screen's do; a pinhole's light falls off as cos⁴ off axis.
  let age = back / max(u.p[5].z, 1e-3);
  let cs = s * s / dot(dir, dir);
  let lv = level(pw) * (1.0 - u.p[6].x) + u.p[6].x;
  let edges = smoothstep(0.0, 0.15, back) * (1.0 - smoothstep(oldest - 1.5, oldest, back));
  return palette(lv * (1.0 + 0.3 * exp(-age / 0.12))) * (u.p[5].x * cs * cs * exp(-age / 2.0) * edges);
}

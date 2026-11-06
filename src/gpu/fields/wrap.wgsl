// The waterfall as a sheet: nine octaves of log-frequency across, the soundtrack's history along y, newest
// at the head. The sheet is rolled about an axis parallel to y: curvature 0 is the flat SDR display, and at
// full curl one octave is exactly once around, so the nine octaves lie on top of each other and their power
// adds: the wall is the chromagram. The choir's partials are octaves apart, so as the circumference closes
// on an octave they fall into register and become barber-pole helices: angle is pitch class, depth is time.
//
// p[0] eye, 1/tan(fov/2)     p[1] right, radius of the roll    p[2] up, z of the roll's axis
// p[3] forward, an octave's width on the sheet                  p[4] head y, y per row, head's ring row, rows
// p[5] gain, rows printed so far, sheet per second

const TAU = 6.2831853;
const PI = 3.1415927;
const OCT = 9.0;
const DB = 56.0 * 0.33219281; // the rows' range, 56 dB, in doublings of power

// A row's byte is dB over the floor; power and back again, with the floor as zero.
fn power(s: f32) -> f32 { return exp2(DB * clamp(s, 0.0, 1.0)) - 1.0; }
fn level(p: f32) -> f32 { return log2(1.0 + p) / DB; }

// Black through blue and cyan to gold and white: the waterfall's palette, in linear light.
fn palette(s: f32) -> vec3f {
  var c = array(vec3f(0.0), vec3f(0.0, 0.004, 0.03), vec3f(0.0, 0.03, 0.16), vec3f(0.0, 0.22, 0.34),
                vec3f(0.85, 0.45, 0.04), vec3f(2.0, 1.75, 1.4));
  let x = clamp(s, 0.0, 1.0) * 5.0;
  let i = min(u32(x), 4u);
  return mix(c[i], c[i + 1u], x - f32(i));
}

// One row across the bins by Catmull-Rom on dB. A reassigned line is a Gaussian, a parabola in dB, and the
// cubic reproduces parabolas exactly: magnified, a partial stays the curve it was, not a string of tents.
fn across(x: f32, r: i32) -> f32 {
  let w = i32(textureDimensions(data).x);
  let i = i32(floor(x - 0.5));
  let f = x - 0.5 - floor(x - 0.5);
  let k = vec4f(f * (-0.5 + f * (1.0 - 0.5 * f)), 1.0 + f * f * (-2.5 + 1.5 * f), f * (0.5 + f * (2.0 - 1.5 * f)), f * f * (-0.5 + 0.5 * f));
  var s = 0.0;
  for (var j = 0; j < 4; j++) {
    let b = i - 1 + j;
    if (b >= 0 && b < w) { s += k[j] * textureLoad(data, vec2i(b, r), 0).r; }
  }
  return s;
}

// The sheet's power at bin x, ring row r, over a footprint of fx bins by fy rows: reconstructed where one
// texel spans pixels, and averaged as power over the footprint where pixels span texels.
fn sheet(x: f32, r: f32, fx: f32, fy: f32) -> f32 {
  let rows = u.p[4].w;
  if (fx < 1.0 && fy < 1.5) {
    let r0 = floor(r);
    let a = across(x, i32(r0 - rows * floor(r0 / rows)));
    let r1 = r0 + 1.0;
    let b = across(x, i32(r1 - rows * floor(r1 / rows)));
    return power(mix(a, b, r - r0));
  }
  let size = vec2f(textureDimensions(data));
  let n = vec2i(clamp(ceil(vec2f(fx, fy * 0.5)), vec2f(1.0), vec2f(3.0, 6.0)));
  var p = 0.0;
  for (var j = 0; j < n.y; j++) {
    for (var i = 0; i < n.x; i++) {
      let o = (vec2f(f32(i), f32(j)) + 0.5) / vec2f(n) - 0.5;
      p += power(textureSampleLevel(data, smp, (vec2f(x, r + 0.5) + o * vec2f(fx, fy)) / size, 0.0).r);
    }
  }
  return p / f32(n.x * n.y);
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
  if (back < 0.0 || back > min(u.p[5].y, ring - 8.0) * dy) { return vec3f(0.0); }
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
  let fy = max(abs(dx.y), abs(dz.y)) / dy;
  // Every turn of the sheet that passes through this point adds its power.
  let phi = atan2(P.x, cz - P.z);
  let span = 0.5 * OCT * W;
  let m = ceil((span / rho + PI) / TAU);
  var pw = 0.0;
  for (var k = -m; k <= m; k += 1.0) {
    let x = rho * (phi + TAU * k);
    if (abs(x) <= span) { pw += sheet((x + span) * per, r, fx, fy); }
  }
  // The newest rows are still hot from the printing; a pinhole's light falls off as cos⁴ off axis.
  let age = back / max(u.p[5].z, 1e-3);
  let cs = s * s / dot(dir, dir);
  let lv = level(pw);
  return palette(lv + 0.3 * exp(-age / 0.12) * lv) * u.p[5].x * cs * cs * smoothstep(0.0, 0.15, back);
}

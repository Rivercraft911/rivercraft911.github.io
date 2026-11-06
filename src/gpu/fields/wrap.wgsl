// The waterfall as a sheet: nine octaves of log-frequency across, the soundtrack's history along y, newest
// at the head. The sheet is rolled about an axis parallel to y: curvature 0 is the flat SDR display, and at
// full curl one octave is exactly once around, so the nine octaves lie on top of each other and their light
// adds. The choir's partials are octaves apart, so as the circumference closes on an octave they fall into
// register and become barber-pole helices: angle is pitch class, depth is time.
//
// p[0] eye, 1/tan(fov/2)     p[1] right, radius of the roll    p[2] up, z of the roll's axis
// p[3] forward, an octave's width on the sheet                  p[4] head y, y per row, head's ring row, rows
// p[5] gain, rows printed so far

const TAU = 6.2831853;
const PI = 3.1415927;
const OCT = 9.0;

// Deep blue, cyan, gold, white: the waterfall's palette, in linear light (white burns past SDR).
fn palette(s: f32) -> vec3f {
  var c = array(vec3f(0.0), vec3f(0.0, 0.002, 0.025), vec3f(0.0, 0.025, 0.14), vec3f(0.0, 0.25, 0.36),
                vec3f(0.9, 0.48, 0.03), vec3f(2.2, 1.9, 1.5));
  let x = clamp(s, 0.0, 1.0) * 5.0;
  let i = min(u32(x), 4u);
  return mix(c[i], c[i + 1u], x - f32(i));
}

fn field(q: vec2f) -> vec3f {
  let eye = u.p[0].xyz;
  let dir = u.p[3].xyz * u.p[0].w + u.p[1].xyz * q.x + u.p[2].xyz * q.y;
  let rho = u.p[1].w;
  let W = u.p[3].w;
  // Where the ray leaves the roll (we are always inside it): the far root, in its stable form.
  let o = vec2f(eye.x, eye.z - u.p[2].w);
  let d = dir.xz;
  let a = dot(d, d);
  let b = dot(o, d);
  let c = dot(o, o) - rho * rho;
  if (a < 1e-10) { return vec3f(0.0); }
  let disc = sqrt(max(b * b - a * c, 0.0));
  let t = select((-b + disc) / a, -c / (b + disc), b > 0.0);
  let P = eye + dir * t;
  let back = u.p[4].x - P.y; // behind the head: older
  let ring = u.p[4].w;
  if (back < 0.0 || back > min(u.p[5].y, ring - 8.0) * u.p[4].y) { return vec3f(0.0); }
  let v = (u.p[4].z - back / u.p[4].y + 0.5) / ring;
  let phi = atan2(P.x, u.p[2].w - P.z);
  // Every turn of the sheet that passes through this point adds its light.
  let span = 0.5 * OCT * W;
  let n = ceil((span / rho + PI) / TAU);
  var light = vec3f(0.0);
  for (var k = -n; k <= n; k += 1.0) {
    let x = rho * (phi + TAU * k);
    if (abs(x) <= span) {
      light += palette(textureSampleLevel(data, smp, vec2f(x / (OCT * W) + 0.5, v), 0.0).r);
    }
  }
  return light * u.p[5].x * smoothstep(0.0, 0.15, back);
}

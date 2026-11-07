// Beam deposit: every segment of the beam lays down Gaussian energy into the phosphor.

struct U { // the head of phosphor.ts's uniforms
  res: vec2f,     // target size in px
  aspect: f32,    // scope x spans [-aspect, aspect], y spans [-1, 1]
  sigma: f32,     // beam spot radius in px
  power: f32,     // energy per unit of beam intensity
}

struct Sample { p: vec4f, c: vec4f } // p = x, y, z, _; c = r, g, b, _

@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var<storage, read> beam: array<Sample>;

struct Seg {
  @builtin(position) pos: vec4f,
  @location(0) q: vec2f, // px along the segment from its start, px across it
  @location(1) @interpolate(flat) len: f32,
  @location(2) @interpolate(flat) col: vec3f,
}

fn px(p: vec2f) -> vec2f {
  return vec2f((p.x / u.aspect * 0.5 + 0.5) * u.res.x, (0.5 - p.y * 0.5) * u.res.y);
}

@vertex fn segVS(@builtin(vertex_index) vi: u32, @builtin(instance_index) i: u32) -> Seg {
  let s0 = beam[i];
  let s1 = beam[i + 1u];
  var o: Seg;
  if (s1.p.z <= 0.0) { o.pos = vec4f(2.0, 2.0, 0.0, 1.0); return o; }
  let a = px(s0.p.xy);
  let d = px(s1.p.xy) - a;
  let len = length(d);
  let dir = select(vec2f(1.0, 0.0), d / len, len > 1e-4);
  let r = 3.5 * u.sigma;
  var ax = array(0.0, 1.0, 0.0, 1.0, 1.0, 0.0);
  var ay = array(-1.0, -1.0, 1.0, -1.0, 1.0, 1.0);
  let corner = vec2f(ax[vi], ay[vi]);
  o.q = vec2f(select(-r, len + r, corner.x > 0.5), corner.y * r);
  let w = a + dir * o.q.x + vec2f(-dir.y, dir.x) * o.q.y;
  o.pos = vec4f(w.x / u.res.x * 2.0 - 1.0, 1.0 - w.y / u.res.y * 2.0, 0.0, 1.0);
  o.len = len;
  o.col = pow(max(s1.c.rgb, vec3f(0.0)), vec3f(2.2)) * max(s1.p.z, 0.0); // authored like CSS color(display-p3 r g b), deposited as light; never negative, or pow gives NaN and the phosphor keeps it
  return o;
}

fn erf(x: f32) -> f32 { // Abramowitz & Stegun 7.1.26
  let a = abs(x);
  let t = 1.0 / (1.0 + 0.3275911 * a);
  let y = 1.0 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * exp(-a * a);
  return sign(x) * y;
}

// The beam sweeps the segment at constant speed: a unit of energy spread as a Gaussian along the line.
@fragment fn segFS(i: Seg) -> @location(0) vec4f {
  let s = u.sigma;
  let across = exp(-i.q.y * i.q.y / (2.0 * s * s)) * 0.3989423 / s;
  var along: f32;
  if (i.len < 0.05 * s) {
    along = exp(-i.q.x * i.q.x / (2.0 * s * s)) * 0.3989423 / s;
  } else {
    let k = 0.7071068 / s;
    along = (erf(i.q.x * k) - erf((i.q.x - i.len) * k)) / (2.0 * i.len);
  }
  return vec4f(i.col * (u.power * across * along), 0.0);
}

// Persistence: the blend constant scales what is already there.
@vertex fn fullVS(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  return vec4f(f32((i << 1u) & 2u) * 2.0 - 1.0, f32(i & 2u) * 2.0 - 1.0, 0.0, 1.0);
}

@fragment fn decayFS() -> @location(0) vec4f { return vec4f(0.0); }

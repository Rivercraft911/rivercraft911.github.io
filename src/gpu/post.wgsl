// Faceplate glare and the phosphor display.

struct Quad { @builtin(position) pos: vec4f, @location(0) uv: vec2f }

@vertex fn quadVS(@builtin(vertex_index) i: u32) -> Quad {
  let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
  return Quad(vec4f(p * 2.0 - 1.0, 0.0, 1.0), vec2f(p.x, 1.0 - p.y));
}

@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var smp: sampler;

// Dual Kawase pyramid. Taps sit a quarter of a destination texel out, so any power-of-two step down
// covers its whole footprint.
@fragment fn downFS(i: Quad) -> @location(0) vec4f {
  let h = 0.25 * fwidth(i.uv);
  var c = textureSample(src, smp, i.uv) * 4.0;
  c += textureSample(src, smp, i.uv - h) + textureSample(src, smp, i.uv + h);
  c += textureSample(src, smp, i.uv + vec2f(h.x, -h.y)) + textureSample(src, smp, i.uv - vec2f(h.x, -h.y));
  return c * 0.125;
}

@fragment fn upFS(i: Quad) -> @location(0) vec4f {
  let h = 0.5 / vec2f(textureDimensions(src));
  var c = textureSample(src, smp, i.uv + vec2f(-2.0 * h.x, 0.0)) + textureSample(src, smp, i.uv + vec2f(2.0 * h.x, 0.0));
  c += textureSample(src, smp, i.uv + vec2f(0.0, -2.0 * h.y)) + textureSample(src, smp, i.uv + vec2f(0.0, 2.0 * h.y));
  c += 2.0 * (textureSample(src, smp, i.uv + h) + textureSample(src, smp, i.uv - h));
  c += 2.0 * (textureSample(src, smp, i.uv + vec2f(h.x, -h.y)) + textureSample(src, smp, i.uv - vec2f(h.x, -h.y)));
  return c / 12.0;
}

struct U {
  res: vec2f,
  aspect: f32,
  sigma: f32,
  power: f32,
  exposure: f32,
  peak: f32,   // display white: 1 on SDR, the HDR headroom we allow above it otherwise
  halo: f32,   // gain on the glare pyramid
  dither: f32, // one output LSB, 0 when the output is float
  frame: f32,
}

@group(1) @binding(0) var<uniform> v: U;
@group(1) @binding(1) var glow: texture_2d<f32>;

const KNEE = 0.5;
const Y = vec3f(0.2290, 0.6917, 0.0793); // Display-P3 luminance

// Linear light in, straight up to the knee, then a hyperbolic shoulder that approaches the peak slowly
// enough that a hot spot keeps its shape instead of flattening into a plateau.
fn shoulder(l: f32) -> f32 {
  let x = max(l - KNEE, 0.0);
  return min(l, KNEE + x / (1.0 + x / (v.peak - KNEE)));
}

// Interleaved gradient noise (Jimenez 2014): blue-ish, cheap, decorrelated frame to frame.
fn ign(p: vec2f) -> f32 { return fract(52.9829189 * fract(dot(p, vec2f(0.06711056, 0.00583715)))); }

// Phosphor response: luminance shoulders into the display's peak with hue held; only past the knee
// does a hot spot burn toward white, and no channel ever clips flat.
@fragment fn displayFS(i: Quad) -> @location(0) vec4f {
  let e = (textureSample(src, smp, i.uv).rgb + textureSample(glow, smp, i.uv).rgb * v.halo) * v.exposure;
  let l = dot(e, Y);
  let f = shoulder(l);
  let w = clamp((f - KNEE) / (v.peak - KNEE), 0.0, 1.0);
  var c = mix(e * (f / max(l, 1e-9)), vec3f(f), w * w);
  let m = max(c.r, max(c.g, c.b));
  if (m > v.peak) { c = f + (c - f) * ((v.peak - f) / (m - f)); }
  c = select(12.92 * c, 1.055 * pow(c, vec3f(1.0 / 2.4)) - 0.055, c > vec3f(0.0031308));
  return vec4f(c + (ign(i.pos.xy + 5.588238 * v.frame) - 0.5) * v.dither, 1.0);
}

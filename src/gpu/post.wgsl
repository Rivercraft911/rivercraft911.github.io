// Bloom and the phosphor display.

struct Quad { @builtin(position) pos: vec4f, @location(0) uv: vec2f }

@vertex fn quadVS(@builtin(vertex_index) i: u32) -> Quad {
  let p = vec2f(f32((i << 1u) & 2u), f32(i & 2u));
  return Quad(vec4f(p * 2.0 - 1.0, 0.0, 1.0), vec2f(p.x, 1.0 - p.y));
}

@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var smp: sampler;

// Dual Kawase bloom.
@fragment fn downFS(i: Quad) -> @location(0) vec4f {
  let h = 0.5 / vec2f(textureDimensions(src));
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
  bloom: f32,
  time: f32,
}

@group(1) @binding(0) var<uniform> v: U;
@group(1) @binding(1) var glow: texture_2d<f32>;

fn hash(p: vec2f) -> f32 { return fract(sin(dot(p, vec2f(12.9898, 78.233))) * 43758.5453); }

// Phosphor response: each channel saturates on its own, so a hot spot burns toward white.
@fragment fn displayFS(i: Quad) -> @location(0) vec4f {
  let e = textureSample(src, smp, i.uv).rgb + textureSample(glow, smp, i.uv).rgb * v.bloom;
  var c = 1.0 - exp(-e * v.exposure);
  let hot = 1.0 - exp(-dot(e, vec3f(0.25, 0.5, 0.25)) * v.exposure * 0.12);
  c = mix(c, vec3f(1.0), hot * hot);
  let grain = (hash(i.pos.xy + fract(v.time) * 91.7) - 0.5) / 255.0;
  return vec4f(c + grain, 1.0);
}

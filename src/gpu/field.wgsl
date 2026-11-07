// Every field shader starts with this. A field defines fn field(q: vec2f) -> vec3f: the light the raster
// lays down at scope point q (x across [−aspect, aspect], y up [−1, 1]), in the phosphor's linear units.

struct F {
  res: vec2f,   // the raster's size in px
  aspect: f32,
  px: f32,      // one raster pixel in scope units
  p: array<vec4f, 15>, // the scene's parameters
}

@group(0) @binding(0) var<uniform> u: F;
@group(0) @binding(1) var smp: sampler;
@group(0) @binding(2) var data: texture_2d<f32>; // the scene's own rows of data, if it has any

@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  return vec4f(f32((i << 1u) & 2u) * 2.0 - 1.0, f32(i & 2u) * 2.0 - 1.0, 0.0, 1.0);
}

// A raymarch that diverges can return NaN or infinity. One such pixel, blurred by the halo and held by the
// phosphor's memory, grows into a grey or black blot that never fades: so it is light 0, here, at the source.
fn finite(c: vec3f) -> vec3f {
  let e = bitcast<vec3u>(c) & vec3u(0x7f800000u); // an all-ones exponent is NaN or infinity; fast math can't fold this away
  let ok = (e != vec3u(0x7f800000u)) & (abs(c) < vec3f(1e4));
  return select(vec3f(0.0), max(c, vec3f(0.0)), ok);
}

// Read out as text, how much of this pixel is text and how much light (raster.wgsl): a field may say.
var<private> text = 1.0;

@fragment fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let c = finite(field(vec2f((pos.x / u.res.x * 2.0 - 1.0) * u.aspect, 1.0 - pos.y / u.res.y * 2.0)));
  return vec4f(c, clamp(text, 0.0, 1.0));
}

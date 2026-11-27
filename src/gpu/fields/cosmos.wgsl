// The cosmos (src/gpu/cosmos.ts), baked: the light from beyond along the unit ray rd, in the phosphor's units, read at
// the pixel's own footprint (camera.wgsl's cone()). The whole sky, then each marvel and strange one laid over it: what
// it lets through of what is behind it, and its own light. Until it is baked it is dark; then it comes in out of the
// dark, coarse; then it sharpens, never all at once.

// Each marvel's right (and the tangent of half its width), its up, its middle: the three marvels, then the strange ones;
// and in the last slot's right, how far the sky, the marvels and the strange ones have come in: 0 to 1 out of the dark,
// then 1 to 3 sharpening (cosmos.ts).
struct Marvel { x: vec4f, y: vec4f, z: vec4f }
@group(1) @binding(0) var cosmosSky: texture_cube<f32>;
@group(1) @binding(1) var cosmosMarvels: texture_2d_array<f32>;
@group(1) @binding(2) var cosmosSmp: sampler;
@group(1) @binding(3) var<uniform> MARVEL: array<Marvel, 16>;
@group(1) @binding(4) var cosmosStrange: texture_2d_array<f32>;

const COSMOS = 0.3; // stored as 1 − e^(−light / COSMOS) (universe.wgsl)
fn cosmosLight(s: vec3f) -> vec3f { return -COSMOS * log(1.0 - min(s, vec3f(0.999))); }
// the level a texture n texels across is read at for footprint w, no finer than it has come to
fn cosmosLod(w: f32, n: f32, come: f32) -> f32 { return max(log2(w * n * 0.5), 3.0 - come); }
// where ray rd falls on marvel v's patch, in [−1, 1]² (outside it, beyond 1)
fn cosmosAt(rd: vec3f, v: Marvel) -> vec2f {
  let z = dot(rd, v.z.xyz);
  return select(vec2f(2.0), vec2f(dot(rd, v.x.xyz), dot(rd, v.y.xyz)) / (z * v.x.w), z > 0.0);
}

fn cosmos(rd: vec3f) -> vec3f {
  let w = cone();
  let come = MARVEL[15].x.xyz;
  var c = cosmosLight(textureSampleLevel(cosmosSky, cosmosSmp, rd, cosmosLod(w, f32(textureDimensions(cosmosSky).x), come.x)).rgb) * min(come.x, 1.0);
  let m = f32(textureDimensions(cosmosMarvels).x);
  for (var k = 0u; k < textureNumLayers(cosmosMarvels); k++) {
    let uv = cosmosAt(rd, MARVEL[k]);
    if (all(abs(uv) < vec2f(1.0))) {
      let s = textureSampleLevel(cosmosMarvels, cosmosSmp, uv * vec2f(0.5, -0.5) + 0.5, k, cosmosLod(w / MARVEL[k].x.w, m, come.y));
      c = c * (1.0 - s.a * min(come.y, 1.0)) + cosmosLight(s.rgb) * min(come.y, 1.0);
    }
  }
  let n = f32(textureDimensions(cosmosStrange).x);
  for (var k = 0u; k < textureNumLayers(cosmosStrange); k++) {
    let uv = cosmosAt(rd, MARVEL[3u + k]);
    if (all(abs(uv) < vec2f(1.0))) {
      let s = textureSampleLevel(cosmosStrange, cosmosSmp, uv * vec2f(0.5, -0.5) + 0.5, k, cosmosLod(w / MARVEL[3u + k].x.w, n, come.z));
      c = c * (1.0 - s.a * min(come.z, 1.0)) + cosmosLight(s.rgb) * min(come.z, 1.0);
    }
  }
  return c;
}
// How much of what lies beyond the galaxy its dust hides along rd: stars behind its lanes are as hidden.
fn cosmosDust(rd: vec3f) -> f32 { return textureSampleLevel(cosmosSky, cosmosSmp, rd, 0.0).a * min(MARVEL[15].x.x, 1.0); }

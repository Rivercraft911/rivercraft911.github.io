// The cosmos (src/gpu/cosmos.ts), baked: the light from beyond along the unit ray rd, in the phosphor's units, read at
// the pixel's own footprint (camera.wgsl's cone()). The whole sky, then each marvel laid over it: what it lets through
// of what is behind it, and its own light. Until it is baked it is dark; then coarse; then sharp.

struct Marvel { x: vec4f, y: vec4f, z: vec4f } // its right (and the tangent of half its width), its up, its middle
@group(1) @binding(0) var cosmosSky: texture_cube<f32>;
@group(1) @binding(1) var cosmosMarvels: texture_2d_array<f32>;
@group(1) @binding(2) var cosmosSmp: sampler;
@group(1) @binding(3) var<uniform> MARVEL: array<Marvel, 8>;

const COSMOS = 0.12; // stored as 1 − e^(−light / COSMOS) (universe.wgsl)
fn cosmosLight(s: vec3f) -> vec3f { return -COSMOS * log(1.0 - min(s, vec3f(0.999))); }

fn cosmos(rd: vec3f) -> vec3f {
  let w = cone();
  let n = f32(textureDimensions(cosmosSky).x);
  var c = cosmosLight(textureSampleLevel(cosmosSky, cosmosSmp, rd, log2(w * n * 0.5)).rgb);
  let m = f32(textureDimensions(cosmosMarvels).x);
  for (var k = 0u; k < textureNumLayers(cosmosMarvels); k++) {
    let v = MARVEL[k];
    let z = dot(rd, v.z.xyz);
    let uv = vec2f(dot(rd, v.x.xyz), dot(rd, v.y.xyz)) / (z * v.x.w);
    if (z > 0.0 && all(abs(uv) < vec2f(1.0))) {
      let s = textureSampleLevel(cosmosMarvels, cosmosSmp, uv * vec2f(0.5, -0.5) + 0.5, k, log2(w * m * 0.5 / v.x.w));
      c = c * (1.0 - s.a) + cosmosLight(s.rgb);
    }
  }
  return c;
}
// How much of what lies beyond the galaxy its dust hides along rd: stars behind its lanes are as hidden.
fn cosmosDust(rd: vec3f) -> f32 { return textureSampleLevel(cosmosSky, cosmosSmp, rd, 0.0).a; }

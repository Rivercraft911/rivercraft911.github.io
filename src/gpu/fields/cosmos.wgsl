// The cosmos (src/gpu/cosmos.ts), baked: the light from beyond along the unit ray rd, in the phosphor's units, read at
// the pixel's own footprint (camera.wgsl's cone()). The whole sky, then each marvel laid over it: what it lets through
// of what is behind it, and its own light. Until it is baked it is dark; then it comes in out of the dark, coarse; then
// it sharpens, never all at once.

// Each marvel's right (and the tangent of half its width), its up, its middle; and in the first's up.w and middle.w, how
// far the sky and the marvels have come in: 0 to 1 out of the dark, then 1 to 3 sharpening (cosmos.ts).
struct Marvel { x: vec4f, y: vec4f, z: vec4f }
@group(1) @binding(0) var cosmosSky: texture_cube<f32>;
@group(1) @binding(1) var cosmosMarvels: texture_2d_array<f32>;
@group(1) @binding(2) var cosmosSmp: sampler;
@group(1) @binding(3) var<uniform> MARVEL: array<Marvel, 8>;

const COSMOS = 0.3; // stored as 1 − e^(−light / COSMOS) (universe.wgsl)
fn cosmosLight(s: vec3f) -> vec3f { return -COSMOS * log(1.0 - min(s, vec3f(0.999))); }
// the level a texture n texels across is read at for footprint w, no finer than it has come to
fn cosmosLod(w: f32, n: f32, come: f32) -> f32 { return max(log2(w * n * 0.5), 3.0 - come); }

fn cosmos(rd: vec3f) -> vec3f {
  let w = cone();
  let ks = MARVEL[0].y.w;
  let km = MARVEL[0].z.w;
  var c = cosmosLight(textureSampleLevel(cosmosSky, cosmosSmp, rd, cosmosLod(w, f32(textureDimensions(cosmosSky).x), ks)).rgb) * min(ks, 1.0);
  let m = f32(textureDimensions(cosmosMarvels).x);
  let f = min(km, 1.0);
  for (var k = 0u; k < textureNumLayers(cosmosMarvels); k++) {
    let v = MARVEL[k];
    let z = dot(rd, v.z.xyz);
    let uv = vec2f(dot(rd, v.x.xyz), dot(rd, v.y.xyz)) / (z * v.x.w);
    if (z > 0.0 && all(abs(uv) < vec2f(1.0))) {
      let s = textureSampleLevel(cosmosMarvels, cosmosSmp, uv * vec2f(0.5, -0.5) + 0.5, k, cosmosLod(w / v.x.w, m, km));
      c = c * (1.0 - s.a * f) + cosmosLight(s.rgb) * f;
    }
  }
  return c;
}
// How much of what lies beyond the galaxy its dust hides along rd: stars behind its lanes are as hidden.
fn cosmosDust(rd: vec3f) -> f32 { return textureSampleLevel(cosmosSky, cosmosSmp, rd, 0.0).a * min(MARVEL[0].y.w, 1.0); }

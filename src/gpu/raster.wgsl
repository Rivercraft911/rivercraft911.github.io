// The raster's way into the phosphor: a field as light, or read out as text through a character generator.

struct R {
  res: vec2f,  // the phosphor's size in px
  cell: vec2f, // a text cell in px
  grid: vec2f, // columns, rows
  off: vec2f,  // where the grid starts, px
  ink: vec3f,  // the glyphs' colour
  gain: f32,   // light per frame into the phosphor
  tile: vec2f, // a glyph's tile in the atlas, px
  cols: f32,   // atlas tiles per row
  n: f32,      // glyphs
  lift: f32,   // scene light to coverage
  dim: f32,    // how dark a glyph may get in a dark cell
}

@group(0) @binding(0) var<uniform> r: R;
@group(0) @binding(1) var smp: sampler;
@group(0) @binding(2) var src: texture_2d<f32>;   // the field
@group(0) @binding(3) var cells: texture_2d<f32>; // per cell: glyph, light
@group(0) @binding(4) var atlas: texture_2d<f32>;
@group(0) @binding(5) var<uniform> glyph: array<vec4f, 960>; // per glyph, 15 × vec4: ink over its 6 × 10 grid

const Y = vec3f(0.2290, 0.6917, 0.0793);

@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  return vec4f(f32((i << 1u) & 2u) * 2.0 - 1.0, f32(i & 2u) * 2.0 - 1.0, 0.0, 1.0);
}

// The field as light: the raster's frame, linearly reconstructed at the phosphor's resolution.
@fragment fn lightFS(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  return vec4f(textureSampleLevel(src, smp, pos.xy / r.res, 0.0).rgb * r.gain, 0.0);
}

// A world's shot (raster.ts SHOT): the field's frame shrunk to 512 × 320, four taps a pixel so its detail
// averages instead of aliasing.
@fragment fn shotFS(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let uv = pos.xy / vec2f(512.0, 320.0);
  let d = 0.25 / vec2f(512.0, 320.0);
  var c = vec3f(0.0);
  for (var i = 0; i < 4; i++) {
    c += textureSampleLevel(src, smp, uv + d * (vec2f(f32(i & 1), f32(i >> 1)) * 2.0 - 1.0), 0.0).rgb;
  }
  return vec4f(0.25 * c, 1.0);
}

// A shot's next mip: each texel the mean of the four under it, one bilinear tap at their shared corner.
@fragment fn mipFS(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  return vec4f(textureSampleLevel(src, smp, 2.0 * pos.xy / vec2f(textureDimensions(src)), 0.0).rgb, 1.0);
}

// One fragment per cell. The field was rendered at 6 × 10 pixels a cell: the cell's shape, as the ink it
// asks for (light saturates into coverage), each sample raised to a power over the cell's darkest-to-
// brightest so an edge reads as an edge. The glyph whose ink over the same grid is nearest wins, so dim
// light prints sparse glyphs and bright light dense ones, each shaped like what it covers.
const SHARP = 1.8;
@fragment fn cellFS(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let c = vec2i(floor(pos.xy)) * vec2i(6, 10);
  var d: array<vec4f, 15>;
  var hi = 0.0;
  for (var i = 0; i < 60; i++) {
    let v = 1.0 - exp(-r.lift * dot(textureLoad(src, c + vec2i(i % 6, i / 6), 0).rgb, Y));
    d[i / 4][i % 4] = v;
    hi = max(hi, v);
  }
  if (hi < 0.02) { return vec4f(0.0); }
  for (var k = 0; k < 15; k++) { d[k] = hi * pow(d[k] / hi, vec4f(SHARP)); }
  var best = 0.0;
  var err = 0.0;
  for (var k = 0; k < 15; k++) { err += dot(d[k], d[k]); } // the space's
  for (var g = 1; g < i32(r.n); g++) {
    var e = 0.0;
    for (var k = 0; k < 15; k++) {
      let x = d[k] - glyph[g * 15 + k];
      e += dot(x, x);
    }
    if (e < err) { err = e; best = f32(g); }
  }
  return vec4f(best, hi, 0.0, 0.0);
}

// Each pixel finds its cell and shows that cell's glyph from the atlas, four taps a pixel so a tile drawn
// larger than the cell still lands without aliasing.
@fragment fn textFS(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let p = pos.xy - r.off;
  let c = floor(p / r.cell);
  if (any(c < vec2f(0.0)) || any(c >= r.grid)) { return vec4f(0.0); }
  let g = textureLoad(cells, vec2i(c), 0);
  if (g.x <= 0.0) { return vec4f(0.0); }
  let tile = vec2f(g.x - r.cols * floor(g.x / r.cols), floor(g.x / r.cols));
  let scale = r.tile / r.cell / vec2f(textureDimensions(atlas));
  let o = tile * r.tile / vec2f(textureDimensions(atlas)) + (p - c * r.cell) * scale;
  var ink = 0.0;
  for (var i = 0; i < 4; i++) {
    ink += textureSampleLevel(atlas, smp, o + (vec2f(f32(i & 1), f32(i >> 1)) - 0.5) * 0.5 * scale, 0.0).r;
  }
  let lit = mix(r.dim, 1.0, g.y) + 1.5 * pow(g.y, 6.0); // the fullest cells burn past white
  return vec4f(r.ink * (0.25 * ink * lit * r.gain), 0.0);
}

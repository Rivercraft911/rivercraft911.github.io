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
@group(0) @binding(5) var<uniform> glyph: array<vec4f, 256>; // per glyph, 4 × vec4: ink over its 3 × 5 grid

const Y = vec3f(0.2290, 0.6917, 0.0793);

@vertex fn vs(@builtin(vertex_index) i: u32) -> @builtin(position) vec4f {
  return vec4f(f32((i << 1u) & 2u) * 2.0 - 1.0, f32(i & 2u) * 2.0 - 1.0, 0.0, 1.0);
}

// The field as light: the raster's frame, linearly reconstructed at the phosphor's resolution.
@fragment fn lightFS(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  return vec4f(textureSampleLevel(src, smp, pos.xy / r.res, 0.0).rgb * r.gain, 0.0);
}

// One fragment per cell. The field was rendered at twice the 3 × 5 grid, so each bilinear tap at a
// block's centre is that block's mean: the cell's shape. The nearest glyph by ink layout wins.
@fragment fn cellFS(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let c = floor(pos.xy);
  let size = vec2f(textureDimensions(src));
  var d: array<f32, 15>;
  var sum = 0.0;
  var hi = 1e-6;
  for (var b = 0; b < 5; b++) {
    for (var a = 0; a < 3; a++) {
      let t = (vec2f(c.x * 3.0 + f32(a), c.y * 5.0 + f32(b)) * 2.0 + 1.0) / size;
      let v = dot(textureSampleLevel(src, smp, t, 0.0).rgb, Y);
      d[b * 3 + a] = v;
      sum += v;
      hi = max(hi, v);
    }
  }
  // Coverage saturates like ink does; the brightest block sets how sharply the rest are read.
  let k = 1.0 - exp(-hi * r.lift);
  for (var i = 0; i < 15; i++) { d[i] = k * pow(d[i] / hi, 1.5); }
  var best = 0.0;
  var err = 1e9;
  for (var g = 0; g < i32(r.n); g++) {
    var e = 0.0;
    for (var i = 0; i < 15; i++) {
      let x = d[i] - glyph[g * 4 + i / 4][i % 4];
      e += x * x;
    }
    if (e < err) { err = e; best = f32(g); }
  }
  return vec4f(best, sum / 15.0, 0.0, 0.0);
}

// Each pixel finds its cell and shows that cell's glyph from the atlas.
@fragment fn textFS(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let p = pos.xy - r.off;
  let c = floor(p / r.cell);
  if (any(c < vec2f(0.0)) || any(c >= r.grid)) { return vec4f(0.0); }
  let g = textureLoad(cells, vec2i(c), 0);
  let tile = vec2f(g.x - r.cols * floor(g.x / r.cols), floor(g.x / r.cols));
  let uv = (tile + (p - c * r.cell) / r.cell) * r.tile / vec2f(textureDimensions(atlas));
  let ink = textureSampleLevel(atlas, smp, uv, 0.0).r;
  let lit = mix(r.dim, 1.0, 1.0 - exp(-g.y * r.lift));
  return vec4f(r.ink * (ink * lit * r.gain), 0.0);
}

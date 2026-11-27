// The raster's way into the phosphor: a field as light, or read out as text through a character generator,
// or both: a field's alpha says how much of each pixel is read out as text, and the rest is light.

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
  fine: f32,   // the field's pixels across a grid step of a cell
  focus: f32,  // the lens: where it is focused, world units
  aper: f32,   // its blur at infinity, px (0: a pinhole)
  spin: f32,   // this frame's turn of the lens's sampling pattern
  tint: f32,   // how far a glyph takes the colour of the light it reads
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

@group(0) @binding(6) var solids: texture_2d<f32>; // the mesh pass's light (mesh.ts), premultiplied, at the phosphor's size
@group(0) @binding(7) var near: texture_2d<f32>;   // how far each pixel's solid is
@group(0) @binding(8) var far: texture_2d<f32>;    // how far the field's light came from (field.wgsl), at the field's size
@group(0) @binding(10) var shade: texture_2d<f32>; // the traced ground (trace.wgsl): its light against its light in the open, × whether it is ground

// The field as light, linearly reconstructed at the phosphor's resolution, with whatever solid thing stands in front
// of it laid over it by how much of each pixel it covers; and how far away that is.
fn at(px: vec2f) -> vec4f {
  let q = clamp(px, vec2f(0.5), r.res - 0.5);
  let m = textureLoad(solids, vec2i(q), 0);
  let D = vec2f(textureDimensions(far));
  let d = select(textureLoad(far, vec2i(q / r.res * D), 0).r, textureLoad(near, vec2i(q), 0).r, m.a > 0.5);
  // the ground the field drew, in the shadow and the bounced light of what stands on it
  let S = vec2f(textureDimensions(shade));
  let g = textureSampleLevel(shade, smp, clamp(q / r.res, 0.5 / S, 1.0 - 0.5 / S), 0.0);
  let lit = select(vec3f(1.0), g.rgb / g.a, g.a > 0.02);
  return vec4f(textureSampleLevel(src, smp, q / r.res, 0.0).rgb * lit * (1.0 - m.a) + m.rgb, d);
}

// A thin lens's circle of confusion, px: zero at the focus, the full aperture at infinity.
fn coc(d: f32) -> f32 { return min(r.aper * abs(1.0 - r.focus / max(d, 1e-6)), 48.0); }

@group(0) @binding(9) var half: texture_2d<f32>; // the same, at half size, for the lens to gather from

// The scene and its distance at half size: one filtered tap of it is four of the full one, which is all a blur needs.
@fragment fn halfFS(@builtin(position) pos: vec4f) -> @location(0) vec4f { return at(pos.xy * 2.0); }

@fragment fn lightFS(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let c = at(pos.xy);
  if (r.aper <= 0.0) { return vec4f(c.rgb * r.gain, 0.0); }
  // Scatter as gather: each tap round the pixel adds its light here if its own blur disc reaches this far, spread
  // over that disc's area; a tap behind a sharp pixel may not blur over it. The pattern turns every frame, and the
  // phosphor's persistence averages the turns into a smooth bokeh. The taps are read from the half-size scene.
  let R0 = coc(c.a);
  let reach = min(48.0, r.aper * 1.2 + 1.0);
  var acc = vec4f(c.rgb, 1.0) / max(R0 * R0, 1.0);
  let H = vec2f(textureDimensions(half));
  for (var i = 0; i < 32; i++) {
    let rr = sqrt((f32(i) + 0.5) / 32.0) * reach;
    let th = f32(i) * 2.3999632 + r.spin;
    let s = textureSampleLevel(half, smp, clamp((pos.xy + vec2f(cos(th), sin(th)) * rr) / r.res, 0.5 / H, 1.0 - 0.5 / H), 0.0);
    let cs = select(coc(s.a), min(coc(s.a), R0), s.a > c.a);
    let w = clamp(cs - rr + 1.0, 0.0, 1.0) / max(cs * cs, 1.0);
    acc += vec4f(s.rgb * w, w);
  }
  return vec4f(acc.rgb / acc.a * r.gain, 0.0);
}

// One fragment per cell. The field was rendered at 6 × 10 pixels a cell (each fine × fine): the cell's shape, as the ink it
// asks for (light saturates into coverage), each sample raised to a power over the cell's darkest-to-
// brightest so an edge reads as an edge. The glyph whose ink over the same grid is nearest wins, so dim
// light prints sparse glyphs and bright light dense ones, each shaped like what it covers.
const SHARP = 1.8;
@fragment fn cellFS(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let m = i32(r.fine);
  let c = vec2i(floor(pos.xy)) * vec2i(6, 10) * m;
  var d: array<vec4f, 15>;
  var hi = 0.0;
  for (var i = 0; i < 60; i++) {
    var s = vec4f(0.0);
    for (var j = 0; j < m * m; j++) { s += textureLoad(src, c + vec2i(i % 6, i / 6) * m + vec2i(j % m, j / m), 0); }
    s /= f32(m * m);
    // a solid thing standing in front of the field is read out too, over the same sixtieth of the cell
    let o = textureLoad(solids, vec2i(r.off + (floor(pos.xy) + (vec2f(f32(i % 6), f32(i / 6)) + 0.5) / vec2f(6.0, 10.0)) * r.cell), 0);
    s = vec4f(s.rgb * (1.0 - o.a) + o.rgb, max(s.a, o.a));
    let v = (1.0 - exp(-r.lift * dot(s.rgb, Y))) * s.a; // only the text part of it asks for ink
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
// larger than the cell still lands without aliasing; and whatever of the field is not text, as light.
@fragment fn textFS(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let f = textureSampleLevel(src, smp, pos.xy / r.res, 0.0);
  let light = vec4f(f.rgb * (1.0 - f.a) * r.gain, 0.0);
  let p = pos.xy - r.off;
  let c = floor(p / r.cell);
  if (any(c < vec2f(0.0)) || any(c >= r.grid)) { return light; }
  let g = textureLoad(cells, vec2i(c), 0);
  if (g.x <= 0.0) { return light; }
  let tile = vec2f(g.x - r.cols * floor(g.x / r.cols), floor(g.x / r.cols));
  let scale = r.tile / r.cell / vec2f(textureDimensions(atlas));
  let o = tile * r.tile / vec2f(textureDimensions(atlas)) + (p - c * r.cell) * scale;
  var ink = 0.0;
  for (var i = 0; i < 4; i++) {
    ink += textureSampleLevel(atlas, smp, o + (vec2f(f32(i & 1), f32(i >> 1)) - 0.5) * 0.5 * scale, 0.0).r;
  }
  let lit = mix(r.dim, 1.0, g.y) + 1.5 * pow(g.y, 6.0); // the fullest cells burn past white
  // in the colour of the light it reads, at the ink's brightness, if it is tinted
  let s = textureSampleLevel(src, smp, (r.off + (c + 0.5) * r.cell) / r.res, 0.0).rgb;
  let hue = s / max(dot(s, Y), 1e-6);
  let col = mix(r.ink, dot(r.ink, Y) * min(hue, vec3f(4.0)), r.tint * smoothstep(0.0, 1e-4, dot(s, Y)));
  return light + vec4f(col * (0.25 * ink * lit * r.gain), 0.0);
}

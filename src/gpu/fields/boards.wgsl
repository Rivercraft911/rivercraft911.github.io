// The long zoom's boards (zoom.ts). Each is a plane, River's board as KiCad drew it, hung under the hole of the
// one above at the size that fits it, so a ray from the eye meets the nearest board, and where that board is not
// (past its edge, or down a hole) it goes on to the next. Each board is read from the atlas (src/boards): the whole
// picture, then the close-ups baked around its hole, each blended in where the pixel can show more than the one
// before, so the picture stays sharp near the hole as the zoom runs on into it and goes soft away from it, as a
// macro lens's would. The hole itself is cut exactly, its edge a pixel wide at any zoom. The light: the picture's
// own, turned a little by a lamp over the stack, bumped by the picture's own slope, and glinting on gold and tin.
//
// BOARD (from fields.ts), per board: (w, h, hole x, hole y) mm, (drill, pad, pictures, 0), then per picture the
// mm box it covers (x0, y0, w, h) and where it sits in the atlas (x, y, w, h) texels.
// p[4..6] the planes in view, nearest first: (Ox, Oy, S, z): on the plane z the frame's point (x, y) is the
// board's (Ox, Oy) + (x, −y) / S mm   p[7] which board each plane is (−1: none)   p[8] the lamp, gain
// p[9] the glint, the bump, the lip's light

const K = 12;

fn lum(c: vec4f) -> f32 { return dot(c.rgb, vec3f(0.3, 0.59, 0.11)); }

var<private> slope: vec2f;

// A picture, its mm box m and atlas rect a, at q, at the mip a pixel fp mm wide needs: premultiplied. Its light's
// slope across a texel of that mip goes to slope.
fn tap(m: vec4f, a: vec4f, q: vec2f, fp: f32) -> vec4f {
  let k = a.z / m.z;
  let lod = clamp(log2(fp * k), 0.0, 9.0);
  let e = exp2(lod);
  let t = clamp(a.xy + (q - m.xy) * k, a.xy + 0.5 * e, a.xy + a.zw - 1.5 * e); // never into a neighbour's cells
  let A = vec2f(textureDimensions(data));
  let c = textureSampleLevel(data, smp, t / A, lod);
  let l = lum(c);
  slope = vec2f(lum(textureSampleLevel(data, smp, (t + vec2f(e, 0.0)) / A, lod)) - l, lum(textureSampleLevel(data, smp, (t + vec2f(0.0, e)) / A, lod)) - l);
  return c;
}

// Board b at q (mm, y down), a pixel fp mm across there, seen along rd: its light, and how much of the pixel it covers.
fn board(b: i32, q: vec2f, fp: f32, rd: vec3f) -> vec4f {
  let i = b * K;
  let s = BOARD[i];
  let h = BOARD[i + 1];
  if (any(q < vec2f(0.0)) || any(q > s.xy)) { return vec4f(0.0); }
  var c = tap(BOARD[i + 2], BOARD[i + 3], q, fp);
  var k = BOARD[i + 3].z / BOARD[i + 2].z; // texels per mm, so far
  var g = slope;
  for (var j = 1; j < i32(h.z); j++) {
    let m = BOARD[i + 2 + 2 * j];
    let a = BOARD[i + 3 + 2 * j];
    let e = abs((q - m.xy) / m.zw - 0.5);
    let w = smoothstep(0.5, 0.4, max(e.x, e.y)) * smoothstep(1.2, 0.6, fp * k);
    if (w <= 0.0) { break; } // the finer ones are smaller still, round the same hole, and finer
    c = mix(c, tap(m, a, q, fp), w);
    g = mix(g, slope, w);
    k = a.z / m.z;
  }
  // the edges a texel's mip blurs, cut back to a pixel: the alpha's half-way line, sharpened by the magnification
  var cover = clamp((c.a - 0.5) * max(1.0, 1.0 / (fp * k)) + 0.5, 0.0, 1.0);
  let r = length(q - s.zw);
  cover *= clamp((r - 0.5 * h.x) / fp + 0.5, 0.0, 1.0); // the hole, exactly
  if (cover <= 0.0) { return vec4f(0.0); }

  let col = pow(c.rgb / max(c.a, 1e-3), vec3f(2.2));
  let n = normalize(vec3f(-g * u.p[9].y, 1.0));
  let l = u.p[8].xyz;
  let hv = normalize(l - rd);
  let gold = smoothstep(0.08, 0.25, min(col.r - col.b, col.g - col.b) - 0.4 * abs(col.r - 1.6 * col.g)); // gold, and the yellow of tin under flux
  let tin = smoothstep(0.35, 0.7, min(col.r, min(col.g, col.b)));
  let metal = max(gold, 0.5 * tin);
  let spec = pow(max(dot(n, hv), 0.0), 48.0) * metal * u.p[9].x;
  var lit = col * (0.6 + 0.55 * max(dot(n, l), 0.0)) + spec * mix(vec3f(1.0), col / max(col.g, 0.05), gold * 0.6);
  // a plated hole's lip, catching the lamp
  if (h.y > h.x) { lit += vec3f(1.0, 0.62, 0.3) * u.p[9].z * exp(-pow((r - 0.5 * h.x) / (fp + 0.03 * h.x), 2.0)); }
  return vec4f(lit * cover, cover);
}

fn field(q: vec2f) -> vec3f {
  let ro = eye();
  let rd = ray(q);
  var light = vec3f(0.0);
  var through = 1.0;
  for (var j = 0; j < 3; j++) {
    let L = u.p[4 + j];
    let b = i32(u.p[7][j]);
    if (b < 0) { break; }
    let t = (L.w - ro.z) / rd.z;
    if (t <= 0.0) { continue; }
    let x = ro.xy + rd.xy * t;
    let s = board(b, L.xy + vec2f(x.x, -x.y) / L.z, cone() * t / max(abs(rd.z), 0.1) / L.z, rd);
    light += through * s.rgb;
    through *= 1.0 - s.a;
    if (through < 0.004) { break; }
  }
  return light * u.p[8].w;
}

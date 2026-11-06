// R4 · The Kaliset, as a volume (Kali's Star Nest): every point of space is iterated p ↦ |p|/(p·p) − c, the
// inversion that folds the outside in, and how wildly its length jumps from step to step is how much light
// it gives. Space is folded into a lattice of such cells, so we fall through it without end. Nebula colours,
// the far ones reddened.
//
// p[0..3] camera   p[4] c, gain   p[5] tile, brightness

fn field(q: vec2f) -> vec3f {
  let ro = eye();
  let rd = ray(q);
  let c = u.p[4].xyz;
  let tile = u.p[5].x;
  var light = vec3f(0.0);
  var s = 0.12;
  var fade = 1.0;
  for (var v = 0; v < 18; v++) {
    var p = ro + rd * s;
    p = abs(vec3f(tile) - (p - 2.0 * tile * floor(p / (2.0 * tile)))); // a mirrored lattice
    var pa = 0.0;
    var a = 0.0;
    for (var i = 0; i < 15; i++) {
      p = abs(p) / dot(p, p) - c;
      let l = length(p);
      a += abs(l - pa);
      pa = l;
    }
    a = a * a * a;
    light += vec3f(s, s * s, s * s * s * s) * a * 0.0012 * fade;
    fade *= 0.78;
    s += 0.11;
  }
  light = mix(vec3f(length(light)), light, 0.85);
  return light * vec3f(0.6, 0.5, 1.1) * u.p[5].y * u.p[4].w;
}

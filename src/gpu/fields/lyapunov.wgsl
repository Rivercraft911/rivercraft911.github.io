// R4 · A Lyapunov fractal (Markus) on the DVB-S2 start-of-frame word, 0x18D2E82: the logistic map
// x ↦ r x (1 − x) with r stepping through its 26 bits, a where a bit is 1 and b where it is 0. The plane is
// (a, b); each point is coloured by the Lyapunov exponent λ = (1/N) Σ ln |r (1 − 2x)| of its orbit: gold
// where the orbit settles (λ < 0), the stable sheets bright where λ is near zero, ink-blue where it is chaos.
//
// p[4] centre (a, b), half-height, gain   p[5] turn

const SOF = 0x18D2E82u;

fn field(q: vec2f) -> vec3f {
  let c = u.p[4].xy;
  let k = u.p[4].z;
  let ang = u.p[5].x;
  let ab = c + k * vec2f(cos(ang) * q.x - sin(ang) * q.y, sin(ang) * q.x + cos(ang) * q.y);
  if (any(ab < vec2f(0.0)) || any(ab > vec2f(4.0))) { return vec3f(0.0); }
  var x = 0.5;
  var lam = 0.0;
  for (var n = 0u; n < 182u; n++) { // seven times through the word; the first is let settle
    let r = select(ab.y, ab.x, ((SOF >> (25u - n % 26u)) & 1u) == 1u);
    x = r * x * (1.0 - x);
    if (n >= 26u) { lam += log(max(abs(r * (1.0 - 2.0 * x)), 1e-6)); }
  }
  lam /= 156.0;
  var col: vec3f;
  if (lam < 0.0) {
    let g = exp(lam * 1.6);
    col = mix(vec3f(0.12, 0.05, 0.0), vec3f(1.6, 1.0, 0.25), g) + vec3f(1.2, 1.1, 0.8) * pow(g, 12.0);
  } else {
    col = vec3f(0.01, 0.05, 0.24) * exp(-lam * 2.5) + vec3f(0.0, 0.003, 0.015);
  }
  return col * u.p[4].w;
}

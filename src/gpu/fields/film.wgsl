// Thin-film interference: the light a soap film (n = 1.33) d nm thick reflects at 630, 532 and 465 nm,
// seen at cos c inside the film. Airy's sum over the bounces, with the half-wave flip at the outer face:
// R = F sin²(δ/2) / (1 + F sin²(δ/2)), δ = 4π n d c / λ, F = 4r² / (1 − r²)², r = (n − 1)/(n + 1).

fn film(d: f32, c: f32) -> vec3f {
  let F = 0.0837;
  let s = sin(6.2831853 * 1.33 * d * c / vec3f(630.0, 532.0, 465.0));
  let s2 = s * s;
  return F * s2 / (1.0 + F * s2);
}

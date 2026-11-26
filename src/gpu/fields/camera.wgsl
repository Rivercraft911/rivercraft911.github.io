// A pinhole camera, as src/acts/reality.ts aims it: p[0] eye, 1/tan(fov/2); p[1] right; p[2] up; p[3] forward.
// A negative p[0].w is a fisheye instead (Pigeon Vision's): equidistant, r = fθ, −p[0].w radians a unit of the
// screen, seeing to 100° round its axis; past its rim the field is dark (field.wgsl's `inside`).

fn eye() -> vec3f { return u.p[0].xyz; }
fn ray(q: vec2f) -> vec3f {
  if (u.p[0].w < 0.0) {
    let r = length(q);
    let th = -u.p[0].w * r;
    inside = smoothstep(1.7453, 1.7453 - 2.0 * cone(), th);
    let d = q / max(r, 1e-9);
    return normalize(u.p[3].xyz * cos(th) + (u.p[1].xyz * d.x + u.p[2].xyz * d.y) * sin(th));
  }
  return normalize(u.p[3].xyz * u.p[0].w + u.p[1].xyz * q.x + u.p[2].xyz * q.y);
}
fn cone() -> f32 { return u.px * select(1.0 / u.p[0].w, -u.p[0].w, u.p[0].w < 0.0); } // a pixel's width per unit of distance (a fisheye's: its angle)

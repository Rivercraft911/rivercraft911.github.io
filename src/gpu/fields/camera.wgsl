// A pinhole camera, as src/acts/reality.ts aims it: p[0] eye, 1/tan(fov/2); p[1] right; p[2] up; p[3] forward.

fn eye() -> vec3f { return u.p[0].xyz; }
fn ray(q: vec2f) -> vec3f { return normalize(u.p[3].xyz * u.p[0].w + u.p[1].xyz * q.x + u.p[2].xyz * q.y); }
fn cone() -> f32 { return u.px / u.p[0].w; } // a pixel's width per unit of distance

// Sphere tracing against the shader's own de(p), to a pixel's width: t along the ray and the steps it took,
// t < 0 for a miss; a ray that runs out of steps among the detail counts as a hit. And the surface normal
// there, from de's gradient.

fn march(ro: vec3f, rd: vec3f, far: f32, n: i32) -> vec2f {
  let px = cone();
  var t = 0.0;
  for (var i = 0; i < n; i++) {
    let d = de(ro + rd * t);
    if (d < px * t + 1e-5) { return vec2f(t, f32(i)); }
    t += d;
    if (t > far) { return vec2f(-1.0, f32(n)); }
  }
  return vec2f(t, f32(n));
}

fn normal(p: vec3f, e: f32) -> vec3f {
  let k = vec2f(1.0, -1.0);
  return normalize(k.xyy * de(p + k.xyy * e) + k.yyx * de(p + k.yyx * e) + k.yxy * de(p + k.yxy * e) + k.xxx * de(p + k.xxx * e));
}

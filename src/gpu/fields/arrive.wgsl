// The arrival (acts/arrive.ts): River's planet seen from inside its own air, a few kilometres up, at the sunrise
// over the hearts. It is planet.wgsl's world (it follows that file and calls into it: the same crust, the same weather,
// the same air), looked at closely: the land marched as it stands; the cloud a volume of cumulus, flat-bottomed where
// the air condenses and heaped into billows above, as tall as the weather lets it grow, lit by the sun through the
// cloud between (Beer, and the octaves of light scattered more than once); the air under it lit only where the clouds'
// shadows let the sun through, so the sun comes in shafts; and the heart's 144 LEDs a light of their own on the land
// and the cloud near it. As the eye climbs it hands the frame back to the planet's own field.
//
// p[14]  how much of the frame is the near world's (1) or the planet's own (0); the heart's beat (its LEDs, 0 to 1);
//        which place is the hearts; the scene's time
// p[1].w, p[2].w, p[3].w  where the heart's LEDs shine from (the planet's frame)

const SIGC = 6000.0;     // the cumulus's extinction, per radius (6 per km, at a thousand kilometres a radius)
const CU = 0.011;        // how tall the weather lets a cumulus grow over its base
const TOWER = vec3f(-0.1128, 0.0410, 0.02); // the tower we fall through: east and north of the hearts (rad), how tall
const LED = vec3f(1.0, 0.09, 0.12); // the LEDs' red, as their light
const MS = 3.0;          // what the light scattered many times inside adds, over the octaves' own

var<private> HP: vec3f;  // the heart's light, and how bright
var<private> HI: f32;
var<private> TW: vec3f;  // the tower's axis
var<private> COV: f32;   // how much of the sky the weather fills with cloud, here

// Where the tower stands: the hearts' place, then TOWER.xy along its east and north.
fn tower() -> vec3f {
  let S = PL[i32(u.p[14].z)];
  let e = normalize(vec3f(S.z, 0.0, -S.x));
  return normalize(S + e * TOWER.x + cross(S, e) * TOWER.y);
}

// How tall the cumulus over unit n stands over its base: cells as wide as the air's convection, as many and as tall as
// the weather allows; and the tower, a cumulonimbus. Two looks at the noise; the light and the shafts ask only this.
fn heap(n: vec3f) -> f32 {
  let w = n * 210.0 + vec3f(0.0, 0.0, 0.004 * u.p[14].w);
  let c = 0.75 * noise(w) + 0.25 * noise(w * 2.7 + 7.0);
  var h = CU * sqrt(sat((c - 1.0 + COV) / max(COV, 0.05))); // domes, steep at their feet
  let x = (1.0 - dot(n, TW)) / 0.00022; // from the tower's axis, squared, in its radii (0.021 rad)
  if (x < 4.0) { h = max(h, TOWER.z * exp(-x * x * 0.6)); }
  return h;
}

// The cloud at p, over a cumulus heap tall: solid in its core, its faces eaten into by billows (1 − |2n − 1| makes the
// creases between the puffs; the finest octave only near the eye), its base flat where the air condenses.
fn cloud(p: vec3f, tall: f32, fine: bool) -> f32 {
  let alt = length(p) - 1.0 - CB;
  let x = min(alt * 4.0, tall - alt); // depth into it: the base is sharper than the top
  if (x < -0.0008) { return 0.0; }
  let w = p * 1500.0 + vec3f(0.0, 0.0, 0.25 * u.p[14].w);
  var b = 0.6 * noise(w) + 0.27 * (1.0 - abs(2.0 * noise(w * 2.9 + 4.1) - 1.0));
  if (fine) { b += 0.13 * (1.0 - abs(2.0 * noise(w * 8.3 + 1.7) - 1.0)); } else { b += 0.07; }
  return sat(x / 0.0009 + 1.6 * b - 1.15);
}

// How much of the sun reaches p through the cumulus: two looks toward it, the second further.
fn sunthrough(p: vec3f, L: vec3f) -> f32 {
  var od = 0.0;
  var s = 0.0004;
  var at = 0.0;
  for (var i = 0; i < 2; i++) {
    at += s;
    let q = p + L * (at - 0.5 * s);
    od += cloud(q, heap(normalize(q)), false) * s;
    s *= 4.0;
  }
  return exp(-SIGC * od);
}

struct Vol { light: vec3f, through: f32, t: f32 }

// The cumulus along ro + t rd for t in [t0, t1]: clear air crossed in strides to where a heap could begin, cloud in
// steps that grow with the distance, each lit by the sun (Beer, through what lies toward it, and the octaves of light
// scattered more than once each a little further through and a little less forward), by the sky, and by the heart.
fn vclouds(ro: vec3f, rd: vec3f, t0: f32, t1: f32, L: vec3f) -> Vol {
  var v = Vol(vec3f(0.0), 1.0, t1);
  let mu = dot(rd, L);
  let ph = vec3f(mix(hg(mu, -0.25), hg(mu, 0.8), 0.7), mix(hg(mu, -0.12), hg(mu, 0.4), 0.7), mix(hg(mu, -0.06), hg(mu, 0.2), 0.7)) / (4.0 * PI);
  var t = t0 + jit * 0.0003;
  var od = -1.0;
  for (var i = 0; i < 40 && t < t1 && v.through > 0.03; i++) {
    let p = ro + rd * t;
    let r = length(p);
    let n = p / r;
    let alt = r - 1.0 - CB;
    let ds = max(0.0004, 0.04 * t);
    let tall = heap(n);
    let gap = max(-alt, alt - tall);
    if (gap > 0.0003) {
      // clear: on, as far as no heap could be met
      t += max(ds, min(gap / max(abs(dot(rd, n)), 0.1), 0.004 + 0.05 * t));
      continue;
    }
    let s = cloud(p, tall, cone() * t < 0.0004);
    if (s > 0.003) {
      if (v.t == t1) { v.t = t; }
      let tr = exp(-SIGC * s * ds);
      let sun = SUN * exp(-sunward(p, L)); // the sun as the air leaves it, before the cloud
      if ((i & 1) == 0 || od < 0.0) { od = -log(max(sunthrough(p, L), 1e-6)); } // the light is looked for every other step
      // (deep in a heap, under all of it, even the light scattered many times has been used up: it is dark in there)
      let deep = exp(-450.0 * max(tall - alt, 0.0));
      var S = MS * sun * (ph.x * exp(-od) + (0.5 * ph.y * exp(-0.5 * od) + 0.25 * ph.z * exp(-0.25 * od)) * deep);
      // the sky's light, from above more than below
      let h = sat(alt / max(tall, 1e-4));
      S += SUN * vec3f(0.035, 0.055, 0.09) * smoothstep(-0.2, 0.3, dot(n, L)) * (0.3 + 0.7 * h) * (0.15 + 0.25 * deep);
      S += HI * LED * 0.003 / (4.0 * PI * max(dot(p - HP, p - HP), 1e-5));
      v.light += v.through * S * (1.0 - tr);
      v.through *= tr;
    }
    t += ds * (0.8 + 0.4 * jit) * select(1.6, 1.0, s > 0.003); // through a gap in the billows, on faster
  }
  return v;
}

// The air along ro + t rd, t in [a, b], as planet.wgsl's air() has it, but with the sun let into the air under the
// cumulus only where their shadows allow (shade). Something stands at `cut` and lets `thr` through.
fn shafts(ro: vec3f, rd: vec3f, a: f32, b: f32, L: vec3f, cut: f32, thr: f32, n: i32) -> Air {
  let mu = dot(rd, L);
  let pr = 3.0 / (16.0 * PI) * (1.0 + mu * mu);
  let g = 0.76;
  let pm = 3.0 / (8.0 * PI) * (1.0 - g * g) * (1.0 + mu * mu) / ((2.0 + g * g) * pow(1.0 + g * g - 2.0 * g * mu, 1.5));
  let tm = clamp(-dot(ro, rd), a, b);
  let f = clamp((tm - a) / max(b - a, 1e-9), 1e-4, 1.0 - 1e-4); // (where the ray is lowest, as a share of the way: never quite an end, or a step divides by zero)
  var od = vec2f(0.0);
  var A = Air(vec3f(0.0), vec3f(1.0), vec3f(1.0));
  var seen = 1.0;
  for (var i = 0; i < n; i++) {
    let s = (f32(i) + jit) / f32(n);
    let k = select((s - f) / (1.0 - f), 1.0 - s / f, s < f);
    let t = select(tm + (b - tm) * k * k, tm - (tm - a) * k * k, s < f);
    let p = ro + rd * t;
    let r = length(p);
    let d = exp((1.0 - r) / vec2f(HR, HM)) * 2.0 * k * (b - a) / f32(n);
    od += 0.5 * d;
    let tr = exp(-(BR * od.x + 1.1 * BM * od.y));
    od += 0.5 * d;
    if (t > cut && seen == 1.0) { seen = thr; A.front = tr; }
    let lit = seen * shade(p, L);
    A.light += lit * tr * exp(-sunward(p, L)) * (d.x * BR * pr + d.y * BM * pm);
  }
  A.light *= SUN;
  A.through = exp(-(BR * od.x + 1.1 * BM * od.y));
  if (seen == 1.0) { A.front = A.through; }
  return A;
}


// ---- the land, near --------------------------------------------------------------------------------------------
// The planet's crust in its broad strokes (lay with no detail: continents, the land raised and levelled under River's
// places), and on it ridges the planet's own detail would cost too much to march: a ridged multifractal, each octave's
// ridges weighted by the one before, so the ridges are sharp and branch and the valleys between them lie smooth, as
// water and frost leave them. Down to fp; none on the sea, none on a place's level ground.
const DMAX = 0.011; // the most the ridges add
const HIGH = 0.016; // and the highest the land round the hearts stands
var<private> BASE: f32;
fn ridges(m: vec3f, fp: f32) -> f32 {
  var p = m * 24.0 + vec3f(5.1, 2.3, 7.7);
  var a = 0.0055;
  var f = 24.0;
  var w = 1.0;
  var h = 0.0;
  for (var k = 0; k < 9; k++) {
    let fade = sat(2.0 - 5.0 * f * fp);
    if (fade <= 0.0) { break; }
    let r = 1.0 - abs(2.0 * noise5(p) - 1.0);
    let s = r * r;
    h += a * s * w * fade;
    w = sat(2.2 * s);
    p = ROT * p * 2.03 + 11.3;
    f *= 2.03;
    a *= 0.5;
  }
  return h;
}
fn hgt(m: vec3f, fp: f32) -> f32 {
  BASE = lay(m, 1.0, false);
  return BASE + ridges(m, fp) * smoothstep(0.0, 0.0015, BASE) * level(nearest(m));
}

// The land, stood up: where ro + t rd meets it in [t0, t1], or −1. Over the highest the ridges could reach it strides
// on the broad land alone; under that, as far as the ground's clearance allows (a little over half of it, since the land
// leans), never less than a fraction of the way travelled, the ridges coarser far off; then the crossing by false
// position.
fn land(ro: vec3f, rd: vec3f, t0: f32, t1: f32) -> f32 {
  var t = t0;
  var a = vec2f(t, 1.0);
  for (var i = 0; i < 80; i++) {
    let p = ro + rd * t;
    let r = length(p);
    let m = p / r;
    let fall = -dot(rd, m);
    let base = lay(m, 1.0, false);
    let k = smoothstep(0.0, 0.0015, base) * level(nearest(m));
    let lean = max(fall + (0.12 + 0.6 * k) * sqrt(max(1.0 - fall * fall, 0.0)), 0.04); // how fast the ray can close on it
    var gap = r - 1.0 - base - DMAX * k;
    if (gap > cone() * t) {
      if (fall < 0.0 && r - 1.0 > HIGH) { break; } // over the highest land, and rising: it is sky from here
      a = vec2f(t, gap + DMAX * k);
      t += max(gap / lean, 0.002 * t);
      if (t > t1) { break; }
      continue;
    }
    let lod = max(5.0 * cone() * t, 2e-5);
    gap = r - 1.0 - hgt(m, lod);
    if (gap < cone() * t) {
      if (i == 0 || gap > 0.0) { return t; }
      let c = a.x + (t - a.x) * a.y / (a.y - gap);
      let pc = ro + rd * c;
      let gc = length(pc) - 1.0 - hgt(normalize(pc), lod);
      return select(c + (t - c) * gc / (gc - gap), a.x + (c - a.x) * a.y / (a.y - gc), gc < 0.0);
    }
    a = vec2f(t, gap);
    t += max(0.9 * gap / lean, 0.0015 * t);
    if (t > t1) { break; }
  }
  return -1.0;
}

// How much of the sun the cumulus lets through to o, on the ground: where the sun's ray from it crosses the middle of
// the cloud layer, how much cloud is there.
fn shade(o: vec3f, L: vec3f) -> f32 {
  let up = CB + 0.003 - (length(o) - 1.0);
  let mu = dot(normalize(o), L);
  if (up <= 0.0 || mu <= 0.0) { return 1.0; }
  return mix(1.0, exp(-2.2 * heap(normalize(o + L * (up / max(mu, 0.02)))) / CU), 0.85);
}

// The sea at o, as planet.wgsl has it (Cox and Munk's glint, sand through the water over the shelves), in a breeze.
fn sea(o: vec3f, rd: vec3f, L: vec3f, depth: f32) -> vec3f {
  let m = normalize(o);
  let mu = dot(m, L);
  let cv = max(dot(-rd, m), 0.04);
  let sun = SUN * exp(-sunward(o, L)) * shade(o, L);
  let sky = SUN * vec3f(0.035, 0.055, 0.09) * smoothstep(-0.2, 0.3, mu);
  let s2 = 0.003 + 0.00512 * (5.0 + 4.0 * noise(m * 80.0));
  let H = normalize(L - rd);
  let c2 = dot(m, H) * dot(m, H);
  let F = 0.02 + 0.98 * pow(1.0 - max(dot(-rd, H), 0.0), 5.0);
  let glint = F * exp(-(1.0 - c2) / (c2 * s2)) / (PI * s2 * 4.0 * cv * c2 * c2) * step(0.0, mu);
  let alb = mix(vec3f(0.004, 0.02, 0.05), vec3f(0.42, 0.38, 0.27), exp(depth * vec3f(500.0, 70.0, 25.0)));
  return alb * (sun * max(mu, 0.0) + sky) / PI + sun * glint + (0.02 + 0.98 * pow(1.0 - cv, 5.0)) * sky / PI;
}

// The near land's light at p, where the ray rd met it t along. Its slope from the ridges themselves; rock where it is
// steep, in beds; scrub and forest in the valleys, drier up the slopes; snow over the treeline where it can lie. Lit by
// the sun through the air, less what the ridges toward it hide (a few looks along the sun's ray, the nearest object
// the softest shadow) and what the cumulus over it shades; by the sky over it; and by the heart. Or the sea.
fn soil(p: vec3f, rd: vec3f, L: vec3f, t: f32) -> vec3f {
  let m = normalize(p);
  let fp = cone() * t;
  let h0 = hgt(m, fp);
  if (crust0 < 0.0) { return sea(m, rd, L, crust0); }
  let e1 = normalize(cross(m, select(vec3f(1.0, 0.0, 0.0), vec3f(0.0, 0.0, 1.0), abs(m.x) > 0.7)));
  let e2 = cross(m, e1);
  let ep = max(1.5 * fp, 3e-6);
  let N = normalize(m - e1 * (hgt(normalize(m + e1 * ep), fp) - h0) / ep - e2 * (hgt(normalize(m + e2 * ep), fp) - h0) / ep);
  let o = m * (1.0 + h0);
  // the ridges toward the sun
  var sh = 1.0;
  var s = max(0.0005, 4.0 * fp);
  for (var j = 0; j < 5 && dot(N, L) > 0.0; j++) {
    let q = o + L * s;
    let rq = length(q);
    sh = min(sh, sat(0.5 + (rq - 1.0 - hgt(q / rq, 2.0 * s)) / (0.1 * s)));
    s *= 2.3;
  }
  let mu = dot(m, L);
  let light = SUN * (exp(-sunward(o, L)) * shade(o, L) * sh * max(dot(N, L), 0.0) + vec3f(0.035, 0.055, 0.09) * smoothstep(-0.2, 0.3, mu) * (0.55 + 0.45 * dot(N, m)));
  // what it is made of
  let slope = 1.0 - dot(N, m);
  let v = mix(0.5, noise5(m * 9000.0), sat(1.0 - 4000.0 * fp)); // (the finest, only where a pixel is smaller than it)
  let bed = h0 * 2600.0 + 0.6 * noise5(m * 4000.0) * sat(1.0 - 2000.0 * fp);
  let rock = mix(vec3f(0.16, 0.13, 0.11), vec3f(0.3, 0.24, 0.18), fract(bed) * 0.6 + 0.4 * v);
  let wet = smoothstep(0.004, 0.0005, h0) * (0.6 + 0.4 * noise5(m * 600.0));
  var alb = mix(vec3f(0.19, 0.15, 0.08), mix(vec3f(0.05, 0.06, 0.025), vec3f(0.02, 0.04, 0.015), v), wet);
  alb = mix(alb, rock, smoothstep(0.06, 0.18, slope));
  alb = mix(alb, vec3f(0.85, 0.88, 0.93), smoothstep(0.0075, 0.0095, h0 + 0.002 * v) * smoothstep(0.2, 0.08, slope));
  let l = HP - o;
  return alb * (light + HI * LED * 0.004 * max(dot(N, normalize(l)), 0.0) / max(dot(l, l), 1e-5)) / PI;
}

fn near(q: vec2f) -> vec3f {
  let R = u.p[4].w;
  let ro = local(-u.p[4].xyz / R);
  let rd = local(ray(q));
  let L = local(u.p[5].xyz);
  places();
  TW = tower();
  HP = local(vec3f(u.p[1].w, u.p[2].w, u.p[3].w));
  HI = u.p[14].y;
  let px = (q * vec2f(1.0 / u.aspect, -1.0) * 0.5 + 0.5) * u.res;
  jit = fract(52.9829189 * fract(dot(px, vec2f(0.06711056, 0.00583715))) + 0.618034 * fract(u.p[14].w * 60.0));
  wx = weather(normalize(ro));
  COV = sat(0.3 + 0.35 * wx);

  let top = ball(ro, rd, TOP);
  if (top.y <= 0.0) { return backdrop(rd, L, 1.0) * u.p[8].x; }
  let a = max(top.x, 0.0);
  // the cumulus first, as far as the land could be; then the land, if the cloud lets any of it be seen
  let g = ball(ro, rd, 1.0);
  let zt = ball(ro, rd, 1.0 + ZT);
  let sh = ball(ro, rd, 1.0 + CB + TOWER.z);
  let floor = select(top.y, g.x, g.x > 0.0);
  var cl = Vol(vec3f(0.0), 1.0, floor);
  if (sh.y > 0.0) { cl = vclouds(ro, rd, max(sh.x, 0.0), min(sh.y, floor), L); }
  var tg = -1.0;
  if (cl.through > 0.03 && zt.y > 0.0) { tg = land(ro, rd, max(zt.x, 0.0), min(zt.y, floor)); }
  if (tg < 0.0 && g.x > 0.0) { tg = g.x; }
  let hit = tg > 0.0;
  let b = select(top.y, tg, hit);
  // (cloud past the land was summed as if in front of it: take it back out)
  if (hit && cl.t > tg) { cl = Vol(vec3f(0.0), 1.0, b); }
  var col = vec3f(0.0);
  if (hit) {
    dist = tg * R;
    if (cl.through > 0.03) {
      let p = ro + rd * tg;
      col = soil(p, rd, L, tg);
    }
  }
  // a solid behind the cloud shows through as much of the time as the cloud lets it, the phosphor averaging the rest
  if (cl.through < jit) { dist = cl.t * R; }
  let A = shafts(ro, rd, a, select(b, cl.t, cl.through < 0.03), L, cl.t, cl.through, 16);
  // what is beyond the air, as much of it as the air's own light leaves an eye at this exposure to see
  if (!hit) { col = backdrop(rd, L, exp(-8.0 * dot(A.light, vec3f(0.3, 0.6, 0.1)))); }
  col = A.light + A.front * cl.light + cl.through * A.through * col;
  return col * u.p[8].x; // (field.wgsl's finite() takes what diverged)
}

fn field(q: vec2f) -> vec3f {
  let k = u.p[14].x;
  if (k <= 0.0) { return planet(q); }
  if (k >= 1.0) { return near(q); }
  let far = planet(q);
  let d0 = dist;
  let c = near(q);
  dist = select(d0, dist, k > 0.5);
  return mix(far, c, k);
}

// The arrival (acts/arrive.ts): River's planet seen from inside its own air, a few kilometres up, at sunrise over the
// hearts. It is planet.wgsl's world (it follows that file and calls into it: the same crust, the same weather, the
// same deck of cloud, the same air), looked at closely: the land marched as it stands; the cloud a volume of cumulus
// heaped on the deck's own cells, flat-bottomed where the air condenses and billowed above, lit by the sun through the
// cloud between (Beer, and the octaves of light scattered more than once) and by the sky; the air between lit by a sun
// reddened by the air and the ozone it has come through, and only where the cumulus lets it through, so it comes in
// shafts; and the heart's 144 LEDs a light of their own on the land and the cloud near it. As the eye climbs it hands
// the frame back to the planet's own field.
//
// p[14]  how much of the frame is the near world's (1) or the planet's own (0); the heart's beat (its LEDs, 0 to 1);
//        which place is the hearts; the frame, counted (each samples its own depths)
// p[1].w, p[2].w, p[3].w  where the heart's LEDs shine from (the planet's frame)
// p[8].w  how much of the tower still stands (it rains itself out as the sun climbs)

const SIGC = 6000.0;     // the cumulus's extinction, per radius (6 per km, at a thousand kilometres a radius)
const TOWER = vec4f(-0.0564, -0.0038, 0.014, 0.006); // the cumulonimbus we fall through: east and north of the hearts (rad), how tall over the base, how wide
const LED = vec3f(1.0, 0.09, 0.12); // the LEDs' red, as their light
const MS = 3.0;          // what the light scattered many times inside adds, over the octaves' own
const OZ = vec3f(0.03, 0.085, 0.004); // the ozone's column (Chappuis band), three Earths' (a small world's grazing path through its layer is a third as long): it keeps the twilight sky blue
const SKY = vec3f(0.035, 0.055, 0.09); // the sky's light, a share of the sun's, as planet.wgsl has it

var<private> HP: vec3f;  // the heart's light, and how bright
var<private> HI: f32;
var<private> TW: vec3f;  // the tower's axis
var<private> drift: vec3f; // the billows, carried on the wind

// The sun as it reaches p: what the air (Rayleigh, Mie) and the ozone over it leave of it. Low, it has come a long way
// through the air, red; the ozone takes the orange out of what light the sky scatters at twilight.
fn sunlight(p: vec3f, L: vec3f) -> vec3f {
  let r = length(p);
  return SUN * exp(-sunward(p, L) - OZ * chapman(r, dot(p, L) / r, 0.02));
}
// The sky's light on a face turned up at unit n, as planet.wgsl has it: blue, fading through twilight.
fn skylight(n: vec3f, L: vec3f) -> vec3f { return SUN * SKY * smoothstep(-0.2, 0.3, dot(n, L)); }

// The deck's fair-weather cells over unit n, as planet.wgsl's deck() lays them (line for line its calm part: change
// them together; the storm's arms reach the hearts only faintly), as a height over the base, in detail down to fp.
// `up` raises the cells by as much as the octaves not looked at could: a far look that never says there is less.
fn cells(n: vec3f, fp: f32, up: f32) -> f32 {
  var c = 0.0;
  var a = 0.5;
  var f = 12.0;
  var w = n;
  for (var k = 0; k < 4 && f * fp < 0.25; k++) {
    let v = noise(w * f + vec3f(0.0, 0.01 * u.p[5].w, 0.0));
    c += a * select(1.0 - abs(2.0 * v - 1.0), v, k < 2);
    w = ROT * w;
    f *= 2.8;
    a *= 0.5;
  }
  c = 1.7 * (c + a + up * a) - 0.35;
  let cov = wx * clear;
  return HC * sat(1.0 - (1.0 - c) / max(cov, 1e-3)) * (0.35 + 0.65 * sat(cov));
}

// How tall the cumulus over unit n stands over its base: the deck's own cells, so what is seen from near is what the
// planet shows from far, heaped into domes as tall as the deck lets them, steep at their feet; none where the deck is
// too thin to be seen from far; and the tower, a cumulonimbus, as much of it as still stands.
fn heap(n: vec3f, fp: f32, up: f32) -> f32 {
  let x = max(cells(n, fp, up) - 0.0008, 0.0);
  var h = 0.6 * sqrt(x * HC) * smoothstep(0.0, 0.0008, x); // (fair-weather cumulus, wider than tall; and no wisps where the deck only just reaches: from far they are dust)
  let y = (1.0 - dot(n, TW)) / (0.5 * TOWER.w * TOWER.w); // from the tower's axis, squared, in its radii
  if (y < 6.0) { h = max(h, TOWER.z * u.p[8].w * exp(-0.5 * y * y)); }
  return h;
}

// The cloud at p, over a cumulus heap tall: solid in its core, its faces eaten into by billows (1 − |2n − 1| makes the
// creases between the puffs), each octave only where a pixel (fp) is smaller than it, its mean where not: what a pixel
// cannot hold it does not sparkle with. Its base flat where the air condenses.
fn cloud(p: vec3f, tall: f32, fp: f32) -> f32 {
  let alt = length(p) - 1.0 - CB;
  let x = min(alt * 4.0, tall - alt); // depth into it: the base is sharper than the top
  if (x < -0.0008) { return 0.0; }
  let w = p * 1500.0 + drift;
  // (an octave of wavelength λ in full while a pixel is under λ/8, gone by λ/4)
  var b = 0.6 * mix(0.5, noise(w), sat(2.0 - 12000.0 * fp)) + 0.13 * 0.5 + 0.27 * 0.5;
  if (fp < 5.75e-5) { b += 0.27 * sat(2.0 - 35000.0 * fp) * (0.5 - abs(2.0 * noise(w * 2.9 + 4.1) - 1.0)); }
  if (fp < 2e-5) { b += 0.13 * sat(2.0 - 100000.0 * fp) * (0.5 - abs(2.0 * noise(w * 8.3 + 1.7) - 1.0)); }
  return sat(x / 0.0009 + 1.6 * b - 1.15);
}

// How much cloud lies between p and the sun, as an optical depth: two looks toward it, the second further, at the
// cloud's broad shape.
fn sunward_cloud(p: vec3f, L: vec3f) -> f32 {
  var od = 0.0;
  var s = 0.0003;
  var at = 0.0;
  for (var i = 0; i < 2; i++) {
    at += s;
    let q = p + L * (at - 0.5 * s);
    od += cloud(q, heap(normalize(q), 0.002, 0.0), 1e-3) * s;
    s *= 4.0;
  }
  return SIGC * od;
}

struct Vol { light: vec3f, through: f32, t: f32, half: f32 } // (half: where it has let half through, found between the steps, so it does not move as they do)

// The cumulus along ro + t rd for t in [t0, t1]: clear air crossed in strides to where a heap could begin, cloud in
// steps that grow with the distance, each lit by the sun (Beer, through what lies toward it, and the octaves of light
// scattered more than once each a little further through and a little less forward), by the sky, and by the heart.
fn vclouds(ro: vec3f, rd: vec3f, t0: f32, t1: f32, L: vec3f) -> Vol {
  var v = Vol(vec3f(0.0), 1.0, t1, t1);
  let mu = dot(rd, L);
  let ph = vec3f(mix(hg(mu, -0.25), hg(mu, 0.8), 0.7), mix(hg(mu, -0.12), hg(mu, 0.4), 0.7), mix(hg(mu, -0.06), hg(mu, 0.2), 0.7)) / (4.0 * PI);
  var t = t0;
  var od = -1.0;
  var lam = 0.0;
  var inside = false;
  for (var i = 0; i < 56 && t < t1 && v.through > 0.02; i++) {
    let p = ro + rd * t;
    let r = length(p);
    let n = p / r;
    let alt = r - 1.0 - CB;
    let fp = cone() * t;
    let ds = clamp(0.012 * t, 0.00012, 0.0012);
    // a far look first, that never says there is less than there is; then, near a heap, a close one
    var gap = max(-alt, alt - heap(n, max(fp, 0.004), 1.0));
    var tall = 0.0;
    if (gap <= 0.0003) {
      tall = heap(n, fp, 0.0);
      gap = max(-alt, alt - tall);
    }
    if (gap > 0.0003) {
      // clear: on, as far as no heap could be met; and where the cloud is first met, a step back into it by a share of
      // a step of its own, so neighbouring pixels sample it at their own depths
      t += max(ds, min(gap / max(abs(dot(rd, n)), 0.1), 0.004 + 0.05 * t));
      inside = false;
      continue;
    }
    if (!inside) { t += ds * jit; inside = true; continue; }
    let s = cloud(p, tall, fp);
    if (s > 0.003) {
      if (v.t == t1) {
        v.t = t;
        // where it is first met, the way its heap's face turns to the sun (Lambert, on the relief as the light sees it,
        // as planet.wgsl lights its deck): a face toward a low sun is lit, a flat top barely
        let ms = dot(n, L);
        let sz = sqrt(max(1.0 - ms * ms, 0.0));
        let nr = max(0.0012, 3.0 * fp);
        let g = (heap(normalize(n + normalize(L - n * ms + 1e-5) * nr), 2.0 * fp, 0.0) - tall) / nr;
        lam = sat((ms - g * sz) / sqrt(1.0 + g * g));
      }
      let tr = exp(-SIGC * s * ds);
      let sun = sunlight(p, L);
      if ((i & 1) == 0 || od < 0.0) { od = sunward_cloud(p, L); } // the light is looked for every other step
      // (deep in a heap, under all of it, even the light scattered many times has been used up: it is dark in there)
      let deep = exp(-(300.0 + 500.0 * s) * max(tall - alt, 0.0));
      var S = MS * sun * (ph.x * exp(-od) + (0.5 * ph.y * exp(-0.5 * od) + 0.25 * ph.z * exp(-0.25 * od)) * deep) + sun * 0.4 * lam * exp(-0.2 * od) * deep;
      // the sky's light, from above as deep as it reaches, and from below through the base: inside a tall heap, far
      // from both, it is black
      let h = sat(alt / max(tall, 1e-4));
      S += skylight(n, L) * ((0.25 + 0.75 * h) * deep + 0.3 * exp(-alt * (0.4 + s) / 0.0008));
      S += deep * HI * LED * 0.003 / (4.0 * PI * max(dot(p - HP, p - HP), 4e-5));
      v.light += v.through * S * (1.0 - tr);
      if (v.through >= 0.5 && v.through * tr < 0.5) { v.half = t + log(2.0 * v.through) / (SIGC * s); }
      v.through *= tr;
    }
    t += ds * select(1.7, 1.0, s > 0.003); // through a gap in the billows, on faster
  }
  return v;
}

// How much of the sun the cumulus lets through to o: where the sun's ray from it crosses the middle of the cloud
// layer, how much cloud stands there. The sun may be under o's own horizon and still over the cloud's, far off.
fn shade(o: vec3f, L: vec3f) -> f32 {
  let b = dot(o, L);
  let rm = 1.0 + CB + 0.002;
  let h = b * b - dot(o, o) + rm * rm;
  if (length(o) > rm || h < 0.0) { return 1.0; }
  let tall = heap(normalize(o + L * (sqrt(h) - b)), 0.004, 0.0);
  return exp(-2.5 * tall / HC);
}

// The air along ro + t rd, t in [a, b], as planet.wgsl's air() has it, but lit by the sun that reaches each sample
// (through the ozone too) and only where the cumulus lets it (shade): the sun in shafts. Something stands at `cut` and
// lets `thr` through.
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
    let r = max(length(p), 1.0); // (never under the ground: a ray that would be is stopped there by its caller)
    let d = exp((1.0 - r) / vec2f(HR, HM)) * vec2f(1.0, HAZE) * 2.0 * k * (b - a) / f32(n);
    od += 0.5 * d;
    let tr = exp(-(BR * od.x + 1.1 * BM * od.y));
    od += 0.5 * d;
    if (t > cut && seen == 1.0) { seen = thr; A.front = tr; }
    // the sun's light, once scattered; and the sky's own, scattered again (isotropic, as many times as it takes)
    A.light += seen * tr * (shade(p, L) * sunlight(p, L) * (d.x * BR * pr + d.y * BM * pm) + 0.35 / (4.0 * PI) * skylight(p / r, L) * (d.x * BR + d.y * BM));
  }
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
// From high up the land becomes the planet's own (planet.wgsl's lay(), in its own detail), so what the world shows is
// what this was: UP, how far it has.
var<private> UP: f32;
var<private> HAZE: f32; // the morning air's haze, clearer than the day's it settles into (the planet's own, from high up)
fn hgt(m: vec3f, fp: f32) -> f32 {
  BASE = lay(m, 1.0, false);
  var h = BASE;
  if (UP < 1.0) { h += ridges(m, fp) * smoothstep(0.0, 0.0015, BASE) * level(nearest(m)) * (1.0 - UP); }
  if (UP > 0.0) { h = mix(h, lay(m, fp, true), UP); }
  return h;
}

// The land, stood up: where ro + t rd meets it in [t0, t1], or −1 (or 0, from inside it). Over the highest the ridges
// could reach it strides on the broad land alone; under that, as far as the ground's clearance allows (a little over
// half of it, since the land leans), never less than a fraction of the way travelled, the ridges coarser far off; then
// the crossing by false position.
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
      let c = a.x + (t - a.x) * a.y / max(a.y - gap, 1e-9);
      let pc = ro + rd * c;
      let gc = length(pc) - 1.0 - hgt(normalize(pc), lod);
      return select(c + (t - c) * gc / max(gc - gap, 1e-9), a.x + (c - a.x) * a.y / max(a.y - gc, 1e-9), gc < 0.0);
    }
    a = vec2f(t, gap);
    t += max(0.9 * gap / lean, 0.0015 * t);
    if (t > t1) { break; }
  }
  return -1.0;
}

// The sea at o, as planet.wgsl has it (Cox and Munk's glint, sand through the water over the shelves), in a breeze.
fn sea(o: vec3f, rd: vec3f, L: vec3f, depth: f32) -> vec3f {
  let m = normalize(o);
  let mu = dot(m, L);
  let cv = max(dot(-rd, m), 0.04);
  let sun = sunlight(o, L) * shade(o, L);
  let sky = skylight(m, L);
  let s2 = 0.003 + 0.00512 * (5.0 + 4.0 * noise(m * 80.0));
  let H = normalize(L - rd);
  let c2 = max(dot(m, H) * dot(m, H), 1e-4); // (a half-vector along the horizon: no glint, and no 0/0)
  let F = 0.02 + 0.98 * pow(1.0 - max(dot(-rd, H), 0.0), 5.0);
  let glint = F * exp(-(1.0 - c2) / (c2 * s2)) / (PI * s2 * 4.0 * cv * c2 * c2) * step(0.0, mu);
  let alb = mix(vec3f(0.004, 0.02, 0.05), vec3f(0.42, 0.38, 0.27), exp(depth * vec3f(500.0, 70.0, 25.0)));
  return alb * (sun * max(mu, 0.0) + sky) / PI + sun * glint + (0.02 + 0.98 * pow(1.0 - cv, 5.0)) * sky / PI;
}

// The near land's light at p, where the ray rd met it t along. Its slope from the ridges themselves; rock where it is
// steep, in beds; scrub and forest in the valleys, drier up the slopes; snow over the treeline where it can lie. Lit by
// the sun through the air, less what the ridges toward it hide (a few looks along the sun's ray, the nearest object
// the softest shadow) and what the cumulus over it shades; by the sky over it, all the more where the sun has not
// reached it yet; and by the heart. Or the sea.
fn soil(p: vec3f, rd: vec3f, L: vec3f, t: f32) -> vec3f {
  let m = normalize(p);
  let fp = 2.5 * cone() * t; // (its relief only as fine as a pixel can hold: finer, a sunlit ridge is a sparkle)
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
  let light = sunlight(o, L) * shade(o, L) * sh * max(dot(N, L), 0.0) + 1.6 * skylight(m, L) * (0.55 + 0.45 * dot(N, m));
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
  let S = PL[i32(u.p[14].z)];
  let e = normalize(vec3f(S.z, 0.0, -S.x));
  TW = normalize(S + e * TOWER.x + cross(S, e) * TOWER.y);
  HP = local(vec3f(u.p[1].w, u.p[2].w, u.p[3].w));
  HI = u.p[14].y;
  drift = vec3f(0.0, 0.0, 0.25 * u.p[5].w);
  UP = smoothstep(0.012, 0.04, length(ro) - 1.0);
  HAZE = mix(0.5, 1.0, UP);
  // where in its steps this pixel samples the cloud and the air: blue noise across the screen, turned on by the golden
  // ratio each frame, so the phosphor's memory averages what one frame's few steps miss
  let px = (q * vec2f(1.0 / u.aspect, -1.0) * 0.5 + 0.5) * u.res;
  jit = fract(52.9829189 * fract(dot(px, vec2f(0.06711056, 0.00583715))) + 0.618034 * u.p[14].w);

  let top = ball(ro, rd, TOP);
  if (top.y <= 0.0) { return backdrop(rd, L, 1.0) * u.p[8].x; }
  let a = max(top.x, 0.0);
  let g = ball(ro, rd, 1.0);
  let floor = select(top.y, g.x, g.x > 0.0);
  // the weather where the ray meets the deck, as planet() asks it
  let sh = ball(ro, rd, 1.0 + CB + max(HC, TOWER.z) + 0.001);
  wx = weather(normalize(ro + rd * max(sh.x, 0.0)));
  clear = cleared(normalize(ro), nearest(normalize(ro)));
  // the cumulus first, as far as the land could be; then the land, if the cloud lets any of it be seen
  let zt = ball(ro, rd, 1.0 + ZT);
  var cl = Vol(vec3f(0.0), 1.0, floor, floor);
  if (sh.y > 0.0) { cl = vclouds(ro, rd, max(sh.x, 0.0), min(sh.y, floor), L); }
  var tg = -1.0;
  if (cl.through > 0.02 && zt.y > 0.0) { tg = land(ro, rd, max(zt.x, 0.0), min(zt.y, floor)); }
  if (tg < 0.0 && g.x > 0.0) { tg = g.x; }
  let hit = tg >= 0.0;
  let b = select(top.y, tg, hit);
  // (cloud past the land was summed as if in front of it: take it back out)
  if (hit && cl.t > tg) { cl = Vol(vec3f(0.0), 1.0, b, b); }
  var col = vec3f(0.0);
  if (hit) {
    dist = tg * R;
    // the near land, and from high up the planet's own ground (planet.wgsl), as the world will show it
    if (cl.through > 0.02 && UP < 1.0) { col = soil(ro + rd * tg, rd, L, tg); }
    if (cl.through > 0.02 && UP > 0.0) { col = mix(col, ground(ro + rd * tg, rd, L, tg, stood(tg)), UP); }
  }
  // a solid behind cloud that lets less than half through is hidden by it, from where it has
  if (cl.through < 0.5) { dist = cl.half * R; }
  let A = shafts(ro, rd, a, select(b, cl.t, cl.through < 0.02), L, cl.t, cl.through, 16);
  // what is beyond the air: the sun's disc and the sky behind it, as much of the stars as the light in front of them
  // leaves an eye at this exposure to see
  if (!hit) { col = backdrop(rd, L, exp(-40.0 * dot(A.light + A.front * cl.light, vec3f(0.3, 0.6, 0.1)))); }
  col = (A.light + A.front * cl.light + cl.through * A.through * col) * u.p[8].x;
  return col * min(1.0, 1000.0 / max(max(col.r, col.g), max(col.b, 1e-9))); // (the sun's disc, bright enough to glare, not so bright the phosphor's memory streaks it as the eye turns)
}

// The near world hands the frame to the planet's own in patches that lie on the land (where the ray meets the ground,
// or passes nearest it), each going as the eye climbs past its own height: only the edges of the patches ask both.
fn field(q: vec2f) -> vec3f {
  let ro = local(-u.p[4].xyz / u.p[4].w);
  let rd = local(ray(q));
  let g = ball(ro, rd, 1.0);
  let m = normalize(ro + rd * select(max(-dot(ro, rd), 0.0), g.x, g.x > 0.0));
  let z = 0.65 * noise(m * 60.0) + 0.35 * noise(m * 170.0 + 3.0);
  let k = smoothstep(z - 0.06, z + 0.06, 1.3 * u.p[14].x - 0.15);
  if (k <= 0.0) { return planet(q); }
  if (k >= 1.0) { return near(q); }
  let far = planet(q);
  let d0 = dist;
  let c = near(q);
  dist = select(d0, dist, k > 0.5);
  return mix(far, c, k);
}

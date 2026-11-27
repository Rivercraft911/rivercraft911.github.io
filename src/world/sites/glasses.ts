// strobeGlasses: River's open strobe glasses, MK1, on a stand facing south (places.ts stands the frame and the board);
// beyond their two LCD valves, level with them, a wheel of five blades turning on a post.
//
// The glasses' firmware, at its fastest and darkest, runs 20 frames a second at 80 % dark, so each valve is clear for
// 10 ms in every 50. The wheel turns at about 4 rev/s. Through a valve it is only where it was while the valve was last
// clear: five blades repeat every fifth of a turn, so through the lenses it turns at f′ = f − f_s/5, and as the
// wheel's speed drifts through 4 rev/s it creeps forward, stands still and walks backwards, while round the glasses it
// is plainly turning. Here time runs 25× slow, so a valve blinks under once a second (and never faster: nothing
// flickers), and the drift that takes the real wheel 24 s comes round in 24 here.
import { TAU } from '../../acts/scene'
import { box, make, prism, tube } from '../make'
import { ctx, frame, site, solid, type V } from '../ctx'
import { PLACES } from '../places'

const SLOW = 25
const FS = 20, CLEAR = 0.2, BLADES = 5, F0 = FS / BLADES, DF = 0.3, DRIFT = 24 // the strobe; the wheel: rev/s, its swing, the swing's period (s)
const GS = 0.13, GM = GS / 150.3 // the glasses, radii across, and radii to a millimetre of them
export const LIFT = 76 * GM // how high the stand holds them: their windows level with the wheel's hub
// the wheel's angle at real time τ, its swing at period d (real seconds)
const angle = (t: number, d = DRIFT) => TAU * (F0 * t - ((DF * d) / TAU) * Math.cos((TAU * t) / d))
const valve = (t: number) => t * FS - Math.floor(t * FS) < CLEAR // is a valve clear at real time τ?

// ---- what is not in the CAD, in millimetres: each LCD valve, clear and dark, a little larger than the frame's window
// it sits behind; the wheel, five white blades on a black hub; its post ----------------------------------------------
const W = 30, H = 34
make('valve-clear', () => box({ col: [0.32, 0.34, 0.3, 0.22], metal: 0, rough: 0.05 }, [-W / 2, -H / 2, -0.6], [W / 2, H / 2, 0.6]))
make('valve-dark', () => box({ col: [0.004, 0.005, 0.006, 0.985], metal: 0, rough: 0.05 }, [-W / 2, -H / 2, -0.6], [W / 2, H / 2, 0.6]))
const R = 85
make('strobe-wheel', () => {
  const white = { col: [0.86, 0.85, 0.8, 1], metal: 0, rough: 0.55 }
  tube({ col: [0.02, 0.02, 0.022, 1], metal: 0.6, rough: 0.35 }, [0, 0, -3], [0, 0, 1], 11, 11, 6, 32, true)
  for (let k = 0; k < BLADES; k++) {
    const a = (k * TAU) / BLADES, c = Math.cos(a), s = Math.sin(a), at = (r: number, w: number): [number, number] => [r * c - w * s, r * s + w * c]
    prism(white, [at(9, -5), at(R, -13), at(R, 13), at(9, 5)], -1.2, 1.2)
  }
})
make('glasses-stand', () => {
  const dark = { col: [0.03, 0.03, 0.035, 1], metal: 0.8, rough: 0.4 }
  tube(dark, [0, 0, 0], [0, 1, 0], 4, 3, 81, 24, true)
  box(dark, [-7, 79, -5], [7, 81, 5])
  tube(dark, [0, 0, 0], [0, 1, 0], 16, 15, 2.5, 32, true)
})
make('strobe-post', () => {
  const dark = { col: [0.03, 0.03, 0.035, 1], metal: 0.8, rough: 0.4 }
  tube(dark, [0, 0, 0], [0, 1, 0], 5, 4, 95, 24, true)
  tube(dark, [0, 95, 0], [0, 0, 1], 3, 3, 9, 16, true)
  box(dark, [-18, 0, -10], [18, 3, 10])
})

const n: V = [0, 0, 0], e: V = [0, 0, 0], N: V = [0, 0, 0], g: V = [0, 0, 0], c: V = [0, 0, 0], ax: V = [0, 0, 0], ay: V = [0, 0, 0], az: V = [0, 0, 0]
// a point of the glasses' place: x east, y up, z north, mm from the frame's foot
const at = (x: number, y: number, z: number, o: V) => {
  for (let i = 0; i < 3; i++) o[i] = n[i] * (1.0005 + y * GM) + (e[i] * x + N[i] * z) * GM
  return o
}

export function draw(k: number) {
  const P = PLACES[k]
  site(P.lat, P.lon, n)
  if (n[0] * ctx.E[0] + n[1] * ctx.E[1] + n[2] * ctx.E[2] < 0.5) return
  frame(n, e, N)
  const tau = ctx.t / SLOW, clear = valve(tau)
  // the valves, in the frame's windows (x ±31 mm, 4 mm under its middle, 36 mm in front of it); the stand under its bridge
  const y = LIFT / GM + 23.1 - 4
  for (let j = 0; j < 3; j++) (ax[j] = -e[j]), (az[j] = N[j])
  for (const x of [-31, 31]) solid(clear ? 'valve-clear' : 'valve-dark', at(x, y, -36, c), ax, n, az, H * GM)
  solid('glasses-stand', at(0, 40.5, -30, c), ax, n, az, 81 * GM)
  // the wheel, a hand's breadth south of them, facing them, turning on its post; the drift brought round to 24 s here
  const th = angle(tau, DRIFT / SLOW)
  for (let j = 0; j < 3; j++) (ax[j] = Math.cos(th) * e[j] + Math.sin(th) * n[j]), (ay[j] = -Math.sin(th) * e[j] + Math.cos(th) * n[j]), (az[j] = -N[j])
  solid('strobe-wheel', at(0, y, -135, c), ax, ay, az, 2 * R * GM)
  for (let j = 0; j < 3; j++) (ax[j] = e[j]), (az[j] = -N[j])
  solid('strobe-post', at(0, (y + 3) / 2, -131, g), ax, n, az, (y + 3) * GM)
}

// What it sounds like, in real time, under the picture's slowing: the wheel as a photodiode behind a valve sees it,
// the five blades passing, let through for 10 ms in every 50, so what is heard is the strobe's own beat, 5(f − 4) Hz,
// swelling a low note and letting it go, slowing, stopping and turning over as the wheel's picture does; and each
// time a valve opens in the picture, a soft click.
let open = 0, mean = 0, purr = 0, ph = 0, was = false, click = 0
export function voice(t: number, dt: number) {
  open += 0.02 * (+valve(t) - open)
  const light = open * (0.5 + 0.5 * Math.cos(BLADES * angle(t)))
  mean += 1e-4 * (light - mean)
  purr += 4e-4 * (light - mean - purr) // the beat, without the strobe's own 20 Hz
  ph += 95 * dt, ph -= Math.floor(ph)
  const v = valve(t / SLOW)
  if (v && !was) click = 1
  was = v, click *= 1 - 60 * dt
  return 3 * purr * Math.sin(TAU * ph) + 0.08 * click * Math.sin(TAU * 1520 * t)
}

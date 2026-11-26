// Power-on and the hook. The tube degausses, a decaying phasor; the spot it leaves blooms into a turning
// one, and odd harmonics land on its tip head to tail in one quickening run, each like a loop locking,
// overshooting and ringing before it settles. The beam draws the tip itself, 110 turns a second:
// z(t) = (4/π) Σ e^{inωt}/n, whose height is the square wave and whose reach is its Hilbert transform,
// (2/π) ln|cot(ωt/2)|. Its velocity is one phasor under a Dirichlet envelope, i e^{iNωt} sin(Nωt)/sin(ωt),
// so the tip stops dead 2N times a turn: Gibbs' ripple is a lace of cusped arcs, and at each edge of the
// square every phasor lines up and the chain cracks like a whip. Then the X input is turned from the
// signal to the timebase, x = Re z cos α + vt sin α: the scope going from XY to YT is the eye swinging
// round a corkscrew, from end on to side on, and the square's edges are those whips seen flat. The
// timebase runs a little off the beat, so the wave scrolls, and a strobe at its rate shows the chain in
// slow motion. L is x, R is y: a scope on the jack draws all of it.
import { GREEN } from '../beam/beam'
import { Path } from '../beam/path'
import { Say } from './say'
import { TAU, clamp, lock, view, type Scene } from './scene'

export const F = 110 // Hz
const K = 25 // phasors: harmonics 1, 3, … 49
export const DUR = 3.7
const DEGAUSS = 0.45, T1 = 0.5 // the fundamental arrives
const T_HARM = 0.95, T_FULL = 2.5 // the odd harmonics land between these, quickening
const lands = (k: number) => (k ? T_HARM + (T_FULL - T_HARM) * ((k - 1) / (K - 2)) ** 0.55 : T1)
// and let go again in the meander, the highest first, quickening down to the third
const drops = (k: number) => DUR + 0.5 + 1.5 * (1 - k / (K - 1)) ** 2.2

// The strobe: flashes at F − FV show every phasor FV/F as fast, so the chain turns at FV and its nth arm
// at n·FV. It runs on through the meander, slows from SLOW and stops at STOP, TURNS round, pointing left.
const SLOW = DUR + 1.3, TURNS = 4.5
export const STOP = SLOW + 1.3
const FV = TURNS / (SLOW - T1 + (STOP - SLOW) / 2)
export const turn = (t: number) => (t < SLOW ? FV * (t - T1) : TURNS - (FV * (STOP - Math.min(t, STOP)) ** 2) / (2 * (STOP - SLOW)))

// The timebase: PER periods a sweep, falling behind the signal by the strobe's turn, so the trace leaves
// the chain's tip and scrolls away from it. sweep() is how many periods back the beam is writing.
export const PER = 3
export const sweep = (tt: number) => {
  const l = (turn(tt) - F * tt) / PER
  return (l - Math.floor(l)) * PER
}
// The X input's turn from the signal (0) to the timebase (π/2): round to three quarters, then flat.
const swing = (t: number) => (Math.PI / 2) * clamp(0.72 * lock([[0, 0], [1.7, 1]], t, 4.5, 0.75) + 0.28 * lock([[0, 0], [3.1, 1]], t, 9, 0.7))
// The screen: the square's height, in units of A = 0.9 of the screen's half-width, and its axis.
export const SEAT = { r: 0.25, cy: -0.05 }

// Each harmonic's weight at time t: a step up through an underdamped loop, and a step down. One turn of
// the tip is tabulated from them every frame: X and Y, Σ w cos(nθ)/n and Σ w sin(nθ)/n (so the square
// stands π/4 tall), and HI, Y without its fundamental. Returns the highest harmonic standing.
const P = 2048, X = new Float64Array(P + 1)
export const W = new Float64Array(K), Y = new Float64Array(P + 1), HI = new Float64Array(P + 1)
let fresh = Infinity // time since the latest landing
export function tune(t: number) {
  let N = 0
  fresh = Infinity
  for (let k = 0; k < K; k++) {
    W[k] = t < lands(k) ? 0 : lock([[0, 0], [lands(k), 1]], t, 28, 0.3) - (k && t > drops(k) ? lock([[0, 0], [drops(k), 1]], t, 16, 0.6) : 0)
    if (W[k] > 0.5) N = 2 * k + 1
    if (t >= lands(k)) fresh = Math.min(fresh, t - lands(k))
  }
  for (let i = 0; i <= P; i++) {
    const th = (TAU * i) / P, c2 = Math.cos(2 * th), s2 = Math.sin(2 * th)
    let c = Math.cos(th), s = Math.sin(th), x = 0, y = 0
    for (let k = 0; k < K; k++) {
      if (Math.abs(W[k]) > 1e-5) (x += (W[k] * c) / (2 * k + 1)), (y += (W[k] * s) / (2 * k + 1))
      const n = c * c2 - s * s2 // on to the next odd harmonic: a turn by 2θ
      ;(s = s * c2 + c * s2), (c = n)
    }
    X[i] = x, Y[i] = y, HI[i] = y - W[0] * Math.sin(th)
  }
  return N
}
// A table read at u turns.
export const at = (T: Float64Array, u: number) => {
  const f = (u - Math.floor(u)) * P, i = Math.floor(f)
  return T[i] + (T[i + 1] - T[i]) * (f - i)
}

// The chain the strobe shows at u turns: arms head to tail from (cx, cy), the fundamental's g long and
// seen kx on (1 face on, 0 edge on), a dwell on the tip, and each arm's circle, faint.
export function chain(p: Path, cx: number, cy: number, g: number, u: number, kx = 1, i = 1) {
  for (const arms of [true, false]) {
    let x = cx, y = cy
    p.color(GREEN[0], GREEN[1], GREEN[2], i * (arms ? 0.7 : 0.16))
    if (arms) p.moveTo(x, y)
    for (let k = 0; k < K; k++) {
      const r = (g * W[k]) / (2 * k + 1), a = TAU * (2 * k + 1) * u
      if (Math.abs(W[k]) < 0.02) continue
      if (!arms) {
        const n = Math.max(10, Math.min(72, Math.round(Math.abs(r) * 300)))
        p.moveTo(x + kx * r, y)
        for (let j = 1; j <= n; j++) p.lineTo(x + kx * r * Math.cos((TAU * j) / n), y + r * Math.sin((TAU * j) / n))
      }
      ;(x += kx * r * Math.cos(a)), (y += r * Math.sin(a))
      if (arms) p.lineTo(x, y)
    }
    if (arms) p.intensity(i).lineTo(x, y, 0.2 * g)
  }
}

// The degauss coil's decaying 60 Hz swing: the spot spirals in and the speakers thunk.
function degauss(t: number, o: { x: number; y: number }) {
  const e = 0.3 * Math.exp(-t / 0.16) * (1 - Math.exp(-t / 0.008))
  o.x = e * Math.cos(TAU * 60 * t), o.y = e * Math.sin(TAU * 60 * t)
}

// What the speakers play: what the beam is given. R is the tip's height; L its reach, turning to the
// timebase's ramp as the X input does.
const VOL = 0.42, d = { x: 0, y: 0 }
export function sing(tt: number, o: { l: number; r: number }, al = Math.PI / 2, k = 1) {
  if (tt < DEGAUSS) return degauss(tt, d), (o.l += 2.4 * d.x), void (o.r += 2.4 * d.y)
  o.l += k * (VOL * Math.cos(al) * at(X, F * tt) + 0.3 * Math.sin(al) * ((2 * sweep(tt)) / PER - 1))
  o.r += k * VOL * at(Y, F * tt)
}

// The live equation: the coil's dying phasor, then one that stays, then the sum, N counting up, and what
// the plates are given. The meander carries it on.
const COIL = 'z(t) = a\\, e^{-t / \\tau}\\, e^{i 2\\pi 60 t}', ONE = 'z(t) = \\frac{4}{\\pi}\\, e^{i \\omega t}'
const SUM = 'z(t) = \\frac{4}{\\pi} \\sum_{n = 1, 3, \\ldots}^{N} \\frac{e^{i n \\omega t}}{n},\\; x = \\Re\\, z \\cos \\alpha + v t \\sin \\alpha,\\; y = \\Im\\, z'
export const say = new Say()

const p = new Path()
export const hook: Scene = {
  dur: DUR,
  build(t, f) {
    const A = view.a * 0.9, N = tune(t), g = (4 / Math.PI) * SEAT.r * A, al = swing(t), ca = Math.cos(al), sa = Math.sin(al)
    const cx = -A * sa, lam = ((2 * A) / PER) * sa // the sweep opens about the middle of the screen
    let peak = 0
    for (let i = 0; i < P / 2; i++) peak = Math.max(peak, Y[i])
    say.say(f, t, t < DEGAUSS ? COIL : N > 1 ? SUM : ONE, GREEN, t < DEGAUSS
      ? [['a', 0.3, 1], ['\\tau', 0.16, 2], ['t', t, 3]]
      : [['N', N, 0], ['f_N', N * F, 0], ['\\max\\, y', (4 / Math.PI) * peak, 3], ['\\alpha', (al * 360) / TAU, 0]])

    f.ch.push({
      w: 1,
      fn: (tt, s) => {
        if (tt < DEGAUSS) return degauss(tt, s)
        const l = sweep(tt)
        s.x = cx + ca * g * at(X, F * tt) + lam * l, s.y = SEAT.cy + g * at(Y, F * tt)
        // each landing flashes the lace; what is farther down the sweep is farther from the eye; the flyback is dark
        s.z = sa > 0.02 && l > 0.985 * PER ? 0 : (0.8 + 1.5 * Math.exp(-fresh / 0.05)) * (1 - (0.6 * ca * l) / PER)
      },
    })
    if (t > T1) chain(p.clear(), cx, SEAT.cy, g, turn(t), ca), f.ch.push({ w: 0.5, path: p })
    return (tt, o) => sing(tt, o, al)
  },
}

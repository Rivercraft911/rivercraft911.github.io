// Power-on and the first waves. The tube degausses, a decaying phasor, and the spot it leaves blooms into a
// turning one: a pure tone, A440, L = sin and R = cos, so a circle. Then the X input is turned from the
// signal to the timebase, x = A sin ωt cos α + sweep sin α: the circle was a corkscrew seen end on, and
// swinging round to side on it is the sine. The sweep runs forth and back, PR passes a second, three cycles
// to a pass, and the wave is a cosine, even about both ends of the screen, so every pass retraces the last
// and the right channel stays one pure sine. Then another wave grows out of it: every other pass draws a copy
// that quickens up the harmonics to a carrier four times as fast, and the sine takes its phase,
// y = A cos(nωt + β sin ωt). That is FM, and it is how a river turns: the carrier bunches under the sine's
// crests, where its phase runs fastest, and spreads under its troughs, and as β swells its energy moves out
// into Bessel sidebands, J_k(β), until at β = 2.405 the carrier itself is gone (J₀ = 0). Then the second
// copy swings through the bare carrier to β down, and a fan of them fills in between, pinched together every
// half cycle of the sine, where β sin is zero. The beam draws what the speakers play, L = x and R = y, so a
// scope on the jack draws all of it, and the screen is that scope.
import { GREEN } from '../beam/beam'
import { Path } from '../beam/path'
import { GX, GY } from '../beam/scope'
import { Say } from './say'
import { LEVELS } from './valley' // the fan's members a side: as many as the meander's sheaf has rivers
import { TAU, clamp, lock, mix, smooth, view, type Scene } from './scene'

export const DUR = 3.6
const DEGAUSS = 0.45
export const PR = 440 / 3 // passes of the sweep a second
export const CYC = 3 // the sine's cycles across a pass, so 440 Hz
export const NC = 12 // the carrier's, at the last: 1760 Hz
export const CLOSED = 2.405 // J₀'s first zero
export const SEAT = { r: 0.38, cy: -0.05 } // the wave's height and its axis, in screen units
const SHARE = [0, 1, 0, -1] // each pass's share of β: the sine, the copy modulated up, the sine, the copy down

// When the copy steps up the harmonics, β's swell, and the fan. Each step is a quick crossfade (BLEND seconds),
// the copy growing its new cycles out of the old rather than jumping to them; carrier() is where it has got to.
const STEPS = [[1.55, 6], [1.75, 9], [1.95, NC]], BLEND = 0.12
const carrier = (t: number) => STEPS.reduce((n, [at, c]) => mix(n, c, smooth(at, at + BLEND, t)), CYC)
// The copy at u: the carrier it steps from crossfading into the one it steps to.
function copy(u: number, t: number, b: number) {
  let n = CYC, was = CYC, m = 1
  for (const [at, c] of STEPS) if (t >= at) (was = n), (n = c), (m = smooth(at, at + BLEND, t))
  return m < 1 ? mix(wave(u, was, b), wave(u, n, b), m) : wave(u, n, b)
}
export const beta = (t: number) => (t < 2.1 ? 0 : CLOSED * lock([[0, 0], [2.1, 1]], t, 7, 0.55))
// the second copy is modulated up with the first, then swings through the bare carrier to down, and the fan
// fills in between them
const MIRROR = 2.75, mirror = (t: number) => 1 - 2 * smooth(MIRROR, MIRROR + 0.35, t)
const FAN = 3
const swing = (t: number) => (Math.PI / 2) * clamp(lock([[0, 0], [0.75, 1]], t, 7, 0.8), 0, 1)
const bloom = (t: number) => (t < DEGAUSS ? 0 : lock([[0, 0], [DEGAUSS, 1]], t, 18, 0.35))

// J₀ by its series: the carrier's share of the wave.
export function J0(x: number) {
  let s = 0, term = 1
  for (let k = 0; k < 16; k++) (s += term), (term *= -(x * x) / (4 * (k + 1) * (k + 1)))
  return s
}

// A member of the fan at u ∈ [0, 1] across the screen: the carrier's n cycles, its phase taken by β sin.
export const wave = (u: number, n: number, b: number) => Math.cos(TAU * n * u + b * Math.sin(TAU * CYC * u))

// The degauss coil's decaying 60 Hz swing: the spot spirals in, all the way, and the speakers thunk.
function degauss(t: number, o: { x: number; y: number }) {
  const e = 0.75 * Math.exp(-t / 0.16) * (1 - Math.exp(-t / 0.008)) * smooth(DEGAUSS, DEGAUSS - 0.15, t)
  ;(o.x = e * Math.cos(TAU * 60 * t)), (o.y = SEAT.cy + e * Math.sin(TAU * 60 * t))
}

// The signal at time t, in screen units, into o (z: how far back the corkscrew's point is, 0 to 1). The pass
// and its member are fixed when the pass begins, so a step lands where the passes meet, never mid-stroke.
export function signal(t: number, o: { x: number; y: number; z: number }) {
  o.z = 0
  if (t < DEGAUSS) return degauss(t, o)
  const A = view.a * 0.9, P = PR * t, p = Math.floor(P), f = P - p, u = p & 1 ? 1 - f : f, k = SHARE[p & 3]
  const y = k ? copy(u, t, (k > 0 ? 1 : mirror(t)) * beta(t)) : Math.cos(TAU * CYC * u), q = Math.sin(TAU * CYC * PR * t)
  const a = swing(t), r = SEAT.r * bloom(t), ca = Math.cos(a), sa = Math.sin(a)
  ;(o.x = r * q * ca + A * (2 * u - 1) * sa), (o.y = SEAT.cy + r * y), (o.z = Math.sin(2 * a) * (0.5 + 0.5 * ((2 * u - 1) * ca - q * sa)))
}

// What the speakers play: the signal, centred on the screen's axis.
const sv = { x: 0, y: 0, z: 0 }
export function sing(tt: number, o: { l: number; r: number }, k = 1) {
  signal(tt, sv)
  ;(o.l += k * GX * sv.x), (o.r += k * GY * (sv.y - SEAT.cy))
}

// The fan the screen draws over the speakers' four: three a side between them, from the outside in.
const P = 360
export const FANNED = [4, 8, 12]
export function fan(p: Path, t: number, i = 1) {
  const A = view.a * 0.9, b = beta(t)
  for (const l of FANNED) {
    const k = i * smooth(FAN + (0.4 * (LEVELS - l)) / LEVELS, FAN + 0.25 + (0.4 * (LEVELS - l)) / LEVELS, t)
    if (k < 0.01) continue
    for (const side of [-1, 1]) {
      p.color(GREEN[0], GREEN[1], GREEN[2], 0.11 * k)
      for (let j = 0; j <= P; j++) {
        const u = j / P, x = A * (2 * u - 1), y = SEAT.cy + SEAT.r * wave(u, NC, (side * b * l) / LEVELS)
        j ? p.lineTo(x, y) : p.moveTo(x, y)
      }
    }
  }
  return p
}

// The live equation: the coil's dying phasor, the tone and the plates it is given, the copy quickening, and FM.
const COIL = 'z(t) = a\\, e^{-t / \\tau}\\, e^{i 2\\pi 60 t}'
const TONE = 'x = A \\sin(\\omega t) \\cos \\alpha + v t \\sin \\alpha,\\; y = A \\cos(\\omega t)'
const HARM = 'y = A \\cos(n \\omega t)'
const FM = 'y = A \\cos(n \\omega t + \\beta \\sin(\\omega t))'
export const say = new Say()

const p = new Path()
export const hook: Scene = {
  dur: DUR,
  build(t, f) {
    const b = beta(t), n = carrier(t)
    say.say(f, t, t < DEGAUSS ? COIL : t < STEPS[0][0] ? TONE : t < 2.1 ? HARM : FM, GREEN, t < DEGAUSS
      ? [['a', 0.75, 2], ['\\tau', 0.16, 2], ['t', t, 3]]
      : t < STEPS[0][0] ? [['f', 440, 0], ['\\alpha', (swing(t) * 360) / TAU, 0]]
      : [['n', n / CYC, 0], ['f', (n * 440) / CYC, 0], ['\\beta', b, 3], ['J_0(\\beta)', J0(b), 3]])

    // each step up the harmonics glows while the copy grows into it: a swell, not a flash
    const glow = 0.9 * (1 + STEPS.reduce((g, [at]) => { const m = smooth(at, at + BLEND, t); return g + 1.2 * m * (1 - m) }, 0))
    f.ch.push({
      w: 1,
      fn: (tt, s) => {
        signal(tt, sv)
        ;(s.x = sv.x), (s.y = sv.y), (s.z = (tt < DEGAUSS ? 1 : 1 - 0.55 * sv.z) * glow)
      },
    })
    if (t > FAN) f.ch.push({ w: 0.6 * smooth(FAN, FAN + 0.3, t), path: fan(p.clear(), t) }) // its share of the beam comes as it does, so the sine dims as it fills, not at once
    return (tt, o) => sing(tt, o)
  },
}

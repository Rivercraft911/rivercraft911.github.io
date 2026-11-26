// The bench: PEEP and the strobe glasses.
//
// The glasses stand at the rim of a wheel of five blades turning on the ground at about 4 rev/s. Their firmware's
// fastest, darkest setting is 20 frames a second at 80 % dark, so each LCD valve is clear for 10 ms in every 50. Seen
// past the frame the wheel is where it is, at the beam's own rate, a blur. Seen through a lens (any ray from the eye
// that crosses a valve) it is only where it was while the valve was last clear, held as an eye holds it: five blades
// repeat every fifth of a turn, so it turns at f′ = f − f_s/5, and as the wheel's speed drifts through 4 rev/s it
// creeps forward, stands still and walks backwards. Only the wheel's lines step; nothing flashes.
//
// PEEP is set off the way its remote does it: three 9 ms bursts of 38 kHz infrared, 30 ms apart. At the speed of
// light a burst is 2698 km long and the gaps 8994 km, so on a world this size the trigger comes down out of space as
// three strokes, drawn at their true lengths. The first edge starts the macro: a press report, a release, a gap,
// 10 ms each (the endpoint's own 10 ms poll), every byte of each report written out as it goes; then 250 ms of quiet
// and it is armed again. Light and time here run 25× slow. The macro is the README's first line.
import { equation } from '../../acts/reality'
import { TAU } from '../../acts/scene'
import { text } from '../../beam/font'
import { Path } from '../../beam/path'
import { bench as copper } from '../copper'
import { ctx, frame, look, seen, site, solid, unit, type V } from '../ctx'
import { PLACES } from '../places'
import { C, RE, numbers, to, up } from './sky'

const SLOW = 25
// ---- the wheel and the glasses ------------------------------------------------------------------------------------
const FS = 20, CLEAR = 0.2, BLADES = 5, F0 = FS / BLADES, DF = 0.3, DRIFT = 24 // the strobe; the wheel: rev/s, its swing, the swing's period (s)
const WR = 0.085, WY = -0.1 // the wheel's radius, and its hub, north of the place (radii)
const rate = (t: number) => F0 + DF * Math.sin((TAU * t) / DRIFT)
const angle = (t: number) => TAU * (F0 * t - ((DF * DRIFT) / TAU) * Math.cos((TAU * t) / DRIFT))
const GS = 0.13, GM = GS / 150.3 // the glasses, radii across, and radii to a millimetre of them
const LENS = [[-34, -4, -37, 13.5, 15], [34, -4, -37, 13.5, 15]] // each valve's opening in the frame: centre x, y, z and half-width, half-height, mm

const n: V = [0, 0, 0], e: V = [0, 0, 0], N: V = [0, 0, 0], gc: V = [0, 0, 0], ax: V = [0, 0, 0], w: V = [0, 0, 0], q: V = [0, 0, 0]
// Does the eye see world point p through a valve?
function through(p: V) {
  const E = ctx.E
  for (let l = 0; l < 2; l++) {
    const L = LENS[l]
    let den = 0, num = 0
    for (let j = 0; j < 3; j++) (q[j] = gc[j] + GM * (ax[j] * L[0] + n[j] * L[1] + N[j] * L[2])), (den += (p[j] - E[j]) * N[j]), (num += (q[j] - E[j]) * N[j])
    const s = num / den
    if (!(s > 0 && s < 1)) continue
    let hx = 0, hy = 0
    for (let j = 0; j < 3; j++) {
      const h = E[j] + s * (p[j] - E[j]) - q[j]
      ;(hx += h * ax[j]), (hy += h * n[j])
    }
    if (Math.abs(hx) < L[3] * GM && Math.abs(hy) < L[4] * GM) return true
  }
  return false
}
const wheel = new Path(), WHEEL = { w: 0.3, path: wheel }
// The wheel at angle th, as much of it as is (or is not) seen through a valve.
function turn(th: number, lens: boolean, i: number) {
  wheel.color(0.45, 1, 0.62, i)
  for (let b = 0; b < BLADES; b++) {
    up()
    for (let s = 0; s <= 24; s++) {
      // a blade: out along one edge, round the tip, back along the other
      const u = s / 24, r = WR * (0.12 + 0.88 * Math.sin(Math.PI * u) ** 0.6), a = th + (b * TAU) / BLADES + 0.5 * (u - 0.5) - 0.9 * (r / WR) ** 2 * 0.3
      const x = r * Math.cos(a), y = WY + r * Math.sin(a)
      for (let j = 0; j < 3; j++) w[j] = n[j] + e[j] * x + N[j] * y
      unit(w), (w[0] *= 1.002), (w[1] *= 1.002), (w[2] *= 1.002)
      if (through(w) === lens) to(wheel, w[0], w[1], w[2])
      else up()
    }
  }
}

// ---- PEEP --------------------------------------------------------------------------------------------------------
const MACRO = "the world's smallest (for now)", CYCLE = 1200, KEY = 20 // ms: the remote fires; a character (press, release, gap)
const BURST = 9, GAP = 30, MS = RE / C * 1000 // ms; and light's milliseconds to a radius
const lit = (ms: number) => ms >= 0 && ms < 3 * BURST + 2 * GAP && ms % (BURST + GAP) < BURST
// a character as PEEP's hid_ascii sends it: modifier byte and usage, US layout
function hid(ch: string): [number, number] {
  const c = ch.charCodeAt(0)
  if (c >= 97 && c <= 122) return [0, c - 93]
  return ch === ' ' ? [0, 0x2c] : ch === "'" ? [0, 0x34] : ch === '(' ? [2, 0x26] : ch === ')' ? [2, 0x27] : [0, 0]
}
const hex = (b: number) => b.toString(16).toUpperCase().padStart(2, '0')
const REPORTS = [...MACRO].map((ch) => `${hex(hid(ch)[0])} 00 ${hex(hid(ch)[1])} 00 00 00 00 00`), IDLE = '00 00 00 00 00 00 00 00'
const CODES = [...MACRO].map(hid)
const SO_FAR = [...MACRO].map((_, i) => MACRO.slice(0, i + 1))
const ir = new Path(), keys = new Path(), IR = { w: 0.1, path: ir }, KEYS = { w: 0.25, path: keys }, pc: V = [0, 0, 0], dir: V = [0, 0, 0], vals = [0, 0]

export function draw(k: number) {
  const P = PLACES[k], t = ctx.t, focus = ctx.focus === k
  site(P.lat, P.lon, n)
  if (n[0] * ctx.E[0] + n[1] * ctx.E[1] + n[2] * ctx.E[2] < 0.5) return
  frame(n, e, N)
  wheel.clear(), ir.clear()

  // the glasses, at the wheel's rim, looking south across it (their left is the east)
  for (let j = 0; j < 3; j++) (ax[j] = -e[j]), (gc[j] = n[j] * (1.002 + 23.1 * GM))
  solid('strobe-frame', gc, ax, n, N, GS)
  // the wheel as it is: this refresh's worth of its turning, a blur; and as the valves last showed it
  const dt = Math.min(0.05, Math.max(ctx.dt, 1 / 120)), open = Math.floor(t * FS) / FS
  for (let s = 0; s < 4; s++) turn(angle(t - (dt * (s + 0.5)) / 4), false, 0.25)
  for (let s = 0; s < 3; s++) turn(angle(open + ((s + 0.5) / 3) * (CLEAR / FS)), true, 0.33)
  // the valves themselves
  for (let l = 0; l < 2; l++) {
    const L = LENS[l]
    up(), wheel.color(0.7, 1, 0.8, 0.25)
    for (let c = 0; c <= 4; c++) {
      const x = L[0] + ((c + 1) & 2 ? -1 : 1) * L[3], y = L[1] + (c & 2 ? -1 : 1) * L[4]
      to(wheel, gc[0] + GM * (ax[0] * x + n[0] * y + N[0] * L[2]), gc[1] + GM * (ax[1] * x + n[1] * y + N[1] * L[2]), gc[2] + GM * (ax[2] * x + n[2] * y + N[2] * L[2]))
    }
  }

  // the trigger, coming down the sky to PEEP's photodiode: where along the ray the carrier is on, now
  const ms = (((t * 1000) / SLOW) % CYCLE + CYCLE) % CYCLE
  const [px, py] = P.monuments[0].at!, ph = 1.004 + P.monuments[0].lift! // PEEP, where places.ts stands it
  for (let j = 0; j < 3; j++) (pc[j] = n[j] * ph + px * e[j] + py * N[j]), (dir[j] = 0.75 * n[j] + 0.25 * e[j] - 0.6 * N[j])
  unit(dir)
  for (let b = 0, r0 = -1; b <= 600; b++) {
    const r = b * 0.01, on = b < 600 && (lit(ms + r * MS) || lit(ms + r * MS - CYCLE))
    if (on && r0 < 0) r0 = r
    if (!on && r0 >= 0) {
      up(), ir.color(1, 0.12, 0.3, 1.1)
      for (let s = 0; s <= 8; s++) {
        const d = r0 + ((r - r0) * s) / 8
        to(ir, pc[0] + dir[0] * d, pc[1] + dir[1] * d, pc[2] + dir[2] * d)
      }
      r0 = -1
    }
  }
  copper(ms, lit(ms), CODES, focus) // what PEEP's copper and the glasses' carry
  WHEEL.w = focus ? 0.6 : 0.3
  ctx.f.ch.push(WHEEL, IR)
  if (!focus) return

  // the macro: what has been typed, and the report on the wire
  keys.clear()
  if (ms < CYCLE - 100 && look(pc)) {
    const i = Math.floor(ms / KEY), down = i < MACRO.length && ms % KEY < 10, x = seen.x - 0.2, y = seen.y + 0.3
    keys.color(0.45, 1, 0.62, 0.9)
    text(keys, SO_FAR[Math.min(i, MACRO.length - 1)], x, y, 0.045)
    keys.color(1, 1, 1, down ? 1 : 0.3)
    text(keys, down ? REPORTS[i] : IDLE, x, y + 0.085, 0.032)
    keys.color(0.45, 1, 0.62, 0.35).moveTo(seen.x, seen.y).lineTo(seen.x, y - 0.02)
  }
  ctx.f.ch.push(KEYS)
  vals[0] = rate(t) - F0, vals[1] = rate(t)
  equation(ctx.f, "f'=f-\\frac{f_s}{n}\\qquad f_s=20\\,Hz\\qquad n=5", P.ink)
  numbers("f=\\num{1}{0.00}\\,Hz\\qquad f'=\\num{0}{-0.00}\\,Hz\\qquad c\\to c/25", P.ink, vals)
}

// What it sounds like. PEEP at the bench's own slowing of time, 25×, which brings its 38 kHz carrier down to
// 1520 Hz: the trigger is three beeps. The macro is a tune: every report's usage code a semitone over a low A,
// sounding while its key is down. And under them, in real time as it is drawn, the wheel as a photodiode behind a
// valve sees it: the five blades passing, let through for 10 ms in every 50, so what is heard is the strobe's own
// beat, a 20 Hz purr swelling and dying at 5(f − 4) Hz: it slows, stops and turns over as the wheel's picture does.
const NOTE = [...MACRO].map((ch) => 110 * 2 ** (hid(ch)[1] / 12))
let beep = 0, key = 0, kp = 0, valve = 0, mean = 0
export function voice(t: number, dt: number) {
  const ms = ((((t * 1000) / SLOW) % CYCLE) + CYCLE) % CYCLE, i = Math.floor(ms / KEY), fr = t * FS
  beep += 0.01 * (+lit(ms) - beep), key += 0.004 * (+(i < MACRO.length && ms % KEY < 10) - key)
  if (i < MACRO.length) kp += dt * NOTE[i]
  valve += 0.02 * (+(fr - Math.floor(fr) < CLEAR) - valve)
  const light = valve * (0.5 + 0.5 * Math.cos(BLADES * angle(t)))
  mean += 1e-4 * (light - mean)
  return 0.16 * beep * Math.sin((TAU * 38000 * t) / SLOW) + 0.3 * key * (Math.sin(TAU * kp) + 0.3 * Math.sin(2 * TAU * kp)) + 0.35 * (light - mean)
}

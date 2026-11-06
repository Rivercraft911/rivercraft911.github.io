// The fall. The camera has been looking straight down the signal's time axis all along: the
// constellation is that axis seen end-on. Now time gets depth. Every symbol sits at z = −V·(t_k − t),
// the future ahead, so as V grows the symbols still to come rush up out of the distance and past us.
// The walls are the choir's spectrum folded the way a Shepard tone is built, in Shepard's pitch helix:
// angle is pitch class (an octave is one turn), depth is time. Each chord tone of the falling choir is a
// helix spiralling down the tunnel, gold for the angels, crimson for the dread, and the rising choir
// winds the other way in violet. The scope rule ends here: the choirs sing in 3D around the listener.
import { Path } from '../beam/path'
import { Kind } from '../dsp/dvbs2'
import { ANGEL, CHOIRS, DREAD, descent, dread, place, sing } from './choir'
import { R, RS, decision, residual, sig, signal } from './receive'
import { TAU, cam, clamp, lock, mix, noise, smooth, type Scene } from './scene'

export const WALL = 1.5 // tunnel radius, scene units
const FAR = 14 // how far ahead we can see
const DOTS = 2600 // most symbols drawn per frame
const STEPS = 220 // vertices along each helix
const FOV = 0.9, D = 1 / Math.tan(FOV / 2) // at this distance the now-plane matches the flat scope
const SPEED: [number, number][] = [[0, 0], [0.6, 2.5], [3.5, 6], [6, 11]]
export const speed = (t: number) => Math.max(0, lock(SPEED, t, 2.2, 0.8))
export const T0 = 11 // where the receiver's time stands when the fall begins

const p3 = { x: 0, y: 0, z: 0 }, s = { i: 0, q: 0 }
const walls = new Path()

// A helix of pitch class c (in octaves) of a choir falling at k × the descent, drawn into the walls.
function helix(p: Path, t: number, V: number, c: number, k: number, r: number, g: number, b: number, gain: (T: number) => number) {
  let pen = false
  for (let j = 0; j <= STEPS; j++) {
    const ahead = (j / STEPS) ** 1.6 * (FAR / Math.max(V, 0.3)), T = t + ahead
    const a = TAU * (c - k * descent(T)), z = -V * ahead
    // fades out far ahead, and up close where it sweeps past too fast to read
    const w = gain(T) * smooth(FAR, FAR * 0.6, V * ahead) * smooth(0.6, 2.2, V * ahead + 0.3) * smooth(0.4, 2, V)
    if (w < 0.01 || !cam.project(WALL * Math.cos(a), WALL * Math.sin(a), z, p3)) {
      pen = false
      continue
    }
    p.color(r, g, b, w * p3.z)
    pen ? p.lineTo(p3.x, p3.y) : p.moveTo(p3.x, p3.y)
    pen = true
  }
}

export const fall: Scene = {
  dur: 10,
  build(t, f) {
    const V = speed(t), slip = residual(), sway = 0.06 * smooth(2, 5, t)
    const fov = mix(FOV, 1.55, smooth(1, 6, t))
    const d = D * (Math.tan(FOV / 2) / Math.tan(fov / 2)) // keep the now-plane's scale as the lens widens
    cam.aim(sway * Math.sin(0.7 * t), sway * Math.cos(0.9 * t), d, 0.3 * sway * Math.sin(1.3 * t), 0, 0, fov)
    const kNow = Math.floor((T0 + t) * RS)

    // The symbols: the receiver's recent decisions, then the ones still to come stretching ahead.
    const ahead = V > 0.05 ? Math.min(FAR / V, 8) * RS : 0, back = 1500 * (1 - smooth(0, 1.5, t))
    const span = back + ahead, stride = Math.max(1, Math.ceil(span / DOTS)), n = Math.max(1, Math.floor(span / stride))
    let last = -1
    f.ch.push({
      w: 1,
      fn: (_, o, u) => {
        const a = Math.min(n - 1, Math.floor(u * n)), k = Math.round(kNow - back + a * stride)
        if (k < 0) return void (o.z = 0)
        const kind = decision(k, slip, s), dz = -V * (k / RS - T0 - t)
        if (!cam.project(R * s.i, R * s.q, dz, p3)) return void (o.z = 0)
        o.x = p3.x, o.y = p3.y
        o.z = a === last ? (kind === Kind.Data ? 1 : 1.8) * p3.z * p3.z * smooth(FAR, FAR * 0.5, -dz) : 0
        last = a
      },
    })

    // The walls: the choirs' pitch helices.
    walls.clear()
    const A = CHOIRS[0], X = CHOIRS[2]
    ANGEL.forEach((r, i) => helix(walls, t, V, Math.log2(r), A.k, 1, mix(0.85, 1, i / 4), mix(0.45, 0.95, i / 4), (T) => A.enter(T) * (1 - 0.5 * dread(T)) / (1 + 0.3 * i)))
    DREAD.forEach((r) => helix(walls, t, V, Math.log2(r), A.k, 1, 0.12, 0.25, (T) => A.enter(T) * dread(T)))
    ANGEL.forEach((r) => helix(walls, t, V, Math.log2(r), X.k, 0.6, 0.25, 1, (T) => X.enter(T)))
    f.ch.push({ w: 0.9, gain: 0.9, path: walls })

    place(t)
    f.rate = mix(1.2e6, 3e6, smooth(0, 2, t))
    f.look = { tau: 0.06 }
    return (tt, o) => {
      // The scope's last words: the carrier, fading as the choirs come in. Then the fall's own rumble.
      const k = 1 - smooth(0.5, 2.5, tt)
      if (k > 0) signal(T0 + tt, slip), (o.l = 0.6 * k * sig.i), (o.r = 0.6 * k * sig.q)
      const rum = 0.05 * clamp(speed(tt) / 8) * (noise(tt * 70) + 0.5 * Math.sin(TAU * 31 * tt))
      o.l += rum, o.r += rum
      sing(tt, o)
    }
  },
}

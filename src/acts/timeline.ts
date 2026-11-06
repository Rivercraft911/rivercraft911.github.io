// Scenes play back to back. Across a fade the two share the beam, so the handoff is drawn, not cut.
import { stereo, type Voice } from '../audio/audio'
import { clamp, type Frame, type Scene } from './scene'

export class Timeline {
  readonly starts: number[] = []
  private a = stereo()
  private b = stereo()

  constructor(readonly scenes: Scene[]) {
    let t = 0
    for (const s of scenes) this.starts.push(t), (t += s.dur)
  }

  index(t: number) {
    let i = 0
    while (i + 1 < this.scenes.length && t >= this.starts[i + 1]) i++
    return i
  }

  build(t: number, f: Frame): Voice | undefined {
    f.ch.length = 0
    f.rate = f.look = f.field = undefined
    const i = this.index(t), s = this.scenes[i], fade = s.fade ?? 0
    const k = fade > 0 && i > 0 ? clamp((t - this.starts[i]) / fade) : 1
    const vb = this.scene(i, t, f, k)
    if (k >= 1) return vb
    const n = f.ch.length, va = this.scene(i - 1, t, f, 1 - k), a = this.a, b = this.b
    f.ch.push(...f.ch.splice(0, n)) // the outgoing scene keeps the earlier beam slot
    return (t, o) => {
      a.l = a.r = b.l = b.r = 0
      a.s.fill(0), b.s.fill(0)
      va?.(t, a)
      vb?.(t, b)
      o.l = a.l + b.l
      o.r = a.r + b.r
      for (let i = 0; i < o.s.length; i++) o.s[i] = a.s[i] + b.s[i]
    }
  }

  // Builds scene i in its own time, weighting its beam share and its voice by k.
  private scene(i: number, t: number, f: Frame, k: number): Voice | undefined {
    const t0 = (f.at = this.starts[i]), n = f.ch.length
    const v = this.scenes[i].build(t - t0, f)
    for (let j = n; j < f.ch.length; j++) (f.ch[j].w *= k), (f.ch[j].off = -t0)
    if (!v) return undefined
    if (k >= 1) return (t, o) => v(t - t0, o)
    return (t, o) => {
      v(t - t0, o)
      o.l *= k, o.r *= k
      for (let i = 0; i < o.s.length; i++) o.s[i] *= k
    }
  }
}

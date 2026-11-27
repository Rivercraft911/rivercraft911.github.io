// The speakers hear what the beam draws: L = x, R = y of the audible channel. After the fall the scope
// rule ends: the first voices are the choir's bed, standing still in a hall, and the rest may sing as
// mono voices placed in 3D (HRTF), Doppler and all.
import url from './worklet.ts?worker&url'
import { Hall } from '../dsp/hall'

export const VOICES = 6
export const BED = 3 // voices 0 and 1 are the choir's left and right, 2 sings in the middle under them
export type Stereo = { l: number; r: number; s: Float64Array } // s: the voices
export type Voice = (t: number, o: Stereo) => void
export const stereo = (): Stereo => ({ l: 0, r: 0, s: new Float64Array(VOICES) })

const AHEAD = 0.15 // seconds of signal kept queued past the present: enough to ride out a slow frame
const C = 2 + VOICES - BED
const GAIN = 0.22, CEIL = 0.89 / GAIN

// The bed's room: rt seconds for its hall to fall 60 dB, how much of the hall is heard, the level, tone, where
// the hall's highs start to die (Hz), shimmer, how much of its tail comes back an octave up, and chorus, how much
// of the ensemble's doubling is heard. The choir and the world set it.
export const room = { rt: 2.5, wet: 0.5, gain: 1, tone: 7000, shimmer: 0, chorus: 0.5 }

// The bed: voices 0 and 1 to left and right through an ensemble, voice 2 in the middle and deeper in the hall,
// its DC blocked (scenes bend the voices), then a gentle stereo-linked compressor, 2:1 over a knee with fast
// attack and slow release, so the swell never clips. The ensemble is a string machine's (Juno-60, chorus I): each
// side read back 1.7 to 5.3 ms late, the delay swung by a slow triangle that runs the other way on the other side,
// so every partial is doubled by one a few cents off it that sways across the stage. The hall hears nothing much
// below 150 Hz, so the bass stays dry and close and the room never booms.
const KNEE = 1
const CH = 512, CHMASK = CH - 1
export class Bed {
  private hall: Hall
  private env = 0
  private att: number
  private rel: number
  private dc: number
  private hp: number
  private lo = [0, 0]
  private x = [0, 0]
  private y = [0, 0]
  private ch = [new Float32Array(CH), new Float32Array(CH)]
  private cl = [0, 0]
  private chp: number
  private cw = 0
  private lfo = 0
  private dlfo: number
  private ms: number
  private wet = room.wet // the room's levels, followed every sample so that a scene setting them once a frame never steps
  private gain = room.gain
  private ease: number
  constructor(sr: number) {
    this.hall = new Hall(sr)
    this.att = 1 - Math.exp(-1 / (0.005 * sr))
    this.rel = 1 - Math.exp(-1 / (0.4 * sr))
    this.dc = 1 - (2 * Math.PI * 15) / sr
    this.hp = 1 - Math.exp((-2 * Math.PI * 150) / sr)
    this.dlfo = 0.5 / sr
    this.chp = 1 - Math.exp((-2 * Math.PI * 250) / sr)
    this.ms = sr / 1000
    this.ease = 1 - Math.exp(-1 / (0.02 * sr))
  }

  clear() {
    this.hall.clear()
    this.lo[0] = this.lo[1] = 0
    this.ch[0].fill(0), this.ch[1].fill(0)
  }

  // The ensemble's late copy of side i, d ms back.
  private late(i: number, d: number) {
    const p = this.cw - d * this.ms, k = Math.floor(p), f = p - k, c = this.ch[i]
    return c[k & CHMASK] + (c[(k + 1) & CHMASK] - c[k & CHMASK]) * f
  }

  mix(o: Stereo) {
    const s = o.s, c = s[2], h = this.hall
    let a = s[0], b = s[1]
    if (!(Math.abs(a + b + c) < 1e3)) return void (s[0] = s[1] = s[2] = 0) // a bad sample must never reach the hall's memory
    if (room.chorus > 0) {
      const w = this.cw & CHMASK, tri = 4 * Math.abs((this.lfo += this.dlfo) - Math.floor(this.lfo) - 0.5) - 1
      // the doubling is of the voices, not the bass: what goes in is highpassed near 250 Hz
      this.ch[0][w] = a - (this.cl[0] += this.chp * (a - this.cl[0]))
      this.ch[1][w] = b - (this.cl[1] += this.chp * (b - this.cl[1]))
      const k = room.chorus
      a += k * this.late(0, 3.5 + 1.8 * tri)
      b += k * this.late(1, 3.5 - 1.8 * tri)
      this.cw++
    }
    const lo = this.lo, k = this.hp
    h.run(a + c - (lo[0] += k * (a + c - lo[0])), b + c - (lo[1] += k * (b + c - lo[1])), room.rt, room.tone, room.shimmer)
    const wet = (this.wet += (room.wet - this.wet) * this.ease), gain = (this.gain += (room.gain - this.gain) * this.ease)
    const l = this.block(0, gain * (a + 0.5 * c + wet * h.l)), r = this.block(1, gain * (b + 0.5 * c + wet * h.r))
    const p = Math.max(Math.abs(l), Math.abs(r))
    this.env += (p > this.env ? this.att : this.rel) * (p - this.env)
    const g = this.env > KNEE ? Math.sqrt(KNEE / this.env) : 1
    o.l += g * l
    o.r += g * r
    s[0] = s[1] = s[2] = 0
  }

  private block(i: number, x: number) {
    const y = x - this.x[i] + this.dc * this.y[i]
    this.x[i] = x
    return (this.y[i] = y)
  }
}

// What the speakers are about to play, summed to mono, as it is rendered: the last 2^15 samples, the
// newest at time `end` (timeline seconds). Spectrograms of the soundtrack read it.
export const heard = { buf: new Float32Array(1 << 15), n: 0, end: 0, sr: 48000 }

export class Audio {
  muted = false
  private ctx?: AudioContext
  private node?: AudioWorkletNode
  private gain?: GainNode
  private pan: PannerNode[] = []
  private t = 0
  private buf = new Float32Array(4096 * C)
  private o = stereo()
  private bed = new Bed(48000)
  private peak = 0

  async start() {
    const ctx = (this.ctx = new AudioContext({ latencyHint: 'interactive' }))
    await ctx.audioWorklet.addModule(url)
    this.node = new AudioWorkletNode(ctx, 'beam-audio', {
      numberOfOutputs: 1 + VOICES - BED,
      outputChannelCount: [2, ...Array<number>(VOICES - BED).fill(1)],
      processorOptions: { voices: VOICES - BED },
    })
    this.bed = new Bed(ctx.sampleRate)
    const lp = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 16_000 })
    this.gain = new GainNode(ctx, { gain: GAIN })
    this.node.connect(lp, 0).connect(this.gain).connect(ctx.destination)
    for (let i = BED; i < VOICES; i++) {
      const p = new PannerNode(ctx, { panningModel: 'HRTF', distanceModel: 'inverse', refDistance: 1, positionZ: -1 })
      this.node.connect(p, 1 + i - BED).connect(lp)
      this.pan[i] = p
    }
  }

  // The final mix as a stream, for recording a clip.
  tap() {
    const d = new MediaStreamAudioDestinationNode(this.ctx!)
    this.gain!.connect(d)
    return d.stream
  }

  mute(m = !this.muted) {
    this.muted = m
    this.gain?.gain.setTargetAtTime(m ? 0 : GAIN, this.ctx!.currentTime, 0.05)
  }

  // Puts spatial voice i at (x, y, z) around the listener (−z is ahead), gliding to avoid zipper noise.
  place(i: number, x: number, y: number, z: number) {
    const p = this.pan[i], t = this.ctx?.currentTime ?? 0
    if (!p) return
    p.positionX.setTargetAtTime(x, t, 0.03)
    p.positionY.setTargetAtTime(y, t, 0.03)
    p.positionZ.setTargetAtTime(z, t, 0.03)
  }

  // Renders the voice from where we left off up to `now + AHEAD` in scene time.
  // Without an audio device (a headless ?auto run) it still renders, so what is heard can be seen.
  feed(now: number, voice?: Voice) {
    if (Math.abs(this.t - now) > 0.3) {
      this.node?.port.postMessage(null)
      this.bed.clear()
      this.t = now
    }
    const sr = (heard.sr = this.ctx?.sampleRate ?? 48000), n = Math.min(this.buf.length / C, Math.floor((now + AHEAD - this.t) * sr))
    if (n <= 0) return
    const o = this.o, b = this.buf, h = heard.buf, mask = h.length - 1
    for (let i = 0; i < n; i++) {
      o.l = o.r = 0
      o.s.fill(0)
      voice?.(this.t + i / sr, o)
      this.bed.mix(o)
      // last, a limiter that only the loudest moments ever reach: both sides held under 1 dB below full scale
      // together, at once, let go over a third of a second
      const p = Math.max(Math.abs(o.l), Math.abs(o.r))
      this.peak = p > this.peak ? p : this.peak + (p - this.peak) * (3 / sr)
      if (this.peak > CEIL) (o.l *= CEIL / this.peak), (o.r *= CEIL / this.peak)
      const j = i * C
      let m = (b[j] = o.l) + (b[j + 1] = o.r)
      for (let v = BED; v < VOICES; v++) m += b[j + 2 + v - BED] = o.s[v]
      h[heard.n++ & mask] = m
    }
    this.t += n / sr
    heard.end = this.t
    this.node?.port.postMessage(b.slice(0, n * C))
  }
}

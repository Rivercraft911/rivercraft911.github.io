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

const AHEAD = 0.1 // seconds of signal kept queued past the present
const C = 2 + VOICES - BED
const GAIN = 0.22

// The bed's room: rt seconds for its hall to fall 60 dB, how much of the hall is heard, the level, and
// tone, where the hall's highs start to die (Hz). The choir sets it.
export const room = { rt: 2.5, wet: 0.5, gain: 1, tone: 7000 }

// The bed: voices 0 and 1 straight to left and right, voice 2 in the middle and deeper in the hall, its
// DC blocked (scenes bend the voices), then a gentle stereo-linked compressor, 2:1 over a knee with fast
// attack and slow release, so the swell never clips. The hall hears nothing much below 150 Hz, so the
// bass stays dry and close and the room never booms.
const KNEE = 1
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
  constructor(sr: number) {
    this.hall = new Hall(sr)
    this.att = 1 - Math.exp(-1 / (0.005 * sr))
    this.rel = 1 - Math.exp(-1 / (0.4 * sr))
    this.dc = 1 - (2 * Math.PI * 15) / sr
    this.hp = 1 - Math.exp((-2 * Math.PI * 150) / sr)
  }

  clear() {
    this.hall.clear()
    this.lo[0] = this.lo[1] = 0
  }

  mix(o: Stereo) {
    const s = o.s, a = s[0], b = s[1], c = s[2], h = this.hall
    if (!(Math.abs(a + b + c) < 1e3)) return void (s[0] = s[1] = s[2] = 0) // a bad sample must never reach the hall's memory
    const lo = this.lo, k = this.hp
    h.run(a + c - (lo[0] += k * (a + c - lo[0])), b + c - (lo[1] += k * (b + c - lo[1])), room.rt, room.tone)
    const l = this.block(0, room.gain * (a + 0.5 * c + room.wet * h.l)), r = this.block(1, room.gain * (b + 0.5 * c + room.wet * h.r))
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

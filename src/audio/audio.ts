// The speakers hear what the beam draws: L = x, R = y of the audible channel. After the fall the scope
// rule ends and scenes may also sing through mono voices placed in 3D (HRTF), Doppler and all.
import url from './worklet.ts?worker&url'

export const VOICES = 6
export type Stereo = { l: number; r: number; s: Float64Array } // s: the spatial voices
export type Voice = (t: number, o: Stereo) => void
export const stereo = (): Stereo => ({ l: 0, r: 0, s: new Float64Array(VOICES) })

const AHEAD = 0.1 // seconds of signal kept queued past the present
const C = 2 + VOICES
const GAIN = 0.22

export class Audio {
  muted = false
  private ctx?: AudioContext
  private node?: AudioWorkletNode
  private gain?: GainNode
  private pan: PannerNode[] = []
  private t = 0
  private buf = new Float32Array(4096 * C)
  private o = stereo()

  async start() {
    const ctx = (this.ctx = new AudioContext({ latencyHint: 'interactive' }))
    await ctx.audioWorklet.addModule(url)
    this.node = new AudioWorkletNode(ctx, 'beam-audio', {
      numberOfOutputs: 1 + VOICES,
      outputChannelCount: [2, ...Array<number>(VOICES).fill(1)],
      processorOptions: { voices: VOICES },
    })
    const lp = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 16_000 })
    this.gain = new GainNode(ctx, { gain: GAIN })
    this.node.connect(lp, 0).connect(this.gain).connect(ctx.destination)
    for (let i = 0; i < VOICES; i++) {
      const p = new PannerNode(ctx, { panningModel: 'HRTF', distanceModel: 'inverse', refDistance: 1, positionZ: -1 })
      this.node.connect(p, 1 + i).connect(lp)
      this.pan.push(p)
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
  feed(now: number, voice?: Voice) {
    if (!this.node) return
    if (Math.abs(this.t - now) > 0.3) {
      this.node.port.postMessage(null)
      this.t = now
    }
    const sr = this.ctx!.sampleRate, n = Math.min(this.buf.length / C, Math.floor((now + AHEAD - this.t) * sr))
    if (n <= 0) return
    const o = this.o, b = this.buf
    for (let i = 0; i < n; i++) {
      o.l = o.r = 0
      o.s.fill(0)
      voice?.(this.t + i / sr, o)
      const j = i * C
      b[j] = o.l, b[j + 1] = o.r
      for (let v = 0; v < VOICES; v++) b[j + 2 + v] = o.s[v]
    }
    this.t += n / sr
    this.node.port.postMessage(b.slice(0, n * C))
  }
}

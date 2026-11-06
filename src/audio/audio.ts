// The speakers hear what the beam draws: L = x, R = y of the audible channel.
import url from './worklet.ts?worker&url'

export type Stereo = { l: number; r: number }
export type Voice = (t: number, o: Stereo) => void

const AHEAD = 0.1 // seconds of signal kept queued past the present

export class Audio {
  muted = false
  private ctx?: AudioContext
  private node?: AudioWorkletNode
  private gain?: GainNode
  private t = 0
  private buf = new Float32Array(48_000)
  private o: Stereo = { l: 0, r: 0 }

  async start() {
    const ctx = (this.ctx = new AudioContext({ latencyHint: 'interactive' }))
    await ctx.audioWorklet.addModule(url)
    this.node = new AudioWorkletNode(ctx, 'beam-audio', { outputChannelCount: [2] })
    const lp = new BiquadFilterNode(ctx, { type: 'lowpass', frequency: 9000 })
    this.gain = new GainNode(ctx, { gain: 0.22 })
    this.node.connect(lp).connect(this.gain).connect(ctx.destination)
  }

  mute(m = !this.muted) {
    this.muted = m
    this.gain?.gain.setTargetAtTime(m ? 0 : 0.22, this.ctx!.currentTime, 0.05)
  }

  // Renders the voice from where we left off up to `now + AHEAD` in scene time.
  feed(now: number, voice?: Voice) {
    if (!this.node) return
    if (Math.abs(this.t - now) > 0.3) {
      this.node.port.postMessage(null)
      this.t = now
    }
    const sr = this.ctx!.sampleRate, n = Math.min(this.buf.length / 2, Math.floor((now + AHEAD - this.t) * sr))
    if (n <= 0) return
    const o = this.o, b = this.buf
    for (let i = 0; i < n; i++) {
      o.l = o.r = 0
      voice?.(this.t + i / sr, o)
      b[2 * i] = o.l
      b[2 * i + 1] = o.r
    }
    this.t += n / sr
    this.node.port.postMessage(b.slice(0, 2 * n))
  }
}

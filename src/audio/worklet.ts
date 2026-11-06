// Plays the beam's audible channel: a stereo ring buffer the main thread keeps ahead of playback.
declare const registerProcessor: (name: string, ctor: unknown) => void
declare class AudioWorkletProcessor {
  readonly port: MessagePort
}

const SIZE = 1 << 17 // interleaved stereo samples, about 1.3 s at 48 kHz
const MASK = SIZE - 1

class BeamAudio extends AudioWorkletProcessor {
  private ring = new Float32Array(SIZE)
  private r = 0
  private w = 0

  constructor() {
    super()
    this.port.onmessage = ({ data }: MessageEvent<Float32Array | null>) => {
      if (!data) return void (this.r = this.w)
      for (let i = 0; i < data.length; i++) this.ring[this.w++ & MASK] = data[i]
      if (this.w - this.r > SIZE) this.r = this.w - SIZE
    }
  }

  process(_: Float32Array[][], [[l, r]]: Float32Array[][]) {
    for (let i = 0; i < l.length; i++) {
      const has = this.r < this.w
      l[i] = has ? this.ring[this.r++ & MASK] : 0
      r[i] = has ? this.ring[this.r++ & MASK] : 0
    }
    return true
  }
}

registerProcessor('beam-audio', BeamAudio)

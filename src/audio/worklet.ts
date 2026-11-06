// Plays what the main thread renders ahead of playback: one ring of interleaved frames, each the scope
// pair (L, R) followed by the mono spatial voices. Output 0 is the scope; output 1 + i is voice i.
declare const registerProcessor: (name: string, ctor: unknown) => void
declare class AudioWorkletProcessor {
  readonly port: MessagePort
  constructor(options?: { processorOptions?: { voices: number } })
}

const FRAMES = 1 << 16 // about 1.4 s at 48 kHz

class BeamAudio extends AudioWorkletProcessor {
  private c: number
  private ring: Float32Array
  private r = 0
  private w = 0

  constructor(options: { processorOptions: { voices: number } }) {
    super(options)
    this.c = 2 + options.processorOptions.voices
    this.ring = new Float32Array(FRAMES * this.c)
    this.port.onmessage = ({ data }: MessageEvent<Float32Array | null>) => {
      if (!data) return void (this.r = this.w)
      const size = this.ring.length
      for (let i = 0; i < data.length; i++) this.ring[this.w++ % size] = data[i]
      if (this.w - this.r > size) this.r = this.w - size
    }
  }

  process(_: Float32Array[][], out: Float32Array[][]) {
    const c = this.c, size = this.ring.length, n = out[0][0].length
    for (let i = 0; i < n; i++) {
      const has = this.r < this.w, o = this.r % size
      for (let j = 0; j < c; j++) {
        const v = has ? this.ring[o + j] : 0
        if (j < 2) out[0][j][i] = v
        else out[j - 1][0][i] = v
      }
      if (has) this.r += c
    }
    return true
  }
}

registerProcessor('beam-audio', BeamAudio)

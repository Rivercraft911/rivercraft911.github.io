// The field shaders the raster can sweep, compiled before the first frame. A scene names one by index.
import wrap from './fields/wrap.wgsl?raw'
import film from './fields/film.wgsl?raw'
import primes from './fields/primes.wgsl?raw'
import camera from './fields/camera.wgsl?raw'
import indra from './fields/indra.wgsl?raw'
import { BINS } from '../dsp/waterfall'

export const ROWS = 4096 // the waterfall's ring of rows
export const SIEVE = [1024, 64] // the primes' sieve: a byte for every 30 integers

export const FIELDS: { code: string; data?: [number, number] }[] = [
  { code: wrap, data: [BINS, ROWS] },
  { code: film + primes, data: [SIEVE[0], SIEVE[1]] },
  { code: camera + film + indra },
]
export const WRAP = 0
export const PRIMES = 1
export const INDRA = 2

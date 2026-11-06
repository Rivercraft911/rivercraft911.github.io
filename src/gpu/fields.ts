// The field shaders the raster can sweep, compiled before the first frame. A scene names one by index.
import wrap from './fields/wrap.wgsl?raw'
import film from './fields/film.wgsl?raw'
import primes from './fields/primes.wgsl?raw'
import camera from './fields/camera.wgsl?raw'
import indra from './fields/indra.wgsl?raw'
import march from './fields/march.wgsl?raw'
import kifs from './fields/kifs.wgsl?raw'
import mandalay from './fields/mandalay.wgsl?raw'
import kaliset from './fields/kaliset.wgsl?raw'
import lyapunov from './fields/lyapunov.wgsl?raw'
import newton from './fields/newton.wgsl?raw'
import honeycomb from './fields/honeycomb.wgsl?raw'
import ophanim from './fields/ophanim.wgsl?raw'
import { BINS } from '../dsp/waterfall'

export const ROWS = 4096 // the waterfall's ring of rows
export const SIEVE = [1024, 64] // the primes' sieve: a byte for every 30 integers

export const FIELDS: { code: string; data?: [number, number] }[] = [
  { code: wrap, data: [BINS, ROWS] },
  { code: film + primes, data: [SIEVE[0], SIEVE[1]] },
  { code: camera + film + indra },
  { code: camera + march + kifs },
  { code: camera + march + mandalay },
  { code: camera + kaliset },
  { code: lyapunov },
  { code: newton },
  { code: camera + honeycomb },
  { code: camera + ophanim },
]
export const WRAP = 0
export const PRIMES = 1
export const INDRA = 2
export const [KIFS, MANDALAY, KALISET, LYAPUNOV, NEWTON, HONEYCOMB, OPHANIM] = [3, 4, 5, 6, 7, 8, 9]

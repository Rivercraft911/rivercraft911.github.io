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
import julia4 from './fields/julia4.wgsl?raw'
import polytope from './fields/polytope.wgsl?raw'
import hole from './fields/hole.wgsl?raw'
import bulb from './fields/bulb.wgsl?raw'
import kleinian from './fields/kleinian.wgsl?raw'
import apollonian from './fields/apollonian.wgsl?raw'
import sierpinski from './fields/sierpinski.wgsl?raw'
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
  { code: camera + march + bulb },
  { code: camera + march + kleinian },
  { code: camera + march + apollonian },
  { code: camera + march + sierpinski },
  { code: camera + film + march + julia4 },
  { code: camera + polytope },
  { code: camera + hole },
]
export const WRAP = 0
export const PRIMES = 1
export const INDRA = 2
export const [KIFS, MANDALAY, KALISET, LYAPUNOV, NEWTON, HONEYCOMB, BULB, KLEINIAN, APOLLONIAN, SIERPINSKI, JULIA4, POLYTOPE, HOLE] = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]

// The field shaders the raster can sweep, compiled while the first act plays. A scene names one by index.
import wrap from './fields/wrap.wgsl?raw'
import film from './fields/film.wgsl?raw'
import primes from './fields/primes.wgsl?raw'
import camera from './fields/camera.wgsl?raw'
import pearls from './fields/pearls.wgsl?raw'
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
import bulb from './fields/bulb.wgsl?raw'
import kleinian from './fields/kleinian.wgsl?raw'
import apollonian from './fields/apollonian.wgsl?raw'
import sierpinski from './fields/sierpinski.wgsl?raw'
import r01 from './fields/r01.wgsl?raw'
import { BINS } from '../dsp/waterfall'

export const ROWS = 4096 // the waterfall's ring of rows
export const SIEVE = [1024, 64] // the primes' sieve: a byte for every 30 integers

// A field's data texture: width, height, bytes a texel (2: rg8, a 16-bit value split high and low; 4: rgba8),
// and mip levels, for pictures (raster.ts pictures); or, for shots, the raster's shot of every world.
export const FIELDS: { code: string; data?: [number, number, number?, number?]; shots?: true }[] = [
  { code: camera + film + pearls + wrap, data: [BINS, ROWS, 2] }, // the drain opens onto the pearls
  { code: film + primes, data: [SIEVE[0], SIEVE[1]] },
  { code: camera + film + pearls + indra },
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
]
export const WRAP = 0
export const PRIMES = 1
export const INDRA = 2
export const [KIFS, MANDALAY, KALISET, LYAPUNOV, NEWTON, HONEYCOMB, BULB, KLEINIAN, APOLLONIAN, SIERPINSKI, JULIA4, POLYTOPE] = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]
// The worlds of the fall, in the order we fell through them: the raster keeps a shot of each (raster.ts).
export const WORLDS = [INDRA, KIFS, BULB, MANDALAY, KLEINIAN, KALISET, APOLLONIAN, LYAPUNOV, SIERPINSKI, NEWTON, HONEYCOMB, JULIA4]
// The worlds after the fall, one a project: each appends its own.
export const R01 = FIELDS.push({ code: camera + film + r01, data: [320, 120, 2] }) - 1
// The finale: the cathedral falls in.
import holeA from './fields/holeA.wgsl?raw'
export const HOLEA = FIELDS.push({ code: camera + holeA, shots: true }) - 1
// The long zoom: River's boards, every picture of them in one atlas, and the table boards.wgsl reads them by.
import boards from './fields/boards.wgsl?raw'
import { ATLAS, BOARDS as BOARD, tiles } from '../boards'
const v4 = (...a: number[]) => `vec4f(${a.map((v) => +v.toFixed(4)).join(', ')})`
const table = BOARD.flatMap((b, i) => {
  const [hx = -1, hy = -1, drill = 0, pad = 0] = b.hole ?? [], close = b.close ?? []
  const out = [v4(b.w, b.h, hx, hy), v4(drill, pad, 1 + close.length, 0)]
  ;[[0, 0, b.w, b.h], ...close.map(([x, y, mm]) => [x, y, mm, mm])].forEach((m, j) => {
    const t = tiles[i][j]
    out.push(v4(...m), v4(t.x, t.y, t.w, t.h))
  })
  while (out.length < 12) out.push(v4(0, 0, 0, 0))
  return out
})
export const BOARDS = FIELDS.push({ code: `const BOARD = array<vec4f, ${table.length}>(${table.join(',\n')});\n` + camera + boards, data: [ATLAS[0], ATLAS[1], 4, 10] }) - 1

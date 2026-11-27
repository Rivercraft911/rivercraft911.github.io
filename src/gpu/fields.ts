// The field shaders the raster can sweep, compiled while the first act plays. A scene names one by index.
import wrap from './fields/wrap.wgsl?raw'
import film from './fields/film.wgsl?raw'
import camera from './fields/camera.wgsl?raw'
import r01 from './fields/r01.wgsl?raw'
import { BINS } from '../dsp/waterfall'

export const ROWS = 4096 // the waterfall's ring of rows

// A field's data texture: width, height, bytes a texel (2: rg8, a 16-bit value split high and low; 4: rgba8),
// and mip levels, for pictures (raster.ts pictures).
export const FIELDS: { code: string; data?: [number, number, number?, number?] }[] = [
  { code: camera + wrap, data: [BINS, ROWS, 2] }, // the falls' pool and its whirlpool
]
export const WRAP = 0
// R-01's own room (world/r01.ts, ?world=r01)
export const R01 = FIELDS.push({ code: camera + film + r01, data: [320, 120, 2] }) - 1
// The world after the arrival: River's planet, its air, its storm and its aurora. Its noise is a tile of white noise,
// r the same as g but 37, 17 texels on, so one bilinear tap reads a lattice at two depths (planet.wgsl); the second
// mip is never read, only there so a picture may be copied in.
import planet from './fields/planet.wgsl?raw'
import cosmos from './fields/cosmos.wgsl?raw'
import arrive from './fields/arrive.wgsl?raw'
import { pictures } from './raster'
export const PLANET = FIELDS.push({ code: camera + cosmos + planet + 'fn field(q: vec2f) -> vec3f { return planet(q); }', data: [256, 256, 4, 2] }) - 1
// The arrival (acts/arrive.ts): the same world from inside its air, which hands the frame back to the planet's own.
export const ARRIVE = FIELDS.push({ code: camera + cosmos + planet + arrive, data: [256, 256, 4, 2] }) - 1
{
  const px = new Uint8ClampedArray(4 << 16)
  for (let i = 0, s = 1; i < 1 << 16; i++) px[4 * i + 1] = (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) >>> 24, px[4 * i + 3] = 255
  for (let i = 0; i < 1 << 16; i++) px[4 * i] = px[4 * (((((i >> 8) + 17) & 255) << 8) | ((i + 37) & 255)) + 1]
  for (const shader of [PLANET, ARRIVE]) createImageBitmap(new ImageData(px, 256)).then((img) => pictures.push({ shader, img, x: 0, y: 0, mip: 0 }))
}
// Inside the planet (world/sites/core.ts): the planet's own field, with the hollow under its well in full. What stands
// in the hall and what is on its wall are a glow in planet.wgsl (hall, vault), under another name here, and core.wgsl's
// take theirs. Its data is the planet's noise with the primes' own numbers beside it (core.ts sends both).
import core from './fields/core.wgsl?raw'
export const CORE = FIELDS.push({ code: camera + cosmos + planet.replace('fn hall(', 'fn hall0(').replace('fn vault(', 'fn vault0(') + core, data: [256, 256, 4] }) - 1
// The dive (acts/dive.ts): down the drain's throat through a mountain of worlds to a black hole, the sky lensed round it.
import dive from './fields/dive.wgsl?raw'
export const DIVE = FIELDS.push({ code: camera + cosmos + dive }) - 1

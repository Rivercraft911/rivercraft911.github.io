// R-01, the lighthouse: River's RGB raster laser projector, its chassis, polygon and boards stood where places.ts puts
// them. Here is its frame, for the sound. The machine is r01.ts's, number for number: a 4-facet polygon at 27 000 RPM
// is 1800 lines a second, the beam out for the middle 30 % of each facet's sweep, the galvo stepping the odd lines down
// and the even lines back up, each laser's four binary-weighted currents giving 16 levels. The frame is the one R-01's
// firmware was written to paint and never did (its motor caught fire on demo day). Run 15× slow, 120 lines a second.
const NX = 320, NY = 120 // as r01.ts
const SLOW = 15, RATE = 1800 / SLOW // lines a second, here
const line = (j: number) => (j < 60 ? 2 * j + 1 : 238 - 2 * j) // the galvo's order

// The frame: each line's running sum of each laser's 4-bit levels, so any span of a line averages in one step.
const sum = new Float32Array(NY * (NX + 1) * 3)
let ready = false
const lin = (v: number) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
fetch(`${import.meta.env.BASE_URL}media/r01/raster.png`)
  .then((r) => r.blob())
  .then(createImageBitmap)
  .then((b) => {
    const c = new OffscreenCanvas(NX, NY).getContext('2d')!
    c.drawImage(b, 0, 0, NX, NY)
    const px = c.getImageData(0, 0, NX, NY).data
    for (let L = 0; L < NY; L++)
      for (let x = 0; x < NX; x++)
        for (let k = 0, o = (L * (NX + 1) + x) * 3; k < 3; k++) sum[o + 3 + k] = sum[o + k] + Math.round(15 * lin(px[4 * (L * NX + x) + k])) / 15 // quantised in linear light
    ready = true
  })

// What it sounds like: the frame as a chord. A photodiode under it hears the lines go by at 120 a second, so all it
// can hear is that rate's harmonics; here each laser is one of them, red the second, green the third, blue the fifth
// (a major triad, in just intonation), each as loud as its own light along the line being painted, read in the
// galvo's order. The scan goes down the frame and back once a second, so the chord's colour follows the picture's,
// top to bottom: sky, then the land.
const HARM = [2, 3, 5], amp = [0, 0, 0], turns = [0, 0, 0, 0, 0, 0]
let read = -1
export function voice(t: number, dt: number) {
  const f = Math.floor(RATE * t)
  if (f !== read && ready) {
    read = f
    const row = line(((f % NY) + NY) % NY) * (NX + 1) * 3
    for (let k = 0; k < 3; k++) amp[k] += 0.25 * ((sum[row + 3 * NX + k] - sum[row + k]) / NX - amp[k]) // over a few lines
  }
  let v = 0
  for (let k = 0; k < 6; k++) {
    // each a pair a fifth of a hertz apart, so the light shimmers
    turns[k] += dt * (HARM[k >> 1] * RATE + (k & 1 ? 0.2 : 0)), turns[k] -= Math.floor(turns[k])
    v += amp[k >> 1] * Math.sin(2 * Math.PI * turns[k])
  }
  return 0.3 * v
}

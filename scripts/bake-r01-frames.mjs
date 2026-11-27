// Bakes the frames R-01 prints in the world (src/world/sites/r01-frames.ts): 320 × 120 bytes each, rrrgggbb as its
// firmware's framebuffer holds them, written a line at a time as runs (length, byte) and kept as base64. The first is
// the firmware's own intro frame (gif_logo_intro.h, made from logoYes.png by River's tools/gif2c.py); the others are a
// line set in EMS Tech, the site's face, in the intro frame's green (rrr 2, ggg 7), its edges antialiased in the
// palette's own steps. `node scripts/bake-r01-frames.mjs`; needs River's R-01 repository.
import { readFileSync, writeFileSync } from 'node:fs'

const W = 320, H = 120
const FW = 'file:///Users/river/Documents/github/R-01_Raster_Laser_Projector/firmware/'
const tech = JSON.parse(readFileSync(new URL('../src/beam/fonts/tech.json', import.meta.url), 'utf8'))

function firmware(file) {
  const s = readFileSync(new URL(file, FW), 'utf8')
  return Uint8Array.from(s.slice(s.indexOf('= {') + 3).match(/\d+/g).slice(0, W * H), Number)
}

// `s` centred, its strokes r px either side of their line, as wide as fits.
function text(s, r) {
  const adv = [...s].reduce((w, ch) => w + tech.g[ch][0], 0), cap = Math.min(30, (W - 24) / adv), segs = []
  let x0 = (W - adv * cap) / 2
  const y0 = (H + cap) / 2 // the baseline
  for (const ch of s) {
    const [a, strokes] = tech.g[ch]
    for (const p of strokes) for (let i = 2; i < p.length; i += 2) segs.push([x0 + p[i - 2] * cap, y0 - p[i - 1] * cap, x0 + p[i] * cap, y0 - p[i + 1] * cap])
    x0 += a * cap
  }
  const px = new Uint8Array(W * H)
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let d = Infinity
      for (const [ax, ay, bx, by] of segs) {
        const dx = bx - ax, dy = by - ay, k = Math.max(0, Math.min(1, ((x + 0.5 - ax) * dx + (y + 0.5 - ay) * dy) / (dx * dx + dy * dy || 1)))
        d = Math.min(d, Math.hypot(ax + k * dx - x - 0.5, ay + k * dy - y - 0.5))
      }
      const c = Math.max(0, Math.min(1, r + 0.5 - d))
      px[y * W + x] = (Math.round(2 * c) << 5) | (Math.round(7 * c) << 2)
    }
  return px
}

function runs(px) {
  const out = []
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; ) {
      let n = 1
      while (x + n < W && n < 255 && px[y * W + x + n] === px[y * W + x]) n++
      out.push(n, px[y * W + x]), (x += n)
    }
  return Buffer.from(out).toString('base64')
}

const frames = [['the firmware’s intro frame', firmware('gif_logo_intro.h')], ['River’s name', text('RIVER DOWDY', 2.2)], ['from R-01’s README: what it was to project on Hoover Tower', text('107E ROCKS!', 2.2)]]
writeFileSync(new URL('../src/world/sites/r01-frames.ts', import.meta.url), `// R-01's frames, baked by scripts/bake-r01-frames.mjs: 320 × 120 bytes each, rrrgggbb as its firmware holds them, a
// line at a time as runs (length, byte), in base64.
export const FRAMES = [
${frames.map(([what, px]) => `  // ${what}\n  '${runs(px)}',`).join('\n')}
]
`)

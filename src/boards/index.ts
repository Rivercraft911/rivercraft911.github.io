// River's boards for the long zoom, in the order the film falls through them, baked by scripts/bake-boards.mjs.
// Each has a top-down picture cropped to its Edge.Cuts bounding box, and geometry in mm from that box's top-left,
// y down, so (x / w, y / h) is the picture's uv. The list ships with the first frame; geometry loads on demand.
import list from './list.json'

export type Board = {
  id: string
  title: string
  project: string
  w: number // mm, the Edge.Cuts bounding box
  h: number
  layers: string[] // copper, top first
  outline: number[][] // polylines [x0, y0, x1, y1, …], arcs flattened
  tracks: number[][] // [layer, width, net, x0, y0, x1, y1, …]: runs of one net, layer and width
  nets: string[]
  vias: [x: number, y: number, drill: number, diameter: number][]
}
// src: the picture. hole: the one the zoom falls through, [x, y, drill, pad] (pad = drill: unplated); close: the
// close-ups baked around it, [x0, y0, mm, px] each, a square of the board seen closer.
export type Info = Pick<Board, 'id' | 'title' | 'project' | 'w' | 'h'> & { src: string; hole?: number[]; close?: number[][] }

const lazy = import.meta.glob<Board>(['./*.json', '!./list.json'], { import: 'default' })
const media = `${import.meta.env.BASE_URL}media/boards/`
export const BOARDS: Info[] = list.map((b) => ({ ...b, src: `${media}${b.id}.webp` }))
export const boards: Record<string, Board> = {}
export const load = async (id: string) => (boards[id] ??= await lazy[`./${id}.json`]())

// Every picture in one texture, as the long zoom reads them: each board whole at 1024 px on its long side, then
// its close-ups, packed first-fit on a grid of 512 px cells, so each mip of a picture stays inside its own cells.
export const CELL = 512, SIDE = 1024
export type Tile = { src: string; x: number; y: number; w: number; h: number }
export const tiles: Tile[][] = [] // per board: the whole picture, then its close-ups
const COLS = 8, used: boolean[] = []
const fit = (w: number, h: number) => {
  const cw = Math.ceil(w / CELL), ch = Math.ceil(h / CELL), free = (i: number) => {
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) if (used[i + y * COLS + x]) return false
    return true
  }
  let i = 0
  while (i % COLS > COLS - cw || !free(i)) i++
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) used[i + y * COLS + x] = true
  return [(i % COLS) * CELL, Math.floor(i / COLS) * CELL]
}
const at = (src: string, w: number, h: number): Tile => {
  const [x, y] = fit(w, h)
  return { src, x, y, w, h }
}
for (const b of BOARDS) {
  const k = SIDE / Math.max(b.w, b.h)
  tiles.push([at(b.src, Math.round(b.w * k), Math.round(b.h * k)), ...(b.close ?? []).map((c, j) => at(`${media}${b.id}-${j}.webp`, c[3], c[3]))])
}
export const ATLAS = [COLS * CELL, Math.ceil(used.length / COLS) * CELL]

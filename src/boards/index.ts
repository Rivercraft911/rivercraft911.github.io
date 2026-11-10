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
export type Info = Pick<Board, 'id' | 'title' | 'project' | 'w' | 'h'> & { src: string } // src: the picture

const lazy = import.meta.glob<Board>(['./*.json', '!./list.json'], { import: 'default' })
export const BOARDS: Info[] = list.map((b) => ({ ...b, src: `${import.meta.env.BASE_URL}media/boards/${b.id}.webp` }))
export const boards: Record<string, Board> = {}
export const load = async (id: string) => (boards[id] ??= await lazy[`./${id}.json`]())

// The station ident in the corner once the name has been written.
import { text } from '../beam/font'
import type { Path } from '../beam/path'
import { view } from './scene'

export const NAME = 'RIVER DOWDY'
export const CALL = 'KJ5SCH'
export const HEAD = { y: 0.86, size: 0.05 }

export function header(p: Path, call = 1) {
  const x = -view.a * 0.92
  p.intensity(0.75)
  const w = text(p, NAME, x, HEAD.y, HEAD.size)
  if (call > 0) p.intensity(0.75 * call), text(p, `  ·  ${CALL}`, x + w, HEAD.y, HEAD.size)
  p.intensity(1)
}

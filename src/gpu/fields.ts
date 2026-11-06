// The field shaders the raster can sweep, compiled before the first frame. A scene names one by index.
import wrap from './fields/wrap.wgsl?raw'
import { BINS } from '../dsp/waterfall'

export const ROWS = 4096 // the waterfall's ring of rows

export const FIELDS: { code: string; data?: [number, number] }[] = [{ code: wrap, data: [BINS, ROWS] }]
export const WRAP = 0

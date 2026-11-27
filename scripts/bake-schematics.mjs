// Bakes each of River's boards' schematics (bake-boards.mjs's list) into one PDF, public/media/schematics/<id>.pdf,
// every sheet of it, linked from the pages. KiCad opens copies of the sheets, since it leaves a lock file beside what it
// opens; a schematic carries its own symbols, so the sheets and the project (its text variables) are all it needs.
// Hovering a part for its properties would double the file, so the PDF goes without. `node scripts/bake-schematics.mjs [<id…>]`.
// Needs KiCad 10.
import { execFileSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { BOARDS } from './bake-boards.mjs'

const KICAD = '/Applications/KiCad/KiCad.app/Contents/MacOS/kicad-cli', OUT = new URL('../public/media/schematics/', import.meta.url).pathname
const only = process.argv.slice(2), tmp = mkdtempSync(join(tmpdir(), 'schematics-'))
mkdirSync(OUT, { recursive: true })
try {
  let total = 0
  for (const b of BOARDS) {
    if (only.length && !only.includes(b.id)) continue
    const sch = (b.file ?? join(b.clone, b.path)).replace(/pcb$/, 'sch'), home = dirname(sch), at = join(tmp, b.id), pdf = join(OUT, `${b.id}.pdf`)
    if (!existsSync(sch)) throw new Error(`${b.id}: no ${sch}`)
    mkdirSync(at)
    for (const f of readdirSync(home)) if (/\.kicad_(sch|pro)$/.test(f)) copyFileSync(join(home, f), join(at, f))
    execFileSync(KICAD, ['sch', 'export', 'pdf', '--exclude-pdf-property-popups', '-o', pdf, join(at, sch.split('/').pop())], { stdio: 'pipe' })
    total += statSync(pdf).size
    console.log(b.id, `${(statSync(pdf).size / 1024).toFixed(0)} kB`)
  }
  console.log(`${(total / 1048576).toFixed(2)} MB`)
} finally {
  rmSync(tmp, { recursive: true, force: true })
}

// A world's page: real text over the world, at the right (at the bottom on a phone), folded away with its
// button or Escape. Its four sections are weighted like R-01's laser channels, ×1 ×2 ×4 ×8.
import './world.css'

export type Page = {
  name: string
  what: string
  problem: string
  built: string[]
  proof: [number: string, note: string]
  status: string
  media: { src: string; alt: string; video?: true }[]
  link: [label: string, href: string]
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...kids: (Node | string)[]) => {
  const e = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v)
  e.append(...kids)
  return e
}
const head = (w: string, title: string) => el('h2', {}, el('b', {}, w), ' ', title)

let root: HTMLElement | undefined
// How much of the screen's width the page covers, so the world can frame its subject in the rest.
export const cover = () => (!root || root.classList.contains('shut') || innerWidth < innerHeight * 0.85 ? 0 : root.offsetWidth / innerWidth)

export function panel(p: Page) {
  if (root) return
  const media = p.media.map((m) =>
    el(
      'figure',
      {},
      m.video
        ? el('video', { src: m.src, muted: '', autoplay: '', loop: '', playsinline: '', preload: 'metadata', 'aria-label': m.alt })
        : el('img', { src: m.src, alt: m.alt, loading: 'lazy', decoding: 'async' }),
      el('figcaption', {}, m.alt),
    ),
  )
  const page = el(
    'div',
    { class: 'page', id: 'world-page' },
    el('header', {}, el('h1', {}, p.name), el('p', { class: 'what' }, p.what)),
    el('section', {}, head('×1', 'the problem'), el('p', {}, p.problem)),
    el('section', {}, head('×2', 'what River built'), ...p.built.map((b) => el('p', {}, b))),
    el('section', { class: 'proof' }, head('×4', 'the proof'), el('p', { class: 'num' }, p.proof[0]), el('p', {}, p.proof[1])),
    el('section', {}, head('×8', 'on the bench'), ...media),
    el('p', { class: 'status' }, p.status),
    el('p', { class: 'link' }, el('a', { href: p.link[1], target: '_blank', rel: 'noopener' }, p.link[0])),
  )
  const fold = el('button', { class: 'fold', type: 'button', 'aria-controls': 'world-page' })
  const r = (root = el('aside', { id: 'world', 'aria-label': p.name }, fold, page))
  const set = (shut: boolean) => {
    r.classList.toggle('shut', shut)
    fold.setAttribute('aria-expanded', String(!shut))
    fold.textContent = shut ? `${p.name} ◂` : 'hide ▸'
    page.inert = shut
    for (const v of page.querySelectorAll('video')) shut ? v.pause() : v.play().catch(() => {})
  }
  fold.addEventListener('click', () => set(!r.classList.contains('shut')))
  addEventListener('keydown', (e) => e.key === 'Escape' && set(true))
  for (const v of page.querySelectorAll('video')) v.muted = true // the attribute alone does not mute it
  set(false)
  document.body.append(r)
}

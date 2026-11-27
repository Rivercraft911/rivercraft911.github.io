// The world's words: real DOM over River's planet, for whoever came to read. A place's page (each of its projects:
// what it is, the proof, how it works, links, pictures) comes in as the camera arrives, at the right, or over the
// bottom on a phone. The index of places, each with its one best proof, stays in the corner, so the 30-second
// version is always one glance away. /<slug> under the base lands on the place that holds it.
import './pages.css'
import { PLACES } from './places'
import { BEST, CONTACT, WORKS, type Work } from './content'
import type { Media } from '../band/projects'

const BASE = import.meta.env.BASE_URL // '/', or '/next/' while the world is being made
const TITLE = document.title
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...kids: (Node | string)[]) => {
  const e = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v)
  e.append(...kids)
  return e
}
const works = (k: number) => PLACES[k].slugs.flatMap((s) => WORKS[s] ?? [])
const ink = (k: number) => `rgb(${PLACES[k].ink.map((c) => Math.round(255 * Math.min(1, c))).join(' ')})`
const deg = (v: number, pos: string, neg: string) => `${Math.abs(v).toFixed(1)}° ${v < 0 ? neg : pos}`
const tie = (s: string) => s.replace(/(\d) (?=\S)/g, '$1\u00a0') // a number never leaves its unit, or its own digits
const out = (u: string): Record<string, string> => (u.startsWith('http') ? { href: u, rel: 'noopener', target: '_blank' } : { href: u })

// ---- routes: /<slug> or /<place id>, under the base -------------------------------------------------------------
export function deep(path = location.pathname) {
  const s = (path.startsWith(BASE) ? path.slice(BASE.length) : path.slice(1)).replace(/\/$/, '').toLowerCase()
  return s ? PLACES.findIndex((P) => P.id === s || P.slugs.includes(s)) : -1
}
export function route(k: number) {
  if (k >= 0 && deep() === k) return // already a path into this place, through whichever of its projects
  const path = k < 0 ? BASE : BASE + PLACES[k].slugs[0]
  if (location.pathname !== path) history.pushState(null, '', path + location.search)
}

// ---- the index: who, how to reach them, and every place with its proof -------------------------------------------
const reach = el('p', { class: 'reach' })
for (const [t, u] of [['github', CONTACT.github], ['email', CONTACT.email && `mailto:${CONTACT.email}`], ['linkedin', CONTACT.linkedin], ['résumé', CONTACT.resume]])
  if (u) reach.append(el('a', out(u), t))
const entries = PLACES.map((P, k) =>
  el('a', { href: BASE + P.slugs[0], 'data-k': String(k), style: `--c: ${ink(k)}` },
    el('span', { class: 'n', 'aria-hidden': 'true' }, String(k + 1)),
    el('b', {}, works(k)[0]?.title ?? P.id),
    el('span', {}, tie(BEST[P.id] ?? works(k)[0]?.remarkable ?? '')),
  ),
)
const index = el(
  'nav',
  { class: 'index', 'aria-label': 'River Dowdy’s work' },
  el('header', {}, el('h1', {}, CONTACT.name), el('p', {}, CONTACT.what), reach),
  el('ol', {}, ...entries.map((a, i) => el('li', { style: `--i: ${i + 1}` }, a))),
)

// ---- a page: the place's projects, one after another ---------------------------------------------------------------
const figure = (m: Media) =>
  el(
    'figure',
    {},
    m.video
      ? el('video', { 'data-src': m.src, muted: '', loop: '', playsinline: '', controls: '', preload: 'none', 'aria-label': m.alt })
      : el('img', { 'data-src': m.src, alt: m.alt, decoding: 'async' }),
    el('figcaption', { 'aria-hidden': 'true' }, m.alt),
  )
function article(w: Work) {
  const a = el('article', { id: `w-${w.slug}` }, el('h2', { tabindex: '-1' }, w.title), el('p', { class: 'yr' }, w.years), el('p', { class: 'rem' }, tie(w.remarkable)))
  if (w.numbers.length) a.append(el('dl', {}, ...w.numbers.flatMap(([d, v]) => [el('dt', {}, d), el('dd', {}, tie(v))])))
  a.append(...w.body.map((b) => el('p', {}, tie(b))))
  if (w.links.length) a.append(el('ul', { class: 'links' }, ...w.links.map(([t, u]) => el('li', {}, el('a', out(u), t)))))
  a.append(...w.media.map(figure))
  return a
}
const sheets = PLACES.map((_, k) => {
  const n = (k + 1) % PLACES.length
  return el('div', { hidden: '' }, ...works(k).map(article), el('p', { class: 'next' }, el('a', { href: BASE + PLACES[n].slugs[0], 'data-k': String(n) }, `next · ${works(n)[0]?.title ?? PLACES[n].id} →`)))
})
const where = el('span', { 'aria-hidden': 'true' })
const close = el('button', { type: 'button', title: 'Esc' }, '← all work')
const scroll = el('div', { class: 'scroll' }, ...sheets)
const leaf = el('section', { class: 'page' }, el('p', { class: 'bar' }, where, close), scroll)
const root = el('div', { id: 'w', hidden: '' }, index, leaf)

// Pictures load as they near the reader, and arrive the way R-01 paints: odd lines down, then the even ones.
const still = matchMedia('(prefers-reduced-motion: reduce)')
const near = new IntersectionObserver(
  (es) => es.forEach((e) => {
    if (!e.isIntersecting) return
    const m = e.target.firstElementChild as HTMLImageElement | HTMLVideoElement
    m.src = m.dataset.src!
    if (m instanceof HTMLVideoElement) m.muted = true // the attribute alone does not mute it
    near.unobserve(e.target)
  }),
  { root: scroll, rootMargin: '0px 0px 100% 0px' },
)
const seen = new IntersectionObserver(
  (es) => es.forEach((e) => {
    const f = e.target, m = f.firstElementChild!
    if (e.isIntersecting && m instanceof HTMLImageElement && !m.complete) m.addEventListener('load', () => f.classList.add('drawn'), { once: true })
    else if (e.isIntersecting) f.classList.add('drawn')
    if (m instanceof HTMLVideoElement && m.src) e.isIntersecting && !still.matches ? m.play().catch(() => {}) : m.pause()
  }),
  { root: scroll, threshold: 0.2 },
)
for (const f of scroll.querySelectorAll('figure')) near.observe(f), seen.observe(f)

// ---- showing: a page once the camera has flown there ------------------------------------------------------------
let shown = -1, timer = 0, landing = deep() >= 0
let fly: (k: number) => void = () => {}, live = () => false

// Place k's page, after `after` seconds of flight; k < 0 puts it away.
export function page(k: number, after = 0) {
  clearTimeout(timer)
  const mine = root.contains(document.activeElement) // the reader is in the words: keep them there
  entries.forEach((a, j) => (j === k ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')))
  root.classList.remove('open')
  if (shown >= 0 && k !== shown) {
    if (mine) entries[shown].focus({ preventScroll: true })
    for (const v of sheets[shown].querySelectorAll('video')) v.pause()
  }
  leaf.inert = true
  if (k < 0) return (shown = -1), (document.title = TITLE), measure()
  if (landing) (after = 0.5), (landing = false) // a deep link came for the words: they need not wait for the flight
  timer = setTimeout(() => {
    sheets.forEach((s, j) => (s.hidden = j !== k))
    shown = k
    const P = PLACES[k], ws = works(k)
    leaf.style.setProperty('--c', ink(k))
    leaf.setAttribute('aria-label', ws.map((w) => w.title).join(', '))
    where.textContent = `${String(k + 1).padStart(2, '0')} / ${String(PLACES.length).padStart(2, '0')} · ${deg(P.lat, 'N', 'S')} ${deg(P.lon, 'E', 'W')}`
    document.title = `${ws.map((w) => w.title).join(' · ')} · ${CONTACT.name}`
    root.classList.add('open')
    leaf.inert = false
    const at = document.getElementById(`w-${location.pathname.split('/').filter(Boolean).pop()}`) // /driftwood: its own article
    scroll.scrollTop = at && sheets[k].contains(at) && at !== sheets[k].firstElementChild ? at.offsetTop - 24 : 0
    if (mine) sheets[k].querySelector('h2')!.focus({ preventScroll: true })
    measure()
  }, after * 1000)
}

// How much of the screen the words cover, across from the right and up from the bottom, so the camera can frame its
// subject in what is left: [right, bottom], fractions of the width and height. Measured when it changes.
const cover = [0, 0]
export const covered = () => cover
const phone = matchMedia('(max-aspect-ratio: 17 / 20)')
function measure() {
  const open = root.classList.contains('open') && !root.hidden
  cover[0] = open && !phone.matches ? leaf.offsetWidth / innerWidth : 0
  cover[1] = root.hidden || !phone.matches ? 0 : (open ? leaf.offsetHeight : index.offsetHeight) / innerHeight
}
new ResizeObserver(measure).observe(root)

// Called once by the planet: `go` flies the camera to place k (k < 0: home), `on` says whether the world is being
// drawn, so its words show only while it is. A deep link sets off for its place at once.
export function mount(go: (k: number) => void, on: () => boolean) {
  fly = go, live = on
  document.body.append(root)
  requestAnimationFrame(function watch() {
    if (root.hidden === live()) (root.hidden = !live()), measure()
    requestAnimationFrame(watch)
  })
  if (deep() >= 0) go(deep())
}
// Where the name stands in the words, on the screen: the ident lands the beam's name there, and the words take over.
export function title() {
  const h = root.querySelector('h1')!, was = root.hidden
  root.hidden = false
  const g = document.createRange()
  g.selectNodeContents(h) // the letters, not the block they stand in
  const r = g.getBoundingClientRect(), s = getComputedStyle(h), w = h.textContent!.length
  root.hidden = was
  return { left: r.left, bottom: r.bottom - parseFloat(s.fontSize) * 0.22, width: r.width - parseFloat(s.letterSpacing || '0') * (w > 0 ? 1 : 0) } // less the last letter's spacing
}
// Which place the reader is pointing at in the index (or has focused there), so the world can mark it on the ground.
let over = -1
for (const a of entries) {
  const k = +a.dataset.k!, off = () => over === k && (over = -1)
  a.addEventListener('pointerenter', () => (over = k)), a.addEventListener('focus', () => (over = k))
  a.addEventListener('pointerleave', off), a.addEventListener('blur', off)
}
export const hovered = () => over
// Is this event's target in the words? Keys pressed there are the reader's (space scrolls; it doesn't pause).
export const within = (t: EventTarget | null) => t instanceof Node && root.contains(t)

root.addEventListener('click', (e) => {
  const a = (e.target as Element).closest<HTMLElement>('a[data-k]')
  if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return
  e.preventDefault()
  fly(+a.dataset.k!)
})
close.addEventListener('click', () => fly(-1))
leaf.addEventListener('wheel', (e) => e.stopPropagation(), { passive: true }) // reading, not changing altitude
addEventListener(
  'popstate',
  (e) => {
    if (!live()) return
    e.stopImmediatePropagation() // the world has the history now, not the band
    fly(deep())
  },
  true,
)

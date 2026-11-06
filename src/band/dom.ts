// The band's words, as real DOM: one <article> per project, in frequency order, readable without the
// beam. The canvas is art; this is the source of truth. An article is quiet (visually hidden but read),
// lit (its header in the marker readout) or open (the demodulated page). Photos load on first open.
import './band.css'
import { PROJECTS, WEEK0, type Project } from './projects'

export const ORDER = PROJECTS.map((_, k) => k).sort((a, b) => PROJECTS[a].freq - PROJECTS[b].freq)
// Marker numbers, which the number keys jump to: by what River would show first.
export const KEYS = ['esp-dvbs2', 'yapogee', 'r-01', 'peep', 'pigeon-vision', 'autoprime', 'samwise', 'infiniterecon', 'driftwood', 'magtorqreflect']
export const keyOf = (k: number) => {
  const i = KEYS.indexOf(PROJECTS[k].slug)
  return i < 0 ? (PROJECTS[k].slug === 'qsl' ? 'Q' : '') : String((i + 1) % 10)
}

// 2420000000 → "2.420 000 GHz": the readout's own way of writing a frequency.
const PRE = ['n', 'μ', 'm', '', 'k', 'M', 'G', 'T', 'P']
export function hz(f: number, digits = 4) {
  const e = Math.max(-3, Math.min(5, Math.floor(Math.log10(f) / 3)))
  const v = f / 1000 ** e, s = v.toPrecision(digits)
  return `${s.includes('e') ? v.toFixed(0) : s} ${PRE[e + 3]}Hz`
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...kids: (Node | string)[]) => {
  const e = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v)
  e.append(...kids)
  return e
}

const DEMO = {
  esp: 'Live: DVB-S2 frames from this site’s own encoder, 8PSK 9/10 with π/2-BPSK headers and pilots, slowed ten-thousandfold.',
  yapogee: 'Live: each frame names its own modcod in its header, QPSK 9/10 → 8PSK 5/6 → 16APSK → 32APSK, the four Yapogee runs.',
  ulam: 'Live: the integers on a square spiral, primes lit as they arrive. The diagonals are quadratics rich in primes.',
  raster: 'Live: a 64 × 24 frame painted the way R-01 paints, one facet a line, colour quantised to its rrrgggbb byte.',
  scope: 'Live: what a receiver tuned here hears, drawn by the beam as the speakers play it.',
  walk: 'Live: a phone that is not there, walking a loop at 1.4 m/s (shown 20× faster), reported as a GPS would: NMEA, checksum and all.',
}

const root = el('div', { id: 'band', hidden: '' })
const readout = el('p', { class: 'when', 'aria-hidden': 'true' })
const hint = el(
  'p',
  { class: 'hint', 'aria-hidden': 'true' },
  el('span', { class: 'wide' }, 'drag or scroll to tune · ←/→ seek · 0–9 markers · ↵ demodulate · q QSL'),
  el('span', { class: 'narrow' }, 'drag to tune · tap a marker'),
)
export const articles = PROJECTS.map(article)
root.append(el('main', {}, ...ORDER.map((k) => articles[k])), readout, hint)
document.body.append(root)

function article(p: Project, k: number) {
  const a = el('article', { id: p.slug, class: 'quiet', 'data-k': String(k) })
  const key = keyOf(k)
  a.append(
    el(
      'header',
      {},
      el('p', { class: 'mk' }, key ? `M${key}` : 'M', ' ', el('span', {}, hz(p.freq, 6)), ' · ', p.years),
      el('h2', {}, el('a', { href: `/${p.slug}` }, p.title)),
      el('p', { class: 'rem' }, p.remarkable),
    ),
  )
  const page = el('div', { class: 'page' })
  if (p.slug === 'qsl') page.append(qsl(p))
  else {
    const text = el('div', { class: 'text' }, el('p', { class: 'sig' }, p.signature))
    if (p.numbers.length) text.append(el('dl', {}, ...p.numbers.flatMap(([d, v]) => [el('dt', {}, d), el('dd', {}, v)])))
    text.append(...p.body.map((b) => el('p', {}, b)))
    text.append(el('ul', { class: 'links' }, ...p.links.map(([t, u]) => el('li', {}, el('a', { href: u, rel: 'noopener', target: '_blank' }, t)))))
    const media = el('div', { class: 'media' })
    if (p.demo) media.append(el('figure', { class: 'demo' }, el('div', { class: 'screen', 'aria-hidden': 'true' }), el('figcaption', {}, DEMO[p.demo])))
    for (const m of p.media)
      media.append(
        el(
          'figure',
          { class: 'wipe' },
          m.video ? el('video', { 'data-src': m.src, muted: '', loop: '', playsinline: '', controls: '', preload: 'none', 'aria-label': m.alt }) : el('img', { 'data-src': m.src, alt: m.alt, decoding: 'async' }),
          el('figcaption', {}, m.alt),
        ),
      )
    page.append(text, media)
  }
  a.append(page)
  return a
}

function qsl(p: Project) {
  const d = el('dl', {}, ...(
    [
      ['to radio', 'you'],
      ['date', new Date().toISOString().slice(0, 10)],
      ['UTC', new Date().toISOString().slice(11, 16)],
      ['MHz', '146.520'],
      ['mode', 'FM, and a simulated CRT beam'],
      ['RST', '59'],
      ['op', 'River Dowdy'],
    ] as [string, string][]
  ).flatMap(([a, b]) => [el('dt', {}, a), el('dd', {}, b)]))
  return el(
    'div',
    { class: 'card' },
    el('div', { class: 'screen', 'aria-hidden': 'true' }),
    el('p', {}, 'Confirming our contact. River builds radios out of chips that were never meant to be radios, and other things that are mostly light and timing.'),
    d,
    el('ul', { class: 'links' }, ...p.links.map(([t, u]) => el('li', {}, el('a', { href: u, rel: 'noopener', target: '_blank' }, t)))),
    el('p', { class: 'tnx' }, 'PSE QSL TNX · 73'),
  )
}

// ---- state → DOM ------------------------------------------------------------------------------------
let litK = -2, openK = -1
export function show(lit: number, open: number) {
  if (lit === litK && open === openK) return
  hint.classList.toggle('on', lit < 0 && open < 0)
  for (const k of [litK, openK, lit, open]) if (k >= 0) articles[k].className = k === open ? 'open' : k === lit && open < 0 ? 'lit' : 'quiet'
  if (open !== openK && open >= 0) wake(articles[open])
  if (openK >= 0 && open !== openK) for (const v of articles[openK].querySelectorAll('video')) v.pause()
  litK = lit, openK = open
  document.title = open >= 0 ? `${PROJECTS[open].title} · River Dowdy` : 'River Dowdy · KJ5SCH'
}

// First open: fetch the media, and run each figure's raster wipe as it comes into view.
const seen = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && e.target.classList.add('drawn')), { threshold: 0.15 })
function wake(a: HTMLElement) {
  for (const m of a.querySelectorAll<HTMLImageElement | HTMLVideoElement>('[data-src]')) {
    m.src = m.dataset.src!
    m.removeAttribute('data-src')
  }
  for (const f of a.querySelectorAll('figure.wipe')) f.classList.remove('drawn'), seen.observe(f)
  a.querySelector('.page')?.scrollTo(0, 0)
}

// Where the open page wants its live demo, in CSS pixels; null when it is off its scroller.
export function screen(k: number) {
  const s = articles[k]?.querySelector<HTMLElement>('.screen')
  if (!s) return null
  const r = s.getBoundingClientRect(), pg = s.closest('.page')!.getBoundingClientRect() // the page's box is its scroller's visible box
  // drawn only while it is mostly inside its scroller: the beam has no clip, and must not write over the header
  return r.height > 0 && r.top > pg.top - 0.15 * r.height && r.top < pg.bottom - 0.3 * r.height ? r : null
}

export function when(text: string, x = 0, y = 0) {
  readout.textContent = text
  readout.style.transform = `translate(${x}px, ${y}px)`
  readout.classList.toggle('on', !!text)
}

export function activate(on: boolean) {
  root.hidden = !on
}

// ---- routes: /, /<slug>, /qsl --------------------------------------------------------------------------
export const slugAt = (path = location.pathname) => PROJECTS.findIndex((p) => `/${p.slug}` === path.replace(/\/$/, ''))
export function route(k: number) {
  const path = k >= 0 ? `/${PROJECTS[k].slug}` : '/'
  if (location.pathname !== path) history.pushState(null, '', path + location.search)
}

export const weekDate = (w: number) => new Date(WEEK0 + w * 6048e5).toISOString().slice(0, 10)
export { root }

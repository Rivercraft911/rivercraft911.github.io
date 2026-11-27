// The world's words: real DOM over River's planet, for whoever came to read. A place's page (each of its projects:
// what it is, the proof, how it works, links, pictures) comes in as the camera arrives, at the right, or over the
// bottom on a phone. The index of places, each with its one best proof, what River is doing now first, stays in the
// corner, so the 30-second version is always one glance away; with a page open it folds to a dial of numbers, the
// place tuned to lit, and every page's bar steps to the places either side (or ← and →, or a number key).
// /<slug> under the base lands on the place that holds it.
// A project's page opens with what shows it working, large (a click lends it to the stage, over the world), then
// River's boards in it, both faces (a click turns one over), each with its schematic. At a place, its parts are named
// beside themselves once they hold still, and a part clicked has its card at the head of the page.
import './pages.css'
import { PLACES } from './places'
import { BEST, BOARDS, CONTACT, NOW, ORDER, WORKS, board, type Work } from './content'
import type { Media } from '../band/projects'
import { ctx, look, parts, seen as spot } from './ctx'
import { view } from '../acts/scene'

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
const named = (k: number) => works(k)[0]?.title ?? PLACES[k].id
const NOWS = new Set(ORDER.filter((e) => e.now).map((e) => e.slug))
const entries = PLACES.map((P, k) =>
  el('a', { href: BASE + P.slugs[0], 'data-k': String(k), style: `--c: ${ink(k)}`, ...(P.slugs.some((s) => NOWS.has(s)) ? { 'data-now': '' } : {}) },
    el('span', { class: 'n', 'aria-hidden': 'true' }, String(k + 1)),
    el('b', {}, named(k)),
    el('span', {}, tie(BEST[P.id] ?? works(k)[0]?.remarkable ?? '')),
  ),
)
const index = el(
  'nav',
  { class: 'index', 'aria-label': 'River Dowdy’s work' },
  el('header', {}, el('h1', {}, CONTACT.name), el('p', {}, CONTACT.what), el('p', { class: 'now' }, tie(NOW)), reach),
  el('ol', {}, ...entries.map((a, i) => el('li', { style: `--i: ${i + 1}` }, a))),
)

// ---- a page: the place's projects, one after another ---------------------------------------------------------------
// A picture or a video; a proof's is large, plays without controls, and a click lends it to the stage.
const MEDIA = `${BASE}media/`
const sized = (w: number, h: number) => ({ width: String(w), height: String(h) }) // (its shape, before it loads)
const figure = (m: Media, proof = false) => {
  const at = { ...(m.size ? sized(...m.size) : {}), ...(proof ? { tabindex: '0', role: 'button', 'aria-label': `${m.alt} (larger)` } : {}) }
  return el(
    'figure',
    proof ? { style: `flex: ${m.size ? m.size[0] / m.size[1] : 1.5}` } : {},
    m.video
      ? el('video', { 'data-src': m.src, ...(m.poster ? { 'data-poster': m.poster } : {}), muted: '', loop: '', playsinline: '', preload: 'none', ...(proof ? {} : { controls: '' }), 'aria-label': m.alt, ...at })
      : el('img', { 'data-src': m.src, alt: m.alt, decoding: 'async', ...at }),
    el('figcaption', { 'aria-hidden': 'true' }, m.alt),
  )
}
// One of River's boards, either face up: a click turns it over, side to side, as a hand would.
const face = (id: string) => {
  const b = BOARDS[id], wh = sized(b.mm[0] * 10, b.mm[1] * 10)
  return el(
    'figure',
    { class: 'board' },
    el('button', { type: 'button', 'aria-pressed': 'false', 'aria-label': `${b.name}: turn it over` },
      el('img', { 'data-src': `${MEDIA}boards/${id}.webp`, alt: `${b.name}, top`, decoding: 'async', ...wh }),
      el('img', { 'data-src': `${MEDIA}boards/${id}-back.webp`, alt: `${b.name}, underside`, decoding: 'async', ...wh })),
    el('figcaption', {}, el('b', {}, b.name), tie(` ${b.mm[0]} × ${b.mm[1]} mm · ${b.layers} layers`), el('span', { class: 'faces' }, el('i', {}, 'top'), ' / ', el('i', {}, 'underside')),
      el('a', out(`${MEDIA}schematics/${id}.pdf`), 'schematic ↗')),
  )
}
function article(w: Work) {
  const a = el('article', { id: `w-${w.slug}` })
  if (w.proof?.length) a.append(el('div', { class: 'proof' }, ...w.proof.map((m) => figure(m, true))))
  a.append(el('h2', { tabindex: '-1' }, w.title), el('p', { class: 'yr' }, w.years), el('p', { class: 'rem' }, tie(w.remarkable)))
  if (w.boards?.length) a.append(...w.boards.map(face))
  if (w.numbers.length) a.append(el('dl', {}, ...w.numbers.flatMap(([d, v]) => [el('dt', {}, d), el('dd', {}, tie(v))])))
  a.append(...w.body.map((b) => el('p', {}, tie(b))))
  if (w.links.length) a.append(el('ul', { class: 'links' }, ...w.links.map(([t, u]) => el('li', {}, el('a', out(u), t)))))
  a.append(...w.media.map((m) => figure(m)))
  return a
}
const sheets = PLACES.map((_, k) => {
  const n = (k + 1) % PLACES.length
  return el('div', { hidden: '' }, ...works(k).map(article), el('p', { class: 'next' }, el('a', { href: BASE + PLACES[n].slugs[0], 'data-k': String(n) }, `next · ${named(n)} →`)))
})
const where = el('span', { class: 'where', 'aria-hidden': 'true' })
const step = (key: string) => el('a', { class: 'step', href: BASE, 'data-k': '0', 'aria-keyshortcuts': key }, '')
const prev = step('ArrowLeft'), next = step('ArrowRight')
const close = el('button', { type: 'button', title: 'Esc', 'aria-keyshortcuts': 'Escape' }, 'all work')
const card = el('section', { class: 'card', hidden: '', 'aria-live': 'polite' }) // a part clicked (below)
const scroll = el('div', { class: 'scroll' }, card, ...sheets)
const leaf = el('section', { class: 'page' }, el('p', { class: 'bar' }, prev, where, next, close), scroll)
const stage = el('div', { class: 'stage', hidden: '' })
const shelf = el('div', { class: 'tags' }) // the parts' names
const root = el('div', { id: 'w', hidden: '' }, index, leaf, shelf, stage)

// Pictures load as they near the reader, and arrive the way R-01 paints: odd lines down, then the even ones.
const still = matchMedia('(prefers-reduced-motion: reduce)')
const load = (f: Element) => {
  for (const m of f.querySelectorAll<HTMLImageElement | HTMLVideoElement>('[data-src]')) {
    if (m.src) continue
    if (m instanceof HTMLVideoElement) (m.muted = true), (m.preload = 'auto'), m.dataset.poster && (m.poster = m.dataset.poster) // (the attribute alone does not mute it)
    m.src = m.dataset.src!
  }
}
const near = new IntersectionObserver((es) => es.forEach((e) => e.isIntersecting && (load(e.target), near.unobserve(e.target))), { root: scroll, rootMargin: '0px 0px 100% 0px' })
const inview = new WeakSet<Element>()
const seen = new IntersectionObserver(
  (es) => {
    es.forEach((e) => {
      const f = e.target, m = f.querySelector('img')
      e.isIntersecting ? inview.add(f) : inview.delete(f)
      if (e.isIntersecting && m && !m.complete) m.addEventListener('load', () => f.classList.add('drawn'), { once: true })
      else if (e.isIntersecting) f.classList.add('drawn')
    })
    play()
  },
  { root: scroll, threshold: 0.2 },
)
// (once painted in, a figure drops the mask that painted it: one left on a playing video costs every frame)
const done = (e: AnimationEvent) => e.animationName === 'w-even' && (e.currentTarget as Element).classList.add('done')
const observe = (e: Element) => { for (const f of e.querySelectorAll('figure')) near.observe(f), seen.observe(f), f.addEventListener('animationend', done) }
observe(scroll)
// A video plays while its page is open and it is in view, or while it is on the stage; only there, and with reduced
// motion only on the stage, where the reader put it.
function play() {
  const open = root.classList.contains('open') && !root.hidden
  for (const v of root.querySelectorAll('video')) {
    const on = open && (v === lent || (!still.matches && shown >= 0 && sheets[shown].contains(v) && inview.has(v.parentElement!)))
    if (on) load(v.parentElement!), v.play().catch(() => {})
    else v.pause()
  }
}

// ---- the stage: a proof lent out large over the world, until a click or Escape puts it back ------------------
let lent: HTMLElement | null = null
const gap = el('div')
function lend(m: HTMLElement | null) {
  if (lent) gap.replaceWith(lent), (lent = null)
  stage.hidden = !m
  if (m) (gap.style.height = `${m.offsetHeight}px`), m.replaceWith(gap), stage.append(m), (lent = m)
  play()
}
stage.addEventListener('click', (e) => (e.stopPropagation(), lend(null))) // (the picture is home before the click reaches the page)
addEventListener('keydown', (e) => e.key === 'Escape' && lent && (lend(null), e.stopImmediatePropagation()), true) // (before the world's Escape)

// ---- showing: a page once the camera has flown there ------------------------------------------------------------
let shown = -1, timer = 0, landing = deep() >= 0
let fly: (k: number) => void = () => {}, live = () => false

// Place k's page, after `after` seconds of flight; k < 0 puts it away.
export function page(k: number, after = 0) {
  clearTimeout(timer)
  lend(null), carry('')
  const mine = root.contains(document.activeElement) // the reader is in the words: keep them there
  entries.forEach((a, j) => (j === k ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')))
  root.classList.remove('open'), play()
  if (shown >= 0 && k !== shown && mine) entries[shown].focus({ preventScroll: true })
  leaf.inert = true
  if (k < 0) return (shown = -1), (document.title = TITLE), measure()
  if (landing) (after = 0.5), (landing = false) // a deep link came for the words: they need not wait for the flight
  timer = setTimeout(() => {
    sheets.forEach((s, j) => (s.hidden = j !== k))
    shown = k
    const P = PLACES[k], ws = works(k)
    leaf.style.setProperty('--c', ink(k))
    leaf.setAttribute('aria-label', ws.map((w) => w.title).join(', '))
    where.textContent = `${String(k + 1).padStart(2, '0')} / ${String(PLACES.length).padStart(2, '0')} · ${P.orbit ? '550 km up' : `${deg(P.lat, 'N', 'S')} ${deg(P.lon, 'E', 'W')}`}`
    // the places either side, a step away
    for (const [a, j] of [[prev, (k + PLACES.length - 1) % PLACES.length], [next, (k + 1) % PLACES.length]] as const) {
      a.dataset.k = String(j), a.href = BASE + PLACES[j].slugs[0], a.style.setProperty('--c', ink(j))
      a.textContent = a === prev ? `‹ ${named(j)}` : `${named(j)} ›`
      a.setAttribute('aria-label', `${a === prev ? 'previous' : 'next'}: ${named(j)}`)
    }
    document.title = `${ws.map((w) => w.title).join(' · ')} · ${CONTACT.name}`
    root.classList.add('open')
    leaf.inert = false
    const at = document.getElementById(`w-${location.pathname.split('/').filter(Boolean).pop()}`) // /driftwood: its own article
    scroll.scrollTop = at && sheets[k].contains(at) && at !== sheets[k].firstElementChild ? at.offsetTop - 24 : 0
    if (mine) sheets[k].querySelector('h2')!.focus({ preventScroll: true })
    play(), measure()
  }, after * 1000)
}

// How much of the screen the words cover, across from the right and up from the bottom, so the camera can frame its
// subject in what is left: [right, bottom], fractions of the width and height (right < 0: the index on the left, at
// home). Measured when it changes.
const cover = [0, 0]
export const covered = () => cover
const phone = matchMedia('(max-aspect-ratio: 17 / 20)')
function measure() {
  const open = root.classList.contains('open') && !root.hidden
  cover[0] = phone.matches ? 0 : open ? leaf.offsetWidth / innerWidth : -0.22 * Math.min(1, index.offsetWidth / innerWidth / 0.3) // (home: the planet stands right of the index)
  cover[1] = root.hidden || !phone.matches ? 0 : (open ? leaf.offsetHeight : index.offsetHeight) / innerHeight
}
new ResizeObserver(measure).observe(root)

// Called once by the planet: `go` flies the camera to place k (k < 0: home), `on` says whether the world is being
// drawn, so its words show only while it is (or while the arrival is laying the index). A deep link sets off for its
// place at once.
export function mount(go: (k: number) => void, on: () => boolean) {
  fly = go, live = on
  document.body.append(root)
  requestAnimationFrame(function watch() {
    const laying = !live() && performance.now() - laid < 200, shows = live() || laying
    if (root.hidden === shows) (root.hidden = !shows), play(), measure()
    if (root.classList.contains('arriving') !== laying) {
      root.classList.toggle('arriving', laying)
      if (!laying) for (const b of flyers) b.style.visibility = 'hidden'
    }
    requestAnimationFrame(watch)
  })
  if (deep() >= 0) go(deep())
}

// ---- the arrival's names ---------------------------------------------------------------------------------------
// As the arrival flies past each place it puts the place's name up, large, in the index's own letters, then lays it down
// into that place's line of the index, where it stays: by the time the world takes over, the index has been made of
// the names we passed, and only its heading is left to open. `since[k]`: seconds since place k was passed (negative,
// not yet). The arrival calls this every frame; while it does, the index shows only the lines laid so far.
const flyers = PLACES.map((_, k) => el('b', { class: 'pass', 'aria-hidden': 'true', style: `--c: ${ink(k)}` }, named(k)))
root.append(...flyers)
let laid = 0
const UP = 0.12, SHOWN = 0.42, GO = 0.8, DOWN = 1.45 // (s after passing: its name starts up, is up, sets off, is laid)
const ease = (a: number, b: number, x: number) => {
  const k = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return k * k * k * (k * (6 * k - 15) + 10)
}
export function passed(since: ArrayLike<number>) {
  laid = performance.now()
  if (root.hidden) return // (the watch shows the words on its next frame)
  let n = 0
  entries.forEach((a, k) => {
    const s = since[k], b = flyers[k], row = a.parentElement!, down = s >= (still.matches ? UP : DOWN)
    row.classList.toggle('landed', down)
    n += +down
    if (still.matches || !(s >= UP) || down) return void (b.style.visibility = 'hidden')
    // its line's own name: where it lies, how big, what colour
    const name = a.querySelector('b')!, r = name.getBoundingClientRect(), cs = getComputedStyle(name), f0 = parseFloat(cs.fontSize)
    const f1 = Math.min(76, Math.max(38, innerWidth * 0.05)), go = ease(GO, DOWN, s), f = Math.exp(Math.log(f1) + (Math.log(f0) - Math.log(f1)) * go)
    const y1 = innerHeight * 0.6
    b.style.visibility = 'visible'
    b.style.fontSize = `${f}px`
    b.style.transform = `translate(${r.left}px, ${y1 + (r.top - y1) * go}px)`
    b.style.color = `color-mix(in srgb, ${cs.color} ${100 * go}%, #fff)`
    b.style.clipPath = `inset(-1em ${100 * (1 - ease(UP, SHOWN, s))}% -1em -1em)` // it comes up as a readout does, left to right
  })
  root.style.setProperty('--land', String(n / entries.length))
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
  const t = e.target as Element, b = t.closest('.board'), m = t.closest('.proof figure > :first-child')
  if (b && !t.closest('a')) return b.querySelector('button')!.setAttribute('aria-pressed', String(b.classList.toggle('over')))
  if (m) return lend(m as HTMLElement)
  const a = t.closest<HTMLElement>('a[data-k]')
  if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button) return
  e.preventDefault()
  fly(+a.dataset.k!)
})
close.addEventListener('click', () => fly(-1))
root.addEventListener('keydown', (e) => {
  const m = (e.target as Element).closest('.proof figure > :first-child')
  if (m && (e.key === 'Enter' || e.key === ' ')) e.preventDefault(), lend(m as HTMLElement)
})
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

// ---- a part clicked: its card, at the head of the page ---------------------------------------------------------
// What the place says the part is (places.ts `about`), and if it is one of River's boards, both its faces and its
// schematic. It follows ctx.picked, however that changed; clicking the part again, or the card's ×, puts it back.
const pick = (id: string) => ((ctx.picked = ctx.picked === id ? '' : id), dispatchEvent(new CustomEvent('part', { detail: ctx.picked })))
let carded = ''
function carry(id: string) {
  const a = id && shown >= 0 ? PLACES[shown].about?.[id] : undefined, b = board(a?.board)
  carded = id, (card.hidden = !a)
  if (!a) return
  const x = el('button', { type: 'button', class: 'x', 'aria-label': 'put it back' }, '×')
  x.addEventListener('click', () => pick(id))
  card.replaceChildren(x, el('p', { class: 'yr' }, 'part'), el('h3', {}, a.name), el('p', { class: 'rem' }, tie(a.does)), ...(b ? [face(b)] : []))
  observe(card)
  scroll.scrollTo({ top: 0, behavior: still.matches ? 'auto' : 'smooth' })
}

// ---- the parts, named where they stand ------------------------------------------------------------------------
// At a place, each part it says what it is (`about`) is named beside itself once it holds still on the screen, the
// camera at rest and nothing picked: a word on a hairline, never under the words or over another name, fading in and
// out. A name can be clicked as its part can. The planet calls this every frame, after it has placed everything.
type Tag = { e: HTMLElement; x: number; y: number; still: number; at: number; w: number }
const tags: Record<string, Tag>[] = PLACES.map(() => ({})), all: Tag[] = [], taken: number[] = []
let tick = 0
export function label() {
  const k = ctx.focus, about = k >= 0 && !root.hidden && !lent && ctx.since >= 0 ? PLACES[k].about : undefined, dt = Math.max(ctx.dt, 1e-3)
  const right = innerWidth * (1 - Math.max(cover[0], 0)) - 16, bottom = innerHeight * (1 - cover[1]) - 16
  tick++, (taken.length = 0)
  if (ctx.picked !== carded && root.classList.contains('open')) carry(ctx.picked)
  for (let i = 0; about && i < parts.n; i++) {
    const q = parts.list[i], a = about[q.id]
    if (!a || !look(q.c)) continue
    let t = tags[k][q.id]
    if (!t) {
      const e = el('button', { type: 'button', class: 'tag', tabindex: '-1', 'data-part': q.id, style: `--c: ${ink(k)}` }, a.name)
      shelf.append(e), all.push((t = tags[k][q.id] = { e, x: 0, y: 0, still: 0, at: 0, w: 20 + 7.3 * a.name.length }))
    }
    const D = Math.hypot(q.c[0] - ctx.E[0], q.c[1] - ctx.E[1], q.c[2] - ctx.E[2]), r = ((q.r / D) * ctx.p[3] * innerHeight) / 2
    const x = ((spot.x / view.a + 1) * innerWidth) / 2 + 0.7 * r, y = ((1 - spot.y) * innerHeight) / 2
    t.still = Math.hypot(x - t.x, y - t.y) < 30 * dt ? t.still + dt : 0 // (under 30 px/s)
    t.x = x, t.y = y, t.at = tick
    let on = t.still > 0.6 && !ctx.picked && x > 8 && x + t.w < right && y > 16 && y < bottom
    for (let j = 0; on && j < taken.length; j += 3) on = Math.abs(y - taken[j + 1]) > 18 || x > taken[j] + taken[j + 2] || taken[j] > x + t.w
    if (on) taken.push(x, y, t.w)
    t.e.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`
    t.e.classList.toggle('on', on)
  }
  for (const t of all) if (t.at !== tick) t.e.classList.remove('on')
}
shelf.addEventListener('click', (e) => {
  const id = (e.target as HTMLElement).closest<HTMLElement>('.tag')?.dataset.part
  if (id) pick(id)
})

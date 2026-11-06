// A constant-Q spectrum analyzer over a log frequency axis. Every bin's resolution bandwidth is a fixed
// fraction of its frequency, so pink noise lies flat across 23 decades and a carrier is a peak a few bins
// wide at any span. Each project's parts are passed through that Gaussian RBW in closed form: a narrow
// signal reads its whole power, a wide one reads its density times the RBW, the way a real analyzer
// does, so a DVB-S2 carrier is a spike from far away and its flat-topped hump close up.
import { PROJECTS, type Part } from './projects'

export const MAX = 1024
export const K = PROJECTS.length
export const SPAN_ALL = 23.2 // decades, 10 nHz … 1.6 PHz
export const MID = 3.6 // log10 Hz at the middle of everything
const ENBW = Math.sqrt(2 * Math.PI) // a Gaussian RBW of σ = r passes noise as if it were r√2π wide
const FLOOR = 1e-6 // pink noise per bin at the full span: −60 dB
const LOOKS = 6 // video averaging: each bin's noise is a χ² of this many looks

export const an = {
  n: 0,
  c: 0, // centre, log10 Hz
  s: SPAN_ALL, // span, decades
  q: 0, // RBW σ as a fraction of frequency
  floor: -60, // dB, the noise floor's mean
  db: new Float32Array(MAX), // what the trace shows
  each: new Float32Array(K * MAX), // each project's own power per bin, before noise
  peak: new Float32Array(K), // each project's highest bin in view, dB
}

export const logfAt = (i: number) => an.c + an.s * (i / (an.n - 1) - 0.5)
export const binOf = (logf: number) => ((logf - an.c) / an.s + 0.5) * (an.n - 1)

// Deterministic uniform (0, 1] per integer, and the mean of LOOKS unit exponentials.
const u01 = (n: number) => {
  const s = Math.sin(n * 12.9898 + 78.233) * 43758.5453
  return 1 - (s - Math.floor(s))
}
const chi = (seed: number) => {
  let e = 0
  for (let j = 0; j < LOOKS; j++) e -= Math.log(u01(seed * 7 + j))
  return e / LOOKS
}

// A raised-cosine spectrum of width w (between its −6 dB points) and roll-off a, at offset d.
function rcos(d: number, w: number, a: number) {
  const x = Math.abs(d) / w, lo = (1 - a) / 2, hi = (1 + a) / 2
  return x <= lo ? 1 : x >= hi ? 0 : 0.5 * (1 + Math.cos((Math.PI * (x - lo)) / a))
}

// A hump of true width b and roll-off a seen through an RBW of σ = r: density times ENBW when the RBW is
// narrow, the whole power when it is wide, and in between a hump widened by the filter.
function hump(d: number, b: number, a: number, r: number) {
  const g = 1 / Math.sqrt(1 + (b / (r * ENBW)) ** 2), w = Math.hypot(b, 2.5 * r)
  return g * rcos(d, w, a + (1 - a) * (1 - b / w))
}

// The parts with their powers made linear and their extents found, so a bin skips what is far away.
type Lin = { p: Part; P: number; Pl: Float64Array; lo: number; hi: number }
const SIG: Lin[][] = PROJECTS.map((x) =>
  x.sig.map((p) => {
    if (p.k === 'lines') return { p, P: 0, Pl: Float64Array.from(p.p, (d) => 10 ** (d / 10)), lo: p.f[0], hi: p.f[p.f.length - 1] }
    const w = p.k === 'rrc' ? p.rs : p.k === 'sinc' ? 30 * p.rc : Infinity
    return { p, P: 10 ** (p.p / 10), Pl: new Float64Array(0), lo: p.k === 'band' ? 0 : p.f - w, hi: p.k === 'band' ? Infinity : p.f + w }
  }),
)

function part({ p, P, Pl, lo: a, hi: b }: Lin, f: number, r: number): number {
  if (f + 5 * r < a || f - 5 * r > b) return 0
  switch (p.k) {
    case 'lines': {
      const F = p.f
      let lo = 0, hi = F.length // the first line above f − 5r
      while (lo < hi) {
        const m = (lo + hi) >> 1
        F[m] < f - 5 * r ? (lo = m + 1) : (hi = m)
      }
      let s = 0
      for (let j = lo; j < F.length && F[j] <= f + 5 * r; j++) s += Pl[j] * Math.exp(-0.5 * ((f - F[j]) / r) ** 2)
      return s
    }
    case 'rrc':
      return P * hump(f - p.f, p.rs, p.a, r)
    case 'sinc': {
      // BPSK at chip rate rc: sinc²(d/rc), whose sidelobes a wider RBW averages to half their envelope.
      const x = (f - p.f) / p.rc, s2 = x === 0 ? 1 : (Math.sin(Math.PI * x) / (Math.PI * x)) ** 2
      const lobe = Math.abs(x) < 1 ? s2 : s2 + (0.5 / (Math.PI * x) ** 2 - s2) * Math.min(1, (2 * r) / p.rc)
      const k = Math.min(1, Math.max(0, (r / p.rc - 0.15) / 0.35))
      return P * ((1 - k) * lobe * Math.min(1, (r * ENBW) / p.rc) + k * hump(f - p.f, p.rc, 1, r))
    }
    case 'band': {
      // A voice's long-term spectrum: rising past lo, falling 6 dB an octave past 600 Hz, walled at hi.
      const hp = (f / p.lo) ** 4 / (1 + (f / p.lo) ** 4), tilt = 1 / Math.sqrt(1 + (f / 600) ** 2), wall = 1 / (1 + (f / p.hi) ** 80)
      return P * hp * tilt * wall * Math.min(1, (r * ENBW) / 1500)
    }
  }
}

// The cosmic microwave background, a landmark under everything: 2.725 K of blackbody, ν·B_ν per bin,
// peaking 16 dB over the floor near 220 GHz.
export const CMB_PEAK = 2.2e11
const cmb = (f: number) => {
  const x = f / 5.678e10
  return x > 40 ? 0 : (x ** 4 / Math.expm1(x) / 4.78) * 40
}

// One sweep: n bins centred on c over s decades. seed changes the noise each sweep.
export function sweep(c: number, s: number, n: number, seed: number) {
  an.n = n, an.c = c, an.s = s
  an.q = (Math.LN10 * s * 1.2) / (n - 1)
  const pink = FLOOR * (s / SPAN_ALL)
  an.floor = 10 * Math.log10(pink)
  an.peak.fill(-300)
  for (let i = 0; i < n; i++) {
    const f = 10 ** logfAt(i), r = f * an.q
    let wide = pink * (1 + cmb(f)), sharp = 0
    for (let k = 0; k < K; k++) {
      let e = 0
      for (const p of SIG[k]) {
        const v = part(p, f, r)
        e += v
        if (p.p.k === 'lines') sharp += v
        else wide += v
      }
      an.each[k * MAX + i] = e
      const db = 10 * Math.log10(e + 1e-30)
      if (db > an.peak[k]) an.peak[k] = db
    }
    // Noise and modulated carriers are random processes: the analyzer sees them flicker. Carriers hold.
    an.db[i] = 10 * Math.log10(wide * chi(seed * MAX + i) + sharp)
  }
}

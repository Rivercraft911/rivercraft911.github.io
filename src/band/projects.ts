// River's work, each at a real frequency with the shape its real signal makes on an analyzer.
// Content comes from the public READMEs; anything marked TODO is River's to fill or confirm.
// Spectral parts: a line is a carrier, rrc a DVB-S2 raised-cosine hump Rs(1 + α) wide, sinc a keyed or
// chipped carrier's sinc² lobe, band a voice band. p is power in dB below the strongest station.

export type Part =
  | { k: 'lines'; f: number[]; p: number[] }
  | { k: 'rrc'; f: number; rs: number; a: number; p: number }
  | { k: 'sinc'; f: number; rc: number; p: number }
  | { k: 'band'; lo: number; hi: number; p: number }

export type Media = { src: string; alt: string; video?: boolean; poster?: string; size?: [w: number, h: number] }

export type Project = {
  slug: string
  title: string
  remarkable: string // one line, ≤ 90 characters, with a number in it
  freq: number // Hz: where the marker sits and the dial lands
  span: number // decades shown once demodulated
  signature: string // why this frequency and this shape
  sig: Part[]
  years: string
  numbers: [string, string][]
  body: string[]
  media: Media[]
  proof?: Media[] // what shows it working, first on its page and large
  boards?: string[] // River's boards in it (world/content.ts BOARDS): both faces, and the schematic
  links: [string, string][]
  demo?: 'esp' | 'yapogee' | 'ulam' | 'raster' | 'scope' | 'walk'
  log: [number, number][] // [week since 2024-10-28, commits]: the waterfall
  todo?: string[]
}

const GH = 'https://github.com/Rivercraft911/'
const RAW = 'https://raw.githubusercontent.com/Rivercraft911/'
const MEDIA = `${import.meta.env.BASE_URL}media/`
// River's live-video bench, as recorded: esp-dvbs2 carrying Pigeon Vision's two cameras
export const LIVE: Media = { src: `${MEDIA}esp-dvbs2/live.mp4`, poster: `${MEDIA}esp-dvbs2/live.jpg`, video: true, size: [1280, 720],
  alt: 'Live video over esp-dvbs2, as recorded: two 360° cameras on a CM5, one ESP32-S3 sending at 2420 MHz down coax to another, stitched to a sphere' }
const ORBIT = 1 / (92.9 * 60) // a ~93-minute low Earth orbit. TODO River: SAMWISE's real period
const primes = (n: number) => {
  const s = new Uint8Array(n), out: number[] = []
  for (let i = 2; i < n; i++) {
    if (s[i]) continue
    out.push(i)
    for (let j = i * i; j < n; j += i) s[j] = 1
  }
  return out
}
const C = 299_792_458

export const WEEK0 = Date.UTC(2024, 9, 28)

export const PROJECTS: Project[] = [
  {
    slug: 'yapling-observatory',
    title: 'Yapling Observatory',
    remarkable: 'A CubeSat mission in five coupled models: orbit, radio, pointing, power, heat; 495 tests',
    freq: 1 / (365.2422 * 86400),
    span: 0.6,
    signature: 'Its J2 model turns a sun-synchronous orbit plane once a year: 31.7 nHz.',
    sig: [{ k: 'lines', f: [1 / (365.2422 * 86400)], p: [-14] }],
    years: '2026',
    numbers: [
      ['orbit', 'RK4 and velocity Verlet under J2 (EGM2008’s C₂₀), sun-synchronous planes, ground tracks'],
      ['field', 'IGRF-14 to degree 13, for magnetorquers and B-dot'],
      ['radio', 'DVB-S2 QPSK and 8PSK frames by ETSI EN 302 307-1, a 433 MHz LoRa beacon, antenna patterns'],
      ['pointing', 'reaction wheels and magnetorquers, momentum unloading'],
      ['power and heat', 'a measured NCR18650GA cell model; bus, battery and panels trading heat'],
      ['checks', '495 Python tests; every model names its source and what it leaves out'],
    ],
    body: [
      'A CubeSat mission simulator for radio links, pointing, power and heat, over one pass or a whole mission, with the radio I’m designing for BLEPS inside it: DVB-S2 down and a 433 MHz LoRa beacon.',
      'Orbits integrate under J2 and draw their ground tracks; links are budgeted through antenna patterns and real MODCODs; wheels and magnetorquers point the bus and dump momentum; the panels charge the battery while everything trades heat. Every model names its source and what it leaves out.',
    ],
    media: [{ src: `${RAW}yapling-observatory/main/docs/random-screenshot.png`, alt: 'Yapling Observatory running a simulated mission in the browser' }],
    links: [['source', `${GH}yapling-observatory`]],
    log: [[103, 45], [104, 103]],
    todo: ['Is Yapling Observatory BLEPS’s mission simulator, named for its Yapling radio board? (It models the same 433 MHz MiniF27 module.) If so, it can say so.'],
  },
  {
    slug: 'samwise',
    title: 'SAMWISE',
    remarkable: 'Stanford SSI’s CubeSat: my magnetorquer coil boards, etched through 6 layers, and its radio test bench',
    freq: ORBIT,
    span: 0.5,
    signature: 'A magnetorquer pushes against Earth’s field, which turns past it once an orbit: ≈0.18 mHz.',
    sig: [{ k: 'lines', f: [ORBIT], p: [-8] }],
    years: '2024 – 2026',
    numbers: [
      ['my part', 'the magnetorquer coil boards (XY and Z) and the radio test bench'],
      ['coil panels', '6 layers of 2 oz copper; two panels a face in parallel, five coils a board in series'],
      ['optimizer', 'the trace width for the most magnetic moment under a power limit'],
      ['radio test bench', 'a Pico carrying S-band LoRa1280F27 (SX1280) and UHF RFM98PW LoRa'],
      ['range test', 'transmitter, receiver, observer, S-band image transfer'],
    ],
    body: [
      'Stanford SSI’s CubeSat turns itself without fuel: current through coils etched into six-layer boards pushes against Earth’s magnetic field. Those magnetorquer coil boards are mine, two to a face and five coils a board. For coils like these I wrote a tool that finds the trace width giving the most magnetic moment for the copper, layers, supply and power limit.',
      'Its radios were brought up on my radio test bench, a Raspberry Pi Pico carrying the S-band and UHF LoRa modules, with my range-test firmware sending images over S-band.',
    ],
    media: [
      { src: `${RAW}magtorque-optimization/main/images/screenshot1.png`, alt: 'The magnetorquer optimizer: magnetic moment against trace width' },
      { src: `${RAW}magtorque-optimization/main/images/screenshot2.png`, alt: 'The magnetorquer optimizer’s parameter sweep' },
    ],
    boards: ['coil', 'coil-xy', 'picohat'],
    links: [
      ['magtorque-optimization', `${GH}magtorque-optimization`],
      ['coil panels', 'https://github.com/stanford-ssi/samwise-avionics'],
      ['radio test bench', `${GH}SoftwareDebugPicoHat`],
      ['range-test firmware', `${GH}RangeTestSoftware`],
    ],
    log: [[0, 1], [1, 9], [14, 7], [17, 1], [65, 7], [66, 3], [68, 9], [69, 34]],
    todo: [
      'SAMWISE’s orbit period and launch status',
      'a photo of flight hardware, if public',
    ],
  },
  {
    slug: 'infiniterecon',
    title: 'InfiniteRecon',
    remarkable: 'An ESP32-S3 room bug: 16 kHz PCM over Wi-Fi to a Pi that transcribes and alerts',
    freq: 500,
    span: 2.6,
    signature: 'It hears the speech band; sampling at 16 kHz walls it off at 8 kHz.',
    sig: [{ k: 'band', lo: 120, hi: 8000, p: -6 }],
    years: '2025 – 2026',
    numbers: [
      ['audio', '16-bit PCM at 16 kHz over TCP'],
      ['mic', 'INMP441 I²S MEMS'],
      ['speech to text', 'Vosk, offline'],
      ['alerts', 'keywords to SMS'],
    ],
    body: [
      'A modern take on the old Infinity transmitter. An ESP32-S3 streams a MEMS microphone to a Raspberry Pi, which transcribes it offline, listens for keywords and texts you when they come up.',
      'Version two is a custom board, in KiCad now. For use only where everyone in the room has agreed to it.',
    ],
    media: [],
    links: [['source', `${GH}InfiniteRecon`], ['first version', `${GH}InfiniteRecon_OUTDATED`]],
    demo: 'scope',
    log: [[14, 8], [67, 1], [71, 2], [73, 10], [74, 2]],
    todo: ['a photo of the v2 board'],
  },
  {
    slug: 'peep',
    title: 'PEEP',
    remarkable: 'A TV remote makes it type: the world’s smallest IR-triggered keyboard, 12.06 × 8 mm',
    freq: 38_000,
    span: 0.5,
    signature: 'Its receiver listens for a 38 kHz IR carrier; a keyed 562.5 µs burst spreads it into sinc² sidebands.',
    sig: [{ k: 'lines', f: [38_000], p: [-4] }, { k: 'sinc', f: 38_000, rc: 1 / 562.5e-6, p: -9 }],
    years: '2026',
    numbers: [
      ['board', '12.06 × 8 mm, 4 layers, 0.8 mm'],
      ['MCU', 'STM32F042G6, crystal-less USB'],
      ['receiver', 'VSOP38338, 38 kHz'],
      ['re-arm', '250 ms of IR silence'],
    ],
    body: [
      'A USB keyboard the size of a fingertip that plugs straight into a USB-A port on its own board edge. Any burst of 38 kHz infrared, a TV remote’s from across the room, starts its stored macro; it types it as ordinary keyboard reports, ignores IR while it types, and re-arms after 250 ms of quiet.',
      'A XIAO ESP32-C6 serves as a Wi-Fi to IR remote. For systems you own or may test.',
    ],
    proof: [{ src: `${RAW}PEEP/main/docs/media/peep-on-fingertip.jpg`, alt: 'An assembled PEEP board on a fingertip' }],
    boards: ['peep'],
    media: [
      { src: `${RAW}PEEP/main/docs/media/peep-in-usb-a.jpg`, alt: 'PEEP inside a USB-A port' },
      { src: `${RAW}PEEP/main/docs/media/peep-usb-contacts.jpg`, alt: 'The USB contacts on PEEP’s board edge' },
      { src: `${RAW}PEEP/main/docs/media/pcb-panel.jpg`, alt: 'A panel of PEEP boards' },
    ],
    links: [['source', `${GH}PEEP`]],
    log: [[91, 1], [93, 1], [95, 21], [96, 2], [101, 2], [102, 1]],
    todo: ['the trigger’s real IR protocol (562.5 µs NEC bursts assumed)', 'a demo video'],
  },
  {
    slug: 'autoprime',
    title: 'autoprime',
    remarkable: 'An agent loop hunting primes: the biggest non-Mersenne prime it can find in 60 s',
    freq: 1.1e6,
    span: 2.8,
    signature: 'A line at every prime p < 1000, times 100 kHz: discrete at the bottom, a continuum at the top, as π(x) ~ x / ln x says.',
    sig: [{ k: 'lines', f: primes(1000).map((p) => p * 1e5), p: primes(1000).map(() => -10) }],
    years: '2026',
    numbers: [
      ['tasks', 'largest prime, most primes'],
      ['budget', '60 s a run'],
      ['judge', 'verifies every PRIME it prints'],
    ],
    body: [
      'A riff on Karpathy’s autoresearch: instead of an agent improving a training run overnight, mine improves a prime search, run after run.',
      'The agent owns a solver and a fixed judge checks every claim. It can invent an algorithm, tune a sieve, use every core, reach for GMP or the GPU; the judge only cares that the primes are real, not Mersenne, and found within 60 s.',
    ],
    media: [],
    links: [['source', `${GH}autoprime`]],
    demo: 'ulam',
    log: [[85, 8]],
  },
  {
    slug: 'qsl',
    title: 'KJ5SCH',
    remarkable: 'River Dowdy. QSL: confirming our contact on 146.520 MHz, 2 m calling',
    freq: 146.52e6,
    span: 0.002,
    signature: 'The 2 m national simplex calling frequency, narrowband FM: 16 kHz wide by Carson’s rule.',
    sig: [{ k: 'rrc', f: 146.52e6, rs: 16e3, a: 0.6, p: -6 }],
    years: 'licensed TODO',
    numbers: [],
    body: [],
    media: [],
    links: [['github', 'https://github.com/Rivercraft911']],
    log: [],
    todo: ['licence date, grid square, email / other links for the QSL card'],
  },
  {
    slug: 'yapogee',
    title: 'Yapogee',
    remarkable: 'DVB-S2 from an RP2350B through PIO and DMA, no FPGA: 8PSK 5/6 at 38.76 Mb/s',
    freq: 1.28e9,
    span: 0.025,
    signature: 'IREC’s 1.28 GHz first: 16 Msym/s with a 0.20 roll-off fills 19.2 MHz.',
    sig: [{ k: 'rrc', f: 1.28e9, rs: 16e6, a: 0.2, p: -3 }],
    years: '2026',
    numbers: [
      ['QPSK', '16 Msym/s, the AFE7071’s limit at 4 samples/symbol'],
      ['fastest QPSK', '27.94 Mb/s at 9/10'],
      ['8PSK', '30.97 Mb/s at 2/3, 38.76 Mb/s at 5/6'],
      ['16APSK, 32APSK', '14.73 and 14.33 Mb/s'],
      ['pulse shaping', '72 % of a core → about 3 %'],
    ],
    body: [
      'Can an RP2350 replace the FPGA that usually feeds a TI AFE7071 transmitter? Digitally, yes, with margin. One RP2350B builds the whole DVB-S2 waveform, from framing and LDPC to pilots and pulse shaping, and PIO and DMA stream the I/Q out over the AFE’s parallel bus.',
      'Pulse shaping used to take 72 % of a core; with PIO building the table addresses and DMA moving the samples, it takes about 3 %. The board around it, with an LMX2572 LO and drivers for 1.28 and 2.4 GHz, is being drawn now.',
    ],
    media: [
      { src: `${RAW}RP2350_IQ_Benchmark/main/results/plots/summary-2026-10-16/offload.png`, alt: 'Core time spent on pulse shaping, from the CPU shaper to PIO and DMA' },
      { src: `${RAW}RP2350_IQ_Benchmark/main/results/plots/summary-2026-10-16/capacity.png`, alt: 'Data capacity against bandwidth for every measured mode' },
      { src: `${RAW}yapogee/main/hardware/architecture/system-overview.svg`, alt: 'Yapogee system overview: RP2350B, AFE7071, LMX2572 and RF chain' },
    ],
    links: [['yapogee', `${GH}yapogee`], ['RP2350 benchmark', `${GH}RP2350_IQ_Benchmark`]],
    demo: 'yapogee',
    log: [[100, 82], [101, 4], [102, 204]],
  },
  {
    slug: 'driftwood',
    title: 'driftwood',
    remarkable: 'Walks your iPhone along a route you drew, over USB, at 1.4 m/s; no app, no cloud',
    freq: 1575.42e6,
    span: 0.004,
    signature: 'It never transmits; it tells the phone what GPS L1 C/A would have said: 1.023 Mchip/s at 1575.42 MHz, under the noise.',
    sig: [{ k: 'sinc', f: 1575.42e6, rc: 1.023e6, p: -82 }],
    years: '2026',
    numbers: [
      ['moves', 'walk, jog, bike, drive, with pauses'],
      ['link', 'USB, pymobiledevice3'],
      ['stack', 'FastAPI, vanilla JS, Mapbox GL'],
    ],
    body: [
      'Want Find My to believe you crossed Antarctica while you were in your dorm room? Have you considered lying with infrastructure?',
      'Draw a route, snap it to roads, plug in the iPhone and press play: the phone walks, jogs, rides or drives it at the right speed. Nothing installed on the phone, nothing in the cloud, just USB.',
    ],
    media: [],
    links: [['source', `${GH}driftwood`]],
    demo: 'walk',
    log: [[77, 22], [78, 3]],
    todo: ['a screenshot of the route editor'],
  },
  {
    slug: 'esp-dvbs2',
    title: 'esp-dvbs2',
    remarkable: 'A whole DVB-S2 transceiver on one $5 ESP32-S3, out of its own Wi-Fi radio: 69.8 Mb/s',
    freq: 2.42e9,
    span: 0.03,
    signature: 'QPSK 9/10 at 33.33 Msym/s, roll-off 0.20, on 2420 MHz: a flat-topped hump 40 MHz wide.',
    sig: [{ k: 'rrc', f: 2.42e9, rs: 33.33e6, a: 0.2, p: 0 }],
    years: '2026',
    numbers: [
      ['8PSK 9/10', '69.8 Mb/s in 36 MHz'],
      ['QPSK 9/10, α 0.20', '58.2 Mb/s in 40 MHz'],
      ['received on an S3', '12.64 Mb/s, every byte decoded'],
      ['receive sweep', '223 153 frames: none lost, none failed'],
      ['live video', '2.4 h on air, 5 725 408 frames'],
    ],
    body: [
      'A whole DVB-S2 transceiver on one $5 ESP32-S3. It frames, codes, modulates and pulse-shapes the signal and sends it out of its own Wi-Fi radio; a second S3 pulls it back in and decodes every frame on the chip. No PC, no external DAC or ADC, no FPGA.',
      'The trick: the radio hides a test engine that plays samples from RAM into its I/Q DAC, a fresh bank every 196.75 µs. That leaves three CPU cycles a sample, so I precompute every possible output of the shaping filter into a table, and making samples becomes copying rows on the S3’s vector unit. I set out for 9.68 Mb/s of live video and kept going.',
    ],
    proof: [LIVE],
    media: [
      { src: `${RAW}esp-dvbs2/main/docs/img/rf-40mhz.png`, alt: '40 MHz QPSK spectrum and spectrogram transmitted by an ESP32-S3, captured by a B200' },
      { src: `${RAW}esp-dvbs2/main/docs/img/rx-5m.png`, alt: 'What the receiving S3 sees at 12.64 Mb/s: spectrum, spectrogram and constellation' },
      { src: `${RAW}esp-dvbs2/main/docs/img/rf-36mhz.png`, alt: '36 MHz 8PSK spectrum and spectrogram transmitted by an ESP32-S3' },
    ],
    links: [
      ['source', `${GH}esp-dvbs2`],
      ['live video', 'https://github.com/user-attachments/assets/d9fcb80d-3431-469d-b2b3-6987c60373bc'],
    ],
    demo: 'esp',
    log: [[102, 304], [103, 434]],
  },
  {
    slug: 'r-01',
    title: 'R-01',
    remarkable: 'RGB raster laser projector: 320×120 at a 1.83 MHz pixel rate off a 27 000 RPM polygon',
    freq: C / 520e-9,
    span: 0.2,
    signature: 'Three laser lines, 638, 520 and 450 nm: 470, 577 and 666 THz, drawn in their own colours.',
    sig: [{ k: 'lines', f: [C / 638e-9, C / 520e-9, C / 450e-9], p: [-2, -3, -2] }],
    years: '2026',
    numbers: [
      ['raster', '320 × 120, 15 frames/s target'],
      ['polygon', '27 000 RPM, 4 facets, 1800 lines/s'],
      ['pixel loop', '637 kHz → 1.83 MHz'],
      ['colour', '12 iC-HG30 channels, 4 binary-weighted per laser'],
      ['build', '129 parts, 19 of them custom'],
    ],
    body: [
      'A laser projector I built with Amy for CS107E. Red, green and blue lasers combine through two dichroic mirrors onto a polygon mirror spinning at 27 000 RPM; each facet sweeps one line, and a galvo steps between them, odd lines down and even lines back up.',
      'An IR sensor catches each facet going by and arms a timer for the instant the beam reaches the screen; then 320 pixels go out the GPIO ports, each on its own timestamp so jitter never builds up. A pixel is one byte, precomputed into four port writes. We called it Icarus: the polygon motor caught fire on demo day. R-02 is planned.',
    ],
    proof: [
      { src: `${MEDIA}r01/polyspin.mp4`, alt: 'The polygon mirror spinning up on the bench', video: true, size: [540, 960] },
      { src: `${MEDIA}r01/blinktest.mp4`, alt: 'Blink test: the green laser’s line off the polygon, on a paper screen', video: true, size: [540, 960] },
    ],
    boards: ['laserbrain', 'laserdriver'],
    media: [
      { src: `${RAW}R-01_Raster_Laser_Projector/master/images/LaserDriver.jpeg`, alt: 'The RGB laser driver board: twelve iC-HG30 channels' },
      { src: `${RAW}R-01_Raster_Laser_Projector/master/images/laserBrain.jpeg`, alt: 'LaserBrain, the power and interface hat for the MangoPi' },
      { src: `${RAW}R-01_Raster_Laser_Projector/master/images/CAD_R-01_SS.png`, alt: 'R-01’s CAD: optics, polygon, galvo and chassis' },
    ],
    links: [['source', `${GH}R-01_Raster_Laser_Projector`]],
    demo: 'raster',
    log: [[82, 58], [83, 19], [84, 32], [85, 2]],
    todo: ['the lasers’ real wavelengths (638 / 520 / 450 nm assumed)', 'a photo of it projecting, if one exists'],
  },
]

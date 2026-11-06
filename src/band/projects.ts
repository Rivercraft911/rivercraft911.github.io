// River's work, each at a real frequency with the shape its real signal makes on an analyzer.
// Content comes from the public READMEs; anything marked TODO is River's to fill or confirm.
// Spectral parts: a line is a carrier, rrc a DVB-S2 raised-cosine hump Rs(1 + α) wide, sinc a keyed or
// chipped carrier's sinc² lobe, band a voice band. p is power in dB below the strongest station.

export type Part =
  | { k: 'lines'; f: number[]; p: number[] }
  | { k: 'rrc'; f: number; rs: number; a: number; p: number }
  | { k: 'sinc'; f: number; rc: number; p: number }
  | { k: 'band'; lo: number; hi: number; p: number }

export type Media = { src: string; alt: string; video?: boolean }

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
  links: [string, string][]
  demo?: 'esp' | 'yapogee' | 'ulam' | 'raster'
  log: [number, number][] // [week since 2024-10-28, commits]: the waterfall
  todo?: string[]
}

const GH = 'https://github.com/Rivercraft911/'
const RAW = 'https://raw.githubusercontent.com/Rivercraft911/'
const ORBIT = 1 / (92.9 * 60) // a ~93-minute low Earth orbit. TODO River: SAMWISE's real period
const harmonics = (f0: number, n: number, odd = false) => {
  const f: number[] = [], p: number[] = []
  for (let k = 1; k <= n; k += odd ? 2 : 1) f.push(f0 * k), p.push(-20 * Math.log10(k)) // a square wave's 1/k
  return { k: 'lines' as const, f, p }
}
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
    remarkable: '5 coupled models of one CubeSat: orbit, radio, pointing, power and thermal',
    freq: 1 / (365.2422 * 86400),
    span: 0.6,
    signature: 'Its J2 model turns a sun-synchronous orbit plane once a year: 31.7 nHz.',
    sig: [{ k: 'lines', f: [1 / (365.2422 * 86400)], p: [-14] }],
    years: '2026',
    numbers: [
      ['orbit', 'RK4 and symplectic, J2, ground tracks'],
      ['radio', 'antenna patterns, QPSK and 8PSK MODCODs, LoRa beacons'],
      ['GNC', 'reaction wheels, magnetorquers, momentum unloading'],
      ['power', 'solar, battery charge, voltage and current'],
      ['thermal', 'coupled bus, battery and panel temperatures'],
    ],
    body: [
      'A CubeSat mission simulator for studying radio links, pointing, power and temperature over a single pass or a whole mission.',
      'Orbits integrate under J2 and draw their ground tracks; links are budgeted through antenna patterns and real MODCODs; wheels and magnetorquers point the bus and dump its momentum; the panels charge the battery while bus, battery and panels trade heat. Runs play live, replay, and write pass reports.',
    ],
    media: [{ src: `${RAW}yapling-observatory/main/docs/random-screenshot.png`, alt: 'Yapling Observatory running a simulated mission in the browser' }],
    links: [['source', `${GH}yapling-observatory`]],
    log: [[103, 45], [104, 103]],
  },
  {
    slug: 'samwise',
    title: 'SAMWISE ADCS',
    remarkable: "PCB magnetorquer coils for Stanford SSI's CubeSat, trace width tuned over 6 layers",
    freq: ORBIT,
    span: 0.5,
    signature: 'A magnetorquer pushes against Earth’s field, which turns past it once an orbit: ≈0.18 mHz.',
    sig: [{ k: 'lines', f: [ORBIT], p: [-8] }],
    years: '2024 – 2026',
    numbers: [
      ['coil', '6 layers, 2 oz copper'],
      ['optimizes', 'trace width for magnetic moment under a power limit'],
      ['radios', 'S-band SX1280 and UHF RFM98PW LoRa'],
      ['range test', 'transmitter, receiver, observer, S-band image transfer'],
    ],
    body: [
      'SAMWISE is the Stanford Student Space Initiative CubeSat. For its attitude control I wrote a tool that finds the trace width that maximizes a PCB magnetorquer coil’s magnetic moment, given the copper weight, the layer count, the supply and a power limit, with live graphs as you turn the knobs.',
      'For its avionics: a Raspberry Pi Pico breakout carrying the S-band and UHF LoRa modules and the bus to the rest of the stack, and the range-test firmware that drove them, down to sending images over S-band.',
    ],
    media: [
      { src: `${RAW}magtorque-optimization/main/images/screenshot1.png`, alt: 'The magnetorquer optimizer: magnetic moment against trace width' },
      { src: `${RAW}magtorque-optimization/main/images/screenshot2.png`, alt: 'The magnetorquer optimizer’s parameter sweep' },
      { src: `${RAW}SoftwareDebugPicoHat/main/Plots/Board3dRender.png`, alt: 'Render of the Pico breakout board for the SAMWISE radios' },
    ],
    links: [
      ['magtorque-optimization', `${GH}magtorque-optimization`],
      ['Pico radio hat', `${GH}SoftwareDebugPicoHat`],
      ['range-test firmware', `${GH}RangeTestSoftware`],
    ],
    log: [[0, 1], [1, 9], [14, 7], [17, 1], [65, 7], [66, 3], [68, 9], [69, 34]],
    todo: ['SAMWISE orbit period, launch status and your role in its ADCS', 'a photo of flight hardware, if public'],
  },
  {
    slug: 'magtorqreflect',
    title: 'magTorqReflect',
    remarkable: 'Driver and bench for a ±30 Am² magnetorquer: 0.12 W idle, 9.36 W flat out',
    freq: 2 * ORBIT,
    span: 0.5,
    signature: 'The dipole field it pushes on peaks over both poles, so its strength swings twice an orbit.',
    sig: [{ k: 'lines', f: [2 * ORBIT], p: [-11] }],
    years: '2025',
    numbers: [
      ['device', 'AAC Hyperion MTQ800.15'],
      ['dipole', '±30 Am²'],
      ['power', '0.12 W idle, 9.36 W at 30 Am²'],
      ['link', '115 200 Bd serial, CRC-8 poly 0xEB'],
    ],
    body: [
      'A Python driver for the AAC Hyperion MTQ800.15 magnetorquer. It speaks the Hyperion protocol, $ host node command length data : CRC, over serial, and carries a test suite for connection, telemetry and dipole control.',
      'An interactive power profile walks the dipole up and logs the draw: linear to about 15 Am², a boost region above 20 Am², 9.36 W at the 30 Am² limit.',
    ],
    media: [{ src: `${RAW}magtorqReflect/main/data/mtq_power_profile.png`, alt: 'Measured power against commanded dipole moment for the MTQ800.15' }],
    links: [['source', `${GH}magtorqReflect`]],
    log: [[34, 5], [35, 1]],
    todo: ['Is this Reflect Orbital work you want named as such?'],
  },
  {
    slug: 'strobeglasses',
    title: 'strobeGlasses',
    remarkable: 'Open-source strobe glasses, MK1, to take on the expensive ones',
    freq: 10,
    span: 1.4,
    signature: 'Shutters flicking open and shut make a square wave: a 10 Hz line and its odd harmonics.',
    sig: [harmonics(10, 15, true)],
    years: '2025',
    numbers: [['revision', 'MK1, KiCad']],
    body: ['Open source strobe glasses to compete with the expensive evil ones.'],
    media: [],
    links: [['source', `${GH}strobeGlasses`]],
    log: [[39, 3], [40, 1], [47, 1]],
    todo: ['strobe rate and duty (10 Hz square is a guess)', 'photos, status, a better one-liner with a number'],
  },
  {
    slug: 'pigeon-vision',
    title: 'Pigeon Vision',
    remarkable: 'IREC rocket video: two 200° fisheye cameras at 30.0 frames/s, stitched to 360°',
    freq: 30,
    span: 1.4,
    signature: 'Two cameras at 30.0 frames/s: a 30 Hz frame line and its harmonics.',
    sig: [harmonics(30, 12)],
    years: '2026',
    numbers: [
      ['cameras', '2 × IMX900, 200° fisheye'],
      ['encoder', 'CM5, 8 Mb/s MPEG-TS'],
      ['on air', '2.4 h, 5 725 408 frames, none failed'],
    ],
    body: [
      'The video payload for an IREC rocket. A CM5 encodes two 200-degree fisheye cameras into an 8 Mb/s MPEG transport stream and clocks it over SPI into the transmitter; on the ground the two views are stitched into one 360° sphere.',
      'On the bench, through esp-dvbs2 from one S3 to another: sixteen back-to-back 540 s runs, 2.4 hours on air, 5 725 408 frames decoded with none failed and both cameras at 30.0 frames/s.',
    ],
    media: [{ src: `${RAW}esp-dvbs2/main/examples/live-video/bench.jpg`, alt: 'The live-video bench: transmitting S3 by the cameras, coax and attenuator, receiving S3 and its W5500' }],
    links: [['live video on esp-dvbs2', `${GH}esp-dvbs2#live-video-one-s3-to-another`]],
    log: [],
    todo: ['flight or launch footage', 'the AntSDR downlink: frequency and mode (would move this station to RF)', 'is the Pigeon Vision repo public?'],
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
      'A better Infinity transmitter than the ones old intelligence services used. An ESP32-S3 streams a MEMS microphone to a Raspberry Pi, which transcribes it offline, watches for keywords and texts you when they come up, with a live dashboard of the room.',
      'Version two is a custom board, in KiCad now. For use only where everyone in the room has agreed to it.',
    ],
    media: [],
    links: [['source', `${GH}InfiniteRecon`], ['first version', `${GH}InfiniteRecon_OUTDATED`]],
    log: [[14, 8], [67, 1], [71, 2], [73, 10], [74, 2]],
    todo: ['a photo of the v2 board'],
  },
  {
    slug: 'peep',
    title: 'PEEP',
    remarkable: "The world's smallest IR-triggered keystroke injector: 12.06 × 8 mm",
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
      'A USB keyboard the size of a fingertip that plugs straight into a USB-A port on its own board edge. An infrared burst from across the room starts its stored macro; it types it as ordinary keyboard reports, ignores IR while it types, and re-arms after 250 ms of quiet.',
      'A XIAO ESP32-C6 serves as a Wi-Fi to IR remote. For systems you own or may test.',
    ],
    media: [
      { src: `${RAW}PEEP/main/docs/media/peep-on-fingertip.jpg`, alt: 'An assembled PEEP board on a fingertip' },
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
    remarkable: 'An agent loop hunting primes: the biggest non-Mersenne prime it can prove in 60 s',
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
      'A riff on karpathy/autoresearch. Autoresearch turns an agent loose overnight to improve a tiny training run; autoprime points the same loop at prime numbers and dreams of climbing, run after run, towards greatness.',
      'The agent owns a solver workspace and a fixed judge checks every claim: invent an algorithm, tune a classic sieve, use every core, reach for GMP or the GPU, or guess enormous candidates and test them. The judge cares only that the primes are real, not Mersenne, and found in time.',
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
      'Can an RP2350 replace the FPGA that feeds a TI AFE7071 transmitter? Digitally: yes, with margin. One RP2350B builds the whole DVB-S2 waveform, BB framing and scrambling, BCH, LDPC, mapping, PL headers, pilots, PL scrambling and pulse shaping, and DMA and PIO stream the I/Q samples out over the AFE’s parallel bus with its DDR clock made on a GPIO.',
      'Pulse shaping used to take 72 % of a core at 8 Msym/s. With PIO building the table addresses and DMA moving the samples it takes about 3 %, which is just the loop watching for faults. The board around it, an LMX2572 LO and a small driver for 1.28 GHz and 2.4 GHz, is being drawn now.',
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
    sig: [{ k: 'sinc', f: 1575.42e6, rc: 1.023e6, p: -40 }],
    years: '2026',
    numbers: [
      ['moves', 'walk, jog, bike, drive, with pauses'],
      ['link', 'USB, pymobiledevice3'],
      ['stack', 'FastAPI, vanilla JS, Mapbox GL'],
    ],
    body: [
      'Have you been struggling with your performativity? Want your friends’ Find My to believe you crossed Antarctica while you were in fact in your dorm room? Have you considered lying with infrastructure?',
      'Draw a route on a map, snap it to roads, plug in the iPhone and press play: the phone wanders the earth without you, at a walk, a jog, a ride or a drive. No Xcode, nothing installed on the phone.',
    ],
    media: [],
    links: [['source', `${GH}driftwood`]],
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
      'One S3 frames, codes, modulates and pulse-shapes DVB-S2 and sends it out of its own Wi-Fi radio. A second S3 pulls it back in through its own radio and demodulates and decodes every frame on the chip. No PC, no external DAC or ADC, no FPGA.',
      'The radio hides a test engine that plays samples from RAM into its I/Q DAC: a fresh 16 380-sample bank every 196.75 µs at 80 MS/s. Every possible output of the shaping filter is computed once into a table, so making samples is copying rows, and the heavy loops run on the S3’s 128-bit vector unit. It started as a goal of 9.68 Mb/s for live video and kept going.',
    ],
    media: [
      { src: `${RAW}esp-dvbs2/main/docs/img/rf-40mhz.png`, alt: '40 MHz QPSK spectrum and spectrogram transmitted by an ESP32-S3, captured by a B200' },
      { src: `${RAW}esp-dvbs2/main/docs/img/rx-5m.png`, alt: 'What the receiving S3 sees at 12.64 Mb/s: spectrum, spectrogram and constellation' },
      { src: `${RAW}esp-dvbs2/main/docs/img/rf-36mhz.png`, alt: '36 MHz 8PSK spectrum and spectrogram transmitted by an ESP32-S3' },
      { src: `${RAW}esp-dvbs2/main/examples/live-video/bench.jpg`, alt: 'The live-video bench, one S3 to another' },
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
      'Red, green and blue lasers combine through two dichroic mirrors onto a spinning polygon mirror; each facet sweeps one line. An IR sensor sees each facet go by, an interrupt clocks the mirror and arms a timer for the instant the beam reaches the screen, and 320 pixels go out the GPIO ports, each on its own absolute timestamp so jitter never accumulates. Then the galvo steps, odd lines down and even lines back up, and at the top the framebuffers swap.',
      'Colour is one byte a pixel, rrrgggbb, precomputed at boot into four GPIO port words, so painting a pixel is one lookup and four writes. Postmortemly known as Icarus: the polygon motor caught fire on demo day and the galvo never answered. R-02 is planned. Built with Amy for CS107E.',
    ],
    media: [
      { src: `${RAW}R-01_Raster_Laser_Projector/master/images/POLYSPIN.mp4`, alt: 'The polygon mirror spinning up', video: true },
      { src: `${RAW}R-01_Raster_Laser_Projector/master/images/LaserDriver.jpeg`, alt: 'The RGB laser driver board: twelve iC-HG30 channels' },
      { src: `${RAW}R-01_Raster_Laser_Projector/master/images/laserBrain.jpeg`, alt: 'LaserBrain, the power and interface hat for the MangoPi' },
      { src: `${RAW}R-01_Raster_Laser_Projector/master/images/CAD_R-01_SS.png`, alt: 'R-01’s CAD: optics, polygon, galvo and chassis' },
      { src: `${RAW}R-01_Raster_Laser_Projector/master/images/BLINKTEST.mp4`, alt: 'Laser blink test', video: true },
    ],
    links: [['source', `${GH}R-01_Raster_Laser_Projector`]],
    demo: 'raster',
    log: [[82, 58], [83, 19], [84, 32], [85, 2]],
    todo: ['the lasers’ real wavelengths (638 / 520 / 450 nm assumed)', 'a photo of it projecting, if one exists'],
  },
]

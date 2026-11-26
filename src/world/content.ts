// What the world's pages say: projects.ts, the source of truth, plus the work since. Facts come from River's repos
// and READMEs; anything unsure is listed in a `todo`, which is River's to settle and is never shown.
import { PROJECTS, type Project } from '../band/projects'

export type Work = Pick<Project, 'slug' | 'title' | 'remarkable' | 'years' | 'numbers' | 'body' | 'media' | 'links' | 'todo'>

const GH = 'https://github.com/Rivercraft911/'
const RAW = 'https://raw.githubusercontent.com/Rivercraft911/'
const BOARDS = `${import.meta.env.BASE_URL}media/boards/` // River's boards, rendered top-down from KiCad (bake-boards.mjs)

// Who, and how to reach them. An empty slot renders nothing.
export const CONTACT = {
  name: 'River Dowdy',
  what: 'RF · embedded · space hardware',
  github: 'https://github.com/Rivercraft911',
  email: '', // TODO(River): the address hiring managers should write to
  linkedin: '', // TODO(River): the profile URL
  resume: '', // TODO(River): a PDF under public/ (e.g. `${import.meta.env.BASE_URL}river-dowdy.pdf`) or a URL
}

// Each place's single best proof, for the index: the 30-second version, one line a place (PLACES ids).
export const BEST: Record<string, string> = {
  valley: 'DVB-S2 at 69.8 Mb/s out of a $5 Wi-Fi chip',
  launch: 'rocket video: 5 725 408 frames, none failed',
  lighthouse: 'RGB laser raster off a 27 000 RPM polygon',
  bench: 'a keystroke injector 12.06 × 8 mm, set off by IR',
  hearts: '144 LEDs; twin hearts beat as one over ESP-NOW',
  receiver: 'a $33 GPS front end; cold fixes on recorded sky',
  station: 'SAMWISE CubeSat: 6-layer PCB magnetorquer coils',
  core: 'prime hunt: GPU factoring projected 1.6× mfakto',
}

// New since projects.ts was written, and rewrites of what has moved on (a slug here replaces its old entry).
const NEW: Work[] = [
  {
    slug: 'pigeon-vision',
    title: 'Pigeon Vision',
    remarkable: 'Live video from an IREC rocket: two fisheye cameras, one CM5, DVB-S2 down on 1.28 GHz',
    years: '2026',
    numbers: [
      ['cameras', '2 × IMX900 fisheye, 30 frames/s, 9 Mb/s'],
      ['downlink', 'DVB-S2 QPSK 2/3, 8 Msym/s, α 0.20, pilots'],
      ['transmitter', 'ESP32-S3 at 2.42 GHz, mixed to 1.28 GHz'],
      ['PA', '0.5 W average'],
      ['boards', '6-layer carrier, Rev 1.1; 4-layer Yapogee S3'],
      ['on the bench', '2.4 h on air, 5 725 408 frames, none failed'],
    ],
    body: [
      'The video payload for Stanford SSI’s IREC rocket. Two fisheye cameras look opposite ways; a CM5 encodes both into one MPEG transport stream, records it, and sends it down live through deployment, so the ground stitches a whole sphere and every viewer can look wherever they like, with no uplink.',
      'The boards: a round 6-layer carrier, 144.78 mm across, for the CM5, both cameras, power and sensors (148 parts, 645 filled and capped vias), and Yapogee S3, a 4-layer 55 × 43 mm daughterboard on which an ESP32-S3 makes DVB-S2 at 2.42 GHz and an RFFC5072A mixes it down to 1.28 GHz. The LO sits above the signal, so the spectrum comes out mirrored, and the I/Q go out conjugated to mirror it back. A separate GRF5613 board is the PA.',
      'Through esp-dvbs2, from one S3 to another on the bench: sixteen back-to-back 540 s runs, 2.4 hours on air, every one of 5 725 408 frames decoded, both cameras at 30.0 frames/s. On the ground, the receive chain for an AntSDR E200 at 12 MS/s already decodes the 8 Msym/s QPSK 2/3 profile from recorded samples.',
    ],
    media: [{ src: `${RAW}esp-dvbs2/main/examples/live-video/bench.jpg`, alt: 'The live-video bench: transmitting S3 by the cameras, coax and attenuator, receiving S3 and its W5500' }],
    links: [
      ['source', 'https://github.com/stanford-ssi/PigeonVision'],
      ['flight demo', 'https://stanford-ssi.github.io/PigeonVision/'],
      ['live video on esp-dvbs2', `${GH}esp-dvbs2#live-video-one-s3-to-another`],
    ],
    todo: [
      'your role on Pigeon Vision (the repo shows you designed the carrier and Yapogee S3; say it in your words)',
      'PA power: 0.5 W average is shown (the RF PA board README); hardware/rf-frontend now plans 1 W at the PA output. Which?',
      'renders or photos of the carrier and Yapogee S3; flight footage when there is some',
    ],
  },
  {
    slug: 'rava-heart',
    title: 'Rava Heart',
    remarkable: 'A heart of 144 LEDs that beats in time with its twin, over ESP-NOW',
    years: '2026',
    numbers: [
      ['LEDs', '144 WS2812B-MINI in two chains of 72, refreshed at 60 Hz'],
      ['board', '4 layers, 94 × 88 mm, USB-C behind an eFuse'],
      ['sensing', 'ESP32-C3, LSM6DSOX accelerometer and gyro, LIS3MDL magnetometer'],
      ['link', 'ESP-NOW: two hearts near each other lock to one beat'],
    ],
    body: [
      'A heart-shaped board that beats: a slow double pulse, and shaking it adds an extra beat. Put two near each other and they find each other over ESP-NOW and beat together. Tilt one and red liquid sloshes round inside it; hold the button for a second and both play I ♥ U.',
      'Scripts generated the outline, placed the LEDs and routed the power, and a browser simulator runs the same effects with no hardware at all.',
    ],
    media: [
      { src: `${BOARDS}heart.webp`, alt: 'Rava Heart from above, rendered from its KiCad board' },
      { src: `${RAW}rava-heart/main/assets/pcb-front-back.png`, alt: 'KiCad renders of the front and back' },
    ],
    links: [['source', `${GH}rava-heart`], ['simulator', `${GH}rava-heart/tree/main/firmware/simulator`]],
    todo: ['a short video of two hearts in sync (assets/heart-demo.gif is 9 MB; an mp4 would load fast)'],
  },
  {
    slug: 'ephemeris',
    title: 'Ephemeris 1',
    remarkable: 'A $33 GPS L1 front end for raw I/Q, and the in-house spacecraft receiver behind it',
    years: '2026',
    numbers: [
      ['parts', '$32.96 a board, 37 parts (a flight GPS receiver kit lists from $11 485)'],
      ['front end', 'MAX2769B, 16.368 MHz TCXO, raw I/Q on a 4-bit bus'],
      ['receiver', 'RP2350 at 150 MHz: acquisition, tracking, LNAV and navigation, fixes at 5 Hz'],
      ['real sky', 'a cold fix in 55.24 s from a recorded rooftop, 2.56 m median from GNSS-SDR'],
      ['550 km orbit', '1.30 m p95 3D error, replayed into the RP2350'],
    ],
    body: [
      'Spacecraft GPS receivers are quoted in the thousands of dollars. Ephemeris 1 is the front end of an in-house one for about $33 of parts: a MAX2769B takes GPS L1 in through the SMA and hands raw I/Q to the host header, and the receiver behind it is firmware on an RP2350.',
      'The receiver already works on recorded signals. Fed a real rooftop recording from cold, the Pico tracked six satellites and fixed in 55 s, a median 2.56 m (horizontally) from GNSS-SDR’s fixes on the same data; on a simulated 550 km orbit it holds 1.30 m p95 at 5 Hz. The first boards are on the bench for assembly, and tests on a Safran simulator follow bring-up.',
    ],
    media: [
      { src: `${BOARDS}gnss.webp`, alt: 'Ephemeris 1 from above, rendered from its KiCad board' },
      { src: `${RAW}Ephemeris-1/main/docs/software/measurements/cttc/separation.png`, alt: 'Horizontal, vertical and 3D separation between the Pico’s fixes and GNSS-SDR’s on the same rooftop recording' },
    ],
    links: [['source', `${GH}Ephemeris-1`], ['assembly BOM', 'https://rivercraft911.github.io/Ephemeris-1/assembly/ibom.html']],
  },
  {
    slug: 'strobeglasses',
    title: 'Strobe Glasses',
    remarkable: 'Open-source strobe glasses, MK1: LCD shutters at 2 to 20 frames/s off an ATtiny402',
    years: '2025 – 2026',
    numbers: [
      ['strobe', '2 – 20 frames/s, 20 – 80 % dark, both eyes together or alternating'],
      ['drive', 'every dark window split into balanced AC pairs near 100 Hz'],
      ['board', 'ATtiny402, USB-C charging, one output per eye'],
      ['lenses', 'LCD light valves in a printed top-loading frame'],
    ],
    body: [
      'Strobe glasses for visual reaction-time training, open source, to take on the expensive ones. An LCD light valve slides into each rim of a printed frame and switches between clear and dark. One button cycles the presets (6 frames/s at 40 % dark, 5 at 50 %, 4 at 60 %) and edits a custom one, and a double tap switches between both eyes at once and alternating.',
      'The valves see only balanced AC, so no DC ever sits across the liquid crystal. Left floating, the voltage across a valve takes 477 ms to fall from 90 % to 10 %; shorting the leads clears it far faster. MK1 is released: KiCad board, firmware, and a frame to print.',
    ],
    media: [
      { src: `${RAW}strobeGlasses/main/assets/strobe-glasses.gif`, alt: 'The assembled glasses, both lenses switching between dark and clear' },
      { src: `${BOARDS}strobe.webp`, alt: 'The MK1 board from above, rendered from KiCad' },
      { src: `${RAW}strobeGlasses/main/assets/lcd-5v-psu-off.png`, alt: 'Voltage across one LCD valve decaying after the 5 V supply turns off: 477 ms from 90 % to 10 %' },
    ],
    links: [['source', `${GH}strobeGlasses`], ['print and assemble', `${GH}strobeGlasses/blob/main/mechanical/TOP_LOAD.md`]],
  },
  {
    slug: 'cubesat-imaging-sim',
    title: 'Field of View',
    remarkable: 'A CubeSat camera and downlink simulator in the browser: fly a 1U over Stanford at 550 km',
    years: '2026',
    numbers: [
      ['orbit', '550 km sun-synchronous pass under J2; its Sun within 0.01° of JPL Horizons'],
      ['cameras', '3 × IMX676 at 3536 × 3536: a 190° fisheye pair stitched to 360°, and a main lens'],
      ['main camera', 'about 44 m a pixel, a 155.7 km footprint at 25 mm'],
      ['downlink', 'real browser encoding, queued against a DVB-S2 payload rate'],
      ['GPU', 'WebGPU; a 1080 × 1080 frame reaches the encoder in 0.2 ms'],
    ],
    body: [
      'Fly a 1U CubeSat over Stanford, change lenses, aim the fisheye pair, and set the full-resolution frame beside the video that arrives over the downlink. Built for Stanford SSI.',
      'Frames are rendered at the sensor’s native resolution from real imagery, blurred by the lens’s Airy core, pointing jitter and exposure smear, then really encoded by the browser and queued against the link’s payload rate, B η / (1 + α) × (1 − r). Dropped chunks and late keyframes look the way they would.',
    ],
    media: [
      { src: `${RAW}cubesat-imaging-sim/main/docs/media/space-over-the-bay.webp`, alt: 'The CubeSat above San Francisco Bay, its tape antennas out and the lens’s field of view beyond the bus' },
      { src: `${RAW}cubesat-imaging-sim/main/docs/media/stanford-daylight-pass.webp`, alt: 'A daylight pass: the stitched panorama, and the 50 mm camera looking straight down' },
    ],
    links: [['open the simulator', 'https://rivercraft911.github.io/cubesat-imaging-sim/'], ['source', `${GH}cubesat-imaging-sim`]],
  },
  {
    slug: 'primesf',
    title: 'Primorial',
    remarkable: 'A hunt for a new prime of 100 million digits, with its own GPU factoring kernels',
    years: '2026',
    numbers: [
      ['goal', 'a new prime of at least 10⁸ decimal digits, independently verified'],
      ['GPU factoring', 'projected 1.62 – 1.65× tuned mfakto at 79 bits, 1.69× at 81 (1.07× measured on 61-bit searches)'],
      ['octic wheel', 'q = x² + 64y² cuts the checks to 24 – 26 % (p = 149 500 111, q in 2⁷⁸ – 2⁷⁹)'],
      ['GPU', 'Apple M4 Pro, Metal'],
    ],
    body: [
      'Mersenne numbers are the baseline and Proth numbers the first challenger, and every step asks the same question: which candidates, sieve and test find a prime for the fewest device-hours, with everything charged. Each experiment keeps its proof, its code and its measurements together, and dead ends are written down as results.',
      'Trial factoring is where the GPU earns its keep. A factor q = 2kp + 1 of 2ᵖ − 1 must be x² + 27y² when 3 divides k, and x² + 64y² when 4 does, so the kernels enumerate those forms instead of every k. The primality test itself remains the open cost.',
    ],
    media: [],
    links: [],
    todo: ['PrimesF is private: link it once it is public', 'its name on the page: Primorial (the README’s) or PrimesF?'],
  },
]

export const WORKS: Record<string, Work> = Object.fromEntries([...PROJECTS, ...NEW].map((w) => [w.slug, w]))

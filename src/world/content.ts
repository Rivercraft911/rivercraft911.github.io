// What the world's pages say: projects.ts, the source of truth, plus the work since. Facts come from River's repos
// and READMEs; anything unsure is listed in a `todo`, which is River's to settle and is never shown.
import { LIVE, PROJECTS, type Project } from '../band/projects'

export type Work = Pick<Project, 'slug' | 'title' | 'remarkable' | 'years' | 'numbers' | 'body' | 'media' | 'proof' | 'boards' | 'links' | 'todo'>

const GH = 'https://github.com/Rivercraft911/'
const RAW = 'https://raw.githubusercontent.com/Rivercraft911/'
const SSI = 'https://raw.githubusercontent.com/stanford-ssi/'

// River's boards, each with both faces rendered from KiCad (bake-boards.mjs: media/boards/<id>.webp from above,
// <id>-back.webp from below) and every sheet of its schematic (bake-schematics.mjs: media/schematics/<id>.pdf). `as`: the
// other names a place may call it by (its model's, bake-models.mjs).
export type Board = { name: string; mm: [w: number, h: number]; layers: number; as?: string[] }
export const BOARDS: Record<string, Board> = {
  'pigeon-carrier': { name: 'Pigeon Vision carrier', mm: [144.78, 143.37], layers: 6 },
  'yapogee-s3': { name: 'Yapogee S3', mm: [55, 43.18], layers: 4 },
  gnss: { name: 'Ephemeris 1', mm: [45, 34], layers: 4, as: ['ephemeris'] },
  laserbrain: { name: 'LaserBrain', mm: [100, 100], layers: 4 },
  laserdriver: { name: 'LaserDriverRGB', mm: [50, 50], layers: 4 },
  peep: { name: 'PEEP', mm: [12.06, 8], layers: 4 },
  strobe: { name: 'Strobe Glasses MK1', mm: [41.2, 15.25], layers: 2, as: ['strobe-board'] },
  heart: { name: 'Rava Heart', mm: [94, 88.3], layers: 4 },
  'coil-xy': { name: 'XY coil panel', mm: [81.5, 215.5], layers: 6 },
  coil: { name: 'Z coil panel', mm: [96.97, 97.33], layers: 6, as: ['coil-z'] },
  picohat: { name: 'Radio test bench', mm: [69.03, 54.7], layers: 4 },
  finertia: { name: 'Finertia', mm: [26, 26], layers: 6 },
}
// The board a name means (an id here, one of its other names, or its picture's file), if it is one of River's.
export const board = (name = '') => {
  const s = name.replace(/^.*\//, '').replace(/(-back)?\.webp$/, '')
  return s in BOARDS ? s : Object.keys(BOARDS).find((id) => BOARDS[id].as?.includes(s))
}

// Who, and how to reach them. An empty slot renders nothing.
export const CONTACT = {
  name: 'River Dowdy',
  what: 'RF · embedded · space hardware',
  github: 'https://github.com/Rivercraft911',
  email: '', // TODO(River): the address hiring managers should write to
  linkedin: '', // TODO(River): the profile URL
  resume: '', // TODO(River): a PDF under public/ (e.g. `${import.meta.env.BASE_URL}river-dowdy.pdf`) or a URL
}

// Each place's single best proof, for the index: the 30-second version, one line a place (PLACES ids; `bleps` and
// `glasses` are for places not built yet).
export const BEST: Record<string, string> = {
  valley: 'DVB-S2 at 69.8 Mb/s out of a $5 Wi-Fi chip',
  launch: 'live rocket video from a hacked $5 ESP32; 0 of 5.7 M frames failed',
  lighthouse: 'RGB laser raster off a 27 000 RPM polygon',
  bench: 'a TV remote makes it type; a USB keyboard 12.06 × 8 mm',
  glasses: 'open strobe glasses, 2 – 20 frames/s, released as MK1',
  hearts: '144 LEDs; twin hearts beat as one over ESP-NOW',
  receiver: 'a $33 GPS front end; cold fixes on recorded sky',
  station: 'SAMWISE CubeSat: its magnetorquer coils, etched in 6-layer boards',
  bleps: 'next: a 1U CubeSat with four cameras, in design',
  core: 'a prime of 100 million digits, hunted on one Mac',
}

// What River is up to, for whoever has 30 seconds: one line, then every project in the order to show them, the work
// of now first (`now`). `status` is where it stands (empty: not shown), `proof` its single strongest number. `see` is
// for whoever builds its place, never shown: what someone should see there, and why it is true.
export const NOW = 'Now: designing BLEPS, Stanford SSI’s next satellite, a 1U CubeSat with four cameras. Pigeon Vision’s carrier is released for fab.'
export type Entry = { slug: string; now?: true; status: string; proof: string; see: string }
export const ORDER: Entry[] = [
  {
    slug: 'bleps', now: true, status: 'in design; flight target 2027', proof: 'four cameras in a 10 cm cube',
    see: 'A 10 cm cube in orbit, four lenses on it, slewing to look at a place below. As the body turns one way its reaction wheel spins up the other, 1 047 rpm for every 1°/s: both carry 86.6 µN·m·s on the 0.00496 kg·m² axis (Finertia’s own numbers). Two 190° fisheye views back to back close into one sphere around it, with a 10° overlap at each seam.',
  },
  {
    slug: 'pigeon-vision', now: true, status: 'carrier released for fab, Yapogee S3 routed; flies at IREC', proof: '2.4 h of live video, 5 725 408 frames, none failed',
    see: 'The rocket goes up inside its own sphere of sight, two fisheye cones back to back, and its video comes down to the pad as a 9.6 MHz-wide hump at 1.28 GHz (8 Msym/s × (1 + 0.20)). On the board, the S3’s 2.42 GHz meets the 3.70 GHz LO and leaves at the difference, 1.28 GHz, mirrored, which is why the I/Q go out conjugated.',
  },
  {
    slug: 'esp-dvbs2', status: 'open source, Apache-2.0', proof: '69.8 Mb/s out of one $5 ESP32-S3',
    see: 'One cheap Wi-Fi chip and, out of it, a flat-topped 36 MHz hump (26.67 Msym/s × 1.35). The pulse shaper is a table: 15 740 new samples every 196.75 µs, 47 220 cycles at 240 MHz, three cycles a sample, each one a copied row.',
  },
  {
    slug: 'yapogee', status: 'board being drawn', proof: '8PSK 5/6 at 38.76 Mb/s from an RP2350B, no FPGA',
    see: 'A microcontroller doing an FPGA’s job: samples stream out over the AFE7071’s parallel bus while the RP2350B’s core sits near 3 % (it was 72 % before PIO and DMA took the shaping). 16 Msym/s QPSK fills 19.2 MHz at 1.28 GHz.',
  },
  {
    slug: 'ephemeris', status: 'first boards in assembly', proof: 'a $33 front end; a cold fix in 55 s, 2.56 m from GNSS-SDR',
    see: 'Satellites rising over the board, each with its Doppler, −ṙ/c × 1575.42 MHz, within about ±5 kHz for a receiver on the ground; from cold, six of them lock one by one and the fix lands 55 s in.',
  },
  {
    slug: 'r-01', status: 'built; the motor caught fire on demo day; R-02 planned', proof: 'a 1.83 MHz pixel clock off a 27 000 RPM polygon',
    see: 'Real light: 1800 lines a second off four facets, the galvo stepping odd lines down and even lines back up, each laser at 16 levels.',
  },
  {
    slug: 'peep', status: 'built', proof: '12.06 × 8 mm',
    see: 'A fingertip of a board in a USB-A port; three 38 kHz IR bursts arrive from across the room and it types.',
  },
  {
    slug: 'strobeglasses', status: 'MK1 released 19 Nov 2026; being built', proof: '2 – 20 frames/s, 20 – 80 % dark, from one ATtiny402',
    see: 'Two lenses blinking. At Balanced, 5 frames/s and 50 % dark, each lens is dark 100 ms of every 200, and inside every dark window the drive flips ±3.3 V every 5 ms (balanced AC near 100 Hz), so a scope across a valve shows a burst of square wave, then flat. A double tap and the right eye runs half a frame behind the left. Anything turning seen through them strobes: at 20 frames/s and 80 % dark each valve is clear 10 ms in 50.',
  },
  {
    slug: 'rava-heart', status: 'built', proof: '144 LEDs; two hearts beat as one over ESP-NOW',
    see: 'Two hearts on the planet, one at the antipode, beating together; the follower a light-time late.',
  },
  {
    slug: 'samwise', status: '', proof: 'its magnetorquers: coils etched in 6-layer boards, trace width tuned for moment', // TODO(River): its status
    see: 'A 2U detumbling in the planet’s field by B-dot, a time-lapse in real units.',
  },
  {
    slug: 'cubesat-imaging-sim', status: 'live in the browser', proof: '44 m a pixel from 550 km; its Sun within 0.01° of JPL Horizons',
    see: 'The main camera’s footprint on the ground, a 155.7 km square (550 km × 7.07 mm / 25 mm) at 44 m a pixel (550 km × 2 µm / 25 mm), sliding at about 7.0 km/s ground speed; beside it the fisheye pair’s two 190° circles meeting in a 360° sphere.',
  },
  {
    slug: 'yapling-observatory', status: 'runs locally', proof: 'five coupled models, 495 tests',
    see: 'An orbit plane turning once a year under J2 (a sun-synchronous plane precesses 360° in 365.24 days, 0.9856° a day), so the ground track walks; the battery and panel temperatures breathing with each orbit’s eclipse, about 36 min at 550 km.',
  },
  {
    slug: 'primesf', status: 'searching', proof: 'one record-band test: 8.49 days on one M4 Pro',
    see: 'Trial factoring of 2ᵖ − 1 as PrimesF does it: q = 2kp + 1, q ≡ ±1 mod 8. Past the record, near p = 149 500 003, one full test is 149 500 003 squarings at 4.907 ms each: 8.49 days.',
  },
  {
    slug: 'driftwood', status: 'works', proof: 'no app on the phone, nothing in the cloud: USB only',
    see: 'A blue dot walking a drawn route at 1.4 m/s while nothing in the sky moved: driftwood never transmits; the phone simply believes it.',
  },
  {
    slug: 'infiniterecon', status: 'v2 board in KiCad', proof: '16 kHz PCM to offline speech-to-text',
    see: 'The speech band, 120 Hz to 8 kHz, walled off at 8 kHz by 16 kHz sampling.',
  },
  {
    slug: 'autoprime', status: 'work in progress', proof: '60 s a run; every prime it claims is checked',
    see: 'An Ulam spiral filling with only verified primes while a 60 s clock runs down.',
  },
]

// New since projects.ts was written, and rewrites of what has moved on (a slug here replaces its old entry).
const NEW: Work[] = [
  {
    slug: 'bleps',
    title: 'BLEPS',
    remarkable: 'Stanford SSI’s next satellite: a 1U CubeSat, 10 cm a side, with four cameras',
    years: '2026 –',
    numbers: [
      ['spacecraft', '1U, 10 × 10 × 11.35 cm, about 2 kg; planned for a 550 km circular orbit'],
      ['cameras', 'four, on one payload card round a Jetson Orin or a CM5'],
      ['downlink', 'esp-dvbs2 again: DVB-S2 from an ESP32-S3 at 2.4 GHz, through a GRF5526 PA'],
      ['beacon', 'LoRa at 433 MHz, SX1262'],
      ['pointing', 'reaction wheels on Finertia: 26 × 26 mm, 6 layers, an RP2350A driving a Faulhaber 2610'],
      ['status', 'in design for a 2027 flight; Finertia routed, the radio and payload boards being laid out'],
    ],
    body: [
      'Stanford SSI’s next satellite is a 1U CubeSat built round its cameras. It takes its name from Anableps, the four-eyed fish that sees above and below the waterline at once, and it has four cameras on one payload card. In the simulator its cameras are planned in, a pair of 190° fisheyes, back to back, stitch the whole sphere around it while a main camera looks down at Earth. Its pictures come down the way Pigeon Vision’s video does: esp-dvbs2, an ESP32-S3 making DVB-S2 out of its own Wi-Fi radio.',
      'River co-leads the satellite team and draws three of BLEPS’s boards. Finertia, the reaction wheel controller, bolts to the motor’s 26 mm flange: an RP2350A on CAN commutates a Faulhaber 2610 BLDC through a DRV8311P bridge, its phase currents Kelvin-sensed. To slew the 0.00496 kg·m² axis at 1°/s the wheel takes up 86.6 µN·m·s, 1 047 rpm of the bare rotor. Yapling, the radio board, carries the ESP32-S3 downlink, a 433 MHz LoRa beacon and an RP2350B that boots from MRAM. The payload card fits the four camera links round a Jetson Orin or a CM5.',
      'Its cameras and its links are planned in two simulators River wrote: Field of View flies the cameras over Stanford at 550 km and sends their video down a DVB-S2 link, and Yapling Observatory couples the orbit, radio, pointing, power and heat.',
    ],
    media: [
      { src: `${RAW}cubesat-imaging-sim/main/docs/media/space-over-the-bay.webp`, alt: 'A 1U above San Francisco Bay in the optical simulator, its 433 MHz tape antennas out and a lens’s field of view beyond the bus' },
      { src: `${SSI}Satellite-Avionics/feature/bleps-rotor-controller/project-janus/ADCS/rotor-controller/review/Reaction-Wheel-Controller-assembly.png`, alt: 'Finertia, the reaction wheel controller, on its Faulhaber 2610 motor, rendered from KiCad' },
      { src: `${SSI}Satellite-Avionics/feature/bleps-rotor-controller/project-janus/ADCS/rotor-controller/review/Finertia-routing.png`, alt: 'Finertia’s routing: six layers in 26 × 26 mm' },
    ],
    boards: ['finertia'],
    links: [
      ['Finertia', 'https://github.com/stanford-ssi/Satellite-Avionics/tree/feature/bleps-rotor-controller/project-janus/ADCS/rotor-controller'],
      ['optical simulator', 'https://rivercraft911.github.io/cubesat-imaging-sim/'],
      ['mission simulator', `${GH}yapling-observatory`],
    ],
    todo: [
      'is BLEPS public yet, and what of it may be shown? (Finertia is on a public stanford-ssi branch; the rest is from your SSI folders and repos)',
      'BLEPS or Hyperion? The payload fit study says “Project Hyperion/Bleps” and Field of View calls itself the optical simulator for Hyperion',
      'the four cameras: which lenses, and where? (the payload card has upper cameras A and B through the backplane and a lower “360 camera” and “second camera” direct; Field of View flies two 190° fisheyes and one main camera)',
      'your role in your words (satellite team co-lead; Finertia, Yapling and the payload card look like yours)',
      'may the 2027 flight target and the 550 km orbit be shown?',
      'the name: after Anableps, the four-eyed fish, as Finertia’s rear art suggests? And may that art (Anableps-Waterline-Eclipse) be shown?',
    ],
  },
  {
    slug: 'pigeon-vision',
    title: 'Pigeon Vision',
    remarkable: 'A hacked $5 ESP32-S3 rides an IREC rocket and sends both its cameras down live',
    years: '2026',
    numbers: [
      ['what flies', 'esp-dvbs2: an ESP32-S3 making DVB-S2 out of its own Wi-Fi radio'],
      ['downlink', 'QPSK 2/3 at 8 Msym/s, α 0.20, pilots: 9.6 MHz wide at 1.28 GHz'],
      ['to 1.28 GHz', 'the S3 at 2.42 GHz into an RFFC5072A, 3.70 GHz LO, I/Q conjugated'],
      ['PA', 'GRF5613 on its own board, planned for 1 W'],
      ['cameras', '2 × IMX900 under fisheyes, back to back, 30 frames/s, one 9 Mb/s transport stream'],
      ['on the bench', 'S3 to S3, 8PSK 3/4: 2.4 h on air, 5 725 408 frames, none failed'],
      ['boards', 'CM5 carrier, 6 layers, 144.78 mm round, Rev 1.1; Yapogee S3, 4 layers, 55 × 43 mm'],
    ],
    body: [
      'esp-dvbs2, flying. The ESP32-S3 that makes DVB-S2 out of its own Wi-Fi radio rides Stanford SSI’s IREC rocket and sends its video to the ground live. Two fisheye cameras look opposite ways; a CM5 encodes both into one MPEG transport stream and clocks it over SPI into the S3; on the ground the two views are stitched into a whole sphere, so anyone watching can look wherever they like.',
      'Yapogee S3 carries the S3. It makes DVB-S2 at 2.42 GHz, and an RFFC5072A mixes it with a 3.70 GHz LO down to 1.28 GHz. The LO sits above the signal, so the spectrum comes out mirrored, and the I/Q go out conjugated to mirror it back. A separate GRF5613 board is the PA. Round them is the carrier, a six-layer board 144.78 mm across for the CM5, both cameras, power and sensors: 148 parts and 645 filled and capped vias.',
      'The link already works end to end on the bench, one S3 to another through coax and 30 dB of attenuation: sixteen back-to-back 540 s runs, 2.4 hours on air, 5 725 408 frames decoded and none failed, both cameras at 30.0 frames/s. On the ground, an AntSDR E200 at 12 MS/s feeds a Mac that already decodes the flight profile from recorded samples. The carrier is released for fab and Yapogee S3 is routed; bring-up and the RF chain under power come next.',
    ],
    proof: [LIVE],
    boards: ['pigeon-carrier', 'yapogee-s3'],
    media: [{ src: `${RAW}esp-dvbs2/main/examples/live-video/bench.jpg`, alt: 'The live-video bench: the transmitting S3 by the cameras, coax and attenuator, the receiving S3 and its W5500' }],
    links: [
      ['source', 'https://github.com/stanford-ssi/PigeonVision'],
      ['flight demo', 'https://stanford-ssi.github.io/PigeonVision/'],
      ['live video on esp-dvbs2', `${GH}esp-dvbs2#live-video-one-s3-to-another`],
      ['the 2.4 hour run', `${GH}esp-dvbs2/blob/main/results/2026-10-23-live-demo/README.md`],
    ],
    todo: [
      'your role in your words (81 of the repo’s 84 commits are yours: the carrier, Yapogee S3, the flight and ground software)',
      'the flight: which IREC, and when (the page says only that it flies at IREC)',
      'the PA: 1 W at its output is hardware/rf-frontend’s planning target, and clean modulated 1 W is not yet qualified. Show it?',
      'photos of the real carrier and Yapogee S3 (the page shows their KiCad renders, both faces); flight footage when there is some',
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
    boards: ['heart'],
    media: [{ src: `${import.meta.env.BASE_URL}media/rava-heart/demo.mp4`, poster: `${import.meta.env.BASE_URL}media/rava-heart/demo.jpg`, video: true, size: [360, 398], alt: 'Two hearts in River’s hands, beating in sync' }],
    links: [['source', `${GH}rava-heart`], ['simulator', `${GH}rava-heart/tree/main/firmware/simulator`]],
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
    boards: ['gnss'],
    media: [
      { src: `${RAW}Ephemeris-1/main/docs/software/measurements/cttc/separation.png`, alt: 'Horizontal, vertical and 3D separation between the Pico’s fixes and GNSS-SDR’s on the same rooftop recording' },
    ],
    links: [['source', `${GH}Ephemeris-1`], ['assembly BOM', 'https://rivercraft911.github.io/Ephemeris-1/assembly/ibom.html']],
  },
  {
    slug: 'strobeglasses',
    title: 'Strobe Glasses',
    remarkable: 'Open-source strobe glasses: LCD shutters at 2 to 20 frames/s, from one ATtiny402',
    years: '2025 – 2026',
    numbers: [
      ['rate', '2, 4, 5, 6, 8, 10, 15 or 20 frames/s'],
      ['dark', '20 to 80 % of each frame, in steps of 10'],
      ['presets', 'Light 6 frames/s at 40 %, Balanced 5 at 50 %, Heavy 4 at 60 %, and a Custom one'],
      ['eyes', 'together, or alternating half a frame apart'],
      ['drive', '±3.3 V flipped every 5 ms through each dark window: never DC on the liquid crystal'],
      ['lenses', 'Adafruit 3627 LCD light valves, top-loaded into a printed frame'],
      ['board', '41.2 × 15.25 mm, 2 layers: ATtiny402 at 5 MHz, USB-C charging, a 40 mAh LiPo'],
      ['released', 'MK1, 19 Nov 2026: KiCad, firmware, STEP and STLs, MIT'],
    ],
    body: [
      'Strobe glasses for visual reaction-time training, open source, to take on the expensive ones. An LCD light valve slides down into each rim of a printed frame and switches between clear and dark. One button runs it: a tap cycles the presets, a hold edits the rate and darkness of a custom one, and a double tap sets the eyes going together or alternating, the right half a frame behind the left. At 5 frames/s and 50 % dark the left eye goes dark for 100 ms, then the right for 100 ms.',
      'A liquid crystal must never sit on DC, so the ATtiny402’s timer cuts every dark window into balanced pairs near 100 Hz, +3.3 V then −3.3 V for 5 ms each, and stopping finishes the pair and drives both leads low. Left floating, a valve’s voltage takes 477 ms to fall from 90 % to 10 %; shorting its leads clears it far faster. The settings survive power cycles.',
      'MK1 is released, and River is building the first pair: the KiCad board and its BOM, the firmware, and a top-loading frame and brow cover to print in PETG or resin, held on by two screws from above.',
    ],
    media: [
      { src: `${RAW}strobeGlasses/main/assets/strobe-glasses.gif`, alt: 'MK1, rendered, both lenses switching between dark and clear' },
      { src: `${RAW}strobeGlasses/main/mechanical/top-load-brow.png`, alt: 'The swept brow: a recessed screw, and the four lens wires through the shoulder guide' },
      { src: `${RAW}strobeGlasses/main/assets/lcd-5v-psu-off.png`, alt: 'Voltage across one LCD valve after the 5 V supply turns off: 477 ms from 90 % to 10 %' },
    ],
    boards: ['strobe'],
    links: [
      ['source', `${GH}strobeGlasses`],
      ['firmware and controls', `${GH}strobeGlasses/tree/main/firmware/strobe_glasses`],
      ['print and assemble', `${GH}strobeGlasses/blob/main/mechanical/TOP_LOAD.md`],
    ],
    todo: [
      'a photo of the real glasses once built (the GIF and the JPG are renders)',
      'optical numbers: how dark is dark, and how fast a driven valve clears (only the 477 ms floating decay is measured)',
    ],
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
      'Fly a 1U CubeSat over Stanford, change lenses, aim the fisheye pair, and set the full-resolution frame beside the video that arrives over the downlink. Built for Stanford SSI, to choose the cameras of its next satellite, BLEPS.',
      'Frames are rendered at the sensor’s native resolution from real imagery, blurred by the lens’s Airy core, pointing jitter and exposure smear, then really encoded by the browser and queued against the link’s payload rate, B η / (1 + α) × (1 − r). Dropped chunks and late keyframes look the way they would.',
    ],
    media: [
      { src: `${RAW}cubesat-imaging-sim/main/docs/media/stanford-daylight-pass.webp`, alt: 'A daylight pass: the stitched panorama, and the 50 mm camera looking straight down' },
    ],
    links: [['open the simulator', 'https://rivercraft911.github.io/cubesat-imaging-sim/'], ['source', `${GH}cubesat-imaging-sim`]],
    todo: ['its page calls it the “Optical Simulator for Hyperion”: may it be named as BLEPS’s?'],
  },
  {
    slug: 'primesf',
    title: 'Primorial',
    remarkable: 'A hunt for a new prime of 100 million digits, proved on a home machine',
    years: '2026',
    numbers: [
      ['goal', 'a new prime of at least 10⁸ decimal digits, independently verified'],
      ['target', '100× the verified discoveries per device-hour of a matched GIMPS search'],
      ['first region', 'Mersenne exponents near 149.5 million, past the record; 3 250 untested on 21 Nov 2026'],
      ['one test there', '149 500 003 squarings at 4.907 ms each: 8.49 days on one M4 Pro'],
      ['proofs', 'PRP proofs made and independently checked on M1279 and M1283'],
    ],
    body: [
      'Can a new way of building numbers find a prime of at least 100 million digits, and prove it, on a home machine or a small cluster? Each experiment keeps its proof, its code and its measurements together, and the ones that failed are written down as results, with what would reopen them.',
      'The baseline is the Mersenne search, and its first region is measured: exponents near 149.5 million, past the current record, where one probable-prime test is 149 500 003 squarings at 4.907 ms each, 8.49 days of arithmetic on one M4 Pro. Every challenger is charged everything, sieving and proofs included, and has to beat that per verified discovery.',
    ],
    media: [],
    links: [],
    todo: ['PrimesF is private: link it once it is public', 'its name on the page: Primorial (the README’s) or PrimesF?'],
  },
]

export const WORKS: Record<string, Work> = Object.fromEntries([...PROJECTS, ...NEW].map((w) => [w.slug, w]))

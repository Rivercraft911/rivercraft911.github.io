// The fall's clock. From the falls on the choir sings on its own clock T (choir.ts), and every scene from
// the wrap on is placed on it, each starting where the one before ends. Each length is held here once and
// every start is derived from them, so lengthening a scene moves all that follows, the choir's END with
// it. It imports nothing, so any scene can import it.

export const SING = -1.2 // on the valley's clock: T = 0, where the choirs begin to sing
// how long each scene runs
export const VALLEY = 20.3, WRAP = 2.5, ASCII = 3.5, INDRA = 3, ZOOM = 7.2, OPHANIM = 2.5
// the stutter's cuts, faster and faster (stutter.ts): ten worlds, then six of them again, faster
export const LENGTHS = [1.01, 0.95, 0.85, 0.78, 0.72, 0.68, 0.64, 0.6, 0.6, 0.6, 0.46, 0.4, 0.36, 0.34, 0.34, 0.34]
export const STUTTER = LENGTHS.reduce((a, b) => a + b, 0)
export const PEAK = 7.2 // the finale's horizon, on its own clock: one flash, then silence

// Where each begins on the choir's clock: the wrap (R0, after LEAD seconds of falling; the ASCII, R1,
// follows it), Indra (R3), the stutter (R4), the long zoom (RZ), the ophanim (R5) and the singularity (R6, finaleA).
export const LEAD = VALLEY - SING, R3 = LEAD + WRAP + ASCII, R4 = R3 + INDRA, RZ = R4 + STUTTER, R5 = RZ + ZOOM, R6 = R5 + OPHANIM
// The cut to silence, and the 0.3 s sing() fades over (choir.ts), so it is cut at its loudest.
export const END = R6 + PEAK + 0.3

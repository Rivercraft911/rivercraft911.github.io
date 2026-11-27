// The fall's clock. From the falls on the choir sings on its own clock T (choir.ts), and every scene from
// the wrap on is placed on it, each starting where the one before ends. Each length is held here once and
// every start is derived from them, so lengthening a scene moves all that follows, the choir's END with
// it. It imports nothing, so any scene can import it.

export const SING = -1.2 // on the valley's clock: T = 0, where the choirs begin to sing
// how long each scene runs
export const VALLEY = 16.8, WRAP = 2.5, ASCII = 3.5, REVEAL = 7
// the tour's cuts through River's places (tour.ts), faster and faster: once round, then round again faster
export const CUTS = [1.0, 0.9, 0.8, 0.75, 0.7, 0.65, 0.6, 0.45, 0.4, 0.36, 0.34, 0.3, 0.3, 0.3]
export const TOUR = CUTS.reduce((a, b) => a + b, 0)

// Where each begins on the choir's clock: the wrap (after LEAD seconds of falling; the ASCII follows it), the
// tour (R3) and the reveal (RV), which climbs out of the storm until the planet hangs whole.
export const LEAD = VALLEY - SING, R3 = LEAD + WRAP + ASCII, RV = R3 + TOUR
// The cut to silence as the planet comes whole, and the 0.3 s sing() fades over (choir.ts), so it is cut at its loudest.
export const END = RV + REVEAL

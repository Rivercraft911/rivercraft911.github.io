// The fall's clock. From the falls on the choir sings on its own clock T (choir.ts), and every scene from
// the wrap on is placed on it, each starting where the one before ends. Each length is held here once and
// every start is derived from them, so lengthening a scene moves all that follows, the choir's END with
// it. It imports nothing, so any scene can import it.

export const SING = -1.2 // on the valley's clock: T = 0, where the choirs begin to sing
// how long each scene runs
export const VALLEY = 16.8, WRAP = 2.5, ASCII = 3.5, ARRIVE = 15

// Where each begins on the choir's clock: the wrap (after LEAD seconds of falling; the ASCII follows it), and the
// arrival (RA), out of the drain's dark into the planet's air and up until it hangs whole.
export const LEAD = VALLEY - SING, RA = LEAD + WRAP + ASCII
// The choir's end, as the planet comes whole and the world takes over.
export const END = RA + ARRIVE

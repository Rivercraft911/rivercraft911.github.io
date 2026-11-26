// The GPS C/A codes (IS-GPS-200): G1 = 1 + x³ + x¹⁰ and G2 = 1 + x² + x³ + x⁶ + x⁸ + x⁹ + x¹⁰ from all ones, G2 read
// at each PRN's two phase taps. CODES[i] is PRN i + 1, 1023 chips of 0 and 1.
const TAPS = [[2, 6], [3, 7], [4, 8], [5, 9], [1, 9], [2, 10], [1, 8], [2, 9], [3, 10], [2, 3], [3, 4], [5, 6], [6, 7], [7, 8], [8, 9], [9, 10], [1, 4], [2, 5], [3, 6], [4, 7], [5, 8], [6, 9], [1, 3], [4, 6]]
export const CODES = TAPS.map(([a, b]) => {
  const g1 = new Uint8Array(11).fill(1), g2 = new Uint8Array(11).fill(1), c = new Uint8Array(1023)
  for (let i = 0; i < 1023; i++) {
    c[i] = g1[10] ^ g2[a] ^ g2[b]
    const f1 = g1[3] ^ g1[10], f2 = g2[2] ^ g2[3] ^ g2[6] ^ g2[8] ^ g2[9] ^ g2[10]
    g1.copyWithin(2, 1, 10), g2.copyWithin(2, 1, 10)
    g1[1] = f1, g2[1] = f2
  }
  return c
})
export const L1 = 1575.42e6, CHIPS = 1.023e6 // the carrier, Hz; the chipping rate, chips/s

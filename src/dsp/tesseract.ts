// The 4-cube: 16 vertices, 32 edges, rotated in the xw and yz planes and projected 4D → 3D → 2D.
export const VERTS = Array.from({ length: 16 }, (_, i) => [0, 1, 2, 3].map((b) => ((i >> b) & 1) * 2 - 1))
export const EDGES: [number, number][] = []
for (let i = 0; i < 16; i++) for (let b = 0; b < 4; b++) if (!(i & (1 << b))) EDGES.push([i, i | (1 << b)])

// out receives x, y and the rotated w (depth into the fourth dimension) per vertex.
export function project(xw: number, yz: number, zw: number, scale: number, out: Float64Array) {
  const [c1, s1, c2, s2, c3, s3] = [Math.cos(xw), Math.sin(xw), Math.cos(yz), Math.sin(yz), Math.cos(zw), Math.sin(zw)]
  VERTS.forEach(([x, y, z, w], i) => {
    ;[x, w] = [x * c1 - w * s1, x * s1 + w * c1]
    ;[y, z] = [y * c2 - z * s2, y * s2 + z * c2]
    ;[z, w] = [z * c3 - w * s3, z * s3 + w * c3]
    const k4 = 1 / (2.6 - w), k3 = scale / (3.4 - z * k4)
    out[3 * i] = x * k4 * k3
    out[3 * i + 1] = y * k4 * k3
    out[3 * i + 2] = w
  })
}

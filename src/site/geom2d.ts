/**
 * Small plane-geometry helpers shared across sections (R11.3). Any units,
 * any frame: a point is a pair of numbers (x, z in a building, x, n on the
 * site, x, y on a sheet).
 */
export type XY = readonly [number, number]

/** Even-odd test of a point against a closed outline. A point on a bottom or left edge counts as inside, on a top or right edge as outside. */
export function pointInPolygon(poly: readonly XY[], x: number, z: number): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i]
    const [xj, zj] = poly[j]
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside
  }
  return inside
}

/**
 * Distance from a point to a segment; a zero-length segment measures to its
 * point. Written as `p - a - d t`: some copies elsewhere write `p - (a + t d)`,
 * which can differ in the last bits, so they were left as they are.
 */
export function pointSegmentDistance(p: XY, a: XY, b: XY): number {
  const dx = b[0] - a[0]
  const dz = b[1] - a[1]
  const L2 = dx * dx + dz * dz
  const t = L2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / L2)) : 0
  return Math.hypot(p[0] - a[0] - dx * t, p[1] - a[1] - dz * t)
}

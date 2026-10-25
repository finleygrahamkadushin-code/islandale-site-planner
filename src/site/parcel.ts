import type { Parcel, SitePoint } from './types'

/** Shoelace area of a closed ring, in the ring's own square units. */
export function ringArea(ring: readonly SitePoint[]): number {
  let twice = 0
  for (let i = 0; i < ring.length; i++) {
    const [x1, n1] = ring[i]
    const [x2, n2] = ring[(i + 1) % ring.length]
    twice += x1 * n2 - x2 * n1
  }
  return Math.abs(twice) / 2
}

export function isShorelineEdge(parcel: Parcel, edgeIndex: number): boolean {
  const { first, last } = parcel.shorelineEdges
  return edgeIndex >= first && edgeIndex <= last
}

/** Ring edges as [from, to] pairs, in order. */
export function ringEdges(ring: readonly SitePoint[]): readonly (readonly [SitePoint, SitePoint])[] {
  return ring.map((p, i) => [p, ring[(i + 1) % ring.length]] as const)
}

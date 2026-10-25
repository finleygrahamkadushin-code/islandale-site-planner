import terrainJson from '../../data/islandale/terrain.json'
import parcelJson from '../../data/islandale/parcel.json'
import { ftToM } from './units'
import type { Parcel, Site, SitePoint, Terrain } from './types'

/**
 * The Islandale lot on Lopez Island, as extracted from the legacy planner.
 * Elevations in the JSON are feet NAVD88 and are converted to metres here;
 * everything else is already metres in the site frame.
 */
export function loadIslandaleTerrain(): Terrain {
  const { nx, ny, spacing, z } = terrainJson
  if (z.length !== nx * ny) {
    throw new Error(`terrain.json: expected ${nx * ny} samples, found ${z.length}`)
  }
  return {
    lon0: terrainJson.lon0,
    lat0: terrainJson.lat0,
    spacing,
    nx,
    ny,
    x0: (-(nx - 1) / 2) * spacing,
    n0: (-(ny - 1) / 2) * spacing,
    z: z.map(ftToM),
  }
}

export function loadIslandaleParcel(): Parcel {
  const ring = parcelJson.ring.map(([x, n]) => [x, n] as const satisfies SitePoint)
  if (ring.length < 3) throw new Error('parcel.json: ring needs at least 3 vertices')
  return { ring, lotSqFt: parcelJson.lotSqFt, shorelineEdges: parcelJson.shorelineEdges }
}

export function loadIslandale(): Site {
  return { name: 'Islandale', terrain: loadIslandaleTerrain(), parcel: loadIslandaleParcel() }
}

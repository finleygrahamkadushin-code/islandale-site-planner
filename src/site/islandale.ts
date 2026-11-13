import terrainJson from '../../data/islandale/terrain.json'
import parcelJson from '../../data/islandale/parcel.json'
import { highWaterLine } from './highWater'
import { elevationAt } from './terrain'
import type { Parcel, Site, SitePoint, Terrain } from './types'

/**
 * The Islandale lot on Lopez Island, as extracted from the legacy planner.
 * Everything is metres: positions in the site frame, elevations NAVD88.
 * (The legacy grid stores metres; its fmtFt() converts them for display.)
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
    z: [...z],
  }
}

export function loadIslandaleParcel(): Parcel {
  const ring = parcelJson.ring.map(([x, n]) => [x, n] as const satisfies SitePoint)
  if (ring.length < 3) throw new Error('parcel.json: ring needs at least 3 vertices')
  return { ring, lotSqFt: parcelJson.lotSqFt, shorelineEdges: parcelJson.shorelineEdges }
}

export function loadIslandale(): Site {
  const terrain = loadIslandaleTerrain()
  const lot = loadIslandaleParcel()
  // the bare ground (no earthworks): the high-water line is where the land meets 8 ft before anything is built
  const parcel = { ...lot, highWater: highWaterLine(lot, (x, n) => elevationAt(terrain, x, n)) }
  return { name: 'Islandale', terrain, parcel }
}

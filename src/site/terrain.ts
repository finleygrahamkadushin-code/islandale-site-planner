import type { Terrain } from './types'

export interface TerrainBounds {
  readonly minX: number
  readonly maxX: number
  readonly minN: number
  readonly maxN: number
  readonly minZ: number
  readonly maxZ: number
}

export function terrainBounds(t: Terrain): TerrainBounds {
  let minZ = Infinity
  let maxZ = -Infinity
  for (const z of t.z) {
    if (z < minZ) minZ = z
    if (z > maxZ) maxZ = z
  }
  return {
    minX: t.x0,
    maxX: t.x0 + (t.nx - 1) * t.spacing,
    minN: t.n0,
    maxN: t.n0 + (t.ny - 1) * t.spacing,
    minZ,
    maxZ,
  }
}

/**
 * Bilinear ground elevation at a site point, metres. Points outside the grid
 * are clamped to its edge, matching the legacy planner's behaviour.
 */
export function elevationAt(t: Terrain, x: number, n: number): number {
  const fx = clamp((x - t.x0) / t.spacing, 0, t.nx - 1.001)
  const fy = clamp((n - t.n0) / t.spacing, 0, t.ny - 1.001)
  const i = Math.floor(fx)
  const j = Math.floor(fy)
  const tx = fx - i
  const ty = fy - j
  const k = j * t.nx + i
  const z00 = t.z[k]
  const z10 = t.z[k + 1]
  const z01 = t.z[k + t.nx]
  const z11 = t.z[k + t.nx + 1]
  return (z00 * (1 - tx) + z10 * tx) * (1 - ty) + (z01 * (1 - tx) + z11 * tx) * ty
}

/** Site coordinates of a grid sample. */
export function samplePosition(t: Terrain, col: number, row: number): readonly [number, number] {
  return [t.x0 + col * t.spacing, t.n0 + row * t.spacing]
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v))

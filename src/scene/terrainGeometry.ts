import { BufferAttribute, BufferGeometry } from 'three'
import type { Terrain } from '../site/types'
import { samplePosition } from '../site/terrain'
import { toScene } from './frame'

/**
 * Indexed grid mesh of the terrain in scene coordinates, with normals and
 * UVs measured in metres (u east, v north) so textures can be true size.
 */
export function buildTerrainGeometry(t: Terrain): BufferGeometry {
  const count = t.nx * t.ny
  const positions = new Float32Array(count * 3)
  const uvs = new Float32Array(count * 2)
  for (let row = 0; row < t.ny; row++) {
    for (let col = 0; col < t.nx; col++) {
      const k = row * t.nx + col
      const [x, n] = samplePosition(t, col, row)
      const [sx, sy, sz] = toScene(x, n, t.z[k])
      positions.set([sx, sy, sz], k * 3)
      uvs.set([x, n], k * 2)
    }
  }
  const indices = new Uint32Array((t.nx - 1) * (t.ny - 1) * 6)
  let q = 0
  for (let row = 0; row < t.ny - 1; row++) {
    for (let col = 0; col < t.nx - 1; col++) {
      const a = row * t.nx + col
      const b = a + 1
      const c = a + t.nx
      const d = c + 1
      // Counter-clockwise seen from above (+y) so the top face is the front face.
      indices.set([a, b, c, b, d, c], q)
      q += 6
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new BufferAttribute(uvs, 2))
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(count * 3).fill(1), 3))
  geometry.setIndex(new BufferAttribute(indices, 1))
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()
  return geometry
}

const GRASS = [0.42, 0.5, 0.3] as const
const DRY_GRASS = [0.56, 0.55, 0.38] as const
const BEACH = [0.62, 0.58, 0.5] as const
const WET = [0.38, 0.36, 0.32] as const
/** Above this, feet NAVD88, it is meadow; below, beach gravel (roughly the old planner's OHWM band). */
const BEACH_TOP_FT = 11
const BLEND_FT = 1.5

/**
 * Ground colours by elevation and tide: meadow on top, drier grass on the
 * slope, gravel beach below the high-water band, wet beach just above the water.
 */
export function colourTerrain(geometry: BufferGeometry, t: Terrain, tideFt: number): void {
  const colors = geometry.getAttribute('color') as BufferAttribute
  const normals = geometry.getAttribute('normal') as BufferAttribute
  for (let k = 0; k < t.z.length; k++) {
    const ft = t.z[k] / 0.3048
    const slope = 1 - normals.getY(k)
    const grass = mix(GRASS, DRY_GRASS, smooth(0.05, 0.25, slope))
    const shore = mix(WET, BEACH, smooth(tideFt, tideFt + BLEND_FT, ft))
    const c = mix(shore, grass, smooth(BEACH_TOP_FT - BLEND_FT, BEACH_TOP_FT + BLEND_FT, ft))
    colors.setXYZ(k, c[0], c[1], c[2])
  }
  colors.needsUpdate = true
}

function smooth(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

function mix(a: readonly number[], b: readonly number[], t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

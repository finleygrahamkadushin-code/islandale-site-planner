import { BufferAttribute, BufferGeometry, Color } from 'three'
import type { Terrain } from '../site/types'
import { samplePosition } from '../site/terrain'
import { sampleTint, type CellRect, type EarthField } from '../site/earthworks'
import { toScene } from './frame'

const inRect = (r: CellRect, col: number, row: number) => col >= r.c0 && col < r.c1 && row >= r.r0 && row < r.r1

/**
 * Indexed grid mesh of the terrain in scene coordinates, with normals and
 * UVs measured in metres (u east, v north) so textures can be true size.
 * Cells inside `skip` are left out: a finer earthworks patch draws them.
 */
export function buildTerrainGeometry(t: Terrain, skip: readonly CellRect[] = []): BufferGeometry {
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
      if (skip.some((r) => inRect(r, col, row))) continue
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
  geometry.setIndex(new BufferAttribute(indices.slice(0, q), 1))
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()
  return geometry
}

/**
 * The fine mesh of one earthworks patch, one vertex per raster sample. Its
 * border runs along terrain grid lines and stays on the survey, where the
 * coarse mesh is exactly the bilinear survey, so the seam is closed. Each
 * vertex's earthworks tint (linear rgb and amount) rides in userData.tint.
 */
export function buildPatchGeometry(f: EarthField): BufferGeometry {
  const nx = f.ni + 1
  const ny = f.nj + 1
  const positions = new Float32Array(nx * ny * 3)
  const uvs = new Float32Array(nx * ny * 2)
  const tints = new Float32Array(nx * ny * 4)
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const v = j * nx + i
      const x = f.x0 + i * f.h
      const n = f.n0 + j * f.h
      positions.set(toScene(x, n, f.z[v]), v * 3)
      uvs.set([x, n], v * 2)
      const t = sampleTint(f, v)
      if (t) tints.set([...linear(t.colour), t.amount], v * 4)
    }
  }
  const indices = new Uint32Array(f.ni * f.nj * 6)
  let q = 0
  for (let j = 0; j + 1 < ny; j++) {
    for (let i = 0; i + 1 < nx; i++) {
      const a = j * nx + i
      indices.set([a, a + 1, a + nx, a + 1, a + nx + 1, a + nx], q)
      q += 6
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setAttribute('uv', new BufferAttribute(uvs, 2))
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(nx * ny * 3).fill(1), 3))
  geometry.setIndex(new BufferAttribute(indices, 1))
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()
  geometry.userData.tint = tints
  return geometry
}

const linearCache = new Map<string, readonly [number, number, number]>()
/** A '#rrggbb' colour in the renderer's linear working space, as vertex colours are read. */
function linear(hex: string): readonly [number, number, number] {
  const hit = linearCache.get(hex)
  if (hit) return hit
  const c = new Color(hex)
  const rgb = [c.r, c.g, c.b] as const
  linearCache.set(hex, rgb)
  return rgb
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
 * slope, gravel beach below the high-water band, wet beach just above the water;
 * then, on an earthworks patch, blended toward its berm, court, bank, mud or
 * wet-margin tint (legacy earthColor).
 */
export function colourTerrain(geometry: BufferGeometry, tideFt: number): void {
  const colors = geometry.getAttribute('color') as BufferAttribute
  const normals = geometry.getAttribute('normal') as BufferAttribute
  const positions = geometry.getAttribute('position') as BufferAttribute
  const tint = geometry.userData.tint as Float32Array | undefined
  for (let k = 0; k < positions.count; k++) {
    const ft = positions.getY(k) / 0.3048
    const slope = 1 - normals.getY(k)
    const grass = mix(GRASS, DRY_GRASS, smooth(0.05, 0.25, slope))
    const shore = mix(WET, BEACH, smooth(tideFt, tideFt + BLEND_FT, ft))
    const ground = mix(shore, grass, smooth(BEACH_TOP_FT - BLEND_FT, BEACH_TOP_FT + BLEND_FT, ft))
    const c = tint && tint[k * 4 + 3] > 0 ? mix(ground, tint.subarray(k * 4, k * 4 + 3), tint[k * 4 + 3]) : ground
    colors.setXYZ(k, c[0], c[1], c[2])
  }
  colors.needsUpdate = true
}

function smooth(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

function mix(a: ArrayLike<number>, b: ArrayLike<number>, t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

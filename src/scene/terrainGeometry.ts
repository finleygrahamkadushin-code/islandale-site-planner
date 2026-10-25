import { BufferAttribute, BufferGeometry } from 'three'
import type { Terrain } from '../site/types'
import { samplePosition } from '../site/terrain'
import { toScene } from './frame'

/** Indexed grid mesh of the terrain in scene coordinates, with normals. */
export function buildTerrainGeometry(t: Terrain): BufferGeometry {
  const positions = new Float32Array(t.nx * t.ny * 3)
  for (let row = 0; row < t.ny; row++) {
    for (let col = 0; col < t.nx; col++) {
      const k = row * t.nx + col
      const [x, n] = samplePosition(t, col, row)
      const [sx, sy, sz] = toScene(x, n, t.z[k])
      positions[k * 3] = sx
      positions[k * 3 + 1] = sy
      positions[k * 3 + 2] = sz
    }
  }
  const quads = (t.nx - 1) * (t.ny - 1)
  const indices = new Uint32Array(quads * 6)
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
  geometry.setIndex(new BufferAttribute(indices, 1))
  geometry.computeVertexNormals()
  geometry.computeBoundingSphere()
  return geometry
}

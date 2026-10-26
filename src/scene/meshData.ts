import { BufferAttribute, BufferGeometry } from 'three'
import type { MeshData } from '../buildings/geom'

export function toGeometry(m: MeshData): BufferGeometry {
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(m.positions), 3))
  g.setAttribute('normal', new BufferAttribute(new Float32Array(m.normals), 3))
  g.setAttribute('uv', new BufferAttribute(new Float32Array(m.uvs), 2))
  g.computeBoundingSphere()
  return g
}

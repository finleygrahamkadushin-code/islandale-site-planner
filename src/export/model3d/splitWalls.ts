import { BufferAttribute, BufferGeometry } from 'three'

/**
 * A wall mesh drawn as one geometry for several walls (WallPart joins the
 * walls sharing a finish, `userData.faceEdges` giving each triangle's wall)
 * split into one geometry per wall, so Blender gets one mesh per outline
 * edge. Every attribute is copied triangle by triangle; the source is left
 * as it was. Returns edges in ascending order.
 */
export function splitByFaceEdges(source: BufferGeometry, faceEdges: readonly number[]): { readonly edge: number; readonly geometry: BufferGeometry }[] {
  const g = source.index ? source.toNonIndexed() : source
  const triangles = g.getAttribute('position').count / 3
  if (faceEdges.length !== triangles) throw new Error(`wall mesh has ${triangles} triangles but ${faceEdges.length} face edges`)
  const byEdge = new Map<number, number[]>()
  faceEdges.forEach((edge, t) => byEdge.set(edge, [...(byEdge.get(edge) ?? []), t]))
  return [...byEdge.keys()]
    .sort((a, b) => a - b)
    .map((edge) => ({ edge, geometry: pickTriangles(g, byEdge.get(edge) ?? []) }))
}

function pickTriangles(g: BufferGeometry, tris: readonly number[]): BufferGeometry {
  const out = new BufferGeometry()
  for (const [name, attr] of Object.entries(g.attributes)) {
    const size = attr.itemSize
    const data = new Float32Array(tris.length * 3 * size)
    tris.forEach((t, i) => {
      for (let v = 0; v < 3; v++) for (let c = 0; c < size; c++) data[(i * 3 + v) * size + c] = attr.getComponent(t * 3 + v, c)
    })
    out.setAttribute(name, new BufferAttribute(data, size))
  }
  return out
}

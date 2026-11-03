import { ExtrudeGeometry, Shape } from 'three'
import { localFootprint, type FootprintParams } from '../buildings/footprint'
import { ftToM } from '../site/units'

/**
 * Prism of a footprint in the object's scene-local frame: x east, y up,
 * z = the front (toward the bay at rotation 0). Base at y = 0.
 */
export function buildPrismGeometry(p: FootprintParams, heightM: number): ExtrudeGeometry {
  const shape = new Shape()
  const poly = localFootprint(p)
  poly.forEach(([lx, lz], i) => {
    // Shape lies in XY and extrudes along +Z; rotating by -90° about X then
    // maps (x, y, z) → (x, z, -y), so put the front (+lz) at shape y = -lz.
    const x = ftToM(lx)
    const y = -ftToM(lz)
    if (i === 0) shape.moveTo(x, y)
    else shape.lineTo(x, y)
  })
  shape.closePath()
  const geometry = new ExtrudeGeometry(shape, { depth: heightM, bevelEnabled: false })
  geometry.rotateX(-Math.PI / 2)
  geometry.computeVertexNormals()
  return geometry
}

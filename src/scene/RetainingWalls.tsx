import { useEffect, useMemo } from 'react'
import { BufferGeometry, Color, Float32BufferAttribute, Vector3 } from 'three'
import { WALL_THICKNESS_M, type RetainingWall, type WallMaterial } from '../site/earthworks'
import type { SitePoint } from '../site/types'
import { toScene } from './frame'
import { Surface } from './Surface'
import { seededRandom, treeSeed } from './treeShapes'
import { useDisplayStyle } from './useDisplayStyle'
import { useEarthworks } from './useEarthworks'

const FT = 0.3048
/** Legacy earthRetaining colours: face and cap, stone or concrete. */
const FACE: Readonly<Record<WallMaterial, string>> = { stone: '#6f695f', concrete: '#8c8a84' }
const CAP: Readonly<Record<WallMaterial, string>> = { stone: '#8a8478', concrete: '#a19f98' }
const MATERIALS: readonly WallMaterial[] = ['stone', 'concrete']
/** Each run of face is shaded 0.9 to 1.1 of its colour, seeded by the building (legacy). */
const SHADE_SPREAD = 0.2
/** Wall thickness in feet, for the cap and end UVs. */
const THICK_FT = WALL_THICKNESS_M / FT

/** Retaining walls along the deep edges of every sunk building's cut, stone or concrete. */
export function RetainingWalls() {
  const style = useDisplayStyle()
  const { works } = useEarthworks()
  const meshes = useMemo(
    () => MATERIALS.flatMap((material) => {
      const walls = works.walls.filter((w) => w.material === material)
      return walls.length ? [{ material, geometry: retainingWallGeometry(walls) }] : []
    }),
    [works.walls],
  )
  useEffect(() => () => meshes.forEach((m) => m.geometry.dispose()), [meshes])
  if (!meshes.length) return null
  return (
    <group name="retaining-walls">
      {meshes.map(({ material, geometry }) => (
        <mesh key={material} geometry={geometry} castShadow receiveShadow>
          <Surface kind="wall" style={style} texture={material} vertexColors diagramColor="#bdbab2" />
        </mesh>
      ))}
    </group>
  )
}

type V = readonly [number, number, number]

/**
 * One geometry for a set of walls: per run of wall, the face toward the
 * cut, the cap, the face into the bank and the two ends, as flat-shaded
 * quads in scene coordinates, with UVs in feet (along the wall, up it) and
 * the legacy face and cap colours as vertex colours.
 */
export function retainingWallGeometry(walls: readonly RetainingWall[]): BufferGeometry {
  const pos: number[] = []
  const uv: number[] = []
  const col: number[] = []
  const linear = (hex: string) => new Color(hex)
  const quad = (q: readonly [V, V, V, V], uvs: readonly [number, number][], c: Color, facing: V) => {
    const [a, b, d] = [new Vector3(...q[0]), new Vector3(...q[1]), new Vector3(...q[2])]
    const n = b.clone().sub(a).cross(d.clone().sub(a))
    // wind each quad to face the way it should, whatever way round the wall was traced
    const order = n.dot(new Vector3(...facing)) >= 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]
    for (const i of order) {
      pos.push(...q[i])
      uv.push(...uvs[i])
      col.push(c.r, c.g, c.b)
    }
  }
  for (const w of walls) {
    const rnd = seededRandom(treeSeed(w.id) * 131 + 7)
    const face = linear(FACE[w.material])
    const cap = linear(CAP[w.material])
    const S = ([x, n]: SitePoint, z: number): V => toScene(x, n, z)
    let along = 0
    for (let q = 0; q + 1 < w.pts.length; q++) {
      const [a, b, ao, bo] = [w.pts[q], w.pts[q + 1], w.outer[q], w.outer[q + 1]]
      const [ta, tb, f] = [w.tops[q], w.tops[q + 1], w.foot]
      const len = Math.hypot(b[0] - a[0], b[1] - a[1])
      const [u0, u1] = [along / FT, (along + len) / FT]
      along += len
      const shade = face.clone().multiplyScalar(1 - SHADE_SPREAD / 2 + rnd() * SHADE_SPREAD)
      // the outward normal (into the bank) of this run, in scene coordinates
      const out: V = [ao[0] - a[0], 0, -(ao[1] - a[1])]
      const inward: V = [-out[0], 0, -out[2]]
      quad([S(a, f), S(b, f), S(b, tb), S(a, ta)], [[u0, f / FT], [u1, f / FT], [u1, tb / FT], [u0, ta / FT]], shade, inward)
      quad([S(a, ta), S(b, tb), S(bo, tb), S(ao, ta)], [[u0, 0], [u1, 0], [u1, THICK_FT], [u0, THICK_FT]], cap, [0, 1, 0])
      quad([S(ao, ta), S(bo, tb), S(bo, f), S(ao, f)], [[u0, ta / FT], [u1, tb / FT], [u1, f / FT], [u0, f / FT]], shade, out)
    }
    // the two ends
    const last = w.pts.length - 1
    for (const [i, j] of [[0, 1], [last, last - 1]] as const) {
      const [a, ao, ta, f] = [w.pts[i], w.outer[i], w.tops[i], w.foot]
      const away: V = [a[0] - w.pts[j][0], 0, -(a[1] - w.pts[j][1])]
      quad([S(a, f), S(ao, f), S(ao, ta), S(a, ta)], [[0, f / FT], [THICK_FT, f / FT], [THICK_FT, ta / FT], [0, ta / FT]], face, away)
    }
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2))
  g.setAttribute('color', new Float32BufferAttribute(col, 3))
  g.computeVertexNormals()
  g.computeBoundingSphere()
  return g
}

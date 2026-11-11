import { useEffect, useMemo } from 'react'
import { BufferAttribute, BufferGeometry } from 'three'
import { localToSite } from '../../buildings/footprint'
import { boulderRocks, objectSeed, rockSeat } from './siteObjects'
import { usePlanStore } from '../../store/planStore'
import type { PlanObject } from '../../store/types'
import { toScene } from '../../scene/frame'
import { baseElevation } from '../../scene/placement'
import { Surface } from '../../scene/Surface'
import { useDisplayStyle } from '../../scene/useDisplayStyle'
import { useEarthworks } from '../earthworks/useEarthworks'
import { useObjectInteraction } from '../../scene/useObjectInteraction'
import { M_PER_FT as FT } from '../units'

/**
 * A boulder (legacy earthObjMesh): its seeded cluster of faceted rocks,
 * each bedded into the ground under it. Stone grey with lichen in the
 * Realistic style; the style's own tone elsewhere.
 */
export function BoulderMesh({ o }: { readonly o: PlanObject }) {
  const terrain = usePlanStore((s) => s.site.terrain)
  const { ground, drawnGround } = useEarthworks()
  const { selected, hovered, handlers } = useObjectInteraction(o)
  const style = useDisplayStyle()
  const { w, d, h, count } = o.params
  const seed = objectSeed(o.params, o.id)
  const rocks = useMemo(() => boulderRocks({ w, d, h, count }, seed), [w, d, h, count, seed])
  const geometries = useMemo(() => rocks.map(rockGeometry), [rocks])
  useEffect(() => () => geometries.forEach((g) => g.dispose()), [geometries])
  const base = baseElevation(terrain, o, ground)
  const { x, n } = o.position
  const rot = o.rotation
  const seats = useMemo(() => {
    const at = { x, n }
    const groundAt = (mx: number, mz: number) => drawnGround(...localToSite(at, rot, [mx / FT, mz / FT])) - base
    return rocks.map((r) => rockSeat(r, groundAt))
  }, [rocks, x, n, rot, base, drawnGround])
  const glow = selected ? 1 : hovered ? 0.4 : 0
  return (
    <group position={toScene(x, n, base)} rotation={[0, (rot * Math.PI) / 180, 0]} userData={{ objectId: o.id }}>
      {geometries.map((g, i) => (
        <mesh key={i} geometry={g} position={[0, seats[i], 0]} castShadow receiveShadow {...handlers}>
          <Surface kind="concrete" style={style} glow={glow} vertexColors />
        </mesh>
      ))}
    </group>
  )
}

function rockGeometry(r: { readonly positions: readonly number[]; readonly normals: readonly number[]; readonly colors: readonly number[] }): BufferGeometry {
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(r.positions), 3))
  g.setAttribute('normal', new BufferAttribute(new Float32Array(r.normals), 3))
  g.setAttribute('color', new BufferAttribute(new Float32Array(r.colors), 3))
  g.computeBoundingSphere()
  return g
}

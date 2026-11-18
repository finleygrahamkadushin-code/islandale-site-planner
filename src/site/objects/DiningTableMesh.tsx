import { useEffect, useMemo } from 'react'
import { BoxGeometry } from 'three'
import { usePlanStore } from '../../store/planStore'
import type { PlanObject } from '../../store/types'
import { toScene } from '../../scene/frame'
import { baseElevation } from '../../scene/placement'
import { Surface } from '../../scene/Surface'
import { useDisplayStyle } from '../../scene/useDisplayStyle'
import { useObjectInteraction } from '../../scene/useObjectInteraction'
import { useEarthworks } from '../earthworks/useEarthworks'
import { diningCushionColour, diningTableParts, type DiningPart } from './diningTable'

/**
 * A dining table with seating (see diningTable.ts): a thick timber top on
 * four legs, with chairs or benches round it. Stands on the ground, or at
 * its `standZ` when that is set. Wood is the deck boards' colour and
 * texture; cushions take `cushionColor`.
 */
export function DiningTableMesh({ o }: { readonly o: PlanObject }) {
  const terrain = usePlanStore((s) => s.site.terrain)
  const { ground } = useEarthworks()
  const { selected, hovered, handlers } = useObjectInteraction(o)
  const style = useDisplayStyle()
  const model = useMemo(() => diningTableParts(o.params), [o.params])
  const cushionColour = diningCushionColour(o.params)

  // one geometry per distinct box: chairs share their parts, so they share geometries too
  const unique = useMemo(() => [...new Set([...model.table, ...model.seats.flatMap((s) => s.parts)])], [model])
  const geometries = useMemo(() => new Map(unique.map((p) => [p, new BoxGeometry(p.size[0], p.size[1], p.size[2])] as const)), [unique])
  useEffect(() => () => geometries.forEach((g) => g.dispose()), [geometries])

  const base = baseElevation(terrain, o, ground)
  const { x, n } = o.position
  const glow = selected ? 1 : hovered ? 0.4 : 0

  const box = (p: DiningPart, key: string) => (
    <mesh key={key} geometry={geometries.get(p)} position={p.centre} castShadow receiveShadow {...handlers}>
      {p.kind === 'cushion' ? (
        // soft fabric: a matte plain colour (there is no fabric texture), in the cushion's colour
        <Surface kind="wall" style={style} color={cushionColour} diagramColor={cushionColour} glow={glow} />
      ) : (
        <Surface kind="deck" style={style} texture="deck" glow={glow} />
      )}
    </mesh>
  )

  return (
    <group position={toScene(x, n, base)} rotation={[0, (o.rotation * Math.PI) / 180, 0]} userData={{ objectId: o.id }}>
      {model.table.map((p, i) => box(p, `t${i}`))}
      {model.seats.map((s, si) => (
        <group key={`s${si}`} position={s.centre} rotation={[0, s.turn, 0]}>
          {s.parts.map((p, i) => box(p, `${si}-${i}`))}
        </group>
      ))}
    </group>
  )
}

import { useEffect, useMemo } from 'react'
import { BoxGeometry } from 'three'
import { usePlanStore } from '../../store/planStore'
import type { PlanObject } from '../../store/types'
import { toScene } from '../../scene/frame'
import { baseElevation } from '../../scene/placement'
import { Surface, type SurfaceKind } from '../../scene/Surface'
import { useDisplayStyle } from '../../scene/useDisplayStyle'
import { useObjectInteraction } from '../../scene/useObjectInteraction'
import { useEarthworks } from '../earthworks/useEarthworks'
import { outdoorKitchenParts, type OutdoorKitchenPartKind } from './outdoorKitchen'

/** Each part's material: the stone of the boulder, a lighter stone top, steel for the sink and grill, and dark openings. */
const MATERIAL: Readonly<Record<OutdoorKitchenPartKind, { readonly kind: SurfaceKind; readonly color: string }>> = {
  stone: { kind: 'concrete', color: '#9d9a93' },
  boulder: { kind: 'concrete', color: '#9d9a93' },
  counter: { kind: 'pad', color: '#d8d2c4' },
  basin: { kind: 'frame', color: '#9aa1a8' },
  steel: { kind: 'frame', color: '#9aa1a8' },
  tap: { kind: 'frame', color: '#b9bfc6' },
  recess: { kind: 'frame', color: '#2b2622' },
}

/**
 * An outdoor kitchen built into rock (see outdoorKitchen.ts). Stands on the
 * ground, or at its `standZ` when that is set, e.g. on a roof deck.
 */
export function OutdoorKitchenMesh({ o }: { readonly o: PlanObject }) {
  const terrain = usePlanStore((s) => s.site.terrain)
  const { ground } = useEarthworks()
  const { selected, hovered, handlers } = useObjectInteraction(o)
  const style = useDisplayStyle()
  const parts = useMemo(() => outdoorKitchenParts(o.params), [o.params])
  const geometries = useMemo(() => parts.map((p) => new BoxGeometry(p.size[0], p.size[1], p.size[2])), [parts])
  useEffect(() => () => geometries.forEach((g) => g.dispose()), [geometries])
  const base = baseElevation(terrain, o, ground)
  const { x, n } = o.position
  const glow = selected ? 1 : hovered ? 0.4 : 0
  return (
    <group position={toScene(x, n, base)} rotation={[0, (o.rotation * Math.PI) / 180, 0]} userData={{ objectId: o.id }}>
      {parts.map((p, i) => {
        const m = MATERIAL[p.kind]
        return (
          <mesh key={i} geometry={geometries[i]} position={p.centre} castShadow receiveShadow {...handlers}>
            <Surface kind={m.kind} style={style} color={m.color} diagramColor={m.color} glow={glow} />
          </mesh>
        )
      })}
    </group>
  )
}

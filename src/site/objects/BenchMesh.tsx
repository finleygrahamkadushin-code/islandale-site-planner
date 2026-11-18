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
import { benchParts } from './bench'

/**
 * A bench (see bench.ts): a slatted wooden seat on leg frames, with a
 * slatted backrest when `back` is on. Stands on the ground, or at its
 * `standZ` when that is set. Wood is the deck boards' colour and texture.
 */
export function BenchMesh({ o }: { readonly o: PlanObject }) {
  const terrain = usePlanStore((s) => s.site.terrain)
  const { ground } = useEarthworks()
  const { selected, hovered, handlers } = useObjectInteraction(o)
  const style = useDisplayStyle()
  const parts = useMemo(() => benchParts(o.params), [o.params])
  const geometries = useMemo(() => parts.map((p) => new BoxGeometry(p.size[0], p.size[1], p.size[2])), [parts])
  useEffect(() => () => geometries.forEach((g) => g.dispose()), [geometries])
  const base = baseElevation(terrain, o, ground)
  const { x, n } = o.position
  const glow = selected ? 1 : hovered ? 0.4 : 0
  return (
    <group position={toScene(x, n, base)} rotation={[0, (o.rotation * Math.PI) / 180, 0]} userData={{ objectId: o.id }}>
      {parts.map((p, i) => (
        <mesh key={i} geometry={geometries[i]} position={p.centre} castShadow receiveShadow {...handlers}>
          <Surface kind="deck" style={style} texture="deck" glow={glow} />
        </mesh>
      ))}
    </group>
  )
}

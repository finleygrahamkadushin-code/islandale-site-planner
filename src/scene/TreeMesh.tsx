import { Edges } from '@react-three/drei'
import { num } from '../buildings/footprint'
import { ftToM } from '../site/units'
import { usePlanStore } from '../store/planStore'
import type { PlanObject } from '../store/types'
import { baseElevation } from './placement'
import { toScene } from './frame'
import { useObjectInteraction } from './useObjectInteraction'

/** A tree as a trunk and a canopy ball sized from its legacy width and height. */
export function TreeMesh({ o }: { readonly o: PlanObject }) {
  const terrain = usePlanStore((s) => s.site.terrain)
  const { selected, hovered, handlers } = useObjectInteraction(o)
  const canopyR = ftToM(num(o.params.w, 20)) / 2
  const height = ftToM(num(o.params.h, 25))
  const trunkH = Math.max(1, height - canopyR)
  const position = toScene(o.position.x, o.position.n, baseElevation(terrain, o))
  const color = typeof o.params.color === 'string' ? o.params.color : '#4f7d4b'
  const glow = selected ? 0.18 : hovered ? 0.08 : 0
  return (
    <group position={position} userData={{ objectId: o.id }}>
      <mesh position={[0, trunkH / 2, 0]} castShadow {...handlers}>
        <cylinderGeometry args={[0.2, 0.3, trunkH, 8]} />
        <meshStandardMaterial color="#6b4e37" roughness={1} />
      </mesh>
      <mesh position={[0, trunkH, 0]} castShadow {...handlers}>
        <sphereGeometry args={[canopyR, 16, 12]} />
        <meshStandardMaterial color={color} roughness={0.9} emissive="#ffffff" emissiveIntensity={glow} />
        {selected && <Edges color="#ffffff" threshold={40} />}
      </mesh>
    </group>
  )
}

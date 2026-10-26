import { useMemo } from 'react'
import { Edges } from '@react-three/drei'
import { footprintParams } from '../buildings/footprint'
import { usePlanStore } from '../store/planStore'
import type { PlanObject } from '../store/types'
import { buildPrismGeometry } from './objectGeometry'
import { baseElevation, heightM } from './placement'
import { toScene } from './frame'
import { useObjectInteraction } from './useObjectInteraction'

/** A building or pad as a simple prism of its footprint, in its legacy colour. */
export function ObjectMesh({ o }: { readonly o: PlanObject }) {
  const terrain = usePlanStore((s) => s.site.terrain)
  const { selected, hovered, handlers } = useObjectInteraction(o)
  const fp = footprintParams(o)
  const h = heightM(o)
  const geometry = useMemo(
    () => buildPrismGeometry(fp, h),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fp.w, fp.d, fp.shape, fp.taper, fp.skew, fp.pts, h],
  )
  const base = baseElevation(terrain, o)
  const position = toScene(o.position.x, o.position.n, base)
  const color = typeof o.params.color === 'string' ? o.params.color : '#b8b0a0'
  return (
    <mesh
      geometry={geometry}
      position={position}
      rotation={[0, (o.rotation * Math.PI) / 180, 0]}
      castShadow
      receiveShadow
      userData={{ objectId: o.id }}
      {...handlers}
    >
      <meshStandardMaterial color={color} roughness={0.9} emissive={hovered || selected ? '#ffffff' : '#000000'} emissiveIntensity={selected ? 0.18 : hovered ? 0.08 : 0} />
      {selected && <Edges color="#ffffff" lineWidth={1.5} threshold={15} />}
    </mesh>
  )
}

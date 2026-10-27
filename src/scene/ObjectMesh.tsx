import { useMemo } from 'react'
import { footprintParams } from '../buildings/footprint'
import { usePlanStore } from '../store/planStore'
import type { PlanObject } from '../store/types'
import { buildPrismGeometry } from './objectGeometry'
import { useEarthworks } from './useEarthworks'
import { baseElevation, heightM } from './placement'
import { toScene } from './frame'
import { useObjectInteraction } from './useObjectInteraction'
import { Surface } from './Surface'
import { useDisplayStyle } from './useDisplayStyle'

/** A pad, path or other flat object as a prism of its footprint, gravel-textured in the Realistic style. */
export function ObjectMesh({ o }: { readonly o: PlanObject }) {
  const terrain = usePlanStore((s) => s.site.terrain)
  const { ground } = useEarthworks()
  const { selected, hovered, handlers } = useObjectInteraction(o)
  const style = useDisplayStyle()
  const fp = footprintParams(o)
  const h = heightM(o)
  const geometry = useMemo(
    () => buildPrismGeometry(fp, h),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fp.w, fp.d, fp.shape, fp.taper, fp.skew, fp.pts, h],
  )
  const base = baseElevation(terrain, o, ground)
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
      <Surface kind="pad" style={style} color={color} texture="gravel" textureUnit="m" glow={selected ? 1 : hovered ? 0.4 : 0} />
    </mesh>
  )
}

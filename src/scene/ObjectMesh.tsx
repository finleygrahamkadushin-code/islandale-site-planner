import { useEffect, useMemo } from 'react'
import type { BufferGeometry } from 'three'
import { footprintParams, localFootprint, localToSite } from '../buildings/footprint'
import { buildDrapedPad } from '../site/drape'
import { usePlanStore } from '../store/planStore'
import type { PlanObject } from '../store/types'
import { buildPrismGeometry } from './objectGeometry'
import { useEarthworks } from './useEarthworks'
import { baseElevation, heightM } from './placement'
import { toScene } from './frame'
import { toGeometry } from './meshData'
import { useObjectInteraction } from './useObjectInteraction'
import { Surface } from './Surface'
import { useDisplayStyle } from './useDisplayStyle'

/**
 * A pad (path, lane, drive, patio) draped over the ground, or another flat
 * object as a prism of its footprint; gravel-textured in the Realistic style.
 */
export function ObjectMesh({ o }: { readonly o: PlanObject }) {
  const terrain = usePlanStore((s) => s.site.terrain)
  const { ground, drawnGround } = useEarthworks()
  const { selected, hovered, handlers } = useObjectInteraction(o)
  const style = useDisplayStyle()
  const fp = footprintParams(o)
  const h = heightM(o)
  const base = baseElevation(terrain, o, ground)
  const drape = o.type === 'pad'
  const { x, n } = o.position
  const geometry = useMemo<BufferGeometry>(() => {
    if (!drape) return buildPrismGeometry(fp, h)
    const at = { x, n }
    return toGeometry(buildDrapedPad(localFootprint(fp), (p) => drawnGround(...localToSite(at, o.rotation, p)) - base, h))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drape, fp.w, fp.d, fp.shape, fp.taper, fp.skew, fp.pts, h, x, n, o.rotation, base, drawnGround])
  useEffect(() => () => geometry.dispose(), [geometry])
  const position = toScene(x, n, base)
  const color = typeof o.params.color === 'string' ? o.params.color : '#b8b0a0'
  return (
    <mesh
      geometry={geometry}
      position={position}
      rotation={[0, (o.rotation * Math.PI) / 180, 0]}
      castShadow={!drape}
      receiveShadow
      userData={{ objectId: o.id }}
      {...handlers}
    >
      <Surface kind="pad" style={style} color={color} texture="gravel" textureUnit="m" glow={selected ? 1 : hovered ? 0.4 : 0} />
    </mesh>
  )
}

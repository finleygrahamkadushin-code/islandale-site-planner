import { useEffect, useMemo } from 'react'
import type { BufferGeometry } from 'three'
import { footprintParams, localFootprint, localToSite } from '../../buildings/footprint'
import { buildDrapedPad } from './drape'
import { usePlanStore } from '../../store/planStore'
import type { PlanObject } from '../../store/types'
import { buildPrismGeometry } from './objectGeometry'
import { useEarthworks } from '../earthworks/useEarthworks'
import { baseElevation, heightM } from '../../scene/placement'
import { toScene } from '../../scene/frame'
import { toGeometry } from '../../scene/meshData'
import { useObjectInteraction } from '../../scene/useObjectInteraction'
import { Surface } from '../../scene/Surface'
import { useDisplayStyle } from '../../scene/useDisplayStyle'
import { ParkedCars } from './ParkedCars'

/**
 * A pad (path, lane, drive, patio) draped over the ground, with the cars
 * parked on it, or another flat object as a prism of its footprint;
 * gravel-textured in the Realistic style.
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
  }, [drape, fp.w, fp.d, fp.shape, fp.taper, fp.skew, fp.pts, fp.bend, fp.point, h, x, n, o.rotation, base, drawnGround])
  useEffect(() => () => geometry.dispose(), [geometry])
  const position = toScene(x, n, base)
  const color = typeof o.params.color === 'string' ? o.params.color : '#b8b0a0'
  const glow = selected ? 1 : hovered ? 0.4 : 0
  return (
    <group position={position} rotation={[0, (o.rotation * Math.PI) / 180, 0]} userData={{ objectId: o.id }}>
      <mesh geometry={geometry} castShadow={!drape} receiveShadow {...handlers}>
        <Surface kind="pad" style={style} color={color} texture="gravel" textureUnit="m" glow={glow} />
      </mesh>
      {drape && <ParkedCars o={o} base={base} handlers={handlers} glow={glow} />}
    </group>
  )
}

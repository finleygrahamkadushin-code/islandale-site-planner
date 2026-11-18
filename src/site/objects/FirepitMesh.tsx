import { useEffect, useMemo } from 'react'
import { BoxGeometry, ConeGeometry, CylinderGeometry, type BufferGeometry } from 'three'
import { usePlanStore } from '../../store/planStore'
import type { DisplayStyle, PlanObject } from '../../store/types'
import { toScene } from '../../scene/frame'
import { baseElevation } from '../../scene/placement'
import { Surface, type SurfaceKind, type TextureName } from '../../scene/Surface'
import { useDisplayStyle } from '../../scene/useDisplayStyle'
import { useObjectInteraction } from '../../scene/useObjectInteraction'
import { useEarthworks } from '../earthworks/useEarthworks'
import { firepitParts, type FirepitPart, type FirepitPartKind } from './firepit'

/**
 * A sunken seating fire pit (see firepit.ts): a raised deck ring with
 * sitting steps, stone floor and bowl, cushions and flames. Stands on the
 * ground, or at its `standZ` when that is set. Wood is the deck boards;
 * stone is the granite boulder's stone; the flames glow.
 */
export function FirepitMesh({ o }: { readonly o: PlanObject }) {
  const terrain = usePlanStore((s) => s.site.terrain)
  const { ground } = useEarthworks()
  const { selected, hovered, handlers } = useObjectInteraction(o)
  const style = useDisplayStyle()
  const parts = useMemo(() => firepitParts(o.params), [o.params])
  const geometries = useMemo(() => parts.map(partGeometry), [parts])
  useEffect(() => () => geometries.forEach((g) => g.dispose()), [geometries])
  const base = baseElevation(terrain, o, ground)
  const { x, n } = o.position
  const glow = selected ? 1 : hovered ? 0.4 : 0
  return (
    <group position={toScene(x, n, base)} rotation={[0, (o.rotation * Math.PI) / 180, 0]} userData={{ objectId: o.id }}>
      {parts.map((p, i) => (
        <mesh key={i} geometry={geometries[i]} position={p.centre} rotation={[0, p.yaw, 0]} castShadow receiveShadow {...handlers}>
          <PartMaterial kind={p.kind} style={style} glow={glow} />
        </mesh>
      ))}
    </group>
  )
}

/** The material for one part: wood, stone, cushion fabric, the dark bowl, or the glowing flame. */
function PartMaterial({ kind, style, glow }: { readonly kind: FirepitPartKind; readonly style: DisplayStyle; readonly glow: number }) {
  if (kind === 'flame') {
    return <meshStandardMaterial color="#ffb13b" emissive="#ff7a1a" emissiveIntensity={1.6} toneMapped={false} />
  }
  const { surface, texture, color } = MATERIALS[kind]
  return <Surface kind={surface} style={style} texture={texture} color={color} glow={glow} />
}

const MATERIALS: Readonly<Record<Exclude<FirepitPartKind, 'flame'>, { surface: SurfaceKind; texture?: TextureName; color?: string }>> = {
  deck: { surface: 'deck', texture: 'deck' },
  stone: { surface: 'concrete', texture: 'stone' },
  cushion: { surface: 'wall', color: '#d8c9a8' },
  ember: { surface: 'wall', color: '#2b2823' },
}

function partGeometry(p: FirepitPart): BufferGeometry {
  const [a, b, c] = p.size
  if (p.form === 'cylinder') return new CylinderGeometry(a / 2, a / 2, b, 24)
  if (p.form === 'cone') return new ConeGeometry(a / 2, b, 8)
  return new BoxGeometry(a, b, c)
}

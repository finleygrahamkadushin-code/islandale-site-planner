import { useEffect, useMemo } from 'react'
import type { LocalPoint } from '../buildings/footprint'
import { SUPPORT_EMBED_M, supportMeshes, supportPlan, type SupportMaterial } from '../buildings/supports'
import { ftToM } from '../site/units'
import type { DisplayStyle } from '../store/types'
import type { MassSite, MeshHandlers } from './buildingLook'
import { toGeometry } from './meshData'
import { Surface } from './Surface'

export const EMBED_M = SUPPORT_EMBED_M

/** Legacy stilt white (#ecebe6) and plate (#d9d6cf). */
const STILT_WHITE = '#ecebe6'
const STILT_DIAGRAM = '#d9d6cf'

interface FoundationProps {
  readonly poly: readonly LocalPoint[]
  readonly site: MassSite
  readonly support: unknown
  readonly spacingFt: number
  /** Post size, inches; missing means the legacy default for the kind (6 in posts, 10 in piers and pilings). */
  readonly postIn?: number
  readonly style: DisplayStyle
  readonly handlers: MeshHandlers
  /** Cross-brace a square post grid where the floor is high (legacy o.bracing). */
  readonly bracing?: boolean
  /** Where a mast stands, feet, mass-local (legacy o.mastAt). */
  readonly mastAt?: LocalPoint
  /** Top of the supports relative to the mass floor, metres (minus the floor depth under a deck). */
  readonly top?: number
}

/**
 * What a mass stands on (legacy supportsMesh): a concrete skirt or slab,
 * posts, piers or pilings on beams (braced when asked), a mast or stilts,
 * or nothing on an earth bench, each running down to the real ground under
 * it. Pieces carry their paint part: 'post' for anything standing,
 * 'foundation' for skirts, aprons and plates.
 */
export function Foundation({ poly, site, support, spacingFt, postIn, style, handlers, bracing = false, mastAt, top = 0 }: FoundationProps) {
  const pieces = useMemo(() => {
    const plan = supportPlan({ poly, support, spacingFt, postIn, bracing, mastAt, top, groundY: (x, z) => site.groundAt(x, z) - site.floor })
    return supportMeshes(plan, poly).map((p) => ({ ...p, geometry: toGeometry(p.mesh) }))
  }, [poly, support, spacingFt, postIn, bracing, mastAt, top, site])
  useEffect(() => () => pieces.forEach((p) => p.geometry.dispose()), [pieces])
  return (
    <group name="supports">
      {pieces.map((p) => (
        <mesh key={`${p.part}-${p.material}`} geometry={p.geometry} userData={{ part: p.part }} castShadow receiveShadow {...handlers}>
          <SupportSurface material={p.material} style={style} />
        </mesh>
      ))}
    </group>
  )
}

function SupportSurface({ material, style }: { readonly material: SupportMaterial; readonly style: DisplayStyle }) {
  if (material === 'wood') return <Surface kind="wood" style={style} />
  if (material === 'concrete') return <Surface kind="concrete" style={style} texture="concrete" />
  if (material === 'steel') return <Surface kind="frame" style={style} />
  return <Surface kind="trim" style={style} color={STILT_WHITE} diagramColor={STILT_DIAGRAM} />
}

interface PostsProps {
  readonly points: readonly LocalPoint[]
  /** Top of the posts relative to the mass floor, metres. */
  readonly top: number
  readonly site: MassSite
  readonly sizeM: number
  readonly style: DisplayStyle
  /** The cabin's handlers, so a click on a post selects it or picks its part. */
  readonly handlers: MeshHandlers
}

/** Square posts from `top` down to the ground under each point, buried a little. Points closer than a post to the ground get none. */
export function Posts({ points, top, site, sizeM, style, handlers }: PostsProps) {
  return (
    <>
      {points.map(([x, z], i) => {
        const len = site.floor + top - site.groundAt(x, z) + EMBED_M
        if (len < EMBED_M + 0.05) return null
        return (
          <mesh key={i} position={[ftToM(x), top - len / 2, ftToM(z)]} userData={{ part: 'post' }} castShadow {...handlers}>
            <boxGeometry args={[sizeM, len, sizeM]} />
            <Surface kind="wood" style={style} />
          </mesh>
        )
      })}
    </>
  )
}

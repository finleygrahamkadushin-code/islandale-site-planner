import { useEffect, useMemo } from 'react'
import type { LocalPoint } from '../buildings/footprint'
import { postPositions, supportType } from '../buildings/foundation'
import { buildWalls } from '../buildings/walls'
import { ftToM } from '../site/units'
import type { DisplayStyle } from '../store/types'
import type { MassSite, MeshHandlers } from './buildingLook'
import { toGeometry } from './meshData'
import { Surface } from './Surface'

export const EMBED_M = 0.3
const RIM_M = 0.3

interface FoundationProps {
  readonly poly: readonly LocalPoint[]
  readonly site: MassSite
  readonly support: unknown
  readonly spacingFt: number
  readonly postIn: number
  readonly style: DisplayStyle
  readonly handlers: MeshHandlers
}

/** Posts or a concrete skirt from an enclosed mass's floor down into the ground, following the real slope under each point. */
export function Foundation({ poly, site, support, spacingFt, postIn, style, handlers }: FoundationProps) {
  const minGround = Math.min(...poly.map(([x, z]) => site.groundAt(x, z)))
  const drop = site.floor - minGround
  const type = supportType(support, drop)
  const posts = useMemo(() => (type === 'posts' ? postPositions(poly, spacingFt, postIn) : []), [type, poly, spacingFt, postIn])
  const skirtDepthFt = (drop + EMBED_M) / 0.3048
  const skirt = useMemo(() => (type === 'skirt' && drop > -0.05 ? toGeometry(buildWalls(poly, skirtDepthFt)) : null), [type, poly, skirtDepthFt, drop])
  const rim = useMemo(() => (type === 'posts' ? toGeometry(buildWalls(poly, RIM_M / 0.3048)) : null), [type, poly])
  useEffect(() => () => skirt?.dispose(), [skirt])
  useEffect(() => () => rim?.dispose(), [rim])
  if (type === 'none') return null
  return (
    <group>
      {skirt && (
        <mesh geometry={skirt} position={[0, -(drop + EMBED_M), 0]} castShadow receiveShadow {...handlers}>
          <Surface kind="concrete" style={style} texture="concrete" />
        </mesh>
      )}
      {rim && (
        <mesh geometry={rim} position={[0, -RIM_M, 0]} castShadow receiveShadow {...handlers}>
          <Surface kind="wood" style={style} />
        </mesh>
      )}
      <Posts points={posts} top={-RIM_M} site={site} sizeM={Math.max(0.1, postIn * 0.0254)} style={style} handlers={handlers} />
    </group>
  )
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
          <mesh key={i} position={[ftToM(x), top - len / 2, ftToM(z)]} castShadow {...handlers}>
            <boxGeometry args={[sizeM, len, sizeM]} />
            <Surface kind="wood" style={style} />
          </mesh>
        )
      })}
    </>
  )
}

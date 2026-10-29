import { useEffect, useMemo } from 'react'
import { DoubleSide } from 'three'
import type { LocalPoint } from '../buildings/footprint'
import type { Mass } from '../buildings/masses'
import { joinEdgeRuns } from '../buildings/rails'
import { buildRail } from '../buildings/railStyles'
import type { BuildingLook, MassSite } from './buildingLook'
import { toGeometry } from './meshData'
import { Surface } from './Surface'

/** Legacy rail colours: steel and cable dark grey, wood deck rails the post colour; porch rails take the trim colour. */
const METAL = '#3b3f44'
const DECK_POST = '#6e5a44'
const GLASS = '#a9d6e2'

/**
 * A guard round the open edges of a deck or porch floor, drawn from the
 * mass's per-edge rails (railRules.resolveEdges): only where each edge
 * keeps a run once stairs, paths, doors and walls have opened it, in the
 * building's rail style. The mesh is named "rail" and lists the edges that
 * kept any piece in userData.edges.
 */
export function GuardRail({ m, poly, site, look }: { readonly m: Mass; readonly poly: readonly LocalPoint[]; readonly site: MassSite; readonly look: BuildingLook }) {
  const edges = site.rails
  const style = site.railStyle ?? 'wood'
  const rail = useMemo(() => {
    if (!edges) return null
    const runs = joinEdgeRuns(
      poly,
      edges.map((e) => e.runs),
    )
    const g = runs.length ? buildRail(runs, 0, style) : null
    if (!g) return null
    return { frame: toGeometry(g.frame), glass: g.glass ? toGeometry(g.glass) : null, edges: edges.filter((e) => e.runs.length).map((e) => e.i) }
  }, [edges, poly, style])
  useEffect(
    () => () => {
      rail?.frame.dispose()
      rail?.glass?.dispose()
    },
    [rail],
  )
  if (!rail) return null
  const metal = style === 'steel' || style === 'cable'
  return (
    <>
      <mesh name="rail" geometry={rail.frame} userData={{ edges: rail.edges }} castShadow>
        {metal ? (
          <Surface kind="trim" style={look.style} color={METAL} />
        ) : m.kind === 'deck' ? (
          <Surface kind="wood" style={look.style} color={DECK_POST} />
        ) : (
          <Surface kind="trim" style={look.style} color={look.color} diagramColor={look.diagram} />
        )}
      </mesh>
      {rail.glass && (
        <mesh name="rail-glass" geometry={rail.glass}>
          <meshStandardMaterial color={GLASS} transparent opacity={0.3} roughness={0.1} side={DoubleSide} depthWrite={false} />
        </mesh>
      )}
    </>
  )
}

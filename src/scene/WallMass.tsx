import { useEffect, useMemo } from 'react'
import { isWallKind, WALL_KIND_TEXTURE, type WallKind } from '../buildings/finishes'
import type { MeshData } from '../buildings/geom'
import type { LocalPoint } from '../buildings/footprint'
import { massPoly, type Mass } from '../buildings/masses'
import { FIT, layoutOpenings } from '../buildings/openingLayout'
import { buildWallShell, edgeMesh, GLASS_WALL_FT, joinByEdge, wallDecorByEdge, type EdgeMesh, type WallShell } from '../buildings/wallShell'
import type { BuildingLook, MassSite, MeshHandlers } from './buildingLook'
import { Foundation } from './Foundation'
import { toGeometry } from './meshData'
import { OpeningMesh } from './OpeningMesh'
import { RoofMesh } from './RoofMesh'
import { usePlanStore } from '../store/planStore'
import { Surface } from './Surface'

export interface SupportParams {
  readonly support: unknown
  readonly spacingFt: number
  /** Post size, inches; undefined for each support kind's own. */
  readonly postIn?: number
  /** Cross-brace a high post grid (legacy o.bracing); main mass only. */
  readonly bracing?: boolean
  /** Where a mast stands, feet, building-local (legacy o.mastAt); main mass only. */
  readonly mastAt?: LocalPoint
}

/** How one wall is finished: its kind (null keeps the building's siding), colour, and a glass wall's tint. */
interface WallFinish {
  readonly kind: WallKind | null
  readonly color: string
  readonly tint: string | null
}

/**
 * The finish of wall `edge` of mass `mi` through the exterior model (legacy
 * extResolve over specWallKind / specWallMat): a painted wall, mass or house
 * first, then the mass's own wall kind and colour, then the building's;
 * painted ('') keeps the building's siding.
 */
function wallFinish(look: BuildingLook, mi: number, edge: number): WallFinish {
  const r = look.ext(mi, 'wall', edge)
  return { kind: isWallKind(r.kind) ? r.kind : null, color: r.color, tint: r.tint }
}

const finishKey = (f: WallFinish) => `${f.kind ?? ''}|${f.color}|${f.tint ?? ''}`

/** An enclosed mass: thick walls with the openings cut through, framed openings, its roof, and posts or a skirt down to the slope. */
export function WallMass({
  m,
  look,
  site,
  supports,
  handlers,
  highlight = null,
}: {
  readonly m: Mass
  readonly look: BuildingLook
  readonly site: MassSite
  readonly supports: SupportParams
  readonly handlers: MeshHandlers
  /** The id of the opening picked in the Openings panel, if it is on this mass. */
  readonly highlight?: number | null
}) {
  const poly = useMemo(() => massPoly(m), [m])
  const roofsOff = usePlanStore((s) => s.roofsOff)
  const openings = useMemo(
    () => layoutOpenings(poly, m.cuts, { wallHeightFt: m.h, buried: site.insideWalls }).openings,
    [poly, m.cuts, m.h, site.insideWalls],
  )
  // walls that share a finish draw as one mesh; glass walls are a thin curtain wall
  const mi = site.mi ?? 0
  const finishes = poly.map((_, e) => wallFinish(look, mi, e))
  const glassKey = finishes.map((f) => (f.kind === 'glass' ? 'g' : '-')).join('')
  const thickness = useMemo(() => (e: number) => (glassKey[e] === 'g' ? GLASS_WALL_FT : FIT.wallFt), [glassKey])
  const shell = useMemo(() => buildWallShell(poly, m.h, openings, { cap: !roofsOff, thicknessFt: thickness }), [poly, m.h, openings, roofsOff, thickness])
  const decor = useMemo(
    () => (glassKey.includes('g') ? wallDecorByEdge(poly, m.h, (e) => (glassKey[e] === 'g' ? 'glass' : null), openings, { thicknessFt: thickness }) : []),
    [poly, m.h, openings, glassKey, thickness],
  )
  const groups = [...new Set(finishes.map(finishKey))].map((key) => {
    const edges = finishes.flatMap((f, e) => (finishKey(f) === key ? [e] : []))
    return { key, finish: finishes[edges[0]], edges: edges.join(',') }
  })
  return (
    <>
      {groups.map((g) => (
        <WallPart key={g.key} shell={shell} decor={decor} edges={g.edges} finish={g.finish} look={look} handlers={handlers} />
      ))}
      <CapMesh mesh={shell.cap} color={finishes[0]?.color ?? look.color} look={look} handlers={handlers} />
      <RoofMesh m={m} mi={mi} poly={poly} look={look} handlers={handlers} />
      {openings.map((op) => (
        <OpeningMesh key={op.id} op={op} style={look.style} highlight={highlight === op.id} thicknessFt={thickness} />
      ))}
      <Foundation
        poly={poly}
        site={site}
        support={supports.support}
        spacingFt={supports.spacingFt}
        postIn={supports.postIn}
        bracing={mi === 0 && supports.bracing}
        mastAt={mi === 0 ? supports.mastAt : undefined}
        style={look.style}
        handlers={handlers}
      />
    </>
  )
}

interface WallPartProps {
  readonly shell: WallShell
  readonly decor: readonly EdgeMesh[]
  /** The walls (edge indices) in this part, comma-separated so the geometry is rebuilt only when they change. */
  readonly edges: string
  readonly finish: WallFinish
  readonly look: BuildingLook
  readonly handlers: MeshHandlers
}

/** The walls that share one finish, as one mesh tagged with each triangle's wall; a glass curtain wall with its mullions. */
function WallPart({ shell, decor, edges, finish, look, handlers }: WallPartProps) {
  const built = useMemo(() => {
    const mine = new Set(edges.split(',').map(Number))
    const wall = joinByEdge(shell.edges.filter((e) => mine.has(e.edge)).map(edgeMesh))
    const bars = joinByEdge(decor.filter((d) => mine.has(d.edge)))
    return {
      wall: toGeometry(wall.mesh),
      wallData: { part: 'wall', faceEdges: wall.faceEdges },
      bars: bars.mesh.positions.length ? toGeometry(bars.mesh) : null,
      barData: { part: 'wall', faceEdges: bars.faceEdges },
    }
  }, [shell, decor, edges])
  useEffect(
    () => () => {
      built.wall.dispose()
      built.bars?.dispose()
    },
    [built],
  )
  if (finish.kind === 'glass') {
    return (
      <>
        <mesh geometry={built.wall} userData={built.wallData} {...handlers}>
          <Surface kind="clearGlass" style={look.style} color={finish.tint ?? undefined} glow={look.glow} />
        </mesh>
        {built.bars && (
          <mesh geometry={built.bars} castShadow receiveShadow userData={built.barData} {...handlers}>
            <Surface kind="frame" style={look.style} glow={look.glow} />
          </mesh>
        )}
      </>
    )
  }
  return (
    <mesh geometry={built.wall} castShadow receiveShadow userData={built.wallData} {...handlers}>
      <Surface
        kind="wall"
        style={look.style}
        color={finish.color}
        texture={finish.kind ? WALL_KIND_TEXTURE[finish.kind] : look.siding}
        diagramColor={look.diagram}
        glow={look.glow}
      />
    </mesh>
  )
}

/** The ceiling over the walls when there is no roof to close them (none with Roofs off). */
function CapMesh({ mesh, color, look, handlers }: { readonly mesh: MeshData; readonly color: string; readonly look: BuildingLook; readonly handlers: MeshHandlers }) {
  const geometry = useMemo(() => (mesh.positions.length ? toGeometry(mesh) : null), [mesh])
  useEffect(() => () => geometry?.dispose(), [geometry])
  if (!geometry) return null
  return (
    <mesh geometry={geometry} receiveShadow userData={{ part: 'wall' }} {...handlers}>
      <Surface kind="wall" style={look.style} color={color} diagramColor={look.diagram} glow={look.glow} />
    </mesh>
  )
}

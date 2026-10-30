import { useEffect, useMemo } from 'react'
import { massPoly, type Mass } from '../buildings/masses'
import { layoutOpenings } from '../buildings/openingLayout'
import { buildWalls } from '../buildings/walls'
import type { BuildingLook, MassSite, MeshHandlers } from './buildingLook'
import { Foundation } from './Foundation'
import { toGeometry } from './meshData'
import { OpeningMesh } from './OpeningMesh'
import { RoofMesh } from './RoofMesh'
import { Surface } from './Surface'

export interface SupportParams {
  readonly support: unknown
  readonly spacingFt: number
  readonly postIn: number
}

/** An enclosed mass: siding walls, framed openings, its roof, and posts or a skirt down to the slope. */
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
  const walls = useMemo(() => toGeometry(buildWalls(poly, m.h)), [poly, m.h])
  const openings = useMemo(
    () => layoutOpenings(poly, m.cuts, { wallHeightFt: m.h, buried: site.insideWalls }).openings,
    [poly, m.cuts, m.h, site.insideWalls],
  )
  useEffect(() => () => walls.dispose(), [walls])
  return (
    <>
      <mesh geometry={walls} castShadow receiveShadow {...handlers}>
        <Surface kind="wall" style={look.style} color={look.color} texture={look.siding} diagramColor={look.diagram} glow={look.glow} />
      </mesh>
      <RoofMesh m={m} poly={poly} look={look} handlers={handlers} />
      {openings.map((op) => (
        <OpeningMesh key={op.id} op={op} style={look.style} highlight={highlight === op.id} />
      ))}
      <Foundation poly={poly} site={site} support={supports.support} spacingFt={supports.spacingFt} postIn={supports.postIn} style={look.style} handlers={handlers} />
    </>
  )
}

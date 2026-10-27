import { useEffect, useMemo } from 'react'
import { massPoly, type Mass } from '../buildings/masses'
import { placeOpenings } from '../buildings/openings'
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
export function WallMass({ m, look, site, supports, handlers }: { readonly m: Mass; readonly look: BuildingLook; readonly site: MassSite; readonly supports: SupportParams; readonly handlers: MeshHandlers }) {
  const poly = useMemo(() => massPoly(m), [m])
  const walls = useMemo(() => toGeometry(buildWalls(poly, m.h)), [poly, m.h])
  const openings = useMemo(() => placeOpenings(poly, m.cuts, m.h), [poly, m.cuts, m.h])
  useEffect(() => () => walls.dispose(), [walls])
  return (
    <>
      <mesh geometry={walls} castShadow receiveShadow {...handlers}>
        <Surface kind="wall" style={look.style} color={look.color} texture={look.siding} diagramColor={look.diagram} glow={look.glow} />
      </mesh>
      <RoofMesh m={m} poly={poly} look={look} handlers={handlers} />
      {openings.map((op, i) => (
        <OpeningMesh key={i} op={op} style={look.style} />
      ))}
      <Foundation poly={poly} site={site} support={supports.support} spacingFt={supports.spacingFt} postIn={supports.postIn} style={look.style} />
    </>
  )
}

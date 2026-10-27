import { useMemo } from 'react'
import { localToSite, num, type LocalPoint } from '../buildings/footprint'
import { pointInPolygon } from '../buildings/foundation'
import { buildingMasses, massBuildingPoly, massToBuilding, type Mass } from '../buildings/masses'
import { elevationAt } from '../site/terrain'
import { ftToM } from '../site/units'
import { usePlanStore } from '../store/planStore'
import type { PlanObject } from '../store/types'
import { buildingLook, type MassSite } from './buildingLook'
import { toScene } from './frame'
import { DeckMass, PorchMass } from './OpenMass'
import { baseElevation } from './placement'
import { useDisplayStyle } from './useDisplayStyle'
import { useObjectInteraction } from './useObjectInteraction'
import { WallMass } from './WallMass'

/** A cabin: its main walls plus every wing (porches, decks, stairs), each set at its offset, turn and level. */
export function BuildingMesh({ o }: { readonly o: PlanObject }) {
  const terrain = usePlanStore((s) => s.site.terrain)
  const style = useDisplayStyle()
  const { selected, hovered, handlers } = useObjectInteraction(o)
  const masses = useMemo(() => buildingMasses(o.params), [o.params])
  const closed = useMemo(() => masses.filter((m) => !m.open).map(massBuildingPoly), [masses])

  const base = baseElevation(terrain, o)
  const look = buildingLook(o, style, selected ? 1 : hovered ? 0.4 : 0)
  const supports = { support: o.params.support, spacingFt: num(o.params.postSpacing, 8), postIn: num(o.params.postSize, 6) }
  const siteFor = (m: Mass): MassSite => ({
    floor: base + ftToM(m.lvl),
    groundAt: (x, z) => {
      const [sx, sn] = localToSite(o.position, o.rotation, massToBuilding(m, [x, z]))
      return elevationAt(terrain, sx, sn)
    },
    insideWalls: (p: LocalPoint) => {
      const [bx, bz] = massToBuilding(m, p)
      return closed.some((poly) => pointInPolygon(poly, bx, bz))
    },
  })

  return (
    <group position={toScene(o.position.x, o.position.n, base)} rotation={[0, (o.rotation * Math.PI) / 180, 0]} userData={{ objectId: o.id }}>
      {masses.map((m, i) => (
        <group key={i} position={[ftToM(m.dx), ftToM(m.lvl), ftToM(m.dz)]} rotation={[0, (m.rot * Math.PI) / 180, 0]}>
          {m.kind === 'wall' && <WallMass m={m} look={look} site={siteFor(m)} supports={supports} handlers={handlers} />}
          {m.kind === 'porch' && <PorchMass m={m} look={look} site={siteFor(m)} handlers={handlers} />}
          {m.kind === 'deck' && <DeckMass m={m} look={look} site={siteFor(m)} handlers={handlers} />}
        </group>
      ))}
    </group>
  )
}

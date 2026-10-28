import { useMemo } from 'react'
import { localToSite, num, siteToLocal, type LocalPoint } from '../buildings/footprint'
import { TREE_WELL_FT, type TreeWell } from '../buildings/deckSteps'
import { pointInPolygon } from '../buildings/foundation'
import { buildingMasses, buildingToMass, massBuildingPoly, massToBuilding, type Mass } from '../buildings/masses'
import { ftToM } from '../site/units'
import { usePlanStore } from '../store/planStore'
import type { PlanObject } from '../store/types'
import { buildingLook, type MassSite } from './buildingLook'
import { toScene } from './frame'
import { DeckMass, PorchMass } from './OpenMass'
import { baseElevation } from './placement'
import { StairMass } from './StairMass'
import { useDisplayStyle } from './useDisplayStyle'
import { useObjectInteraction } from './useObjectInteraction'
import { useEarthworks } from './useEarthworks'
import { WallMass } from './WallMass'
import { useShallow } from 'zustand/react/shallow'

const NO_WELLS: readonly TreeWell[] = []

/** A cabin: its main walls plus every wing (porches, decks, stairs), each set at its offset, turn and level. */
export function BuildingMesh({ o }: { readonly o: PlanObject }) {
  const terrain = usePlanStore((s) => s.site.terrain)
  const { ground } = useEarthworks()
  const style = useDisplayStyle()
  const { selected, hovered, handlers } = useObjectInteraction(o)
  const focus = usePlanStore((s) => s.openingFocus)
  const masses = useMemo(() => buildingMasses(o.params), [o.params])
  const outlines = useMemo(() => masses.map(massBuildingPoly), [masses])
  const closed = useMemo(() => outlines.filter((_, i) => !masses[i].open), [masses, outlines])
  const trees = usePlanStore(useShallow((s) => s.plan.order.map((id) => s.plan.objects[id]).filter((t) => t?.type === 'tree' && !t.hidden).map((t) => t.position)))

  const base = baseElevation(terrain, o)
  const look = buildingLook(o, style, selected ? 1 : hovered ? 0.4 : 0)
  const supports = { support: o.params.support, spacingFt: num(o.params.postSpacing, 8), postIn: num(o.params.postSize, 6) }
  const siteFor = (m: Mass, index: number): MassSite => ({
    floor: base + ftToM(m.lvl),
    groundAt: (x, z) => {
      const [sx, sn] = localToSite(o.position, o.rotation, massToBuilding(m, [x, z]))
      return ground(sx, sn)
    },
    insideWalls: (p: LocalPoint) => {
      const [bx, bz] = massToBuilding(m, p)
      return closed.some((poly) => pointInPolygon(poly, bx, bz))
    },
    insideOther: (p: LocalPoint) => {
      const [bx, bz] = massToBuilding(m, p)
      return outlines.some((poly, j) => j !== index && pointInPolygon(poly, bx, bz))
    },
  })

  // tree wells in each stepped deck's frame; rebuilt only when the cabin or a tree moves
  const wells = useMemo(
    () =>
      masses.map((m) =>
        m.steps
          ? trees.map((t): TreeWell => {
              const [x, z] = buildingToMass(m, siteToLocal(o.position, o.rotation, [t.x, t.n]))
              return { x, z, r: TREE_WELL_FT }
            })
          : NO_WELLS,
      ),
    [masses, trees, o.position, o.rotation],
  )

  return (
    <group position={toScene(o.position.x, o.position.n, base)} rotation={[0, (o.rotation * Math.PI) / 180, 0]} userData={{ objectId: o.id }}>
      {masses.map((m, i) => (
        <group key={i} position={[ftToM(m.dx), ftToM(m.lvl), ftToM(m.dz)]} rotation={[0, (m.rot * Math.PI) / 180, 0]}>
          {m.kind === 'wall' && <WallMass m={m} look={look} site={siteFor(m, i)} supports={supports} handlers={handlers} highlight={focus?.objectId === o.id && focus.mass === i ? focus.cutId : null} />}
          {m.kind === 'porch' && <PorchMass m={m} look={look} site={siteFor(m, i)} handlers={handlers} />}
          {m.kind === 'deck' && <DeckMass m={m} look={look} site={siteFor(m, i)} handlers={handlers} wells={wells[i]} />}
          {m.kind === 'stair' && <StairMass m={m} look={look} site={siteFor(m, i)} handlers={handlers} />}
        </group>
      ))}
    </group>
  )
}

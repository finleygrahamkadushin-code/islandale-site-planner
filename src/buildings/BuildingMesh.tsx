import { useMemo } from 'react'
import { localToSite, siteToLocal, type LocalPoint } from './footprint'
import { TREE_WELL_FT, type TreeWell } from './decks/deckSteps'
import { buildingMasses, buildingToMass, massBuildingPoly, massToBuilding } from './masses'
import { railStyleOf } from './rails/railEdits'
import { buildingSupports } from './foundation/supportParams'
import { insideAny } from './decks/wingPosts'
import { ftToM } from '../site/units'
import { usePlanStore } from '../store/planStore'
import type { PlanObject } from '../store/types'
import { AccessMass } from './stairs/AccessMass'
import { buildingLook, type MassSite } from '../scene/buildingLook'
import { toScene } from '../scene/frame'
import { DeckMass, PorchMass } from './decks/OpenMass'
import { baseElevation } from '../scene/placement'
import { objectRailSite } from './rails/railSite'
import { useDisplayStyle } from '../scene/useDisplayStyle'
import { useObjectInteraction } from '../scene/useObjectInteraction'
import { useEarthworks } from '../scene/useEarthworks'
import { useRailWorld } from './rails/useRailWorld'
import { WallMass } from './walls/WallMass'
import { InteriorMesh } from '../scene/InteriorMesh'
import { useShallow } from 'zustand/react/shallow'

const NO_WELLS: readonly TreeWell[] = []

/** A cabin: its main walls plus every wing (porches, decks, stairs, ramps), each set at its offset, turn and level. */
export function BuildingMesh({ o }: { readonly o: PlanObject }) {
  const terrain = usePlanStore((s) => s.site.terrain)
  const { ground } = useEarthworks()
  const railWorld = useRailWorld()
  const style = useDisplayStyle()
  const { selected, hovered, handlers } = useObjectInteraction(o)
  const focus = usePlanStore((s) => s.openingFocus)
  const masses = useMemo(() => buildingMasses(o.params), [o.params])
  const outlines = useMemo(() => masses.map(massBuildingPoly), [masses])
  const closed = useMemo(() => outlines.filter((_, i) => !masses[i].open), [masses, outlines])
  const trees = usePlanStore(useShallow((s) => s.plan.order.map((id) => s.plan.objects[id]).filter((t) => t?.type === 'tree' && !t.hidden).map((t) => t.position)))

  const base = baseElevation(terrain, o)
  const look = buildingLook(o, style, selected ? 1 : hovered ? 0.4 : 0)
  // the main mass's supports (legacy supportsMesh): a size of its own, else each kind's own (piers and pilings 10 in)
  const supports = useMemo(() => buildingSupports(o.params), [o.params.support, o.params.postSpacing, o.params.postSize, o.params.bracing, o.params.mastAt]) // eslint-disable-line react-hooks/exhaustive-deps
  // rails per mass and edge, with the stairs, paths, bridges, doors and walls that open them
  const rails = useMemo(() => objectRailSite(railWorld, o), [railWorld, o])
  // one site per mass, rebuilt only when the cabin, the ground or what opens its rails changes
  const sites = useMemo(
    () =>
      masses.map(
        (m, index): MassSite => ({
          mi: index,
          floor: base + ftToM(m.lvl),
          groundAt: (x, z) => {
            const [sx, sn] = localToSite(o.position, o.rotation, massToBuilding(m, [x, z]))
            return ground(sx, sn)
          },
          insideWalls: (p: LocalPoint) => insideAny(closed, massToBuilding(m, p)),
          insideOther: (p: LocalPoint) => insideAny(outlines.filter((_, j) => j !== index), massToBuilding(m, p)),
          rails: rails.rails[index] ?? null,
          railStyle: railStyleOf(o.params, index),
          inDoorway: rails.inDoorway(index),
          clearTop: rails.clearTop(index),
        }),
      ),
    [masses, outlines, closed, ground, base, o.position, o.rotation, o.params, rails],
  )

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
        <group key={i} position={[ftToM(m.dx), ftToM(m.lvl), ftToM(m.dz)]} rotation={[0, (m.rot * Math.PI) / 180, 0]} userData={{ mass: i }}>
          {m.kind === 'wall' && <WallMass m={m} params={o.params} look={look} site={sites[i]} supports={supports} handlers={handlers} highlight={focus?.objectId === o.id && focus.mass === i ? focus.cutId : null} />}
          {m.kind === 'porch' && <PorchMass m={m} look={look} site={sites[i]} handlers={handlers} />}
          {m.kind === 'deck' && <DeckMass m={m} look={look} site={sites[i]} handlers={handlers} wells={wells[i]} />}
          {(m.kind === 'stair' || m.kind === 'ramp') && <AccessMass masses={masses} mi={i} look={look} site={sites[i]} handlers={handlers} />}
        </group>
      ))}
      <InteriorMesh params={o.params} style={look.style} handlers={handlers} />
    </group>
  )
}

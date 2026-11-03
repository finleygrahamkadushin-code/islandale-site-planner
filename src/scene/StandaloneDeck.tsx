import { useMemo } from 'react'
import type { TreeWell } from '../buildings/deckSteps'
import { localToSite, num } from '../buildings/footprint'
import { deckObjectMass } from '../buildings/masses'
import { railStyleOf } from '../buildings/railEdits'
import { ftToM } from '../site/units'
import { usePlanStore } from '../store/planStore'
import type { PlanObject } from '../store/types'
import { buildingLook, type MassSite } from './buildingLook'
import { toScene } from './frame'
import { DeckMass, type DeckSupports } from './OpenMass'
import { baseElevation } from './placement'
import { objectRailSite } from './railSite'
import { useDisplayStyle } from './useDisplayStyle'
import { useEarthworks } from './useEarthworks'
import { useObjectInteraction } from './useObjectInteraction'
import { useRailWorld } from './useRailWorld'

const NO_WELLS: readonly TreeWell[] = []
const never = () => false
/** Legacy default post spacing for a standalone deck, feet. */
const DECK_POST_SPACING_FT = 8

/**
 * A standalone deck (type 'deck'): a board floor following its outline
 * (straight or curved) at its height above the ground, on its own supports
 * (legacy supportsMesh: posts by default, a ring and grid with ring and row
 * beams under a curve), with guards by the old planner's guardRing rule
 * (every edge when it is more than 30 in up or its rail is on) until an
 * edge is set, then per edge.
 */
export function StandaloneDeckMesh({ o }: { readonly o: PlanObject }) {
  const terrain = usePlanStore((s) => s.site.terrain)
  const { ground } = useEarthworks()
  const railWorld = useRailWorld()
  const style = useDisplayStyle()
  const { selected, hovered, handlers } = useObjectInteraction(o)
  const m = useMemo(() => deckObjectMass(o.params), [o.params])
  const supports = useMemo((): DeckSupports => deckSupports(o.params), [o.params])
  const top = baseElevation(terrain, o, ground) + ftToM(Math.max(0, num(o.params.h, 0)))
  const rails = useMemo(() => objectRailSite(railWorld, o), [railWorld, o])
  const site = useMemo(
    (): MassSite => ({
      floor: top,
      groundAt: (x, z) => {
        const [sx, sn] = localToSite(o.position, o.rotation, [x, z])
        return ground(sx, sn)
      },
      insideWalls: never,
      insideOther: never,
      rails: rails.rails[0] ?? null,
      railStyle: railStyleOf(o.params, 0),
      inDoorway: never,
    }),
    [top, ground, o.position, o.rotation, o.params, rails],
  )
  const look = buildingLook(o, style, selected ? 1 : hovered ? 0.4 : 0)
  return (
    <group position={toScene(o.position.x, o.position.n, top)} rotation={[0, (o.rotation * Math.PI) / 180, 0]} userData={{ objectId: o.id }}>
      <group userData={{ mass: 0 }}>
        <DeckMass m={m} look={look} site={site} handlers={handlers} wells={NO_WELLS} supports={supports} />
      </group>
    </group>
  )
}

/** A standalone deck's supports: 'auto' (or none) is posts, as the old planner drew decks. */
function deckSupports(p: Readonly<Record<string, unknown>>): DeckSupports {
  const support = typeof p.support === 'string' && p.support !== 'auto' ? p.support : 'posts'
  const postIn = typeof p.postSize === 'number' && Number.isFinite(p.postSize) ? p.postSize : undefined
  return { support, spacingFt: num(p.postSpacing, DECK_POST_SPACING_FT), postIn, bracing: p.bracing === true }
}

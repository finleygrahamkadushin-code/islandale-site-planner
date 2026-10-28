import { useEffect, useMemo } from 'react'
import { DoubleSide } from 'three'
import { useShallow } from 'zustand/react/shallow'
import { boardwalkColumns, boardwalkPath, buildBoardwalk } from '../buildings/boardwalk'
import { localToSite, num } from '../buildings/footprint'
import { pointInPolygon } from '../buildings/foundation'
import { buildingMasses, massBuildingPoly } from '../buildings/masses'
import { elevationAt } from '../site/terrain'
import { ftToM } from '../site/units'
import { usePlanStore } from '../store/planStore'
import type { PlanObject } from '../store/types'
import { toGeometry } from './meshData'
import { Surface } from './Surface'
import { useDisplayStyle } from './useDisplayStyle'
import { useObjectInteraction } from './useObjectInteraction'

/** Legacy ribbon colours: pale deck, white body, glass balustrade. */
const DECK = '#d3cdc1'
const BODY = '#f1eee8'
const STEEL = '#e9e7e2'
const GLASS = '#a9d6e2'

/** A boardwalk: a smooth ribbon through its route points, glass-railed both sides, on Y columns where it leaves the ground. */
export function BridgeMesh({ o }: { readonly o: PlanObject }) {
  const { selected, hovered, handlers } = useObjectInteraction(o)
  const style = useDisplayStyle()
  const terrain = usePlanStore((s) => s.site.terrain)
  const buildings = usePlanStore(useShallow((s) => s.plan.order.map((id) => s.plan.objects[id]).filter((b) => b?.type === 'house')))
  const width = ftToM(num(o.params.w, 5))
  const route = useMemo(() => routePoints(o), [o])
  const mesh = useMemo(() => {
    const path = boardwalkPath(route)
    if (!path) return null
    const walls = buildings.flatMap((b) =>
      buildingMasses(b.params)
        .filter((m) => !m.open)
        .map((m) => massBuildingPoly(m).map((p) => localToSite(b.position, b.rotation, p))),
    )
    const ground = (x: number, n: number) => elevationAt(terrain, x, n)
    const inBuilding = (x: number, n: number) => walls.some((poly) => pointInPolygon(poly, x, n))
    const parts = buildBoardwalk(path, width, boardwalkColumns(path, ground, inBuilding), ground)
    return { deck: toGeometry(parts.deck), body: toGeometry(parts.body), glass: toGeometry(parts.glass), steel: toGeometry(parts.steel) }
  }, [route, width, terrain, buildings])
  useEffect(
    () => () => {
      if (mesh) Object.values(mesh).forEach((g) => g.dispose())
    },
    [mesh],
  )
  if (!mesh) return null
  const glow = selected ? 1 : hovered ? 0.4 : 0
  return (
    <group name="bridge" userData={{ objectId: o.id }}>
      <mesh geometry={mesh.deck} castShadow receiveShadow {...handlers}>
        <Surface kind="deck" style={style} color={DECK} texture="deck" glow={glow} />
      </mesh>
      <mesh geometry={mesh.body} castShadow receiveShadow {...handlers}>
        <Surface kind="trim" style={style} color={BODY} glow={glow} />
      </mesh>
      <mesh geometry={mesh.glass} {...handlers}>
        <meshStandardMaterial color={GLASS} transparent opacity={0.32} roughness={0.1} side={DoubleSide} depthWrite={false} />
      </mesh>
      <mesh geometry={mesh.steel} castShadow {...handlers}>
        <Surface kind="trim" style={style} color={STEEL} glow={glow} />
      </mesh>
    </group>
  )
}

/** Route points in the site frame: position + relative route, rotated with the object; elevations in metres. */
export function routePoints(o: PlanObject): readonly (readonly [number, number, number])[] {
  const route = Array.isArray(o.params.route) ? (o.params.route as (readonly number[])[]) : []
  const a = (o.rotation * Math.PI) / 180
  const c = Math.cos(a)
  const s = Math.sin(a)
  return route
    .filter((p) => p.length >= 3)
    .map(([dx, dn, elevFt]) => [o.position.x + dx * c - dn * s, o.position.n + dx * s + dn * c, ftToM(elevFt)] as const)
}

import { useEffect, useMemo } from 'react'
import type { BufferGeometry } from 'three'
import { useShallow } from 'zustand/react/shallow'
import { boardwalkPath, routePoints } from './boardwalk'
import { bridgeLayout, bridgeStyle, buildBridge, type BridgeMeshes, type BridgeStyle } from './bridges'
import { localToSite, num } from '../footprint'
import { pointInPolygon } from '../foundation/foundation'
import { buildingMasses, massBuildingPoly } from '../masses'
import { elevationAt } from '../../site/terrain'
import { ftToM } from '../../site/units'
import { usePlanStore } from '../../store/planStore'
import type { DisplayStyle, PlanObject } from '../../store/types'
import { Surface } from '../../scene/Surface'
import { toGeometry } from '../../scene/meshData'
import { useDisplayStyle } from '../../scene/useDisplayStyle'
import { useObjectInteraction } from '../../scene/useObjectInteraction'

/** Legacy bridge colours by style: steel (the object's colour wins), deck boards and deck body. */
const STEEL: Readonly<Record<BridgeStyle, string>> = { ribbon: '#e9e7e2', cable: '#eceae4', truss: '#4d5257' }
const DECK: Readonly<Record<BridgeStyle, string>> = { ribbon: '#d3cdc1', cable: '#a8835c', truss: '#a8835c' }
const BODY: Readonly<Record<BridgeStyle, string>> = { ribbon: '#f1eee8', cable: '#55595e', truss: '#55595e' }

type Piece = keyof BridgeMeshes
/** Each piece's paint part: walking surface and body 'deck', guards 'rail', what holds it up 'post'. */
const PART: Readonly<Record<Piece, string>> = { deck: 'deck', body: 'deck', glass: 'rail', rail: 'rail', frame: 'rail', cable: 'post', posts: 'post', piers: 'post' }

/**
 * A bridge along its route points in its style (legacy specMesh): a
 * glass-railed ribbon on Y columns, a steel truss on leg pairs, or a cable
 * bridge hung from a mid-span mast. Columns only stand where the deck is
 * well off the ground and not over a building.
 */
export function BridgeMesh({ o }: { readonly o: PlanObject }) {
  const { selected, hovered, handlers } = useObjectInteraction(o)
  const style = useDisplayStyle()
  const terrain = usePlanStore((s) => s.site.terrain)
  const buildings = usePlanStore(useShallow((s) => s.plan.order.map((id) => s.plan.objects[id]).filter((b) => b?.type === 'house')))
  const width = ftToM(num(o.params.w, 5))
  const kind = bridgeStyle(o.params.style)
  const route = useMemo(() => routePoints(o), [o])
  const pieces = useMemo(() => {
    const path = boardwalkPath(route)
    if (!path) return []
    const walls = buildings.flatMap((b) =>
      buildingMasses(b.params)
        .filter((m) => !m.open)
        .map((m) => massBuildingPoly(m).map((p) => localToSite(b.position, b.rotation, p))),
    )
    const ground = (x: number, n: number) => elevationAt(terrain, x, n)
    const inBuilding = (x: number, n: number) => walls.some((poly) => pointInPolygon(poly, x, n))
    const meshes = buildBridge(bridgeLayout(path, width, kind, ground, inBuilding), ground)
    return (Object.keys(meshes) as Piece[]).filter((k) => meshes[k].positions.length > 0).map((k) => ({ key: k, geometry: toGeometry(meshes[k]) }))
  }, [route, width, kind, terrain, buildings])
  useEffect(() => () => pieces.forEach((p) => p.geometry.dispose()), [pieces])
  if (!pieces.length) return null
  const glow = selected ? 1 : hovered ? 0.4 : 0
  const steel = typeof o.params.color === 'string' ? o.params.color : STEEL[kind]
  const deck = typeof o.params.deckColor === 'string' ? o.params.deckColor : DECK[kind]
  return (
    <group name="bridge" userData={{ objectId: o.id, bridgeStyle: kind }}>
      {pieces.map((p) => (
        <BridgePiece key={p.key} piece={p.key} geometry={p.geometry} style={style} glow={glow} steel={steel} deck={deck} body={BODY[kind]} handlers={handlers} />
      ))}
    </group>
  )
}

interface BridgePieceProps {
  readonly piece: Piece
  readonly geometry: BufferGeometry
  readonly style: DisplayStyle
  readonly glow: number
  readonly steel: string
  readonly deck: string
  readonly body: string
  readonly handlers: ReturnType<typeof useObjectInteraction>['handlers']
}

function BridgePiece({ piece, geometry, style, glow, steel, deck, body, handlers }: BridgePieceProps) {
  const see = piece === 'glass'
  return (
    <mesh name={piece} geometry={geometry} userData={{ part: PART[piece] }} castShadow={!see} receiveShadow={piece === 'deck'} {...handlers}>
      {piece === 'deck' && <Surface kind="deck" style={style} color={deck} texture="deck" glow={glow} />}
      {piece === 'body' && <Surface kind="trim" style={style} color={body} glow={glow} />}
      {piece === 'glass' && <Surface kind="railGlass" style={style} />}
      {(piece === 'rail' || piece === 'frame' || piece === 'posts') && <Surface kind="trim" style={style} color={steel} glow={glow} />}
      {piece === 'cable' && <Surface kind="frame" style={style} glow={glow} />}
      {piece === 'piers' && <Surface kind="concrete" style={style} texture="concrete" glow={glow} />}
    </mesh>
  )
}

export { routePoints }

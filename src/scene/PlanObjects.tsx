import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { isObjectVisible, usePlanStore } from '../store/planStore'
import { ObjectMesh } from './ObjectMesh'
import { BuildingMesh } from '../buildings/BuildingMesh'
import { TreeMesh } from './TreeMesh'
import { BridgeMesh } from '../buildings/decks/BridgeMesh'
import { StandaloneDeckMesh } from '../buildings/decks/StandaloneDeck'
import { PathPieceMesh } from '../paths/PathPieceMesh'
import { MeadowMesh } from './MeadowMesh'
import { BoulderMesh } from './BoulderMesh'
import { PoolMesh } from './PoolMesh'
import { ShedMesh } from './ShedMesh'
import { PondMesh } from './PondMesh'
import { pieceKind } from '../paths/pieces'
import type { DragState } from './editing'

export function PlanObjects({ drag }: { readonly drag: DragState | null }) {
  const ids = usePlanStore(useShallow((s) => s.plan.order.filter((id) => isObjectVisible(s, id))))
  return (
    <group name="plan">
      {ids.map((id) => (
        <PlanObjectView key={id} id={id} drag={drag?.id === id ? drag : null} />
      ))}
    </group>
  )
}

function PlanObjectView({ id, drag }: { readonly id: string; readonly drag: DragState | null }) {
  const stored = usePlanStore((s) => s.plan.objects[id])
  // While dragging, draw the object where the pointer has it, not where the store has it.
  const o = useMemo(() => (drag ? { ...stored, ...drag.patch(stored) } : stored), [stored, drag])
  if (o.type === 'tree') return <TreeMesh o={o} />
  if (o.type === 'bridge') return <BridgeMesh o={o} />
  if (o.type === 'house') return <BuildingMesh o={o} />
  if (o.type === 'deck') return <StandaloneDeckMesh o={o} />
  if (o.type === 'shed' || o.type === 'shop') return <ShedMesh o={o} />
  if (o.type === 'meadow') return <MeadowMesh o={o} />
  if (o.type === 'boulder') return <BoulderMesh o={o} />
  if (o.type === 'pool') return <PoolMesh o={o} />
  if (o.type === 'pond') return <PondMesh o={o} />
  if (o.type === 'pad' && typeof o.params.kind === 'string' && pieceKind(o) !== 'walk') return <PathPieceMesh o={o} />
  return <ObjectMesh o={o} />
}

import { memo, useCallback, useMemo, type ReactNode } from 'react'
import type { ThreeEvent } from '@react-three/fiber'
import { useShallow } from 'zustand/react/shallow'
import { isObjectVisible, usePlanStore } from '../store/planStore'
import { ObjectMesh } from '../site/objects/ObjectMesh'
import { BuildingMesh } from '../buildings/BuildingMesh'
import { TreeMesh } from '../site/objects/TreeMesh'
import { BridgeMesh } from '../buildings/decks/BridgeMesh'
import { StandaloneDeckMesh } from '../buildings/decks/StandaloneDeck'
import { PathPieceMesh } from '../paths/PathPieceMesh'
import { MeadowMesh } from '../site/objects/MeadowMesh'
import { BoulderMesh } from '../site/objects/BoulderMesh'
import { PoolMesh } from '../site/objects/PoolMesh'
import { ShedMesh } from '../site/objects/ShedMesh'
import { PondMesh } from '../site/objects/PondMesh'
import { pieceKind } from '../paths/pieces'
import { dragMoves, type DragState } from './editing'
import { Ghosted } from './Ghosted'
import { claimDoubleClick, isOutside, useIsolate } from '../tools/isolate'
import { isPresenting } from '../present/present'

export function PlanObjects({ drag }: { readonly drag: DragState | null }) {
  const isolation = useIsolate((s) => s.isolation)
  const hideRest = useIsolate((s) => s.hideRest)
  const visible = usePlanStore(useShallow((s) => s.plan.order.filter((id) => isObjectVisible(s, id))))
  // isolate mode: the rest is hidden, or drawn as a ghost that can't be picked
  const ids = hideRest ? visible.filter((id) => !isOutside(isolation, id)) : visible
  return (
    <group name="plan">
      {ids.map((id) => (
        <IsolateWrap key={id} id={id} faded={isOutside(isolation, id)}>
          <PlanObjectView id={id} drag={dragMoves(drag, id) ? drag : null} />
        </IsolateWrap>
      ))}
    </group>
  )
}

/** Double-click an object (or a member of a group) to isolate it; faded objects take no pointer at all. */
function IsolateWrap({ id, faded, children }: { readonly id: string; readonly faded: boolean; readonly children: ReactNode }) {
  const onDoubleClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation()
      if (isPresenting()) return
      claimDoubleClick(e.nativeEvent)
      const s = usePlanStore.getState()
      useIsolate.getState().enter(s.plan, id)
      const focus = useIsolate.getState().isolation
      // a single object stays selected for editing; in an open group, click the member to edit
      s.pickPart(null)
      s.select(focus && !focus.group ? focus.focus : [])
    },
    [id],
  )
  return (
    <group onDoubleClick={onDoubleClick}>
      <Ghosted on={faded}>{children}</Ghosted>
    </group>
  )
}

/** One object's meshes; memoised, so a drag step re-renders only the objects it moves (R8.3). */
const PlanObjectView = memo(function PlanObjectView({ id, drag }: { readonly id: string; readonly drag: DragState | null }) {
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
})

import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { isObjectVisible, usePlanStore } from '../store/planStore'
import { ObjectMesh } from './ObjectMesh'
import { BuildingMesh } from './BuildingMesh'
import { TreeMesh } from './TreeMesh'
import { BridgeMesh } from './BridgeMesh'
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
  return <ObjectMesh o={o} />
}

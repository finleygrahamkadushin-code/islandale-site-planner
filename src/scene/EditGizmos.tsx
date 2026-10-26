import { useMemo } from 'react'
import { usePlanStore } from '../store/planStore'
import { SelectionGizmo } from './SelectionGizmo'
import { ResizeHandles } from './ResizeHandles'
import type { DragState } from './editing'

/** Gizmos for the single selected object, drawn where the live drag has it. */
export function EditGizmos({ drag, setDrag }: { readonly drag: DragState | null; readonly setDrag: (d: DragState | null) => void }) {
  const selection = usePlanStore((s) => s.selection)
  const id = selection.length === 1 ? selection[0] : null
  const stored = usePlanStore((s) => (id ? s.plan.objects[id] : undefined))
  const o = useMemo(() => (stored && drag?.id === stored.id ? { ...stored, ...drag.patch(stored) } : stored), [stored, drag])
  if (!o) return null
  return (
    <>
      <SelectionGizmo o={o} setDrag={setDrag} />
      <ResizeHandles o={o} setDrag={setDrag} />
    </>
  )
}

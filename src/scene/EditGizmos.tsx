import { useMemo } from 'react'
import { pickedPartOf, usePlanStore } from '../store/planStore'
import { SelectionGizmo } from './SelectionGizmo'
import { ResizeHandles } from './ResizeHandles'
import { PartLayer } from './PartLayer'
import type { DragState } from './editing'

/**
 * Gizmos for the single selected object, drawn where the live drag has it.
 * While a part of it is picked, the whole-object move ring and corner
 * handles give way to the part's own outline and handles.
 */
export function EditGizmos({ drag, setDrag }: { readonly drag: DragState | null; readonly setDrag: (d: DragState | null) => void }) {
  const selection = usePlanStore((s) => s.selection)
  const id = selection.length === 1 ? selection[0] : null
  const stored = usePlanStore((s) => (id ? s.plan.objects[id] : undefined))
  const part = usePlanStore(pickedPartOf)
  const o = useMemo(() => (stored && drag?.id === stored.id ? { ...stored, ...drag.patch(stored) } : stored), [stored, drag])
  if (!o) return null
  const picked = part?.objectId === o.id ? part.mass : null
  return (
    <>
      {picked === null && <SelectionGizmo o={o} setDrag={setDrag} />}
      {picked === null && <ResizeHandles o={o} setDrag={setDrag} />}
      <PartLayer o={o} picked={picked} dragging={drag !== null} setDrag={setDrag} />
    </>
  )
}

import { useShallow } from 'zustand/react/shallow'
import { isLabelShown, usePlanStore } from '../store/planStore'
import { isOutside, useIsolate } from '../tools/isolate'
import { labelElements } from './labelRegistry'

/** Name labels as plain DOM elements over the canvas; `LabelProjector` positions them each frame. */
export function LabelLayer() {
  const isolation = useIsolate((s) => s.isolation)
  // isolate mode: the rest's labels go with it
  const ids = usePlanStore(useShallow((s) => s.plan.order.filter((id) => isLabelShown(s, id) && !isOutside(isolation, id))))
  return (
    <div className="labels">
      {ids.map((id) => (
        <LabelDiv key={id} id={id} />
      ))}
    </div>
  )
}

function LabelDiv({ id }: { readonly id: string }) {
  const name = usePlanStore((s) => s.plan.objects[id]?.name ?? '')
  const selected = usePlanStore((s) => s.selection.includes(id))
  return (
    <div
      ref={(el) => {
        if (el) labelElements.set(id, el)
        else labelElements.delete(id)
      }}
      className={`label${selected ? ' selected' : ''}`}
      data-object-id={id}
      style={{ display: 'none' }}
    >
      {name}
    </div>
  )
}

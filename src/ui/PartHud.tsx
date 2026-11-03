import { useMemo } from 'react'
import { buildingMasses } from '../buildings/masses'
import { hudText } from '../buildings/partFields'
import type { DragState } from '../scene/editing'
import { pickedPartOf, usePlanStore } from '../store/planStore'

/** "Editing: Deck 3 · 12 × 10 ft · …" over the view while a part is picked, live during a drag (legacy hud-wing chip). */
export function PartHud({ drag }: { readonly drag: DragState | null }) {
  const part = usePlanStore(pickedPartOf)
  const stored = usePlanStore((s) => (part ? s.plan.objects[part.objectId] : undefined))
  const text = useMemo(() => {
    if (!part || !stored) return null
    const o = drag?.id === stored.id ? { ...stored, ...drag.patch(stored) } : stored
    const m = buildingMasses(o.params)[part.mass]
    return m ? hudText(m, part.mass) : null
  }, [part, stored, drag])
  if (!text) return null
  return (
    <div className="part-hud" data-testid="part-hud" role="status">
      {text}
    </div>
  )
}

import { memo, useCallback, useSyncExternalStore } from 'react'
import { invalidate } from '@react-three/fiber'
import { chipElements, chipViews, subscribeChips, type ChipView } from './chipRegistry'

/** Part chips (handles, + and rail chips, the + menu) as plain DOM over the canvas; `ScreenChip` moves each one every frame. */
export function ChipLayer() {
  const views = useSyncExternalStore(subscribeChips, chipViews)
  return (
    <div className="chips">
      {views.map((v) => (
        <ChipAnchor key={v.id} view={v} />
      ))}
    </div>
  )
}

/** One chip; memoised on its view, which the registry keeps while the chip is unchanged, so one chip changing redraws only that chip (R8.3). */
const ChipAnchor = memo(function ChipAnchor({ view }: { readonly view: ChipView }) {
  const { id } = view
  const register = useCallback(
    (el: HTMLDivElement | null) => {
      if (!el) return void chipElements.delete(id)
      chipElements.set(id, el)
      // the view draws on demand (R8.1): a new chip is placed on the next frame, so ask for one
      invalidate()
    },
    [id],
  )
  return (
    <div ref={register} className="chip-anchor" style={{ zIndex: view.layer, display: 'none' }}>
      {view.node}
    </div>
  )
})

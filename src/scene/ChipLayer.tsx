import { useSyncExternalStore } from 'react'
import { chipElements, chipViews, subscribeChips } from './chipRegistry'

/** Part chips (handles, + and rail chips, the + menu) as plain DOM over the canvas; `ScreenChip` moves each one every frame. */
export function ChipLayer() {
  const views = useSyncExternalStore(subscribeChips, chipViews)
  return (
    <div className="chips">
      {views.map((v) => (
        <div
          key={v.id}
          ref={(el) => {
            if (el) chipElements.set(v.id, el)
            else chipElements.delete(v.id)
          }}
          className="chip-anchor"
          style={{ zIndex: v.layer, display: 'none' }}
        >
          {v.node}
        </div>
      ))}
    </div>
  )
}

import { useSyncExternalStore } from 'react'
import { invalidate } from '@react-three/fiber'
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
            if (!el) return void chipElements.delete(v.id)
            chipElements.set(v.id, el)
            // the view draws on demand (R8.1): a new chip is placed on the next frame, so ask for one
            invalidate()
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

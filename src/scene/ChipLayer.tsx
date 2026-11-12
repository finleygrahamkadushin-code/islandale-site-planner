import { memo, useCallback, useEffect, useRef, useSyncExternalStore, type RefObject } from 'react'
import { invalidate } from '@react-three/fiber'
import { chipElements, chipViews, subscribeChips, type ChipView } from './chipRegistry'

/** The same wheel turn, for the canvas: the orbit controls zoom on what reaches them. */
const wheelCopy = (e: WheelEvent): WheelEvent =>
  new WheelEvent('wheel', {
    deltaX: e.deltaX,
    deltaY: e.deltaY,
    deltaZ: e.deltaZ,
    deltaMode: e.deltaMode,
    clientX: e.clientX,
    clientY: e.clientY,
    screenX: e.screenX,
    screenY: e.screenY,
    ctrlKey: e.ctrlKey,
    shiftKey: e.shiftKey,
    altKey: e.altKey,
    metaKey: e.metaKey,
    bubbles: true,
    cancelable: true,
  })

/**
 * A chip under the pointer would take the wheel, so zoom did nothing there
 * (R9.10): the layer hands every wheel turn on a chip to the canvas below.
 * No chip scrolls, and clicks are untouched. Labels let the pointer through
 * already (`.labels` has no pointer events).
 */
function useWheelToCanvas(layer: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const el = layer.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      const canvas = el.closest('.viewport')?.querySelector('canvas')
      if (!canvas) return
      e.preventDefault()
      e.stopPropagation()
      canvas.dispatchEvent(wheelCopy(e))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [layer])
}

/** Part chips (handles, + and rail chips, the + menu) as plain DOM over the canvas; `ScreenChip` moves each one every frame. */
export function ChipLayer() {
  const views = useSyncExternalStore(subscribeChips, chipViews)
  const layer = useRef<HTMLDivElement>(null)
  useWheelToCanvas(layer)
  return (
    <div className="chips" ref={layer}>
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

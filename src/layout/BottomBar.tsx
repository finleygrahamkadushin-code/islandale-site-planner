import { useEarthworks } from '../site/earthworks/useEarthworks'
import { groundReadout, usePointerGround } from '../site/pointer'
import { usePlanStore } from '../store/planStore'

/**
 * Under the 3D view, left of the side panel (4B): the ground under the
 * pointer (elevation NAVD88 and slope, with earthworks applied) and the one
 * line on how to move the camera.
 */
export function BottomBar() {
  const at = usePointerGround((s) => s.at)
  const { ground } = useEarthworks()
  const measured = usePlanStore((s) => s.measurements.length)
  const clear = usePlanStore((s) => s.clearMeasurements)
  const r = at ? groundReadout(ground, at.x, at.n) : null
  return (
    <div className="bottombar" aria-label="Pointer readout">
      <span role="status" data-testid="pointer-readout" className="readout">
        {r ? `Ground ${r.elevFt.toFixed(1)} ft NAVD88 · slope ${r.slopePct.toFixed(0)} %` : 'Point at the ground to read its height'}
      </span>
      <span className="muted">Drag to orbit · right-drag to pan · scroll to zoom</span>
      {measured > 0 && (
        <button type="button" data-testid="clear-measurements" onClick={clear}>
          Clear {measured} {measured === 1 ? 'measurement' : 'measurements'}
        </button>
      )}
    </div>
  )
}

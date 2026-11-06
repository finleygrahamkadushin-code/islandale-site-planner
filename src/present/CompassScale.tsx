import { useViewHud } from './viewState'
import { scaleBar } from './viewMaths'
import { Tip } from '../guide/Tip'

/** The compass and scale bar in the corner of the 3D view (4D), in every tab. */
export function CompassScale() {
  const heading = useViewHud((s) => s.headingDeg)
  const mPerPx = useViewHud((s) => s.mPerPx)
  const exact = useViewHud((s) => s.exact)
  const faceNorth = useViewHud((s) => s.faceNorth)
  const bar = scaleBar(mPerPx)
  return (
    <div className="view-hud" data-testid="view-hud">
      <Tip label="Turn the view to face north" side="left">
        <button type="button" className="compass" aria-label={`Compass: the view faces ${Math.round(heading)}° from north. Turn to face north`} onClick={faceNorth} data-testid="compass">
          <svg viewBox="-20 -20 40 40" width="40" height="40" aria-hidden="true">
            <circle r="18" className="compass-ring" />
            <g style={{ transform: `rotate(${-heading}deg)` }} data-testid="compass-needle">
              <path d="M0 -14 L5 2 L0 -1 L-5 2 Z" className="compass-north" />
              <path d="M0 14 L5 2 L0 -1 L-5 2 Z" className="compass-south" />
              <text y="-15.5" className="compass-n">
                N
              </text>
            </g>
          </svg>
        </button>
      </Tip>
      <div className="scale-bar" data-testid="scale-bar" aria-label={`Scale: ${bar.ft} feet${exact ? '' : ' at the centre of the view'}`} role="img">
        <span className="scale-line" style={{ width: `${Math.round(bar.px)}px` }} />
        <span className="scale-text">
          {bar.ft} ft{exact ? '' : ' at centre'}
        </span>
      </div>
    </div>
  )
}

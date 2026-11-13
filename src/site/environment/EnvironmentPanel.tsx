import { HIGH_WATER_FT } from '../highWater'
import { clockZone, SEASONS, sunPosition } from './sun'
import { usePlanStore } from '../../store/planStore'
import { HOUR_RANGE, TIDE_RANGE_FT } from '../../store/types'
import { Tip } from '../../guide/Tip'

const fmtHour = (h: number): string => {
  const hh = Math.floor(h)
  const mm = Math.round((h - hh) * 60)
  const ampm = hh >= 12 ? 'pm' : 'am'
  const h12 = hh % 12 === 0 ? 12 : hh % 12
  return `${h12}:${String(mm).padStart(2, '0')} ${ampm}`
}

/** Season, time of day (clock time, with daylight saving in June and September) and tide. View settings: saved with the plan, not undo steps. */
export function EnvironmentPanel() {
  const env = usePlanStore((s) => s.environment)
  const setEnvironment = usePlanStore((s) => s.setEnvironment)
  const sun = sunPosition(env.season, env.hour)
  return (
    <section className="panel" aria-label="Sun and tide">
      <header>
        <strong>Sun and tide</strong>
      </header>
      <div className="seg" role="group" aria-label="Season">
        {SEASONS.map((s) => (
          <button key={s.id} className={env.season === s.id ? 'on' : ''} onClick={() => setEnvironment({ season: s.id })}>
            {s.label}
          </button>
        ))}
      </div>
      <label className="field">
        <span className="muted small">
          Time of day <em>{fmtHour(env.hour)}</em> {clockZone(env.season)}
          {sun.elevationDeg <= 0 ? ' · sun is down' : ''}
        </span>
        <input type="range" min={HOUR_RANGE.min} max={HOUR_RANGE.max} step={0.25} value={env.hour} aria-label="Time of day" onChange={(e) => setEnvironment({ hour: Number(e.target.value) })} />
      </label>
      <label className="field">
        <Tip label={`Water level in feet above the NAVD88 datum. Mean higher high water at Lopez is about ${HIGH_WATER_FT} ft.`}>
          <span className="muted small" tabIndex={0}>
            Tide <em>{env.tideFt.toFixed(1)} ft</em>
          </span>
        </Tip>
        <input type="range" min={TIDE_RANGE_FT.min} max={TIDE_RANGE_FT.max} step={0.2} value={env.tideFt} aria-label="Tide level" onChange={(e) => setEnvironment({ tideFt: Number(e.target.value) })} />
      </label>
    </section>
  )
}

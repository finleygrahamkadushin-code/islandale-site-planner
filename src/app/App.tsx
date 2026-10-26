import { Scene } from '../scene/Scene'
import { usePlanStore } from '../store/planStore'
import { ringArea } from '../site/parcel'
import { sqFtToAcres, sqMToSqFt } from '../site/units'
import { useKeyboardShortcuts } from '../ui/useKeyboardShortcuts'

export function App() {
  useKeyboardShortcuts()
  const plan = usePlanStore((s) => s.plan)
  const site = usePlanStore((s) => s.site)
  const lotSqFt = Math.round(sqMToSqFt(ringArea(site.parcel.ring)))
  return (
    <div className="app">
      <header className="topbar">
        <h1>{site.name}</h1>
        <span className="muted">{plan.name}</span>
        <span className="muted">
          lot {site.parcel.lotSqFt.toLocaleString()} sq ft · {sqFtToAcres(site.parcel.lotSqFt).toFixed(2)} ac
          {lotSqFt !== site.parcel.lotSqFt ? ` (ring ${lotSqFt.toLocaleString()})` : ''}
        </span>
        <span className="muted">
          terrain {site.terrain.nx}×{site.terrain.ny} @ {site.terrain.spacing} m
        </span>
      </header>
      <Scene />
    </div>
  )
}

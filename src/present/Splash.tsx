import { useEffect, useMemo, useState } from 'react'
import { useProgress } from '@react-three/drei'
import { usePlanStore } from '../store/planStore'
import { useSplash } from './viewState'

const FADE_MS = 400

/**
 * The loading splash (4D): over the 3D view until the shaders are compiled and
 * a frame is drawn, so the view never shows half built. It never takes clicks.
 */
export function Splash() {
  const ready = useSplash((s) => s.ready)
  const [gone, setGone] = useState(false)
  const { progress, active } = useProgress()
  const ring = usePlanStore((s) => s.site.parcel.ring)
  const outline = useMemo(() => {
    const xs = ring.map((p) => p[0])
    const ns = ring.map((p) => p[1])
    const minX = Math.min(...xs)
    const maxN = Math.max(...ns)
    const span = Math.max(Math.max(...xs) - minX, maxN - Math.min(...ns)) || 1
    return ring.map(([x, n]) => `${(((x - minX) / span) * 100).toFixed(1)},${(((maxN - n) / span) * 100).toFixed(1)}`).join(' ')
  }, [ring])

  useEffect(() => {
    if (!ready) return
    const t = window.setTimeout(() => setGone(true), FADE_MS)
    return () => window.clearTimeout(t)
  }, [ready])
  if (gone) return null
  return (
    <div className={`splash${ready ? ' done' : ''}`} data-testid="splash" aria-hidden={ready}>
      <svg viewBox="-4 -4 108 108" className="splash-lot" aria-hidden="true">
        <polygon points={outline} />
      </svg>
      <p className="splash-name">Islandale</p>
      <p className="splash-status" role="status">
        {active ? `Loading the site… ${Math.round(progress)}%` : 'Preparing the view…'}
      </p>
    </div>
  )
}

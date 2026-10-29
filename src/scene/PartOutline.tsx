import { useEffect, useMemo } from 'react'
import { BufferGeometry, Vector3 } from 'three'
import { surfaceAt } from '../buildings/attach'
import { massPoly, massToBuilding } from '../buildings/masses'
import { inGroup, type PartFrame } from './partFrame'

/** The outline floats this far over the walking surface (legacy). */
const LIFT_M = 0.08
const FALLBACK_ACCENT = '#d1581e'

/** The page's accent colour (CSS --accent), as the old planner's outline used. */
function accent(): string {
  if (typeof document === 'undefined') return FALLBACK_ACCENT
  return getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || FALLBACK_ACCENT
}

/** An accent line round the picked part, over everything (legacy wing-select outline). */
export function PartOutline({ frame, mi }: { readonly frame: PartFrame; readonly mi: number }) {
  const m = frame.masses[mi]
  const geometry = useMemo(() => {
    if (!m) return null
    const pts = massPoly(m).map((p) => new Vector3(...inGroup(frame, massToBuilding(m, p), surfaceAt(frame.masses, mi, frame.site, p) + LIFT_M)))
    return new BufferGeometry().setFromPoints(pts)
  }, [frame, m, mi])
  useEffect(() => () => geometry?.dispose(), [geometry])
  const color = useMemo(accent, [])
  if (!geometry) return null
  return (
    <lineLoop geometry={geometry} renderOrder={999} frustumCulled={false} raycast={() => null}>
      <lineBasicMaterial color={color} depthTest={false} transparent opacity={0.95} />
    </lineLoop>
  )
}

import { Html, Line } from '@react-three/drei'
import { usePlanStore } from '../store/planStore'
import { useEarthworks } from '../site/earthworks/useEarthworks'
import { usePointerGround } from '../site/pointer'
import { toScene } from '../scene/frame'
import { formatFeetInches } from '../ui/feetInches'
import { FT_PER_M } from '../site/units'
import { measureOf, type MeasurePoint, type Measurement } from './measure'

/** Measure lines float this far over what they were picked on, metres, so the ground doesn't swallow them. */
const LIFT_M = 0.08
const LINE_COLOR = '#d1581e'

const at = (p: MeasurePoint) => toScene(p.x, p.n, p.z + LIFT_M)
const ft = (m: number) => formatFeetInches(Math.abs(m) * FT_PER_M)

/** "24'-1" across · 24'-4" sloped · rises 3'-2"" (old planner measure label). */
export function measureText(m: Measurement): string {
  const rise = Math.abs(m.riseM) < 0.005 ? 'level' : `${m.riseM > 0 ? 'rises' : 'falls'} ${ft(m.riseM)}`
  return `${ft(m.horizontalM)} across · ${ft(m.slopeM)} sloped · ${rise}`
}

function MeasureLine({ m, live = false }: { readonly m: Measurement; readonly live?: boolean }) {
  const mid = toScene((m.a.x + m.b.x) / 2, (m.a.n + m.b.n) / 2, (m.a.z + m.b.z) / 2 + LIFT_M)
  return (
    <group>
      <Line points={[at(m.a), at(m.b)]} color={LINE_COLOR} lineWidth={3} dashed={live} dashSize={0.4} gapSize={0.25} depthTest={false} />
      <Html position={mid} center zIndexRange={[3, 3]} className="measure-label" data-testid="measure-label">
        {measureText(m)}
      </Html>
    </group>
  )
}

/**
 * The Measure tool in 3D (4B): each kept measurement as a line with its
 * label, and while measuring, a dashed line from the first point to the
 * ground under the pointer.
 */
export function MeasureLayer() {
  const measurements = usePlanStore((s) => s.measurements)
  const first = usePlanStore((s) => s.measuring?.a ?? null)
  const pointer = usePointerGround((s) => s.at)
  const { ground } = useEarthworks()
  const live = first && pointer ? measureOf(first, { x: pointer.x, n: pointer.n, z: ground(pointer.x, pointer.n) }) : null
  return (
    <>
      {measurements.map((m, i) => (
        <MeasureLine key={i} m={m} />
      ))}
      {live && <MeasureLine m={live} live />}
    </>
  )
}

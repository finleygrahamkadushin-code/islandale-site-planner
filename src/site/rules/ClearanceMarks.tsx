import { useMemo } from 'react'
import { Html, Line } from '@react-three/drei'
import { usePlanStore } from '../../store/planStore'
import { usePresent } from '../../present/present'
import { useInteriorView } from '../../interiors/editor/interiorView'
import { useLiveDrag } from '../../scene/editing'
import { toScene } from '../../scene/frame'
import { elevationAt } from '../terrain'
import type { SitePoint, Terrain } from '../types'
import { clearances, dimensionText, lotText, nearestText, shoreText } from './clearances'

/** Marks float this far over the ground, metres, and are drawn over it. */
const LIFT_M = 0.15
/** Lines are draped on the ground in steps of about this, metres. */
const DRAPE_STEP_M = 1
const LINE_COLOR = '#3d6f8f'
const WARN_COLOR = '#e0a458'
const DIM_COLOR = '#4a4a4a'

/** A site line draped on the ground, as scene points. */
function drape(terrain: Terrain, [ax, an]: SitePoint, [bx, bn]: SitePoint): [number, number, number][] {
  const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bn - an) / DRAPE_STEP_M))
  return Array.from({ length: steps + 1 }, (_, i) => {
    const x = ax + ((bx - ax) * i) / steps
    const n = an + ((bn - an) * i) / steps
    return toScene(x, n, elevationAt(terrain, x, n) + LIFT_M)
  })
}

const groundAt = (terrain: Terrain, [x, n]: SitePoint) => toScene(x, n, elevationAt(terrain, x, n) + LIFT_M)
const midOf = (a: SitePoint, b: SitePoint): SitePoint => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]

interface MarkLine {
  readonly key: string
  readonly from: SitePoint
  readonly to: SitePoint
  readonly text: string
  readonly warn: boolean
}

function ClearanceLine({ line, terrain }: { readonly line: MarkLine; readonly terrain: Terrain }) {
  const points = useMemo(() => drape(terrain, line.from, line.to), [terrain, line.from, line.to])
  const color = line.warn ? WARN_COLOR : LINE_COLOR
  return (
    <group>
      {points.length > 1 && (
        <Line points={points} color={color} lineWidth={2} dashed dashSize={0.5} gapSize={0.3} depthTest={false} renderOrder={10} />
      )}
      <Html position={groundAt(terrain, midOf(line.from, line.to))} center zIndexRange={[3, 3]} className="measure-label clearance-label" style={{ background: color }} data-testid="clearance-label">
        {line.text}
      </Html>
    </group>
  )
}

/**
 * The selection's clearances in 3D (5E, old `rebuildClearance` and
 * `drawLabels`): with exactly one object selected, a dashed line and label to
 * the shore, the nearest lot line and the nearest object, amber when inside a
 * setback, and the main box's edge lengths. Hidden in Present mode, while an
 * interior plan is open and during a drag; worked out only when the plan,
 * setbacks or layers change.
 */
export function ClearanceMarks() {
  const id = usePlanStore((s) => (s.selection.length === 1 ? s.selection[0] : null))
  const o = usePlanStore((s) => (id ? s.plan.objects[id] : undefined))
  const plan = usePlanStore((s) => s.plan)
  const site = usePlanStore((s) => s.site)
  const setbacks = usePlanStore((s) => s.setbacks)
  const layers = usePlanStore((s) => s.layers)
  const presenting = usePresent((s) => s.presenting)
  const interiorOpen = useInteriorView((s) => s.objectId !== null)
  const dragging = useLiveDrag((s) => s.drag !== null)
  const marks = useMemo(() => {
    if (!o || o.hidden) return null
    const c = clearances(o, plan, site, setbacks, layers)
    const lines: MarkLine[] = [
      ...(c.shore ? [{ key: 'shore', from: c.shore.from, to: c.shore.to, text: shoreText(c.shore, setbacks), warn: c.shore.insideBuffer }] : []),
      ...(c.lot ? [{ key: 'lot', from: c.lot.from, to: c.lot.to, text: lotText(c.lot), warn: c.lot.insideSetback || c.lot.crossesLot }] : []),
      ...(c.nearest ? [{ key: 'nearest', from: c.nearest.from, to: c.nearest.to, text: nearestText(c.nearest), warn: false }] : []),
    ]
    return { lines, dims: c.dimensions }
  }, [o, plan, site, setbacks, layers])
  if (!marks || presenting || interiorOpen || dragging) return null
  return (
    <group name="clearance-marks">
      {marks.lines.map((l) => (
        <ClearanceLine key={l.key} line={l} terrain={site.terrain} />
      ))}
      {marks.dims.map((d, i) => (
        <Html key={i} position={groundAt(site.terrain, d.at)} center zIndexRange={[3, 3]} className="measure-label dimension-label" style={{ background: DIM_COLOR }} data-testid="dimension-label">
          {dimensionText(d)}
        </Html>
      ))}
    </group>
  )
}

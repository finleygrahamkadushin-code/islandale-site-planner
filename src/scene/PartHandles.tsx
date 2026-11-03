import { useThree } from '@react-three/fiber'
import { Vector3 } from 'three'
import { surfaceAt } from '../buildings/attach'
import { localToSite, type LocalPoint } from '../buildings/footprint'
import { massToBuilding } from '../buildings/masses'
import { cursorFor, edgeDeltaFt, edgeMid, edgeNormal, gripCentre, hostDirection, isRectPart, knobAngle, KNOB_OUT_FT, resizedWing } from '../buildings/partHandles'
import { RECT_EDGES, withMainEdgeResized, withWing } from '../buildings/wingEdits'
import { usePlanStore } from '../store/planStore'
import type { PlanObject } from '../store/types'
import { DragHandle, type DragSession, type HandleView } from './DragHandle'
import type { DragState } from './editing'
import { toScene } from './frame'
import { inGroup, type PartFrame } from './partFrame'
import { LAYER, ScreenChip } from './ScreenChip'

/** Handles float this far over the walking surface (legacy). */
const LIFT_M = 0.15

interface Props {
  readonly o: PlanObject
  readonly mi: number
  readonly frame: PartFrame
  readonly setDrag: (d: DragState | null) => void
}

/**
 * The picked part's handles (legacy ext:wing-select): a square on each
 * edge of a rect part to drag that side, and for a wing a grip to move it
 * and a knob to turn it. The part follows the pointer through the live
 * drag; the store is written once, on release, as one undo step.
 */
export function PartHandles({ o, mi, frame, setDrag }: Props) {
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const dom = useThree((s) => s.gl.domElement)
  const view: HandleView = { camera, dom }
  const updateWing = usePlanStore((s) => s.updateWing)
  const resizeMainEdge = usePlanStore((s) => s.resizeMainEdge)
  const m = frame.masses[mi]
  if (!m) return null

  const surf = (p: LocalPoint) => surfaceAt(frame.masses, mi, frame.site, p)
  const at = (p: LocalPoint) => inGroup(frame, massToBuilding(m, p), surf(p) + LIFT_M)
  const y = surf([0, 0])

  /** A drag that writes some of the wing's own fields. */
  const wingSession = (fields: (p: LocalPoint, free: boolean) => Record<string, number> | null): DragSession => {
    let last: Record<string, number> | null = null
    return {
      move: (p, free) => {
        last = fields(p, free)
        const patch = last
        setDrag(patch ? { id: o.id, patch: (obj) => ({ params: withWing(obj.params, mi, (w) => ({ ...w, ...patch })) }) } : null)
      },
      end: () => {
        setDrag(null)
        if (last) updateWing(o.id, mi, last)
      },
      cancel: () => setDrag(null),
    }
  }

  /** The main walls: the building moves by half the change and every wing stays put on the ground. */
  const mainEdgeSession = (i: number): DragSession => {
    let delta = 0
    return {
      move: (p, free) => {
        delta = edgeDeltaFt(m, i, p, !free)
        const d = delta
        setDrag({
          id: o.id,
          patch: (obj) => {
            const r = withMainEdgeResized(obj, i, d)
            return { position: r.position, params: r.params }
          },
        })
      },
      end: () => {
        setDrag(null)
        if (delta) resizeMainEdge(o.id, i, delta)
      },
      cancel: () => setDrag(null),
    }
  }

  const edgeCursor = (i: number) => () => {
    const mid = edgeMid(m, i)
    const n = edgeNormal(m, i)
    const world = (q: LocalPoint) => new Vector3(...toScene(...localToSite(o.position, o.rotation, q), y)).project(camera)
    const a = world(mid)
    const b = world([mid[0] + n[0], mid[1] + n[1]])
    return cursorFor(((b.x - a.x) * size.width) / 2, (-(b.y - a.y) * size.height) / 2)
  }

  const edges = isRectPart(m) ? [0, 1, 2, 3] : []
  return (
    <>
      {edges.map((i) => {
        const [nx, nz] = RECT_EDGES[i]
        const mid: LocalPoint = [(nx * m.w) / 2, (nz * m.d) / 2]
        return (
          <ScreenChip key={`e${i}`} position={at(mid)} layer={LAYER.handle}>
            <DragHandle
              o={o}
              view={view}
              y={y}
              className="ph-edge"
              testId={`part-handle-${i}`}
              title="Drag to resize this edge · Shift: free"
              cursor={edgeCursor(i)}
              begin={() => (mi === 0 ? mainEdgeSession(i) : wingSession((p, free) => resizedWing(m, i, edgeDeltaFt(m, i, p, !free))))}
            />
          </ScreenChip>
        )
      })}
      {mi > 0 && (
        <ScreenChip position={at([0, 0])} layer={LAYER.handle}>
          <DragHandle
            o={o}
            view={view}
            y={y}
            className="ph-grip"
            testId="part-grip"
            title="Drag to move this part · Shift: free"
            begin={(p0) => {
              const off: LocalPoint = [m.dx - p0[0], m.dz - p0[1]]
              const host = hostDirection(frame.masses, mi)
              return wingSession((p, free) => {
                const [dx, dz] = gripCentre([m.dx, m.dz], [p[0] + off[0], p[1] + off[1]], host, !free)
                return { dx, dz }
              })
            }}
          >
            ✥
          </DragHandle>
        </ScreenChip>
      )}
      {mi > 0 && (
        <ScreenChip position={at([0, m.d / 2 + KNOB_OUT_FT])} layer={LAYER.handle}>
          <DragHandle o={o} view={view} y={y} className="ph-knob" testId="part-knob" title="Drag to turn this part (5° steps) · Shift: free" begin={() => wingSession((p, free) => ({ rot: knobAngle(m, p, !free) }))}>
            ↻
          </DragHandle>
        </ScreenChip>
      )}
    </>
  )
}

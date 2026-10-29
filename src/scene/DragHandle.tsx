import { useEffect, useMemo, useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { Plane, Raycaster, Vector2, Vector3, type Camera } from 'three'
import { siteToLocal, type LocalPoint } from '../buildings/footprint'
import type { PlanObject } from '../store/types'

/** Nothing changes until the pointer has moved this far (legacy). */
const THRESHOLD_PX = 3

/** One drag of a part handle: what each move does, and how it ends. */
export interface DragSession {
  /** The pointer on that plane, building frame (feet); `free` when Shift is held (no snapping). */
  readonly move: (p: LocalPoint, free: boolean) => void
  /** Release: commit what the drag did as one undo step. */
  readonly end: () => void
  /** Esc: drop the live drag and commit nothing. */
  readonly cancel: () => void
}

/** Where a screen point meets the horizontal plane at elevation y, in o's building frame (feet). */
export function pointerLocal(clientX: number, clientY: number, camera: Camera, dom: HTMLElement, o: PlanObject, y: number): LocalPoint | null {
  const rect = dom.getBoundingClientRect()
  const ndc = new Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1)
  const ray = new Raycaster()
  ray.setFromCamera(ndc, camera)
  const hit = new Vector3()
  if (!ray.ray.intersectPlane(new Plane(new Vector3(0, 1, 0), -y), hit)) return null
  return siteToLocal(o.position, o.rotation, [hit.x, -hit.z])
}

/** The canvas's camera and element. A handle lives in a drei Html root, outside the Canvas, so it cannot call useThree itself. */
export interface HandleView {
  readonly camera: Camera
  readonly dom: HTMLElement
}

interface Props {
  readonly o: PlanObject
  readonly view: HandleView
  /** Elevation of the horizontal plane the pointer is read on, metres. */
  readonly y: number
  /** Start a drag from the pointer's first point (building frame), or null to refuse it. */
  readonly begin: (p: LocalPoint) => DragSession | null
  readonly className: string
  readonly testId: string
  readonly title: string
  readonly cursor?: () => string
  readonly children?: ReactNode
}

interface Live {
  readonly session: DragSession
  readonly o: PlanObject
  readonly y: number
  readonly x0: number
  readonly y0: number
  moved: boolean
}

/**
 * A DOM handle dragged on a horizontal plane in the scene: it captures
 * the pointer, waits for 3 px of movement, feeds every move to the
 * session, commits once on release, and Esc drops the drag without a step.
 */
export function DragHandle({ o, view, y, begin, className, testId, title, cursor, children }: Props) {
  const { camera, dom } = view
  const live = useRef<Live | null>(null)
  const onKey = useMemo(
    () => (e: KeyboardEvent) => {
      if (!live.current) return
      // Every key stops here while a drag is live, before the app's own
      // shortcuts: Delete or Undo could remove the part under the drag.
      e.stopImmediatePropagation()
      if (e.key !== 'Escape') return
      e.preventDefault()
      live.current.session.cancel()
      live.current = null
    },
    [],
  )
  // A handle that goes away mid-drag (part dropped, building locked) drops its drag too.
  useEffect(
    () => () => {
      window.removeEventListener('keydown', onKey, true)
      live.current?.session.cancel()
      live.current = null
    },
    [onKey],
  )

  const finish = (e: ReactPointerEvent<HTMLElement>, commit: boolean) => {
    e.stopPropagation()
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    window.removeEventListener('keydown', onKey, true)
    const l = live.current
    live.current = null
    if (!l) return
    if (commit && l.moved) l.session.end()
    else l.session.cancel()
  }

  return (
    <button
      type="button"
      className={className}
      data-testid={testId}
      title={title}
      onPointerEnter={(e) => cursor && (e.currentTarget.style.cursor = cursor())}
      onPointerDown={(e) => {
        e.stopPropagation()
        if (e.button !== 0) return
        const p = pointerLocal(e.clientX, e.clientY, camera, dom, o, y)
        const session = p && begin(p)
        if (!session) return
        e.currentTarget.setPointerCapture(e.pointerId)
        live.current = { session, o, y, x0: e.clientX, y0: e.clientY, moved: false }
        window.addEventListener('keydown', onKey, true)
      }}
      onPointerMove={(e) => {
        const l = live.current
        if (!l) return
        e.stopPropagation()
        if (!l.moved && Math.hypot(e.clientX - l.x0, e.clientY - l.y0) < THRESHOLD_PX) return
        l.moved = true
        const p = pointerLocal(e.clientX, e.clientY, camera, dom, l.o, l.y)
        if (p) l.session.move(p, e.shiftKey)
      }}
      onPointerUp={(e) => finish(e, true)}
      onPointerCancel={(e) => finish(e, false)}
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </button>
  )
}

import { useRef, type KeyboardEvent, type PointerEvent } from 'react'
import type { LocalPoint } from '../../../buildings/footprint'
import type { Pen } from '../plan/planLayout'
import { formatArch } from '../format'
import type { SheetBounds } from '../types'
import { cutReachIn, type CutId, type SectionCut } from './sectionCuts'
import { planAt } from './sectionGeom'

/**
 * The section cuts on a plan: a long-dash-dot line across the building with
 * a lettered bubble and an arrow at each end, the arrow pointing the way the
 * section looks. With `onMove`, each bubble drags the cut square to itself,
 * and is a slider the arrow keys move (6 in, or 1 in with Shift).
 */

/** With no box to reach, the line runs this far past the building at each end, feet. */
const PAST_FT = 2.5
/** Drags and keys move the cut in steps of this, feet (1 in), or 6 in for a plain arrow key. */
const STEP_FT = 1 / 12
const KEY_STEP_FT = 0.5
/** Marked on a handle so the sheets' own key guard lets its keys through. */
export const CUT_HANDLE_ATTR = 'data-cut-handle'

interface Props {
  readonly cuts: readonly SectionCut[]
  readonly pen: Pen
  readonly onMove?: (id: CutId, offsetFt: number) => void
  /** The plan's drawing and dimensions: each line runs across it and its bubbles sit just outside, clear of the dimension text. */
  readonly box?: SheetBounds
}

export function SectionMarks({ cuts, pen, onMove, box }: Props) {
  return (
    <g className="section-marks">
      {cuts.map((c) => (
        <CutMark key={c.id} cut={c} pen={pen} onMove={onMove} box={box} />
      ))}
    </g>
  )
}

const clamp = (c: SectionCut, v: number) => Math.min(c.maxFt, Math.max(c.minFt, Math.round(v / STEP_FT) * STEP_FT))

const SCREEN_KEYS: Readonly<Record<string, LocalPoint>> = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }

function CutMark({ cut: c, pen, onMove, box }: { readonly cut: SectionCut; readonly pen: Pen; readonly onMove?: Props['onMove']; readonly box?: SheetBounds }) {
  const r = pen.text * 1.1
  const [from, to] = (box && cutReachIn(c, box)) ?? [c.reach[0] - PAST_FT, c.reach[1] + PAST_FT]
  const a = planAt(c, from)
  const b = planAt(c, to)
  const drag = useRef<{ readonly x: number; readonly y: number; readonly offset: number; readonly svg: SVGSVGElement } | null>(null)
  const label = `Section ${c.id}–${c.id}, ${c.kind}`

  const toUser = (svg: SVGSVGElement, x: number, y: number): LocalPoint | null => {
    const m = svg.getScreenCTM()
    if (!m) return null
    const p = new DOMPoint(x, y).matrixTransform(m.inverse())
    return [p.x, p.y]
  }
  const down = (e: PointerEvent<SVGGElement>) => {
    const svg = e.currentTarget.ownerSVGElement
    if (!onMove || !svg) return
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, y: e.clientY, offset: c.offsetFt, svg }
  }
  const move = (e: PointerEvent<SVGGElement>) => {
    const d = drag.current
    if (!d || !onMove) return
    const p0 = toUser(d.svg, d.x, d.y)
    const p1 = toUser(d.svg, e.clientX, e.clientY)
    if (!p0 || !p1) return
    const along = (p1[0] - p0[0]) * c.look[0] + (p1[1] - p0[1]) * c.look[1]
    onMove(c.id, clamp(c, d.offset + along))
  }
  const up = (e: PointerEvent<SVGGElement>) => {
    if (drag.current && e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    drag.current = null
  }
  const key = (e: KeyboardEvent<SVGGElement>) => {
    // keep every key off the planner behind the sheets
    e.stopPropagation()
    const v = SCREEN_KEYS[e.key]
    if (!v || !onMove) return
    const along = v[0] * c.look[0] + v[1] * c.look[1]
    if (Math.abs(along) < 0.3) return
    e.preventDefault()
    onMove(c.id, clamp(c, c.offsetFt + Math.sign(along) * (e.shiftKey ? STEP_FT : KEY_STEP_FT)))
  }

  const ends: readonly LocalPoint[] = [a, b]
  return (
    <g data-cut={c.id}>
      <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="#000" strokeWidth={pen.medium} strokeDasharray={`${pen.text * 2.4} ${pen.small * 0.5} ${pen.small * 0.4} ${pen.small * 0.5}`} />
      {ends.map((p, i) => {
        // the bubble just past the line's end, the arrow on the side the section looks toward
        const out = i === 0 ? -1 : 1
        const past = r + pen.small * 0.4
        const centre: LocalPoint = [p[0] + c.dir[0] * past * out, p[1] + c.dir[1] * past * out]
        const tip: LocalPoint = [centre[0] + c.look[0] * r * 2.1, centre[1] + c.look[1] * r * 2.1]
        const side: LocalPoint = [c.dir[0] * r * 0.95, c.dir[1] * r * 0.95]
        const handle = onMove
          ? {
              [CUT_HANDLE_ATTR]: c.id,
              role: 'slider',
              tabIndex: 0,
              'aria-label': `${label}: drag, or use the arrow keys, to move the cut`,
              'aria-valuemin': Math.round(c.minFt * 12),
              'aria-valuemax': Math.round(c.maxFt * 12),
              'aria-valuenow': Math.round(c.offsetFt * 12),
              'aria-valuetext': `${c.offsetFt >= 0 ? '' : '−'}${formatArch(Math.abs(c.offsetFt))} from the centre`,
              onPointerDown: down,
              onPointerMove: move,
              onPointerUp: up,
              onPointerCancel: up,
              onKeyDown: key,
              style: { cursor: 'grab', touchAction: 'none' as const },
            }
          : {}
        return (
          <g key={i} {...handle}>
            <polygon points={`${centre[0] + side[0]},${centre[1] + side[1]} ${centre[0] - side[0]},${centre[1] - side[1]} ${tip[0]},${tip[1]}`} fill="#000" />
            <circle cx={centre[0]} cy={centre[1]} r={r} fill="#fff" stroke="#000" strokeWidth={pen.medium} />
            <text x={centre[0]} y={centre[1]} fontSize={pen.text * 1.1} fontWeight={700} textAnchor="middle" dominantBaseline="central" fill="#000">
              {c.id}
            </text>
          </g>
        )
      })}
    </g>
  )
}

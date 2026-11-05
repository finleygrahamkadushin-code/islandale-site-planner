import { useId } from 'react'
import { formatInches } from '../../export/sheets/format'
import type { SheetOpening, SheetPart } from '../../export/sheets/types'
import type { Pen } from './planLayout'
import { pts } from './planMarks'
import { openingTagAt, thicknessTextAt, wallRuns, type ThicknessMark, type WallRun } from './planWalls'
import { normalAwayFrom, uprightAngle, type Pt } from './svgDims'

/**
 * A part's walls as a hand drafter draws them: the outside face (the
 * outline every dimension is to) and the inside face, the wall between
 * hatched; a glass curtain wall as two thin lines with the glass between,
 * unhatched. Openings cut through the whole thickness.
 */

const IN_PER_FT = 12
/** A slider's two panes sit this share of the wall either side of its middle. */
const SLIDER_PANE_OFF = 0.18

const lerp = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
const mid = (a: Pt, b: Pt): Pt => lerp(a, b, 0.5)
const unitOf = (a: Pt, b: Pt): Pt => {
  const l = Math.hypot(b[0] - a[0], b[1] - a[1])
  return l > 1e-9 ? [(b[0] - a[0]) / l, (b[1] - a[1]) / l] : [0, 0]
}
const push = (p: Pt, d: Pt, k: number): Pt => [p[0] + d[0] * k, p[1] + d[1] * k]
const ring = (poly: readonly Pt[]) => `M${poly.map(([x, z]) => `${x} ${z}`).join(' L')} Z`

/** The outline's and inside face's vertices along a run, first edge's start to last edge's end. */
function runPoints(run: WallRun, poly: readonly Pt[]): Pt[] {
  return [...run.edges.map((i) => poly[i]), poly[(run.edges[run.edges.length - 1] + 1) % poly.length]]
}

export function WallBand({ part, pen }: { readonly part: SheetPart; readonly pen: Pen }) {
  const hatch = `wall-hatch-${useId().replace(/:/g, '')}`
  const runs = wallRuns(part.edges)
  if (!runs.length || part.inner.length !== part.outline.length) return null
  // hatch lines a sixteenth of an inch apart on paper
  const spacing = pen.gap
  const n = part.outline.length
  // where the kind changes, a line across the wall
  const changes = runs.length > 1 ? runs.map((r) => r.edges[0]) : []
  return (
    <g aria-label={`${part.name} walls`}>
      <defs>
        <pattern id={hatch} patternUnits="userSpaceOnUse" width={spacing} height={spacing} patternTransform="rotate(45)">
          <line x1={0} y1={0} x2={0} y2={spacing} stroke="#000" strokeWidth={pen.hair} />
        </pattern>
      </defs>
      {runs.map((r, k) => {
        const outer = runPoints(r, part.outline)
        const inner = runPoints(r, part.inner)
        const fill = r.glass ? '#fff' : `url(#${hatch})`
        const face = r.glass ? pen.thin : pen.medium
        if (r.closed) {
          return (
            <g key={k}>
              <path d={`${ring(part.outline)} ${ring(part.inner)}`} fillRule="evenodd" fill={fill} stroke="none" />
              <polygon points={pts(part.outline)} fill="none" stroke="#000" strokeWidth={face} strokeLinejoin="miter" />
              <polygon points={pts(part.inner)} fill="none" stroke="#000" strokeWidth={face} strokeLinejoin="miter" />
              {r.glass && <polygon points={pts(part.outline.map((p, i) => mid(p, part.inner[i])))} fill="none" stroke="#000" strokeWidth={pen.hair} />}
            </g>
          )
        }
        return (
          <g key={k}>
            <polygon points={pts([...outer, ...[...inner].reverse()])} fill={fill} stroke="none" />
            <polyline points={pts(outer)} fill="none" stroke="#000" strokeWidth={face} strokeLinejoin="miter" />
            <polyline points={pts(inner)} fill="none" stroke="#000" strokeWidth={face} strokeLinejoin="miter" />
            {r.glass && <polyline points={pts(outer.map((p, i) => mid(p, inner[i])))} fill="none" stroke="#000" strokeWidth={pen.hair} />}
          </g>
        )
      })}
      {changes.map((v) => (
        <line key={`c${v}`} x1={part.outline[v % n][0]} y1={part.outline[v % n][1]} x2={part.inner[v % n][0]} y2={part.inner[v % n][1]} stroke="#000" strokeWidth={pen.thin} />
      ))}
    </g>
  )
}

/**
 * One opening, piece by piece on the edges it crosses: the wall cleared
 * through its thickness, jambs square across at its two ends, a window's
 * glass at mid-wall between thin sill lines, a slider's two panes, a
 * cut-out's faces dashed across the hole, and a door's leaf swung in from
 * the inside face.
 */
export function Opening({ opening: o, part, pen }: { readonly opening: SheetOpening; readonly part: SheetPart; readonly pen: Pen }) {
  const line = (p: Pt, q: Pt, w: number, d?: string, key?: string) => <line key={key} x1={p[0]} y1={p[1]} x2={q[0]} y2={q[1]} stroke="#000" strokeWidth={w} strokeDasharray={d} />
  const dash = `${pen.small * 0.5} ${pen.small * 0.4}`
  const middle = o.pieces[Math.floor(o.pieces.length / 2)]
  const tagN = middle ? normalAwayFrom(part.outline, middle.a, middle.b) : ([0, 0] as Pt)
  const tagAt = openingTagAt(o, part, pen.text)
  const last = o.pieces.length - 1
  return (
    <g>
      {o.pieces.map((p, i) => {
        const glass = part.edges[p.edge]?.glass ?? false
        const face = glass ? pen.thin : pen.medium
        // the clearing reaches past both faces by a face line's width, but not along the wall, so the jambs meet the faces clean
        const outA = unitOf(p.innerA, p.a)
        const outB = unitOf(p.innerB, p.b)
        const clear = [push(p.a, outA, face), push(p.b, outB, face), push(p.innerB, outB, -face), push(p.innerA, outA, -face)]
        return (
          <g key={i}>
            <polygon points={pts(clear)} fill="#fff" stroke="none" />
            {o.kind === 'window' && [line(p.a, p.b, pen.thin, undefined, 'o'), line(p.innerA, p.innerB, pen.thin, undefined, 'i'), line(p.midA, p.midB, pen.thin, undefined, 'g')]}
            {o.kind === 'slider' &&
              [-SLIDER_PANE_OFF, SLIDER_PANE_OFF].map((k) =>
                line(lerp(p.midA, p.a, k * 2), lerp(p.midB, p.b, k * 2), pen.thin, undefined, `s${k}`),
              )}
            {o.kind === 'cutout' && [line(p.a, p.b, pen.thin, dash, 'o'), line(p.innerA, p.innerB, pen.thin, dash, 'i')]}
            {i === 0 && line(p.a, p.innerA, face)}
            {i === last && line(p.b, p.innerB, face)}
          </g>
        )
      })}
      {o.kind === 'door' && o.pieces.length === 1 && <Swing opening={o} inward={[-tagN[0], -tagN[1]]} pen={pen} />}
      <circle cx={tagAt[0]} cy={tagAt[1]} r={pen.text * 0.85} fill="#fff" stroke="#000" strokeWidth={pen.hair} />
      <text x={tagAt[0]} y={tagAt[1]} fontSize={pen.small} textAnchor="middle" dominantBaseline="central">
        {o.tag}
      </text>
    </g>
  )
}

/** A hinged door's leaf open square into the room from the inside face, hinged at its right jamb seen from outside, and its swing dashed: assumed, as the plan stores none. */
function Swing({ opening: o, inward, pen }: { readonly opening: SheetOpening; readonly inward: Pt; readonly pen: Pen }) {
  const p = o.pieces[0]
  return <DoorSwing hinge={p.innerA} free={p.innerB} inward={inward} pen={pen} assumed />
}

/** A door's leaf drawn open square from its hinge, on the face it swings from, and the arc its free edge swings through (dashed where the swing is assumed). */
export function DoorSwing({ hinge, free, inward, pen, assumed = false }: { readonly hinge: Pt; readonly free: Pt; readonly inward: Pt; readonly pen: Pen; readonly assumed?: boolean }) {
  const r = Math.hypot(free[0] - hinge[0], free[1] - hinge[1])
  const leaf = push(hinge, inward, r)
  return (
    <>
      <line x1={hinge[0]} y1={hinge[1]} x2={leaf[0]} y2={leaf[1]} stroke="#000" strokeWidth={pen.thin} />
      <path
        d={`M${free[0]} ${free[1]} A${r} ${r} 0 0 ${sweepFlag(hinge, free, leaf)} ${leaf[0]} ${leaf[1]}`}
        fill="none"
        stroke="#000"
        strokeWidth={pen.hair}
        strokeDasharray={assumed ? `${pen.small * 0.5} ${pen.small * 0.3}` : undefined}
      />
    </>
  )
}

/** SVG's sweep flag for the arc from b round the hinge a to the open leaf's tip. */
function sweepFlag(a: Pt, b: Pt, tip: Pt): 0 | 1 {
  const cross = (b[0] - a[0]) * (tip[1] - a[1]) - (b[1] - a[1]) * (tip[0] - a[0])
  return cross > 0 ? 1 : 0
}

/** A wall's thickness: ticks on its two faces, a short line across them, and the size set along the wall just inside it. */
export function ThicknessDim({ mark: m, pen }: { readonly mark: ThicknessMark; readonly pen: Pen }) {
  const inward = unitOf(m.outer, m.inner)
  const from = push(m.outer, inward, -pen.overshoot)
  const to = push(m.inner, inward, pen.overshoot)
  const tick: Pt = [((inward[0] - inward[1]) / Math.SQRT2) * pen.tick, ((inward[0] + inward[1]) / Math.SQRT2) * pen.tick]
  const text = thicknessTextAt(m, pen.text, pen.overshoot)
  const angle = uprightAngle((Math.atan2(m.along[1], m.along[0]) * 180) / Math.PI)
  return (
    <g stroke="#000" fill="none" aria-label={`Wall ${formatInches(m.thicknessFt * IN_PER_FT)} thick`}>
      <line x1={from[0]} y1={from[1]} x2={to[0]} y2={to[1]} strokeWidth={pen.hair} />
      {[m.outer, m.inner].map((q, i) => (
        <line key={i} x1={q[0] - tick[0]} y1={q[1] - tick[1]} x2={q[0] + tick[0]} y2={q[1] + tick[1]} strokeWidth={pen.thin} />
      ))}
      <text x={text[0]} y={text[1]} transform={`rotate(${angle} ${text[0]} ${text[1]})`} fontSize={pen.small} textAnchor="middle" dominantBaseline="central" fill="#000" stroke="none">
        {`${formatInches(m.thicknessFt * IN_PER_FT)} ${m.glass ? 'glass wall' : 'wall'}`}
      </text>
    </g>
  )
}

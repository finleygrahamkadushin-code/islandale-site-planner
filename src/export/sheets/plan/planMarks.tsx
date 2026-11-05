import { signedArea } from '../../../buildings/footprint'
import type { SheetBounds, SheetEllipse, SheetPart, SheetPoint } from '../types'
import { unitTo, type CurveOpeningNote, type Pen } from './planLayout'
import { arrowHead, outwardNormal, type Pt } from '../svgDims'

/** A station's tick runs this far past each face of the wall, feet. */
const STATION_TICK_FT = 0.3
/** Length of the datum's x and z arrows, feet. */
const DATUM_ARROW_FT = 2.5
/** A stair or ramp's arrow stops this share of its run short of each end. */
const ARROW_INSET = 0.15
/** How far an ellipse's centre lines run past its curve, feet. */
const AXIS_PAST_FT = 1

export const pts = (poly: readonly Pt[]) => poly.map(([x, z]) => `${x},${z}`).join(' ')
const lerp = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]

/** Nosing lines, and an arrow down the run labelled DN (or 1:n DN for a ramp). */
export function StairMarks({ part, pen }: { readonly part: SheetPart; readonly pen: Pen }) {
  const s = part.stair
  if (!s) return null
  const from = lerp(s.run[0], s.run[1], ARROW_INSET)
  const to = lerp(s.run[0], s.run[1], 1 - ARROW_INSET)
  const label = s.kind === 'ramp' && s.slopeOneIn ? `1:${s.slopeOneIn.toFixed(1)} DN` : 'DN'
  return (
    <g stroke="#000" fill="none">
      {s.nosings.map((n, i) => (
        <line key={i} x1={n[0][0]} y1={n[0][1]} x2={n[1][0]} y2={n[1][1]} strokeWidth={pen.thin} />
      ))}
      <line x1={from[0]} y1={from[1]} x2={to[0]} y2={to[1]} strokeWidth={pen.thin} />
      <polygon points={pts(arrowHead(from, to, pen.text))} fill="#000" stroke="none" />
      <Label at={from} along={[from, to]} size={pen.small} text={label} back={pen.text} />
    </g>
  )
}

/** Text set just behind the start of a line, along it. */
function Label({ at, along, size, text, back }: { readonly at: Pt; readonly along: readonly [Pt, Pt]; readonly size: number; readonly text: string; readonly back: number }) {
  const d = unitTo(along[0], along[1])
  const x = at[0] - d[0] * back
  const y = at[1] - d[1] * back
  return (
    <text x={x} y={y} fontSize={size} textAnchor="middle" dominantBaseline="central" fill="#000" stroke="none">
      {text}
    </text>
  )
}

/** The point the coordinate tables measure from: a cross in a circle, labelled, with short x and z arrows. */
export function DatumMark({ at, pen }: { readonly at: Pt; readonly pen: Pen }) {
  const r = pen.text * 0.7
  const [x, z] = at
  const ax: Pt = [x + DATUM_ARROW_FT, z]
  const az: Pt = [x, z + DATUM_ARROW_FT]
  return (
    <g stroke="#000" strokeWidth={pen.thin} fill="none" aria-label="Datum 0,0">
      <circle cx={x} cy={z} r={r} fill="#fff" />
      <path d={`M${x - r * 1.4} ${z} L${x + r * 1.4} ${z} M${x} ${z - r * 1.4} L${x} ${z + r * 1.4}`} />
      <line x1={x + r} y1={z} x2={ax[0]} y2={ax[1]} />
      <line x1={x} y1={z + r} x2={az[0]} y2={az[1]} />
      <polygon points={pts(arrowHead(at, ax, pen.small))} fill="#000" stroke="none" />
      <polygon points={pts(arrowHead(at, az, pen.small))} fill="#000" stroke="none" />
      <g fill="#000" stroke="none" fontSize={pen.small}>
        <text x={ax[0] + pen.small * 0.4} y={ax[1]} dominantBaseline="central">
          x
        </text>
        <text x={az[0]} y={az[1] + pen.small * 0.9} textAnchor="middle">
          z
        </text>
        <text x={x - r * 1.6} y={z - r * 1.6} textAnchor="end" fontWeight={700}>
          DATUM 0,0
        </text>
      </g>
    </g>
  )
}

/** How far the arrow at P1 sits outside the wall, and how long it is, feet. */
const P1_ARROW_OUT_FT = 0.9
const P1_ARROW_FT = 2.5

/**
 * The part's labelled points: P1, P2 … at its corners (on a curve, only
 * where its arcs meet), set just inside it (inside the wall's inside face),
 * and S1, S2 … at the stations round a curve, each with a tick across the
 * wall. On a part with a curve,
 * P1 is bold and an arrow outside the wall shows the way distances round
 * from P1 run.
 */
export function PointLabels({ part, pen }: { readonly part: SheetPart; readonly pen: Pen }) {
  const poly = part.outline
  if (poly.length < 3) return null
  const area = signedArea(poly)
  const back = pen.tiny * 1.3
  const n = poly.length
  const around = part.edges.some((e) => e.curved)
  const walled = part.inner.length === n
  const edgeAt = (q: SheetPoint) => part.edges.find((x) => onSegment(x.a, x.b, q.at)) ?? part.edges[0]
  const inwardAt = (q: SheetPoint): Pt => {
    if (q.vertex === null) {
      const o = outwardNormal(area, edgeAt(q).a, edgeAt(q).b)
      return [-o[0], -o[1]]
    }
    const i = q.vertex
    const n1 = outwardNormal(area, poly[(i - 1 + n) % n], poly[i])
    const n2 = outwardNormal(area, poly[i], poly[(i + 1) % n])
    return unitTo([0, 0], [-(n1[0] + n2[0]), -(n1[1] + n2[1])])
  }
  return (
    <g fontSize={pen.tiny} fill="#000" stroke="none" textAnchor="middle" dominantBaseline="central">
      {part.points.map((q) => {
        const inward = inwardAt(q)
        // a corner's label sits in from the wall's inside corner, a station's in from the inside face square across
        const wall = q.vertex === null ? edgeAt(q).thicknessFt : 0
        const from: Pt = walled && q.vertex !== null ? part.inner[q.vertex] : [q.at[0] + inward[0] * wall, q.at[1] + inward[1] * wall]
        const at: Pt = [from[0] + inward[0] * back, from[1] + inward[1] * back]
        const tick = q.vertex === null
        return (
          <g key={q.label}>
            {tick && (
              <line
                x1={q.at[0] - inward[0] * STATION_TICK_FT}
                y1={q.at[1] - inward[1] * STATION_TICK_FT}
                x2={q.at[0] + inward[0] * (wall + STATION_TICK_FT)}
                y2={q.at[1] + inward[1] * (wall + STATION_TICK_FT)}
                stroke="#000"
                strokeWidth={pen.hair}
              />
            )}
            <text x={at[0]} y={at[1]} fontWeight={around && q.vertex === 0 ? 700 : undefined}>
              {q.label}
            </text>
          </g>
        )
      })}
      {around && <RoundArrow part={part} pen={pen} />}
    </g>
  )
}

const onSegment = (a: Pt, b: Pt, p: Pt): boolean => {
  const l = Math.hypot(b[0] - a[0], b[1] - a[1])
  if (l < 1e-9) return false
  const t = ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / (l * l)
  const off = Math.abs((p[0] - a[0]) * (b[1] - a[1]) - (p[1] - a[1]) * (b[0] - a[0])) / l
  return t >= -1e-6 && t <= 1 + 1e-6 && off < 1e-6
}

/** Just outside the wall at P1, an arrow along the first edge: the way distances round from P1 are measured. */
function RoundArrow({ part, pen }: { readonly part: SheetPart; readonly pen: Pen }) {
  const e = part.edges[0]
  if (!e) return null
  const o = outwardNormal(signedArea(part.outline), e.a, e.b)
  const d = unitTo(e.a, e.b)
  const from: Pt = [e.a[0] + o[0] * P1_ARROW_OUT_FT, e.a[1] + o[1] * P1_ARROW_OUT_FT]
  const to: Pt = [from[0] + d[0] * P1_ARROW_FT, from[1] + d[1] * P1_ARROW_FT]
  return (
    <g aria-label="Distances round from P1 run this way">
      <line x1={from[0]} y1={from[1]} x2={to[0]} y2={to[1]} stroke="#000" strokeWidth={pen.thin} />
      <polygon points={pts(arrowHead(from, to, pen.small))} fill="#000" stroke="none" />
    </g>
  )
}

/** The main walls' bounding box, dashed, where it holds a datum no wall passes through. */
export function MainBox({ box, pen }: { readonly box: SheetBounds; readonly pen: Pen }) {
  return (
    <rect
      x={box.minx}
      y={box.minz}
      width={box.maxx - box.minx}
      height={box.maxz - box.minz}
      fill="none"
      stroke="#000"
      strokeWidth={pen.hair}
      strokeDasharray={`${pen.text * 0.8} ${pen.text * 0.4}`}
      aria-label="Main walls' bounding box"
    />
  )
}

/** An ellipse's two axes as centre lines (long dash, short dash), running a little past the curve. */
export function EllipseAxes({ ellipse: e, pen }: { readonly ellipse: SheetEllipse; readonly pen: Pen }) {
  const r = (e.rotDeg * Math.PI) / 180
  // the part's own x and z axes in the building frame, as massToBuilding turns them
  const ux: Pt = [Math.cos(r), -Math.sin(r)]
  const uz: Pt = [Math.sin(r), Math.cos(r)]
  const [cx, cz] = e.centre
  const axis = (u: Pt, half: number, key: string) => (
    <line key={key} x1={cx - u[0] * half} y1={cz - u[1] * half} x2={cx + u[0] * half} y2={cz + u[1] * half} />
  )
  return (
    <g stroke="#000" strokeWidth={pen.hair} strokeDasharray={`${pen.text * 1.6} ${pen.text * 0.3} ${pen.text * 0.3} ${pen.text * 0.3}`} aria-label="Ellipse axes">
      {axis(ux, e.widthFt / 2 + AXIS_PAST_FT, 'x')}
      {axis(uz, e.depthFt / 2 + AXIS_PAST_FT, 'z')}
    </g>
  )
}

export function CurveNotes({ notes, pen }: { readonly notes: readonly CurveOpeningNote[]; readonly pen: Pen }) {
  return (
    <g fill="#000" stroke="none" fontSize={pen.small}>
      {notes.map((n, i) => (
        <text key={i} x={n.at[0]} y={n.at[1]} textAnchor={n.anchor}>
          {n.lines.map((l, k) => (
            <tspan key={k} x={n.at[0]} dy={k === 0 ? 0 : pen.small * 1.2}>
              {l}
            </tspan>
          ))}
        </text>
      ))}
    </g>
  )
}

import type { SheetRoof, SheetRoofLineKind } from '../../export/sheets/types'
import type { Pen } from './planLayout'
import { pts } from './planMarks'
import { arrowHead, type Pt } from './svgDims'

/** How each kind of roof line is drawn, as dash and pen: the roof's creases in long dashes, its crown shorter, contours and ribs as fine dots, a shell's lip solid. */
function lineStyle(kind: SheetRoofLineKind, pen: Pen): { readonly width: number; readonly dash?: string } {
  if (kind === 'ridge' || kind === 'hip' || kind === 'valley' || kind === 'break') return { width: pen.thin, dash: `${pen.text * 1.2} ${pen.text * 0.35}` }
  if (kind === 'crown') return { width: pen.thin, dash: `${pen.text * 0.5} ${pen.text * 0.3}` }
  if (kind === 'lip') return { width: pen.medium }
  return { width: pen.hair, dash: `${pen.small * 0.15} ${pen.small * 0.3}` }
}

/** Text set beyond the end of a line, along it. */
function EndWord({ at, from, text, pen }: { readonly at: Pt; readonly from: Pt; readonly text: string; readonly pen: Pen }) {
  const l = Math.hypot(at[0] - from[0], at[1] - from[1]) || 1
  const x = at[0] + ((at[0] - from[0]) / l) * pen.small * 1.6
  const y = at[1] + ((at[1] - from[1]) / l) * pen.small * 1.6
  return (
    <text x={x} y={y} fontSize={pen.small} textAnchor="middle" dominantBaseline="central" fill="#000" stroke="none">
      {text}
    </text>
  )
}

/** A roof's linework over the plan: ridges, hips, valleys and breaks, contours, ribs and crown, a shell's lip, a shed's slope arrow from high to low, and a prow shell's tip column. */
export function RoofMarks({ roof, pen }: { readonly roof: SheetRoof; readonly pen: Pen }) {
  const { slope, tip } = roof
  return (
    <g fill="none" stroke="#000" strokeLinecap="round" aria-hidden="true">
      {roof.lines.map((l, i) => {
        const s = lineStyle(l.kind, pen)
        return <polyline key={i} points={pts(l.pts)} strokeWidth={s.width} strokeDasharray={s.dash} />
      })}
      {slope && (
        <>
          <line x1={slope.high[0]} y1={slope.high[1]} x2={slope.low[0]} y2={slope.low[1]} strokeWidth={pen.hair} />
          <polygon points={pts(arrowHead(slope.high, slope.low, pen.text * 0.8))} fill="#000" stroke="none" />
          <EndWord at={slope.high} from={slope.low} text="high" pen={pen} />
          <EndWord at={slope.low} from={slope.high} text="low" pen={pen} />
        </>
      )}
      {tip && <circle cx={tip.at[0]} cy={tip.at[1]} r={tip.diameterFt / 2} strokeWidth={pen.thin} />}
    </g>
  )
}

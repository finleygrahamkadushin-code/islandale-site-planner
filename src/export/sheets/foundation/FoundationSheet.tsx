import { useMemo } from 'react'
import type { SheetBuilding, SheetPart } from '../types'
import { TiledDrawing, type SheetInfo } from '../Page'
import { Dim, Grid } from '../plan/PlanSheet'
import { penSizes, planLayout, supportNotes, type Pen } from '../plan/planLayout'
import { CurveNotes, DatumMark, pts } from '../plan/planMarks'
import { SupportMarks } from './SupportMarks'
import { northOnSheetDeg } from '../svgDims'

interface Props {
  readonly building: SheetBuilding
  readonly info: Omit<SheetInfo, 'sheetTitle' | 'northDeg'>
  readonly grid: boolean
}

/**
 * A foundation plan of one building, at the floor plan's scale and datum: every part's outline as a thin
 * reference line, and what the parts stand on (posts, piers and piles at their section, beams dashed, a mast
 * or stilts to their footings) with one spacing chain per row and column of posts. Kept off the floor plans,
 * where the chains crowd the walls' and rooms' dimensions.
 */
export function FoundationSheet({ building: b, info, grid }: Props) {
  const pen = penSizes(info.scale)
  // the earthworks stay on the floor plan; the layout here is only for the supports' chains and the sheet's reach
  const layout = useMemo(() => planLayout({ ...b, earthworks: null }, info.scale, null, true), [b, info.scale])
  const notes = supportNotes(b, true)
  const at = layout.general?.at
  return (
    <TiledDrawing info={{ ...info, sheetTitle: 'Foundation plan', northDeg: northOnSheetDeg(b.rotationDeg) }} extent={layout.extent} label={`Foundation plan of ${b.name}`}>
      {grid && <Grid extent={layout.extent} pen={pen} />}
      {b.parts.map((p) => (
        <PartOutline key={p.massIndex} part={p} pen={pen} />
      ))}
      <SupportMarks supports={b.supports} pen={pen} />
      <DatumMark at={b.datum} pen={pen} />
      <g stroke="#000" strokeWidth={pen.hair} fill="none">
        {layout.supportDims.map((d, i) => (
          <Dim key={i} dim={d} pen={pen} />
        ))}
      </g>
      {at && notes.length > 0 && <CurveNotes notes={[{ at, anchor: 'start', lines: [...notes, 'Outlines are the parts above, to the outside face of the walls, for reference.'] }]} pen={pen} />}
    </TiledDrawing>
  )
}

function PartOutline({ part, pen }: { readonly part: SheetPart; readonly pen: Pen }) {
  if (part.outline.length < 3) return null
  return <polygon points={pts(part.outline)} fill="none" stroke="#000" strokeWidth={part.kind === 'wall' ? pen.medium : pen.thin} strokeLinejoin="miter" />
}

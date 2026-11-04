import { useMemo } from 'react'
import { signedArea } from '../../buildings/footprint'
import { formatArch, formatDeg } from '../../export/sheets/format'
import type { SheetBuilding, SheetFloor, SheetPart } from '../../export/sheets/types'
import { EarthLabels, EarthLines } from './EarthMarks'
import { TiledDrawing, type Extent, type SheetInfo } from './Page'
import { arcTextAt, penSizes, planLayout, type ArcNote, type LabelledDim, type Pen } from './planLayout'
import { CurveNotes, DatumMark, EllipseAxes, MainBox, PointLabels, pts, StairMarks } from './planMarks'
import { RoofMarks } from './RoofMarks'
import { FurnitureMarks, InteriorOpenings, Partitions, RoomLabels } from './RoomMarks'
import { planFigures } from './roomLayout'
import { Opening, ThicknessDim, WallBand } from './WallMarks'
import { arrowHead, centreMark, northOnSheetDeg, type Pt, type Segment } from './svgDims'

export { penSizes, planLayout, type Pen } from './planLayout'

interface Props {
  readonly building: SheetBuilding
  readonly info: Omit<SheetInfo, 'sheetTitle' | 'northDeg'>
  readonly grid: boolean
  /** The floor whose rooms this plan draws (null for none), and whether to draw its rooms and its furniture. */
  readonly floor: SheetFloor | null
  readonly rooms: boolean
  readonly furniture: boolean
  /** "Floor plan", or the floor's own name on a cabin of several. */
  readonly title?: string
}

/** A floor plan of one building, at true scale, with every straight edge, overall size and arc dimensioned (to the outside face of the walls), each wall's inside face and thickness drawn, every curve's stations marked, each roof's eave and linework dashed over it, the earthworks round it (retaining walls, berms, courts and where fill and cut meet the survey) drawn under it in grey, and the floor's rooms (partitions, interior doors, names and areas) and furniture inside it. */
export function PlanSheet({ building: b, info, grid, floor, rooms, furniture, title = 'Floor plan' }: Props) {
  const pen = penSizes(info.scale)
  const shownFloor = rooms && floor?.rooms.length ? floor : null
  const layout = useMemo(() => planLayout(b, info.scale, shownFloor), [b, info.scale, shownFloor])
  // the rooms name the space inside the walls, so the walls' own part name gives way to them
  const named = (p: SheetPart) => !(shownFloor && floor?.enclosedParts.includes(p.massIndex))
  return (
    <TiledDrawing info={{ ...info, sheetTitle: title, northDeg: northOnSheetDeg(b.rotationDeg) }} extent={layout.extent} label={`${title} of ${b.name}`}>
      {grid && <Grid extent={layout.extent} pen={pen} />}
      {b.earthworks && layout.earth && <EarthLines earth={b.earthworks} plan={layout.earth} pen={pen} />}
      {orderForDrawing(b.parts).map((p) => (
        <PartPlan key={p.massIndex} part={p} pen={pen} />
      ))}
      {furniture && floor && <FurnitureMarks floor={floor} pen={pen} />}
      {shownFloor && <Partitions partitions={shownFloor.partitions} pen={pen} />}
      {shownFloor && <InteriorOpenings openings={shownFloor.openings} pen={pen} />}
      {b.parts.map((p) => p.roof && <RoofMarks key={p.massIndex} roof={p.roof} pen={pen} />)}
      {b.parts.filter(named).map((p) => (
        <PartLabel key={p.massIndex} part={p} pen={pen} />
      ))}
      {shownFloor && <RoomLabels floor={shownFloor} pen={pen} taken={planFigures(b, layout, pen)} />}
      {b.parts.map((p) => p.ellipse && <EllipseAxes key={p.massIndex} ellipse={p.ellipse} pen={pen} />)}
      {b.parts.map((p) => (
        <PointLabels key={p.massIndex} part={p} pen={pen} />
      ))}
      {!b.datumOnWall && <MainBox box={b.mainBounds} pen={pen} />}
      <DatumMark at={b.datum} pen={pen} />
      <g stroke="#000" strokeWidth={pen.hair} fill="none">
        {layout.dims.map((d, i) => (
          <Dim key={i} dim={d} pen={pen} />
        ))}
      </g>
      {layout.arcs.map((a, i) => (
        <ArcMarks key={i} arc={a} pen={pen} />
      ))}
      {layout.thickness.map((m, i) => (
        <ThicknessDim key={i} mark={m} pen={pen} />
      ))}
      {layout.earth && <EarthLabels plan={layout.earth} pen={pen} />}
      <CurveNotes notes={layout.notes} pen={pen} />
      {layout.general && <CurveNotes notes={[layout.general]} pen={pen} />}
    </TiledDrawing>
  )
}

/** Decks and porches under stairs under walls, so the walls' heavy line wins. */
const DRAW_ORDER: Readonly<Record<SheetPart['kind'], number>> = { deck: 0, porch: 1, ramp: 2, stair: 2, wall: 3 }
const orderForDrawing = (parts: readonly SheetPart[]) => [...parts].sort((a, b) => DRAW_ORDER[a.kind] - DRAW_ORDER[b.kind])

const seg = (s: Segment) => `M${s.a[0]} ${s.a[1]} L${s.b[0]} ${s.b[1]}`

function Grid({ extent, pen }: { readonly extent: Extent; readonly pen: Pen }) {
  const xs = Array.from({ length: Math.floor(extent.w) + 1 }, (_, i) => Math.ceil(extent.x) + i)
  const ys = Array.from({ length: Math.floor(extent.h) + 1 }, (_, i) => Math.ceil(extent.y) + i)
  const line = (major: boolean) => (major ? '#b4b4b4' : '#dcdcdc')
  return (
    <g strokeWidth={pen.hair} aria-hidden="true">
      {xs.map((x) => (
        <line key={`x${x}`} x1={x} y1={extent.y} x2={x} y2={extent.y + extent.h} stroke={line(x % 4 === 0)} />
      ))}
      {ys.map((y) => (
        <line key={`y${y}`} x1={extent.x} y1={y} x2={extent.x + extent.w} y2={y} stroke={line(y % 4 === 0)} />
      ))}
    </g>
  )
}

function PartPlan({ part, pen }: { readonly part: SheetPart; readonly pen: Pen }) {
  const wall = part.kind === 'wall'
  const deckLike = part.kind === 'deck' || part.kind === 'porch'
  const roof = part.roof && part.roof.type !== 'none' && part.roof.eave.length > 2 ? part.roof : null
  return (
    <g>
      {roof && <polygon points={pts(roof.eave)} fill="none" stroke="#000" strokeWidth={pen.thin} strokeDasharray={`${pen.text} ${pen.text * 0.5}`} />}
      {wall && part.inner.length ? (
        <>
          <polygon points={pts(part.outline)} fill="#fff" stroke="none" />
          <WallBand part={part} pen={pen} />
        </>
      ) : (
        <polygon points={pts(part.outline)} fill={deckLike ? '#f1f1ef' : '#fff'} stroke="#000" strokeWidth={wall ? pen.heavy : pen.medium} strokeLinejoin="miter" />
      )}
      {part.stepBands.flatMap((band, i) =>
        band.map((piece, j) => <polyline key={`${i}-${j}`} points={pts(piece)} fill="none" stroke="#000" strokeWidth={pen.thin} />),
      )}
      {part.stair && <StairMarks part={part} pen={pen} />}
      {part.openings.map((o) => (
        <Opening key={o.tag} opening={o} part={part} pen={pen} />
      ))}
    </g>
  )
}

function centroid(poly: readonly Pt[]): Pt {
  const a = signedArea(poly)
  if (Math.abs(a) < 1e-6) return [poly.reduce((s, p) => s + p[0], 0) / poly.length, poly.reduce((s, p) => s + p[1], 0) / poly.length]
  let cx = 0
  let cz = 0
  poly.forEach(([x1, z1], i) => {
    const [x2, z2] = poly[(i + 1) % poly.length]
    const f = x1 * z2 - x2 * z1
    cx += (x1 + x2) * f
    cz += (z1 + z2) * f
  })
  return [cx / (6 * a), cz / (6 * a)]
}

function PartLabel({ part, pen }: { readonly part: SheetPart; readonly pen: Pen }) {
  if (part.outline.length < 3) return null
  const [x, y] = centroid(part.outline)
  return (
    <text x={x} y={y} fontSize={pen.text} textAnchor="middle" dominantBaseline="central" style={{ fontVariant: 'small-caps', letterSpacing: '0.04em' }} fill="#000">
      {part.name.toLowerCase()}
    </text>
  )
}

/** A dimension drawn from its geometry: hairline extensions and line, heavier ticks, the length in feet and inches, after its label if it has one. */
export function Dim({ dim, pen }: { readonly dim: LabelledDim; readonly pen: Pen }) {
  const { x, y, angleDeg, value } = dim.text
  return (
    <>
      <path d={[dim.ext1, dim.ext2, dim.line].map(seg).join(' ')} />
      <path d={dim.ticks.map(seg).join(' ')} strokeWidth={pen.thin} />
      <text x={x} y={y} transform={`rotate(${angleDeg} ${x} ${y})`} fontSize={pen.text} textAnchor="middle" dominantBaseline="central" fill="#000" stroke="none">
        {dim.label ? `${dim.label} ${formatArch(value)}` : formatArch(value)}
      </text>
    </>
  )
}

function ArcMarks({ arc, pen }: { readonly arc: ArcNote; readonly pen: Pen }) {
  const [fx, fy] = arc.leaderFrom
  const [mx, my] = arc.mid
  const { at, angleDeg: angle } = arcTextAt(arc)
  const [lx, ly] = at
  return (
    <g stroke="#000" strokeWidth={pen.hair} fill="none">
      {arc.showCentre && <path d={centreMark(arc.centre, pen.text * 0.6).map(seg).join(' ')} />}
      <line x1={fx} y1={fy} x2={mx} y2={my} strokeDasharray={arc.showCentre ? undefined : `${pen.small * 0.4} ${pen.small * 0.3}`} />
      <polygon points={pts(arrowHead(arc.leaderFrom, arc.mid, pen.text * 0.8))} fill="#000" stroke="none" />
      <text x={lx} y={ly} transform={`rotate(${angle} ${lx} ${ly}) translate(0 ${-pen.text * 0.6})`} fontSize={pen.text} textAnchor="middle" fill="#000" stroke="none">
        R {formatArch(arc.radiusFt)}
        {arc.innerRadiusFt !== null && ' outside'}
      </text>
      {arc.innerRadiusFt !== null && (
        <text x={lx} y={ly} transform={`rotate(${angle} ${lx} ${ly}) translate(0 ${pen.text * 1.3})`} fontSize={pen.small} textAnchor="middle" fill="#000" stroke="none">
          R {formatArch(arc.innerRadiusFt)} inside
        </text>
      )}
      <text x={lx} y={ly} transform={`rotate(${angle} ${lx} ${ly}) translate(0 ${pen.text * (arc.innerRadiusFt !== null ? 2.3 : 1.3)})`} fontSize={pen.small} textAnchor="middle" fill="#000" stroke="none">
        arc {formatArch(arc.lengthFt)}, {formatDeg(arc.sweepDeg)}
      </text>
    </g>
  )
}

import { useId, useMemo } from 'react'
import { TiledDrawing, type SheetInfo } from '../Page'
import { Dim, penSizes, type Pen } from '../plan/PlanSheet'
import type { SheetBuilding } from '../types'
import { CUT_TITLE, type SectionCut } from './sectionCuts'
import { levelText } from '../format'
import { sectionLayout, SECTION_NOTE, type SectionLayout } from './sectionLayout'
import type { SectionSource } from './sectionSource'
import { sectionView, type CutWall, type SectionView } from './sectionView'
import type { UY } from './sectionGeom'

/** Cut material: dark poche under a heavy line. */
const POCHE = '#4d4d4d'
const ROOF_POCHE = '#7a7a7a'
/** The survey is drawn where it stands off the finished grade by more than this, feet (1 in). */
const SURVEY_OFF_FT = 1 / 12

interface Props {
  readonly building: SheetBuilding
  readonly source: SectionSource
  readonly cuts: readonly SectionCut[]
  readonly info: Omit<SheetInfo, 'sheetTitle' | 'northDeg'>
}

/** A building's section sheets, one per cut. */
export function SectionSheets({ building, source, cuts, info }: Props) {
  return (
    <>
      {cuts.map((cut) => (
        <SectionSheet key={cut.id} building={building} source={source} cut={cut} info={info} />
      ))}
    </>
  )
}

const pts = (p: readonly UY[]) => p.map(([u, y]) => `${u},${-y}`).join(' ')

function SectionSheet({ building: b, source, cut, info }: { readonly building: SheetBuilding; readonly source: SectionSource; readonly cut: SectionCut; readonly info: Props['info'] }) {
  const built = useMemo(() => {
    try {
      const view = sectionView(b, source, cut)
      return { view, layout: sectionLayout(view, b.levels.floorNavdFt, info.scale) }
    } catch (error) {
      // one section that can't be cut says so, and the other sheets carry on
      console.error('Drawing sheets: a section could not be cut', error)
      return null
    }
  }, [b, source, cut, info.scale])
  const hatch = `earth-${useId().replace(/[^\w-]/g, '')}`
  const title = CUT_TITLE[cut.id]
  if (!built) {
    return (
      <p className="sheets-empty" role="alert">
        {title} of {b.name} couldn't be drawn.
      </p>
    )
  }
  return <SectionDrawing building={b} view={built.view} layout={built.layout} info={info} title={title} hatch={hatch} />
}

interface DrawingProps {
  readonly building: SheetBuilding
  readonly view: SectionView
  readonly layout: SectionLayout
  readonly info: Props['info']
  readonly title: string
  readonly hatch: string
}

function SectionDrawing({ building: b, view, layout, info, title, hatch }: DrawingProps) {
  const cut = view.cut
  const pen = penSizes(info.scale)
  const g = view.grade
  const earth = g.length > 1 ? `${pts(g)} ${g[g.length - 1][0]},${layout.base} ${g[0][0]},${layout.base}` : ''
  const surveyOff = view.survey.some(([, y], i) => Math.abs(y - (g[i]?.[1] ?? y)) > SURVEY_OFF_FT)
  return (
    <TiledDrawing info={{ ...info, sheetTitle: title, northDeg: null }} extent={layout.extent} label={`${title} of ${b.name}`}>
      <defs>
        <pattern id={hatch} patternUnits="userSpaceOnUse" width={0.6} height={0.6} patternTransform="rotate(45)">
          <line x1={0} y1={0} x2={0} y2={0.6} stroke="#000" strokeWidth={pen.hair} />
        </pattern>
      </defs>
      <g data-section={cut.id}>
        {earth && <polygon points={earth} fill={`url(#${hatch})`} stroke="none" />}
        {surveyOff && <polyline points={pts(view.survey)} fill="none" stroke="#555" strokeWidth={pen.thin} strokeDasharray={`${pen.text} ${pen.small * 0.6}`} />}
        <g fill="none" stroke="#000" strokeWidth={pen.thin} strokeLinejoin="round" data-seen="beyond">
          {view.beyond.map((line, i) => (
            <polyline key={i} points={pts(line)} />
          ))}
        </g>
        <g fill={POCHE} stroke="#000" strokeWidth={pen.heavy} strokeLinejoin="miter" data-seen="cut">
          {view.floors.map((f, i) => (
            <rect key={`f${i}`} x={f.u0} y={-f.y1} width={f.u1 - f.u0} height={f.y1 - f.y0} />
          ))}
          {view.roofs.map((r, i) => (
            <polygon key={`r${i}`} points={pts(r)} fill={ROOF_POCHE} />
          ))}
          {view.walls.map((w, i) => (
            <WallCut key={`w${i}`} wall={w} pen={pen} />
          ))}
          {view.solids.map((s, i) => (
            <polygon key={`s${i}`} points={pts(s)} />
          ))}
        </g>
        {g.length > 1 && <polyline points={pts(g)} fill="none" stroke="#000" strokeWidth={pen.heavy} data-grade="finished" />}
        <Levels view={view} layoutYs={layout.labelYs} end={layout.levelEnd} floorNavdFt={b.levels.floorNavdFt} pen={pen} />
        <g stroke="#000" strokeWidth={pen.hair} fill="none">
          {layout.dims.map((d, i) => (
            <Dim key={i} dim={d} pen={pen} />
          ))}
        </g>
        {SECTION_NOTE.map((line, i) => (
          <text key={line} x={layout.note.x} y={layout.note.y + i * pen.small * 1.3} fontSize={pen.small} fill="#000">
            {line}
          </text>
        ))}
      </g>
    </TiledDrawing>
  )
}

/** A cut wall: solid where it stands, open from sill to head where the cut passes through an opening, with its head, sill and (in a window) its glass. */
function WallCut({ wall: w, pen }: { readonly wall: CutWall; readonly pen: Pen }) {
  const width = w.u1 - w.u0
  const piece = (y0: number, y1: number, key: string) => (y1 - y0 > 1e-4 ? <rect key={key} x={w.u0} y={-y1} width={width} height={y1 - y0} /> : null)
  if (!w.opening) return piece(w.y0, w.y1, 'all')
  const sill = Math.max(w.y0, Math.min(w.y1, w.opening.sill))
  const head = Math.max(sill, Math.min(w.y1, w.opening.head))
  const mid = (w.u0 + w.u1) / 2
  return (
    <g data-opening={w.opening.tag}>
      {piece(w.y0, sill, 'below')}
      {piece(head, w.y1, 'above')}
      {w.opening.kind === 'window' && <line x1={mid} y1={-sill} x2={mid} y2={-head} stroke="#000" strokeWidth={pen.thin} />}
      <text x={mid} y={-head - pen.small * 0.6} fontSize={pen.small} textAnchor="middle" fill="#000" stroke="none">
        {w.opening.tag}
      </text>
    </g>
  )
}

function Levels({ view, layoutYs, end, floorNavdFt, pen }: { readonly view: SectionView; readonly layoutYs: readonly number[]; readonly end: number; readonly floorNavdFt: number; readonly pen: Pen }) {
  return (
    <g data-levels="">
      {view.levels.map((l, i) => {
        const at = -layoutYs[i]
        return (
          <g key={`${l.label}${l.yFt}`} stroke="#000" strokeWidth={pen.hair} data-level={l.label}>
            <line x1={view.uMax} y1={-l.yFt} x2={end} y2={-l.yFt} strokeDasharray={`${pen.text} ${pen.small * 0.5}`} />
            <polygon points={`${end},${-l.yFt} ${end - pen.small * 0.45},${-l.yFt - pen.small * 0.7} ${end + pen.small * 0.45},${-l.yFt - pen.small * 0.7}`} fill="#000" stroke="none" />
            <polyline points={`${end},${-l.yFt} ${end + pen.small},${at} ${end + pen.small * 1.6},${at}`} fill="none" />
            <text x={end + pen.small * 1.9} y={at} fontSize={pen.small} dominantBaseline="central" fill="#000" stroke="none">
              {levelText(l.label, l.yFt, floorNavdFt)}
            </text>
          </g>
        )
      })}
    </g>
  )
}

import { Fragment, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { formatArch, levelText } from '../format'
import { elevationView } from '../model/model'
import { SIDE_LABEL, SIDES } from './sides'
import { CLEAN_SVG_CLASS, cleanMarginFt } from '../clean'
import type { ElevationImage, ElevationSide, ElevationView, Scale, SheetBuilding } from '../types'
import { captureElevation } from './sheetCapture'
import { ftToM } from '../../../site/units'
import type { Terrain } from '../../../site/types'
import type { PlanObject } from '../../../store/types'
import { TiledDrawing, type Extent, type SheetInfo } from '../Page'
import { Dim, penSizes, type Pen } from '../plan/PlanSheet'
import { dimBounds, dimensionLine, ptToFt, spreadApart, staggerLevel, textWidthFt, type DimLine, type DimOpts, type Placed, type Pt } from '../svgDims'

/** Image resolution: 200 dots per paper inch. */
const DPI = 200
const LEVEL_RUN_FT = 1.5
/** From the drawing to its first dimension line, paper points. */
const FIRST_PT = 12
/** The hatched ground runs at least this far under the lowest grade, feet. */
const GROUND_FT = 1.5
/** Nothing shorter than this is dimensioned, feet (1/4 in). */
const MIN_DIM_FT = 1 / 48
const MARGIN_FT = 1.5
const SURVEY_TEXT = 'surveyed grade'

interface Props {
  readonly building: SheetBuilding
  readonly object: PlanObject
  readonly objects: readonly PlanObject[]
  readonly terrain: Terrain
  readonly info: Omit<SheetInfo, 'sheetTitle' | 'northDeg'>
  /** Told true while any of the four images is still being drawn, false once all have finished or failed. */
  readonly onBusy?: (busy: boolean) => void
  /** With a scale, each side is drawn twice: first a clean copy at this scale (the picture and the ground only), then the dimensioned elevation. */
  readonly cleanScale?: Scale
}

interface Shot {
  readonly object: PlanObject
  readonly image?: ElevationImage
  readonly error?: string
}

/** One capture at a time: the scene renders each with its own camera. */
let queue: Promise<unknown> = Promise.resolve()
function queued<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(job, job)
  queue = run.catch(() => undefined)
  return run
}

/** The four elevations of a building: a picture from the 3D scene with levels, grade and dimensions drawn over it. */
export function ElevationSheet({ building: b, object, objects, terrain, info, onBusy, cleanScale }: Props) {
  // one picture per side and scale: the clean copy takes its own when its scale differs
  const scales = useMemo(() => (cleanScale === undefined || cleanScale === info.scale ? [info.scale] : [info.scale, cleanScale]), [info.scale, cleanScale])
  const { shots, retry } = useElevationImages(b, object, scales)
  const views = useMemo(() => SIDES.map((side) => elevationView(objects, terrain, b, side)), [objects, terrain, b])
  const busy = SIDES.some((side) =>
    scales.some((scale) => {
      const shot = shots[shotKey(b.id, side, scale)]
      return !shot || (!shot.image && !shot.error)
    }),
  )
  useEffect(() => onBusy?.(busy), [busy, onBusy])
  useEffect(() => () => onBusy?.(false), [onBusy])
  return (
    <>
      {views.map((view) => {
        const shot = shots[shotKey(b.id, view.side, info.scale)]
        const onRetry = () => retry(view.side)
        return (
          <Fragment key={view.side}>
            {cleanScale !== undefined && <SideSheet building={b} view={view} shot={shots[shotKey(b.id, view.side, cleanScale)]} info={{ ...info, scale: cleanScale }} onRetry={onRetry} clean />}
            <SideSheet building={b} view={view} shot={shot} info={info} onRetry={onRetry} />
          </Fragment>
        )
      })}
    </>
  )
}

const shotKey = (id: string, side: ElevationSide, scale: Scale) => `${id}|${side}|${scale}`

/** Captures one elevation, and once more if the first try fails (the scene may still be settling). */
function captureWithRetry(objectId: string, side: ElevationSide, pxPerFt: number, floorM: number): Promise<ElevationImage> {
  const once = () => queued(() => captureElevation({ objectId, side, pxPerFt, floorM }))
  return once().catch(once)
}

/** Images per side, captured once per (building, side, scale), again whenever the building changes, and again on `retry`. */
function useElevationImages(b: SheetBuilding, object: PlanObject, scales: readonly Scale[]): { shots: Readonly<Record<string, Shot>>; retry: (side: ElevationSide) => void } {
  const [shots, setShots] = useState<Readonly<Record<string, Shot>>>({})
  const [tries, setTries] = useState(0)
  const asked = useRef(new Map<string, PlanObject>())
  const floorM = ftToM(b.levels.floorNavdFt)
  useEffect(() => {
    for (const [side, scale] of SIDES.flatMap((s) => scales.map((sc) => [s, sc] as const))) {
      const key = shotKey(b.id, side, scale)
      if (asked.current.get(key) === object) continue
      asked.current.set(key, object)
      // a fresh shot each time, so a late answer from an earlier try cannot overwrite this one
      const pending: Shot = { object }
      setShots((s) => ({ ...s, [key]: pending }))
      const keep = (shot: Shot) => setShots((s) => (s[key] === pending ? { ...s, [key]: shot } : s))
      captureWithRetry(b.id, side, DPI * scale, floorM).then(
        (image) => keep({ object, image }),
        (err: unknown) => keep({ object, error: err instanceof Error ? err.message : 'The elevation could not be drawn' }),
      )
    }
  }, [b.id, object, scales, floorM, tries])
  const retry = useCallback(
    (side: ElevationSide) => {
      for (const scale of scales) asked.current.delete(shotKey(b.id, side, scale))
      setTries((n) => n + 1)
    },
    [b.id, scales],
  )
  return { shots, retry }
}

interface SideProps {
  readonly building: SheetBuilding
  readonly view: ElevationView
  readonly shot: Shot | undefined
  readonly info: Props['info']
  readonly onRetry: () => void
  /** The clean copy: the picture and the ground, with no levels or dimensions. */
  readonly clean?: boolean
}

function SideSheet({ building: b, view, shot, info, onRetry, clean = false }: SideProps) {
  const pen = penSizes(info.scale)
  const image = shot?.image
  const layout = useMemo(() => elevationLayout(b, view, image, info.scale), [b, view, image, info.scale])
  const hatch = `hatch-${useId().replace(/[^\w-]/g, '')}`
  const status = !shot || (!shot.image && !shot.error) ? 'Drawing elevation…' : shot.error ? `Could not draw the elevation: ${shot.error}` : null
  const grade = view.grade.map(([u, y]) => `${u},${-y}`).join(' ')
  const title = clean ? cleanTitle(view.side) : SIDE_LABEL[view.side]
  const ground = view.grade.length > 1 ? `${grade} ${view.grade[view.grade.length - 1][0]},${layout.groundBottom} ${view.grade[0][0]},${layout.groundBottom}` : ''
  return (
    <>
      {shot?.error && (
        <button className="sheet-retry" onClick={onRetry}>
          Try again: {SIDE_LABEL[view.side]} of {b.name}
        </button>
      )}
      <TiledDrawing info={{ ...info, sheetTitle: title, northDeg: null }} extent={clean ? cleanElevationExtent(b, view, info.scale) : layout.extent} label={`${title} of ${b.name}`} svgClass={clean ? CLEAN_SVG_CLASS : undefined}>
        <defs>
          <pattern id={hatch} patternUnits="userSpaceOnUse" width={0.6} height={0.6} patternTransform="rotate(45)">
            <line x1={0} y1={0} x2={0} y2={0.6} stroke="#000" strokeWidth={pen.hair} />
          </pattern>
        </defs>
        {image && <image href={image.dataUrl} x={image.uMin} y={-image.yMax} width={image.uMax - image.uMin} height={image.yMax - image.yMin} preserveAspectRatio="none" />}
        {status && (
          <text x={(view.uMin + view.uMax) / 2} y={-(b.levels.topFt / 2)} fontSize={pen.text * 1.3} textAnchor="middle" fill="#555">
            {status}
          </text>
        )}
        {ground && <polygon points={ground} fill={`url(#${hatch})`} stroke="none" />}
        {!clean && layout.surveyLabel && <SurveyLine view={view} label={layout.surveyLabel} pen={pen} />}
        {grade && <polyline points={grade} fill="none" stroke="#000" strokeWidth={pen.heavy} />}
        {!clean && view.levels.map((l, i) => {
          const end = view.uMax + LEVEL_RUN_FT
          const at = -layout.labelYs[i]
          return (
            <g key={`${l.label}${l.yFt}`} stroke="#000" strokeWidth={pen.hair}>
              <line x1={view.uMin - LEVEL_RUN_FT} y1={-l.yFt} x2={end} y2={-l.yFt} strokeDasharray={`${pen.text} ${pen.small * 0.5}`} />
              <polyline points={`${end},${-l.yFt} ${end + pen.small},${at} ${end + pen.small * 1.6},${at}`} fill="none" />
              <text x={end + pen.small * 1.9} y={at} fontSize={pen.small} dominantBaseline="central" fill="#000" stroke="none">
                {levelText(l.label, l.yFt, b.levels.floorNavdFt)}
              </text>
            </g>
          )
        })}
        {!clean && (
          <g stroke="#000" strokeWidth={pen.hair} fill="none">
            {layout.dims.map((d, i) => (
              <Dim key={i} dim={d} pen={pen} />
            ))}
          </g>
        )}
      </TiledDrawing>
    </>
  )
}

/** "Clean front elevation": a clean copy's title, from the side's own. */
const cleanTitle = (side: ElevationSide): string => `Clean ${SIDE_LABEL[side].charAt(0).toLowerCase()}${SIDE_LABEL[side].slice(1)}`

/** The picture's own pad round the building in a capture, feet: a clean copy keeps at least this much beside it. */
const CLEAN_SIDE_FT = 3

/**
 * A clean elevation's reach: the view's width, from its highest point down to
 * the bottom of the hatched ground, and a little clear paper. It does not
 * depend on the picture, so the scale fitted before the capture still holds.
 */
export function cleanElevationExtent(b: SheetBuilding, view: ElevationView, scale: Scale): Extent {
  const m = cleanMarginFt(scale)
  const side = Math.max(m, CLEAN_SIDE_FT)
  const ys = [...view.levels.map((l) => l.yFt), ...view.grade.map(([, y]) => y), ...view.survey.map(([, y]) => y)]
  const high = Math.max(b.levels.topFt, ...ys)
  const { groundBottom } = elevationLayout(b, view, undefined, scale)
  return { x: view.uMin - side, y: -high - m, w: view.uMax - view.uMin + 2 * side, h: high + groundBottom + 2 * m }
}

/** The survey is drawn where it stands off the finished grade by more than this, feet (1 in). */
const SURVEY_OFF_FT = 1 / 12

/** Whether the earthworks move the ground along this view enough to draw the survey too. */
export const surveyDiffers = (view: ElevationView): boolean => view.survey.some(([, y], i) => Math.abs(y - (view.grade[i]?.[1] ?? y)) > SURVEY_OFF_FT)

/** The surveyed ground, dashed and grey, under (or over) the finished grade, named in the ground below with a leader to where it stands furthest off. */
function SurveyLine({ view, label, pen }: { readonly view: ElevationView; readonly label: SurveyLabel; readonly pen: Pen }) {
  const [[fx, fy], [tx, ty]] = label.leader
  return (
    <g stroke="#555" fill="none">
      <polyline points={view.survey.map(([su, sy]) => `${su},${-sy}`).join(' ')} strokeWidth={pen.thin} strokeDasharray={`${pen.text} ${pen.small * 0.6}`} />
      <line x1={fx} y1={fy} x2={tx} y2={ty} strokeWidth={pen.hair} />
      <circle cx={fx} cy={fy} r={pen.thin * 2} fill="#555" stroke="none" />
      <text x={label.x} y={label.y} fontSize={pen.small} textAnchor="middle" dominantBaseline="central" fill="#555" stroke="#fff" strokeWidth={pen.small * 0.3} paintOrder="stroke">
        {label.text}
      </text>
    </g>
  )
}

/** The gaps between the drawing and its strings of dimensions, as paper sizes in drawing feet, so they print the same at every scale. */
function gapSizes(scale: Scale, pen: Pen) {
  return {
    /** From the drawing to the first dimension line. */
    first: ptToFt(FIRST_PT, scale),
    /** Between the columns of stepped-out height texts, which read up the page. */
    column: pen.text * 1.3,
    /** Between rows of width dimensions: a line, its text under it, and clear paper. */
    row: pen.text * 2,
    /** Depth of the hatched ground under the lowest grade; deep enough to name the surveyed grade in. */
    ground: Math.max(GROUND_FT, pen.small * 2),
  }
}

type Gaps = ReturnType<typeof gapSizes>
type Opts = Required<Pick<DimOpts, 'gapFt' | 'overshootFt' | 'tickFt' | 'textOffsetFt'>>

const clamp = (v: number, lo: number, hi: number): number => (lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v)))
/** A dimension with its text slid along its line to a new centre. */
const textAt = (d: DimLine, x: number, y: number): DimLine => ({ ...d, text: { ...d.text, x, y } })

/**
 * The chain of heights up the left, then the overall height. Each text takes the nearest column its length leaves
 * free; one longer than its own step starts a column out, clear of the ticks, and stays between the top and bottom
 * lines. The overall line stands outside them all.
 */
function heightDims(ys: readonly number[], low: number, high: number, left: number, pen: Pen, opts: Opts, gaps: Gaps): DimLine[] {
  const normal: Pt = [-1, 0]
  const steps = ys.slice(1).map((y, i) => [ys[i], y] as const).filter(([a, c]) => c - a >= MIN_DIM_FT)
  const pad = pen.text * 0.25
  const texts = steps.map(([a, c]) => {
    const half = textWidthFt(formatArch(c - a), pen.text) / 2
    return { half, at: clamp(-(a + c) / 2, -high + half + pad, -low - half - pad), tight: c - a < half * 2.2 }
  })
  const placed = texts.reduce<Placed[]>((out, { half, at, tight }) => {
    const span = { side: 'left', lo: at - half, hi: at + half } as const
    const kept: Placed[] = tight ? [...out, { ...span, level: 0 }] : out
    return [...out, { ...span, level: staggerLevel(kept, 'left', span.lo, span.hi, pad) }]
  }, [])
  const chain = steps.map(([a, c], i) => {
    const d = dimensionLine([left, -a], [left, -c], gaps.first, { ...opts, textOffsetFt: opts.textOffsetFt + gaps.column * placed[i].level, normal })
    return textAt(d, d.text.x, texts[i].at)
  })
  const columns = Math.max(0, ...placed.map((p) => p.level))
  const overallAt = gaps.first + opts.textOffsetFt + gaps.column * columns + pen.text
  return [...chain, dimensionLine([left, -low], [left, -high], overallAt, { ...opts, normal })]
}

/** One width to dimension: its span along the view, and the centre and half length of its text. */
interface Width {
  readonly u0: number
  readonly u1: number
  readonly at: number
  readonly half: number
}

/** The parts' widths along the view, shortest first, less any too short to measure, given twice, or as wide as the whole view. */
function widthsOf(view: ElevationView, pen: Pen): Width[] {
  const same = (a: readonly [number, number], c: readonly [number, number]) => Math.abs(a[0] - c[0]) < MIN_DIM_FT && Math.abs(a[1] - c[1]) < MIN_DIM_FT
  const whole = [view.uMin, view.uMax] as const
  return view.spans
    .map((s) => [Math.min(s.u0, s.u1), Math.max(s.u0, s.u1)] as const)
    .filter((s, i, all) => s[1] - s[0] >= MIN_DIM_FT && !same(s, whole) && all.findIndex((o) => same(o, s)) === i)
    .sort((a, c) => a[1] - a[0] - (c[1] - c[0]))
    .map(([u0, u1]) => {
      const half = textWidthFt(formatArch(u1 - u0), pen.text) / 2
      return { u0, u1, half, at: clamp((u0 + u1) / 2, view.uMin + half + pen.text * 0.5, view.uMax - half - pen.text * 0.5) }
    })
}

/** Whether a's extension lines, dropping from the drawing, would run through c's text: then a's row must be the nearer the drawing. */
const cuts = (a: Width, c: Width, pad: number): boolean => [a.u0, a.u1].some((u) => u > c.at - c.half - pad && u < c.at + c.half + pad)
/** Whether two widths' lines or texts would meet in one row. */
const meet = (a: Width, c: Width, pad: number): boolean => Math.min(a.u0, a.at - a.half) < Math.max(c.u1, c.at + c.half) + pad && Math.min(c.u0, c.at - c.half) < Math.max(a.u1, a.at + a.half) + pad

/**
 * The row of each width, 0 nearest the drawing. A width whose extension lines would cut another's text goes first and
 * nearer the drawing; then each takes the nearest row where it meets nothing.
 */
function widthRows(widths: readonly Width[], pad: number, rows: ReadonlyMap<number, number> = new Map()): ReadonlyMap<number, number> {
  const waiting = widths.map((_, i) => i).filter((i) => !rows.has(i))
  if (!waiting.length) return rows
  const next = waiting.find((i) => !waiting.some((j) => j !== i && cuts(widths[j], widths[i], pad))) ?? waiting[0]
  const w = widths[next]
  const done = [...rows]
  const nearer = Math.max(-1, ...done.filter(([j]) => cuts(widths[j], w, pad)).map(([, r]) => r))
  const taken = new Set(done.filter(([j]) => meet(widths[j], w, pad)).map(([, r]) => r))
  const free = Array.from({ length: taken.size + 1 }, (_, k) => nearer + 1 + k).find((r) => !taken.has(r)) ?? nearer + 1
  return widthRows(widths, pad, new Map([...done, [next, free]]))
}

/**
 * A width's text slid along its own line, as little as may be, off the extension lines of the widths in rows further
 * out, which drop through its row; left where it is when its span has no clear place for it.
 */
function clearOfLines(w: Width, row: number, widths: readonly Width[], rows: ReadonlyMap<number, number>, pad: number): Width {
  const lines = widths.filter((_, j) => (rows.get(j) ?? 0) > row).flatMap((o) => [o.u0, o.u1])
  const clear = (at: number) => lines.every((u) => u <= at - w.half - pad || u >= at + w.half + pad)
  if (clear(w.at)) return w
  const inSpan = (at: number) => at - w.half >= w.u0 && at + w.half <= w.u1
  const places = lines.flatMap((u) => [u - w.half - pad, u + w.half + pad]).filter((at) => inSpan(at) && clear(at))
  return places.length ? { ...w, at: places.reduce((best, at) => (Math.abs(at - w.at) < Math.abs(best - w.at) ? at : best)) } : w
}

/** The rows of widths under the ground, then the overall width. */
function widthDims(view: ElevationView, top: number, pen: Pen, opts: Opts, gaps: Gaps): DimLine[] {
  const normal: Pt = [0, 1]
  const pad = pen.text * 0.5
  const spans = widthsOf(view, pen)
  const rows = widthRows(spans, pad)
  const widths = spans.map((w, i) => clearOfLines(w, rows.get(i) ?? 0, spans, rows, pad))
  const count = Math.max(-1, ...rows.values()) + 1
  return [
    ...widths.map((w, i) => {
      const d = dimensionLine([w.u0, top], [w.u1, top], gaps.first + gaps.row * (rows.get(i) ?? 0), { ...opts, normal })
      return textAt(d, w.at, d.text.y)
    }),
    dimensionLine([view.uMin, top], [view.uMax, top], gaps.first + gaps.row * count, { ...opts, normal }),
  ]
}

export interface SurveyLabel {
  readonly text: string
  /** Centre of the text, in (u, -y) feet. */
  readonly x: number
  readonly y: number
  /** From the surveyed line, where it stands furthest off the finished grade, down to the text. */
  readonly leader: readonly [Pt, Pt]
}

/** Where the surveyed grade is named: in the ground under the lowest line, inside the view's width, with a leader up to the surveyed line. */
function surveyLabelAt(view: ElevationView, base: number, pen: Pen): SurveyLabel | null {
  if (!surveyDiffers(view)) return null
  const off = view.survey.map(([, y], i) => Math.abs(y - (view.grade[i]?.[1] ?? y)))
  const [u, y] = view.survey[off.indexOf(Math.max(...off))]
  const half = textWidthFt(SURVEY_TEXT, pen.small) / 2
  const mid = (view.uMin + view.uMax) / 2
  const x = view.uMax - view.uMin > half * 2 ? Math.min(view.uMax - half, Math.max(view.uMin + half, u)) : mid
  const at = base + pen.small
  const leadX = Math.min(x + half, Math.max(x - half, u))
  return { text: SURVEY_TEXT, x, y: at, leader: [[u, -y], [leadX, at - pen.small * 0.6]] }
}

export interface ElevationLayout {
  readonly dims: DimLine[]
  readonly extent: Extent
  /** The lowest grade, as drawn (y down), and the bottom of the hatched ground under it. */
  readonly base: number
  readonly groundBottom: number
  readonly labelYs: number[]
  readonly surveyLabel: SurveyLabel | null
}

/** Dimension lines and the drawing's edges for one elevation, in (u, -y) feet. */
export function elevationLayout(b: SheetBuilding, view: ElevationView, image: ElevationImage | undefined, scale: Scale): ElevationLayout {
  const pen = penSizes(scale)
  const gaps = gapSizes(scale, pen)
  const opts: Opts = { gapFt: pen.gap, overshootFt: pen.overshoot, tickFt: pen.tick, textOffsetFt: pen.text * 0.75 }
  const ys = view.levels.map((l) => l.yFt)
  const gradeYs = [...view.grade, ...view.survey].map(([, y]) => y)
  const low = Math.min(b.levels.gradeLowFt, ...gradeYs, ...ys)
  const high = Math.max(b.levels.topFt, ...ys, ...gradeYs)
  const left = view.uMin - LEVEL_RUN_FT
  const base = -low
  const groundBottom = base + gaps.ground
  const dims = [...heightDims(ys, low, high, left, pen, opts, gaps), ...widthDims(view, groundBottom, pen, opts, gaps)]

  const labelYs = spreadApart(ys, pen.small * 1.25)
  const labelW = Math.max(0, ...view.levels.map((l) => textWidthFt(levelText(l.label, l.yFt, b.levels.floorNavdFt), pen.small)))
  const reach = dimBounds(dims)
  const halfText = pen.text / 2
  const xs = [(reach?.minx ?? left) - halfText, view.uMax + LEVEL_RUN_FT + pen.small * 1.9 + labelW, image?.uMin ?? view.uMin, image?.uMax ?? view.uMax]
  const yTop = Math.min(-high, -Math.max(high, ...labelYs) - pen.small, image ? -image.yMax : -high, reach?.miny ?? -high)
  const yBottom = Math.max(groundBottom, (reach?.maxy ?? base) + halfText, image ? -image.yMin : base)
  const x0 = Math.floor(Math.min(...xs) - MARGIN_FT)
  const y0 = Math.floor(yTop - MARGIN_FT)
  const extent = { x: x0, y: y0, w: Math.ceil(Math.max(...xs) + MARGIN_FT) - x0, h: Math.ceil(yBottom + MARGIN_FT) - y0 }
  return { dims, base, groundBottom, labelYs, surveyLabel: surveyLabelAt(view, base, pen), extent }
}

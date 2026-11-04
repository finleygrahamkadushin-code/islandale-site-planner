import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { formatArch } from '../../export/sheets/format'
import { elevationView } from '../../export/sheets/model'
import { SIDE_LABEL, SIDES } from '../../export/sheets/sides'
import type { ElevationImage, ElevationSide, ElevationView, Scale, SheetBuilding } from '../../export/sheets/types'
import { captureElevation } from '../../scene/sheetCapture'
import { ftToM } from '../../site/units'
import type { Terrain } from '../../site/types'
import type { PlanObject } from '../../store/types'
import { TiledDrawing, type Extent, type SheetInfo } from './Page'
import { Dim, penSizes } from './PlanSheet'
import { dimBounds, dimensionLine, sideOf, spanAlong, spreadApart, staggerLevel, textWidthFt, type DimLine, type Placed, type Pt } from './svgDims'

/** Image resolution: 200 dots per paper inch. */
const DPI = 200
const LEVEL_RUN_FT = 1.5
const CHAIN_FT = 2
const OVERALL_FT = 4
const BELOW_FT = 2.5
const STAGGER_FT = 1.5
const MARGIN_FT = 1.5

interface Props {
  readonly building: SheetBuilding
  readonly object: PlanObject
  readonly objects: readonly PlanObject[]
  readonly terrain: Terrain
  readonly info: Omit<SheetInfo, 'sheetTitle' | 'northDeg'>
  /** Told true while any of the four images is still being drawn, false once all have finished or failed. */
  readonly onBusy?: (busy: boolean) => void
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
export function ElevationSheet({ building: b, object, objects, terrain, info, onBusy }: Props) {
  const { shots, retry } = useElevationImages(b, object, info.scale)
  const views = useMemo(() => SIDES.map((side) => elevationView(objects, terrain, b, side)), [objects, terrain, b])
  const busy = SIDES.some((side) => {
    const shot = shots[shotKey(b.id, side, info.scale)]
    return !shot || (!shot.image && !shot.error)
  })
  useEffect(() => onBusy?.(busy), [busy, onBusy])
  useEffect(() => () => onBusy?.(false), [onBusy])
  return (
    <>
      {views.map((view) => {
        const shot = shots[shotKey(b.id, view.side, info.scale)]
        return <SideSheet key={view.side} building={b} view={view} shot={shot} info={info} onRetry={() => retry(view.side)} />
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
function useElevationImages(b: SheetBuilding, object: PlanObject, scale: Scale): { shots: Readonly<Record<string, Shot>>; retry: (side: ElevationSide) => void } {
  const [shots, setShots] = useState<Readonly<Record<string, Shot>>>({})
  const [tries, setTries] = useState(0)
  const asked = useRef(new Map<string, PlanObject>())
  const floorM = ftToM(b.levels.floorNavdFt)
  useEffect(() => {
    for (const side of SIDES) {
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
  }, [b.id, object, scale, floorM, tries])
  const retry = useCallback(
    (side: ElevationSide) => {
      asked.current.delete(shotKey(b.id, side, scale))
      setTries((n) => n + 1)
    },
    [b.id, scale],
  )
  return { shots, retry }
}

interface SideProps {
  readonly building: SheetBuilding
  readonly view: ElevationView
  readonly shot: Shot | undefined
  readonly info: Props['info']
  readonly onRetry: () => void
}

function SideSheet({ building: b, view, shot, info, onRetry }: SideProps) {
  const pen = penSizes(info.scale)
  const image = shot?.image
  const layout = useMemo(() => elevationLayout(b, view, image, info.scale), [b, view, image, info.scale])
  const hatch = `hatch-${useId().replace(/[^\w-]/g, '')}`
  const status = !shot || (!shot.image && !shot.error) ? 'Drawing elevation…' : shot.error ? `Could not draw the elevation: ${shot.error}` : null
  const grade = view.grade.map(([u, y]) => `${u},${-y}`).join(' ')
  const ground = view.grade.length > 1 ? `${grade} ${view.grade[view.grade.length - 1][0]},${layout.base + 1.5} ${view.grade[0][0]},${layout.base + 1.5}` : ''
  return (
    <>
      {shot?.error && (
        <button className="sheet-retry" onClick={onRetry}>
          Try again: {SIDE_LABEL[view.side]} of {b.name}
        </button>
      )}
      <TiledDrawing info={{ ...info, sheetTitle: SIDE_LABEL[view.side], northDeg: null }} extent={layout.extent} label={`${SIDE_LABEL[view.side]} of ${b.name}`}>
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
        {grade && <polyline points={grade} fill="none" stroke="#000" strokeWidth={pen.heavy} />}
        {view.levels.map((l, i) => {
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
        <g stroke="#000" strokeWidth={pen.hair} fill="none">
          {layout.dims.map((d, i) => (
            <Dim key={i} dim={d} pen={pen} />
          ))}
        </g>
      </TiledDrawing>
    </>
  )
}

const SEP = ' '
export const levelText = (label: string, yFt: number, floorNavdFt: number) =>
  `${label}${SEP}${yFt >= 0 ? '+' : ''}${formatArch(yFt)}${SEP}(NAVD88 ${formatArch(floorNavdFt + yFt)})`

/** Dimension lines and the drawing's edges for one elevation, in (u, -y) feet. */
export function elevationLayout(b: SheetBuilding, view: ElevationView, image: ElevationImage | undefined, scale: Scale): { dims: DimLine[]; extent: Extent; base: number; labelYs: number[] } {
  const pen = penSizes(scale)
  const opts = { gapFt: pen.gap, overshootFt: pen.overshoot, tickFt: pen.tick, textOffsetFt: pen.text * 0.75 }
  const ys = view.levels.map((l) => l.yFt)
  const gradeYs = view.grade.map(([, y]) => y)
  const low = Math.min(b.levels.gradeLowFt, ...gradeYs, ...ys)
  const high = Math.max(b.levels.topFt, ...ys)
  const left = view.uMin - LEVEL_RUN_FT
  const dims: DimLine[] = []
  let crowded = 0
  for (let i = 1; i < ys.length; i++) {
    const rise = ys[i] - ys[i - 1]
    if (rise < 1 / 48) continue
    // a step too short for its text sets the text further out, in turn, so neighbours do not overprint
    crowded = rise < textWidthFt(formatArch(rise), pen.text) * 1.1 ? crowded + 1 : 0
    const textOffsetFt = opts.textOffsetFt + pen.text * 1.2 * (crowded % 3)
    dims.push(dimensionLine([left, -ys[i - 1]], [left, -ys[i]], CHAIN_FT, { ...opts, textOffsetFt, normal: [-1, 0] }))
  }
  dims.push(dimensionLine([left, -low], [left, -high], CHAIN_FT + OVERALL_FT, { ...opts, normal: [-1, 0] }))

  const base = -low
  const placed: Placed[] = []
  for (const s of view.spans) {
    const a: Pt = [Math.min(s.u0, s.u1), base]
    const c: Pt = [Math.max(s.u0, s.u1), base]
    if (c[0] - a[0] < 1 / 48) continue
    const side = sideOf([0, 1])
    const [lo, hi] = spanAlong(side, a, c)
    const level = staggerLevel(placed, side, lo, hi, 0.25)
    placed.push({ side, lo, hi, level })
    dims.push(dimensionLine(a, c, BELOW_FT + STAGGER_FT * level, { ...opts, normal: [0, 1] }))
  }
  const deepest = Math.max(0, ...placed.map((p) => p.level))
  dims.push(dimensionLine([view.uMin, base], [view.uMax, base], BELOW_FT + STAGGER_FT * (deepest + 1.5), { ...opts, normal: [0, 1] }))

  const labelYs = spreadApart(ys, pen.small * 1.25)
  const labelW = Math.max(0, ...view.levels.map((l) => textWidthFt(levelText(l.label, l.yFt, b.levels.floorNavdFt), pen.small)))
  const reach = dimBounds(dims)
  const xs = [reach?.minx ?? left, view.uMax + LEVEL_RUN_FT + pen.small * 1.9 + labelW, image?.uMin ?? view.uMin, image?.uMax ?? view.uMax]
  const yTop = Math.min(-high, -Math.max(high, ...labelYs) - pen.small, image ? -image.yMax : -high, reach?.miny ?? -high)
  const yBottom = Math.max(base + 1.5, reach?.maxy ?? base, image ? -image.yMin : base)
  const x0 = Math.floor(Math.min(...xs) - MARGIN_FT)
  const y0 = Math.floor(yTop - MARGIN_FT)
  return { dims, base, labelYs, extent: { x: x0, y: y0, w: Math.ceil(Math.max(...xs) + MARGIN_FT) - x0, h: Math.ceil(yBottom + MARGIN_FT) - y0 } }
}

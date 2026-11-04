/**
 * Where a floor plan's dimensions and notes go, in building-frame feet.
 * Pure, so it is worked out once per building and checked in node.
 */
import { signedArea } from '../../buildings/footprint'
import { formatArch } from '../../export/sheets/format'
import { boundsOf } from '../../export/sheets/model'
import type { Scale, SheetBounds, SheetBuilding } from '../../export/sheets/types'
import type { Extent } from './Page'
import { arcPoints, openingStops, pointAlong } from './planDims'
import { arcMidpoint, dimBounds, dimensionLine, normalAwayFrom, outwardNormal, ptToFt, sideOf, spanAlong, staggerLevel, textWidthFt, type DimLine, type Placed, type Pt } from './svgDims'

const FIRST_OFFSET_FT = 2.5
const STAGGER_FT = 1.5
const OVERALL_GAP_FT = 2
const MARGIN_FT = 1.5
/** Arcs whose centre lies this far beyond the building get a short leader instead of one from the centre. */
const FAR_CENTRE_FT = 10
/** How far outside a curved wall an opening's note sits, feet. */
const NOTE_OUT_FT = 1.2
/** Bounds poking out further than this count as reaching past the walls, feet. */
const BEYOND_FT = 1 / 48

/** Paper sizes turned into drawing feet at the scale. */
export function penSizes(scale: Scale) {
  return {
    text: ptToFt(7.5, scale),
    small: ptToFt(6.5, scale),
    tiny: ptToFt(5, scale),
    heavy: ptToFt(2, scale),
    medium: ptToFt(1, scale),
    thin: ptToFt(0.5, scale),
    hair: ptToFt(0.35, scale),
    gap: 1 / 16 / scale,
    tick: ptToFt(3, scale),
    overshoot: ptToFt(4, scale),
  }
}

export type Pen = ReturnType<typeof penSizes>

/** A dimension with an optional word before its length ("Roof overall"). */
export type LabelledDim = DimLine & { readonly label?: string }

export interface ArcNote {
  readonly centre: Pt
  readonly mid: Pt
  readonly leaderFrom: Pt
  readonly showCentre: boolean
  readonly radiusFt: number
  readonly lengthFt: number
  readonly sweepDeg: number
}

/** Where an opening on a curve is, written beside it: its tag, its width round the wall and its distance round the wall from P1. */
export interface CurveOpeningNote {
  readonly at: Pt
  readonly anchor: 'start' | 'end'
  readonly lines: readonly string[]
}

export interface PlanLayout {
  readonly dims: LabelledDim[]
  readonly arcs: ArcNote[]
  readonly notes: CurveOpeningNote[]
  readonly extent: Extent
}

type Opts = Parameters<typeof dimensionLine>[3]

/** Every straight edge, chained through the opening pieces on it, then its length; a curve's chords are located by its arcs instead. */
function edgeDims(b: SheetBuilding, opts: Opts, placed: Placed[]): DimLine[] {
  const dims: DimLine[] = []
  for (const part of b.parts) {
    const area = signedArea(part.outline)
    for (const e of part.edges) {
      if (e.curved || e.lengthFt < 1 / 48) continue
      const normal = outwardNormal(area, e.a, e.b)
      const side = sideOf(normal)
      const [lo, hi] = spanAlong(side, e.a, e.b)
      const stops = openingStops(e.a, e.b, part.openings)
      if (stops.length) {
        const chain = staggerLevel(placed, side, lo, hi, 0.5)
        placed.push({ side, lo, hi, level: chain })
        stops.slice(1).forEach((t, i) => {
          dims.push(dimensionLine(pointAlong(e.a, e.b, stops[i]), pointAlong(e.a, e.b, t), FIRST_OFFSET_FT + STAGGER_FT * chain, { ...opts, normal }))
        })
      }
      const level = staggerLevel(placed, side, lo, hi, 0.5)
      placed.push({ side, lo, hi, level })
      dims.push(dimensionLine(e.a, e.b, FIRST_OFFSET_FT + STAGGER_FT * level, { ...opts, normal }))
    }
  }
  return dims
}

const reaches = (box: SheetBounds | null, walls: SheetBounds, axis: 'x' | 'z') =>
  box !== null && (axis === 'x' ? box.minx < walls.minx - BEYOND_FT || box.maxx > walls.maxx + BEYOND_FT : box.minz < walls.minz - BEYOND_FT || box.maxz > walls.maxz + BEYOND_FT)

const differs = (box: SheetBounds | null, walls: SheetBounds, axis: 'x' | 'z') =>
  box !== null &&
  (axis === 'x' ? Math.abs(box.minx - walls.minx) > BEYOND_FT || Math.abs(box.maxx - walls.maxx) > BEYOND_FT : Math.abs(box.minz - walls.minz) > BEYOND_FT || Math.abs(box.maxz - walls.maxz) > BEYOND_FT)

/**
 * The overall width (along the top) and depth (down the left) of the
 * outlines; then the main walls' bounding box when it holds the datum and is
 * not the overall size; then the steps and the roof where they reach further.
 */
function overallDims(b: SheetBuilding, opts: Opts, edge: readonly DimLine[]): LabelledDim[] {
  const walls = b.outlineBounds
  const eaves = b.parts.flatMap((p) => p.roof?.eave ?? [])
  const steps = b.parts.flatMap((p) => p.stepBands.flat(2))
  const mainBox = b.datumOnWall ? null : b.mainBounds
  const stepBox = steps.length ? boundsOf(steps) : null
  const roofBox = eaves.length ? boundsOf(eaves) : null
  const boxes: { label: string; box: SheetBounds | null; shows: (axis: 'x' | 'z') => boolean }[] = [
    { label: 'Overall', box: walls, shows: () => true },
    { label: 'Main box', box: mainBox, shows: (axis) => differs(mainBox, walls, axis) },
    { label: 'Steps overall', box: stepBox, shows: (axis) => reaches(stepBox, walls, axis) },
    { label: 'Roof overall', box: roofBox, shows: (axis) => reaches(roofBox, walls, axis) },
  ]
  const { minx, minz } = b.bounds
  const reach = dimBounds(edge) ?? { minx, maxx: b.bounds.maxx, miny: minz, maxy: b.bounds.maxz }
  const top = Math.min(reach.miny, minz - FIRST_OFFSET_FT) - OVERALL_GAP_FT
  const left = Math.min(reach.minx, minx - FIRST_OFFSET_FT) - OVERALL_GAP_FT
  const across = boxes.filter((x) => x.shows('x'))
  const down = boxes.filter((x) => x.shows('z'))
  const dims: LabelledDim[] = []
  across.forEach(({ label, box }, k) => {
    if (box) dims.push({ ...dimensionLine([box.minx, box.minz], [box.maxx, box.minz], box.minz - top + STAGGER_FT * k, { ...opts, normal: [0, -1] }), label })
  })
  down.forEach(({ label, box }, k) => {
    if (box) dims.push({ ...dimensionLine([box.minx, box.maxz], [box.minx, box.minz], box.minx - left + STAGGER_FT * k, { ...opts, normal: [-1, 0] }), label })
  })
  return dims
}

function arcNotes(b: SheetBuilding): ArcNote[] {
  const { minx, maxx, minz, maxz } = b.bounds
  return b.parts.flatMap((part) =>
    part.arcs.map((arc): ArcNote => {
      const mid = arcMidpoint(arcPoints(part.edges, arc), arc.centre, arc.radiusFt)
      const [cx, cz] = arc.centre
      const showCentre = cx > minx - FAR_CENTRE_FT && cx < maxx + FAR_CENTRE_FT && cz > minz - FAR_CENTRE_FT && cz < maxz + FAR_CENTRE_FT
      const toward = unitTo(mid, arc.centre)
      const leaderFrom: Pt = showCentre ? arc.centre : [mid[0] + toward[0] * 4, mid[1] + toward[1] * 4]
      return { centre: arc.centre, mid, leaderFrom, showCentre, radiusFt: arc.radiusFt, lengthFt: arc.lengthFt, sweepDeg: arc.sweepDeg }
    }),
  )
}

/** A note just outside each opening on a curve, where a chain of straight dimensions cannot locate it. */
function curveOpeningNotes(b: SheetBuilding): CurveOpeningNote[] {
  return b.parts.flatMap((part) =>
    part.openings.flatMap((o): CurveOpeningNote[] => {
      if (!o.onCurve || o.aroundFt === null) return []
      const piece = o.pieces[Math.floor(o.pieces.length / 2)]
      if (!piece) return []
      const n = normalAwayFrom(part.outline, piece.a, piece.b)
      const mid: Pt = [(piece.a[0] + piece.b[0]) / 2, (piece.a[1] + piece.b[1]) / 2]
      return [
        {
          at: [mid[0] + n[0] * NOTE_OUT_FT, mid[1] + n[1] * NOTE_OUT_FT],
          anchor: n[0] >= 0 ? 'start' : 'end',
          lines: [`${o.tag} ${formatArch(o.widthFt)} round wall`, `${formatArch(o.aroundFt)} from P1`],
        },
      ]
    }),
  )
}

/** Where every dimension, arc note and the drawing's edges go. */
export function planLayout(b: SheetBuilding, scale: Scale): PlanLayout {
  const pen = penSizes(scale)
  const opts = { gapFt: pen.gap, overshootFt: pen.overshoot, tickFt: pen.tick, textOffsetFt: pen.text * 0.75 }
  const edge = edgeDims(b, opts, [])
  const dims: LabelledDim[] = [...edge, ...overallDims(b, opts, edge)]
  const arcs = arcNotes(b)
  const notes = curveOpeningNotes(b)
  const { minx, maxx, minz, maxz } = b.bounds
  const all = dimBounds(dims)
  const noteXs = notes.flatMap((n) => {
    const w = Math.max(...n.lines.map((l) => textWidthFt(l, pen.small)))
    return n.anchor === 'start' ? [n.at[0], n.at[0] + w] : [n.at[0] - w, n.at[0]]
  })
  const noteYs = notes.flatMap((n) => [n.at[1] - pen.small, n.at[1] + pen.small * (n.lines.length + 0.5)])
  const xs = [minx, maxx, all?.minx ?? minx, all?.maxx ?? maxx, ...arcs.flatMap((a) => [a.leaderFrom[0], a.mid[0]]), ...noteXs]
  const ys = [minz, maxz, all?.miny ?? minz, all?.maxy ?? maxz, ...arcs.flatMap((a) => [a.leaderFrom[1], a.mid[1]]), ...noteYs]
  const x0 = Math.floor(Math.min(...xs) - MARGIN_FT)
  const y0 = Math.floor(Math.min(...ys) - MARGIN_FT)
  const extent = { x: x0, y: y0, w: Math.ceil(Math.max(...xs) + MARGIN_FT) - x0, h: Math.ceil(Math.max(...ys) + MARGIN_FT) - y0 }
  return { dims, arcs, notes, extent }
}

export function unitTo(from: Pt, to: Pt): Pt {
  const l = Math.hypot(to[0] - from[0], to[1] - from[1]) || 1
  return [(to[0] - from[0]) / l, (to[1] - from[1]) / l]
}

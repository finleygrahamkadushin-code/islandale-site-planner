/**
 * Where a floor plan's dimensions and notes go, in building-frame feet.
 * Pure, so it is worked out once per building and checked in node.
 */
import { signedArea } from '../../../buildings/footprint'
import { formatArch } from '../format'
import { boundsOf } from '../model/model'
import type { AnyScale, Scale, SheetBounds, SheetBuilding, SheetFloor } from '../types'
import type { Extent } from '../Page'
import { arcPoints, clearFigures, datumLabelBox, openingStops, pointAlong, sameRow, turnedBox, type Box, type DimRow } from './planDims'
import { earthNotes, earthPlan, type EarthLabel, type EarthPlan } from './earthLayout'
import { openingTagAt, thicknessMarks, thicknessText, wallNotes, type ThicknessMark } from './planWalls'
import { supportDims, supportExtentPoints } from '../foundation/supportLayout'
import { arcMidpoint, dimBounds, dimensionLine, normalAwayFrom, outwardNormal, ptToFt, sideOf, spanAlong, staggerLevel, textWidthFt, uprightAngle, type DimLine, type Placed, type Pt } from '../svgDims'

const FIRST_OFFSET_FT = 2.5
const STAGGER_FT = 1.5
const OVERALL_GAP_FT = 2
const MARGIN_FT = 1.5
/** The same three on paper, in text heights: at scales under 1/8" a foot is too small to hold a line of figures, so the larger of the two is used. */
const FIRST_OFFSET_TEXT = 2
const STAGGER_TEXT = 1.8
const OVERALL_GAP_TEXT = 2
/** Arcs whose centre lies this far beyond the building get a short leader instead of one from the centre. */
const FAR_CENTRE_FT = 10
/** How far outside a curved wall an opening's note sits, feet. */
const NOTE_OUT_FT = 1.2
/** Bounds poking out further than this count as reaching past the walls, feet. */
const BEYOND_FT = 1 / 48
/** The sheet's general notes start this many text heights below the drawing. */
const NOTES_GAP_TEXT = 2

/** Paper sizes turned into drawing feet at the scale. */
export function penSizes(scale: AnyScale) {
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

/** How far the dimension rows stand off the drawing and each other, feet: never less than a line of figures needs on paper. */
export const dimSpacing = (pen: Pick<Pen, 'text'>) => ({
  first: Math.max(FIRST_OFFSET_FT, pen.text * FIRST_OFFSET_TEXT),
  stagger: Math.max(STAGGER_FT, pen.text * STAGGER_TEXT),
  overallGap: Math.max(OVERALL_GAP_FT, pen.text * OVERALL_GAP_TEXT),
})

type Spacing = ReturnType<typeof dimSpacing>

/** A dimension with an optional word before its length ("Roof overall"). */
export type LabelledDim = DimLine & { readonly label?: string }

export interface ArcNote {
  readonly centre: Pt
  readonly mid: Pt
  readonly leaderFrom: Pt
  readonly showCentre: boolean
  readonly radiusFt: number
  /** The wall's inside face round the same centre; null on a part with no walls. */
  readonly innerRadiusFt: number | null
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
  /** One thickness dimension per wall kind of each part. */
  readonly thickness: ThicknessMark[]
  /** The sheet's general notes (dimensions to the outside face, the walls, door swings), under the drawing; null when there are none. */
  readonly general: CurveOpeningNote | null
  /** Retaining walls, berms, courts and the limits of the earthworks, with their labels; null when the building has none. */
  readonly earth: EarthPlan | null
  /** The supports' spacing chains, one per distinct row and column of posts; empty when the plan leaves the supports out. */
  readonly supportDims: LabelledDim[]
  /** How many dimensions were left off because their figures would overprint another mark at this scale. */
  readonly omitted: number
  readonly extent: Extent
}

type Opts = Parameters<typeof dimensionLine>[3]

/**
 * Every straight edge, chained through the opening pieces on it, then its
 * length; a curve's chords are located by its arcs instead. An edge that
 * runs the same span of the same side at the same length as one already
 * dimensioned (a deck's edge along a wall's) is not given again.
 */
function edgeDims(b: SheetBuilding, opts: Opts, space: Spacing): DimLine[] {
  const placed: Placed[] = []
  const rows: DimRow[] = []
  const dims: DimLine[] = []
  const at = (level: number) => space.first + space.stagger * level
  for (const part of b.parts) {
    const area = signedArea(part.outline)
    for (const e of part.edges) {
      if (e.curved || e.lengthFt < 1 / 48) continue
      const normal = outwardNormal(area, e.a, e.b)
      const side = sideOf(normal)
      const [lo, hi] = spanAlong(side, e.a, e.b)
      const row: DimRow = { side, lo, hi, value: e.lengthFt }
      const stops = openingStops(e.a, e.b, part.openings)
      if (stops.length) {
        const chain = staggerLevel(placed, side, lo, hi, 0.5)
        placed.push({ side, lo, hi, level: chain })
        stops.slice(1).forEach((t, i) => {
          dims.push(dimensionLine(pointAlong(e.a, e.b, stops[i]), pointAlong(e.a, e.b, t), at(chain), { ...opts, normal }))
        })
      }
      if (rows.some((r) => sameRow(r, row))) continue
      rows.push(row)
      const level = staggerLevel(placed, side, lo, hi, 0.5)
      placed.push({ side, lo, hi, level })
      dims.push(dimensionLine(e.a, e.b, at(level), { ...opts, normal }))
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
function overallDims(b: SheetBuilding, opts: Opts, edge: readonly DimLine[], space: Spacing): LabelledDim[] {
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
  const top = Math.min(reach.miny, minz - space.first) - space.overallGap
  const left = Math.min(reach.minx, minx - space.first) - space.overallGap
  const across = boxes.filter((x) => x.shows('x'))
  const down = boxes.filter((x) => x.shows('z'))
  const dims: LabelledDim[] = []
  across.forEach(({ label, box }, k) => {
    if (box) dims.push({ ...dimensionLine([box.minx, box.minz], [box.maxx, box.minz], box.minz - top + space.stagger * k, { ...opts, normal: [0, -1] }), label })
  })
  down.forEach(({ label, box }, k) => {
    if (box) dims.push({ ...dimensionLine([box.minx, box.maxz], [box.minx, box.minz], box.minx - left + space.stagger * k, { ...opts, normal: [-1, 0] }), label })
  })
  return dims
}

/** Two arcs this close in centre and radius are one line on the plan, feet (a quarter inch). */
const SAME_ARC_FT = 1 / 48

/**
 * A note for every arc, except a deck's or porch's arc that runs along a
 * wall's (the same centre and radius), which the wall's note, giving both
 * faces, already gives.
 */
function arcNotes(b: SheetBuilding): ArcNote[] {
  const { minx, maxx, minz, maxz } = b.bounds
  const wallArcs = b.parts.flatMap((p) => p.arcs.filter((a) => a.innerRadiusFt !== null))
  const onWall = (arc: SheetBuilding['parts'][number]['arcs'][number]) =>
    arc.innerRadiusFt === null && wallArcs.some((w) => Math.hypot(w.centre[0] - arc.centre[0], w.centre[1] - arc.centre[1]) < SAME_ARC_FT && Math.abs(w.radiusFt - arc.radiusFt) < SAME_ARC_FT)
  return b.parts.flatMap((part) =>
    part.arcs.filter((arc) => !onWall(arc)).map((arc): ArcNote => {
      const mid = arcMidpoint(arcPoints(part.edges, arc), arc.centre, arc.radiusFt)
      const [cx, cz] = arc.centre
      const showCentre = cx > minx - FAR_CENTRE_FT && cx < maxx + FAR_CENTRE_FT && cz > minz - FAR_CENTRE_FT && cz < maxz + FAR_CENTRE_FT
      const toward = unitTo(mid, arc.centre)
      const leaderFrom: Pt = showCentre ? arc.centre : [mid[0] + toward[0] * 4, mid[1] + toward[1] * 4]
      return { centre: arc.centre, mid, leaderFrom, showCentre, radiusFt: arc.radiusFt, innerRadiusFt: arc.innerRadiusFt, lengthFt: arc.lengthFt, sweepDeg: arc.sweepDeg }
    }),
  )
}

/** An arc's radius is written this far in from the curve along its leader (or halfway, on a short one), feet, so the leaders of arcs swung from across a shape keep their words apart. */
const ARC_TEXT_IN_FT = 4

/** Where an arc's words are set along its leader, and their turn (upright), degrees. */
export function arcTextAt(arc: ArcNote): { readonly at: Pt; readonly angleDeg: number } {
  const [fx, fy] = arc.leaderFrom
  const [mx, my] = arc.mid
  const t = Math.min(0.5, ARC_TEXT_IN_FT / (Math.hypot(fx - mx, fy - my) || 1))
  return { at: [mx + (fx - mx) * t, my + (fy - my) * t], angleDeg: uprightAngle((Math.atan2(my - fy, mx - fx) * 180) / Math.PI) }
}

/** An arc's note (its radii, length and turn, about three lines set below its leader), turned with it. */
export function arcNoteBox(arc: ArcNote, pen: Pen): Box {
  const { at, angleDeg } = arcTextAt(arc)
  const r = (angleDeg * Math.PI) / 180
  // the lines run from just above the leader to about two and a half lines below it
  const down = pen.text * 0.85
  const centre: Pt = [at[0] - Math.sin(r) * down, at[1] + Math.cos(r) * down]
  return turnedBox(centre, textWidthFt(`R ${formatArch(arc.radiusFt)} outside`, pen.text) / 2, pen.text * 1.7, angleDeg)
}

/** A curved wall's opening note, set from its point to one side. */
export function curveNoteBox(n: CurveOpeningNote, size: number): Box {
  const w = Math.max(...n.lines.map((l) => textWidthFt(l, size)))
  const x0 = n.anchor === 'start' ? n.at[0] : n.at[0] - w
  return { x0, y0: n.at[1] - size, x1: x0 + w, y1: n.at[1] + size * (n.lines.length - 0.5) }
}

/** The circle of every opening's tag, as a box. */
export const openingTagBoxes = (b: SheetBuilding, pen: Pen): Box[] =>
  b.parts.flatMap((p) =>
    p.openings.map((o): Box => {
      const [x, y] = openingTagAt(o, p, pen.text)
      const r = pen.text * 0.85
      return { x0: x - r, y0: y - r, x1: x + r, y1: y + r }
    }),
  )

/** An earthworks label's lines, turned with it. */
function earthLabelBox(l: EarthLabel, pen: Pen): Box {
  const size = l.size === 'text' ? pen.text : pen.small
  return turnedBox(l.at, Math.max(...l.lines.map((t) => textWidthFt(t, size))) / 2, (size * l.lines.length * 1.2) / 2, l.angleDeg)
}

/** The plan's general note when figures were left off. */
export const OMITTED_NOTE = 'Dimensions whose figures would overprint at this scale are left off the plan; print at a larger scale for every dimension.'

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

/** The general notes for a floor's rooms, when the plan draws them. */
function roomNotes(floor: SheetFloor | null): string[] {
  if (!floor?.rooms.length) return []
  const doors = floor.openings.some((o) => o.kind === 'door')
  return [
    "Rooms: name, then size and floor area inside the walls (to the partitions' faces and the walls' inside face).",
    ...(floor.partitions.length ? [`Partitions ${thicknessText(floor.partitions[0].thicknessFt)} thick, from the interior plan.`] : []),
    ...(doors ? ['Interior doors swing as the interior plan sets them (solid).'] : []),
  ]
}

/** Whether anything stands under the building's floor: posts, beams, a mast or stilts. */
export const hasSupports = (b: SheetBuilding): boolean => b.supports.some((s) => s.posts.length || s.mast || s.struts.length || s.beams.length)

/** The general note for the supports, when the plan draws any. */
export const supportNotes = (b: SheetBuilding, shown: boolean): string[] =>
  shown && hasSupports(b)
    ? ['Supports under the floor, in grey: posts, piers and piles at their section, beams dashed, a mast or stilts to their footings.', 'One spacing chain per line of posts, centre to centre from the outside face; sizes in the Supports table.']
    : []

/** The marks a dimension's figure must not land on: the datum's label, the openings' tags, the arcs' and curved openings' notes and the earthworks' labels. */
function fixedMarks(b: SheetBuilding, pen: Pen, arcs: readonly ArcNote[], notes: readonly CurveOpeningNote[], earth: EarthPlan | null): Box[] {
  return [
    datumLabelBox(b.datum, pen.text, pen.small),
    ...openingTagBoxes(b, pen),
    ...arcs.map((a) => arcNoteBox(a, pen)),
    ...notes.map((n) => curveNoteBox(n, pen.small)),
    ...(earth?.labels ?? []).map((l) => earthLabelBox(l, pen)),
  ]
}

/** Where every dimension, arc note and the drawing's edges go; with a floor, the notes for its rooms too; with supports, their spacing. */
export function planLayout(b: SheetBuilding, scale: Scale, floor: SheetFloor | null = null, supports = false): PlanLayout {
  const pen = penSizes(scale)
  const opts = { gapFt: pen.gap, overshootFt: pen.overshoot, tickFt: pen.tick, textOffsetFt: pen.text * 0.75 }
  const space = dimSpacing(pen)
  const edge = edgeDims(b, opts, space)
  const arcs = arcNotes(b)
  const notes = curveOpeningNotes(b)
  const earth = earthPlan(b, pen)
  const every: LabelledDim[] = [...edge, ...overallDims(b, opts, edge, space)]
  const dims = clearFigures(every, pen.text, fixedMarks(b, pen, arcs, notes, earth))
  const omitted = every.length - dims.length
  const posts = supports ? supportDims(b, opts, pen) : []
  const { minx, maxx, minz, maxz } = b.bounds
  const all = dimBounds([...dims, ...posts])
  const reach = supports ? supportExtentPoints(b) : []
  const noteXs = notes.flatMap((n) => noteSpanX(n, pen.small))
  const noteYs = notes.flatMap((n) => noteSpanY(n, pen.small))
  const earthXs = earth?.points.map((p) => p[0]) ?? []
  const earthYs = earth?.points.map((p) => p[1]) ?? []
  const xs = [minx, maxx, all?.minx ?? minx, all?.maxx ?? maxx, ...arcs.flatMap((a) => [a.leaderFrom[0], a.mid[0]]), ...noteXs, ...earthXs, ...reach.map((p) => p[0])]
  const ys = [minz, maxz, all?.miny ?? minz, all?.maxy ?? maxz, ...arcs.flatMap((a) => [a.leaderFrom[1], a.mid[1]]), ...noteYs, ...earthYs, ...reach.map((p) => p[1])]
  // the general notes go under everything else, from its left edge
  const lines = [...wallNotes(b), ...(omitted ? [OMITTED_NOTE] : []), ...roomNotes(floor), ...supportNotes(b, supports), ...earthNotes(b)]
  const general: CurveOpeningNote | null = lines.length ? { at: [Math.min(...xs), Math.max(...ys) + pen.text * NOTES_GAP_TEXT], anchor: 'start', lines } : null
  const spanXs = general ? [...xs, ...noteSpanX(general, pen.small)] : xs
  const spanYs = general ? [...ys, ...noteSpanY(general, pen.small)] : ys
  const x0 = Math.floor(Math.min(...spanXs) - MARGIN_FT)
  const y0 = Math.floor(Math.min(...spanYs) - MARGIN_FT)
  const extent = { x: x0, y: y0, w: Math.ceil(Math.max(...spanXs) + MARGIN_FT) - x0, h: Math.ceil(Math.max(...spanYs) + MARGIN_FT) - y0 }
  return { dims, arcs, notes, thickness: b.parts.flatMap(thicknessMarks), general, earth, supportDims: posts, omitted, extent }
}

/** The plan's drawing with its dimensions, which the section cuts run across: their bubbles sit just outside it. */
export function planBox(b: SheetBuilding, layout: Pick<PlanLayout, 'dims'>): SheetBounds {
  const d = dimBounds(layout.dims)
  if (!d) return b.bounds
  return { minx: Math.min(d.minx, b.bounds.minx), maxx: Math.max(d.maxx, b.bounds.maxx), minz: Math.min(d.miny, b.bounds.minz), maxz: Math.max(d.maxy, b.bounds.maxz) }
}

/**
 * The layout with its general notes moved down `byFt`: the room a section
 * cut's bubble takes below the dimensions, so the notes start under the
 * lowest cut mark. The page already holds that much more on every side
 * (`padExtent`), so the drawing's size does not change.
 */
export const notesBelowCuts = (layout: PlanLayout, byFt: number): PlanLayout =>
  layout.general ? { ...layout, general: { ...layout.general, at: [layout.general.at[0], layout.general.at[1] + byFt] } } : layout

/** A note's reach across and down the drawing, at its text size. */
function noteSpanX(n: CurveOpeningNote, size: number): number[] {
  const w = Math.max(...n.lines.map((l) => textWidthFt(l, size)))
  return n.anchor === 'start' ? [n.at[0], n.at[0] + w] : [n.at[0] - w, n.at[0]]
}
const noteSpanY = (n: CurveOpeningNote, size: number): number[] => [n.at[1] - size, n.at[1] + size * (n.lines.length + 0.5)]

export function unitTo(from: Pt, to: Pt): Pt {
  const l = Math.hypot(to[0] - from[0], to[1] - from[1]) || 1
  return [(to[0] - from[0]) / l, (to[1] - from[1]) / l]
}

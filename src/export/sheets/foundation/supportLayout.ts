/**
 * Where a plan's support spacing dimensions go, building-frame feet. The
 * posts of each support are read in rows along its own axes; each distinct
 * row (and column) gets one chain, from the outline's face through every
 * post to the far face, so a regular grid takes two chains, not one per
 * post. Rows of different parts on (or nearly on) one line share a chain.
 * Every gap and figure is sized on paper, so at any scale a figure is only
 * written on clear paper: between its ticks when it fits, past the chain's
 * end or a line further out when it does not, and left to its ticks when
 * there is nowhere clear. Pure, so it is checked in node.
 */
import { formatArch } from '../format'
import { supportPoints } from './supports'
import type { SheetBounds, SheetBuilding, SheetSupport } from '../types'
import type { LabelledDim, Pen } from '../plan/planLayout'
import { dimensionLine, textWidthFt, type DimLine, type DimOpts, type Pt, type Segment } from '../svgDims'
import { boxCorners, boxesOverlap, grown, wordsBox, type Box } from './textBoxes'

/** Posts this close across a row's line are on one row, feet (3 in). */
const ROW_FT = 0.25
/** Two chains whose stops all agree within this are the same chain, feet (a quarter inch). */
const SAME_FT = 1 / 48
/** Rows of different parts this close across, in figure heights, share one chain: their figures could not be told apart. */
const NEAR_ROWS = 1.2
/** Two rows run the same way when their directions agree this closely (half a degree). */
const PARALLEL_COS = Math.cos(Math.PI / 360)
/** A chain's line clears the post symbols by this many figure heights; each further level is LEVEL_STEP more. */
const CHAIN_CLEAR = 1.2
const LEVEL_STEP = 3
/** The middle of a figure is this many figure heights beyond its chain's line. */
const TEXT_OUT = 0.75
/** A figure that cannot sit between its ticks is tried this many figure heights further out, then twice that. */
const SHORT_TEXT_OUT = 1.3
/** Clear paper kept round a figure, in figure heights. */
const WORD_PAD = 0.12
/** A figure past the end of its chain starts this many figure heights beyond the last tick. */
const END_GAP = 0.6
/** The plan's margin round the building (planLayout's MARGIN_FT): figures stay inside it, so they never widen the drawing. */
const MARGIN_FT = 1.5
/** The datum mark's arrows (planMarks' DATUM_ARROW_FT), feet. */
const DATUM_ARROW_FT = 2.5
/** What a placing costs: a spacing left unwritten, a line through other words or along another chain, a level out, the far side. */
const COST = { wordless: 10, led: 3, crossing: 4, level: 2, flipped: 1 }
/** A figure with no clear place beside its piece is tried on a leader this many lines out, nearest first. */
const LED_LINES = [2, 3, 4, 5, 6, 7]
/** Where along a piece's line a leader may start, as a fraction of it, best first. */
const LEADER_FROM = [0.5, 0.25, 0.75]

/**
 * One piece of a spacing chain. Its figure stands beside it; or, when there is no clear paper there, off on a
 * `leader` from the middle of its line; or, when there is none near either, it is `wordless`: ticks alone.
 */
export type SpacingDim = LabelledDim & { readonly leader?: Segment; readonly wordless?: boolean }

/** The size spacing figures are written at, drawing feet. */
export const spacingSize = (pen: Pen): number => pen.small
export const spacingWords = (d: DimLine): string => formatArch(d.text.value)
/** The paper a written spacing figure covers. */
export const spacingBox = (d: DimLine, pen: Pen): Box => wordsBox([d.text.x, d.text.y], d.text.angleDeg, spacingWords(d), spacingSize(pen))

type Frame = { readonly u: Pt; readonly v: Pt }

const dot = (p: Pt, d: Pt) => p[0] * d[0] + p[1] * d[1]
const frameOf = (axisDeg: number): Frame => {
  const a = (axisDeg * Math.PI) / 180
  return { u: [Math.cos(a), Math.sin(a)], v: [-Math.sin(a), Math.cos(a)] }
}
const fromFrame = (f: Frame, u: number, v: number): Pt => [f.u[0] * u + f.v[0] * v, f.u[1] * u + f.v[1] * v]

/** Where the line v = const (in the frame) crosses the outline, as u along it, sorted. */
function crossings(outline: readonly Pt[], f: Frame, v: number): number[] {
  const us: number[] = []
  outline.forEach((a, i) => {
    const b = outline[(i + 1) % outline.length]
    const va = dot(a, f.v)
    const vb = dot(b, f.v)
    if ((va > v) === (vb > v)) return
    const t = (v - va) / (vb - va)
    us.push(dot(a, f.u) + (dot(b, f.u) - dot(a, f.u)) * t)
  })
  return us.sort((p, q) => p - q)
}

/** Points grouped into rows across `f.v`, each row's u values sorted, rows in order of v. */
function rowsOf(points: readonly Pt[], f: Frame): { readonly v: number; readonly us: number[] }[] {
  const sorted = [...points].sort((p, q) => dot(p, f.v) - dot(q, f.v))
  const rows: { v: number; us: number[] }[] = []
  for (const p of sorted) {
    const v = dot(p, f.v)
    const last = rows[rows.length - 1]
    if (last && v - last.v <= ROW_FT) last.us.push(dot(p, f.u))
    else rows.push({ v, us: [dot(p, f.u)] })
  }
  return rows.map((r) => ({ v: r.v, us: r.us.sort((p, q) => p - q) }))
}

/** One row of posts along a frame's u: the outline's face before the first post, the posts, the face after the last; `sign` is the side of the row (along f.v) its chain is first tried on. */
interface Row {
  readonly f: Frame
  readonly v: number
  readonly before: number | null
  readonly posts: readonly number[]
  readonly after: number | null
  readonly sign: number
}

const stopsOf = (r: Row): number[] => [...(r.before === null ? [] : [r.before]), ...r.posts, ...(r.after === null ? [] : [r.after])]
const sameStops = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((u, i) => Math.abs(u - b[i]) <= SAME_FT)

/** The outline's faces either side of a row's posts. */
function rowFaces(outline: readonly Pt[], f: Frame, v: number, us: readonly number[]): Pick<Row, 'before' | 'after'> {
  const faces = crossings(outline, f, v)
  return { before: faces.filter((u) => u < us[0] - SAME_FT).pop() ?? null, after: faces.find((u) => u > us[us.length - 1] + SAME_FT) ?? null }
}

/** One row per distinct row of points along f.u, its chain to go beside it toward the rest of the grid. */
function supportRows(points: readonly Pt[], outline: readonly Pt[], f: Frame, minPoints: number): Row[] {
  const rows = rowsOf(points, f)
  return rows.reduce<Row[]>((kept, row, k) => {
    if (row.us.length < minPoints) return kept
    // into the grid: toward the next row, or back toward the last on the far row
    const sign = k < rows.length - 1 || rows.length === 1 ? 1 : -1
    const next: Row = { f, v: row.v, ...rowFaces(outline, f, row.v, row.us), posts: row.us, sign }
    const stops = stopsOf(next)
    return stops.length < 2 || kept.some((r) => sameStops(stopsOf(r), stops)) ? kept : [...kept, next]
  }, [])
}

/** A row read in another row's frame; null when they do not run the same way. */
function alignedTo(target: Row, r: Row): Row | null {
  const c = dot(r.f.u, target.f.u)
  if (Math.abs(c) < PARALLEL_COS) return null
  if (c > 0) return { ...r, f: target.f }
  const flip = (u: number | null) => (u === null ? null : -u)
  return { f: target.f, v: -r.v, before: flip(r.after), posts: r.posts.map((u) => -u).reverse(), after: flip(r.before), sign: -r.sign }
}

/** Whether two rows in one frame lie within `tol` across and meet (or pass) along. */
function meets(a: Row, b: Row, tol: number): boolean {
  const [sa, sb] = [stopsOf(a), stopsOf(b)]
  return Math.abs(a.v - b.v) <= tol && sb[0] <= sa[sa.length - 1] + tol && sa[0] <= sb[sb.length - 1] + tol
}

/** Two rows on one line as one: every post, between the outermost faces. */
function joined(a: Row, b: Row): Row {
  const posts = [...a.posts, ...b.posts].sort((p, q) => p - q).filter((u, i, all) => i === 0 || u - all[i - 1] > SAME_FT)
  const faces = (xs: readonly (number | null)[]) => xs.filter((u): u is number => u !== null)
  const before = Math.min(...faces([a.before, b.before]))
  const after = Math.max(...faces([a.after, b.after]))
  return { ...a, posts, before: before < posts[0] - SAME_FT ? before : null, after: after > posts[posts.length - 1] + SAME_FT ? after : null }
}

/** Rows that run the same way within `tol` of one line, merged into the first of them. */
function mergeRows(rows: readonly Row[], tol: number): Row[] {
  return rows.reduce<Row[]>((kept, r) => {
    const i = kept.findIndex((k) => {
      const same = alignedTo(k, r)
      return same !== null && meets(k, same, tol)
    })
    if (i < 0) return [...kept, r]
    return kept.map((k, j) => (j === i ? joined(k, alignedTo(k, r) as Row) : k))
  }, [])
}

const lengthOf = (r: Row) => {
  const stops = stopsOf(r)
  return stops[stops.length - 1] - stops[0]
}
/** The longest chains first (a tie keeps its order), so a short one gives way to a long one, not the other way. */
const longestFirst = (rows: readonly Row[]): Row[] => [...rows].sort((a, b) => lengthOf(b) - lengthOf(a))

/** What the figures must stay clear of and inside. */
interface Sheet {
  readonly opts: DimOpts
  readonly size: number
  /** Half the widest post symbol: a chain's line starts clear of it. */
  readonly clear: number
  /** Post symbols and the datum mark: no figure may touch them. */
  readonly obstacles: readonly Box[]
  /** The parts' outlines: a figure lies along one only when it has nowhere else to go. */
  readonly outlines: readonly Box[]
  readonly region: SheetBounds
}

/** What is already on the sheet: the figures, each chain's line, and the band from each row out to its line that its ticks and extension lines cross. */
interface Placed {
  readonly words: readonly Box[]
  readonly lines: readonly Box[]
  readonly bands: readonly Box[]
}

interface Placing {
  readonly dims: readonly SpacingDim[]
  readonly words: readonly Box[]
  readonly line: Box
  readonly band: Box
  readonly cost: number
}

const midOf = (s: Segment): Pt => [(s.a[0] + s.b[0]) / 2, (s.a[1] + s.b[1]) / 2]
const unitAlong = (d: DimLine): Pt => [(d.line.b[0] - d.line.a[0]) / d.text.value, (d.line.b[1] - d.line.a[1]) / d.text.value]
const inside = (b: Box, r: SheetBounds) => boxCorners(b).every(([x, y]) => x >= r.minx - MARGIN_FT && x <= r.maxx + MARGIN_FT && y >= r.minz - MARGIN_FT && y <= r.maxz + MARGIN_FT)
const hits = (b: Box, others: readonly Box[]) => others.some((o) => boxesOverlap(b, o))
const runsAlong = (a: Box, b: Box) => Math.abs(dot(a.along, b.along)) > PARALLEL_COS

/** A chain's pieces on one side of its row (`sign` along f.v) at a level out, figures in their usual place. */
function chainPieces(row: Row, sign: number, level: number, sheet: Sheet): DimLine[] {
  const normal: Pt = [row.f.v[0] * sign, row.f.v[1] * sign]
  const offset = sheet.clear + sheet.size * (CHAIN_CLEAR + LEVEL_STEP * level)
  const stops = stopsOf(row)
  return stops.slice(1).map((u, i) => dimensionLine(fromFrame(row.f, stops[i], row.v), fromFrame(row.f, u, row.v), offset, { ...sheet.opts, textOffsetFt: sheet.size * TEXT_OUT, normal }))
}

/** A thin box along the segment a→b, `half` either side of it. */
function strip(a: Pt, b: Pt, half: number): Box {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1
  return { c: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], along: [(b[0] - a[0]) / len, (b[1] - a[1]) / len], halfAlong: len / 2, halfAcross: half }
}

/** Where a piece's figure goes with no leader, best first: between its ticks when it fits, past the chain's end, a line further out, then past the end a line out. */
function nearSpots(d: DimLine, end: -1 | 0 | 1, normal: Pt, size: number): Pt[] {
  const at: Pt = [d.text.x, d.text.y]
  const out: Pt = [at[0] + normal[0] * size * SHORT_TEXT_OUT, at[1] + normal[1] * size * SHORT_TEXT_OUT]
  const reach = (d.text.value + textWidthFt(spacingWords(d), size)) / 2 + size * END_GAP
  const dir = unitAlong(d)
  const past = (from: Pt): Pt[] => (end === 0 ? [] : [[from[0] + dir[0] * reach * end, from[1] + dir[1] * reach * end]])
  const fits = d.text.value >= textWidthFt(spacingWords(d), size) + size * WORD_PAD * 2
  return [...(fits ? [at] : []), ...past(at), out, ...past(out)]
}

/** Where a figure may stand off its piece on a leader, nearest first: lines out beyond its usual place, over the piece then a figure's width to either side, then the same on the row's side of the chain. */
function ledSpots(d: DimLine, normal: Pt, size: number): Pt[] {
  const mid = midOf(d.line)
  const dir = unitAlong(d)
  const band = Math.hypot(d.ext1.b[0] - d.ext1.a[0], d.ext1.b[1] - d.ext1.a[1])
  const step = textWidthFt(spacingWords(d), size) / 2 + size
  const spot = (out: number, shift: number): Pt => [mid[0] + normal[0] * out + dir[0] * step * shift, mid[1] + normal[1] * out + dir[1] * step * shift]
  return LED_LINES.flatMap((k) => {
    const far = size * (TEXT_OUT + SHORT_TEXT_OUT * k)
    return [far, -(band + far)].flatMap((out) => [0, 1, -1, 2, -2].map((shift) => spot(out, shift)))
  })
}

/** Leaders from a piece's line (its middle, then a quarter in from either tick) to the nearest side of its figure. */
function leadersTo(d: DimLine, box: Box): Segment[] {
  const [p, q, r, t] = boxCorners(box)
  const sides = [midOf({ a: p, b: q }), midOf({ a: q, b: r }), midOf({ a: r, b: t }), midOf({ a: t, b: p })]
  return LEADER_FROM.map((k): Segment => {
    const from: Pt = [d.line.a[0] + (d.line.b[0] - d.line.a[0]) * k, d.line.a[1] + (d.line.b[1] - d.line.a[1]) * k]
    const far = (x: Pt) => Math.hypot(x[0] - from[0], x[1] - from[1])
    return { a: from, b: sides.reduce((best, x) => (far(x) < far(best) ? x : best)) }
  })
}

/** What a figure is placed among: `solid` (symbols, the datum, other figures and leaders) it never touches; it never lies along a chain's line; on a leader it keeps off the outlines too. */
interface Among {
  readonly solid: readonly Box[]
  readonly chains: readonly Box[]
  readonly outlines: readonly Box[]
}

interface PlacedPiece {
  readonly dim: SpacingDim
  /** The paper the figure and its leader take; empty when it is wordless. */
  readonly boxes: readonly Box[]
}

/** One piece with its figure at the first clear spot beside it, else the first clear spot off on a leader, else wordless. */
function placePiece(d: DimLine, end: -1 | 0 | 1, normal: Pt, sheet: Sheet, among: Among): PlacedPiece {
  const boxAt = (at: Pt) => wordsBox(at, d.text.angleDeg, spacingWords(d), sheet.size, sheet.size * WORD_PAD)
  const struck = (box: Box, lines: readonly Box[]) => lines.some((l) => runsAlong(box, l) && boxesOverlap(box, l))
  const clear = (at: Pt) => inside(boxAt(at), sheet.region) && !hits(boxAt(at), among.solid) && !struck(boxAt(at), among.chains)
  const written = (at: Pt): SpacingDim => ({ ...d, text: { ...d.text, x: at[0], y: at[1] } })
  const near = nearSpots(d, end, normal, sheet.size).find(clear)
  if (near) return { dim: written(near), boxes: [boxAt(near)] }
  const room = (l: Segment) => strip(l.a, l.b, sheet.size * WORD_PAD)
  const leaderAt = (at: Pt) => leadersTo(d, boxAt(at)).find((l) => !hits(room(l), among.solid))
  const led = ledSpots(d, normal, sheet.size).find((at) => clear(at) && !struck(boxAt(at), among.outlines) && leaderAt(at) !== undefined)
  const leader = led && leaderAt(led)
  if (led && leader) return { dim: { ...written(led), leader }, boxes: [boxAt(led), room(leader)] }
  return { dim: { ...d, wordless: true }, boxes: [] }
}

/** The room a chain's own line takes, a hair either side of it. */
const chainLine = (pieces: readonly DimLine[], size: number): Box => strip(pieces[0].line.a, pieces[pieces.length - 1].line.b, size * WORD_PAD)

/** The band a chain's extension lines and ticks cross, from its row to the far end of its extension lines. */
function chainBand(pieces: readonly DimLine[]): Box {
  const [first, last] = [pieces[0].ext1, pieces[pieces.length - 1].ext2]
  return strip(midOf(first), midOf(last), Math.hypot(first.b[0] - first.a[0], first.b[1] - first.a[1]) / 2)
}

/** A chain placed on one side at one level: each figure where it is clear of the sheet so far and of the chain's own. */
function placeChain(row: Row, sign: number, level: number, sheet: Sheet, placed: Placed): Placing {
  const pieces = chainPieces(row, sign, level, sheet)
  const normal: Pt = [row.f.v[0] * sign, row.f.v[1] * sign]
  const line = chainLine(pieces, sheet.size)
  const band = chainBand(pieces)
  const solid = [...sheet.obstacles, ...placed.words]
  const done = pieces.reduce<{ readonly dims: SpacingDim[]; readonly words: Box[] }>(
    (acc, d, i) => {
      const end = pieces.length === 1 || i === pieces.length - 1 ? 1 : i === 0 ? -1 : 0
      const { dim, boxes } = placePiece(d, end, normal, sheet, { solid: [...solid, ...acc.words], chains: placed.lines, outlines: sheet.outlines })
      return { dims: [...acc.dims, dim], words: [...acc.words, ...boxes] }
    },
    { dims: [], words: [] },
  )
  const crossings = placed.words.filter((w) => boxesOverlap(band, w)).length + placed.lines.filter((l) => runsAlong(line, l) && boxesOverlap(grown(line, sheet.size / 2), l)).length
  const count = (is: (d: SpacingDim) => boolean) => done.dims.filter(is).length
  const cost = count((d) => !!d.wordless) * COST.wordless + count((d) => !!d.leader) * COST.led + crossings * COST.crossing + level * COST.level + (sign === row.sign ? 0 : COST.flipped)
  return { ...done, line, band, cost }
}

/** The cheapest of a chain's placings: its own side then the far side, at the row then a level out. */
function bestPlacing(row: Row, sheet: Sheet, placed: Placed): Placing {
  const tries = [0, 1].flatMap((level) => [row.sign, -row.sign].map((sign) => placeChain(row, sign, level, sheet, placed)))
  return tries.reduce((best, t) => (t.cost < best.cost ? t : best))
}

/** The points a support's spacing is dimensioned between: its posts, or its mast (located on its own). */
function locatedPoints(s: SheetSupport): { readonly points: Pt[]; readonly min: number } {
  if (s.posts.length) return { points: s.posts.map((p) => p.at), min: 2 }
  if (s.mast) return { points: [s.mast.at], min: 1 }
  return { points: [], min: 1 }
}

/** Every row and column of posts of one support, in its own frame. */
function rowsOfSupport(b: SheetBuilding, s: SheetSupport): Row[] {
  const part = b.parts.find((p) => p.massIndex === s.massIndex)
  const { points, min } = locatedPoints(s)
  if (!part || !points.length) return []
  const f = frameOf(s.axisDeg)
  const turned: Frame = { u: f.v, v: [-f.u[0], -f.u[1]] }
  return [...supportRows(points, part.outline, f, min), ...supportRows(points, part.outline, turned, min)]
}

/** A support's symbols in plan as boxes: every post at its section, a mast at its foot. */
function symbolBoxes(s: SheetSupport): Box[] {
  const half = (s.section?.sizeFt ?? 0) / 2
  const a = (s.axisDeg * Math.PI) / 180
  const posts = half > 0 ? s.posts.map((p): Box => ({ c: p.at, along: [Math.cos(a), Math.sin(a)], halfAlong: half, halfAcross: half })) : []
  const mast: Box[] = s.mast ? [{ c: s.mast.at, along: [1, 0], halfAlong: s.mast.footDiameterFt / 2, halfAcross: s.mast.footDiameterFt / 2 }] : []
  return [...posts, ...mast]
}

/** The datum mark as DatumMark draws it: its circle, its x and z arrows with their letters, and its label up and to the left. */
function datumBoxes([x, z]: Pt, pen: Pen): Box[] {
  const r = pen.text * 0.7
  const arrow = (DATUM_ARROW_FT + pen.small * 1.2) / 2
  const label = wordsBox([0, 0], 0, 'DATUM 0,0', pen.small)
  return [
    { c: [x, z], along: [1, 0], halfAlong: r * 1.4, halfAcross: r * 1.4 },
    { c: [x + arrow, z], along: [1, 0], halfAlong: arrow, halfAcross: pen.small / 2 },
    { c: [x, z + arrow], along: [0, 1], halfAlong: arrow, halfAcross: pen.small / 2 },
    { ...label, c: [x - r * 1.6 - label.halfAlong, z - r * 1.6 - pen.small * 0.35] },
  ]
}

/** What a spacing figure must not sit on: every post and mast symbol, and the datum mark. */
export const spacingObstacles = (b: SheetBuilding, pen: Pen): Box[] => [...b.supports.flatMap(symbolBoxes), ...datumBoxes(b.datum, pen)]

/**
 * Spacing chains for the building's supports whose parts are on this plan, each chain its pieces in order: rows along each
 * support's own x, then its columns; rows of different parts near one line merged; each chain where its figures are clearest.
 */
export function supportChains(b: SheetBuilding, opts: DimOpts, pen: Pen): SpacingDim[][] {
  const size = spacingSize(pen)
  const obstacles = spacingObstacles(b, pen)
  const clear = Math.max(0, ...b.supports.flatMap(symbolBoxes).map((x) => x.halfAcross))
  const outlines = b.parts.flatMap((p) => p.outline.map((a, i) => strip(a, p.outline[(i + 1) % p.outline.length], pen.medium)))
  const sheet: Sheet = { opts, size, clear, obstacles, outlines, region: b.bounds }
  const rows = mergeRows(b.supports.flatMap((s) => rowsOfSupport(b, s)), size * NEAR_ROWS)
  return longestFirst(rows).reduce<{ readonly chains: SpacingDim[][]; readonly placed: Placed }>(
    (acc, row) => {
      const best = bestPlacing(row, sheet, acc.placed)
      const placed: Placed = { words: [...acc.placed.words, ...best.words], lines: [...acc.placed.lines, best.line], bands: [...acc.placed.bands, best.band] }
      return { chains: [...acc.chains, [...best.dims]], placed }
    },
    { chains: [], placed: { words: [], lines: [], bands: [] } },
  ).chains
}

export const supportDims = (b: SheetBuilding, opts: DimOpts, pen: Pen): SpacingDim[] => supportChains(b, opts, pen).flat()

const OUTLINES_NOTE = 'Outlines are the parts above, to the outside face of the walls, for reference.'
const OUTLINES_SHORT = "Outlines are the parts above, to the walls' outside face."

/** The foundation plan's last note: what the outlines are and, when some figures stand off on leaders or could not be written, how to read those. One line, no longer than the supports' own notes. */
export function spacingNote(dims: readonly SpacingDim[]): string {
  const led = dims.some((d) => d.leader)
  const wordless = dims.some((d) => d.wordless)
  if (led && wordless) return `${OUTLINES_SHORT} A leader ties a figure to its spacing; one ticked only had no room.`
  if (led) return `${OUTLINES_SHORT} A leader ties a figure to its spacing.`
  if (wordless) return `${OUTLINES_SHORT} A spacing ticked only had no room for its figure.`
  return OUTLINES_NOTE
}

/** Every point a building's supports reach on the plan, for its extent. */
export const supportExtentPoints = (b: SheetBuilding): Pt[] => supportPoints(b.supports.filter((s) => b.parts.some((p) => p.massIndex === s.massIndex)))

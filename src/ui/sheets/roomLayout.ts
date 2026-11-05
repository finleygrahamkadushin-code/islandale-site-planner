/**
 * Where a floor plan's room marks go, in building-frame feet: each
 * partition as a band, each room's words (as many as fit inside it). Pure,
 * so it is checked in node.
 */
import { formatArch, formatArea } from '../../export/sheets/format'
import type { SheetBuilding, SheetPartition, SheetRoom } from '../../export/sheets/types'
import { arcTextAt, type ArcNote, type CurveOpeningNote, type Pen, type PlanLayout } from './planLayout'
import { openingTagAt, thicknessText, thicknessTextAt } from './planWalls'
import { insidePolygon, textWidthFt, type DimLine, type Pt } from './svgDims'

/** Line spacing of a room's words, in text heights. */
const LEADING = 1.25
/** A room's words keep this share of its extent across and down the sheet clear of its walls. */
const FILL = 0.9

export interface RoomLine {
  readonly text: string
  readonly size: number
  readonly bold: boolean
}

/** A room's words, top line first, centred on its label point: its name, then its size and area where they fit inside it. */
export function roomLines(room: SheetRoom, pen: Pen): RoomLine[] {
  const name: RoomLine = { text: room.name, size: pen.small, bold: true }
  const size: RoomLine = { text: `${formatArch(room.widthFt)} × ${formatArch(room.depthFt)}`, size: pen.tiny, bold: false }
  const area: RoomLine = { text: formatArea(room.netAreaSqFt), size: pen.tiny, bold: false }
  // the words run across the sheet, so they fit the room's extent on it
  const xs = room.net.map((p) => p[0])
  const zs = room.net.map((p) => p[1])
  const along = (Math.max(...xs) - Math.min(...xs)) * FILL
  const across = (Math.max(...zs) - Math.min(...zs)) * FILL
  const fits = (lines: readonly RoomLine[]) =>
    lines.reduce((h, l) => h + l.size * LEADING, 0) <= across && lines.every((l) => textWidthFt(l.text, l.size) <= along)
  if (!room.net.length) return [name]
  if (fits([name, size, area])) return [name, size, area]
  if (fits([name, area])) return [name, area]
  // a room too small for its name at the room size gets it a size down
  return [fits([name]) ? name : { ...name, size: pen.tiny }]
}

/** An axis-aligned box on the plan, feet. */
export interface Box {
  readonly x0: number
  readonly y0: number
  readonly x1: number
  readonly y1: number
}

const overlaps = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1

/** The box a block of text `halfW` by `halfH` takes centred on a point, turned `angleDeg`. */
function turnedBox(at: Pt, halfW: number, halfH: number, angleDeg: number): Box {
  const r = (angleDeg * Math.PI) / 180
  const ex = Math.abs(Math.cos(r)) * halfW + Math.abs(Math.sin(r)) * halfH
  const ey = Math.abs(Math.sin(r)) * halfW + Math.abs(Math.cos(r)) * halfH
  return { x0: at[0] - ex, y0: at[1] - ey, x1: at[0] + ex, y1: at[1] + ey }
}

/** The box a dimension's figure takes, turned with it. */
export function dimTextBox(d: DimLine, label: string | undefined, size: number): Box {
  const text = label ? `${label} ${formatArch(d.text.value)}` : formatArch(d.text.value)
  return turnedBox([d.text.x, d.text.y], textWidthFt(text, size) / 2, size / 2, d.text.angleDeg)
}

/** An arc's note (its radii, length and turn, about three lines set below its leader), turned with it. */
function arcNoteBox(arc: ArcNote, pen: Pen): Box {
  const { at, angleDeg } = arcTextAt(arc)
  const r = (angleDeg * Math.PI) / 180
  // the lines run from just above the leader to about two and a half lines below it
  const down = pen.text * 0.85
  const centre: Pt = [at[0] - Math.sin(r) * down, at[1] + Math.cos(r) * down]
  return turnedBox(centre, textWidthFt(`R ${formatArch(arc.radiusFt)} outside`, pen.text) / 2, pen.text * 1.7, angleDeg)
}

const around = (at: Pt, halfW: number, halfH: number): Box => ({ x0: at[0] - halfW, y0: at[1] - halfH, x1: at[0] + halfW, y1: at[1] + halfH })

/** A curved wall's opening note, set from its point to one side. */
function curveNoteBox(n: CurveOpeningNote, size: number): Box {
  const w = Math.max(...n.lines.map((l) => textWidthFt(l, size)))
  const x0 = n.anchor === 'start' ? n.at[0] : n.at[0] - w
  return { x0, y0: n.at[1] - size, x1: x0 + w, y1: n.at[1] + size * (n.lines.length - 0.5) }
}

/** Every figure of the plan a room's words could land on inside the walls: the dimensions', arcs' and curved openings' notes, the openings' tags and the walls' thickness notes. */
export function planFigures(b: SheetBuilding, layout: PlanLayout, pen: Pen): Box[] {
  return [
    ...[...layout.dims, ...layout.supportDims].map((d) => dimTextBox(d, d.label, pen.text)),
    ...layout.arcs.map((a) => arcNoteBox(a, pen)),
    ...layout.notes.map((n) => curveNoteBox(n, pen.small)),
    ...b.parts.flatMap((p) => p.openings.map((o) => around(openingTagAt(o, p, pen.text), pen.text * 0.85, pen.text * 0.85))),
    ...layout.thickness.map((m) => around(thicknessTextAt(m, pen.text, pen.overshoot), textWidthFt(`${thicknessText(m.thicknessFt)} glass wall`, pen.small) / 2, pen.small / 2)),
  ]
}

/** The box a room's words take centred on a point. */
function blockBox(at: Pt, lines: readonly RoomLine[]): Box {
  const w = Math.max(...lines.map((l) => textWidthFt(l.text, l.size))) / 2
  const h = lines.reduce((sum, l) => sum + l.size * LEADING, 0) / 2
  return { x0: at[0] - w, y0: at[1] - h, x1: at[0] + w, y1: at[1] + h }
}

/** Candidate spots across a room, on a grid this many to a side, for words moved off a dimension. */
const GRID = 16

/**
 * Where a room's words go: its label point, unless they would sit on one
 * of the plan's figures (a dimension inside the walls), when the nearest
 * spot inside the room clear of them all.
 */
export function placeRoomLabel(room: SheetRoom, lines: readonly RoomLine[], taken: readonly Box[]): Pt {
  const free = (at: Pt) => !taken.some((t) => overlaps(blockBox(at, lines), t))
  if (free(room.label) || !room.net.length) return room.label
  const xs = room.net.map((p) => p[0])
  const zs = room.net.map((p) => p[1])
  const [x0, x1, z0, z1] = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)]
  const within = (at: Pt) => {
    const b = blockBox(at, lines)
    const corners: Pt[] = [[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1]]
    return corners.every((c) => insidePolygon(room.net, c))
  }
  const spots = Array.from({ length: GRID * GRID }, (_, k): Pt => [x0 + ((k % GRID) + 0.5) * ((x1 - x0) / GRID), z0 + (Math.floor(k / GRID) + 0.5) * ((z1 - z0) / GRID)])
  const dist = (p: Pt) => Math.hypot(p[0] - room.label[0], p[1] - room.label[1])
  return spots.filter((p) => within(p) && free(p)).sort((a, b) => dist(a) - dist(b))[0] ?? room.label
}

/** The baseline-centre of each line, so the block is centred on the room's label point. */
export function lineCentres(at: Pt, lines: readonly RoomLine[]): Pt[] {
  const total = lines.reduce((h, l) => h + l.size * LEADING, 0)
  let y = at[1] - total / 2
  return lines.map((l) => {
    const c: Pt = [at[0], y + (l.size * LEADING) / 2]
    y += l.size * LEADING
    return c
  })
}

/**
 * A partition's band: from a run `endA` past its a end (negative stops
 * short) to `endB` past its b end, `inset` in from each face.
 */
export function partitionBand(p: SheetPartition, endA: number, endB: number, inset: number): Pt[] {
  const L = Math.hypot(p.b[0] - p.a[0], p.b[1] - p.a[1]) || 1
  const u: Pt = [(p.b[0] - p.a[0]) / L, (p.b[1] - p.a[1]) / L]
  const n: Pt = [-u[1], u[0]]
  const h = p.thicknessFt / 2 - inset
  const a: Pt = [p.a[0] - u[0] * endA, p.a[1] - u[1] * endA]
  const b: Pt = [p.b[0] + u[0] * endB, p.b[1] + u[1] * endB]
  return [
    [a[0] + n[0] * h, a[1] + n[1] * h],
    [b[0] + n[0] * h, b[1] + n[1] * h],
    [b[0] - n[0] * h, b[1] - n[1] * h],
    [a[0] - n[0] * h, a[1] - n[1] * h],
  ]
}

/**
 * Where the site plan goes on paper: the sheet frame (turned to fit, or
 * north up), the drawing's extent, whether the notes fit beside it or take
 * a page of their own, and how many pages it all takes. Also the site
 * plan's pens (line weights and text sizes in drawing feet) and the model
 * turned onto the sheet. Pure.
 */
import type { Extent } from '../Page'
import { pageFeet, smallestPaper, tileDrawing } from '../tiles'
import { PAPERS, MARGIN_IN, TITLE_IN, type PaperId, type SiteScale } from '../types'
import { ptToFt, type Pt } from '../svgDims'
import { drawingExtent, siteFrame, type SiteFrame } from './siteFrame'
import { boxOf } from './siteGeom'
import type { SiteSheetModel } from './siteModel'
import type { SiteNotes } from './siteNotes'
import { LEGEND_LABELS } from './NotesColumn'

/** Room round everything drawn, feet: for the shore's water lines and the labels outside the lot. */
export const PAD_FT = 12
/** The notes column, and the gap before it, inches. */
export const NOTES_IN = 4.1
export const NOTES_GAP_IN = 0.25

/** One page with the notes beside the drawing; the drawing on one page and the notes on the next; or the drawing tiled and the notes after. */
export type SitePageMode = 'beside' | 'notesPage' | 'tiled'

export interface SiteLayout {
  readonly frame: SiteFrame
  readonly extent: Extent
  readonly mode: SitePageMode
  /** Pages the drawing takes (tiles), and in all with the notes. */
  readonly drawingPages: number
  readonly pages: number
  /** The smallest paper that holds the drawing and its notes on one page at this scale, or null. */
  readonly onePagePaper: PaperId | null
}

/** Every point that must be on the sheet: the lot and everything drawn on it. */
export function drawnPoints(m: SiteSheetModel): Pt[] {
  return [
    ...m.ring,
    ...m.buildings.flatMap((b) => [...b.parts.flatMap((p) => p.outline), ...b.roofs.flatMap((r) => r.eave)]),
    ...m.paths.flatMap((p) => p.outline),
    ...m.bridges.flatMap((b) => [...b.left, ...b.right]),
    ...m.things.flatMap((t) => t.outline),
    ...m.trees.flatMap((t) => t.canopy),
  ]
}

/** Whether a drawing of `w` × `h` feet and the notes column fit side by side on one page. */
const fitsBeside = (e: Extent, paper: PaperId, scale: SiteScale) => {
  const p = PAPERS[paper]
  const drawW = p.w - 2 * MARGIN_IN
  const drawH = p.h - 2 * MARGIN_IN - TITLE_IN
  return e.w * scale + NOTES_GAP_IN + NOTES_IN <= drawW + 1e-9 && e.h * scale <= drawH + 1e-9
}

export function siteLayout(m: SiteSheetModel, paper: PaperId, scale: SiteScale, northUp: boolean): SiteLayout {
  const frame = siteFrame(m.ring, northUp)
  const extent = drawingExtent(drawnPoints(m), frame, PAD_FT)
  const tiles = tileDrawing(extent.w, extent.h, paper, scale)
  const mode: SitePageMode = fitsBeside(extent, paper, scale) ? 'beside' : tiles.length === 1 ? 'notesPage' : 'tiled'
  const papers = (Object.keys(PAPERS) as PaperId[]).sort((a, b) => PAPERS[a].w * PAPERS[a].h - PAPERS[b].w * PAPERS[b].h)
  return {
    frame,
    extent,
    mode,
    drawingPages: tiles.length,
    pages: mode === 'beside' ? 1 : tiles.length + 1,
    onePagePaper: papers.find((id) => fitsBeside(extent, id, scale)) ?? null,
  }
}

// --- will the notes column fit beside the drawing? ---------------------------------

/** The notes column's type, as NotesColumn sets it: line heights and an average character's width, inches. */
const NOTE_LINE_IN = (6.3 * 1.2) / 72
const SMALL_LINE_IN = (5.6 * 1.2) / 72
const NOTE_CHAR_IN = (6.3 * 0.5) / 72
const SMALL_CHAR_IN = (5.6 * 0.5) / 72
/** A block's caption with its rule and gaps, the legend's rows, the gap between blocks, inches. */
const CAPTION_IN = 0.2
/** The legend: two columns of rows 0.165 in tall, however many rows it has. */
const LEGEND_IN = Math.ceil(LEGEND_LABELS.length / 2) * 0.165
const BLOCK_GAP_IN = 0.06
/** Room kept for the estimate being short: text wraps a little worse than an average character says. */
const NOTES_SAFETY = 1.12

const linesFor = (chars: number, widthIn: number, charIn: number) => Math.max(1, Math.ceil((chars * charIn) / Math.max(0.5, widthIn)))

/** The names a code row prints after its text: only those the text doesn't already say (as NotesColumn prints them). */
const extraNames = (r: SiteNotes['code']['rows'][number]): string => {
  const extra = r.names.filter((n) => !r.text.includes(n))
  return extra.length ? ` (${extra.join(', ')})` : ''
}

/**
 * About how tall the notes column runs at a width, inches: each block's
 * caption, rows wrapped at the width their column leaves, small print, the
 * code check, the legend and the closing note, with a margin for wrapping.
 */
export function notesHeightIn(notes: SiteNotes, widthIn: number): number {
  let h = 0
  for (const b of notes.blocks) {
    const labelIn = Math.min(1.6, Math.max(...b.rows.map((r) => r.label.length), 1) * NOTE_CHAR_IN + 0.06)
    h += CAPTION_IN + BLOCK_GAP_IN
    for (const r of b.rows) h += linesFor(r.value.length + 2, widthIn - labelIn, NOTE_CHAR_IN) * NOTE_LINE_IN
    for (const n of b.notes) h += linesFor(n.length, widthIn, SMALL_CHAR_IN) * SMALL_LINE_IN
  }
  h += CAPTION_IN + BLOCK_GAP_IN
  if (notes.code.rulesOff) h += 2 * NOTE_LINE_IN + 0.08
  for (const r of notes.code.rows) h += linesFor(r.label.length + r.text.length + extraNames(r).length + 6, widthIn - 0.35, NOTE_CHAR_IN) * NOTE_LINE_IN
  for (const n of notes.code.notes) h += linesFor(n.length, widthIn, SMALL_CHAR_IN) * SMALL_LINE_IN
  h += CAPTION_IN + LEGEND_IN + BLOCK_GAP_IN + 3 * SMALL_LINE_IN
  return h * NOTES_SAFETY
}

/** The estimate's answer for a paper not drawn. */
export const notesFit = (notes: SiteNotes, paper: PaperId) => notesHeightIn(notes, NOTES_IN) <= PAPERS[paper].h - 2 * MARGIN_IN - TITLE_IN

/**
 * The layout once the notes are known. Whether the column fits beside the
 * drawing on this paper is measured on the page as drawn (`tooTall`, from
 * SiteSheet): a column that runs past the drawing area moves to a page of
 * its own. The one-page paper suggestion, for papers not drawn, uses the
 * estimate (a little generous, so it never suggests a paper that won't do).
 */
export function fitNotes(l: SiteLayout, notes: SiteNotes, scale: SiteScale, tooTall: boolean): SiteLayout {
  const papers = (Object.keys(PAPERS) as PaperId[]).sort((a, b) => PAPERS[a].w * PAPERS[a].h - PAPERS[b].w * PAPERS[b].h)
  const onePagePaper = papers.find((id) => fitsBeside(l.extent, id, scale) && notesFit(notes, id)) ?? null
  if (l.mode !== 'beside' || !tooTall) return { ...l, onePagePaper }
  return { ...l, mode: 'notesPage', pages: 2, onePagePaper }
}

/** The smallest paper that holds the drawing alone on one page. */
export const drawingOnlyPaper = (l: SiteLayout, scale: SiteScale): PaperId | null => smallestPaper(l.extent.w, l.extent.h, scale)

/** Feet of drawing a page holds at a scale, less the notes column when it sits beside the drawing. */
export function drawingRoom(paper: PaperId, scale: SiteScale, beside: boolean): { readonly w: number; readonly h: number } {
  const page = pageFeet(paper, scale)
  return beside ? { w: page.w - (NOTES_IN + NOTES_GAP_IN) / scale, h: page.h } : page
}

/** The site plan's pens: printed points and inches as drawing feet at the scale. */
export function sitePens(scale: SiteScale) {
  return {
    /** Lot line, eaves. */
    heavy: ptToFt(1.3, scale),
    bold: ptToFt(0.9, scale),
    medium: ptToFt(0.6, scale),
    thin: ptToFt(0.4, scale),
    hair: ptToFt(0.25, scale),
    /** Building names, line labels, small notes, contour figures. */
    name: ptToFt(7, scale),
    label: ptToFt(5.5, scale),
    small: ptToFt(4.8, scale),
    contour: ptToFt(4.6, scale),
    /** Hatch spacing for the shoreline buffer and the side setback, and the sampling step along each hatch line. */
    hatchShore: 0.095 / scale,
    hatchSide: 0.14 / scale,
    hatchStep: 0.02 / scale,
    /** A label's white halo round its letters. */
    halo: ptToFt(2.2, scale),
  }
}

export type SitePens = ReturnType<typeof sitePens>

const turnPts = (f: SiteFrame, pts: readonly Pt[]): Pt[] => pts.map(f.toSheet)
/** A direction turned onto the sheet (the frame's turn and flip, without its offset). */
const turnDir = (f: SiteFrame, d: Pt): Pt => {
  const o = f.toSheet([0, 0])
  const p = f.toSheet(d)
  return [p[0] - o[0], p[1] - o[1]]
}
const turnPair = (f: SiteFrame, [a, b]: readonly [Pt, Pt]): readonly [Pt, Pt] => [f.toSheet(a), f.toSheet(b)]

/** The model with every point turned onto the sheet, and its band rule read in sheet feet. */
export function turnModel(m: SiteSheetModel, f: SiteFrame): SiteSheetModel {
  const lines = (ls: readonly (readonly Pt[])[]) => ls.map((l) => turnPts(f, l))
  return {
    ...m,
    ring: turnPts(f, m.ring),
    shoreline: turnPts(f, m.shoreline),
    lotLines: m.lotLines.map((l) => ({ ...l, a: f.toSheet(l.a), b: f.toSheet(l.b) })),
    stakes: turnPts(f, m.stakes),
    topOfBank: lines(m.topOfBank),
    buffer: lines(m.buffer),
    sideLine: lines(m.sideLine),
    treeZones: m.treeZones.map((z) => ({ ...z, lines: lines(z.lines) })),
    contours: m.contours.map((c) => ({ ...c, lines: lines(c.lines) })),
    buildings: m.buildings.map((b) => ({
      ...b,
      parts: b.parts.map((p) => ({ ...p, outline: turnPts(f, p.outline), inner: turnPts(f, p.inner), nosings: p.nosings.map((n) => turnPair(f, n)), run: p.run && turnPair(f, p.run) })),
      roofs: b.roofs.map((r) => ({ ...r, eave: turnPts(f, r.eave), lines: r.lines.map((l) => ({ ...l, pts: turnPts(f, l.pts) })), slope: r.slope && turnPair(f, r.slope), ridgeDir: r.ridgeDir && turnDir(f, r.ridgeDir) })),
      walls: b.walls.map((w) => ({ face: turnPts(f, w.face), back: turnPts(f, w.back) })),
      courts: lines(b.courts),
      label: f.toSheet(b.label),
      shadowCasters: b.shadowCasters.map((c) => ({ ...c, poly: turnPts(f, c.poly) })),
    })),
    paths: m.paths.map((p) => ({ ...p, outline: turnPts(f, p.outline), centre: turnPts(f, p.centre), treads: p.treads.map((t) => turnPair(f, t)) })),
    bridges: m.bridges.map((b) => ({ ...b, left: turnPts(f, b.left), right: turnPts(f, b.right), centre: turnPts(f, b.centre), columns: turnPts(f, b.columns), boards: b.boards.map((t) => turnPair(f, t)) })),
    things: m.things.map((t) => ({ ...t, outline: turnPts(f, t.outline), stalls: t.stalls.map((l) => turnPair(f, l)) })),
    trees: m.trees.map((t) => ({ ...t, at: f.toSheet(t.at), canopy: turnPts(f, t.canopy) })),
    clearances: m.clearances.map((c) => ({
      ...c,
      shore: c.shore && { ...c.shore, from: f.toSheet(c.shore.from), to: f.toSheet(c.shore.to) },
      lot: c.lot && { ...c.lot, from: f.toSheet(c.lot.from), to: f.toSheet(c.lot.to) },
    })),
    shadows: lines(m.shadows),
    bounds: boxOf(drawnPoints(m).map(f.toSheet)) ?? m.bounds,
    bandAt: (p) => m.bandAt(f.fromSheet(p)),
  }
}

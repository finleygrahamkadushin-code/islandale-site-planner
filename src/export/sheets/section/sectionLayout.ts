import { formatArch, levelText } from '../format'
import type { Extent } from '../Page'
import { penSizes } from '../plan/planLayout'
import { dimBounds, dimensionLine, spreadApart, textWidthFt, type DimLine } from '../svgDims'
import type { Scale } from '../types'
import type { SectionLevel, SectionView } from './sectionView'

/**
 * Where a section's level marks, dimension chains and note go, in (u, −y)
 * feet, and the drawing's edges: levels at the right with their heights
 * above the main floor and in NAVD88, a height chain at the left, the cut
 * walls' widths below. Pure, so it is checked in node.
 */

/** Level lines run this far past the building, feet. */
const LEVEL_RUN_FT = 1.5
const CHAIN_FT = 2
const OVERALL_FT = 4
const BELOW_FT = 2.5
const ROW_FT = 1.5
const MARGIN_FT = 1.5
/** A rise shorter than this gets no dimension, feet (a quarter inch). */
const MIN_RISE_FT = 1 / 48
/** Below the ground this far the earth hatching stops, feet. */
export const EARTH_DEPTH_FT = 1.5

export const SECTION_NOTE: readonly string[] = ['Heights above the main floor, NAVD88 in brackets.', 'Floor slab (11 3/4″) and roof band (10″) drawn nominal;', 'walls, openings, roofs and ground as the plan builds them.']

export interface SectionLayout {
  readonly dims: DimLine[]
  readonly extent: Extent
  /** The bottom of the earth hatching, y down. */
  readonly base: number
  /** Each level's label height (y down, spread so they do not overprint), in view.levels order. */
  readonly labelYs: number[]
  /** Where the level lines end and their labels start, u. */
  readonly levelEnd: number
  readonly note: { readonly x: number; readonly y: number }
}

/** The levels the left chain measures: every level, the lowest grade first. */
const chainLevels = (levels: readonly SectionLevel[]) => levels.map((l) => l.yFt)

export function sectionLayout(view: SectionView, floorNavdFt: number, scale: Scale): SectionLayout {
  const pen = penSizes(scale)
  const opts = { gapFt: pen.gap, overshootFt: pen.overshoot, tickFt: pen.tick, textOffsetFt: pen.text * 0.75 }
  const groundU = view.grade.map((g) => g[0])
  const uLeft = Math.min(view.uMin, ...groundU)
  const uRight = Math.max(view.uMax, ...groundU)
  const left = uLeft - LEVEL_RUN_FT
  const levelEnd = uRight + LEVEL_RUN_FT
  const ys = chainLevels(view.levels)
  const dims: DimLine[] = []
  let crowded = 0
  for (let i = 1; i < ys.length; i++) {
    const rise = ys[i] - ys[i - 1]
    if (rise < MIN_RISE_FT) continue
    crowded = rise < textWidthFt(formatArch(rise), pen.text) * 1.1 ? crowded + 1 : 0
    dims.push(dimensionLine([left, -ys[i - 1]], [left, -ys[i]], CHAIN_FT, { ...opts, textOffsetFt: opts.textOffsetFt + pen.text * 1.2 * (crowded % 3), normal: [-1, 0] }))
  }
  if (ys.length >= 2) dims.push(dimensionLine([left, -ys[0]], [left, -view.top], CHAIN_FT + OVERALL_FT, { ...opts, normal: [-1, 0] }))

  const base = -view.bottom + EARTH_DEPTH_FT
  const f = view.faces
  for (let i = 1; i < f.length; i++) if (f[i] - f[i - 1] > MIN_RISE_FT) dims.push(dimensionLine([f[i - 1], base], [f[i], base], BELOW_FT, { ...opts, normal: [0, 1] }))
  const rows = f.length > 2 ? 1 : 0
  if (f.length >= 2) dims.push(dimensionLine([f[0], base], [f[f.length - 1], base], BELOW_FT + ROW_FT * rows, { ...opts, normal: [0, 1] }))
  dims.push(dimensionLine([view.uMin, base], [view.uMax, base], BELOW_FT + ROW_FT * (rows + (f.length >= 2 ? 1 : 0)), { ...opts, normal: [0, 1] }))

  const labelYs = spreadApart(ys, pen.small * 1.25)
  const labelW = Math.max(0, ...view.levels.map((l) => textWidthFt(levelText(l.label, l.yFt, floorNavdFt), pen.small)))
  const reach = dimBounds(dims)
  const noteY = (reach?.maxy ?? base) + pen.text * 2
  const xs = [reach?.minx ?? left, levelEnd + pen.small * 1.9 + labelW, uLeft, Math.max(...SECTION_NOTE.map((l) => textWidthFt(l, pen.small))) + uLeft]
  const yTop = Math.min(-view.top, -Math.max(view.top, ...labelYs) - pen.small, reach?.miny ?? -view.top)
  const yBottom = noteY + pen.small * 1.3 * SECTION_NOTE.length
  const x0 = Math.floor(Math.min(...xs) - MARGIN_FT)
  const y0 = Math.floor(yTop - MARGIN_FT)
  return {
    dims,
    base,
    labelYs,
    levelEnd,
    note: { x: uLeft, y: noteY },
    extent: { x: x0, y: y0, w: Math.ceil(Math.max(...xs) + MARGIN_FT) - x0, h: Math.ceil(yBottom + MARGIN_FT) - y0 },
  }
}

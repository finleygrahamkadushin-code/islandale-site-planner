import { formatArch, formatArea } from './format'
import type { SheetTable } from './table'
import type { SheetBuilding } from './types'

/**
 * The tables for how a building reshapes the ground (retaining walls,
 * berms, sunken courts) and its floor areas, each printed only when the
 * building has one, every height above the main floor with NAVD88 beside it.
 */

const NONE = '—'
/** Above the main floor with its sign: +2'-11", −0'-1 1/4". */
export const formatLevel = (ft: number): string => `${ft >= 0 ? '+' : ''}${formatArch(ft)}`
const navd = (b: SheetBuilding, ft: number) => formatArch(b.levels.floorNavdFt + ft)
const range = (lo: number, hi: number, show: (v: number) => string) => (show(lo) === show(hi) ? show(lo) : `${show(lo)} to ${show(hi)}`)

function wallsTable(b: SheetBuilding): SheetTable[] {
  const walls = b.earthworks?.walls ?? []
  if (!walls.length) return []
  return [
    {
      title: 'Retaining walls',
      note: "Tagged RW on the plan, drawn on the cut's edge with their back into the bank. Length along the face. Top of wall: the cap, a little over the bank behind it; the plan gives it at each end. Bottom: the cut floor at the face. Footing: the underside of the wall's foot.",
      columns: ['Wall', 'Material', 'Length', 'Thickness', 'Top of wall', 'Top NAVD88', 'Bottom', 'Bottom NAVD88', 'Footing'],
      rows: walls.map((w) => [
        w.tag,
        w.material,
        formatArch(w.lengthFt),
        formatArch(w.thicknessFt),
        range(w.topLowFt, w.topHighFt, formatLevel),
        range(w.topLowFt, w.topHighFt, (v) => navd(b, v)),
        formatLevel(w.bottomFt),
        navd(b, w.bottomFt),
        formatLevel(w.footFt),
      ]),
    },
  ]
}

function bermsTable(b: SheetBuilding): SheetTable[] {
  const berms = b.earthworks?.berms ?? []
  if (!berms.length) return []
  return [
    {
      title: 'Berms',
      note: 'Earth banked against the walls: a flat crest the crest width out from the wall, then a slope (run to rise) down to the surveyed ground at the toe. The plan draws the crest and the toe of the fill.',
      columns: ['Against', 'Along the wall', 'Crest', 'Crest NAVD88', 'Crest width', 'Slope', 'Toe out from the wall'],
      rows: berms.map((m) => [
        m.side,
        formatArch(m.lengthFt),
        formatLevel(m.crestFt),
        navd(b, m.crestFt),
        formatArch(m.crestWidthFt),
        `${+m.slope.toFixed(2)}:1`,
        m.toeOutFt ? range(m.toeOutFt.min, m.toeOutFt.max, formatArch) : NONE,
      ]),
    },
  ]
}

function courtsTable(b: SheetBuilding): SheetTable[] {
  const courts = b.earthworks?.courts ?? []
  if (!courts.length) return []
  return [
    {
      title: 'Sunken courts',
      note: 'Cut down to the cut floor beyond the wall named, its width along that wall and its depth out from it.',
      columns: ['Against', 'Width', 'Depth', 'Floor', 'Floor NAVD88'],
      rows: courts.map((c) => [c.side, formatArch(c.widthFt), formatArch(c.depthFt), formatLevel(c.floorFt), navd(b, c.floorFt)]),
    },
  ]
}

function areasTable(b: SheetBuilding): SheetTable {
  const rows = [['Enclosed, to the outside face of the walls', formatArea(b.totalAreaSqFt.enclosed)]]
  if (b.totalAreaSqFt.decks > 0) rows.push(['Decks and porches, outside the walls', formatArea(b.totalAreaSqFt.decks)])
  return { title: 'Areas', note: 'Where parts overlap, the floor is counted once; a porch roof over a deck, with no floor of its own, adds none.', columns: ['Floor', 'Area'], rows }
}

/** The earthworks tables a building has, then its areas. */
export const earthTables = (b: SheetBuilding): SheetTable[] => [...wallsTable(b), ...bermsTable(b), ...courtsTable(b), areasTable(b)]

/** The Levels table's grade and earthworks lines, and its note. */
export function gradeLevels(b: SheetBuilding): { lines: [string, number][]; note: string } {
  const at = b.parts.some((p) => p.kind === 'wall') ? 'at the walls' : 'at the deck edge'
  const L = b.levels
  const e = b.earthworks
  const lines: [string, number][] = [
    [`Finished grade ${at}, lowest`, L.gradeLowFt],
    [`Finished grade ${at}, highest`, L.gradeHighFt],
    [`Surveyed grade ${at}, lowest`, L.surveyLowFt],
    [`Surveyed grade ${at}, highest`, L.surveyHighFt],
  ]
  const cutFloor = e?.walls[0]?.bottomFt ?? e?.courts[0]?.floorFt
  if (cutFloor !== undefined) lines.push(['Cut floor round the walls', cutFloor])
  for (const m of e?.berms ?? []) lines.push([`Berm crest, ${m.side}`, m.crestFt])
  const sink = e && e.sinkFt > 0 ? ` The floor is set ${formatArch(e.sinkFt)} into the slope: at the highest surveyed ground under the building's bounding box, plus its lift, less ${formatArch(e.sinkFt)}.` : ''
  return { lines, note: `Finished grade is the ground as the earthworks leave it, as the 3D model and the elevations show it; surveyed grade is the ground before them.${sink}` }
}

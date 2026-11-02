import { formatArch, formatArea, formatDeg, formatInches } from './format'
import type { SheetArc, SheetBuilding, SheetPart } from './types'

/** One table of the measurement sheet: every value already written as it is printed. */
export interface SheetTable {
  readonly title: string
  /** How to read the table, printed under its title. */
  readonly note?: string
  readonly columns: string[]
  readonly rows: string[][]
}

const NONE = '—'
const DATUM_NOTE = "x and z from the datum (main walls' back-left corner), marked DATUM 0,0 on the plan: x to the right, z toward the front."
const edgeSpan = (a: SheetArc) => `${a.fromEdge + 1}–${a.toEdge + 1}`
const ridgeOf = (p: SheetPart) => p.levelFt + p.wallFt + (p.roof?.riseFt ?? 0)

function partsTable(b: SheetBuilding): SheetTable {
  return {
    title: 'Parts',
    columns: ['Part', 'Kind', 'Width', 'Depth', 'Level', 'Wall height', 'Area', 'Roof', 'Pitch', 'Overhang', 'Ridge above floor'],
    rows: b.parts.map((p) => [
      p.approximate ? `${p.name} (curved, drawn as its box)` : p.name,
      p.kind,
      formatArch(p.wFt),
      formatArch(p.dFt),
      formatArch(p.levelFt),
      p.wallFt > 0 ? formatArch(p.wallFt) : NONE,
      formatArea(p.areaSqFt),
      p.roof?.type ?? 'none',
      p.roof ? `${p.roof.pitch}:12` : NONE,
      p.roof ? formatArch(p.roof.overhangFt) : NONE,
      p.roof ? formatArch(ridgeOf(p)) : NONE,
    ]),
  }
}

/** Straight edges one by one; a curve's edges once, as the curve. */
function edgesTable(b: SheetBuilding): SheetTable {
  const rows = b.parts.flatMap((p) =>
    p.edges.flatMap((e): string[][] => {
      if (e.arc === null) return [[p.name, e.name, formatArch(e.lengthFt)]]
      const arc = p.arcs[e.arc]
      return arc && e.index === arc.fromEdge ? [[p.name, `curve, edges ${edgeSpan(arc)}`, formatArch(arc.lengthFt)]] : []
    }),
  )
  return { title: 'Edges', columns: ['Part', 'Edge', 'Length'], rows }
}

function curvesTable(b: SheetBuilding): SheetTable {
  const [dx, dz] = b.datum
  return {
    title: 'Curves',
    note: DATUM_NOTE,
    columns: ['Part', 'Edges', 'Radius', 'Sweep', 'Arc length', 'Chord', 'Centre x from datum', 'Centre z from datum'],
    rows: b.parts.flatMap((p) =>
      p.arcs.map((a) => [
        p.name,
        edgeSpan(a),
        formatArch(a.radiusFt),
        formatDeg(a.sweepDeg),
        formatArch(a.lengthFt),
        formatArch(a.chordFt),
        formatArch(a.centre[0] - dx),
        formatArch(a.centre[1] - dz),
      ]),
    ),
  }
}

function openingsTable(b: SheetBuilding): SheetTable {
  return {
    title: 'Openings',
    note: "From left: along the wall from its left end as seen from outside to the opening's left edge; for one that turns a corner, on the first wall named. On a curved wall, width and from left are along the curve, from the curve's left end.",
    columns: ['Tag', 'Wall', 'Kind', 'Width', 'From left', 'Sill', 'Head'],
    rows: b.parts.flatMap((p) =>
      p.openings.map((o) => {
        const curve = o.arc !== null ? ' along curve' : ''
        return [o.tag, o.wall, o.kind, formatArch(o.widthFt) + curve, formatArch(o.fromLeftFt) + curve, formatArch(o.sillFt), formatArch(o.headFt)]
      }),
    ),
  }
}

function stairsTable(b: SheetBuilding): SheetTable {
  return {
    title: 'Stairs and ramps',
    columns: ['Part', 'Risers', 'Riser', 'Tread', 'Width', 'Run', 'Drop', 'Slope', 'OK'],
    rows: b.parts.flatMap((p) => {
      const s = p.stair
      if (!s) return []
      const stair = s.kind === 'stair'
      return [
        [
          p.name,
          stair ? String(s.risers) : NONE,
          stair ? formatInches(s.riserIn) : NONE,
          stair ? formatInches(s.treadIn) : NONE,
          formatArch(s.widthFt),
          formatArch(s.runFt),
          formatArch(s.dropFt),
          s.slopeOneIn !== null ? `1:${s.slopeOneIn.toFixed(1)}` : NONE,
          s.ok ? 'Yes' : 'No',
        ],
      ]
    }),
  }
}

/** Every level the drawings mark, above the main floor and in NAVD88. */
function levelsTable(b: SheetBuilding): SheetTable {
  const lines: [string, number][] = [['Main floor', 0]]
  for (const p of b.parts) {
    if (p.levelFt !== 0) lines.push([`${p.name} floor`, p.levelFt])
    if (p.kind === 'wall' || p.roof) lines.push([`${p.name} eave`, p.levelFt + p.wallFt])
    if (p.roof) lines.push([`${p.name} ridge`, ridgeOf(p)])
  }
  lines.push(['Grade under the building, lowest', b.levels.gradeLowFt], ['Grade under the building, highest', b.levels.gradeHighFt], ['Top of roof', b.levels.topFt])
  return {
    title: 'Levels',
    columns: ['Level', 'Height above floor', 'NAVD88'],
    rows: lines.map(([label, y]) => [label, formatArch(y), formatArch(b.levels.floorNavdFt + y)]),
  }
}

function cornersTable(b: SheetBuilding): SheetTable {
  const [dx, dz] = b.datum
  return {
    title: 'Corner coordinates',
    note: `${DATUM_NOTE} P1, P2 … are marked at each part's corners on the plan.`,
    columns: ['Part', 'Point', 'x from datum', 'z from datum'],
    rows: b.parts.flatMap((p) => p.outline.map((q, i) => [p.name, `P${i + 1}`, formatArch(q[0] - dx), formatArch(q[1] - dz)])),
  }
}

/** Every measurement of a building, table by table, as printed beside its drawings. */
export function sheetTables(b: SheetBuilding): SheetTable[] {
  return [partsTable(b), edgesTable(b), curvesTable(b), openingsTable(b), stairsTable(b), levelsTable(b), cornersTable(b)]
}

const csvCell = (v: string) => (/[",\n\r]|^\s|\s$/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
const csvRow = (cells: readonly string[]) => cells.map(csvCell).join(',')

/** All of a building's tables as one CSV: each table's title on its own row, then its columns and rows, a blank row between tables. */
export function tablesCsv(b: SheetBuilding): string {
  return sheetTables(b)
    .map((t) => [csvRow([`${b.name} — ${t.title}`]), ...(t.note ? [csvRow([t.note])] : []), csvRow(t.columns), ...t.rows.map(csvRow)].join('\n'))
    .join('\n\n')
    .concat('\n')
}

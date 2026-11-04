import { curveRuns, spanLabel, STATION_FT } from './curves'
import { formatArch, formatArea, formatDeg, formatInches } from './format'
import type { SheetBuilding, SheetPart } from './types'

/** One table of the measurement sheet: every value already written as it is printed. */
export interface SheetTable {
  readonly title: string
  /** How to read the table, printed under its title. */
  readonly note?: string
  readonly columns: string[]
  readonly rows: string[][]
}

const NONE = '—'
const IN_PER_FT = 12
const ridgeOf = (p: SheetPart) => p.levelFt + p.wallFt + (p.roof?.riseFt ?? 0)
const hasCurve = (p: SheetPart) => p.edges.some((e) => e.curved)
const orNone = (v: number | null) => (v === null ? NONE : formatArch(v))

/** How the coordinate tables are read: from the main walls' back-left corner, or from their bounding box's when no wall passes through it. */
function datumNote(b: SheetBuilding): string {
  const datum = b.datumOnWall ? "the main walls' back-left corner" : "the back-left corner of the main walls' bounding box, drawn dashed on the plan"
  return `x and z from the datum (${datum}), marked DATUM 0,0 on the plan: x to the right, z toward the front.`
}

function partsTable(b: SheetBuilding): SheetTable {
  return {
    title: 'Parts',
    note: "Width and depth: the drawn outline's size along the part's own axes.",
    columns: ['Part', 'Kind', 'Width', 'Depth', 'Level', 'Wall height', 'Area', 'Roof', 'Pitch', 'Overhang', 'Ridge above floor'],
    rows: b.parts.map((p) => [
      p.name,
      p.curve ? `${p.kind}, ${p.curve}` : p.kind,
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

const arcWord = (n: number) => (n === 1 ? '1 arc' : `${n} arcs`)

/** Straight edges one by one; each stretch of curve once, round its chords, its arcs listed in Curves. */
function edgesTable(b: SheetBuilding): SheetTable {
  const rows = b.parts.flatMap((p) => {
    const runs = curveRuns(p.edges)
    return p.edges.flatMap((e): string[][] => {
      if (!e.curved) return [[p.name, e.name, formatArch(e.lengthFt)]]
      const run = runs.find((r) => r.fromEdge === e.index)
      if (!run) return []
      const arcs = run.arcCount ? `, ${arcWord(run.arcCount)}` : ''
      const what = run.whole ? `whole outline${p.curve ? ` (${p.curve})` : ''}, round from P1` : `curve ${spanLabel(p.edges.length, run.fromEdge, run.toEdge)}`
      return [[p.name, `${what}${arcs}`, formatArch(run.lengthFt)]]
    })
  })
  return { title: 'Edges', note: 'A curve is given once, its length round the wall; Curves gives the arcs to draw it with.', columns: ['Part', 'Edge', 'Length'], rows }
}

function curvesTable(b: SheetBuilding): SheetTable {
  const [dx, dz] = b.datum
  return {
    title: 'Curves',
    note: `${datumNote(b)} Each arc runs between the two P points named; arcs of one curve meet end to end. Within: how far the drawn outline strays from the arc.`,
    columns: ['Part', 'From–to', 'Radius', 'Sweep', 'Arc length', 'Chord', 'Centre x from datum', 'Centre z from datum', 'Within'],
    rows: b.parts.flatMap((p) =>
      p.arcs.map((a) => [
        p.name,
        spanLabel(p.edges.length, a.fromEdge, a.toEdge),
        formatArch(a.radiusFt),
        formatDeg(a.sweepDeg),
        formatArch(a.lengthFt),
        formatArch(a.chordFt),
        formatArch(a.centre[0] - dx),
        formatArch(a.centre[1] - dz),
        formatInches(a.fitErrorFt * IN_PER_FT),
      ]),
    ),
  }
}

/** Every ellipse part exactly; listed only when the building has one. */
function ellipsesTable(b: SheetBuilding): SheetTable[] {
  const [dx, dz] = b.datum
  const rows = b.parts.flatMap((p) => {
    const e = p.ellipse
    if (!e) return []
    return [[p.name, formatArch(e.centre[0] - dx), formatArch(e.centre[1] - dz), formatArch(e.widthFt), formatArch(e.depthFt), formatDeg(e.rotDeg), e.fourCentreErrorFt === null ? NONE : formatInches(e.fourCentreErrorFt * IN_PER_FT)]]
  })
  if (!rows.length) return []
  return [
    {
      title: 'Ellipses',
      note: 'The true ellipse. Where the last column gives a figure, its arcs in Curves are the four-centre construction, within that of the drawn outline: two small arcs at the ends of the long axis and two large at the ends of the short, meeting on the lines through their centres. Axis turned: counter-clockwise on the plan.',
      columns: ['Part', 'Centre x from datum', 'Centre z from datum', 'Width axis', 'Depth axis', 'Axis turned', 'Four-centre arcs within'],
      rows,
    },
  ]
}

function openingsTable(b: SheetBuilding): SheetTable {
  return {
    title: 'Openings',
    note: "From left: along the wall from its left end as seen from outside to the opening's left edge; for one that turns a corner, on the last wall named. Round from P1: round the part's walls from its P1, the way the arrow there points, to the opening's first edge; it locates every opening on a curve, whose width is round the wall too.",
    columns: ['Tag', 'Wall', 'Kind', 'Width', 'From left', 'Round from P1', 'Sill', 'Head'],
    rows: b.parts.flatMap((p) =>
      p.openings.map((o) => [o.tag, o.wall, o.kind, formatArch(o.widthFt), orNone(o.fromLeftFt), orNone(o.aroundFt), formatArch(o.sillFt), formatArch(o.headFt)]),
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
    note: `${datumNote(b)} P1, P2 … are marked at each part's corners on the plan (on a curve, only where its arcs meet); S1, S2 … at stations every ${STATION_FT} ft round a curve from P1.`,
    columns: ['Part', 'Point', 'x from datum', 'z from datum', 'Round from P1'],
    rows: b.parts.flatMap((p) => p.points.map((q) => [p.name, q.label, formatArch(q.at[0] - dx), formatArch(q.at[1] - dz), hasCurve(p) ? formatArch(q.aroundFt) : NONE])),
  }
}

/** Every measurement of a building, table by table, as printed beside its drawings. */
export function sheetTables(b: SheetBuilding): SheetTable[] {
  return [partsTable(b), edgesTable(b), curvesTable(b), ...ellipsesTable(b), openingsTable(b), stairsTable(b), levelsTable(b), cornersTable(b)]
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

import { beforeAll, describe, expect, test } from 'vitest'
import { usePlanStore } from '../../store/planStore'
import { elevationView, sheetBuildings } from './model'
import { SIDES } from './sides'
import { sheetTables, tablesCsv } from './table'

const store = () => usePlanStore.getState()
const prow = () => {
  const objs = store().plan.order.map((id) => store().plan.objects[id])
  const b = sheetBuildings(objs, store().site.terrain).find((x) => x.id === 'C-0')
  if (!b) throw new Error('no C-0')
  return b
}

beforeAll(() => {
  store().setReadOnly(null)
  store().loadScheme('C')
})

describe('sheetTables', () => {
  test('gives every table, each row as wide as its columns', () => {
    const tables = sheetTables(prow())
    expect(tables.map((t) => t.title)).toEqual(['Parts', 'Edges', 'Curves', 'Openings', 'Stairs and ramps', 'Levels', 'Corner coordinates'])
    for (const t of tables) for (const r of t.rows) expect(r).toHaveLength(t.columns.length)
  })

  test('a curve is one edge row, and gets its own row in Curves between the P points at its ends', () => {
    const [, edges, curves] = sheetTables(prow())
    const deckRows = edges.rows.filter((r) => r[0] === 'Deck 3')
    expect(deckRows.filter((r) => r[1] === 'curve P4–P16, 1 arc')).toHaveLength(1)
    expect(deckRows.some((r) => r[1] === 'edge 5')).toBe(false)
    expect(curves.rows.filter((r) => r[0] === 'Deck 3').map((r) => r[1])).toEqual(['P4–P16', 'P19–P31'])
    expect(curves.rows[0][4]).toBe('90°')
  })

  test('rect parts read their width and depth; openings and stairs are listed', () => {
    const b = prow()
    const [parts, , , openings, stairs, levels, corners] = sheetTables(b)
    expect(parts.rows.find((r) => r[0] === 'Main')?.slice(2, 4)).toEqual([`28'-0"`, `26'-0"`])
    // the walls' thickness, 7 7/8" to the quarter inch, and none on a deck
    expect(parts.rows.find((r) => r[0] === 'Main')?.[6]).toBe('8"')
    expect(parts.rows.find((r) => r[0] === 'Deck 3')?.[6]).toBe('—')
    expect(openings.rows).toHaveLength(b.parts.reduce((s, p) => s + p.openings.length, 0))
    expect(stairs.rows.map((r) => r[0])).toEqual(['Stair 2'])
    expect(levels.rows[0].slice(0, 2)).toEqual(['Main floor', `0'-0"`])
    expect(corners.rows).toHaveLength(b.parts.reduce((s, p) => s + p.points.length, 0))
    // a straight part lists every corner; the prow lists its arc's ends, not the vertices inside it, nor stations on its exact arc
    expect(corners.rows.filter((r) => r[0] === 'Porch 1').map((r) => r[1])).toEqual(['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8'])
    const mainPoints = corners.rows.filter((r) => r[0] === 'Main').map((r) => r[1])
    expect(mainPoints).toEqual(['P1', 'P2', 'P3', 'P4', 'P5', 'P17'])
    // the datum is the main walls' back-left corner, so their corners measure from it in positive x and z
    expect(corners.rows.filter((r) => r[0] === 'Main').every((r) => !r[2].startsWith('−') && !r[3].startsWith('−'))).toBe(true)
    expect(corners.rows.filter((r) => r[0] === 'Main').some((r) => r[2] === `0'-0"`)).toBe(true)
    expect(corners.note).toContain("main walls' back-left corner")
    expect(levels.rows.map((r) => r[0])).toContain('Grade under the building, lowest')
  })
})

describe('tablesCsv', () => {
  test('one CSV with a title row per table and inch marks quoted', () => {
    const csv = tablesCsv(prow())
    const lines = csv.split('\n')
    expect(lines[0]).toBe('Gathering prow — Parts')
    expect(lines[1]).toContain('Width and depth')
    expect(lines[2]).toBe('Part,Kind,Width,Depth,Level,Wall height,Wall,Area,Roof,Pitch,Overhang,Ridge above floor')
    expect(lines[3]).toContain(`"28'-0"""`)
    expect(csv.match(/^Gathering prow — /gm)).toHaveLength(7)
    expect(csv.endsWith('\n')).toBe(true)
  })
})

describe('every scheme', () => {
  test('builds sheets, elevations and tables for every building without a gap', () => {
    for (const scheme of store().schemes) {
      store().loadScheme(scheme.id)
      const objs = store().plan.order.map((id) => store().plan.objects[id])
      for (const b of sheetBuildings(objs, store().site.terrain)) {
        for (const t of sheetTables(b)) for (const r of t.rows) for (const cell of r) expect(cell).not.toMatch(/NaN|undefined|Infinity/)
        for (const side of SIDES) {
          const v = elevationView(objs, store().site.terrain, b, side)
          expect(v.uMax).toBeGreaterThanOrEqual(v.uMin)
          expect(v.grade.every(([u, y]) => Number.isFinite(u) && Number.isFinite(y))).toBe(true)
        }
      }
    }
  })
})

import { beforeAll, describe, expect, test } from 'vitest'
import { sheetBuildings } from '../../export/sheets/model'
import { sheetTables, type SheetTable } from '../../export/sheets/table'
import { MARGIN_IN, PAPERS, TITLE_IN } from '../../export/sheets/types'
import { usePlanStore } from '../../store/planStore'
import { packTables, rowHeights } from './MeasureTables'

const store = () => usePlanStore.getState()
const tabloid = { room: PAPERS.tabloid.h - 2 * MARGIN_IN - TITLE_IN, width: PAPERS.tabloid.w - 2 * MARGIN_IN }
const table = (rows: string[][], columns = ['A', 'B', 'C']): SheetTable => ({ title: 'T', columns, rows })
const flatRows = (pages: ReturnType<typeof packTables>, t: SheetTable) => pages.flatMap((p) => p.filter((c) => c.table === t).flatMap((c) => c.blocks.flat()))

beforeAll(() => {
  store().setReadOnly(null)
})

describe('packTables', () => {
  test('a row of a table wider than the page counts the lines its longest cell wraps to', () => {
    const wide = table([['x', 'y'.repeat(400), 'z'], ['x', 'y', 'z']])
    const [tall, short] = rowHeights(wide, 7.5)
    expect(tall).toBeGreaterThan(short * 2)
    expect(rowHeights(table([['x', 'y', 'z']]), 7.5)).toEqual([short])
  })

  test('a long narrow table runs on beside itself across a wide sheet, every row once and in order', () => {
    const t = table(Array.from({ length: 150 }, (_, i) => [`P${i + 1}`, '12\'-3"', '4\'-0"']))
    const wide = packTables([t], tabloid.room, tabloid.width)
    const tall = packTables([t], tabloid.room)
    expect(wide.length).toBeLessThan(tall.length)
    expect(wide[0][0].blocks.length).toBe(3)
    expect(flatRows(wide, t)).toEqual(t.rows)
    expect(flatRows(tall, t)).toEqual(t.rows)
  })

  test("curved buildings' measurements fit a few tabloid sheets, the prow's no more than before", () => {
    const pages = (scheme: string, id: string) => {
      store().loadScheme(scheme)
      const objs = store().plan.order.map((k) => store().plan.objects[k])
      const b = sheetBuildings(objs, store().site.terrain).find((x) => x.id === id)
      if (!b) throw new Error(`no ${id}`)
      return packTables(sheetTables(b), tabloid.room, tabloid.width).length
    }
    for (const [scheme, id] of [['D', 'D-0'], ['D', 'D-1'], ['E', 'E-0'], ['G', 'G-1']]) expect(pages(scheme, id)).toBeLessThanOrEqual(5)
    expect(pages('C', 'C-0')).toBeLessThanOrEqual(4)
  })
})

import { beforeAll, describe, expect, test } from 'vitest'
import { sheetBuildings } from '../model/model'
import { sheetTables, type SheetTable } from './table'
import { MARGIN_IN, PAPERS, TITLE_IN } from '../types'
import { usePlanStore } from '../../../store/planStore'
import type { PlanObject } from '../../../store/types'
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
    store().loadScheme('C')
    const objs = store().plan.order.map((k) => store().plan.objects[k])
    const pages = (os: PlanObject[], id: string) => {
      const b = sheetBuildings(os, store().site.terrain).find((x) => x.id === id)
      if (!b) throw new Error(`no ${id}`)
      return packTables(sheetTables(b), tabloid.room, tabloid.width).length
    }
    // the twin pod redrawn as a blob, its wings kept
    const pod = store().plan.objects['C-2']
    expect(pages([{ ...pod, params: { ...pod.params, shape: 'blob', w: 34, d: 22, pts: undefined } }], 'C-2')).toBeLessThanOrEqual(6)
    expect(pages(objs, 'C-0')).toBeLessThanOrEqual(4)
  })
})

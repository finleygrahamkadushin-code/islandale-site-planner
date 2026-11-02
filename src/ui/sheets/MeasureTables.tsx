import { useMemo } from 'react'
import { sheetTables, type SheetTable } from '../../export/sheets/table'
import { MARGIN_IN, PAPERS, TITLE_IN, type SheetBuilding } from '../../export/sheets/types'
import { Page, type SheetInfo } from './Page'

/** Rough heights in inches at the table's 8 pt type, to fill each sheet before starting the next. */
const TITLE_ROW_IN = 0.34
const HEAD_ROW_IN = 0.26
const ROW_IN = 0.2
/** A table's note, allowing it to wrap onto a second line on narrow paper. */
const NOTE_IN = 0.32

interface Chunk {
  readonly table: SheetTable
  readonly rows: readonly (readonly string[])[]
  readonly continued: boolean
}

/** Tables laid onto sheets of `roomIn` inches each, a long table carrying on over the next sheet under its header again. */
export function packTables(tables: readonly SheetTable[], roomIn: number): Chunk[][] {
  const pages: Chunk[][] = [[]]
  let left = roomIn
  for (const table of tables) {
    let from = 0
    let placed = false
    while (!placed || from < table.rows.length) {
      const head = TITLE_ROW_IN + HEAD_ROW_IN + (table.note && from === 0 ? NOTE_IN : 0)
      const fits = Math.floor((left - head) / ROW_IN)
      const page = pages[pages.length - 1]
      if (fits < Math.min(3, table.rows.length - from) && page.length) {
        pages.push([])
        left = roomIn
        continue
      }
      const take = Math.max(1, Math.min(fits, table.rows.length - from))
      page.push({ table, rows: table.rows.slice(from, from + take), continued: from > 0 })
      left -= head + take * ROW_IN
      from += take
      placed = true
    }
  }
  return pages.filter((p) => p.length)
}

interface Props {
  readonly building: SheetBuilding
  readonly info: Omit<SheetInfo, 'sheetTitle' | 'northDeg'>
}

/** Every measurement of a building as tables, as many sheets as they take. */
export function MeasureTables({ building, info }: Props) {
  const p = PAPERS[info.paper]
  const pages = useMemo(() => packTables(sheetTables(building), p.h - 2 * MARGIN_IN - TITLE_IN), [building, p.h])
  return (
    <>
      {pages.map((chunks, i) => (
        <Page key={i} {...info} sheetTitle="Measurements" tileLabel={pages.length > 1 ? `Page ${i + 1} of ${pages.length}` : undefined} flow>
          <div className="sheet-tables">
            {chunks.map((c, j) => (
              <table key={j} className="sheet-table">
                <caption>
                  {c.table.title}
                  {c.continued ? ' (continued)' : ''}
                  {c.table.note && !c.continued && <span className="sheet-table-note">{c.table.note}</span>}
                </caption>
                <thead>
                  <tr>
                    {c.table.columns.map((col, k) => (
                      <th key={k} scope="col">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {c.rows.map((row, k) => (
                    <tr key={k}>
                      {row.map((cell, m) => (
                        <td key={m}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ))}
          </div>
        </Page>
      ))}
    </>
  )
}

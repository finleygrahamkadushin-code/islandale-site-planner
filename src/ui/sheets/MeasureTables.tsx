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
/** Each further line of a cell or note that wraps, at 8 pt (7.5 pt notes) and 1.2 line height. */
const LINE_IN = 0.135
/** Characters to the inch at the table's 8 pt type, on the narrow side, and the cell padding in characters. */
const CHARS_PER_IN = 15
const PAD_CHARS = 2
/** Notes wrap at the CSS max-width of 7.5 in. */
const NOTE_MAX_IN = 7.5
const NOTE_CHARS_PER_IN = 16
/** A long narrow table runs on in up to this many blocks side by side, this far apart, inches (as the CSS sets it). */
const MAX_ACROSS = 3
const ACROSS_GAP_IN = 0.25

type Rows = readonly (readonly string[])[]

interface Chunk {
  readonly table: SheetTable
  /** The rows on this sheet, in blocks set side by side, each under its own header. */
  readonly blocks: readonly Rows[]
  readonly continued: boolean
}

const naturalChars = (table: SheetTable): number[] => table.columns.map((c, j) => Math.max(c.length, ...table.rows.map((r) => (r[j] ?? '').length)))

/** Rough width of a table at its content's natural size, inches. */
const naturalIn = (table: SheetTable) => naturalChars(table).reduce((s, w) => s + w + PAD_CHARS, 0) / CHARS_PER_IN

/** How many copies of a table fit side by side across the sheet: one unless it is narrow and the width is known. */
function acrossOf(table: SheetTable, widthIn: number): number {
  if (!Number.isFinite(widthIn)) return 1
  return Math.max(1, Math.min(MAX_ACROSS, Math.floor((widthIn + ACROSS_GAP_IN) / (naturalIn(table) + ACROSS_GAP_IN))))
}

/**
 * Rough height of each row, inches: a row is one line unless the table is
 * wider than the page, when the browser narrows its columns in proportion
 * to their content and the longest cells wrap.
 */
export function rowHeights(table: SheetTable, widthIn: number): number[] {
  const widths = naturalChars(table)
  const natural = widths.reduce((s, w) => s + w + PAD_CHARS, 0)
  const share = Math.min(1, (widthIn * CHARS_PER_IN) / natural)
  return table.rows.map((r) => {
    const lines = Math.max(1, ...r.map((cell, j) => Math.ceil(cell.length / Math.max(1, Math.floor(widths[j] * share)))))
    return ROW_IN + (lines - 1) * LINE_IN
  })
}

const noteHeight = (note: string, widthIn: number) => Math.max(NOTE_IN, Math.ceil(note.length / (Math.min(NOTE_MAX_IN, widthIn) * NOTE_CHARS_PER_IN)) * LINE_IN + (NOTE_IN - 2 * LINE_IN))

/**
 * Tables laid onto sheets of `roomIn` × `widthIn` inches each, a long table
 * carrying on over the next sheet under its header again; a long narrow one
 * runs on beside itself first, in up to MAX_ACROSS blocks.
 */
export function packTables(tables: readonly SheetTable[], roomIn: number, widthIn = Infinity): Chunk[][] {
  const pages: Chunk[][] = [[]]
  let left = roomIn
  for (const table of tables) {
    const heights = rowHeights(table, widthIn)
    const across = acrossOf(table, widthIn)
    // a note wraps to its own table's width once the table runs on beside itself; an empty table prints none
    const noteIn = table.note && table.rows.length ? noteHeight(table.note, across > 1 ? naturalIn(table) : widthIn) : 0
    /** How many rows from `start` fit under a header of `head` inches in what is left of the sheet. */
    const fitting = (start: number, head: number) => {
      let n = 0
      for (let used = head; start + n < table.rows.length && used + heights[start + n] <= left; n++) used += heights[start + n]
      return n
    }
    let from = 0
    let placed = false
    while (!placed || from < table.rows.length) {
      const head = TITLE_ROW_IN + HEAD_ROW_IN + (from === 0 ? noteIn : 0)
      const fits = fitting(from, head)
      const page = pages[pages.length - 1]
      if (fits < Math.min(3, table.rows.length - from) && page.length) {
        pages.push([])
        left = roomIn
        continue
      }
      // the first block under the full header, then the rest beside it under a plain one
      const start = from
      const blocks: Rows[] = []
      let height = 0
      do {
        const top = blocks.length === 0 ? head : TITLE_ROW_IN + HEAD_ROW_IN
        const n = Math.min(Math.max(1, blocks.length === 0 ? fits : fitting(from, top)), table.rows.length - from)
        blocks.push(table.rows.slice(from, from + n))
        height = Math.max(height, top + heights.slice(from, from + n).reduce((sum, h) => sum + h, 0))
        from += n
      } while (blocks.length < across && from < table.rows.length)
      page.push({ table, blocks, continued: start > 0 })
      left -= height
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
  const pages = useMemo(() => packTables(sheetTables(building), p.h - 2 * MARGIN_IN - TITLE_IN, p.w - 2 * MARGIN_IN), [building, p.h, p.w])
  return (
    <>
      {pages.map((chunks, i) => (
        <Page key={i} {...info} sheetTitle="Measurements" tileLabel={pages.length > 1 ? `Page ${i + 1} of ${pages.length}` : undefined} flow>
          <div className="sheet-tables">
            {chunks.map((c, j) => (
              <div key={j} className="sheet-table-run">
                {c.blocks.map((rows, k) => (
                  <MeasureTable key={k} table={c.table} rows={rows} continued={c.continued || k > 0} />
                ))}
              </div>
            ))}
          </div>
        </Page>
      ))}
    </>
  )
}

/** One block of a table under its header: the title (and, where it starts, its note), the columns, then its rows. */
function MeasureTable({ table, rows, continued }: { readonly table: SheetTable; readonly rows: Rows; readonly continued: boolean }) {
  return (
    <table className="sheet-table">
      <caption>
        {table.title}
        {continued ? ' (continued)' : ''}
        {table.note && !continued && rows.length > 0 && <span className="sheet-table-note">{table.note}</span>}
      </caption>
      <thead>
        <tr>
          {table.columns.map((col, k) => (
            <th key={k} scope="col">
              {col}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, k) => (
          <tr key={k}>
            {row.map((cell, m) => (
              <td key={m}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

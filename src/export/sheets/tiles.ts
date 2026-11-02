import { MARGIN_IN, PAPERS, TITLE_IN, type PaperId, type Scale, type Tile } from './types'

/** Feet of drawing one page holds at a scale: the paper less its margins and title strip. */
export function pageFeet(paper: PaperId, scale: Scale): { readonly w: number; readonly h: number } {
  const p = PAPERS[paper]
  return { w: (p.w - 2 * MARGIN_IN) / scale, h: (p.h - 2 * MARGIN_IN - TITLE_IN) / scale }
}

/** Row letters A … Z, then AA, AB …, so any number of rows gets a label. */
function rowLetters(row: number): string {
  const head = Math.floor(row / 26)
  const tail = String.fromCharCode(65 + (row % 26))
  return head === 0 ? tail : rowLetters(head - 1) + tail
}

/** How many pages of `page` feet cover `size` feet; a hair over a page still fits on one. */
const pagesFor = (size: number, page: number) => Math.max(1, Math.ceil(size / page - 1e-6))

/**
 * Cut a drawing of width × height feet into pages at the scale: one tile
 * when it fits, else a grid of full pages with the remainder in the last
 * row and column, row-major and labelled A1, A2 … B1, so the pages tape
 * together edge to edge at true scale.
 */
export function tileDrawing(widthFt: number, heightFt: number, paper: PaperId, scale: Scale): Tile[] {
  const page = pageFeet(paper, scale)
  const width = Math.max(0, widthFt)
  const height = Math.max(0, heightFt)
  const cols = pagesFor(width, page.w)
  const rows = pagesFor(height, page.h)
  const span = (i: number, n: number, size: number, step: number): readonly [number, number] => {
    if (n === 1) return [0, size]
    const at = i * step
    return [at, i === n - 1 ? size - at : step]
  }
  return Array.from({ length: rows * cols }, (_, k): Tile => {
    const row = Math.floor(k / cols)
    const col = k % cols
    const [x, w] = span(col, cols, width, page.w)
    const [y, h] = span(row, rows, height, page.h)
    return { row, col, label: `${rowLetters(row)}${col + 1}`, x, y, w, h }
  })
}

import { describe, expect, it } from 'vitest'
import { keepUnits } from './keepUnits'

const NB = ' '

describe('keepUnits', () => {
  it('ties a number to its unit, and "sq ft" together', () => {
    expect(keepUnits('1,599 / 1,600 sq ft')).toBe(`1,599 /${NB}1,600${NB}sq${NB}ft`)
    expect(keepUnits('7.0 %')).toBe(`7.0${NB}%`)
    expect(keepUnits('412 ft')).toBe(`412${NB}ft`)
    expect(keepUnits('ground 3.5 ft NAVD88')).toBe(`ground 3.5${NB}ft NAVD88`)
  })

  it('ties a count to the word it counts on the program rows', () => {
    expect(keepUnits('671 sq ft + 157 covered')).toBe(`671${NB}sq${NB}ft +${NB}157${NB}covered`)
    expect(keepUnits('493 sq ft + 745 deck')).toBe(`493${NB}sq${NB}ft +${NB}745${NB}deck`)
    expect(keepUnits('441 sq ft (2 fl)')).toBe(`441${NB}sq${NB}ft (2${NB}fl)`)
  })

  it('ties a + or / to the number after it, so a line breaks before it, not after', () => {
    expect(keepUnits('a + 3 b / 4')).toBe(`a +${NB}3 b /${NB}4`)
  })

  it('leaves other spaces alone, so long values still wrap between their parts', () => {
    expect(keepUnits('Lot area')).toBe('Lot area')
    expect(keepUnits('floor 12.0 ft · ground 3.5 ft')).toBe(`floor 12.0${NB}ft · ground 3.5${NB}ft`)
    expect(keepUnits('2 feet')).toBe('2 feet')
  })
})

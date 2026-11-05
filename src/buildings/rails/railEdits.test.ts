import { describe, expect, test } from 'vitest'
import {
  buildingRailStyle,
  cycle,
  hasRailMap,
  materialise,
  railStates,
  railStyleOf,
  stateOf,
  withRailStyle,
  writeAll,
  writeEdge,
  type EdgeDraw,
} from './railEdits'

const draw = (legacy: boolean, auto: boolean, free = true): EdgeDraw => ({ legacy, auto, free })

describe('stateOf (legacy railEdit.stateOf)', () => {
  test('the map wins, then the old flag, else auto', () => {
    expect(stateOf({ 0: true }, false, 0, 4)).toBe('on')
    expect(stateOf({ '1': false }, true, 1, 4)).toBe('off') // saved keys are strings
    expect(stateOf({}, undefined, 2, 4)).toBe('auto')
    expect(stateOf(undefined, false, 0, 4)).toBe('off')
    expect(stateOf(undefined, true, 0, 4)).toBe('on')
  })

  test("'sides' leaves the odd edges open on straight-sided outlines only", () => {
    expect([0, 1, 2, 3].map((i) => stateOf(undefined, 'sides', i, 4))).toEqual(['on', 'off', 'on', 'off'])
    expect(stateOf(undefined, 'sides', 1, 32)).toBe('on')
  })

  test('railStates lists every edge, and cycle goes auto, on, off, auto', () => {
    expect(railStates({ rails: { 2: false } }, 4)).toEqual(['auto', 'auto', 'off', 'auto'])
    expect([cycle('auto'), cycle('on'), cycle('off')]).toEqual(['on', 'off', 'auto'])
  })
})

test('a wing with no map shows every edge as auto, whatever its old flag', () => {
  // the whole-wing rule draws it; the chip starts at auto, so a click goes to on
  expect(railStates({ rail: 'sides' }, 4)).toEqual(['auto', 'auto', 'auto', 'auto'])
  expect(railStates({ rail: false }, 3)).toEqual(['auto', 'auto', 'auto'])
  expect(cycle(railStates({ rail: 'sides' }, 4)[0])).toBe('on')
})

describe('materialise', () => {
  test('keeps what is drawn: only edges where the legacy rule and auto disagree are stored', () => {
    const src = { kind: 'deck', w: 10, d: 6, rail: 'sides' }
    // legacy draws 0 and 2; per-edge auto would draw only 0 and 3
    const out = materialise(src, 4, [draw(true, true), draw(false, false), draw(true, false), draw(false, true)])
    expect(out).toEqual({ kind: 'deck', w: 10, d: 6, rails: { 2: true, 3: false } })
    expect(src.rail).toBe('sides') // the input is untouched
  })

  test('without what every edge draws it refuses, rather than freezing the flag as legacy materialize does', () => {
    expect(() => materialise({ rail: 'sides' }, 4, null)).toThrow(/needs what each of the 4 edges draws/)
    expect(() => materialise({ rail: true }, 4, [draw(true, true)])).toThrow()
    expect(() => writeEdge({ kind: 'deck' }, 0, 'on', 4, null)).toThrow()
  })

  test('a wing that already has a map is left alone', () => {
    const src = { rails: { 1: true }, rail: true }
    expect(materialise(src, 4, [draw(false, true), draw(false, true), draw(false, true), draw(false, true)])).toBe(src)
    expect(hasRailMap(src)).toBe(true)
    expect(hasRailMap({ rail: true })).toBe(false)
  })
})

describe('writeEdge and writeAll', () => {
  test('the first click changes only the clicked edge of what is drawn', () => {
    const draws = [draw(true, false), draw(true, false), draw(true, true), draw(false, false)]
    const before = [0, 1, 2, 3].map((i) => draws[i].legacy)
    const out = writeEdge({ kind: 'deck', w: 8, d: 8 }, 1, 'off', 4, draws)
    // drawn after: on → yes, off → no, auto → what auto draws
    const drawnAfter = railStates(out, 4).map((s, i) => s === 'on' || (s === 'auto' && draws[i].auto))
    expect(drawnAfter).toEqual([true, false, true, false])
    expect(drawnAfter.filter((d, i) => d !== before[i])).toHaveLength(1)
    expect(out).toEqual({ kind: 'deck', w: 8, d: 8, rails: { 0: true, 1: false } })
  })

  test('on, off and auto set and clear one edge once a map exists', () => {
    const on = writeEdge({ rails: { '2': false } }, 2, 'on', 4, null)
    expect(on.rails).toEqual({ 2: true })
    expect(writeEdge(on, 2, 'auto', 4, null).rails).toEqual({})
    expect(() => writeEdge({ rails: {} }, 4, 'on', 4, null)).toThrow(/no edge/)
  })

  test('all on or off covers every free edge; all auto empties the map; the flag goes', () => {
    expect(writeAll({ rail: false }, 'on', 4, [true, false, true, true])).toEqual({ rails: { 0: true, 2: true, 3: true } })
    expect(writeAll({ rails: { 1: true } }, 'off', 3, null)).toEqual({ rails: { 0: false, 1: false, 2: false } })
    expect(writeAll({ rail: 'sides', rails: { 1: true } }, 'auto', 4, null)).toEqual({ rails: {} })
  })
})

describe('rail style', () => {
  test('a part takes its own exterior style first, then the building’s, else wood', () => {
    const params = { ext: { parts: { rail: { style: 'steel' } }, masses: { '2': { rail: { style: 'glass' } } } } }
    expect(railStyleOf(params, 2)).toBe('glass')
    expect(railStyleOf(params, 1)).toBe('steel')
    expect(railStyleOf({}, 0)).toBe('wood')
    expect(railStyleOf({ ext: { parts: { rail: { style: 'chrome' } } } }, 0)).toBe('wood')
    expect(buildingRailStyle(params)).toBe('steel')
  })

  test('the building style is stored per building; wood removes it and prunes empty objects', () => {
    const steel = withRailStyle({ w: 10 }, 'steel')
    expect(steel).toEqual({ w: 10, ext: { parts: { rail: { style: 'steel' } } } })
    expect(withRailStyle(steel, 'wood')).toEqual({ w: 10 })
    const kept = withRailStyle({ ext: { masses: { '1': {} }, parts: { rail: { style: 'cable', color: '#000' }, roof: 'x' } } }, 'wood')
    expect(kept).toEqual({ ext: { masses: { '1': {} }, parts: { roof: 'x', rail: { color: '#000' } } } })
    expect(() => withRailStyle({}, 'chrome' as never)).toThrow()
  })
})

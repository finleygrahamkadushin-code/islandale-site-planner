import { describe, expect, test } from 'vitest'
import { buildingMasses, wingMass } from './masses'
import { hudText, kindPatch, railChipLabel, railChipTitle, railDesc, railRowText, railSummary, railTarget, stairSummary } from './partFields'
import type { EdgeRail } from './railRules'
import type { StairInfo } from './stairPlan'

const IN = 0.0254
const edge = (over: Partial<EdgeRail> = {}): EdgeRail => ({
  i: 2, state: 'auto', required: false, drawn: false, free: true, legacy: false, auto: false,
  dropFt: 1.2, lenFt: 12.2, openings: [], names: [], runs: [], ...over,
})

describe('hudText', () => {
  test('names the part, its size and what can be done with it', () => {
    const [main, deck, hex] = buildingMasses({ w: 28, d: 26, wings: [{ kind: 'deck', w: 12, d: 10.04 }, { kind: 'porch', shape: 'hex', w: 8, d: 8 }] })
    expect(hudText(main, 0)).toBe('Editing: Main · 28 × 26 ft · drag an edge handle to resize, Esc for the whole building')
    expect(hudText(deck, 1)).toBe('Editing: Deck 1 · 12 × 10 ft · drag an edge handle to resize, Delete to remove')
    expect(hudText(hex, 2)).toBe('Editing: Porch 2 · 8 × 8 ft · drag the grip to move, Delete to remove')
    expect(hudText({ ...main, shape: 'poly', pts: [[0, 0], [10, 0], [5, 8]] }, 0)).toMatch(/· Esc for the whole building$/)
  })
})

describe('kindPatch', () => {
  test('stairs and ramps lose roof and walls and are 3 to 8 ft wide', () => {
    expect(kindPatch({ w: 12, d: 2, h: 9, roof: 'shed' }, 'stair', 9)).toEqual({ kind: 'stair', open: true, roof: 'none', h: 0, w: 8, d: 3 })
  })
  test('a deck is a foot high with no roof; walls and porches keep their height or take the cabin walls', () => {
    expect(kindPatch({ w: 12, d: 10, h: 0 }, 'deck', 9)).toEqual({ kind: 'deck', open: true, roof: 'none', h: 1, w: 12, d: 10 })
    expect(kindPatch({ w: 3, d: 10, h: 0 }, 'wall', 9)).toEqual({ kind: 'wall', open: false, h: 9, w: 4, d: 10 })
    expect(kindPatch({ w: 12, d: 10, h: 8 }, 'porch', 9)).toEqual({ kind: 'porch', open: true, w: 12, d: 10 })
  })
})

describe('rail words', () => {
  test('each state says whether a guard is needed', () => {
    expect(railDesc(edge())).toBe('not needed')
    expect(railDesc(edge({ drawn: true }))).toBe('auto (railed)')
    expect(railDesc(edge({ required: true, drawn: true }))).toBe('auto (required)')
    expect(railDesc(edge({ state: 'on' }))).toBe('on')
    expect(railDesc(edge({ state: 'on', required: true }))).toBe('on (required)')
    expect(railDesc(edge({ state: 'off', required: true, dropFt: 4.24 }))).toBe('off — required, 4.2 ft up')
  })

  test('rows name the edge, its length and what opens it; covered edges say so', () => {
    const m = wingMass({ kind: 'deck', w: 12, d: 10 })
    expect(railRowText(m, edge({ names: ['Stair 2', 'Door'] }))).toBe('front 12 ft · not needed · opening at Stair 2, Door')
    expect(railRowText(m, edge({ i: 0, free: false }))).toBe('back · against the house')
    expect(railTarget(m, 3)).toBe('deck 3')
    expect(railTarget(wingMass({ kind: 'porch' }), 1)).toBe('porch 1')
  })

  test('chips cycle auto → on → off and say when a guard is required', () => {
    const m = wingMass({ kind: 'deck', w: 12, d: 10 })
    expect(['auto', 'on', 'off'].map((s) => railChipLabel(s as 'auto'))).toEqual(['rail auto', 'rail ✓', 'rail –'])
    expect(railChipTitle(m, edge({ required: true, dropFt: 3.44 }))).toBe('front edge · auto · guard required (3.4 ft up) — click: auto → on → off')
  })

  test('the inspector sums a wing up', () => {
    expect(railSummary([edge({ drawn: true }), edge({ required: true }), edge(), edge({ required: true })])).toBe('Rails on 1 of 4 edges · 2 required edges off')
  })
})

describe('stairSummary', () => {
  const info = (over: Partial<StairInfo>): StairInfo => ({ kind: 'stair', w: 1.5, run: 2, drop: 0.5, n: 3, rise: 6 * IN, tread: 11.5 * IN, ok: true, slope: 0, steep: false, ...over }) as StairInfo
  test('a stair gives its risers and treads and flags steep ones', () => {
    expect(stairSummary(info({}))).toEqual({ lines: ['3 risers of 6 in', 'Treads 11.5 in'], warn: null })
    expect(stairSummary(info({ ok: false, n: 1, rise: 8 * IN })).warn).toBe('Risers over 7 in or treads under 11 in')
  })
  test('a ramp gives its slope and flags one steeper than 1:12', () => {
    expect(stairSummary(info({ kind: 'ramp', slope: 1 / 10, steep: true, drop: 12 * IN }))).toEqual({ lines: ['Slope 1:10', 'Drop 12 in'], warn: 'Steeper than 1:12' })
  })
})

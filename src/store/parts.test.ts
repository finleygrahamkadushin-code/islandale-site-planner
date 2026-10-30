import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { localToSite } from '../buildings/footprint'
import { buildingMasses, massPoly, MAX_WINGS } from '../buildings/masses'
import type { EdgeDraw } from '../buildings/railEdits'
import { wingAt } from '../buildings/wingEdits'
import { MAIN_STAYS_TEXT, MAX_PARTS_TEXT } from './partActions'
import { pickedPartOf, usePlanStore } from './planStore'
import { setRailDrawResolver } from './railResolver'
import type { PlanObject } from './types'

const store = () => usePlanStore.getState()
const history = () => usePlanStore.temporal.getState()
const PROW = 'C-0' // main, Porch 1, Stair 2, Deck 3, Porch 4
const WEDGE = 'C-3' // main, Porch 1, Porch 2, Deck 3 (rail 'sides')
const POD = 'C-2' // a rect main mass turned -22°, with three wings
const params = (id: string) => store().plan.objects[id].params
const masses = (id: string) => buildingMasses(params(id))
/** A stand-in for the scene's rail rule: every edge free, drawn the same in both regimes. */
const sameDraws = (q: { id: string; mass: number }): EdgeDraw[] =>
  massPoly(buildingMasses(store().plan.objects[q.id].params)[q.mass]).map(() => ({ legacy: true, auto: true, free: true }))

describe('part actions', () => {
  beforeEach(() => {
    store().setReadOnly(null)
    store().loadScheme('C')
    store().lockAll(false)
    history().clear()
  })
  afterEach(() => setRailDrawResolver(null))

  /** Run an action, check it made one undo step, and that undo brings back the plan before it. */
  const oneStep = (act: () => void) => {
    const before = store().plan
    act()
    expect(store().plan).not.toBe(before)
    expect(history().pastStates).toHaveLength(1)
    history().undo()
    expect(store().plan).toBe(before)
    history().redo()
  }

  describe('every action is one undo step', () => {
    test('updateWing moves and sizes one wing and leaves the others alone', () => {
      const was = params(PROW).wings as unknown[]
      oneStep(() => store().updateWing(PROW, 3, { dx: 2, w: 40, rot: 370 }))
      expect(masses(PROW)[3]).toMatchObject({ kind: 'deck', dx: 2, w: 40, rot: 10 })
      const now = params(PROW).wings as unknown[]
      expect([0, 1, 3].map((i) => now[i])).toEqual([0, 1, 3].map((i) => was[i]))
    })

    test('a new width or depth scales the outline of a poly part: Deck 3 and the main walls of C-0', () => {
      const deck = wingAt(params(PROW), 3)
      expect(deck.shape).toBe('poly')
      const xs = () => massPoly(masses(PROW)[3]).map((p) => p[0])
      const span = () => Math.max(...xs()) - Math.min(...xs())
      const before = span()
      oneStep(() => store().updateWing(PROW, 3, { w: (deck.w as number) * 2 }))
      expect(span()).toBeCloseTo(before * 2, 1)
      history().clear()
      const main = params(PROW)
      expect(main.shape).toBe('poly')
      oneStep(() => store().resizeObject(PROW, { w: 60, d: main.d as number }))
      const mxs = massPoly(masses(PROW)[0]).map((p) => p[0])
      expect(Math.max(...mxs) - Math.min(...mxs)).toBeGreaterThan(55)
      expect(params(PROW).pts).not.toEqual(main.pts)
    })

    test('addWing appends a wing and returns its mass index', () => {
      let mi: number | null = null
      oneStep(() => {
        mi = store().addWing(PROW, { kind: 'ramp', open: true, w: 4, d: 12, rot: -90 })
      })
      expect(mi).toBe(5)
      expect(masses(PROW)[5].kind).toBe('ramp')
    })

    test('removeWing takes a wing out; later masses move down one', () => {
      oneStep(() => store().removeWing(PROW, 2))
      expect(masses(PROW).map((m) => m.kind)).toEqual(['wall', 'porch', 'deck', 'porch'])
    })

    test('setRail on one edge, and on all edges', () => {
      setRailDrawResolver(sameDraws)
      oneStep(() => store().setRail(WEDGE, 3, 0, 'off'))
      expect(wingAt(params(WEDGE), 3).rails).toMatchObject({ 0: false })
      history().clear()
      oneStep(() => store().setRail(WEDGE, 3, 'all', 'on'))
      expect(wingAt(params(WEDGE), 3)).toMatchObject({ rails: { 0: true, 1: true, 2: true, 3: true } })
      expect(wingAt(params(WEDGE), 3).rail).toBeUndefined()
    })

    test('setRailStyle stores the style per building; choosing the same style again is no step', () => {
      oneStep(() => store().setRailStyle(PROW, 'cable'))
      expect(params(PROW).ext).toEqual({ parts: { rail: { style: 'cable' } } })
      history().clear()
      store().setRailStyle(PROW, 'cable')
      expect(history().pastStates).toHaveLength(0)
    })
  })

  describe('locks', () => {
    const everyAction = () => {
      store().updateWing(PROW, 1, { dx: 3 })
      expect(store().addWing(PROW, { kind: 'deck', w: 4, d: 4 })).toBeNull()
      store().removeWing(PROW, 1)
      store().setRail(PROW, 3, 1, 'off')
      store().setRail(PROW, 3, 'all', 'on')
      store().setRailStyle(PROW, 'glass')
    }

    test('a locked building refuses every part action, with the locked toast', () => {
      store().setLocked(PROW, true)
      history().clear()
      const before = store().plan
      everyAction()
      expect(store().plan).toBe(before)
      expect(history().pastStates).toHaveLength(0)
      expect(store().toast?.text).toBe('Gathering prow is locked')
    })

    test('so does a locked buildings layer', () => {
      store().setLayer('buildings', { locked: true })
      const before = store().plan
      everyAction()
      expect(store().plan).toBe(before)
      expect(store().toast?.text).toMatch(/locked/)
    })

    test('and so does a read-only tab', () => {
      store().setReadOnly('other-tab')
      const before = store().plan
      everyAction()
      expect(store().plan).toBe(before)
      expect(store().toast?.text).toMatch(/another tab/)
      store().setReadOnly(null)
    })
  })

  describe('refusals', () => {
    test(`a cabin takes at most ${MAX_WINGS} wings`, () => {
      for (let i = masses(PROW).length - 1; i < MAX_WINGS; i++) store().addWing(PROW, { kind: 'deck', w: 4, d: 4, dx: i })
      expect(masses(PROW)).toHaveLength(MAX_WINGS + 1)
      const before = store().plan
      expect(store().addWing(PROW, { kind: 'deck', w: 4, d: 4 })).toBeNull()
      expect(store().plan).toBe(before)
      expect(store().toast?.text).toBe(MAX_PARTS_TEXT)
    })

    test('the main walls cannot be removed', () => {
      const before = store().plan
      store().removeWing(PROW, 0)
      expect(store().plan).toBe(before)
      expect(store().toast?.text).toBe(MAIN_STAYS_TEXT)
    })

    test('a mass that is not there is a programming error', () => {
      expect(() => store().updateWing(PROW, 9, { dx: 1 })).toThrow(/no mass 9/)
      expect(() => store().setRail(PROW, 0, 0, 'on')).toThrow(/is a wall; only decks and porches rail per edge/)
      // stair handrails come with the stair's style, not per edge
      const stair = buildingMasses(store().plan.objects[PROW].params).findIndex((m) => m.kind === 'stair')
      expect(stair).toBeGreaterThan(0)
      expect(() => store().setRail(PROW, stair, 0, 'off')).toThrow(/is a stair/)
    })
  })

  describe('the first per-edge write keeps what is drawn', () => {
    test('with the scene rule installed only the clicked edge changes', () => {
      // the wedge's deck under 'sides': legacy draws 0 and 2; say per-edge auto would draw only 0
      const draws = [
        { legacy: true, auto: true, free: true },
        { legacy: false, auto: false, free: true },
        { legacy: true, auto: false, free: true },
        { legacy: false, auto: false, free: false },
      ]
      let asked: { id: string; mass: number } | null = null
      setRailDrawResolver((q) => {
        asked = { id: q.id, mass: q.mass }
        return draws
      })
      store().setRail(WEDGE, 3, 1, 'on')
      expect(asked).toEqual({ id: WEDGE, mass: 3 })
      expect(wingAt(params(WEDGE), 3)).toMatchObject({ rails: { 1: true, 2: true } })
      expect(wingAt(params(WEDGE), 3).rail).toBeUndefined()
      // "all on" skips the edge another part covers
      store().setRail(WEDGE, 3, 'all', 'on')
      expect(wingAt(params(WEDGE), 3).rails).toEqual({ 0: true, 1: true, 2: true })
    })

    test('without it the write is refused, rather than freezing the old flag as the old planner does', () => {
      const before = store().plan
      expect(() => store().setRail(WEDGE, 3, 0, 'auto')).toThrow(/setRailDrawResolver/)
      expect(store().plan).toBe(before)
      setRailDrawResolver(() => [{ legacy: true, auto: true, free: true }]) // the wrong number of edges
      expect(() => store().setRail(WEDGE, 3, 0, 'on')).toThrow(/setRailDrawResolver/)
    })

    test('once a map exists one edge can be set without it, but "all" still needs it to skip covered edges', () => {
      setRailDrawResolver(sameDraws)
      store().setRail(WEDGE, 3, 0, 'off')
      setRailDrawResolver(null)
      store().setRail(WEDGE, 3, 1, 'on')
      expect(wingAt(params(WEDGE), 3).rails).toEqual({ 0: false, 1: true })
      expect(() => store().setRail(WEDGE, 3, 'all', 'on')).toThrow(/setRailDrawResolver/)
    })
  })

  test('a standalone deck keeps its rails on its own params, as mass 0', () => {
    const deck: PlanObject = {
      id: 'D-1',
      type: 'deck',
      name: 'Ring deck',
      position: { x: 0, n: 0 },
      rotation: 0,
      params: { w: 12, d: 12, h: 3, rail: true },
      locked: false,
      hidden: false,
      labelVisible: true,
    }
    const plan = store().plan
    store().replacePlan({ ...plan, objects: { ...plan.objects, [deck.id]: deck }, order: [...plan.order, deck.id] })
    history().clear()
    // the whole-deck rule rails every edge; per-edge auto would leave these low edges bare
    setRailDrawResolver(() => [0, 1, 2, 3].map(() => ({ legacy: true, auto: false, free: true })))
    oneStep(() => store().setRail(deck.id, 0, 2, 'off'))
    expect(params(deck.id)).toEqual({ w: 12, d: 12, h: 3, rails: { 0: true, 1: true, 2: false, 3: true } })
    expect(() => store().setRail(deck.id, 1, 0, 'on')).toThrow()
  })

  describe('resizeMainEdge', () => {
    const o = () => store().plan.objects[POD]
    const siteOf = (x: PlanObject, p: readonly [number, number]) => localToSite(x.position, x.rotation, p)

    test('one undo step that moves the cabin, sizes the main walls and keeps every wing on the ground', () => {
      const before = o()
      expect(before.params.shape ?? 'rect').toBe('rect')
      const w = Number(before.params.w)
      oneStep(() => store().resizeMainEdge(POD, 3, 3)) // the left edge 3 ft out
      const after = o()
      expect(after.params.w).toBeCloseTo(w + 3, 4)
      const right = (x: PlanObject) => siteOf(x, [Number(x.params.w) / 2, 0])
      right(after).forEach((v, i) => expect(v).toBeCloseTo(right(before)[i], 4))
      const was = buildingMasses(before.params)
      buildingMasses(after.params).slice(1).forEach((m, k) => {
        const i = k + 1
        siteOf(after, [m.dx, m.dz]).forEach((v, j) => expect(v).toBeCloseTo(siteOf(before, [was[i].dx, was[i].dz])[j], 3))
      })
    })

    test('a drag that changes nothing is no undo step', () => {
      const before = store().plan
      store().resizeMainEdge(POD, 0, 0)
      expect(store().plan).toBe(before)
      store().resizeMainEdge(POD, 0, -1000)
      history().clear()
      store().resizeMainEdge(POD, 0, -1)
      expect(history().pastStates).toHaveLength(0)
      expect(store().plan).not.toBe(before)
    })

    test('a locked cabin refuses it with the toast; a main mass that is not rect has no edges to drag', () => {
      store().setLocked(POD, true)
      history().clear()
      store().resizeMainEdge(POD, 1, 2)
      expect(history().pastStates).toHaveLength(0)
      expect(store().toast?.text).toBe(`${o().name} is locked`)
      store().setLocked(POD, false)
      store().setLayer('buildings', { locked: true })
      history().clear()
      store().resizeMainEdge(POD, 1, 2)
      expect(history().pastStates).toHaveLength(0)
      store().setLayer('buildings', { locked: false })
      expect(() => store().resizeMainEdge(PROW, 1, 2)).toThrow(/rect/)
    })
  })

  test('removing a wing shifts exterior paint keyed by mass index in the same step', () => {
    store().setObjectParams(PROW, { ext: { masses: { '1': { wall: 'a' }, '2': { rail: { style: 'steel' } }, '4': { wall: 'd' } } } })
    history().clear()
    store().removeWing(PROW, 2)
    expect(params(PROW).ext).toEqual({ masses: { '1': { wall: 'a' }, '3': { wall: 'd' } } })
    expect(history().pastStates).toHaveLength(1)
  })
})

describe('the picked part', () => {
  beforeEach(() => {
    store().setReadOnly(null)
    store().loadScheme('C')
    store().lockAll(false)
    store().select([])
    history().clear()
  })

  test('picking a part selects its building and is no undo step; a bad pick is ignored', () => {
    store().pickPart({ objectId: PROW, mass: 2 })
    expect(store().pickedPart).toEqual({ objectId: PROW, mass: 2 })
    expect(store().selection).toEqual([PROW])
    expect(history().pastStates).toHaveLength(0)
    store().pickPart({ objectId: PROW, mass: 9 })
    store().pickPart({ objectId: 'C-5', mass: 0 }) // a pad, not a building
    expect(store().pickedPart).toEqual({ objectId: PROW, mass: 2 })
    store().pickPart(null)
    expect(store().pickedPart).toBeNull()
    expect(store().selection).toEqual([PROW])
  })

  test('picking is allowed on a locked building', () => {
    store().setLocked(PROW, true)
    store().pickPart({ objectId: PROW, mass: 0 })
    expect(store().pickedPart).toEqual({ objectId: PROW, mass: 0 })
  })

  test.each([
    ['selecting something else', () => store().select([WEDGE])],
    ['selecting nothing', () => store().select([])],
    ['shift-selecting', () => store().toggleSelect(WEDGE)],
    ['loading a scheme', () => store().loadScheme('C2')],
    ['replacing the plan', () => store().replacePlan(store().plan)],
    ['opening a saved plan', () => store().hydrate({ plan: store().plan })],
    ['deleting its building', () => store().deleteObjects([PROW])],
    ['removing a wing of its building', () => store().removeWing(PROW, 4)],
  ])('%s drops it', (_name, act) => {
    store().pickPart({ objectId: PROW, mass: 3 })
    act()
    expect(store().pickedPart).toBeNull()
  })

  test('selecting its own building again keeps it, and so do edits elsewhere', () => {
    store().pickPart({ objectId: PROW, mass: 3 })
    store().select([PROW])
    store().removeWing(WEDGE, 1)
    store().updateWing(PROW, 3, { dx: 1 })
    expect(store().pickedPart).toEqual({ objectId: PROW, mass: 3 })
  })

  test('removing a wing also drops the opening focus on that building', () => {
    store().setOpeningFocus({ objectId: PROW, mass: 0, cutId: 1 })
    store().removeWing(PROW, 1)
    expect(store().openingFocus).toBeNull()
  })

  test('undo that takes the picked mass away drops the part', () => {
    const mi = store().addWing(PROW, { kind: 'deck', w: 6, d: 6, dz: 30 })!
    store().pickPart({ objectId: PROW, mass: mi })
    history().undo()
    expect(store().pickedPart).toBeNull()
    expect(pickedPartOf(store())).toBeNull()
    history().redo()
    store().pickPart({ objectId: PROW, mass: 1 })
    history().undo() // the mass is still there, so the part stays
    expect(pickedPartOf(store())).toEqual({ objectId: PROW, mass: 1 })
  })
})

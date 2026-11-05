import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { usePlanStore } from '../store/planStore'
import { DEFAULT_MODE, MODE_KEY, savedMode, useGuideMode } from './mode'
import { GLOSSARY, GLOSSARY_TERMS } from './glossary'
import { requestDelete, useConfirm } from './confirm'
import { startTourIfNew, TOUR_KEY, TOUR_STEPS, tourSeen, useTour } from './tour'
import { fakeStorage } from './testStorage'

const store = () => usePlanStore.getState()
const history = () => usePlanStore.temporal.getState()
const firstCabin = () => store().plan.order.find((id) => store().plan.objects[id].type === 'house')!

beforeEach(() => {
  vi.stubGlobal('localStorage', fakeStorage())
  store().loadScheme('C')
  history().clear()
  useConfirm.setState({ ask: null, onYes: null })
  useTour.setState({ step: null })
})
afterEach(() => vi.unstubAllGlobals())

describe('Beginner / Advanced mode (4C)', () => {
  test('Beginner is the default for a browser that has never chosen', () => {
    expect(DEFAULT_MODE).toBe('beginner')
    expect(savedMode()).toBe('beginner')
  })

  test('the choice is remembered and is never an undo step', () => {
    const before = history().pastStates.length
    useGuideMode.getState().setMode('advanced')
    expect(localStorage.getItem(MODE_KEY)).toBe('advanced')
    expect(savedMode()).toBe('advanced')
    expect(history().pastStates.length).toBe(before)
    useGuideMode.getState().setMode('beginner')
    expect(savedMode()).toBe('beginner')
  })

  test('a stored value that is not a mode falls back to Beginner', () => {
    localStorage.setItem(MODE_KEY, 'expert')
    expect(savedMode()).toBe('beginner')
  })

  test('switching modes keeps every hidden value in the plan', () => {
    const id = firstCabin()
    const params = structuredClone(store().plan.objects[id].params)
    useGuideMode.getState().setMode('beginner')
    useGuideMode.getState().setMode('advanced')
    expect(store().plan.objects[id].params).toEqual(params)
  })
})

describe('glossary (4C)', () => {
  test('every term the plan names has a one-line definition', () => {
    for (const t of ['setback', 'ohwm', 'navd88', 'pitch', 'overhang', 'contour', 'berm', 'coverage', 'accessible-route'] as const) {
      expect(GLOSSARY[t].length).toBeGreaterThan(20)
    }
    for (const t of GLOSSARY_TERMS) {
      expect(GLOSSARY[t]).not.toContain('\n')
      expect(GLOSSARY[t].endsWith('.')).toBe(true)
    }
  })
})

describe('delete confirmation (4C)', () => {
  test('in Beginner it asks first, and Cancel keeps the object', () => {
    useGuideMode.getState().setMode('beginner')
    const id = firstCabin()
    const name = store().plan.objects[id].name
    requestDelete([id])
    expect(useConfirm.getState().ask?.title).toBe(`Delete the ${name}?`)
    expect(useConfirm.getState().ask?.body).toBe('You can undo this.')
    expect(store().plan.objects[id]).toBeDefined()
    useConfirm.getState().answer(false)
    expect(store().plan.objects[id]).toBeDefined()
    expect(useConfirm.getState().ask).toBeNull()
  })

  test('in Beginner, Delete in the dialog deletes as one undo step', () => {
    useGuideMode.getState().setMode('beginner')
    const id = firstCabin()
    requestDelete([id])
    useConfirm.getState().answer(true)
    expect(store().plan.objects[id]).toBeUndefined()
    expect(history().pastStates.length).toBe(1)
    history().undo()
    expect(store().plan.objects[id]).toBeDefined()
  })

  test('several objects are named by count', () => {
    useGuideMode.getState().setMode('beginner')
    const ids = store().plan.order.slice(0, 3)
    requestDelete(ids)
    expect(useConfirm.getState().ask?.title).toBe('Delete 3 objects?')
  })

  test('in Advanced it deletes at once and undo brings it back', () => {
    useGuideMode.getState().setMode('advanced')
    const id = firstCabin()
    requestDelete([id])
    expect(useConfirm.getState().ask).toBeNull()
    expect(store().plan.objects[id]).toBeUndefined()
    history().undo()
    expect(store().plan.objects[id]).toBeDefined()
  })

  test('nothing selected asks nothing', () => {
    requestDelete([])
    expect(useConfirm.getState().ask).toBeNull()
  })
})

describe('first-run tour (4C)', () => {
  test('five steps: orbit, select, move, lock, save', () => {
    expect(TOUR_STEPS.map((s) => s.id)).toEqual(['orbit', 'select', 'move', 'lock', 'save'])
  })

  test('it starts once for a new browser, and finishing is remembered', () => {
    expect(startTourIfNew()).toBe(true)
    expect(useTour.getState().step).toBe(0)
    for (let i = 0; i < TOUR_STEPS.length; i++) useTour.getState().next()
    expect(useTour.getState().step).toBeNull()
    expect(localStorage.getItem(TOUR_KEY)).toBe('done')
    expect(tourSeen()).toBe(true)
    expect(startTourIfNew()).toBe(false)
  })

  test('Skip ends it and is remembered; Back stops at the first step', () => {
    startTourIfNew()
    useTour.getState().back()
    expect(useTour.getState().step).toBe(0)
    useTour.getState().next()
    useTour.getState().back()
    expect(useTour.getState().step).toBe(0)
    useTour.getState().end()
    expect(useTour.getState().step).toBeNull()
    expect(startTourIfNew()).toBe(false)
  })

  test('Help replays it after it was seen', () => {
    localStorage.setItem(TOUR_KEY, 'done')
    useTour.getState().start()
    expect(useTour.getState().step).toBe(0)
  })

  test('the tour never changes the plan', () => {
    const plan = store().plan
    startTourIfNew()
    for (let i = 0; i < TOUR_STEPS.length; i++) useTour.getState().next()
    expect(store().plan).toBe(plan)
    expect(history().pastStates.length).toBe(0)
  })
})

import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { usePlanStore } from '../store/planStore'
import { useAddMode } from '../tools/addMode'
import { useIsolate } from '../tools/isolate'
import { useFocusRequest } from '../scene/cameraFocus'
import { useAnnounce } from '../ui/announce'
import { objectCommands } from './commands'
import { useOverlay } from './Overlays'

/** R10.1: command search's "Select …" entries, one per object that is shown. */
const store = () => usePlanStore.getState()
const said = () => useAnnounce.getState().text
const entry = (id: string) => {
  const c = objectCommands(store()).find((x) => x.id === `select-${id}`)
  expect(c, id).toBeDefined()
  return c!
}

describe('Select entries (R10.1)', () => {
  beforeEach(() => {
    store().loadScheme('C')
    store().lockAll(false)
    store().showAll()
    store().select([])
    useIsolate.getState().leave()
  })
  afterEach(() => {
    useAddMode.getState().setOn(false)
    useIsolate.getState().leave()
  })

  test('one entry per shown object, in the Objects group, named "Select <name>"', () => {
    const cmds = objectCommands(store())
    expect(cmds.length).toBe(store().plan.order.length)
    expect(new Set(cmds.map((c) => c.group))).toEqual(new Set(['Objects']))
    expect(entry('C-0').label).toBe(`Select ${store().plan.objects['C-0'].name}`)
  })

  test('same-named objects are told apart by kind and position, as the inspector writes it', () => {
    const cmds = objectCommands(store())
    const byLabel = new Map<string, string[]>()
    for (const c of cmds) byLabel.set(c.label, [...(byLabel.get(c.label) ?? []), c.detail ?? ''])
    const repeated = [...byLabel.values()].filter((d) => d.length > 1)
    expect(repeated.length, 'scheme C has same-named objects').toBeGreaterThan(0)
    for (const details of repeated) expect(new Set(details).size).toBe(details.length)
    expect(entry('C-0').detail).toMatch(/^building · East -?\d/)
    expect(entry('C-0').detail).toMatch(/, North -?\d/)
  })

  test('hidden objects, and those outside an isolation, have no entry', () => {
    store().setHidden('C-0', true)
    expect(objectCommands(store()).some((c) => c.id === 'select-C-0')).toBe(false)
    store().setHidden('C-0', false)
    useIsolate.getState().enter(store().plan, 'C-3')
    expect(objectCommands(store()).map((c) => c.id)).toContain('select-C-3')
    expect(objectCommands(store()).map((c) => c.id)).not.toContain('select-C-0')
  })

  test('running one selects it, flies to it, says what was selected and sends focus to the view', () => {
    const n = useFocusRequest.getState().request?.n ?? 0
    entry('C-0').run()
    expect(store().selection).toEqual(['C-0'])
    expect(useFocusRequest.getState().request).toEqual({ id: 'C-0', n: n + 1 })
    expect(said()).toBe(`Selected ${store().plan.objects['C-0'].name}`)
    expect(entry('C-0').focusView).toBe(true)
    entry('C-3').run()
    expect(store().selection).toEqual(['C-3'])
  })

  test('with Add to selection on, an entry adds, and a selected one is taken out', () => {
    entry('C-0').run()
    useAddMode.getState().setOn(true)
    entry('C-3').run()
    expect(store().selection).toEqual(['C-0', 'C-3'])
    expect(said()).toMatch(/^Added .*: 2 selected$/)
    entry('C-0').run()
    expect(store().selection).toEqual(['C-3'])
    expect(said()).toMatch(/^Removed .*: 1 selected$/)
  })

  test('the view-focus request is kept for when command search closes', () => {
    useOverlay.getState().focusViewOnClose()
    expect(useOverlay.getState().afterClose).toBe('view')
  })
})

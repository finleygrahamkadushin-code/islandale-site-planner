import { beforeEach, describe, expect, test } from 'vitest'
import { usePlanStore } from '../store/planStore'
import { toolOf } from '../store/toolActions'
import { DEFAULT_TAB, TAB_IDS, TAB_LIBRARY_GROUPS, TAB_TOOLS, useTaskTab } from './tabs'

const store = () => usePlanStore.getState()
const history = () => usePlanStore.temporal.getState()

describe('task tabs (4B)', () => {
  beforeEach(() => {
    store().loadScheme('C')
    store().setTool('select')
    useTaskTab.getState().setTab(DEFAULT_TAB)
    history().clear()
  })

  test('four tabs, Build first for a new browser', () => {
    expect(TAB_IDS).toEqual(['site', 'build', 'interior', 'present'])
    expect(DEFAULT_TAB).toBe('build')
  })

  test('each tab has its own tools and library groups', () => {
    expect(TAB_TOOLS.site).toEqual(['select', 'place', 'measure'])
    expect(TAB_TOOLS.build).toEqual(['select', 'place', 'paint', 'connect', 'measure'])
    expect(TAB_TOOLS.interior).toEqual(['select'])
    expect(TAB_TOOLS.present).toEqual([])
    expect(TAB_LIBRARY_GROUPS.site).toEqual(['site', 'trees', 'paths'])
    expect(TAB_LIBRARY_GROUPS.build).toEqual(['buildings', 'paths'])
    expect(TAB_LIBRARY_GROUPS.interior).toEqual([])
  })

  test('switching tabs ends a tool the new tab does not have, and keeps one it does', () => {
    store().setTool('paint')
    useTaskTab.getState().setTab('site')
    expect(toolOf(store())).toBe('select')
    store().setTool('place', 'red-alder')
    useTaskTab.getState().setTab('build')
    expect(toolOf(store())).toBe('place')
  })

  test('switching tabs keeps the selection and is never an undo step', () => {
    const id = store().plan.order[0]
    store().select([id])
    for (const tab of TAB_IDS) useTaskTab.getState().setTab(tab)
    expect(store().selection).toEqual([id])
    expect(history().pastStates).toHaveLength(0)
  })
})

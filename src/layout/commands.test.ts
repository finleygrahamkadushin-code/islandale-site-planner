import { beforeEach, describe, expect, test } from 'vitest'
import { usePlanStore } from '../store/planStore'
import { toolOf } from '../store/toolActions'
import { commandsFor } from './commands'
import { useTaskTab } from './tabs'

const store = () => usePlanStore.getState()
const run = (label: string) => {
  const c = commandsFor(store()).find((x) => x.label === label)
  expect(c, label).toBeDefined()
  c!.run()
}

describe('command search (4B)', () => {
  beforeEach(() => {
    store().loadScheme('C')
    store().lockAll(false)
    store().setTool('select')
    useTaskTab.getState().setTab('build')
  })

  test('every command has a unique id and label, and none throws when run', () => {
    const cmds = commandsFor(store())
    expect(new Set(cmds.map((c) => c.id)).size).toBe(cmds.length)
    expect(new Set(cmds.map((c) => c.label)).size).toBe(cmds.length)
    for (const c of cmds) expect(() => c.run(), c.label).not.toThrow()
  })

  test('"Lock all" locks every layer', () => {
    run('Lock all')
    expect(Object.values(store().layers).every((l) => l.locked)).toBe(true)
  })

  test('"Golden hour" flies to that saved view', () => {
    run('Golden hour')
    expect(store().viewRequest?.id).toBe('sunset')
  })

  test('"Place Guest cabin" starts placing it, switching to a tab that has it', () => {
    useTaskTab.getState().setTab('site')
    run('Place Guest cabin')
    expect(useTaskTab.getState().tab).toBe('build')
    expect(toolOf(store())).toBe('place')
    expect(store().placing?.item).toBe('guest-cabin')
  })

  test('"White model" changes the display style, and its key is listed', () => {
    const c = commandsFor(store()).find((x) => x.label === 'White model')
    expect(c?.keys).toBe('2')
    c!.run()
    expect(store().displayStyle).toBe('white')
  })

  test('settings of the selected cabin open their heading in the inspector', () => {
    expect(commandsFor(store()).some((c) => c.label === 'Roof pitch')).toBe(false)
    store().select([store().plan.order.find((id) => store().plan.objects[id].type === 'house')!])
    expect(commandsFor(store()).some((c) => c.label === 'Roof pitch')).toBe(true)
  })
})

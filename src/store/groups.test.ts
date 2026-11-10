import { beforeEach, describe, expect, test } from 'vitest'
import { usePlanStore } from './planStore'
import { parsePlanFile, serializePlan } from './persistence'
import { expandToGroups, pickedIds } from '../tools/groups'
import { isolationAlive, isolationFor, isOutside } from '../tools/isolate'

const store = () => usePlanStore.getState()
const history = () => usePlanStore.temporal.getState()
const steps = () => history().pastStates.length
const obj = (id: string) => store().plan.objects[id]
const ids = () => store().plan.order

function freshScheme() {
  store().setReadOnly(null)
  store().loadScheme('C')
  store().lockAll(false)
  store().showAll()
  for (const id of ids()) if (obj(id).locked) store().setLocked(id, false)
  history().clear()
}

describe('groups', () => {
  beforeEach(freshScheme)

  test('grouping is one undo step and gives every object one fresh group id', () => {
    const [a, b, c] = ids()
    const group = store().groupObjects([a, b, c])
    expect(group).toBe('group-1')
    expect([a, b, c].map((id) => obj(id).group)).toEqual(['group-1', 'group-1', 'group-1'])
    expect(store().selection).toEqual([a, b, c])
    expect(steps()).toBe(1)
    history().undo()
    expect([a, b, c].map((id) => obj(id).group)).toEqual([undefined, undefined, undefined])
  })

  test('grouping objects already in groups merges them into one new group (groups do not nest)', () => {
    const [a, b, c, d] = ids()
    store().groupObjects([a, b])
    store().groupObjects([c, d])
    expect(store().groupObjects([a, c])).toBe('group-3')
    expect([a, b, c, d].map((id) => obj(id).group)).toEqual(['group-3', 'group-3', 'group-3', 'group-3'])
  })

  test('needs two objects, and is refused whole when one is locked or the tab is read-only', () => {
    const [a, b] = ids()
    expect(store().groupObjects([a])).toBeNull()
    store().setLocked(b, true)
    history().clear()
    expect(store().groupObjects([a, b])).toBeNull()
    expect(obj(a).group).toBeUndefined()
    expect(steps()).toBe(0)
    store().setLocked(b, false)
    store().setReadOnly('other-tab')
    expect(store().groupObjects([a, b])).toBeNull()
    expect(obj(a).group).toBeUndefined()
  })

  test('ungrouping takes the whole group apart as one undo step, refused when a member is locked', () => {
    const [a, b, c] = ids()
    store().groupObjects([a, b, c])
    store().setLocked(c, true)
    history().clear()
    store().ungroupObjects([a])
    expect(obj(a).group).toBe('group-1')
    expect(steps()).toBe(0)
    store().setLocked(c, false)
    history().clear()
    store().ungroupObjects([a])
    expect([a, b, c].map((id) => 'group' in obj(id))).toEqual([false, false, false])
    expect(steps()).toBe(1)
  })

  test('a group copied whole gets a new group; a copy of one member stays in its group', () => {
    const [a, b] = ids()
    store().groupObjects([a, b])
    const copies = store().duplicateObjects([a, b])
    expect(copies.map((id) => obj(id).group)).toEqual(['group-2', 'group-2'])
    const [single] = store().duplicateObjects([a])
    expect(obj(single).group).toBe('group-1')
  })

  test('a click or box picks whole groups, except members of the group open in isolation', () => {
    const [a, b, c] = ids()
    store().groupObjects([a, b])
    const plan = store().plan
    expect(pickedIds(plan, [b], null)).toEqual([a, b])
    expect(pickedIds(plan, [b, c], null)).toEqual([a, b, c])
    expect(pickedIds(plan, [b], 'group-1')).toEqual([b])
    expect(expandToGroups(plan, [c])).toEqual([c])
  })

  test('the group is saved and loaded with the plan', () => {
    const [a, b, c] = ids()
    store().groupObjects([a, b])
    const back = parsePlanFile(serializePlan(store().plan, { labelMode: 'all', layers: store().layers }))
    expect(back.plan.objects[a].group).toBe('group-1')
    expect('group' in back.plan.objects[c]).toBe(false)
  })
})

describe('isolation', () => {
  beforeEach(freshScheme)

  test('a double-click on an ungrouped object isolates it alone; everything else is outside', () => {
    const [a, b] = ids()
    const iso = isolationFor(store().plan, a, null)!
    expect(iso.focus).toEqual([a])
    expect(iso.group).toBeNull()
    expect(iso.name).toBe(obj(a).name)
    expect(isOutside(iso, a)).toBe(false)
    expect(isOutside(iso, b)).toBe(true)
    expect(isOutside(null, b)).toBe(false)
  })

  test('a double-click on a group member opens the group; another on a member narrows to it', () => {
    const [a, b, c] = ids()
    store().groupObjects([a, b])
    const plan = store().plan
    const open = isolationFor(plan, b, null)!
    expect(open).toMatchObject({ focus: [a, b], group: 'group-1', name: 'Group of 2' })
    expect(isOutside(open, c)).toBe(true)
    const narrowed = isolationFor(plan, a, open)!
    expect(narrowed).toMatchObject({ focus: [a], group: null })
    expect(isOutside(narrowed, b)).toBe(true)
    expect(isolationFor(plan, a, narrowed)).toBe(narrowed)
  })

  test('objects made while isolated stay in reach, and it ends when what was isolated is gone', () => {
    const [a] = ids()
    const iso = isolationFor(store().plan, a, null)!
    const [copy] = store().duplicateObjects([a])
    expect(isOutside(iso, copy)).toBe(false)
    expect(isolationAlive(iso, store().plan)).toBe(true)
    store().deleteObjects([a])
    expect(isolationAlive(iso, store().plan)).toBe(false)
    store().loadScheme('A')
    expect(isolationAlive(isolationFor(usePlanStore.getState().plan, ids()[0], null)!, store().plan)).toBe(true)
  })

  test('isolating is view state: no undo step', () => {
    isolationFor(store().plan, ids()[0], null)
    expect(steps()).toBe(0)
  })
})

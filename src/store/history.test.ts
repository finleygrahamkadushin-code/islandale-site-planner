import { describe, expect, test } from 'vitest'
import { HISTORY_LIMIT, addToHistory, describeChange, readHistory, type HistoryEntry } from './history'
import { usePlanStore } from './planStore'

const at = (min: number, label = `edit ${min}`): HistoryEntry => ({
  savedAt: new Date(Date.UTC(2026, 9, 27, 10, min)).toISOString(),
  label,
  text: `plan ${min}`,
})

describe('save history', () => {
  test('25 saves a minute apart keep the newest 20, newest first', () => {
    let entries: readonly HistoryEntry[] = []
    for (let m = 0; m < 25; m++) entries = addToHistory(entries, at(m))
    expect(entries).toHaveLength(HISTORY_LIMIT)
    expect(entries[0].text).toBe('plan 24')
    expect(entries.at(-1)?.text).toBe('plan 5')
  })

  test('saves less than a minute apart share one entry holding the latest plan', () => {
    const first = at(0, 'moved Studio')
    const second = { ...first, savedAt: new Date(Date.parse(first.savedAt) + 20_000).toISOString(), label: 'rotated Studio', text: 'later' }
    const entries = addToHistory(addToHistory([], first), second)
    expect(entries).toHaveLength(1)
    expect(entries[0]).toEqual({ savedAt: first.savedAt, label: 'several changes', text: 'later' })
  })

  test('the entry made on opening is never merged into, so it can be restored', () => {
    const opened = addToHistory([], at(0, 'opened'), true)
    const edited = addToHistory(opened, { ...at(0, 'moved Studio'), text: 'edited' })
    expect(edited.map((e) => e.label)).toEqual(['moved Studio', 'opened'])
    expect(edited[1].text).toBe('plan 0')
  })

  test('opening twice with no edits in between keeps one opened entry', () => {
    const once = addToHistory([at(0, 'moved Studio')], at(5, 'opened'), true)
    const twice = addToHistory(once, at(9, 'opened'), true)
    expect(twice.map((e) => e.label)).toEqual(['opened', 'moved Studio'])
    expect(twice[0].text).toBe('plan 9')
  })

  test('describes what changed between two plans', () => {
    const s = usePlanStore.getState()
    s.loadScheme('C')
    const before = usePlanStore.getState().plan
    const id = before.order[0]
    const name = before.objects[id].name
    s.moveObject(id, { x: 1, n: 2 })
    expect(describeChange(before, usePlanStore.getState().plan)).toBe(`moved ${name}`)
    s.setLocked(before.order[1], true)
    expect(describeChange(before, usePlanStore.getState().plan)).toBe('changed 2 objects')
    s.loadScheme('C2')
    expect(describeChange(before, usePlanStore.getState().plan)).toBe('loaded Scheme C2')
    expect(describeChange(null, before)).toBe('opened')
  })

  test('drops malformed stored entries', () => {
    expect(readHistory([at(1), { savedAt: 3 }, null, 'x'])).toEqual([at(1)])
    expect(readHistory('nope')).toEqual([])
  })
})
